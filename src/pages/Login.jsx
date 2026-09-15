import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          min-height: 100%;
        }

        body {
          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            Arial,
            sans-serif;
        }

        button,
        input {
          font-family: inherit;
        }

        /* =========================
           PAGE
        ========================= */

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 35px;
          position: relative;
          overflow: hidden;

          background:
            radial-gradient(
              circle at 10% 10%,
              rgba(16, 185, 129, 0.16),
              transparent 30%
            ),
            radial-gradient(
              circle at 90% 90%,
              rgba(34, 197, 94, 0.12),
              transparent 28%
            ),
            linear-gradient(
              135deg,
              #f0fdf4 0%,
              #ecfdf5 45%,
              #f8fafc 100%
            );
        }

        /* =========================
           BACKGROUND
        ========================= */

        .bg-circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(1px);
        }

        .circle-1 {
          width: 480px;
          height: 480px;
          top: -280px;
          right: -170px;
          border: 1px solid rgba(16, 185, 129, 0.12);
          background: rgba(167, 243, 208, 0.22);
        }

        .circle-2 {
          width: 400px;
          height: 400px;
          bottom: -240px;
          left: -170px;
          border: 1px solid rgba(16, 185, 129, 0.10);
          background: rgba(209, 250, 229, 0.28);
        }

        .bg-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.35;

          background-image:
            linear-gradient(
              rgba(16, 185, 129, 0.04) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(16, 185, 129, 0.04) 1px,
              transparent 1px
            );

          background-size: 45px 45px;
        }

        /* =========================
           MAIN CARD
        ========================= */

        .login-container {
          width: 100%;
          max-width: 1050px;
          min-height: 630px;

          display: grid;
          grid-template-columns: 46% 54%;

          position: relative;
          z-index: 2;

          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.9);

          border-radius: 30px;
          overflow: hidden;

          box-shadow:
            0 35px 90px rgba(15, 23, 42, 0.12),
            0 10px 35px rgba(16, 185, 129, 0.08);
        }

        /* =========================
           LEFT SIDE
        ========================= */

        .login-banner {
          position: relative;
          display: flex;
          align-items: center;

          padding: 65px 55px;

          color: white;

          background:
            radial-gradient(
              circle at 90% 15%,
              rgba(255,255,255,0.18),
              transparent 25%
            ),
            linear-gradient(
              145deg,
              #047857 0%,
              #059669 42%,
              #10b981 72%,
              #34d399 100%
            );

          overflow: hidden;
        }

        .banner-decoration {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.13);
          pointer-events: none;
        }

        .decoration-1 {
          width: 310px;
          height: 310px;
          right: -155px;
          top: -80px;
        }

        .decoration-2 {
          width: 220px;
          height: 220px;
          left: -130px;
          bottom: -90px;
        }

        .decoration-3 {
          width: 100px;
          height: 100px;
          right: 45px;
          bottom: 45px;
          background: rgba(255,255,255,0.04);
        }

        .banner-content {
          position: relative;
          z-index: 2;
          width: 100%;
        }

        .brand-icon {
          width: 76px;
          height: 76px;

          display: flex;
          align-items: center;
          justify-content: center;

          margin-bottom: 27px;

          border-radius: 22px;

          background: rgba(255,255,255,0.16);
          border: 1px solid rgba(255,255,255,0.20);

          box-shadow:
            0 15px 35px rgba(0,0,0,0.10);

          font-size: 36px;

          backdrop-filter: blur(10px);
        }

        .brand-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;

          margin-bottom: 15px;
          padding: 7px 12px;

          border-radius: 999px;

          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.15);

          color: rgba(255,255,255,0.92);

          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
        }

        .brand-label-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #bbf7d0;
          box-shadow: 0 0 8px #bbf7d0;
        }

        .login-banner h1 {
          margin: 0 0 14px;

          font-size: 48px;
          line-height: 1;

          font-weight: 900;
          letter-spacing: -1.5px;
        }

        .banner-description {
          margin: 0 0 38px;

          color: rgba(255,255,255,0.88);

          font-size: 16px;
          line-height: 1.85;
        }

        .banner-features {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .banner-feature {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .feature-icon {
          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          flex-shrink: 0;

          border-radius: 9px;

          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.12);

          font-size: 13px;
        }

        .banner-feature p {
          margin: 0;

          color: rgba(255,255,255,0.92);

          font-size: 13px;
          font-weight: 500;
        }

        .ai-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;

          margin-top: 40px;
          padding: 9px 13px;

          border-radius: 10px;

          background: rgba(0,0,0,0.10);
          border: 1px solid rgba(255,255,255,0.12);

          font-size: 11px;
          color: rgba(255,255,255,0.82);
        }

        /* =========================
           RIGHT LOGIN
        ========================= */

        .login-card {
          display: flex;
          flex-direction: column;
          justify-content: center;

          padding: 60px 75px;

          background: rgba(255,255,255,0.97);
        }

        .login-header {
          margin-bottom: 32px;
        }

        .mobile-logo {
          display: none;
        }

        .welcome-small {
          margin-bottom: 8px;

          color: #10b981;

          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .login-header h2 {
          margin: 0 0 9px;

          color: #111827;

          font-size: 31px;
          line-height: 1.25;
          font-weight: 800;

          letter-spacing: -0.6px;
        }

        .login-header p {
          margin: 0;

          color: #6b7280;

          font-size: 14px;
          line-height: 1.7;
        }

        /* =========================
           FORM
        ========================= */

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;

          margin-bottom: 8px;

          color: #374151;

          font-size: 13px;
          font-weight: 700;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;

          display: flex;
          align-items: center;
          justify-content: center;

          width: 20px;

          color: #9ca3af;

          font-size: 16px;

          pointer-events: none;
          z-index: 1;
        }

        .input-wrapper input {
          width: 100%;
          height: 54px;

          padding: 0 48px;

          border: 1.5px solid #e5e7eb;
          border-radius: 13px;

          outline: none;

          background: #f9fafb;
          color: #111827;

          font-size: 14px;

          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .input-wrapper input:hover {
          border-color: #d1d5db;
        }

        .input-wrapper input:focus {
          border-color: #10b981;
          background: #ffffff;

          box-shadow:
            0 0 0 4px rgba(16,185,129,0.09);
        }

        .input-wrapper input::placeholder {
          color: #a1a1aa;
        }

        .password-toggle {
          position: absolute;
          right: 11px;

          width: 36px;
          height: 36px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: none;
          border-radius: 9px;

          background: transparent;

          cursor: pointer;

          font-size: 15px;

          opacity: 0.65;

          transition: all 0.2s ease;
        }

        .password-toggle:hover {
          opacity: 1;
          background: #f3f4f6;
        }

        /* =========================
           ERROR
        ========================= */

        .error-message {
          display: flex;
          align-items: flex-start;
          gap: 9px;

          margin: 2px 0 18px;
          padding: 12px 14px;

          border: 1px solid #fecaca;
          border-radius: 11px;

          background: #fef2f2;

          color: #dc2626;

          font-size: 12px;
          line-height: 1.6;
        }

        .error-icon {
          flex-shrink: 0;
        }

        /* =========================
           LOGIN BUTTON
        ========================= */

        .login-button {
          width: 100%;
          height: 54px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          border: none;
          border-radius: 13px;

          background:
            linear-gradient(
              135deg,
              #047857,
              #059669 50%,
              #10b981
            );

          color: white;

          font-size: 14px;
          font-weight: 800;

          cursor: pointer;

          box-shadow:
            0 9px 22px rgba(5,150,105,0.22);

          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);

          box-shadow:
            0 13px 28px rgba(5,150,105,0.28);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .arrow {
          font-size: 19px;
          transition: transform 0.2s ease;
        }

        .login-button:hover .arrow {
          transform: translateX(3px);
        }

        /* =========================
           LOADING
        ========================= */

        .spinner {
          width: 17px;
          height: 17px;

          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;

          border-radius: 50%;

          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* =========================
           DIVIDER
        ========================= */

        .divider {
          display: flex;
          align-items: center;
          gap: 13px;

          margin: 25px 0;

          color: #a1a1aa;

          font-size: 11px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        /* =========================
           REGISTER
        ========================= */

        .register-text {
          margin: 0;

          text-align: center;

          color: #6b7280;

          font-size: 13px;
        }

        .register-text a {
          margin-left: 5px;

          color: #059669;

          font-weight: 800;

          text-decoration: none;

          transition: color 0.2s ease;
        }

        .register-text a:hover {
          color: #047857;
          text-decoration: underline;
        }

        /* =========================
           FOOTER
        ========================= */

        .login-footer {
          margin: 35px 0 0;

          text-align: center;

          color: #c4c7cc;

          font-size: 10px;
        }

        /* =========================
           RESPONSIVE
        ========================= */

        @media (max-width: 850px) {
          .login-page {
            padding: 20px;
          }

          .login-container {
            max-width: 520px;
            min-height: auto;
            grid-template-columns: 1fr;
            border-radius: 25px;
          }

          .login-banner {
            display: none;
          }

          .login-card {
            padding: 50px 45px;
          }

          .mobile-logo {
            width: 58px;
            height: 58px;

            display: flex;
            align-items: center;
            justify-content: center;

            margin-bottom: 20px;

            border-radius: 17px;

            background:
              linear-gradient(
                135deg,
                #ecfdf5,
                #d1fae5
              );

            border: 1px solid #bbf7d0;

            font-size: 27px;
          }

          .welcome-small {
            margin-bottom: 7px;
          }

          .login-header h2 {
            font-size: 28px;
          }
        }

        @media (max-width: 480px) {
          .login-page {
            padding: 14px;
          }

          .login-container {
            border-radius: 21px;
          }

          .login-card {
            padding: 38px 24px;
          }

          .login-header {
            margin-bottom: 27px;
          }

          .login-header h2 {
            font-size: 25px;
          }

          .login-header p {
            font-size: 13px;
          }

          .input-wrapper input {
            height: 51px;
          }

          .login-button {
            height: 51px;
          }

          .login-footer {
            margin-top: 28px;
          }
        }
      `}</style>

      <div className="login-page">

        {/* Background */}
        <div className="bg-grid"></div>
        <div className="bg-circle circle-1"></div>
        <div className="bg-circle circle-2"></div>

        {/* Main */}
        <div className="login-container">

          {/* =========================
              LEFT
          ========================= */}

          <div className="login-banner">

            <div className="banner-decoration decoration-1"></div>
            <div className="banner-decoration decoration-2"></div>
            <div className="banner-decoration decoration-3"></div>

            <div className="banner-content">

              <div className="brand-icon">
                🏃‍♀️
              </div>

              <div className="brand-label">
                <span className="brand-label-dot"></span>
                AI EXERCISE TRACKING
              </div>

              <h1>FitTrack</h1>

              <p className="banner-description">
                ระบบติดตามและวางแผน
                <br />
                การออกกำลังกายอัจฉริยะ
              </p>

              <div className="banner-features">

                <div className="banner-feature">
                  <span className="feature-icon">
                    ✓
                  </span>
                  <p>
                    ตรวจจับท่าทางด้วย AI
                  </p>
                </div>

                <div className="banner-feature">
                  <span className="feature-icon">
                    ✓
                  </span>
                  <p>
                    นับจำนวนครั้งแบบอัตโนมัติ
                  </p>
                </div>

                <div className="banner-feature">
                  <span className="feature-icon">
                    ✓
                  </span>
                  <p>
                    บันทึกและติดตามผลการออกกำลังกาย
                  </p>
                </div>

              </div>

              <div className="ai-badge">
                🤖
                ระบบอัจฉริยะสำหรับการออกกำลังกาย
              </div>

            </div>
          </div>

          {/* =========================
              RIGHT
          ========================= */}

          <div className="login-card">

            <div className="login-header">

              <div className="mobile-logo">
                🏃‍♀️
              </div>

              <div className="welcome-small">
                WELCOME BACK
              </div>

              <h2>
                ยินดีต้อนรับกลับ
              </h2>

              <p>
                เข้าสู่ระบบเพื่อเริ่มต้นดูแลสุขภาพ
                และติดตามการออกกำลังกายของคุณ
              </p>

            </div>

            <form onSubmit={handleLogin}>

              {/* Email */}
              <div className="form-group">

                <label htmlFor="email">
                  อีเมล
                </label>

                <div className="input-wrapper">

                  <span className="input-icon">
                    ✉
                  </span>

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    placeholder="กรอกอีเมลของคุณ"
                    autoComplete="email"
                    required
                  />

                </div>
              </div>

              {/* Password */}
              <div className="form-group">

                <label htmlFor="password">
                  รหัสผ่าน
                </label>

                <div className="input-wrapper">

                  <span className="input-icon">
                    🔒
                  </span>

                  <input
                    id="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="กรอกรหัสผ่านของคุณ"
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    aria-label={
                      showPassword
                        ? 'ซ่อนรหัสผ่าน'
                        : 'แสดงรหัสผ่าน'
                    }
                  >
                    {showPassword
                      ? '🙈'
                      : '👁️'}
                  </button>

                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="error-message">
                  <span className="error-icon">
                    ⚠️
                  </span>

                  <span>
                    {error}
                  </span>
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >

                {loading ? (
                  <>
                    <span className="spinner"></span>
                    กำลังเข้าสู่ระบบ...
                  </>
                ) : (
                  <>
                    เข้าสู่ระบบ
                    <span className="arrow">
                      →
                    </span>
                  </>
                )}

              </button>

            </form>

            {/* Divider */}
            <div className="divider">
              <span>หรือ</span>
            </div>

            {/* Register */}
            <p className="register-text">
              ยังไม่มีบัญชี?
              <Link to="/register">
                สมัครสมาชิก
              </Link>
            </p>

            {/* Footer */}
            <p className="login-footer">
              © 2026 FitTrack · AI Exercise Tracking
            </p>

          </div>

        </div>
      </div>
    </>
  );
}