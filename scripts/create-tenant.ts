#!/usr/bin/env bun
// Tạo một cơ sở (tenant) mới qua HTTP API: property + tài khoản admin của chủ
// khách sạn + (tùy chọn) API key cho trợ lý AI. Chạy được với mọi môi trường.
//
// Cách dùng:
//   BASE_URL=https://hotel-crm.example \
//   ROOT_EMAIL=admin@example.local ROOT_PASSWORD=... \
//   TENANT_NAME="Khách sạn Mẫu" TENANT_CODE=SAMPLE \
//   TENANT_EMAIL=owner@example.com TENANT_PASSWORD=... \
//   bun run scripts/create-tenant.ts
//
// Script không in mật khẩu ra màn hình; API key chỉ in đúng một lần vì
// máy chủ cũng chỉ trả về một lần.

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT_EMAIL = process.env.ROOT_EMAIL ?? "";
const ROOT_PASSWORD = process.env.ROOT_PASSWORD ?? "";
const TENANT_NAME = process.env.TENANT_NAME ?? "";
const TENANT_CODE = (process.env.TENANT_CODE ?? "").toUpperCase();
const TENANT_EMAIL = process.env.TENANT_EMAIL ?? "";
const TENANT_PASSWORD = process.env.TENANT_PASSWORD ?? "";
const TENANT_STAFF_NAME = process.env.TENANT_STAFF_NAME ?? "Chủ khách sạn";
const ADDRESS = process.env.TENANT_ADDRESS ?? "";
const PHONE = process.env.TENANT_PHONE ?? "";
const VAT_RATE = Number(process.env.VAT_RATE ?? 0);
const DEPOSIT_PCT = Number(process.env.DEPOSIT_PCT ?? 30);
const ROOM_TYPES_JSON = process.env.ROOM_TYPES ?? "";
const CREATE_AI_KEY = process.env.CREATE_AI_KEY !== "false";
const AI_KEY_NAME = process.env.AI_KEY_NAME ?? "Trợ lý AI";

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Một loại phòng cần khởi tạo, khai báo qua ROOM_TYPES (JSON).
 * `rooms` là danh sách SỐ PHÒNG thực tế — không có phòng thì tồn phòng luôn bằng 0.
 *
 * ROOM_TYPES='[{"code":"CB200","name":"Phòng cơ bản 200","overnight_rate":200000,
 *               "max_guests":2,"rooms":["101","102"]}]'
 */
interface RoomTypeSpec {
  code: string;
  name: string;
  overnight_rate: number;
  max_guests?: number;
  weekend_surcharge_pct?: number;
  rooms?: string[];
}

function parseRoomTypes(): RoomTypeSpec[] {
  if (!ROOM_TYPES_JSON.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(ROOM_TYPES_JSON);
  } catch {
    throw new Error("ROOM_TYPES không phải JSON hợp lệ");
  }
  if (!Array.isArray(raw)) throw new Error("ROOM_TYPES phải là một mảng");
  return raw.map((item, i) => {
    const spec = item as Partial<RoomTypeSpec>;
    if (!spec.code || !spec.name || typeof spec.overnight_rate !== "number") {
      throw new Error(`ROOM_TYPES[${i}] cần code, name và overnight_rate`);
    }
    return {
      code: spec.code.toUpperCase(),
      name: spec.name,
      overnight_rate: spec.overnight_rate,
      max_guests: spec.max_guests ?? 2,
      weekend_surcharge_pct: spec.weekend_surcharge_pct ?? 0,
      rooms: spec.rooms ?? [],
    };
  });
}

