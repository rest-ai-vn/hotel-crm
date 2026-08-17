import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatVnd } from "../lib/format";
import type { Service } from "../lib/types";

const CATEGORIES = ["minibar", "giặt ủi", "spa", "ăn uống", "đưa đón", "tour", "other"];

export function Services() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("lần");

  const catalogQuery = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => apiFetch<Service[]>("/api/services/catalog", { query: { all: "1" } }),
  });

  const createService = useMutation({
    mutationFn: (body: { name: string; category: string; price: number; unit: string }) =>
      apiFetch<Service>("/api/services/catalog", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services-catalog"] });
      setName("");
      setPrice("");
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiFetch<Service>(`/api/services/catalog/${id}`, { method: "PUT", body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services-catalog"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNum = Number(price);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) return;
    createService.mutate({ name: name.trim(), category, price: Math.round(priceNum), unit });
  }

  const services = catalogQuery.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Dịch vụ bổ sung</h1>
        <div className="muted">Danh mục dịch vụ tính vào hóa đơn khách (minibar, giặt ủi, spa…)</div>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ padding: "var(--space-4)" }}>
        <div className="row" style={{ gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="stack" style={{ gap: 4, flex: "2 1 180px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Tên dịch vụ</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Ăn sáng" required />
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 120px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Nhóm</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 120px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Giá (₫)</span>
            <input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="50000" required />
          </label>
          <label className="stack" style={{ gap: 4, flex: "1 1 90px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Đơn vị</span>
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lần" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={createService.isPending}>
            {createService.isPending ? "Đang lưu…" : "Thêm"}
          </button>
        </div>
        {createService.isError ? (
          <div style={{ color: "var(--color-danger)", marginTop: 8, fontSize: 13 }}>
            Lỗi: {(createService.error as Error).message}
          </div>
        ) : null}
      </form>

      {catalogQuery.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {services.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{ padding: "var(--space-3)", opacity: s.is_active ? 1 : 0.5 }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <span className="pill neutral" style={{ fontSize: 11 }}>{s.category}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                {formatVnd(s.price)}<span className="muted" style={{ fontSize: 12 }}> / {s.unit}</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "4px 10px", marginTop: 8 }}
                onClick={() => toggleActive.mutate({ id: s.id, is_active: !s.is_active })}
              >
                {s.is_active ? "Ẩn" : "Kích hoạt"}
              </button>
            </div>
          ))}
          {services.length === 0 ? (
            <div className="card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
              <span className="muted">Chưa có dịch vụ nào</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
