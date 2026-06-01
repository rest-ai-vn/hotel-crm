import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatVnd, todayIso } from "../lib/format";
import type {
  BookingType,
  Guest,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Reservation,
  ReservationStatus,
  Room,
  RoomType,
} from "../lib/types";

interface PriceBreakdown {
  base: number;
  surcharge: number;
  total: number;
  details: { nights: number; hours: number; weekend_nights: number; applied_rate: string };
}
interface QuoteResponse {
  plan_id: string;
  plan_name: string;
  breakdown: PriceBreakdown;
}

const BOOKING_LABEL: Record<BookingType, string> = {
  hourly: "Theo giờ",
  overnight: "Qua đêm",
  daytime: "Theo ngày",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Chưa thanh toán",
  partial: "Thanh toán 1 phần",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn",
};
const PAYMENT_STATUS_PILL: Record<PaymentStatus, string> = {
  pending: "warning",
  partial: "info",
  paid: "success",
  refunded: "neutral",
};
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  card: "Thẻ",
  transfer: "Chuyển khoản",
  vietqr: "VietQR",
};
const METHOD_OPTIONS: PaymentMethod[] = ["cash", "card", "transfer", "vietqr"];

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
  const [creating, setCreating] = useState(false);

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
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Tạo đặt phòng
        </button>
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

      {creating ? (
        <CreateReservationModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["reservations"] });
            qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
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
          <Field label="Thanh toán">
            <span className={`pill ${PAYMENT_STATUS_PILL[reservation.payment_status]}`}>
              {PAYMENT_STATUS_LABEL[reservation.payment_status]}
            </span>
          </Field>
          {reservation.notes ? <Field label="Ghi chú">{reservation.notes}</Field> : null}
        </div>

        <PaymentSection
          reservationId={reservation.id}
          totalAmount={reservation.total_amount}
          onMutated={onMutated}
        />

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

function CreateReservationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [bookingType, setBookingType] = useState<BookingType>("overnight");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [durationHours, setDurationHours] = useState("3");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types"),
  });

  const effectiveCheckOut = bookingType === "overnight" ? checkOut : checkIn;
  const canQuote = !!roomTypeId && !!checkIn && !!effectiveCheckOut;

  const quote = useQuery<QuoteResponse>({
    queryKey: [
      "quote",
      roomTypeId,
      bookingType,
      checkIn,
      effectiveCheckOut,
      bookingType === "hourly" ? durationHours : null,
    ],
    queryFn: () =>
      apiFetch<QuoteResponse>("/api/reservations/quote", {
        query: {
          room_type_id: roomTypeId,
          booking_type: bookingType,
          check_in: checkIn,
          check_out: effectiveCheckOut,
          duration_hours: bookingType === "hourly" ? durationHours : undefined,
        },
      }),
    enabled: canQuote,
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!quote.data) throw new Error("Chưa có báo giá");
      const guest = await apiFetch<Guest>("/api/guests/find-or-create", {
        method: "POST",
        body: {
          phone: guestPhone || undefined,
          name: guestName || "Khách",
        },
      });
      const body = {
        guest_id: guest.id,
        room_type_id: roomTypeId,
        booking_type: bookingType,
        check_in: checkIn,
        check_out: effectiveCheckOut,
        duration_hours: bookingType === "hourly" ? Number(durationHours) : undefined,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        base_amount: quote.data.breakdown.base,
        surcharge: quote.data.breakdown.surcharge,
        total_amount: quote.data.breakdown.total,
        notes: notes || undefined,
      };
      return apiFetch<Reservation>("/api/reservations", { method: "POST", body });
    },
    onSuccess: () => onCreated(),
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi tạo đặt phòng"),
  });

  const canSubmit =
    !!quote.data && !!roomTypeId && (!!guestName || !!guestPhone) && !create.isPending;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 520,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-5)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Tạo đặt phòng</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <FormField label="Loại đặt">
            <div className="row" style={{ gap: 6 }}>
              {(Object.keys(BOOKING_LABEL) as BookingType[]).map((bt) => (
                <button
                  key={bt}
                  type="button"
                  className={`btn ${bookingType === bt ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setBookingType(bt)}
                  style={{ fontSize: 13, padding: "6px 12px" }}
                >
                  {BOOKING_LABEL[bt]}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Loại phòng">
            <select
              className="input"
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
            >
              <option value="">Chọn loại phòng…</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </FormField>

          <div className="row" style={{ gap: "var(--space-3)" }}>
            <FormField label="Nhận phòng" style={{ flex: 1 }}>
              <input
                type="date"
                className="input"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </FormField>
            {bookingType === "overnight" ? (
              <FormField label="Trả phòng" style={{ flex: 1 }}>
                <input
                  type="date"
                  className="input"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  min={checkIn}
                />
              </FormField>
            ) : null}
            {bookingType === "hourly" ? (
              <FormField label="Số giờ" style={{ width: 120 }}>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </FormField>
            ) : null}
          </div>

          <div className="row" style={{ gap: "var(--space-3)" }}>
            <FormField label="Người lớn" style={{ flex: 1 }}>
              <input
                type="number"
                min={1}
                className="input"
                value={adults}
                onChange={(e) => setAdults(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </FormField>
            <FormField label="Trẻ em" style={{ flex: 1 }}>
              <input
                type="number"
                min={0}
                className="input"
                value={children}
                onChange={(e) => setChildren(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </FormField>
          </div>

          <FormField label="Tên khách">
            <input
              className="input"
              placeholder="Nguyễn Văn A"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </FormField>
          <FormField label="Số điện thoại">
            <input
              className="input"
              placeholder="0xxxxxxxxx"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </FormField>

          <FormField label="Ghi chú">
            <input
              className="input"
              placeholder="Tuỳ chọn"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>

          <div
            className="card"
            style={{ padding: "var(--space-3)", background: "var(--color-accent-soft)" }}
          >
            {!canQuote ? (
              <span className="muted">Chọn loại phòng và ngày để xem giá.</span>
            ) : quote.isLoading ? (
              <span className="muted">Đang tính giá…</span>
            ) : quote.isError ? (
              <span style={{ color: "var(--color-danger)" }}>
                {(quote.error as Error)?.message ?? "Không tính được giá"}
              </span>
            ) : quote.data ? (
              <div style={{ fontSize: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>{quote.data.plan_name}</div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>Tạm tính</span>
                  <span>{formatVnd(quote.data.breakdown.base)}</span>
                </div>
                {quote.data.breakdown.surcharge > 0 ? (
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>Phụ thu cuối tuần</span>
                    <span>{formatVnd(quote.data.breakdown.surcharge)}</span>
                  </div>
                ) : null}
                <div
                  className="row"
                  style={{ justifyContent: "space-between", fontWeight: 600, marginTop: 4 }}
                >
                  <span>Tổng</span>
                  <span>{formatVnd(quote.data.breakdown.total)}</span>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div>
          ) : null}

          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
              Hủy
            </button>
            <button
              className="btn btn-primary"
              disabled={!canSubmit}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Đang tạo…" : "Tạo đặt phòng"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <div
        className="muted"
        style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function PaymentSection({
  reservationId,
  totalAmount,
  onMutated,
}: {
  reservationId: string;
  totalAmount: number;
  onMutated: () => void;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["payments", reservationId],
    queryFn: () => apiFetch<Payment[]>("/api/payments", { query: { reservation_id: reservationId } }),
  });

  const payments = list.data ?? [];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, totalAmount - paid);

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Payment>("/api/payments", {
        method: "POST",
        body: {
          reservation_id: reservationId,
          amount: Number(amount),
          method,
          note: note || undefined,
        },
      }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["payments", reservationId] });
      onMutated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", reservationId] });
      onMutated();
    },
  });

  const amt = Number(amount);
  const canSubmit = Number.isFinite(amt) && amt > 0 && !create.isPending;

  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-soft)",
          }}
        >
          Thanh toán
        </h3>
        <div style={{ fontSize: 12 }}>
          <span className="muted">Đã trả</span>{" "}
          <strong>{formatVnd(paid)}</strong>{" "}
          <span className="muted">· còn</span>{" "}
          <strong style={{ color: remaining > 0 ? "var(--color-danger)" : "inherit" }}>
            {formatVnd(remaining)}
          </strong>
        </div>
      </div>

      {payments.length > 0 ? (
        <div className="card" style={{ overflow: "hidden", marginBottom: "var(--space-3)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Phương thức</th>
                <th>Số tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12 }}>{formatDateTime(p.created_at)}</td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td>{formatVnd(p.amount)}</td>
                  <td style={{ width: 1 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => remove.mutate(p.id)}
                      disabled={remove.isPending}
                      title="Xóa"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginBottom: "var(--space-3)" }}>
          Chưa có thanh toán nào.
        </div>
      )}

      <form
        className="row"
        style={{ gap: 6, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <input
          className="input"
          style={{ flex: "1 1 120px", minWidth: 100 }}
          placeholder={remaining > 0 ? String(remaining) : "Số tiền"}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ flex: "1 1 120px", minWidth: 100 }}
          placeholder="Ghi chú (tuỳ chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          + Thêm
        </button>
      </form>
      {error ? (
        <div style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 6 }}>{error}</div>
      ) : null}
    </section>
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