/** Tạo loại phòng + bảng giá đêm + các phòng thực tế, bằng token của chủ cơ sở. */
async function seedRoomTypes(token: string, specs: RoomTypeSpec[]): Promise<void> {
  for (const [index, spec] of specs.entries()) {
    const { data: type } = await call<{ id: string }>("POST", "/api/rooms/types", token, {
      name: spec.name,
      code: spec.code,
      max_guests: spec.max_guests,
      sort_order: (index + 1) * 10,
    });
    await call("POST", "/api/rate-plans", token, {
      room_type_id: type.id,
      booking_type: "overnight",
      name: `Giá đêm ${spec.name}`,
      overnight_rate: spec.overnight_rate,
      weekend_surcharge_pct: spec.weekend_surcharge_pct,
    });
    for (const number of spec.rooms ?? []) {
      await call("POST", "/api/rooms", token, {
        room_type_id: type.id,
        number,
        floor: Number(String(number).slice(0, -2)) || 1,
      });
    }
    const roomCount = spec.rooms?.length ?? 0;
    console.log(
      `✓ loại phòng ${spec.code} — ${spec.overnight_rate.toLocaleString("vi-VN")}đ/đêm, ${roomCount} phòng`,
    );
    if (roomCount === 0) {
      console.log(`  ⚠ ${spec.code} chưa có phòng nào → API sẽ luôn báo hết phòng`);
    }
  }
}

async function call<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Envelope<T>> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!payload.success) {
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${payload.error ?? "lỗi không rõ"}`);
  }
  return payload;
}

function requireEnv(): void {
  const missing = Object.entries({
    ROOT_EMAIL,
    ROOT_PASSWORD,
    TENANT_NAME,
    TENANT_CODE,
    TENANT_EMAIL,
    TENANT_PASSWORD,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);
  }
  if (TENANT_PASSWORD.length < 8) {
    throw new Error("TENANT_PASSWORD tối thiểu 8 ký tự");
  }
}

async function main(): Promise<void> {
  requireEnv();
  parseRoomTypes(); // fail sớm nếu JSON sai, trước khi tạo bất cứ thứ gì

  const { data: session } = await call<{ token: string }>("POST", "/api/auth/login", undefined, {
    email: ROOT_EMAIL,
    password: ROOT_PASSWORD,
  });
  const root = session.token;
  console.log(`✓ đăng nhập root tại ${BASE}`);

  const { data: existing } = await call<Array<{ id: string; code: string; name: string }>>(
    "GET",
    "/api/properties",
    root,
  );
  const duplicate = existing.find((p) => p.code === TENANT_CODE);
  if (duplicate) {
    throw new Error(`Mã cơ sở ${TENANT_CODE} đã tồn tại ("${duplicate.name}") — đổi TENANT_CODE.`);
  }

  const { data: property } = await call<{ id: string; name: string; code: string }>(
    "POST",
    "/api/properties",
    root,
    {
      name: TENANT_NAME,
      code: TENANT_CODE,
      ...(ADDRESS ? { address: ADDRESS } : {}),
      ...(PHONE ? { phone: PHONE } : {}),
      vat_rate: VAT_RATE,
      deposit_pct: DEPOSIT_PCT,
    },
  );
  console.log(`✓ cơ sở ${property.name} (${property.code}) — id ${property.id}`);

  await call("POST", "/api/auth/staff", root, {
    name: TENANT_STAFF_NAME,
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    role: "admin",
    property_id: property.id,
  });
  console.log(`✓ tài khoản quản trị ${TENANT_EMAIL} (role admin)`);

  const { data: tenantSession } = await call<{ token: string }>(
    "POST",
    "/api/auth/login",
    undefined,
    { email: TENANT_EMAIL, password: TENANT_PASSWORD },
  );

  const roomTypes = parseRoomTypes();
  if (roomTypes.length > 0) {
    await seedRoomTypes(tenantSession.token, roomTypes);
  }

  if (!CREATE_AI_KEY) {
    console.log("\nHoàn tất. Bỏ qua bước tạo API key (CREATE_AI_KEY=false).");
    return;
  }
  const { data: apiKey } = await call<{ key: string; key_prefix: string }>(
    "POST",
    "/api/ai-integrations",
    tenantSession.token,
    { name: AI_KEY_NAME, scopes: ["read", "book"] },
  );

  console.log(`✓ API key AI "${AI_KEY_NAME}" (${apiKey.key_prefix}…)`);
  console.log("\n─────────────────────────────────────────────");
  console.log("API KEY (chỉ hiện MỘT LẦN, lưu ngay vào cấu hình bot):");
  console.log(apiKey.key);
  console.log("─────────────────────────────────────────────");
  console.log(`\nThử ngay:\n  curl -H "X-API-Key: <key ở trên>" ${BASE}/api/ai/hotel`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
