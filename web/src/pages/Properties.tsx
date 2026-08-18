import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/format";
import { useAuth } from "../lib/auth-context";
import type { Property, StaffRole, StaffUser } from "../lib/types";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Quản trị",
  manager: "Quản lý",
  receptionist: "Lễ tân",
  housekeeping: "Buồng phòng",
};

export function Properties() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Property | null>(null);
  const list = useQuery({
    queryKey: ["properties"],
    queryFn: () => apiFetch<Property[]>("/api/properties"),
  });

  const rows = list.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Cơ sở</h1>
        <div className="muted">
          Mỗi cơ sở có phòng, giá, đặt phòng, thu chi và nhân viên riêng biệt
        </div>
      </div>

      <CreatePropertyCard onCreated={() => qc.invalidateQueries({ queryKey: ["properties"] })} />

      {list.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên cơ sở</th>
                <th>Địa chỉ</th>
                <th>SĐT</th>
                <th>Ngày tạo</th>
                <th>VAT</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.code}</td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{p.address ?? "—"}</td>
                  <td>{p.phone ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(p.created_at)}</td>
                  <td>{p.vat_rate ? `${p.vat_rate}%` : "—"}</td>
                  <td>
                    {p.is_active ? (
                      <span className="pill success">Hoạt động</span>
                    ) : (
                      <span className="pill neutral">Ngừng</span>
                    )}
                  </td>
                  <td style={{ width: 1 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px" }}
                      onClick={() => setEditing(p)}
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <EditPropertyModal
          property={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["properties"] });
          }}
        />
      ) : null}

      <CreateStaffCard properties={rows} />

      <StaffListCard properties={rows} />
    </div>
  );
}

