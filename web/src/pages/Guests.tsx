import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchEnvelope, apiFetch, ApiHttpError } from "../lib/api";
import { formatDate, formatVnd } from "../lib/format";
import { useAuth } from "../lib/auth-context";
import type { Company, Guest } from "../lib/types";

export function Guests() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Guest | null>(null);

  const list = useQuery({
    queryKey: ["guests", q],
    queryFn: () =>
      apiFetchEnvelope<Guest[]>("/api/guests", {
        query: { q: q || undefined, limit: 50 },
      }),
  });

  const rows = list.data?.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Khách hàng</h1>
          <div className="muted">{list.data?.meta?.total ?? rows.length} khách</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Thêm khách
        </button>
      </div>

      <div className="card" style={{ padding: "var(--space-3)" }}>
        <input
          className="input"
          placeholder="Tìm theo tên, số điện thoại, hoặc Zalo ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {list.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : list.isError ? (
        <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
          Lỗi tải danh sách
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)", textAlign: "center" }}>
          <div className="muted">Không tìm thấy khách hàng nào</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Liên hệ</th>
                <th>Lượt ở</th>
                <th>Doanh thu</th>
                <th>Hạng</th>
                <th>Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => setSelected(g)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{g.name}</div>
                    {g.tags.length > 0 ? (
                      <div className="row" style={{ gap: 4, marginTop: 2 }}>
                        {g.tags.map((t) => (
                          <span key={t} className="pill neutral">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {g.phone ? <div>{g.phone}</div> : null}
                    {g.email ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.email}
                      </div>
                    ) : null}
                  </td>
                  <td>{g.visit_count}</td>
                  <td>{formatVnd(g.total_revenue)}</td>
                  <td>{g.loyalty_tier}</td>
                  <td className="muted">{formatDate(g.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <CreateGuestModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["guests"] });
            setCreating(false);
          }}
        />
      ) : null}

      {selected ? <GuestDrawer guest={selected} onClose={() => setSelected(null)} /> : null}

      <CompaniesSection />
    </div>
  );
}

function CompaniesSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canManage = user?.role === "admin" || user?.role === "manager";

  const list = useQuery({
    queryKey: ["companies", "all"],
    queryFn: () => apiFetch<Company[]>("/api/companies", { query: { all: 1 } }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Company>("/api/companies", {
        method: "POST",
        body: {
          name,
          tax_code: taxCode || undefined,
          discount_pct: Number(discount) || 0,
        },
      }),
    onSuccess: () => {
      setName("");
      setTaxCode("");
      setDiscount("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/companies/${id}`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });

  const rows = list.data ?? [];

  return (
    <section style={{ marginTop: "var(--space-4)" }}>
      <h2
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-soft)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Công ty đối tác (công nợ · giá hợp đồng)
      </h2>
      <div className="card" style={{ padding: "var(--space-4)" }}>
        {canManage ? (
          <form
            className="row"
            style={{ gap: 8, flexWrap: "wrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (name && !create.isPending) create.mutate();
            }}
          >
            <input className="input" style={{ flex: "1 1 200px" }} placeholder="Tên công ty" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" style={{ width: 140 }} placeholder="Mã số thuế" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
            <input className="input" style={{ width: 150 }} placeholder="Chiết khấu HĐ (%)" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^0-9]/g, ""))} />
            <button className="btn btn-primary" type="submit" disabled={!name || create.isPending}>
              + Thêm công ty
            </button>
          </form>
        ) : null}
        {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
            Chưa có công ty nào. Gán công ty khi đặt phòng để theo dõi công nợ và áp giá hợp đồng.
          </div>
        ) : (
          <table className="table" style={{ marginTop: canManage ? "var(--space-3)" : 0 }}>
            <thead>
              <tr>
                <th>Công ty</th>
                <th>MST</th>
                <th>Chiết khấu HĐ</th>
                <th>Trạng thái</th>
                {canManage ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((co) => (
                <tr key={co.id}>
                  <td style={{ fontWeight: 600 }}>{co.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{co.tax_code ?? "—"}</td>
                  <td>{co.discount_pct ? `-${co.discount_pct}%` : "—"}</td>
                  <td>
                    {co.is_active ? (
                      <span className="pill success">Hoạt động</span>
                    ) : (
                      <span className="pill neutral">Ngừng</span>
                    )}
                  </td>
                  {canManage ? (
                    <td style={{ width: 1 }}>
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "2px 8px" }}
                          onClick={() => {
                            const pct = window.prompt("Chiết khấu hợp đồng (%) cho " + co.name, String(co.discount_pct ?? 0));
                            if (pct !== null) {
                              update.mutate({ id: co.id, body: { discount_pct: Math.min(100, Number(pct) || 0) } });
                            }
                          }}
                        >
                          Sửa CK
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "2px 8px" }}
                          onClick={() => update.mutate({ id: co.id, body: { is_active: !co.is_active } })}
                        >
                          {co.is_active ? "Ngừng" : "Bật"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function CreateGuestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Guest>("/api/guests", {
        method: "POST",
        body: {
          name,
          phone: phone || undefined,
          email: email || undefined,
        },
      }),
    onSuccess: onCreated,
    onError: (e) => setError(e instanceof ApiHttpError ? e.message : "Lỗi tạo khách"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.3)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: "var(--space-5)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 460, padding: "var(--space-5)" }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Thêm khách hàng</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-soft)" }}>Tên *</span>
            <input
              className="input"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-soft)" }}>Số điện thoại</span>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-soft)" }}>Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error ? (
            <div
              style={{
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
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GuestDrawer({ guest, onClose }: { guest: Guest; onClose: () => void }) {
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
          width: 420,
          maxWidth: "100%",
          height: "100%",
          padding: "var(--space-5)",
          overflowY: "auto",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{guest.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="stack">
          {guest.phone ? <Row label="Điện thoại">{guest.phone}</Row> : null}
          {guest.email ? <Row label="Email">{guest.email}</Row> : null}
          {guest.id_number ? (
            <Row label="CMND/CCCD">
              {guest.id_number}
              {guest.id_type ? ` (${guest.id_type})` : ""}
            </Row>
          ) : null}
          {guest.address ? <Row label="Địa chỉ">{guest.address}</Row> : null}
          {guest.zalo_id ? <Row label="Zalo">{guest.zalo_id}</Row> : null}
          {guest.facebook_id ? <Row label="Facebook">{guest.facebook_id}</Row> : null}
          <Row label="Lượt ở">{guest.visit_count}</Row>
          <Row label="Tổng doanh thu">{formatVnd(guest.total_revenue)}</Row>
          <Row label="Hạng">{guest.loyalty_tier}</Row>
          {guest.notes ? <Row label="Ghi chú">{guest.notes}</Row> : null}
          <Row label="Tạo">{formatDate(guest.created_at)}</Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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
