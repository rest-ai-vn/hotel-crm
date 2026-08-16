import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatVnd, todayIso } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import type { BreakdownReport, ResidenceReport, RevenueReport } from "../lib/types";

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
  const breakdownQuery = useQuery({
    queryKey: ["reports-breakdown", tab, from, to],
    queryFn: () =>
      apiFetch<BreakdownReport>("/api/reports/breakdown", { query: { by: tab, from, to } }),
  });

  const r = reportQuery.data;
  const b = breakdownQuery.data;

  function exportBreakdown() {
    if (!b) return;
    downloadCsv(
      `bao-cao-${b.by}-${from}-${to}.csv`,
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
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
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
            ⬇ Xuất CSV
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

      <ResidenceSection />
    </div>
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
