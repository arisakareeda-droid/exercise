import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';

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

        .login-page {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 30px;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(
              135deg,
              #f0fdf4 0%,
              #ecfdf5 45%,
              #ffffff 100%
            );
          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            sans-serif;
        }

        /* Background decoration */
        .bg-circle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.5;
        }

        .circle-1 {
          width: 450px;
          height: 450px;
          background: #bbf7d0;
          top: -220px;
          right: -150px;
        }

        .circle-2 {
          width: 350px;
          height: 350px;
          background: #d1fae5;
          bottom: -180px;
          left: -130px;
        }

        /* Main container */
        .login-container {
          width: 100%;
          max-width: 950px;
          min-height: 590px;
          display: grid;
          grid-template-columns: 45% 55%;
          position: relative;
          z-index: 2;
          background: #ffffff;
          border-radius: 28px;
          overflow: hidden;
          box-shadow:
            0 25px 60px rgba(0, 0, 0, 0.10),
            0 8px 25px rgba(16, 185, 129, 0.08);
        }

        /* Left banner */
        .login-banner {
          display: flex;
          align-items: center;
          padding: 55px;
          color: white;
          background:
            linear-gradient(
              145deg,
              #059669,
              #10b981 55%,
              #34d399
            );
        }

        .banner-content {
          width: 100%;
        }

        .brand-icon {
          width: 70px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 25px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.18);
          font-size: 34px;
          backdrop-filter: blur(8px);
        }

        .login-banner h1 {
          margin: 0 0 12px;
          font-size: 42px;
          font-weight: 800;
          letter-spacing: -1px;
        }

        .banner-description {
          margin: 0 0 35px;
          font-size: 17px;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.9);
        }

        .banner-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }

        .banner-feature span {
          width: 25px;
          height: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          font-size: 13px;
        }

        .banner-feature p {
          margin: 0;
          font-size: 14px;
        }

        /* Login card */
        .login-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 55px 65px;
          background: #ffffff;
        }

        .login-header {
          margin-bottom: 32px;
        }

        .mobile-logo {
          display: none;
        }

        .login-header h2 {
          margin: 0 0 8px;
          color: #111827;
          font-size: 30px;
          font-weight: 750;
        }

        .login-header p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.6;
        }

        /* Form */
        .form-group {
          margin-bottom: 22px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #374151;
          font-size: 14px;
          font-weight: 600;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          color: #9ca3af;
          font-size: 17px;
          pointer-events: none;
        }

        .input-wrapper input {
          width: 100%;
          height: 52px;
          padding: 0 45px;
          border: 1.5px solid #e5e7eb;
          border-radius: 13px;
          outline: none;
          background: #f9fafb;
          color: #111827;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .input-wrapper input::placeholder {
          color: #9ca3af;
        }

        .input-wrapper input:focus {
          border-color: #10b981;
          background: #ffffff;
          box-shadow:
            0 0 0 4px rgba(16, 185, 129, 0.10);
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 16px;
          opacity: 0.65;
          transition: 0.2s;
        }

        .password-toggle:hover {
          opacity: 1;
        }

        /* Error */
        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          background: #fef2f2;
          color: #dc2626;
          font-size: 13px;
        }

        /* Login button */
        .login-button {
          width: 100%;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: none;
          border-radius: 13px;
          background:
            linear-gradient(
              135deg,
              #059669,
              #10b981
            );
          color: white;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow:
            0 8px 20px rgba(16, 185, 129, 0.25);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 12px 25px rgba(16, 185, 129, 0.30);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .arrow {
          font-size: 20px;
        }

        /* Loading */
        .spinner {
          width: 17px;
          height: 17px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: white;
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
          gap: 15px;
          margin: 25px 0;
          color: #9ca3af;
          font-size: 12px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        /* Register */
        .register-text {
          margin: 0;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }

        .register-text a {
          margin-left: 5px;
          color: #059669;
          font-weight: 700;
          text-decoration: none;
          transition: 0.2s;
        }

        .register-text a:hover {
          color: #047857;
          text-decoration: underline;
        }

        /* Footer */
        .login-footer {
          margin: 35px 0 0;
          text-align: center;
          color: #d1d5db;
          font-size: 11px;
        }

        /* Tablet / Mobile */
        @media (max-width: 800px) {
          .login-page {
            padding: 20px;
          }

          .login-container {
            max-width: 500px;
            grid-template-columns: 1fr;
            min-height: auto;
            border-radius: 24px;
          }

          .login-banner {
            display: none;
          }

          .login-card {
            padding: 45px 35px;
          }

          .mobile-logo {
            width: 55px;
            height: 55px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 18px;
            border-radius: 16px;
            background: #ecfdf5;
            font-size: 26px;
          }

          .login-header h2 {
            font-size: 27px;
          }
        }

        @media (max-width: 450px) {
          .login-page {
            padding: 15px;
          }

          .login-container {
            border-radius: 20px;
          }

          .login-card {
            padding: 35px 25px;
          }

          .login-header h2 {
            font-size: 24px;
          }

          .login-header p {
            font-size: 13px;
          }
        }
      `}</style>

      <div className="login-page">

        {/* Background */}
        <div className="bg-circle circle-1"></div>
        <div className="bg-circle circle-2"></div>

        <div className="login-container">

          {/* ฝั่งซ้าย */}
          <div className="login-banner">
            <div className="banner-content">

              <div className="brand-icon">
                🏃‍♀️
              </div>

              <h1>FitTrack</h1>

              <p className="banner-description">
                ระบบติดตามและวางแผน
                <br />
                การออกกำลังกายของคุณ
              </p>

              <div className="banner-feature">
                <span>✓</span>
                <p>ติดตามการออกกำลังกายได้ง่าย</p>
              </div>

              <div className="banner-feature">
                <span>✓</span>
                <p>บันทึกผลการออกกำลังกาย</p>
              </div>

              <div className="banner-feature">
                <span>✓</span>
                <p>ดูพัฒนาการของคุณได้ทุกวัน</p>
              </div>

            </div>
          </div>

          {/* ฝั่งขวา */}
          <div className="login-card">

            <div className="login-header">

              <div className="mobile-logo">
                🏃‍♀️
              </div>

              <h2>
                ยินดีต้อนรับกลับ
              </h2>

              <p>
                เข้าสู่ระบบเพื่อเริ่มต้นดูแลสุขภาพของคุณ
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
                    aria-label="แสดงรหัสผ่าน"
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

              {/* Login */}
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
              © 2026 FitTrack
            </p>

          </div>

        </div>

      </div>
    </>
  );
}