function StaffListCard({ properties }: { properties: Property[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [propertyId, setPropertyId] = useState("");
  const effectivePid = propertyId || user?.property_id || "";

  const list = useQuery({
    queryKey: ["staff-list", effectivePid],
    queryFn: () =>
      apiFetch<StaffUser[]>("/api/auth/staff", {
        query: { property_id: propertyId || undefined },
      }),
  });
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/auth/staff/${input.id}`, { method: "PUT", body: input.body }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["staff-list"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  function resetPassword(s: StaffUser) {
    const pw = window.prompt(`Mật khẩu mới cho ${s.email} (≥8 ký tự):`);
    if (!pw) return;
    if (pw.length < 8) {
      setError("Mật khẩu tối thiểu 8 ký tự");
      return;
    }
    update.mutate({ id: s.id, body: { password: pw } });
  }

  const rows = list.data ?? [];

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Nhân viên theo cơ sở</h2>
        <select className="input" style={{ width: "auto" }} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Cơ sở của tôi</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {list.isLoading ? (
        <div className="muted" style={{ marginTop: "var(--space-3)" }}>Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="muted" style={{ marginTop: "var(--space-3)", fontSize: 13 }}>
          Cơ sở này chưa có nhân viên.
        </div>
      ) : (
        <table className="table" style={{ marginTop: "var(--space-3)" }}>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td className="muted" style={{ fontSize: 13 }}>{s.email}</td>
                <td>
                  <select
                    className="input"
                    style={{ width: "auto", fontSize: 13, padding: "4px 8px" }}
                    value={s.role}
                    disabled={s.id === user?.id || update.isPending}
                    onChange={(e) => update.mutate({ id: s.id, body: { role: e.target.value } })}
                  >
                    {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {s.is_active ? (
                    <span className="pill success">Hoạt động</span>
                  ) : (
                    <span className="pill danger">Đã khóa</span>
                  )}
                </td>
                <td>
                  <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "2px 8px" }}
                      onClick={() => resetPassword(s)}
                      disabled={update.isPending}
                    >
                      Đặt lại MK
                    </button>
                    {s.id !== user?.id ? (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "2px 8px", color: s.is_active ? "var(--color-danger)" : "inherit" }}
                        onClick={() => update.mutate({ id: s.id, body: { is_active: !s.is_active } })}
                        disabled={update.isPending}
                      >
                        {s.is_active ? "Khóa" : "Mở khóa"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}

function CreatePropertyCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Property>("/api/properties", {
        method: "POST",
        body: {
          name,
          code: code.toUpperCase(),
          address: address || undefined,
          phone: phone || undefined,
        },
      }),
    onSuccess: () => {
      setName("");
      setCode("");
      setAddress("");
      setPhone("");
      setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <h2 style={{ margin: "0 0 var(--space-3)", fontSize: 15 }}>+ Thêm cơ sở mới</h2>
      <form
        className="row"
        style={{ gap: 8, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name && code && !create.isPending) create.mutate();
        }}
      >
        <input className="input" style={{ flex: "1 1 160px" }} placeholder="Tên cơ sở (VD: Chi nhánh Đà Nẵng)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ width: 120 }} placeholder="Mã (DN01)" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} />
        <input className="input" style={{ flex: "1 1 180px" }} placeholder="Địa chỉ (tuỳ chọn)" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input className="input" style={{ width: 140 }} placeholder="SĐT (tuỳ chọn)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!name || !code || create.isPending}>
          {create.isPending ? "Đang tạo…" : "Tạo cơ sở"}
        </button>
      </form>
      {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}

function EditPropertyModal({
  property,
  onClose,
  onSaved,
}: {
  property: Property;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vatRate, setVatRate] = useState(String(property.vat_rate ?? 0));
  const [bankId, setBankId] = useState(property.bank_id ?? "");
  const [bankNo, setBankNo] = useState(property.bank_account_no ?? "");
  const [bankName, setBankName] = useState(property.bank_account_name ?? "");
  const [depositPct, setDepositPct] = useState(String(property.deposit_pct ?? 30));
  const [eiProvider, setEiProvider] = useState(property.einvoice_provider ?? "");
  const [eiTaxCode, setEiTaxCode] = useState(property.einvoice_tax_code ?? "");
  const [eiUser, setEiUser] = useState(property.einvoice_username ?? "");
  const [eiPass, setEiPass] = useState(property.einvoice_password ?? "");
  const [eiTemplate, setEiTemplate] = useState(property.einvoice_template ?? "");
  const [eiSerial, setEiSerial] = useState(property.einvoice_serial ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<Property>(`/api/properties/${property.id}`, {
        method: "PUT",
        body: {
          vat_rate: Number(vatRate) || 0,
          bank_id: bankId || null,
          bank_account_no: bankNo || null,
          bank_account_name: bankName || null,
          deposit_pct: Math.min(100, Number(depositPct) || 0),
          einvoice_provider: eiProvider || null,
          einvoice_tax_code: eiTaxCode || null,
          einvoice_username: eiUser || null,
          einvoice_password: eiPass || null,
          einvoice_template: eiTemplate || null,
          einvoice_serial: eiSerial || null,
        },
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

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
        zIndex: 70,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 420,
          maxWidth: "100%",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-5)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{property.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>VAT (%) — áp vào báo giá</span>
            <input className="input" inputMode="numeric" value={vatRate} onChange={(e) => setVatRate(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Mã ngân hàng VietQR (VD: VCB, TCB, MB)</span>
            <input className="input" value={bankId} onChange={(e) => setBankId(e.target.value.toUpperCase())} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Số tài khoản</span>
            <input className="input" inputMode="numeric" value={bankNo} onChange={(e) => setBankNo(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Tên chủ tài khoản (không dấu)</span>
            <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value.toUpperCase())} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Cọc đặt phòng online (%) — 0 = không thu cọc</span>
            <input className="input" inputMode="numeric" value={depositPct} onChange={(e) => setDepositPct(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>

          <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "var(--space-3)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              🧾 Hóa đơn điện tử (theo hợp đồng của cơ sở)
            </div>
            <div className="stack" style={{ gap: "var(--space-3)" }}>
              <label className="stack" style={{ gap: 4 }}>
                <span className="muted" style={{ fontSize: 12 }}>Nhà cung cấp</span>
                <select className="input" value={eiProvider} onChange={(e) => setEiProvider(e.target.value as typeof eiProvider)}>
                  <option value="">— Chưa dùng HĐĐT —</option>
                  <option value="viettel">Viettel SInvoice</option>
                  <option value="vnpt">VNPT Invoice</option>
                  <option value="misa">MISA meInvoice</option>
                </select>
              </label>
              {eiProvider ? (
                <>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Mã số thuế đơn vị</span>
                    <input className="input" value={eiTaxCode} onChange={(e) => setEiTaxCode(e.target.value.replace(/[^0-9-]/g, ""))} />
                  </label>
                  <div className="row" style={{ gap: 8 }}>
                    <label className="stack" style={{ gap: 4, flex: 1 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Tài khoản API</span>
                      <input className="input" value={eiUser} onChange={(e) => setEiUser(e.target.value)} />
                    </label>
                    <label className="stack" style={{ gap: 4, flex: 1 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Mật khẩu / khóa API</span>
                      <input className="input" type="password" value={eiPass} onChange={(e) => setEiPass(e.target.value)} />
                    </label>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <label className="stack" style={{ gap: 4, flex: 1 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Mẫu số (VD: 1/001)</span>
                      <input className="input" value={eiTemplate} onChange={(e) => setEiTemplate(e.target.value)} />
                    </label>
                    <label className="stack" style={{ gap: 4, flex: 1 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Ký hiệu (VD: C24TAA)</span>
                      <input className="input" value={eiSerial} onChange={(e) => setEiSerial(e.target.value.toUpperCase())} />
                    </label>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Thông số lưu theo từng cơ sở. Phát hành hóa đơn thật sẽ bật khi có hợp đồng
                    với nhà cung cấp (cần tài khoản thật để kiểm thử).
                  </div>
                </>
              ) : null}
            </div>
          </div>
          {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}
          <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateStaffCard({ properties }: { properties: Property[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("receptionist");
  const [propertyId, setPropertyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; email: string }>("/api/auth/staff", {
        method: "POST",
        body: {
          name,
          email,
          password,
          role,
          property_id: propertyId || undefined,
        },
      }),
    onSuccess: (data) => {
      setCreated(`Đã tạo tài khoản ${data.email}`);
      setName("");
      setEmail("");
      setPassword("");
      setError(null);
    },
    onError: (e) => {
      setCreated(null);
      setError(e instanceof Error ? e.message : "Lỗi");
    },
  });

  const canSubmit = !!name && !!email && password.length >= 8 && !create.isPending;

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <h2 style={{ margin: "0 0 var(--space-2)", fontSize: 15 }}>+ Tạo tài khoản nhân viên cho cơ sở</h2>
      <div className="muted" style={{ fontSize: 12, marginBottom: "var(--space-3)" }}>
        Nhân viên chỉ nhìn thấy dữ liệu của cơ sở được gán. Mật khẩu tối thiểu 8 ký tự.
      </div>
      <form
        className="row"
        style={{ gap: 8, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <input className="input" style={{ flex: "1 1 140px" }} placeholder="Họ tên" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ flex: "1 1 180px" }} type="email" placeholder="Email đăng nhập" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" style={{ width: 160 }} type="password" placeholder="Mật khẩu (≥8 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select className="input" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <select className="input" style={{ width: "auto" }} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Cơ sở của tôi</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {create.isPending ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
      </form>
      {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
      {created ? <div style={{ color: "var(--color-accent)", fontSize: 13, marginTop: 8 }}>{created}</div> : null}
    </div>
  );
}
