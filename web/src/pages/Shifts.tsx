import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDateTime, formatVnd } from "../lib/format";
import type { Shift } from "../lib/types";

export function Shifts() {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ["shift-current"],
    queryFn: () => apiFetch<Shift | null>("/api/shifts/current"),
    refetchInterval: 60_000,
  });
  const history = useQuery({
    queryKey: ["shift-history"],
    queryFn: () => apiFetch<Shift[]>("/api/shifts"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shift-current"] });
    qc.invalidateQueries({ queryKey: ["shift-history"] });
  };

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Giao ca</h1>
        <div className="muted">Mở ca, đối soát tiền mặt và bàn giao</div>
      </div>

      {current.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : current.data ? (
        <OpenShiftCard shift={current.data} onMutated={refresh} />
      ) : (
        <OpenShiftForm onMutated={refresh} />
      )}

      <section>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-soft)" }}>
          Lịch sử ca
        </h2>
        {(history.data ?? []).length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Chưa có ca nào.</div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Mở ca</th>
                  <th>Chốt ca</th>
                  <th>Đầu ca</th>
                  <th>Dự kiến</th>
                  <th>Thực đếm</th>
                  <th>Lệch</th>
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.staff?.name ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(s.opened_at)}</td>
                    <td style={{ fontSize: 12 }}>{s.closed_at ? formatDateTime(s.closed_at) : <span className="pill success">Đang mở</span>}</td>
                    <td>{formatVnd(s.opening_cash)}</td>
                    <td>{s.expected_cash != null ? formatVnd(s.expected_cash) : "—"}</td>
                    <td>{s.counted_cash != null ? formatVnd(s.counted_cash) : "—"}</td>
                    <td style={{ color: (s.variance ?? 0) < 0 ? "var(--color-danger)" : "inherit", fontWeight: s.variance ? 600 : 400 }}>
                      {s.variance != null ? formatVnd(s.variance) : "—"}
                    </td>
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

function OpenShiftForm({ onMutated }: { onMutated: () => void }) {
  const [openingCash, setOpeningCash] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = useMutation({
    mutationFn: () =>
      apiFetch<Shift>("/api/shifts/open", {
        method: "POST",
        body: { opening_cash: Number(openingCash) || 0 },
      }),
    onSuccess: onMutated,
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <div className="card" style={{ padding: "var(--space-5)" }}>
      <h2 style={{ margin: "0 0 var(--space-3)", fontSize: 16 }}>Chưa có ca nào đang mở</h2>
      <form
        className="row"
        style={{ gap: 8, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!open.isPending) open.mutate();
        }}
      >
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Tiền mặt đầu ca (VND)"
          inputMode="numeric"
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <button className="btn btn-primary" type="submit" disabled={open.isPending}>
          {open.isPending ? "Đang mở…" : "Mở ca"}
        </button>
      </form>
      {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}

function OpenShiftCard({ shift, onMutated }: { shift: Shift; onMutated: () => void }) {
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const s = shift.summary;

  const close = useMutation({
    mutationFn: () =>
      apiFetch<Shift>("/api/shifts/close", {
        method: "POST",
        body: { counted_cash: Number(countedCash) || 0, note: note || undefined },
      }),
    onSuccess: onMutated,
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const counted = Number(countedCash);
  const variance = s && countedCash !== "" ? counted - s.expected_cash : null;

  return (
    <div className="card" style={{ padding: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <div>
          <span className="pill success">Ca đang mở</span>{" "}
          <strong>{shift.staff?.name}</strong>
          <span className="muted"> · từ {formatDateTime(shift.opened_at)}</span>
        </div>
      </div>

      {s ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}
        >
          <Stat label="Đầu ca" value={formatVnd(s.opening_cash)} />
          <Stat label="Thu tiền mặt" value={formatVnd(s.cash_collected)} />
          <Stat label="Hoàn tiền mặt" value={formatVnd(s.cash_refunded)} />
          <Stat label="Thu chuyển khoản/thẻ" value={formatVnd(s.noncash_collected)} />
          <Stat label="Sổ quỹ thu − chi" value={formatVnd(s.cashbook_income - s.cashbook_expense)} />
          <Stat label="Tiền mặt dự kiến" value={formatVnd(s.expected_cash)} accent />
        </div>
      ) : null}

      <form
        className="row"
        style={{ gap: 8, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (countedCash !== "" && !close.isPending) close.mutate();
        }}
      >
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Tiền mặt thực đếm (VND)"
          inputMode="numeric"
          value={countedCash}
          onChange={(e) => setCountedCash(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <input
          className="input"
          style={{ flex: "1 1 200px" }}
          placeholder="Ghi chú bàn giao (tuỳ chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={countedCash === "" || close.isPending}>
          {close.isPending ? "Đang chốt…" : "Chốt ca"}
        </button>
      </form>
      {variance != null ? (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          Lệch quỹ:{" "}
          <strong style={{ color: variance < 0 ? "var(--color-danger)" : "var(--color-accent)" }}>
            {formatVnd(variance)}
          </strong>
        </div>
      ) : null}
      {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
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
