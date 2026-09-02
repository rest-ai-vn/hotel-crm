import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiHttpError } from "../lib/api";
import hotelArt from "../assets/login-hotel.svg";

// Auth screen styled after hotel-bot-template (dh-donga style):
// split brand panel + glass form over pastel blobs.
const LOGIN_CSS = `
.auth-split { display: flex; min-height: 100dvh; width: 100%; }
.auth-brand {
  position: relative; width: 52%; overflow: hidden; display: none;
  background: linear-gradient(150deg, #ee6a1a 0%, #b9551a 46%, #7a2f04 100%);
}
@media (min-width: 1024px) { .auth-brand { display: block; } }
.auth-brand::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(120% 80% at 18% 0%, rgba(255,255,255,0.20), transparent 58%);
}
.auth-brand-inner {
  position: relative; z-index: 1; height: 100%;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 44px; color: #fff;
}
.auth-brand-logo { display: flex; align-items: center; gap: 12px; }
.auth-logo-chip {
  height: 44px; width: 44px; border-radius: 12px; font-size: 22px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.15); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
}
.auth-brand-name { font-size: 0.9rem; font-weight: 600; line-height: 1.15; margin: 0; }
.auth-brand-sub { font-size: 0.75rem; color: rgba(255,255,255,0.82); margin: 0; }
.auth-badge {
  display: inline-flex; align-items: center; gap: 7px; margin-bottom: 14px;
  border-radius: 999px; padding: 5px 12px; font-size: 0.72rem; font-weight: 500;
  background: rgba(255,255,255,0.15); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
}
.auth-brand-copy { max-width: 26rem; }
.auth-brand-copy h2 {
  font-size: 1.9rem; font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; color: #fff; margin: 0;
}
.auth-brand-copy .auth-lead { margin-top: 12px; font-size: 0.9rem; line-height: 1.6; color: rgba(255,255,255,0.85); }
.auth-brand-art {
  display: flex; align-items: center; justify-content: center;
  padding: 12px 0; min-height: 0;
}
.auth-brand-art img {
  width: 100%; max-width: 30rem; height: auto;
  filter: drop-shadow(0 18px 30px rgba(0,0,0,0.25));
}
.auth-form-panel {
  position: relative; flex: 1; display: flex; align-items: center; justify-content: center;
  overflow: hidden; padding: 40px 20px;
  background: linear-gradient(135deg, #fff7ed 0%, #ffffff 52%, #f0f9ff 100%);
}
.auth-blob { position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none; }
.auth-blob.b1 { left: -96px; top: -96px; height: 18rem; width: 18rem; background: rgba(254,215,170,0.5); }
.auth-blob.b2 { right: -80px; bottom: -112px; height: 20rem; width: 20rem; background: rgba(186,230,253,0.5); }
.auth-blob.b3 { left: 40px; bottom: 40px; height: 10rem; width: 10rem; background: rgba(254,205,211,0.4); }
.auth-form-inner { position: relative; z-index: 1; width: 100%; max-width: 22rem; }
.auth-crown { text-align: center; margin-bottom: 22px; }
.auth-crown-chip {
  display: inline-flex; height: 56px; width: 56px; align-items: center; justify-content: center;
  border-radius: 16px; margin-bottom: 12px; font-size: 28px; color: #fff;
  background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
  box-shadow: 0 10px 15px -3px rgba(234,88,12,0.30);
}
.auth-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; color: #0f172a; margin: 0; }
.auth-subtitle { font-size: 0.875rem; color: #64748b; margin: 4px 0 0; }
.auth-glass {
  border-radius: 16px; padding: 24px;
  background: rgba(255,255,255,0.82); border: 1px solid rgba(255,255,255,0.7);
  box-shadow: 0 20px 25px -5px rgba(15,23,42,0.06); backdrop-filter: blur(6px);
}
.auth-label { display: block; font-size: 0.8rem; font-weight: 500; color: #334155; margin-bottom: 6px; }
.auth-field { margin-bottom: 14px; }
.auth-input-wrap { position: relative; }
.auth-input {
  width: 100%; padding: 11px 44px 11px 14px; border: 1px solid #e2e8f0;
  border-radius: 12px; font-size: 0.9rem; color: #0f172a; background: #fff;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.auth-input::placeholder { color: #94a3b8; }
.auth-input:focus { border-color: #fb923c; box-shadow: 0 0 0 3px rgba(251,146,60,0.35); }
.auth-eye {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: flex; padding: 7px; border: none; background: transparent; cursor: pointer;
  color: #94a3b8; border-radius: 9px; transition: background 0.15s, color 0.15s;
}
.auth-eye:hover { background: #f1f5f9; color: #475569; }
.btn-auth {
  width: 100%; margin-top: 18px; padding: 11px; border: none; border-radius: 12px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 0.9rem; font-weight: 600; color: #fff; cursor: pointer;
  background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
  box-shadow: 0 4px 6px -1px rgba(234,88,12,0.25); transition: filter 0.15s, transform 0.05s;
}
.btn-auth:hover { filter: brightness(1.05); }
.btn-auth:active { transform: scale(0.99); }
.btn-auth:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-error {
  color: #e11d48; font-size: 0.82rem; margin-bottom: 14px;
  border-radius: 10px; border: 1px solid #fecdd3; background: #fff1f2; padding: 8px 12px;
}
.auth-support {
  margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 0.72rem; color: #94a3b8;
}
`;

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="auth-split">
      <style>{LOGIN_CSS}</style>

      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-logo">
            <div className="auth-logo-chip">🏨</div>
            <div>
              <p className="auth-brand-name">Hotel PMS</p>
              <p className="auth-brand-sub">Quản lý khách sạn</p>
            </div>
          </div>
          <div className="auth-brand-art">
            <img src={hotelArt} alt="" />
          </div>
          <div className="auth-brand-copy">
            <span className="auth-badge">✨ Hệ thống quản trị khách sạn</span>
            <h2>Đặt phòng, buồng phòng &amp; doanh thu tại một nơi</h2>
            <p className="auth-lead">
              Sơ đồ phòng thời gian thực, giao ca — chốt ngày, báo cáo công suất ADR/RevPAR và
              khai báo lưu trú cho lễ tân lẫn quản lý.
            </p>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-blob b1" />
        <div className="auth-blob b2" />
        <div className="auth-blob b3" />

        <div className="auth-form-inner">
          <div className="auth-crown">
            <div className="auth-crown-chip">🏨</div>
            <h1 className="auth-title">Đăng nhập</h1>
            <p className="auth-subtitle">Cổng quản trị · Hotel PMS</p>
          </div>

          <div className="auth-glass">
            <form onSubmit={onSubmit}>
              {error ? <p className="auth-error">{error}</p> : null}

              <div className="auth-field">
                <label className="auth-label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className="auth-input"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="ban@khachsan.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="login-password">Mật khẩu</label>
                <div className="auth-input-wrap">
                  <input
                    id="login-password"
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </div>

              <button className="btn-auth" type="submit" disabled={busy}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {busy ? "Đang đăng nhập…" : "Đăng nhập"}
              </button>
            </form>
          </div>

          <p className="auth-support">🔒 Chỉ dành cho nhân viên được cấp tài khoản</p>
        </div>
      </div>
    </div>
  );
}
