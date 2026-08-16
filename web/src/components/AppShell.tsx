import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api";
import { ChatWidget } from "./ChatWidget";

type NavItem = {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  roles?: Array<"admin" | "manager" | "receptionist" | "housekeeping">;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tổng quan", icon: "📊", end: true, roles: ["admin", "manager", "receptionist"] },
  { to: "/calendar", label: "Lịch", icon: "🗓️", roles: ["admin", "manager", "receptionist"] },
  { to: "/rooms", label: "Phòng", icon: "🏨", roles: ["admin", "manager", "receptionist"] },
  { to: "/reservations", label: "Đặt phòng", icon: "📅", roles: ["admin", "manager", "receptionist"] },
  { to: "/guests", label: "Khách hàng", icon: "👥", roles: ["admin", "manager", "receptionist"] },
  { to: "/housekeeping", label: "Buồng phòng", icon: "🧹" },
  { to: "/services", label: "Dịch vụ", icon: "🛎️", roles: ["admin", "manager", "receptionist"] },
  { to: "/cashbook", label: "Thu chi", icon: "💵", roles: ["admin", "manager", "receptionist"] },
  { to: "/shifts", label: "Giao ca", icon: "🔁", roles: ["admin", "manager", "receptionist"] },
  { to: "/night-audit", label: "Chốt ngày", icon: "🌙", roles: ["admin", "manager"] },
  { to: "/reports", label: "Báo cáo", icon: "📈", roles: ["admin", "manager"] },
  { to: "/rate-plans", label: "Bảng giá", icon: "💰", roles: ["admin", "manager"] },
  { to: "/audit-logs", label: "Nhật ký", icon: "📜", roles: ["admin", "manager"] },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100vh" }}>
      <aside
        style={{
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-5) var(--space-3)",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ padding: "0 var(--space-3) var(--space-4)" }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>Hotel CRM</div>
          {user?.property_name ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              🏢 {user.property_name}
            </div>
          ) : null}
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.filter(
            (item) => !item.roles || item.roles.includes(user?.role as never),
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                color: isActive ? "var(--color-accent)" : "var(--color-text)",
                background: isActive ? "var(--color-accent-soft)" : "transparent",
                fontWeight: isActive ? 600 : 500,
                textDecoration: "none",
              })}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid var(--color-border)",
            paddingTop: "var(--space-3)",
          }}
        >
          <div style={{ padding: "0 var(--space-2)", marginBottom: "var(--space-2)" }}>
            <div style={{ fontWeight: 500 }}>{user?.name ?? ""}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user?.email} · {user?.role}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setShowPassword(true)}
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
            🔑 Đổi mật khẩu
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleLogout}
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main style={{ overflow: "auto", padding: "var(--space-6)" }}>
        <Outlet />
      </main>
      {showPassword ? <ChangePasswordModal onClose={() => setShowPassword(false)} /> : null}
      <ChatWidget />
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (next !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi đổi mật khẩu");
    } finally {
      setBusy(false);
    }
  }

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
        zIndex: 80,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 380,
          maxWidth: "100%",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-5)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Đổi mật khẩu</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div style={{ color: "var(--color-accent)", fontSize: 14 }}>✓ Đã đổi mật khẩu</div>
        ) : (
          <form
            className="stack"
            style={{ gap: "var(--space-3)" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) submit();
            }}
          >
            <input
              className="input"
              type="password"
              placeholder="Mật khẩu hiện tại"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Mật khẩu mới (≥8 ký tự)"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !current || next.length < 8 || !confirm}
            >
              {busy ? "Đang đổi…" : "Đổi mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
