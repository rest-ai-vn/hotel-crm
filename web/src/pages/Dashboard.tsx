import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { formatDate, formatVnd } from "../lib/format";
import type { Reservation, RoomStatus } from "../lib/types";

interface DashboardSummary {
  date: string;
  total_rooms: number;
  occupied: number;
  occupancy_pct: number;
  room_status: Partial<Record<RoomStatus, number>>;
  arrivals_count: number;
  departures_count: number;
  inhouse_count: number;
  today_revenue: number;
  arrivals: Reservation[];
  departures: Reservation[];
}

const STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Trống",
  reserved: "Đã đặt",
  occupied: "Đang ở",
  cleaning: "Đang dọn",
  maintenance: "Bảo trì",
  out_of_order: "Hỏng",
};

const STATUS_PILL: Record<RoomStatus, string> = {
  available: "success",
  reserved: "info",
  occupied: "warning",
  cleaning: "neutral",
  maintenance: "neutral",
  out_of_order: "danger",
};

export function Dashboard() {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiFetch<DashboardSummary>("/api/dashboard/summary"),
    refetchInterval: 60_000,
  });

  if (summary.isLoading) return <div className="muted">Đang tải…</div>;
  if (summary.isError || !summary.data) {
    return (
      <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
        Lỗi tải dashboard
      </div>
    );
  }

  const d = summary.data;

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Tổng quan</h1>
        <div className="muted">{formatDate(d.date)}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <Kpi label="Công suất" value={`${d.occupancy_pct}%`} hint={`${d.occupied}/${d.total_rooms} phòng`} />
        <Kpi label="Khách lưu trú" value={String(d.inhouse_count)} hint="đang ở" />
        <Kpi label="Nhận phòng hôm nay" value={String(d.arrivals_count)} hint="lượt" />
        <Kpi label="Trả phòng hôm nay" value={String(d.departures_count)} hint="lượt" />
        <Kpi label="Doanh thu hôm nay" value={formatVnd(d.today_revenue)} hint="dự kiến" />
      </div>

      <section>
        <h2
          style={{
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-soft)",
            margin: "0 0 var(--space-2)",
          }}
        >
          Trạng thái phòng
        </h2>
        <div className="card" style={{ padding: "var(--space-3)" }}>
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
            {(Object.keys(STATUS_LABEL) as RoomStatus[]).map((s) => (
              <div key={s} className="row" style={{ gap: 6 }}>
                <span className={`pill ${STATUS_PILL[s]}`}>{STATUS_LABEL[s]}</span>
                <strong>{d.room_status[s] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <ReservationList title="Nhận phòng hôm nay" rows={d.arrivals} empty="Không có lượt nhận phòng" />
        <ReservationList title="Trả phòng hôm nay" rows={d.departures} empty="Không có lượt trả phòng" />
      </div>

      <div className="muted" style={{ fontSize: 12 }}>
        <Link to="/reservations">→ Quản lý đặt phòng</Link> ·{" "}
        <Link to="/housekeeping">→ Buồng phòng</Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div
        className="muted"
        style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>
        {value}
      </div>
      {hint ? <div className="muted" style={{ fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function ReservationList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Reservation[];
  empty: string;
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-soft)",
          margin: "0 0 var(--space-2)",
        }}
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
          <span className="muted">{empty}</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách</th>
                <th>Loại</th>
                <th>Phòng</th>
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {r.confirmation_code}
                  </td>
                  <td>{r.guests?.name ?? "—"}</td>
                  <td>{r.room_types?.code ?? "—"}</td>
                  <td>{r.rooms?.number ?? <span className="muted">—</span>}</td>
                  <td>{formatVnd(r.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
