import { Hono } from "hono";
import { z } from "zod";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";

const chat = new Hono();

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function buildHotelContext(): Promise<string> {
  const db = getServerDb();
  const today = todayIso();

  const [roomsRes, typesRes, arrivalsRes, departuresRes, inhouseRes] = await Promise.all([
    db.from("rooms").select("status").eq("is_active", true),
    db.from("room_types").select("code, name, max_guests").eq("is_active", true),
    db
      .from("reservations")
      .select("confirmation_code, check_in, room_types(code), guests(name)")
      .eq("check_in", today)
      .in("status", ["confirmed", "checked_in"]),
    db
      .from("reservations")
      .select("confirmation_code, room_types(code), guests(name)")
      .eq("check_out", today)
      .in("status", ["checked_in", "checked_out"]),
    db.from("reservations").select("id", { count: "exact", head: true }).eq("status", "checked_in"),
  ]);

  const rooms = roomsRes.data ?? [];
  const statusCounts: Record<string, number> = {};
  for (const r of rooms as Array<{ status: string }>) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }
  const total = rooms.length;
  const occupied = statusCounts["occupied"] ?? 0;
  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const types = (typesRes.data ?? []) as Array<{ code: string; name: string; max_guests: number }>;
  const typesText = types.map((t) => `- ${t.code} (${t.name}, max ${t.max_guests} khách)`).join("\n");

  const arrivals = (arrivalsRes.data ?? []) as unknown as Array<{
    confirmation_code: string;
    guests: { name: string } | null;
    room_types: { code: string } | null;
  }>;
  const departures = (departuresRes.data ?? []) as unknown as Array<{
    confirmation_code: string;
    guests: { name: string } | null;
    room_types: { code: string } | null;
  }>;

  return `Bạn là trợ lý AI cho hệ thống Hotel CRM. Trả lời ngắn gọn, lịch sự, bằng tiếng Việt.

Dữ liệu thời gian thực (ngày ${today}):
- Tổng số phòng đang hoạt động: ${total}
- Đang sử dụng (occupied): ${occupied} (${occupancyPct}%)
- Trạng thái phòng: ${JSON.stringify(statusCounts)}
- Khách đang lưu trú (in-house): ${inhouseRes.count ?? 0}
- Số lượt nhận phòng hôm nay: ${arrivals.length}
- Số lượt trả phòng hôm nay: ${departures.length}

Loại phòng:
${typesText || "(chưa có)"}

Nhận phòng hôm nay:
${arrivals.map((a) => `- ${a.confirmation_code} · ${a.guests?.name ?? "?"} · ${a.room_types?.code ?? "?"}`).join("\n") || "(không có)"}

Trả phòng hôm nay:
${departures.map((d) => `- ${d.confirmation_code} · ${d.guests?.name ?? "?"} · ${d.room_types?.code ?? "?"}`).join("\n") || "(không có)"}

Khi người dùng hỏi về số liệu vận hành, dựa hoàn toàn vào dữ liệu trên. Nếu họ hỏi việc cần thao tác (đặt phòng, nhận/trả phòng), hướng dẫn họ vào trang tương ứng trên CRM.`;
}

chat.post("/", async (c) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return c.json(
      { success: false, error: "GOOGLE_GENERATIVE_AI_API_KEY not configured on server" },
      503,
    );
  }

  const parsed = await parseBody(c, chatRequestSchema);
  if (!parsed.ok) return parsed.response;

  const system = await buildHotelContext();

  // Map sang định dạng Gemini: role "assistant" → "model", text vào parts[]
  const contents = parsed.data.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return c.json({ success: false, error: `Upstream error: ${errText.slice(0, 300)}` }, 502);
  }

  const payload = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const candidate = payload.candidates?.[0];
  const reply = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();

  return c.json({
    success: true,
    data: { reply, stop_reason: candidate?.finishReason ?? null },
  });
});

export default chat;
