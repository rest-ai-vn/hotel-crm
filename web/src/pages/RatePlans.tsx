import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDate, formatVnd, todayIso } from "../lib/format";
import type { BookingType, RateOverride, RoomType } from "../lib/types";

interface RatePlan {
  id: string;
  room_type_id: string;
  booking_type: BookingType;
  name: string;
  hourly_rate: number | null;
  overnight_rate: number | null;
  daytime_rate: number | null;
  min_hours: number;
  extra_hour_rate: number | null;
  weekend_surcharge_pct: number;
  valid_from: string;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  room_types?: { name: string; code: string };
}

const BOOKING_LABEL: Record<BookingType, string> = {
  hourly: "Theo giờ",
  overnight: "Qua đêm",
  daytime: "Theo ngày",
};

export function RatePlans() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [creating, setCreating] = useState(false);

  const types = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types"),
  });

  const plans = useQuery({
    queryKey: ["rate-plans"],
    queryFn: () => apiFetch<RatePlan[]>("/api/rate-plans"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/rate-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate-plans"] }),
  });

  const rows = plans.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Bảng giá</h1>
          <div className="muted">{rows.length} bảng giá</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Tạo bảng giá
        </button>
      </div>

      {plans.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)", textAlign: "center" }}>
          <span className="muted">Chưa có bảng giá nào.</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Loại phòng</th>
                <th>Loại đặt</th>
                <th>Tên</th>
                <th>Giá</th>
                <th>Cuối tuần</th>
                <th>Hiệu lực</th>
                <th>Ưu tiên</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.room_types?.name ?? r.room_type_id.slice(0, 8)}</td>
                  <td>{BOOKING_LABEL[r.booking_type]}</td>
                  <td>{r.name}</td>
                  <td>
                    {formatVnd(
                      r.booking_type === "hourly"
                        ? r.hourly_rate
                        : r.booking_type === "daytime"
                          ? r.daytime_rate
                          : r.overnight_rate,
                    )}
                  </td>
                  <td>{r.weekend_surcharge_pct}%</td>
                  <td style={{ fontSize: 12 }}>
                    {formatDate(r.valid_from)}
                    {r.valid_to ? ` → ${formatDate(r.valid_to)}` : ""}
                  </td>
                  <td>{r.priority}</td>
                  <td className="row" style={{ gap: 4 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px" }}
                      onClick={() => setEditing(r)}
                    >
                      Sửa
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px", color: "var(--color-danger)" }}
                      onClick={() => {
                        if (confirm(`Xóa bảng giá "${r.name}"?`)) remove.mutate(r.id);
                      }}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RateOverridesSection types={types.data ?? []} />

      {creating || editing ? (
        <RatePlanModal
          plan={editing}
          types={types.data ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["rate-plans"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RateOverridesSection({ types }: { types: RoomType[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [roomTypeId, setRoomTypeId] = useState("");
  const [pct, setPct] = useState("");
  const [fixedOvernight, setFixedOvernight] = useState("");
  const [fixedHourly, setFixedHourly] = useState("");
  const [fixedDaytime, setFixedDaytime] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["rate-overrides"],
    queryFn: () => apiFetch<RateOverride[]>("/api/rate-overrides"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<RateOverride>("/api/rate-overrides", {
        method: "POST",
        body: {
          name,
          date,
          room_type_id: roomTypeId || null,
          surcharge_pct: Number(pct) || 0,
          fixed_overnight: fixedOvernight ? Number(fixedOvernight) : null,
          fixed_hourly: fixedHourly ? Number(fixedHourly) : null,
          fixed_daytime: fixedDaytime ? Number(fixedDaytime) : null,
        },
      }),
    onSuccess: () => {
      setName("");
      setPct("");
      setFixedOvernight("");
      setFixedHourly("");
      setFixedDaytime("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["rate-overrides"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/rate-overrides/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rate-overrides"] }),
  });

  const rows = list.data ?? [];

  return (
    <section style={{ marginTop: "var(--space-4)" }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-soft)" }}>
        Giá ngày lễ / sự kiện
      </h2>
      <div className="card" style={{ padding: "var(--space-4)" }}>
        <form
          className="row"
          style={{ gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name && !create.isPending) create.mutate();
          }}
        >
          <input className="input" style={{ flex: "1 1 140px" }} placeholder="Tên (VD: Lễ 2/9)" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" className="input" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className="input" style={{ width: "auto" }} value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
            <option value="">Mọi loại phòng</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input className="input" style={{ width: 100 }} placeholder="Phụ thu %" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ""))} />
          <input className="input" style={{ width: 140 }} placeholder="Giá đêm cố định" inputMode="numeric" value={fixedOvernight} onChange={(e) => setFixedOvernight(e.target.value.replace(/[^0-9]/g, ""))} />
          <input className="input" style={{ width: 130 }} placeholder="Giá giờ cố định" inputMode="numeric" value={fixedHourly} onChange={(e) => setFixedHourly(e.target.value.replace(/[^0-9]/g, ""))} />
          <input className="input" style={{ width: 140 }} placeholder="Giá ngày cố định" inputMode="numeric" value={fixedDaytime} onChange={(e) => setFixedDaytime(e.target.value.replace(/[^0-9]/g, ""))} />
          <button className="btn btn-primary" type="submit" disabled={!name || create.isPending}>
            + Thêm
          </button>
        </form>
        {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

        {rows.length > 0 ? (
          <table className="table" style={{ marginTop: "var(--space-3)" }}>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Tên</th>
                <th>Loại phòng</th>
                <th>Phụ thu</th>
                <th>Giá cố định (giờ/đêm/ngày)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.date)}</td>
                  <td>{o.name}</td>
                  <td>{o.room_types?.name ?? "Tất cả"}</td>
                  <td>{o.surcharge_pct > 0 ? `+${o.surcharge_pct}%` : "—"}</td>
                  <td style={{ fontSize: 12 }}>
                    {[o.fixed_hourly, o.fixed_overnight, o.fixed_daytime]
                      .map((v) => (v != null ? formatVnd(v) : "—"))
                      .join(" / ")}
                  </td>
                  <td style={{ width: 1 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px", color: "var(--color-danger)" }}
                      onClick={() => {
                        if (confirm(`Xóa "${o.name}"?`)) remove.mutate(o.id);
                      }}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{ fontSize: 13, marginTop: "var(--space-3)" }}>
            Chưa có ngày lễ/sự kiện nào. Giá override sẽ tự áp dụng khi báo giá đặt phòng.
          </div>
        )}
      </div>
    </section>
  );
}

function RatePlanModal({
  plan,
  types,
  onClose,
  onSaved,
}: {
  plan: RatePlan | null;
  types: RoomType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!plan;
  const [roomTypeId, setRoomTypeId] = useState(plan?.room_type_id ?? "");
  const [bookingType, setBookingType] = useState<BookingType>(plan?.booking_type ?? "overnight");
  const [name, setName] = useState(plan?.name ?? "");
  const [rate, setRate] = useState(
    String(
      plan
        ? plan.booking_type === "hourly"
          ? plan.hourly_rate ?? ""
          : plan.booking_type === "daytime"
            ? plan.daytime_rate ?? ""
            : plan.overnight_rate ?? ""
        : "",
    ),
  );
  const [minHours, setMinHours] = useState(String(plan?.min_hours ?? 1));
  const [extraRate, setExtraRate] = useState(String(plan?.extra_hour_rate ?? ""));
  const [weekendPct, setWeekendPct] = useState(String(plan?.weekend_surcharge_pct ?? 0));
  const [validFrom, setValidFrom] = useState(plan?.valid_from ?? todayIso());
  const [validTo, setValidTo] = useState(plan?.valid_to ?? "");
  const [priority, setPriority] = useState(String(plan?.priority ?? 100));
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const rateNum = Number(rate);
      const body: Record<string, unknown> = {
        name,
        min_hours: Number(minHours) || 1,
        weekend_surcharge_pct: Number(weekendPct) || 0,
        valid_from: validFrom,
        valid_to: validTo || null,
        priority: Number(priority) || 100,
        is_active: isActive,
        hourly_rate: bookingType === "hourly" ? rateNum : null,
        overnight_rate: bookingType === "overnight" ? rateNum : null,
        daytime_rate: bookingType === "daytime" ? rateNum : null,
        extra_hour_rate: extraRate ? Number(extraRate) : null,
      };
      if (!isEdit) {
        body.room_type_id = roomTypeId;
        body.booking_type = bookingType;
      }
      return apiFetch(
        isEdit ? `/api/rate-plans/${plan!.id}` : "/api/rate-plans",
        { method: isEdit ? "PUT" : "POST", body },
      );
    },
    onSuccess: () => onSaved(),
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi lưu"),
  });

  const canSubmit =
    !!name && !!rate && (isEdit || !!roomTypeId) && Number(rate) > 0 && !save.isPending;

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
          width: 480,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-5)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, marginBottom: "var(--space-4)" }}>
          {isEdit ? "Sửa bảng giá" : "Tạo bảng giá"}
        </h2>

        <div className="stack" style={{ gap: "var(--space-3)" }}>
          {!isEdit ? (
            <>
              <Field label="Loại phòng">
                <select
                  className="input"
                  value={roomTypeId}
                  onChange={(e) => setRoomTypeId(e.target.value)}
                >
                  <option value="">Chọn…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Loại đặt">
                <select
                  className="input"
                  value={bookingType}
                  onChange={(e) => setBookingType(e.target.value as BookingType)}
                >
                  {(Object.keys(BOOKING_LABEL) as BookingType[]).map((bt) => (
                    <option key={bt} value={bt}>
                      {BOOKING_LABEL[bt]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          <Field label="Tên bảng giá">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={bookingType === "hourly" ? "Giá / giờ (VND)" : "Giá (VND)"}>
            <input
              className="input"
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </Field>

          {bookingType === "hourly" ? (
            <div className="row" style={{ gap: "var(--space-2)" }}>
              <Field label="Tối thiểu (giờ)" style={{ flex: 1 }}>
                <input
                  className="input"
                  inputMode="numeric"
                  value={minHours}
                  onChange={(e) => setMinHours(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </Field>
              <Field label="Giá giờ thêm" style={{ flex: 1 }}>
                <input
                  className="input"
                  inputMode="numeric"
                  value={extraRate}
                  onChange={(e) => setExtraRate(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </Field>
            </div>
          ) : null}

          <Field label="Phụ thu cuối tuần (%)">
            <input
              className="input"
              inputMode="numeric"
              value={weekendPct}
              onChange={(e) => setWeekendPct(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </Field>

          <div className="row" style={{ gap: "var(--space-2)" }}>
            <Field label="Hiệu lực từ" style={{ flex: 1 }}>
              <input
                type="date"
                className="input"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </Field>
            <Field label="Đến (tuỳ chọn)" style={{ flex: 1 }}>
              <input
                type="date"
                className="input"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </Field>
          </div>

          <div className="row" style={{ gap: "var(--space-2)", alignItems: "flex-end" }}>
            <Field label="Ưu tiên" style={{ flex: 1 }}>
              <input
                className="input"
                inputMode="numeric"
                value={priority}
                onChange={(e) => setPriority(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </Field>
            <label className="row" style={{ gap: 6, padding: "8px 0" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Đang hoạt động</span>
            </label>
          </div>

          {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}

          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={!canSubmit} onClick={() => save.mutate()}>
              {save.isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
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
