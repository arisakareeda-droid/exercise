import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      navigate("/dashboard");
    } catch (err) {
      console.error(err);

      switch (err.code) {
        case "auth/invalid-email":
          setError("รูปแบบอีเมลไม่ถูกต้อง");
          break;

        case "auth/user-not-found":
        case "auth/invalid-credential":
          setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
          break;

        case "auth/wrong-password":
          setError("รหัสผ่านไม่ถูกต้อง");
          break;

        case "auth/too-many-requests":
          setError("มีการเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ภายหลัง");
          break;

        case "auth/network-request-failed":
          setError("ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้");
          break;

        default:
          setError("ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="login-page">

        {/* Background Decoration */}
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>

        <div className="login-container">

          {/* ================= LEFT SIDE ================= */}
          <div className="login-banner">

            <div className="banner-glow"></div>

            <div className="brand">
              <div className="brand-icon">⚡</div>

              <div>
                <div className="brand-name">
                  FIT<span>TRACK</span>
                </div>

                <div className="brand-subtitle">
                  SMART EXERCISE
                </div>
              </div>
            </div>

            <div className="banner-content">

              <h1>
                ออกกำลังกาย
                <br />
                <span>อย่างชาญฉลาด</span>
              </h1>

              <p>
                ระบบติดตามการออกกำลังกายอัจฉริยะ
                พร้อมช่วยตรวจจับท่าทางและนับจำนวนครั้ง
                แบบเรียลไทม์
              </p>

              <div className="features">

                <div className="feature">
                  <div className="feature-icon">🤖</div>

                  <div>
                    <h3>AI Detection</h3>
                    <p>ตรวจจับท่าทางด้วย AI</p>
                  </div>
                </div>

                <div className="feature">
                  <div className="feature-icon">🔢</div>

                  <div>
                    <h3>Rep Counter</h3>
                    <p>นับจำนวนครั้งอัตโนมัติ</p>
                  </div>
                </div>

                <div className="feature">
                  <div className="feature-icon">📊</div>

                  <div>
                    <h3>Track Progress</h3>
                    <p>ติดตามประวัติการออกกำลังกาย</p>
                  </div>
                </div>

              </div>
            </div>

            <div className="banner-footer">
              FITTRACK © 2026
            </div>

          </div>

          {/* ================= RIGHT SIDE ================= */}
          <div className="login-form-section">

            <div className="mobile-logo">
              ⚡
            </div>

            <div className="form-header">
              <h2>เข้าสู่ระบบ</h2>

              <p>
                เข้าสู่บัญชี FitTrack ของคุณ
              </p>
            </div>

            <form onSubmit={handleLogin}>

              {/* EMAIL */}
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
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />

                </div>
              </div>

              {/* PASSWORD */}
              <div className="form-group">

                <div className="password-label">

                  <label htmlFor="password">
                    รหัสผ่าน
                  </label>

                </div>

                <div className="input-wrapper">

                  <span className="input-icon">
                    🔒
                  </span>

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="กรอกรหัสผ่าน"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    aria-label={
                      showPassword
                        ? "ซ่อนรหัสผ่าน"
                        : "แสดงรหัสผ่าน"
                    }
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>

                </div>
              </div>

              {/* ERROR */}
              {error && (
                <div className="error-message">
                  <span>⚠</span>
                  {error}
                </div>
              )}

              {/* LOGIN BUTTON */}
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
                    <span>→</span>
                  </>
                )}
              </button>

            </form>

            {/* REGISTER */}
            <div className="register-text">

              ยังไม่มีบัญชีใช่ไหม?

              <Link to="/register">
                สมัครสมาชิก
              </Link>

            </div>

          </div>

        </div>

      </div>

      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            Arial,
            sans-serif;
          background: #080b0f;
        }

        .login-page {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 30px;
          position: relative;
          overflow: hidden;

          background:
            radial-gradient(
              circle at top left,
              #0d1b2e 0%,
              #080b0f 42%,
              #080b0f 100%
            );
        }

        /* ================= DECORATION ================= */

        .circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        .circle-1 {
          width: 500px;
          height: 500px;
          top: -250px;
          left: -250px;

          background:
            radial-gradient(
              circle,
              rgba(59, 130, 246, 0.14),
              transparent 70%
            );
        }

        .circle-2 {
          width: 600px;
          height: 600px;
          right: -300px;
          bottom: -300px;

          background:
            radial-gradient(
              circle,
              rgba(37, 99, 235, 0.08),
              transparent 70%
            );
        }

        /* ================= CONTAINER ================= */

        .login-container {
          width: 100%;
          max-width: 1100px;
          min-height: 650px;

          display: grid;
          grid-template-columns: 1.05fr 0.95fr;

          background: #10151c;

          border: 1px solid rgba(59, 130, 246, 0.15);

          border-radius: 28px;

          overflow: hidden;

          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.55),
            0 10px 35px rgba(59, 130, 246, 0.05);

          position: relative;
          z-index: 2;
        }

        /* ================= LEFT ================= */

        .login-banner {
          position: relative;
          overflow: hidden;

          padding: 55px;

          background:
            linear-gradient(
              145deg,
              #0a1625,
              #0d1d32 55%,
              #102642
            );

          border-right:
            1px solid rgba(59, 130, 246, 0.12);

          display: flex;
          flex-direction: column;
        }

        .banner-glow {
          position: absolute;

          width: 500px;
          height: 500px;

          top: -200px;
          right: -200px;

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(59, 130, 246, 0.20),
              transparent 70%
            );
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 15px;

          position: relative;
          z-index: 2;
        }

        .brand-icon {
          width: 52px;
          height: 52px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 15px;

          border:
            1px solid rgba(59, 130, 246, 0.30);

          background:
            rgba(59, 130, 246, 0.10);

          font-size: 25px;

          box-shadow:
            0 10px 30px rgba(59, 130, 246, 0.10);
        }

        .brand-name {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 2px;
          color: white;
        }

        .brand-highlight,
        .brand-name span {
          color: #3b82f6;
        }

        .brand-subtitle {
          color: #64748b;
          font-size: 9px;
          letter-spacing: 3px;
          margin-top: 3px;
        }

        .banner-content {
          margin-top: auto;
          margin-bottom: auto;

          position: relative;
          z-index: 2;
        }

        .banner-content h1 {
          font-size: 48px;
          line-height: 1.15;
          color: #ffffff;
          margin: 0 0 20px;
          font-weight: 800;
        }

        .banner-content h1 span {
          color: #3b82f6;
        }

        .banner-content > p {
          color: #94a3b8;
          line-height: 1.8;
          max-width: 450px;
          margin-bottom: 35px;
          font-size: 15px;
        }

        /* ================= FEATURES ================= */

        .features {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .feature-icon {
          width: 44px;
          height: 44px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 12px;

          border:
            1px solid rgba(59, 130, 246, 0.30);

          background:
            rgba(59, 130, 246, 0.10);

          color: #3b82f6;

          font-size: 20px;
        }

        .feature h3 {
          margin: 0 0 3px;
          color: white;
          font-size: 14px;
        }

        .feature p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .banner-footer {
          color: #475569;
          font-size: 10px;
          letter-spacing: 2px;
          position: relative;
          z-index: 2;
        }

        /* ================= RIGHT ================= */

        .login-form-section {
          padding: 65px 60px;

          display: flex;
          flex-direction: column;
          justify-content: center;

          background: #10151c;
        }

        .mobile-logo {
          display: none;
        }

        .form-header {
          margin-bottom: 35px;
        }

        .form-header h2 {
          color: white;
          font-size: 32px;
          margin: 0 0 8px;
        }

        .form-header p {
          color: #64748b;
          margin: 0;
          font-size: 14px;
        }

        /* ================= FORM ================= */

        .form-group {
          margin-bottom: 22px;
        }

        .form-group label {
          display: block;
          color: #cbd5e1;
          font-size: 13px;
          margin-bottom: 9px;
          font-weight: 600;
        }

        .password-label {
          display: flex;
          justify-content: space-between;
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;

          left: 16px;
          top: 50%;

          transform: translateY(-50%);

          color: #64748b;

          font-size: 17px;

          z-index: 2;
        }

        .input-wrapper input {
          width: 100%;
          height: 52px;

          padding:
            0 50px;

          background: #0b1118;

          border:
            1px solid #202a36;

          border-radius: 12px;

          color: white;

          outline: none;

          font-size: 14px;

          transition: 0.25s;
        }

        .input-wrapper input::placeholder {
          color: #475569;
        }

        .input-wrapper input:hover {
          border-color:
            rgba(59, 130, 246, 0.20);
        }

        .input-wrapper input:focus {
          border-color: #3b82f6;

          box-shadow:
            0 0 0 4px
            rgba(59, 130, 246, 0.08);
        }

        .password-toggle {
          position: absolute;

          right: 10px;
          top: 50%;

          transform: translateY(-50%);

          border: none;
          background: transparent;

          color: #64748b;

          width: 35px;
          height: 35px;

          border-radius: 8px;

          cursor: pointer;

          transition: 0.2s;
        }

        .password-toggle:hover {
          background:
            rgba(59, 130, 246, 0.08);

          color: #3b82f6;
        }

        /* ================= ERROR ================= */

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;

          padding: 12px 14px;

          border-radius: 10px;

          margin-bottom: 18px;

          background:
            rgba(239, 68, 68, 0.08);

          border:
            1px solid rgba(239, 68, 68, 0.20);

          color: #f87171;

          font-size: 12px;
        }

        /* ================= BUTTON ================= */

        .login-button {
          width: 100%;
          height: 54px;

          border: none;
          border-radius: 12px;

          background:
            linear-gradient(
              135deg,
              #2563eb,
              #3b82f6,
              #60a5fa
            );

          color: #ffffff;

          font-size: 14px;
          font-weight: 700;

          cursor: pointer;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          transition: 0.25s;

          box-shadow:
            0 8px 25px
            rgba(59, 130, 246, 0.20);
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);

          box-shadow:
            0 12px 30px
            rgba(59, 130, 246, 0.30);
        }

        .login-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .spinner {
          width: 18px;
          height: 18px;

          border:
            2px solid rgba(255,255,255,0.35);

          border-top-color: white;

          border-radius: 50%;

          animation:
            spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* ================= REGISTER ================= */

        .register-text {
          text-align: center;

          margin-top: 28px;

          color: #64748b;

          font-size: 13px;
        }

        .register-text a {
          color: #3b82f6;

          text-decoration: none;

          font-weight: 700;

          margin-left: 5px;

          transition: 0.2s;
        }

        .register-text a:hover {
          color: #60a5fa;
        }

        /* ================= RESPONSIVE ================= */

        @media (max-width: 850px) {

          .login-page {
            padding: 20px;
          }

          .login-container {
            max-width: 550px;
            grid-template-columns: 1fr;
          }

          .login-banner {
            display: none;
          }

          .login-form-section {
            padding: 50px 40px;
          }

          .mobile-logo {
            width: 58px;
            height: 58px;

            display: flex;
            align-items: center;
            justify-content: center;

            margin: 0 auto 25px;

            border-radius: 17px;

            border:
              1px solid rgba(59, 130, 246, 0.25);

            background:
              rgba(59, 130, 246, 0.10);

            font-size: 27px;
          }

          .form-header {
            text-align: center;
          }
        }

        @media (max-width: 500px) {

          .login-page {
            padding: 12px;
          }

          .login-container {
            border-radius: 20px;
          }

          .login-form-section {
            padding: 40px 25px;
          }

          .form-header h2 {
            font-size: 28px;
          }

        }

      `}</style>
    </>
  );
}