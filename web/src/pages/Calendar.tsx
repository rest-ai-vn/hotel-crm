import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch } from "../lib/api";
import { todayIso } from "../lib/format";
import type { Reservation, Room } from "../lib/types";

const DAYS = 14;
const VN_DAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function buildDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysIso(start, i));
}

function isReservationOnDay(r: Reservation, day: string): boolean {
  if (r.status === "cancelled") return false;
  if (r.check_in === r.check_out) return day === r.check_in;
  return day >= r.check_in && day < r.check_out;
}

const STATUS_BG: Record<string, string> = {
  confirmed: "var(--color-accent-soft)",
  checked_in: "oklch(85% 0.15 145)",
  checked_out: "oklch(92% 0 0)",
  no_show: "oklch(90% 0.08 50)",
};

export function Calendar() {
  const [start, setStart] = useState(todayIso());

  const days = useMemo(() => buildDays(start, DAYS), [start]);
  const rangeFrom = days[0]!;
  const rangeTo = days[days.length - 1]!;

  const rooms = useQuery({
    queryKey: ["rooms", "calendar"],
    queryFn: () => apiFetch<Room[]>("/api/rooms"),
  });

  const reservations = useQuery({
    queryKey: ["reservations", "calendar", rangeFrom, rangeTo],
    queryFn: () =>
      apiFetchEnvelope<Reservation[]>("/api/reservations", {
        query: { from: addDaysIso(rangeFrom, -1), to: rangeTo, limit: 500 },
      }),
  });

  const allRooms = rooms.data ?? [];
  const list = reservations.data?.data ?? [];

  const byRoom = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of list) {
      if (!r.room_id) continue;
      const arr = m.get(r.room_id) ?? [];
      arr.push(r);
      m.set(r.room_id, arr);
    }
    return m;
  }, [list]);

  const cellW = 64;

  return (
    <div className="stack" style={{ gap: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Lịch phòng</h1>
          <div className="muted">
            {allRooms.length} phòng · {DAYS} ngày
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setStart(addDaysIso(start, -DAYS))}>
            ←
          </button>
          <input
            type="date"
            className="input"
            style={{ width: "auto" }}
            value={start}
            onChange={(e) => setStart(e.target.value || todayIso())}
          />
          <button className="btn btn-ghost" onClick={() => setStart(todayIso())}>
            Hôm nay
          </button>
          <button className="btn btn-ghost" onClick={() => setStart(addDaysIso(start, DAYS))}>
            →
          </button>
        </div>
      </div>

      {rooms.isLoading || reservations.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div className="card" style={{ overflow: "auto" }}>
          <div style={{ minWidth: 160 + cellW * DAYS }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `160px repeat(${DAYS}, ${cellW}px)`,
                position: "sticky",
                top: 0,
                background: "var(--color-surface)",
                borderBottom: "1px solid var(--color-border)",
                zIndex: 1,
              }}
            >
              <div style={{ padding: "8px 12px", fontWeight: 600, fontSize: 12 }}>Phòng</div>
              {days.map((d) => {
                const dt = new Date(d + "T00:00:00Z");
                const dow = dt.getUTCDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <div
                    key={d}
                    style={{
                      padding: "8px 4px",
                      textAlign: "center",
                      fontSize: 11,
                      borderLeft: "1px solid var(--color-border)",
                      background: isWeekend ? "var(--color-accent-soft)" : "transparent",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{VN_DAY[dow]}</div>
                    <div className="muted">
                      {d.slice(8)}/{d.slice(5, 7)}
                    </div>
                  </div>
                );
              })}
            </div>

            {allRooms.map((room) => (
              <div
                key={room.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: `160px repeat(${DAYS}, ${cellW}px)`,
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div style={{ padding: "8px 12px", fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{room.number}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {room.room_types?.code ?? ""}
                  </div>
                </div>
                {days.map((day) => {
                  const reservationsOnDay = (byRoom.get(room.id) ?? []).filter((r) =>
                    isReservationOnDay(r, day),
                  );
                  const r = reservationsOnDay[0];
                  return (
                    <div
                      key={day}
                      style={{
                        height: 44,
                        borderLeft: "1px solid var(--color-border)",
                        background: r
                          ? STATUS_BG[r.status] ?? "var(--color-accent-soft)"
                          : "transparent",
                        padding: "2px 4px",
                        fontSize: 11,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                      title={
                        r ? `${r.confirmation_code} · ${r.guests?.name ?? ""} · ${r.status}` : ""
                      }
                    >
                      {r ? (
                        <span style={{ fontWeight: 500 }}>
                          {r.guests?.name ?? r.confirmation_code}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: "var(--space-3)", fontSize: 12 }}>
        <Legend color={STATUS_BG.confirmed!} label="Đã xác nhận" />
        <Legend color={STATUS_BG.checked_in!} label="Đang ở" />
        <Legend color={STATUS_BG.checked_out!} label="Đã trả" />
        <Legend color={STATUS_BG.no_show!} label="Không đến" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: color,
          border: "1px solid var(--color-border)",
        }}
      />
      <span className="muted">{label}</span>
    </div>
  );
}
