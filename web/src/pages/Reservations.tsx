import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch } from "../lib/api";
import { addDaysIso, formatDate, formatDateTime, formatVnd, todayIso } from "../lib/format";
import { printReservationReceipt } from "../lib/print";
import type {
  BookingType,
  Company,
  Guest,
  Payment,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  Reservation,
  ReservationStatus,
  ReservationService,
  Room,
  RoomType,
  Service,
} from "../lib/types";

interface PriceBreakdown {
  base: number;
  surcharge: number;
  total: number;
  company_discount: number;
  company_discount_pct: number;
  discount: number;
  vat_rate: number;
  tax_amount: number;
  grand_total: number;
  voucher_id: string | null;
  voucher_error: string | null;
  details: { nights: number; hours: number; weekend_nights: number; applied_rate: string };
}

interface GroupLine {
  typeId: string;
  count: string;
}

function makeGroupCode(): string {
  return `GRP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
  return addDaysIso(todayIso(), offset);
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
  const [showMove, setShowMove] = useState(false);
  const [moveRoomId, setMoveRoomId] = useState("");
  const [showExtend, setShowExtend] = useState(false);
  const [extendDate, setExtendDate] = useState(reservation.check_out);
  const [extendAmount, setExtendAmount] = useState("");

  const isActive = reservation.status === "confirmed" || reservation.status === "checked_in";
  const availableRooms = useQuery({
    queryKey: ["rooms", "available-for-checkin"],
    queryFn: () => apiFetch<Room[]>("/api/rooms", { query: { status: "available" } }),
    enabled: isActive,
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

  const noShow = useMutation({
    mutationFn: (forfeit: boolean) =>
      apiFetch(`/api/reservations/${reservation.id}/no-show`, {
        method: "POST",
        body: { forfeit_deposit: forfeit },
      }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });
  const moveRoom = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reservations/${reservation.id}/move-room`, {
        method: "POST",
        body: { room_id: moveRoomId, reason: "Đổi phòng bởi lễ tân" },
      }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });
  const extend = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reservations/${reservation.id}/extend`, {
        method: "POST",
        body: { check_out: extendDate, extra_amount: Number(extendAmount) || 0 },
      }),
    onSuccess: () => {
      onMutated();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  async function handlePrint() {
    try {
      const [services, payments] = await Promise.all([
        apiFetch<ReservationService[]>("/api/services", {
          query: { reservation_id: reservation.id },
        }),
        apiFetch<Payment[]>("/api/payments", { query: { reservation_id: reservation.id } }),
      ]);
      printReservationReceipt(reservation, services, payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi in phiếu");
    }
  }

  const busy =
    checkIn.isPending ||
    checkOut.isPending ||
    cancel.isPending ||
    noShow.isPending ||
    moveRoom.isPending ||
    extend.isPending;

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

        {reservation.group_code ? <GroupSection groupCode={reservation.group_code} currentId={reservation.id} /> : null}

        <ServiceSection reservationId={reservation.id} onMutated={onMutated} />

        <PaymentSection
          reservationId={reservation.id}
          totalAmount={reservation.total_amount + (reservation.services_total ?? 0)}
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
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  noShow.mutate(
                    window.confirm(
                      "Giữ tiền cọc đã thu làm doanh thu?\nOK = giữ cọc · Cancel = không giữ",
                    ),
                  )
                }
                title="Khách không đến nhận phòng"
              >
                Không đến
              </button>
            </>
          ) : null}
          {reservation.status === "checked_in" ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => checkOut.mutate()}>
              Trả phòng
            </button>
          ) : null}
          {isActive ? (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setShowMove((v) => !v)}>
                Đổi phòng
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setShowExtend((v) => !v)}>
                Gia hạn
              </button>
            </>
          ) : null}
          <button className="btn btn-ghost" onClick={handlePrint}>
            🖨 In phiếu
          </button>
        </div>

        {showMove && isActive ? (
          <div className="card" style={{ marginTop: "var(--space-3)", padding: "var(--space-3)" }}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <select
                className="input"
                style={{ flex: "1 1 160px" }}
                value={moveRoomId}
                onChange={(e) => setMoveRoomId(e.target.value)}
              >
                <option value="">Chọn phòng mới…</option>
                {(availableRooms.data ?? [])
                  .filter((r) => r.id !== reservation.room_id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.number} · {r.room_types?.name}
                    </option>
                  ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={busy || !moveRoomId}
                onClick={() => moveRoom.mutate()}
              >
                Xác nhận đổi
              </button>
            </div>
          </div>
        ) : null}

        {showExtend && isActive ? (
          <div className="card" style={{ marginTop: "var(--space-3)", padding: "var(--space-3)" }}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <input
                type="date"
                className="input"
                style={{ width: "auto" }}
                value={extendDate}
                min={reservation.check_out}
                onChange={(e) => setExtendDate(e.target.value)}
              />
              <input
                className="input"
                style={{ width: 160 }}
                placeholder="Tiền thêm (VND)"
                inputMode="numeric"
                value={extendAmount}
                onChange={(e) => setExtendAmount(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <button
                className="btn btn-primary"
                disabled={busy || extendDate < reservation.check_out}
                onClick={() => extend.mutate()}
              >
                Xác nhận gia hạn
              </button>
            </div>
          </div>
        ) : null}
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
  const [roomsCount, setRoomsCount] = useState("1");
  const [extraLines, setExtraLines] = useState<GroupLine[]>([]);
  const [voucherCode, setVoucherCode] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types"),
  });
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiFetch<Company[]>("/api/companies"),
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
      voucherCode,
      companyId,
    ],
    queryFn: () =>
      apiFetch<QuoteResponse>("/api/reservations/quote", {
        query: {
          room_type_id: roomTypeId,
          booking_type: bookingType,
          check_in: checkIn,
          check_out: effectiveCheckOut,
          duration_hours: bookingType === "hourly" ? durationHours : undefined,
          voucher_code: voucherCode.trim() || undefined,
          company_id: companyId || undefined,
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
      const b = quote.data.breakdown;
      const validExtras = extraLines.filter((l) => l.typeId && Number(l.count) > 0);
      const groupCode =
        validExtras.length > 0 ? makeGroupCode() : undefined;
      const shared = {
        guest_id: guest.id,
        booking_type: bookingType,
        check_in: checkIn,
        check_out: effectiveCheckOut,
        duration_hours: bookingType === "hourly" ? Number(durationHours) : undefined,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        voucher_id: b.voucher_id ?? undefined,
        company_id: companyId || undefined,
        notes: notes || undefined,
        group_code: groupCode,
      };
      const first = await apiFetch<Reservation>("/api/reservations", {
        method: "POST",
        body: {
          ...shared,
          room_type_id: roomTypeId,
          base_amount: b.base,
          surcharge: b.surcharge,
          discount_amount: b.discount,
          tax_amount: b.tax_amount,
          total_amount: b.grand_total,
          rooms_count: Math.max(1, Number(roomsCount) || 1),
        },
      });
      // Extra room-type lines join the same group with their own quoted price.
      for (const line of validExtras) {
        const q = await apiFetch<QuoteResponse>("/api/reservations/quote", {
          query: {
            room_type_id: line.typeId,
            booking_type: bookingType,
            check_in: checkIn,
            check_out: effectiveCheckOut,
            duration_hours: bookingType === "hourly" ? durationHours : undefined,
            voucher_code: voucherCode.trim() || undefined,
            company_id: companyId || undefined,
          },
        });
        const lb = q.breakdown;
        await apiFetch<Reservation>("/api/reservations", {
          method: "POST",
          body: {
            ...shared,
            room_type_id: line.typeId,
            base_amount: lb.base,
            surcharge: lb.surcharge,
            discount_amount: lb.discount,
            tax_amount: lb.tax_amount,
            total_amount: lb.grand_total,
            rooms_count: Math.max(1, Number(line.count) || 1),
          },
        });
      }
      return first;
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
            <FormField label="Số phòng" style={{ width: 90 }}>
              <input
                type="number"
                min={1}
                max={10}
                className="input"
                value={roomsCount}
                onChange={(e) => setRoomsCount(e.target.value.replace(/[^0-9]/g, ""))}
                title="Đặt nhiều phòng cùng loại (đặt đoàn)"
              />
            </FormField>
          </div>

          {extraLines.map((line, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <select
                className="input"
                style={{ flex: 1 }}
                value={line.typeId}
                onChange={(e) =>
                  setExtraLines(extraLines.map((l, j) => (j === i ? { ...l, typeId: e.target.value } : l)))
                }
              >
                <option value="">Chọn loại phòng thêm…</option>
                {(types.data ?? [])
                  .filter((t) => t.id !== roomTypeId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min={1}
                max={10}
                className="input"
                style={{ width: 80 }}
                value={line.count}
                onChange={(e) =>
                  setExtraLines(
                    extraLines.map((l, j) =>
                      j === i ? { ...l, count: e.target.value.replace(/[^0-9]/g, "") } : l,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setExtraLines(extraLines.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start", fontSize: 13 }}
            onClick={() => setExtraLines([...extraLines, { typeId: "", count: "1" }])}
          >
            ＋ Thêm loại phòng khác (đặt đoàn hỗn hợp)
          </button>

          <div className="row" style={{ gap: "var(--space-3)" }}>
            <FormField label="Mã giảm giá" style={{ flex: 1 }}>
              <input
                className="input"
                placeholder="Tuỳ chọn"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
              />
            </FormField>
            <FormField label="Công ty (công nợ)" style={{ flex: 1 }}>
              <select
                className="input"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                <option value="">Khách lẻ</option>
                {(companies.data ?? []).map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.name}
                  </option>
                ))}
              </select>
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
                    <span>Phụ thu</span>
                    <span>{formatVnd(quote.data.breakdown.surcharge)}</span>
                  </div>
                ) : null}
                {quote.data.breakdown.voucher_error ? (
                  <div style={{ color: "var(--color-danger)", fontSize: 12 }}>
                    {quote.data.breakdown.voucher_error}
                  </div>
                ) : null}
                {quote.data.breakdown.company_discount > 0 ? (
                  <div className="row" style={{ justifyContent: "space-between", color: "var(--color-accent)" }}>
                    <span>Giá hợp đồng CTY (-{quote.data.breakdown.company_discount_pct}%)</span>
                    <span>-{formatVnd(quote.data.breakdown.company_discount)}</span>
                  </div>
                ) : null}
                {quote.data.breakdown.discount > quote.data.breakdown.company_discount ? (
                  <div className="row" style={{ justifyContent: "space-between", color: "var(--color-accent)" }}>
                    <span>Voucher</span>
                    <span>-{formatVnd(quote.data.breakdown.discount - quote.data.breakdown.company_discount)}</span>
                  </div>
                ) : null}
                {quote.data.breakdown.tax_amount > 0 ? (
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>VAT {quote.data.breakdown.vat_rate}%</span>
                    <span>{formatVnd(quote.data.breakdown.tax_amount)}</span>
                  </div>
                ) : null}
                <div
                  className="row"
                  style={{ justifyContent: "space-between", fontWeight: 600, marginTop: 4 }}
                >
                  <span>Tổng{Number(roomsCount) > 1 ? ` (mỗi phòng × ${roomsCount})` : ""}</span>
                  <span>{formatVnd(quote.data.breakdown.grand_total)}</span>
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
  const paid = payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const remaining = Math.max(0, totalAmount - paid);

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [kind, setKind] = useState<PaymentKind>("payment");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; amount: number } | null>(null);

  async function showQr() {
    try {
      const data = await apiFetch<{ url: string; amount: number }>("/api/payments/vietqr", {
        query: { reservation_id: reservationId },
      });
      setQr(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tạo QR");
    }
  }

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Payment>("/api/payments", {
        method: "POST",
        body: {
          reservation_id: reservationId,
          amount: Number(amount),
          method,
          kind,
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
                  <td>
                    {METHOD_LABEL[p.method]}
                    {p.kind === "deposit" ? (
                      <span className="pill info" style={{ marginLeft: 6 }}>Cọc</span>
                    ) : p.kind === "refund" ? (
                      <span className="pill danger" style={{ marginLeft: 6 }}>Hoàn</span>
                    ) : null}
                  </td>
                  <td style={{ color: p.kind === "refund" ? "var(--color-danger)" : "inherit" }}>
                    {p.kind === "refund" ? "-" : ""}
                    {formatVnd(p.amount)}
                  </td>
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
          value={kind}
          onChange={(e) => setKind(e.target.value as PaymentKind)}
        >
          <option value="payment">Thanh toán</option>
          <option value="deposit">Đặt cọc</option>
          <option value="refund">Hoàn tiền</option>
        </select>
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
        <button
          className="btn btn-ghost"
          type="button"
          onClick={showQr}
          disabled={remaining <= 0}
          title="QR chuyển khoản VietQR cho số tiền còn lại"
        >
          📲 QR CK
        </button>
      </form>
      {error ? (
        <div style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 6 }}>{error}</div>
      ) : null}

      {qr ? (
        <div
          onClick={() => setQr(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0% 0 0 / 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 90,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-4)",
              textAlign: "center",
              maxWidth: 360,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Quét để chuyển khoản {formatVnd(qr.amount)}
            </div>
            <img src={qr.url} alt="VietQR" style={{ width: "100%", borderRadius: 8 }} />
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setQr(null)}>
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ServiceSection({
  reservationId,
  onMutated,
}: {
  reservationId: string;
  onMutated: () => void;
}) {
  const qc = useQueryClient();
  const charges = useQuery({
    queryKey: ["res-services", reservationId],
    queryFn: () =>
      apiFetch<ReservationService[]>("/api/services", { query: { reservation_id: reservationId } }),
  });
  const catalog = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => apiFetch<Service[]>("/api/services/catalog"),
  });

  const [serviceId, setServiceId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [error, setError] = useState<string | null>(null);

  const items = charges.data ?? [];
  const total = items.reduce((s, x) => s + x.amount, 0);
  const options = catalog.data ?? [];

  const create = useMutation({
    mutationFn: () => {
      const svc = options.find((o) => o.id === serviceId);
      if (!svc) throw new Error("Chọn dịch vụ");
      return apiFetch<ReservationService>("/api/services", {
        method: "POST",
        body: {
          reservation_id: reservationId,
          service_id: svc.id,
          name: svc.name,
          unit_price: svc.price,
          quantity: Math.max(1, Number(quantity) || 1),
        },
      });
    },
    onSuccess: () => {
      setServiceId("");
      setQuantity("1");
      setError(null);
      qc.invalidateQueries({ queryKey: ["res-services", reservationId] });
      onMutated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/services/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["res-services", reservationId] });
      onMutated();
    },
  });

  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-soft)",
          }}
        >
          Dịch vụ
        </h3>
        <div style={{ fontSize: 12 }}>
          <span className="muted">Tổng</span> <strong>{formatVnd(total)}</strong>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="card" style={{ overflow: "hidden", marginBottom: "var(--space-3)" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                <th>SL</th>
                <th>Thành tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.quantity}</td>
                  <td>{formatVnd(x.amount)}</td>
                  <td style={{ width: 1 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => remove.mutate(x.id)}
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
          Chưa có dịch vụ nào.
        </div>
      )}

      <form
        className="row"
        style={{ gap: 6, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (serviceId && !create.isPending) create.mutate();
        }}
      >
        <select
          className="input"
          style={{ flex: "1 1 160px" }}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Chọn dịch vụ…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {formatVnd(o.price)}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ width: 70 }}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
          title="Số lượng"
        />
        <button className="btn btn-primary" type="submit" disabled={!serviceId || create.isPending}>
          + Thêm
        </button>
      </form>
      {error ? (
        <div style={{ color: "var(--color-danger)", fontSize: 12, marginTop: 6 }}>{error}</div>
      ) : null}
    </section>
  );
}

function GroupSection({ groupCode, currentId }: { groupCode: string; currentId: string }) {
  const members = useQuery({
    queryKey: ["group", groupCode],
    queryFn: () =>
      apiFetchEnvelope<Reservation[]>("/api/reservations", {
        query: { group_code: groupCode, limit: 50 },
      }),
  });

  const rows = (members.data?.data ?? []).filter((r) => r.status !== "cancelled");
  const groupTotal = rows.reduce((s, r) => s + r.total_amount + (r.services_total ?? 0), 0);

  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <h3
          style={{
            margin: 0,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-soft)",
          }}
        >
          👥 Đoàn {groupCode} ({rows.length} phòng)
        </h3>
        <div style={{ fontSize: 12 }}>
          <span className="muted">Tổng đoàn</span> <strong>{formatVnd(groupTotal)}</strong>
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.id === currentId ? 1 : 0.85 }}>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                  {r.confirmation_code}
                  {r.id === currentId ? " ←" : ""}
                </td>
                <td style={{ fontSize: 12 }}>{r.room_types?.code ?? ""}</td>
                <td style={{ fontSize: 12 }}>{r.rooms?.number ?? "Chưa gán"}</td>
                <td style={{ fontSize: 12 }}>{formatVnd(r.total_amount)}</td>
                <td>
                  <span className={`pill ${PAYMENT_STATUS_PILL[r.payment_status]}`} style={{ fontSize: 11 }}>
                    {PAYMENT_STATUS_LABEL[r.payment_status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
