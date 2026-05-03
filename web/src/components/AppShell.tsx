import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const NAV_ITEMS = [
  { to: "/rooms", label: "Phòng", icon: "🏨" },
  { to: "/reservations", label: "Đặt phòng", icon: "📅" },
  { to: "/guests", label: "Khách hàng", icon: "👥" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        <div
          style={{
            padding: "0 var(--space-3) var(--space-4)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Hotel CRM
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
    </div>
  );
}
