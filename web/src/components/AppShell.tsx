import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth-context";
import { apiFetch, setToken } from "../lib/api";
import type { Property } from "../lib/types";
import { getAdminLang, initAdminTranslation, setAdminLang } from "../lib/translate";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  roles?: Array<"admin" | "manager" | "receptionist" | "housekeeping">;
};

// Icon nét theo đúng phong cách dashboard bot-template: SVG nội tuyến,
// stroke currentColor 1.9, bo tròn đầu nét — không nạp thư viện icon nào.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

// Nhật ký hoạt động (/audit-logs) cố ý KHÔNG có trong menu — route và API vẫn
// chạy, vào được bằng cách gõ thẳng địa chỉ. Ghi nhật ký ở máy chủ không đổi.
const NAV_ITEMS: NavItem[] = [
  {
    to: "/",
    label: "Tổng quan",
    end: true,
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </Icon>
    ),
  },
  {
    to: "/calendar",
    label: "Lịch",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </Icon>
    ),
  },
  {
    to: "/rooms",
    label: "Phòng",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <path d="M2 4v16" />
        <path d="M2 8h18a2 2 0 0 1 2 2v10" />
        <path d="M2 17h20" />
        <path d="M6 8v9" />
      </Icon>
    ),
  },
  {
    to: "/reservations",
    label: "Đặt phòng",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 15 11 17 15 13" />
      </Icon>
    ),
  },
  {
    to: "/guests",
    label: "Khách hàng",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </Icon>
    ),
  },
  {
    to: "/housekeeping",
    label: "Buồng phòng",
    icon: (
      <Icon>
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      </Icon>
    ),
  },
  {
    to: "/services",
    label: "Dịch vụ",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </Icon>
    ),
  },
  {
    to: "/cashbook",
    label: "Thu chi",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </Icon>
    ),
  },
  {
    to: "/shifts",
    label: "Giao ca",
    roles: ["admin", "manager", "receptionist"],
    icon: (
      <Icon>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </Icon>
    ),
  },
  {
    to: "/night-audit",
    label: "Chốt ngày",
    roles: ["admin", "manager"],
    icon: (
      <Icon>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </Icon>
    ),
  },
  {
    to: "/reports",
    label: "Báo cáo",
    roles: ["admin", "manager"],
    icon: (
      <Icon>
        <line x1="6" y1="20" x2="6" y2="15" />
        <line x1="12" y1="20" x2="12" y2="9" />
        <line x1="18" y1="20" x2="18" y2="4" />
      </Icon>
    ),
  },
  {
    to: "/rate-plans",
    label: "Bảng giá",
    roles: ["admin", "manager"],
    icon: (
      <Icon>
        <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
        <circle cx="7.5" cy="7.5" r="1" />
      </Icon>
    ),
  },
  {
    to: "/ai-integration",
    label: "Tích hợp AI",
    roles: ["admin", "manager"],
    icon: (
      <Icon>
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
      </Icon>
    ),
  },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    initAdminTranslation();
  }, []);

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
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>Hotel PMS</div>
          <PropertyBadge />
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
              {item.icon}
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
            onClick={() => setAdminLang(getAdminLang() === "en" ? "vi" : "en")}
            style={{ width: "100%", justifyContent: "flex-start" }}
            title="Switch language / Đổi ngôn ngữ"
          >
            <Icon>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </Icon>
            <span style={{ marginLeft: 8 }}>
              {getAdminLang() === "en" ? "Tiếng Việt" : "English"}
            </span>
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowPassword(true)}
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
            <Icon>
              <circle cx="7.5" cy="15.5" r="4.5" />
              <path d="m10.7 12.3 8.6-8.6" />
              <path d="m17 6 2 2" />
            </Icon>
            <span style={{ marginLeft: 8 }}>Đổi mật khẩu</span>
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
    </div>
  );
}

function PropertyBadge() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const properties = useQuery({
    queryKey: ["properties"],
    queryFn: () => apiFetch<Property[]>("/api/properties"),
    enabled: isAdmin,
  });

  async function switchTo(propertyId: string) {
    if (!propertyId || propertyId === user?.property_id) return;
    const data = await apiFetch<{ token: string }>("/api/auth/switch-property", {
      method: "POST",
      body: { property_id: propertyId },
    });
    setToken(data.token);
    window.location.reload();
  }

  if (!user?.property_name) return null;
  const list = (properties.data ?? []).filter((p) => p.is_active);

  if (!isAdmin || list.length <= 1) {
    return (
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {user.property_name}
      </div>
    );
  }

  return (
    <select
      className="input"
      style={{ marginTop: 4, height: 30, fontSize: 12, width: "100%" }}
      value={user.property_id ?? ""}
      onChange={(e) => switchTo(e.target.value)}
      title="Chuyển cơ sở đang thao tác"
    >
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
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
