import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import type { AiApiKey, AiScope } from "../lib/types";

const SCOPE_LABEL: Record<AiScope, string> = {
  read: "Tra cứu phòng trống, báo giá, xem đặt phòng",
  book: "Đặt phòng và hủy phòng",
};

export function AiIntegration() {
  const qc = useQueryClient();
  const [freshKey, setFreshKey] = useState<AiApiKey | null>(null);

  const list = useQuery({
    queryKey: ["ai-keys"],
    queryFn: () => apiFetch<AiApiKey[]>("/api/ai-integrations"),
  });

  const rows = list.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Tích hợp AI</h1>
        <div className="muted">
          Cấp API key để trợ lý AI (chatbot Zalo/Facebook, tổng đài AI) tra phòng trống và đặt
          phòng trực tiếp vào cơ sở này
        </div>
      </div>

      {freshKey?.key ? (
        <NewKeyBanner apiKey={freshKey} onDismiss={() => setFreshKey(null)} />
      ) : null}

      <CreateKeyCard
        onCreated={(created) => {
          setFreshKey(created);
          qc.invalidateQueries({ queryKey: ["ai-keys"] });
        }}
      />

      {list.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          <div className="muted">Chưa có API key nào. Tạo key đầu tiên ở trên.</div>
        </div>
      ) : (
        <KeyTable rows={rows} onChanged={() => qc.invalidateQueries({ queryKey: ["ai-keys"] })} />
      )}

      <UsageCard />
    </div>
  );
}

function NewKeyBanner({ apiKey, onDismiss }: { apiKey: AiApiKey; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!apiKey.key) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-5)",
        borderLeft: "3px solid var(--color-accent)",
        background: "var(--color-accent-soft)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>Đã tạo key “{apiKey.name}”</strong>
        <button className="btn btn-ghost" onClick={onDismiss}>
          ✕
        </button>
      </div>
      <p style={{ margin: "var(--space-2) 0", fontSize: 13 }}>
        Chuỗi dưới đây <strong>chỉ hiện đúng một lần</strong>. Sao chép và lưu vào cấu hình của bot
        ngay; nếu mất thì phải tạo key mới.
      </p>
      <div className="row" style={{ gap: "var(--space-2)" }}>
        <code
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {apiKey.key}
        </code>
        <button className="btn btn-primary" onClick={copy}>
          {copied ? "✓ Đã chép" : "Sao chép"}
        </button>
      </div>
    </div>
  );
}

function CreateKeyCard({ onCreated }: { onCreated: (created: AiApiKey) => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AiScope[]>(["read", "book"]);
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<AiApiKey>("/api/ai-integrations", {
        method: "POST",
        body: { name, scopes, expires_on: expiresOn || null },
      }),
    onSuccess: (created) => {
      setName("");
      setExpiresOn("");
      setError(null);
      onCreated(created);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Không tạo được key"),
  });

  function toggle(scope: AiScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  }

  return (
    <div className="card" style={{ padding: "var(--space-5)" }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Tạo API key mới</h2>
      <form
        className="stack"
        style={{ gap: "var(--space-3)", marginTop: "var(--space-3)" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!create.isPending && name.trim() && scopes.length > 0) create.mutate();
        }}
      >
        <div className="row" style={{ gap: "var(--space-3)", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: "2 1 260px" }}
            placeholder="Tên key, ví dụ: Bot Zalo lễ tân"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="stack" style={{ gap: 2, flex: "1 1 180px" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Ngày hết hạn (để trống = không hết hạn)
            </span>
            <input
              className="input"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </label>
        </div>

        <div className="stack" style={{ gap: "var(--space-2)" }}>
          {(Object.keys(SCOPE_LABEL) as AiScope[]).map((scope) => (
            <label key={scope} className="row" style={{ gap: "var(--space-2)", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggle(scope)}
              />
              <code style={{ fontFamily: "ui-monospace, monospace" }}>{scope}</code>
              <span className="muted">— {SCOPE_LABEL[scope]}</span>
            </label>
          ))}
        </div>

        {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}

        <div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={create.isPending || !name.trim() || scopes.length === 0}
          >
            {create.isPending ? "Đang tạo…" : "Tạo key"}
          </button>
        </div>
      </form>
    </div>
  );
}

function KeyTable({ rows, onChanged }: { rows: AiApiKey[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) =>
      apiFetch(`/api/ai-integrations/${input.id}`, {
        method: "PUT",
        body: { is_active: input.is_active },
      }),
    onSuccess: onChanged,
    onError: (e) => setError(e instanceof Error ? e.message : "Không cập nhật được"),
  });

  const expired = (row: AiApiKey) =>
    row.expires_at !== null && new Date(row.expires_at).getTime() < Date.now();

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {error ? (
        <div style={{ color: "var(--color-danger)", fontSize: 13, padding: "var(--space-3)" }}>
          {error}
        </div>
      ) : null}
      <table className="table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Key</th>
            <th>Quyền</th>
            <th>Dùng gần nhất</th>
            <th>Hết hạn</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ fontWeight: 600 }}>{row.name}</td>
              <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                {row.key_prefix}…
              </td>
              <td style={{ fontSize: 12 }}>{row.scopes.join(", ")}</td>
              <td style={{ fontSize: 12 }}>{formatDateTime(row.last_used_at)}</td>
              <td style={{ fontSize: 12 }}>{formatDate(row.expires_at)}</td>
              <td>
                {expired(row) ? (
                  <span className="pill neutral">Hết hạn</span>
                ) : row.is_active ? (
                  <span className="pill success">Hoạt động</span>
                ) : (
                  <span className="pill neutral">Đã khóa</span>
                )}
              </td>
              <td style={{ width: 1 }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "2px 8px" }}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: row.id, is_active: !row.is_active })}
                >
                  {row.is_active ? "Khóa" : "Mở lại"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageCard() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="card" style={{ padding: "var(--space-5)" }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Cách dùng</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
        Gửi key qua header <code>X-API-Key</code>. Mọi giá và tồn phòng đều được máy chủ tính lại,
        nên AI không thể tự bịa giá.
      </p>
      <pre
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          fontSize: 12,
          overflowX: "auto",
        }}
      >
        {`# Phòng trống + giá
curl -H "X-API-Key: hk_..." \\
  "${origin}/api/ai/availability?check_in=2026-09-10&check_out=2026-09-12"

# Đặt phòng
curl -X POST -H "X-API-Key: hk_..." -H "Content-Type: application/json" \\
  -d '{"room_type_code":"STD","check_in":"2026-09-10","check_out":"2026-09-12",
       "guest_name":"Nguyễn Văn A","guest_phone":"0905111222","source":"zalo"}' \\
  "${origin}/api/ai/bookings"`}
      </pre>
      <div className="row" style={{ gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <a className="btn btn-ghost" href="/api/ai/tools.json" target="_blank" rel="noreferrer">
          Tool manifest cho function-calling
        </a>
        <a className="btn btn-ghost" href="/api/ai/openapi.json" target="_blank" rel="noreferrer">
          OpenAPI 3.1
        </a>
      </div>
    </div>
  );
}
