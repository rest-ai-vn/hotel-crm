import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch } from "../lib/api";
import { formatDate, formatVnd, todayIso } from "../lib/format";
import type { Reservation, ReservationStatus, Room } from "../lib/types";

const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed: "Đã xác nhận",
  checked_in: "Đã nhận phòng",
  checked_out: "Đã trả phòng",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};
const STATUS_PILL: Record<ReservationStatus, string> = {
  confirmed: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "danger",
  no_show: "warning",
};
const STATUS_FILTER_OPTIONS: ReservationStatus[] = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

function isoNDaysFromNow(offset: number): string {
  const t = new Date();
  t.setDate(t.getDate() + offset);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function Reservations() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => isoNDaysFromNow(-7));
  const [to, setTo] = useState(() => isoNDaysFromNow(30));
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "">("");
  const [selected, setSelected] = useState<Reservation | null>(null);

  const list = useQuery({
    queryKey: ["reservations", from, to, statusFilter],
    queryFn: () =>
      apiFetchEnvelope<Reservation[]>("/api/reservations", {
        query: { from, to, status: statusFilter || undefined, limit: 100 },
      }),
  });

  const rows = list.data?.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Đặt phòng</h1>
          <div className="muted">{list.data?.meta?.total ?? rows.length} đặt phòng</div>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--space-3)" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Từ</span>
            <input type="date" className="input" style={{ width: "auto" }} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Đến</span>
            <input type="date" className="input" style={{ width: "auto" }} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select
            className="input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReservationStatus | "")}
          >
            <option value="">Mọi trạng thái</option>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <button
            className="btn btn-ghost"
            onClick={() => {
              setFrom(todayIso());
              setTo(todayIso());
            }}
          >
            Hôm nay
          </button>
        </div>
      </div>

      {list.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : list.isError ? (
        <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
          Lỗi tải danh sách
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)", textAlign: "center" }}>
          <div className="muted">Không có đặt phòng nào trong khoảng đã chọn</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách</th>
                <th>Loại phòng</th>
                <th>Phòng</th>
                <th>Nhận</th>
                <th>Trả</th>
                <th>Tổng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setSelected(r)}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {r.confirmation_code}
                  </td>
                  <td>
                    <div>{r.guests?.name ?? "—"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.guests?.phone ?? ""}
                    </div>
                  </td>
                  <td>{r.room_types?.name ?? "—"}</td>
                  <td>{r.rooms?.number ?? <span className="muted">Chưa gán</span>}</td>
                  <td>{formatDate(r.check_in)}</td>
                  <td>{formatDate(r.check_out)}</td>
                  <td>{formatVnd(r.total_amount)}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <ReservationDrawer
          reservation={selected}
          onClose={() => setSelected(null)}
          onMutated={() => {
            qc.invalidateQueries({ queryKey: ["reservations"] });
            qc.invalidateQueries({ queryKey: ["rooms"] });
          }}
        />
      ) : null}
    </div>
  );
}

function ReservationDrawer({
  reservation,
  onClose,
  onMutated,
}: {
  reservation: Reservation;
  onClose: () => void;
  onMutated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(reservation.room_id ?? "");

  const availableRooms = useQuery({
    queryKey: ["rooms", "available-for-checkin"],
    queryFn: () => apiFetch<Room[]>("/api/rooms", { query: { status: "available" } }),
    enabled: reservation.status === "confirmed",
  });

  const checkIn = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reservations/${reservation.id}/check-in`, {
        method: "POST",
        body: { room_id: roomId },
      }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });
  const checkOut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reservations/${reservation.id}/check-out`, { method: "POST" }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });
  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reservations/${reservation.id}/cancel`, {
        method: "POST",
        body: { reason: "Hủy bởi lễ tân" },
      }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const busy = checkIn.isPending || checkOut.isPending || cancel.isPending;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.3)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 460,
          maxWidth: "100%",
          height: "100%",
          padding: "var(--space-5)",
          overflowY: "auto",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <div>
            <div className="muted" style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
              {reservation.confirmation_code}
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 20 }}>{reservation.guests?.name}</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="stack">
          <Field label="Trạng thái">
            <span className={`pill ${STATUS_PILL[reservation.status]}`}>
              {STATUS_LABEL[reservation.status]}
            </span>
          </Field>
          <Field label="Loại đặt">
            {reservation.booking_type === "hourly"
              ? "Theo giờ"
              : reservation.booking_type === "overnight"
                ? "Qua đêm"
                : "Theo ngày"}
          </Field>
          <Field label="Loại phòng">{reservation.room_types?.name ?? "—"}</Field>
          <Field label="Phòng">{reservation.rooms?.number ?? "Chưa gán"}</Field>
          <Field label="Nhận / Trả">
            {formatDate(reservation.check_in)} → {formatDate(reservation.check_out)}
          </Field>
          <Field label="Khách">
            {reservation.adults} người lớn
            {reservation.children > 0 ? ` · ${reservation.children} trẻ em` : ""}
          </Field>
          <Field label="Tổng tiền">{formatVnd(reservation.total_amount)}</Field>
          {reservation.notes ? <Field label="Ghi chú">{reservation.notes}</Field> : null}
        </div>

        {error ? (
          <div
            style={{
              marginTop: "var(--space-4)",
              padding: 8,
              borderRadius: "var(--radius-md)",
              background: "oklch(95% 0.05 25)",
              color: "var(--color-danger)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: "var(--space-5)", flexWrap: "wrap" }}>
          {reservation.status === "confirmed" ? (
            <>
              <select
                className="input"
                style={{ width: "auto" }}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="">Chọn phòng…</option>
                {(availableRooms.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.room_types?.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={busy || !roomId}
                onClick={() => checkIn.mutate()}
              >
                Nhận phòng
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => cancel.mutate()}>
                Hủy
              </button>
            </>
          ) : null}
          {reservation.status === "checked_in" ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => checkOut.mutate()}>
              Trả phòng
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="muted"
        style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}
