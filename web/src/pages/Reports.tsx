import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDate, formatVnd, todayIso } from "../lib/format";
import { downloadCsv, downloadExcel } from "../lib/csv";
import { useAuth } from "../lib/auth-context";
import type {
  BreakdownReport,
  ChainReport,
  ReceivablesReport,
  ResidenceReport,
  RevenueReport,
} from "../lib/types";

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const BREAKDOWN_TABS = [
  { key: "source", label: "Nguồn khách" },
  { key: "room_type", label: "Loại phòng" },
  { key: "staff", label: "Nhân viên thu" },
  { key: "nationality", label: "Quốc tịch" },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  walk_in: "Khách vãng lai",
  zalo: "Zalo",
  facebook: "Facebook",
  phone: "Điện thoại",
  ota_agoda: "Agoda",
  ota_booking: "Booking.com",
  ota_traveloka: "Traveloka",
  website: "Website",
};

export function Reports() {
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [tab, setTab] = useState<(typeof BREAKDOWN_TABS)[number]["key"]>("source");

  const reportQuery = useQuery({
    queryKey: ["reports-revenue", from, to],
    queryFn: () => apiFetch<RevenueReport>("/api/reports/revenue", { query: { from, to } }),
  });
  const dailyQuery = useQuery({
    queryKey: ["reports-daily", from, to],
    queryFn: () =>
      apiFetch<{ days: Array<{ date: string; revenue: number; count: number }> }>(
        "/api/reports/daily",
        { query: { from, to } },
      ),
  });

  const breakdownQuery = useQuery({
    queryKey: ["reports-breakdown", tab, from, to],
    queryFn: () =>
      apiFetch<BreakdownReport>("/api/reports/breakdown", { query: { by: tab, from, to } }),
  });

  const r = reportQuery.data;
  const b = breakdownQuery.data;

  function exportBreakdown() {
    if (!b) return;
    downloadExcel(
      `bao-cao-${b.by}-${from}-${to}`,
      ["Nhóm", "Số lượng", "Doanh thu (VND)"],
      b.rows.map((row) => [
        b.by === "source" ? (SOURCE_LABEL[row.label] ?? row.label) : row.label,
        row.count,
        row.amount,
      ]),
    );
  }

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Báo cáo</h1>
          <div className="muted">Doanh thu · Công suất · ADR · RevPAR · Khai báo lưu trú</div>
        </div>
        <div className="row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
          <input type="date" className="input" style={{ width: "auto" }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" className="input" style={{ width: "auto" }} value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {reportQuery.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : reportQuery.isError ? (
        <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
          Lỗi tải báo cáo
        </div>
      ) : r ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <Kpi label="Tổng doanh thu" value={formatVnd(r.total_revenue)} accent />
            <Kpi label="Tiền phòng" value={formatVnd(r.room_revenue)} />
            <Kpi label="Tiền dịch vụ" value={formatVnd(r.service_revenue)} />
            <Kpi label="Công suất" value={`${r.occupancy_pct}%`} />
            <Kpi label="ADR (giá phòng TB)" value={formatVnd(r.adr)} />
            <Kpi label="RevPAR" value={formatVnd(r.revpar)} />
          </div>

          <div className="card" style={{ padding: "var(--space-4)" }}>
            <Row label="Số đặt phòng" value={String(r.reservation_count)} />
            <Row label="Đêm-phòng đã bán" value={String(r.room_nights_sold)} />
            <Row label="Đêm-phòng khả dụng" value={String(r.available_room_nights)} />
            <Row label="Số phòng hoạt động" value={String(r.total_rooms)} />
            <Row label="Số ngày trong kỳ" value={String(r.days)} />
          </div>
        </>
      ) : null}

      <RevenueChart days={dailyQuery.data?.days ?? []} />

      <section className="card" style={{ padding: "var(--space-4)" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            {BREAKDOWN_TABS.map((t) => (
              <button
                key={t.key}
                className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 13, padding: "6px 12px" }}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={exportBreakdown} disabled={!b || b.rows.length === 0}>
            ⬇ Xuất Excel
          </button>
        </div>

        {breakdownQuery.isLoading ? (
          <div className="muted" style={{ marginTop: "var(--space-3)" }}>Đang tải…</div>
        ) : b && b.rows.length > 0 ? (
          <table className="table" style={{ marginTop: "var(--space-3)" }}>
            <thead>
              <tr>
                <th>Nhóm</th>
                <th>Số lượng</th>
                <th>Doanh thu</th>
                <th>Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row) => {
                const total = b.rows.reduce((s, x) => s + Math.max(0, x.amount), 0);
                const pct = total > 0 ? Math.round((Math.max(0, row.amount) / total) * 100) : 0;
                return (
                  <tr key={row.key}>
                    <td>{b.by === "source" ? (SOURCE_LABEL[row.label] ?? row.label) : row.label}</td>
                    <td>{row.count}</td>
                    <td>{formatVnd(row.amount)}</td>
                    <td>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, maxWidth: 160, height: 6, background: "var(--color-border)", borderRadius: 3 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-accent)", borderRadius: 3 }} />
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="muted" style={{ marginTop: "var(--space-3)", fontSize: 13 }}>
            Không có dữ liệu trong khoảng đã chọn.
          </div>
        )}
      </section>

      <ReceivablesSection />

      <ChainSection from={from} to={to} />

      <ResidenceSection />
    </div>
  );
}

function ReceivablesSection() {
  const rec = useQuery({
    queryKey: ["reports-receivables"],
    queryFn: () => apiFetch<ReceivablesReport>("/api/reports/receivables"),
  });
  const r = rec.data;
  const total = (r?.companies ?? []).reduce((s, x) => s + x.outstanding, 0);

  return (
    <section className="card" style={{ padding: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Công nợ công ty</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Đặt phòng gắn công ty chưa thanh toán đủ
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: total > 0 ? "var(--color-danger)" : "inherit" }}>
          {formatVnd(total)}
        </div>
      </div>

      {rec.isLoading ? (
        <div className="muted" style={{ marginTop: "var(--space-3)" }}>Đang tải…</div>
      ) : !r || r.companies.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--space-3)", fontSize: 13 }}>
          Không có công nợ nào.
        </div>
      ) : (
        <>
          <table className="table" style={{ marginTop: "var(--space-3)" }}>
            <thead>
              <tr>
                <th>Công ty</th>
                <th>Số đặt phòng nợ</th>
                <th>Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {r.companies.map((co) => (
                <tr key={co.company_id}>
                  <td style={{ fontWeight: 600 }}>{co.company_name}</td>
                  <td>{co.count}</td>
                  <td style={{ color: "var(--color-danger)", fontWeight: 600 }}>
                    {formatVnd(co.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details style={{ marginTop: "var(--space-2)" }}>
            <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>
              Chi tiết từng đặt phòng ({r.details.length})
            </summary>
            <table className="table" style={{ marginTop: 8 }}>
              <tbody>
                {r.details.map((d) => (
                  <tr key={d.reservation_id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {d.confirmation_code}
                    </td>
                    <td>{d.company_name}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(d.check_in)}</td>
                    <td>{formatVnd(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

function ChainSection({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const chain = useQuery({
    queryKey: ["reports-chain", from, to],
    queryFn: () => apiFetch<ChainReport>("/api/reports/chain", { query: { from, to } }),
    enabled: user?.role === "admin",
  });

  if (user?.role !== "admin") return null;
  const r = chain.data;

  return (
    <section className="card" style={{ padding: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Toàn chuỗi (mọi cơ sở)</h2>
          <div className="muted" style={{ fontSize: 13 }}>Doanh thu gộp theo cơ sở trong kỳ</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-accent)" }}>
          {formatVnd(r?.total ?? 0)}
        </div>
      </div>
      {chain.isLoading ? (
        <div className="muted" style={{ marginTop: "var(--space-3)" }}>Đang tải…</div>
      ) : !r || r.rows.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--space-3)", fontSize: 13 }}>
          Chưa có doanh thu trong kỳ.
        </div>
      ) : (
        <table className="table" style={{ marginTop: "var(--space-3)" }}>
          <thead>
            <tr>
              <th>Cơ sở</th>
              <th>Số đặt phòng</th>
              <th>Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.key}>
                <td style={{ fontWeight: 600 }}>{row.label}</td>
                <td>{row.count}</td>
                <td>{formatVnd(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RevenueChart({ days }: { days: Array<{ date: string; revenue: number; count: number }> }) {
  if (days.length === 0) return null;
  const W = 900;
  const H = 180;
  const pad = 8;
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const bw = Math.max(4, Math.floor((W - pad * 2) / days.length) - 3);

  return (
    <section className="card" style={{ padding: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Doanh thu theo ngày</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          Đỉnh: {formatVnd(max)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H + 24}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Biểu đồ doanh thu theo ngày"
      >
        {days.map((d, i) => {
          const h = Math.round((d.revenue / max) * H);
          const x = pad + i * ((W - pad * 2) / days.length);
          const isToday = d.date === todayIso();
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={Math.max(h, d.revenue > 0 ? 2 : 0)}
                rx={2}
                fill={isToday ? "var(--color-accent)" : "oklch(75% 0.09 260)"}
                opacity={d.revenue > 0 ? 1 : 0.15}
              >
                <title>{`${formatDate(d.date)}: ${formatVnd(d.revenue)} (${d.count} đặt phòng)`}</title>
              </rect>
              {days.length <= 31 && (i % Math.ceil(days.length / 10) === 0 || isToday) ? (
                <text
                  x={x + bw / 2}
                  y={H + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-text-soft)"
                >
                  {d.date.slice(8)}/{d.date.slice(5, 7)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function ResidenceSection() {
  const [date, setDate] = useState(todayIso());
  const residence = useQuery({
    queryKey: ["reports-residence", date],
    queryFn: () => apiFetch<ResidenceReport>("/api/reports/residence", { query: { date } }),
  });

  const rows = residence.data?.rows ?? [];

  function exportResidence() {
    downloadCsv(
      `khai-bao-luu-tru-${date}.csv`,
      ["Họ và tên", "Loại giấy tờ", "Số giấy tờ", "Quốc tịch", "Địa chỉ thường trú", "Số điện thoại", "Số phòng", "Ngày đến", "Ngày đi (dự kiến)"],
      rows.map((g) => [
        g.guest_name,
        g.id_type,
        g.id_number,
        g.nationality,
        g.address,
        g.phone,
        g.room_number,
        g.check_in,
        g.check_out,
      ]),
    );
  }

  return (
    <section className="card" style={{ padding: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Khai báo lưu trú</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Danh sách khách đang lưu trú để nộp cơ quan công an (ASM / dichvucong)
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input type="date" className="input" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-primary" onClick={exportResidence} disabled={rows.length === 0}>
            ⬇ Tải file khai báo
          </button>
        </div>
      </div>

      {residence.isLoading ? (
        <div className="muted" style={{ marginTop: "var(--space-3)" }}>Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--space-3)", fontSize: 13 }}>
          Không có khách lưu trú ngày này.
        </div>
      ) : (
        <table className="table" style={{ marginTop: "var(--space-3)" }}>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Giấy tờ</th>
              <th>Quốc tịch</th>
              <th>Phòng</th>
              <th>SĐT</th>
              <th>Đến</th>
              <th>Đi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <td>{g.guest_name}</td>
                <td style={{ fontSize: 12 }}>
                  {g.id_type ?? "CCCD"}: {g.id_number ?? <span style={{ color: "var(--color-danger)" }}>thiếu</span>}
                </td>
                <td>{g.nationality}</td>
                <td>{g.room_number ?? "—"}</td>
                <td>{g.phone ?? "—"}</td>
                <td>{g.check_in}</td>
                <td>{g.check_out}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 4,
          color: accent ? "var(--color-accent)" : "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="row"
      style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}
    >
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
