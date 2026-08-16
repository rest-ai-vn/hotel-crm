import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatVnd, formatDate, todayIso } from "../lib/format";
import type { CashDirection, CashSummary, CashTransaction } from "../lib/types";

export function Cashbook() {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<CashDirection>("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());

  const txQuery = useQuery({
    queryKey: ["cashbook"],
    queryFn: () => apiFetch<CashTransaction[]>("/api/cashbook"),
  });
  const summaryQuery = useQuery({
    queryKey: ["cashbook-summary"],
    queryFn: () => apiFetch<CashSummary>("/api/cashbook/summary"),
  });

  const createTx = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<CashTransaction>("/api/cashbook", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      setAmount("");
      setNote("");
      setCategory("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    createTx.mutate({
      direction,
      category: category.trim() || "other",
      amount: Math.round(amt),
      note: note.trim() || undefined,
      occurred_on: occurredOn,
    });
  }

  const txs = txQuery.data ?? [];
  const s = summaryQuery.data;

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Sổ thu chi</h1>
        <div className="muted">Ghi nhận thu / chi ngoài tiền phòng</div>
      </div>

      {s ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
          <Kpi label="Tổng thu" value={formatVnd(s.income)} color="var(--color-success)" />
          <Kpi label="Tổng chi" value={formatVnd(s.expense)} color="var(--color-danger)" />
          <Kpi label="Còn lại" value={formatVnd(s.net)} color="var(--color-accent)" />
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="card" style={{ padding: "var(--space-4)" }}>
        <div className="row" style={{ gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 4, flex: "1 1 110px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Loại</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as CashDirection)}>
              <option value="expense">Chi</option>
              <option value="income">Thu</option>
            </select>
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 140px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Hạng mục</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VD: Điện nước" />
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 120px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Số tiền (₫)</span>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 140px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Ngày</span>
            <input type="date" value={occurredOn} max={todayIso()} onChange={(e) => setOccurredOn(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 4, flex: "2 1 160px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Ghi chú</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={createTx.isPending}>
            {createTx.isPending ? "Đang lưu…" : "Ghi nhận"}
          </button>
        </div>
      </form>

      {txQuery.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {txs.length === 0 ? (
            <div style={{ padding: "var(--space-4)", textAlign: "center" }}>
              <span className="muted">Chưa có giao dịch nào</span>
            </div>
          ) : (
            txs.map((t) => (
              <div
                key={t.id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "10px var(--space-4)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div>
                  <span
                    className={`pill ${t.direction === "income" ? "success" : "danger"}`}
                    style={{ fontSize: 11, marginRight: 8 }}
                  >
                    {t.direction === "income" ? "Thu" : "Chi"}
                  </span>
                  <span style={{ fontWeight: 500 }}>{t.category}</span>
                  {t.note ? <span className="muted" style={{ fontSize: 12 }}> · {t.note}</span> : null}
                </div>
                <div className="row" style={{ gap: "var(--space-3)" }}>
                  <span className="muted" style={{ fontSize: 12 }}>{formatDate(t.occurred_on)}</span>
                  <span
                    style={{ fontWeight: 600, color: t.direction === "income" ? "var(--color-success)" : "var(--color-danger)" }}
                  >
                    {t.direction === "income" ? "+" : "−"}{formatVnd(t.amount)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color }}>{value}</div>
    </div>
  );
}
