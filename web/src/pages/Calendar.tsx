import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch } from "../lib/api";
import { addDaysIso, formatDate, todayIso } from "../lib/format";
import type { Reservation, Room } from "../lib/types";

const DAYS = 14;
const VN_DAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function buildDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysIso(start, i));
}

function isReservationOnDay(r: Reservation, day: string): boolean {
  if (r.status === "cancelled" || r.status === "no_show") return false;
  if (r.check_in === r.check_out) return day === r.check_in;
  return day >= r.check_in && day < r.check_out;
}

function overlaps(a: Reservation, b: Reservation): boolean {
  const aOut = a.check_out === a.check_in ? addDaysIso(a.check_in, 1) : a.check_out;
  const bOut = b.check_out === b.check_in ? addDaysIso(b.check_in, 1) : b.check_out;
  return a.check_in < bOut && aOut > b.check_in;
}

const STATUS_BG: Record<string, string> = {
  confirmed: "var(--color-accent-soft)",
  checked_in: "oklch(85% 0.15 145)",
  checked_out: "oklch(92% 0 0)",
  no_show: "oklch(90% 0.08 50)",
};

const DRAGGABLE_STATUSES = ["confirmed", "checked_in"];

export function Calendar() {
  const qc = useQueryClient();
  const [start, setStart] = useState(todayIso());
  const [dragging, setDragging] = useState<Reservation | null>(null);
  const [overCell, setOverCell] = useState<{ room: string; day: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const unassigned = useMemo(
    () => list.filter((r) => !r.room_id && r.status === "confirmed"),
    [list],
  );

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/reservations/${id}`, { method: "PUT", body }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không dời được lịch"),
  });

  const assign = useMutation({
    mutationFn: ({ reservation, roomId }: { reservation: Reservation; roomId: string }) =>
      reservation.status === "checked_in"
        ? apiFetch(`/api/reservations/${reservation.id}/move-room`, {
            method: "POST",
            body: { room_id: roomId, reason: "Kéo-thả trên sơ đồ" },
          })
        : apiFetch(`/api/reservations/${reservation.id}`, {
            method: "PUT",
            body: { room_id: roomId },
          }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không gán được phòng"),
  });

  function handleDrop(room: Room, day: string) {
    setOverCell(null);
    const r = dragging;
    setDragging(null);
    if (!r) return;

    // checked_in: chỉ đổi phòng; confirmed: đổi cả phòng lẫn ngày (giữ số đêm)
    const canShiftDates = r.status === "confirmed";
    const nights = Math.max(
      0,
      Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86_400_000),
    );
    const newCheckIn = canShiftDates ? day : r.check_in;
    const newCheckOut = canShiftDates
      ? nights === 0
        ? day
        : addDaysIso(day, nights)
      : r.check_out;

    const roomChanged = r.room_id !== room.id;
    const datesChanged = newCheckIn !== r.check_in;
    if (!roomChanged && !datesChanged) return;

    const shifted = { ...r, check_in: newCheckIn, check_out: newCheckOut };
    const clash = (byRoom.get(room.id) ?? []).some((x) => x.id !== r.id && overlaps(x, shifted));
    if (clash) {
      setError(`Phòng ${room.number} đã có khách trùng ngày ${formatDate(newCheckIn)}`);
      return;
    }
    if (roomChanged && r.room_type_id !== room.room_type_id) {
      const ok = window.confirm(
        `Phòng ${room.number} khác loại với đặt phòng (${r.room_types?.code ?? ""}). Vẫn gán?`,
      );
      if (!ok) return;
    }
    if (datesChanged) {
      const ok = window.confirm(
        `Dời lịch ${r.guests?.name ?? r.confirmation_code}:\n` +
          `${formatDate(r.check_in)} → ${formatDate(r.check_out)}  thành  ${formatDate(newCheckIn)} → ${formatDate(newCheckOut)}` +
          (roomChanged ? `\nPhòng mới: ${room.number}` : ""),
      );
      if (!ok) return;
    }

    if (r.status === "checked_in") {
      assign.mutate({ reservation: r, roomId: room.id });
    } else {
      update.mutate({
        id: r.id,
        body: {
          room_id: room.id,
          ...(datesChanged ? { check_in: newCheckIn, check_out: newCheckOut } : {}),
        },
      });
    }
  }

  function barProps(r: Reservation) {
    const draggable = DRAGGABLE_STATUSES.includes(r.status);
    return {
      draggable,
      onDragStart: draggable
        ? () => {
            setError(null);
            setDragging(r);
          }
        : undefined,
      onDragEnd: draggable ? () => setDragging(null) : undefined,
      style: { cursor: draggable ? "grab" : "default" } as React.CSSProperties,
    };
  }

  const cellW = 64;

  return (
    <div className="stack" style={{ gap: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Sơ đồ đặt phòng</h1>
          <div className="muted">
            {allRooms.length} phòng · {DAYS} ngày · kéo-thả để gán phòng / đổi phòng / dời ngày
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

      {error ? (
        <div
          className="card"
          style={{ padding: "var(--space-3)", color: "var(--color-danger)", fontSize: 13 }}
        >
          ⚠ {error}
        </div>
      ) : null}

      {unassigned.length > 0 ? (
        <div className="card" style={{ padding: "var(--space-3)" }}>
          <div
            className="muted"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}
          >
            Chưa gán phòng ({unassigned.length}) — kéo vào hàng phòng bên dưới
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {unassigned.map((r) => (
              <div
                key={r.id}
                {...barProps(r)}
                className="pill info"
                style={{ cursor: "grab", padding: "4px 12px", fontSize: 12 }}
                title={`${r.confirmation_code} · ${formatDate(r.check_in)} → ${formatDate(r.check_out)}`}
              >
                {r.guests?.name ?? r.confirmation_code} · {r.room_types?.code ?? ""} ·{" "}
                {formatDate(r.check_in)}
                {r.group_code ? " · 👥" : ""}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
                  const isStart = r && (day === r.check_in || day === rangeFrom);
                  return (
                    <div
                      key={day}
                      {...(r ? barProps(r) : {})}
                      onDragOver={(e) => {
                        if (dragging) {
                          e.preventDefault();
                          setOverCell({ room: room.id, day });
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(room, day);
                      }}
                      style={{
                        height: 44,
                        borderLeft: "1px solid var(--color-border)",
                        outline:
                          dragging && overCell?.room === room.id && overCell?.day === day
                            ? "2px dashed var(--color-accent)"
                            : "none",
                        outlineOffset: -2,
                        background:
                          dragging && overCell?.room === room.id && overCell?.day === day
                            ? "var(--color-accent-soft)"
                            : r
                              ? STATUS_BG[r.status] ?? "var(--color-accent-soft)"
                              : "transparent",
                        padding: "2px 4px",
                        fontSize: 11,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        cursor: r && DRAGGABLE_STATUSES.includes(r.status) ? "grab" : "default",
                        opacity: dragging && r && dragging.id === r.id ? 0.4 : 1,
                      }}
                      title={
                        r
                          ? `${r.confirmation_code} · ${r.guests?.name ?? ""} · ${formatDate(r.check_in)} → ${formatDate(r.check_out)}${r.group_code ? ` · đoàn ${r.group_code}` : ""}`
                          : ""
                      }
                    >
                      {r && isStart ? (
                        <span style={{ fontWeight: 500 }}>
                          {r.group_code ? "👥 " : ""}
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

      <div className="row" style={{ gap: "var(--space-3)", fontSize: 12, flexWrap: "wrap" }}>
        <Legend color={STATUS_BG.confirmed!} label="Đã xác nhận" />
        <Legend color={STATUS_BG.checked_in!} label="Đang ở" />
        <Legend color={STATUS_BG.checked_out!} label="Đã trả" />
        <span className="muted">· Kéo booking sang hàng phòng khác để gán/đổi phòng (👥 = đoàn)</span>
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
