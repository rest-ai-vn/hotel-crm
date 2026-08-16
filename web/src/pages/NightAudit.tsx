import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime, formatVnd, todayIso } from "../lib/format";
import type { NightAuditPreview, NightAuditRecord } from "../lib/types";

export function NightAudit() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["night-audit-preview", date],
    queryFn: () => apiFetch<NightAuditPreview>("/api/night-audit/preview", { query: { date } }),
  });
  const history = useQuery({
    queryKey: ["night-audit-history"],
    queryFn: () => apiFetch<NightAuditRecord[]>("/api/night-audit"),
  });

  const run = useMutation({
    mutationFn: () =>
      apiFetch<NightAuditRecord>("/api/night-audit/run", {
        method: "POST",
        body: { business_date: date, note: note || undefined },
      }),
    onSuccess: () => {
      setNote("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["night-audit-preview"] });
      qc.invalidateQueries({ queryKey: ["night-audit-history"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const p = preview.data;

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Chốt ngày (Night audit)</h1>
          <div className="muted">Khóa sổ cuối ngày, tự chuyển khách không đến thành no-show</div>
        </div>
        <input type="date" className="input" style={{ width: "auto" }} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </div>

      {preview.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : p ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <Stat label="Lượt nhận phòng" value={String(p.stats.arrivals)} />
            <Stat label="Lượt trả phòng" value={String(p.stats.departures)} />
            <Stat label="Đang lưu trú" value={String(p.stats.in_house)} />
            <Stat label="Tiền thu trong ngày" value={formatVnd(p.stats.payments_collected)} accent />
            <Stat label="Hoàn tiền" value={formatVnd(p.stats.payments_refunded)} />
            <Stat label="Sổ quỹ thu − chi" value={formatVnd(p.stats.cashbook_income - p.stats.cashbook_expense)} />
          </div>

          <section className="card" style={{ padding: "var(--space-4)" }}>
            <h2 style={{ margin: "0 0 var(--space-2)", fontSize: 14 }}>
              Khách không đến ({p.no_show_candidates.length})
            </h2>
            {p.no_show_candidates.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Không có đặt phòng quá hạn nhận phòng.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Khách</th>
                    <th>Loại phòng</th>
                    <th>Ngày nhận</th>
                    <th>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {p.no_show_candidates.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.confirmation_code}</td>
                      <td>{r.guests?.name ?? "—"}</td>
                      <td>{r.room_types?.name ?? "—"}</td>
                      <td>{formatDate(r.check_in)}</td>
                      <td>{formatVnd(r.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="row" style={{ marginTop: "var(--space-3)", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ flex: "1 1 240px" }}
                placeholder="Ghi chú (tuỳ chọn)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn btn-primary"
                disabled={p.already_closed || run.isPending}
                onClick={() => run.mutate()}
              >
                {p.already_closed ? "Ngày này đã chốt" : run.isPending ? "Đang chốt…" : `Chốt ngày ${formatDate(date)}`}
              </button>
            </div>
            {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
          </section>
        </>
      ) : null}

      <section>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-soft)" }}>
          Lịch sử chốt ngày
        </h2>
        {(history.data ?? []).length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Chưa chốt ngày nào.</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Người chốt</th>
                  <th>Thời điểm</th>
                  <th>No-show</th>
                  <th>Tiền thu</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.business_date)}</td>
                    <td>{a.staff?.name ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(a.closed_at)}</td>
                    <td>{a.no_show_count}</td>
                    <td>{formatVnd(a.stats?.payments_collected ?? 0)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{a.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: "var(--space-3)" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: accent ? "var(--color-accent)" : "inherit" }}>
        {value}
      </div>
    </div>
  );
}
