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

        body {
          margin: 0;
          background: #080808;
        }

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 30px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(
              circle at top left,
              #241f0d 0%,
              #0d0d0d 42%,
              #080808 100%
            );
          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            system-ui,
            sans-serif;
        }

        /* Background */
        .bg-circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        .circle-1 {
          width: 500px;
          height: 500px;
          top: -250px;
          right: -180px;
          background:
            radial-gradient(
              circle,
              rgba(212, 175, 55, 0.14),
              transparent 70%
            );
        }

        .circle-2 {
          width: 450px;
          height: 450px;
          bottom: -230px;
          left: -180px;
          background:
            radial-gradient(
              circle,
              rgba(184, 134, 11, 0.08),
              transparent 70%
            );
        }

        /* Container */
        .login-container {
          width: 100%;
          max-width: 950px;
          min-height: 600px;
          display: grid;
          grid-template-columns: 45% 55%;
          position: relative;
          z-index: 2;
          overflow: hidden;

          border: 1px solid rgba(212, 175, 55, 0.15);
          border-radius: 26px;

          background: #121212;

          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.55),
            0 10px 35px rgba(212, 175, 55, 0.05);
        }

        /* Left Banner */
        .login-banner {
          position: relative;
          display: flex;
          align-items: center;
          padding: 55px;
          overflow: hidden;

          background:
            linear-gradient(
              145deg,
              #17130a,
              #211b0c 55%,
              #2a210b
            );

          border-right: 1px solid rgba(212, 175, 55, 0.12);
        }

        .banner-glow {
          position: absolute;
          width: 350px;
          height: 350px;
          right: -160px;
          bottom: -150px;
          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(212, 175, 55, 0.20),
              transparent 70%
            );
        }

        .banner-content {
          position: relative;
          z-index: 2;
          width: 100%;
        }

        /* Brand Icon */
        .brand-icon {
          width: 72px;
          height: 72px;

          display: flex;
          align-items: center;
          justify-content: center;

          margin-bottom: 26px;

          border: 1px solid rgba(212, 175, 55, 0.30);
          border-radius: 20px;

          background: rgba(212, 175, 55, 0.10);

          font-size: 34px;

          box-shadow:
            0 10px 30px rgba(212, 175, 55, 0.10);
        }

        .login-banner h1 {
          margin: 0 0 10px;

          color: #ffffff;

          font-size: 43px;
          font-weight: 850;
          letter-spacing: 2px;
        }

        .brand-highlight {
          color: #d4af37;
        }

        .banner-description {
          margin: 0 0 35px;

          color: #aaa28e;

          font-size: 15px;
          line-height: 1.9;
        }

        /* Features */
        .banner-feature {
          display: flex;
          align-items: center;
          gap: 12px;

          margin-bottom: 17px;

          color: #d6d1c2;
        }

        .feature-icon {
          width: 28px;
          height: 28px;

          display: flex;
          align-items: center;
          justify-content: center;

          flex-shrink: 0;

          border: 1px solid rgba(212, 175, 55, 0.30);
          border-radius: 50%;

          background: rgba(212, 175, 55, 0.10);

          color: #d4af37;

          font-size: 13px;
          font-weight: 700;
        }

        .banner-feature p {
          margin: 0;
          font-size: 13px;
        }

        /* Right Side */
        .login-card {
          display: flex;
          flex-direction: column;
          justify-content: center;

          padding: 55px 65px;

          background:
            linear-gradient(
              145deg,
              #171717,
              #101010
            );
        }

        .login-header {
          margin-bottom: 32px;
        }

        .mobile-logo {
          display: none;
        }

        .login-header h2 {
          margin: 0 0 9px;

          color: #ffffff;

          font-size: 29px;
          font-weight: 800;
        }

        .login-header p {
          margin: 0;

          color: #8f8b82;

          font-size: 13px;
          line-height: 1.7;
        }

        /* Form */
        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;

          margin-bottom: 8px;

          color: #d4d0c5;

          font-size: 13px;
          font-weight: 600;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 15px;

          color: #77736a;

          font-size: 16px;

          pointer-events: none;

          z-index: 1;
        }

        .input-wrapper input {
          width: 100%;
          height: 52px;

          padding: 0 45px;

          outline: none;

          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;

          background: #0b0b0b;

          color: #ffffff;

          font-family: inherit;
          font-size: 14px;

          transition: all 0.2s ease;
        }

        .input-wrapper input::placeholder {
          color: #5f5c56;
        }

        .input-wrapper input:hover {
          border-color: rgba(212, 175, 55, 0.20);
        }

        .input-wrapper input:focus {
          border-color: #d4af37;

          background: #0e0e0e;

          box-shadow:
            0 0 0 4px rgba(212, 175, 55, 0.08);
        }

        /* Password */
        .password-toggle {
          position: absolute;
          right: 11px;

          width: 35px;
          height: 35px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: none;
          border-radius: 8px;

          background: transparent;

          color: #858078;

          cursor: pointer;

          font-size: 15px;

          transition: 0.2s;
        }

        .password-toggle:hover {
          background: rgba(212, 175, 55, 0.08);
          color: #d4af37;
        }

        /* Error */
        .error-message {
          display: flex;
          align-items: flex-start;
          gap: 9px;

          margin-bottom: 18px;
          padding: 12px 14px;

          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;

          background: rgba(239, 68, 68, 0.08);

          color: #f87171;

          font-size: 12px;
          line-height: 1.6;
        }

        /* Login Button */
        .login-button {
          width: 100%;
          height: 52px;

          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;

          border: none;
          border-radius: 12px;

          background:
            linear-gradient(
              135deg,
              #b8860b,
              #d4af37,
              #f0d66d
            );

          color: #111111;

          font-family: inherit;

          font-size: 14px;
          font-weight: 800;

          cursor: pointer;

          box-shadow:
            0 8px 25px rgba(212, 175, 55, 0.18);

          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);

          box-shadow:
            0 12px 30px rgba(212, 175, 55, 0.28);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .arrow {
          font-size: 20px;
          line-height: 1;
        }

        /* Loading */
        .spinner {
          width: 17px;
          height: 17px;

          border: 2px solid rgba(0, 0, 0, 0.25);
          border-top-color: #111111;

          border-radius: 50%;

          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          gap: 13px;

          margin: 24px 0;

          color: #5f5b54;

          font-size: 11px;
        }

        .divider::before,
        .divider::after {
          content: "";

          flex: 1;

          height: 1px;

          background: rgba(255, 255, 255, 0.07);
        }

        /* Register */
        .register-text {
          margin: 0;

          text-align: center;

          color: #7f7b73;

          font-size: 13px;
        }

        .register-text a {
          margin-left: 5px;

          color: #d4af37;

          font-weight: 700;

          text-decoration: none;

          transition: 0.2s;
        }

        .register-text a:hover {
          color: #f0d66d;
          text-decoration: underline;
        }

        /* Footer */
        .login-footer {
          margin: 32px 0 0;

          text-align: center;

          color: #45433e;

          font-size: 10px;
        }

        /* Tablet */
        @media (max-width: 800px) {

          .login-page {
            padding: 20px;
          }

          .login-container {
            max-width: 500px;
            min-height: auto;

            grid-template-columns: 1fr;

            border-radius: 22px;
          }

          .login-banner {
            display: none;
          }

          .login-card {
            padding: 45px 38px;
          }

          .mobile-logo {
            width: 58px;
            height: 58px;

            display: flex;
            align-items: center;
            justify-content: center;

            margin-bottom: 20px;

            border: 1px solid rgba(212, 175, 55, 0.25);
            border-radius: 16px;

            background: rgba(212, 175, 55, 0.10);

            font-size: 27px;
          }

          .login-header h2 {
            font-size: 27px;
          }
        }

        /* Mobile */
        @media (max-width: 450px) {

          .login-page {
            padding: 15px;
          }

          .login-container {
            border-radius: 19px;
          }

          .login-card {
            padding: 35px 24px;
          }

          .login-header h2 {
            font-size: 24px;
          }

          .login-header p {
            font-size: 12px;
          }
        }
      `}</style>

      <div className="login-page">

        {/* Background */}
        <div className="bg-circle circle-1"></div>
        <div className="bg-circle circle-2"></div>

        <div className="login-container">

          {/* Left Banner */}
          <div className="login-banner">

            <div className="banner-glow"></div>

            <div className="banner-content">

              <div className="brand-icon">
                🏃‍♀️
              </div>

              <h1>
                FIT<span className="brand-highlight">TRACK</span>
              </h1>

              <p className="banner-description">
                ระบบติดตามการออกกำลังกายอัจฉริยะ
                <br />
                ที่ช่วยให้คุณดูแลสุขภาพได้ง่ายขึ้น
              </p>

              <div className="banner-feature">
                <span className="feature-icon">✓</span>
                <p>ตรวจจับท่าทางการออกกำลังกายด้วย AI</p>
              </div>

              <div className="banner-feature">
                <span className="feature-icon">✓</span>
                <p>นับจำนวนครั้งของการออกกำลังกายอัตโนมัติ</p>
              </div>

              <div className="banner-feature">
                <span className="feature-icon">✓</span>
                <p>บันทึกและติดตามผลการออกกำลังกาย</p>
              </div>

            </div>
          </div>

          {/* Login */}
          <div className="login-card">

            <div className="login-header">

              <div className="mobile-logo">
                🏃‍♀️
              </div>

              <h2>
                ยินดีต้อนรับกลับ 👋
              </h2>

              <p>
                เข้าสู่ระบบเพื่อเริ่มต้นการออกกำลังกายของคุณ
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="กรอกอีเมลของคุณ"
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
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านของคุณ"
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
                    {showPassword ? '🙈' : '👁️'}
                  </button>

                </div>

              </div>

              {/* Error */}
              {error && (
                <div className="error-message">
                  <span>⚠️</span>
                  <span>{error}</span>
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
                    <span className="arrow">→</span>
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
              © 2026 FITTRACK · AI Exercise Tracking
            </p>

          </div>

        </div>

      </div>
    </>
  );
}