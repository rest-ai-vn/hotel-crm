import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiHttpError } from "../lib/api";

export function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to="/rooms" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: { pathname: string } } | null)?.from;
      navigate(from?.pathname ?? "/rooms", { replace: true });
    } catch (err) {
      const msg = err instanceof ApiHttpError ? err.message : "Đăng nhập thất bại";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        padding: "var(--space-5)",
        background:
          "radial-gradient(circle at 20% 0%, var(--color-accent-soft) 0%, transparent 40%), var(--color-bg)",
      }}
    >
      <div className="card" style={{ padding: "var(--space-6)", width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: "var(--space-5)" }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Hotel CRM
          </div>
          <div className="muted">Đăng nhập để tiếp tục</div>
        </div>
        <form onSubmit={onSubmit} className="stack">
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-soft)" }}>
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-soft)" }}>
              Mật khẩu
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                background: "oklch(95% 0.05 25)",
                color: "var(--color-danger)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={{ justifyContent: "center" }}
          >
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
