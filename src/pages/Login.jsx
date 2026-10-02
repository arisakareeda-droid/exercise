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
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');

        * {
          box-sizing: border-box;
          font-family: "Kanit", sans-serif;
        }

        body {
          margin: 0;
          background: #eef6ff;
          font-family: "Kanit", sans-serif;
        }

        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(59,130,246,0.13), transparent 32%),
            radial-gradient(circle at 92% 88%, rgba(14,165,233,0.12), transparent 30%),
            linear-gradient(135deg, #f5faff 0%, #eaf4ff 52%, #f8fbff 100%);
        }

        .login-page::before,
        .login-page::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(2px);
        }

        .login-page::before {
          width: 360px;
          height: 360px;
          top: -170px;
          right: -100px;
          background: rgba(59,130,246,0.08);
        }

        .login-page::after {
          width: 300px;
          height: 300px;
          bottom: -160px;
          left: -100px;
          background: rgba(14,165,233,0.07);
        }

        .login-shell {
          width: 100%;
          max-width: 1080px;
          min-height: 650px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          position: relative;
          z-index: 2;
          overflow: hidden;
          border: 1px solid rgba(148,163,184,0.20);
          border-radius: 28px;
          background: rgba(255,255,255,0.78);
          box-shadow:
            0 24px 60px rgba(37,99,235,0.10),
            0 8px 24px rgba(15,23,42,0.06);
          backdrop-filter: blur(14px);
        }

        .login-brand-panel {
          position: relative;
          display: flex;
          align-items: center;
          padding: 58px;
          overflow: hidden;
          background:
            linear-gradient(145deg, #dceeff 0%, #eaf6ff 52%, #f4faff 100%);
          border-right: 1px solid rgba(148,163,184,0.16);
        }

        .brand-glow {
          position: absolute;
          width: 420px;
          height: 420px;
          right: -210px;
          bottom: -210px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59,130,246,0.18), transparent 68%);
        }

        .brand-content {
          position: relative;
          z-index: 1;
          width: 100%;
        }

        .brand-mark {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 25px;
          border: 1px solid rgba(37,99,235,0.16);
          border-radius: 20px;
          background: rgba(255,255,255,0.75);
          color: #2563eb;
          font-size: 34px;
          box-shadow: 0 12px 28px rgba(37,99,235,0.10);
        }

        .brand-title {
          margin: 0 0 10px;
          color: #172554;
          font-size: 43px;
          line-height: 1.15;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .brand-title span {
          color: #2563eb;
        }

        .brand-description {
          margin: 0 0 34px;
          color: #64748b;
          font-size: 15px;
          line-height: 1.9;
        }

        .brand-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          color: #334155;
        }

        .feature-check {
          width: 29px;
          height: 29px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #dbeafe;
          border: 1px solid #bfdbfe;
          color: #2563eb;
          font-size: 13px;
          font-weight: 800;
        }

        .brand-feature p {
          margin: 0;
          font-size: 13px;
        }

        .login-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 58px 68px;
          background: rgba(255,255,255,0.88);
        }

        .mobile-brand {
          display: none;
        }

        .login-header {
          margin-bottom: 30px;
        }

        .login-header h1 {
          margin: 0 0 8px;
          color: #172033;
          font-size: 30px;
          font-weight: 800;
        }

        .login-header p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.7;
        }

        .form-group {
          margin-bottom: 19px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #334155;
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
          z-index: 1;
          color: #94a3b8;
          font-size: 16px;
          pointer-events: none;
        }

        .input-wrapper input {
          width: 100%;
          height: 52px;
          padding: 0 45px;
          outline: none;
          border: 1px solid #dbe4ef;
          border-radius: 13px;
          background: #f8fbff;
          color: #1e293b;
          font-family: "Kanit", sans-serif;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .input-wrapper input::placeholder {
          color: #a0aec0;
        }

        .input-wrapper input:hover {
          border-color: #bfdbfe;
          background: #ffffff;
        }

        .input-wrapper input:focus {
          border-color: #60a5fa;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.10);
        }

        .password-toggle {
          position: absolute;
          right: 9px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          font-size: 15px;
          transition: 0.2s;
        }

        .password-toggle:hover {
          background: #eaf2ff;
          color: #2563eb;
        }

        .error-message {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-bottom: 18px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 11px;
          background: #fff1f2;
          color: #dc2626;
          font-size: 12px;
          line-height: 1.6;
        }

        .login-button {
          width: 100%;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: none;
          border-radius: 13px;
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          color: #ffffff;
          font-family: "Kanit", sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 9px 24px rgba(37,99,235,0.18);
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 13px 30px rgba(37,99,235,0.25);
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

        .spinner {
          width: 17px;
          height: 17px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 13px;
          margin: 24px 0;
          color: #94a3b8;
          font-size: 11px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #e2e8f0;
        }

        .register-text {
          margin: 0;
          text-align: center;
          color: #64748b;
          font-size: 13px;
        }

        .register-text a {
          margin-left: 5px;
          color: #2563eb;
          font-weight: 700;
          text-decoration: none;
          transition: 0.2s;
        }

        .register-text a:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }

        .login-footer {
          margin: 30px 0 0;
          text-align: center;
          color: #94a3b8;
          font-size: 10px;
        }

        @media (max-width: 850px) {
          .login-page {
            padding: 20px;
          }

          .login-shell {
            max-width: 520px;
            min-height: auto;
            grid-template-columns: 1fr;
            border-radius: 23px;
          }

          .login-brand-panel {
            display: none;
          }

          .login-card {
            padding: 46px 40px;
          }

          .mobile-brand {
            width: 58px;
            height: 58px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            border: 1px solid #bfdbfe;
            border-radius: 17px;
            background: #eff6ff;
            color: #2563eb;
            font-size: 27px;
          }

          .login-header h1 {
            font-size: 27px;
          }
        }

        @media (max-width: 450px) {
          .login-page {
            padding: 14px;
          }

          .login-shell {
            border-radius: 19px;
          }

          .login-card {
            padding: 36px 24px;
          }

          .login-header h1 {
            font-size: 24px;
          }

          .login-header p {
            font-size: 12px;
          }
        }
      `}</style>

      <div className="login-page">
        <div className="login-shell">

          <div className="login-brand-panel">
            <div className="brand-glow"></div>

            <div className="brand-content">
              <div className="brand-mark">🏃‍♀️</div>

              <h2 className="brand-title">
                FIT<span>TRACK</span>
              </h2>

              <p className="brand-description">
                ระบบติดตามการออกกำลังกายอัจฉริยะ
                <br />
                ที่ช่วยให้คุณดูแลสุขภาพได้ง่ายขึ้น
              </p>

              <div className="brand-feature">
                <span className="feature-check">✓</span>
                <p>ตรวจจับท่าทางการออกกำลังกายด้วย AI</p>
              </div>

              <div className="brand-feature">
                <span className="feature-check">✓</span>
                <p>นับจำนวนครั้งของการออกกำลังกายอัตโนมัติ</p>
              </div>

              <div className="brand-feature">
                <span className="feature-check">✓</span>
                <p>บันทึกและติดตามผลการออกกำลังกาย</p>
              </div>
            </div>
          </div>

          <div className="login-card">
            <div className="login-header">
              <div className="mobile-brand">🏃‍♀️</div>

              <h1>ยินดีต้อนรับกลับ 👋</h1>
              <p>เข้าสู่ระบบเพื่อเริ่มต้นการออกกำลังกายของคุณ</p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="email">อีเมล</label>

                <div className="input-wrapper">
                  <span className="input-icon">✉</span>

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

              <div className="form-group">
                <label htmlFor="password">รหัสผ่าน</label>

                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>

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
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

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

            <div className="divider">
              <span>หรือ</span>
            </div>

            <p className="register-text">
              ยังไม่มีบัญชี?
              <Link to="/register">สมัครสมาชิก</Link>
            </p>

            <p className="login-footer">
              © 2026 FITTRACK · AI Exercise Tracking
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
