import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("กรุณากรอกชื่อของคุณ");
      return;
    }

    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (password !== confirmPassword) {
      setError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);

    try {
      // 1. สร้างบัญชีใน Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // 2. บันทึกข้อมูลผู้ใช้ลง Firestore
      await setDoc(doc(db, "users", user.uid), {
        name: name.trim(),
        email: email,
        createdAt: new Date(),
      });

      navigate("/dashboard");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้อีเมลอื่น");
      } else if (err.code === "auth/invalid-email") {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
      } else if (err.code === "auth/weak-password") {
        setError("รหัสผ่านไม่ปลอดภัย กรุณาใช้รหัสผ่านที่มีอย่างน้อย 6 ตัวอักษร");
      } else {
        setError("ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setLoading(false);
    }
  };

  const strengthLevel =
    password.length >= 10 ? 4 : password.length >= 8 ? 3 : password.length >= 6 ? 2 : 1;
  const strengthText = ["", "สั้นเกินไป", "พอใช้", "ดี", "แข็งแรง"][strengthLevel];

  const logoSvg = (
    <svg viewBox="0 0 32 32" width="27" height="30" aria-hidden="true" focusable="false">
      <path
        d="M8 3.5h17l-4.5 7H29L13 28v-11H4l4-13.5Z"
        fill="#a855f7"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <div className="register-page">
      <div className="register-container">
        {/* LEFT */}
        <div className="register-banner">
          <div className="brand-block">
            <div className="brand-mark" aria-label="FitTrack">
              {logoSvg}
            </div>
            <div>
              <div className="brand-name">FitTrack</div>
              <div className="brand-tagline">Healthy Today</div>
            </div>
          </div>

          <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
          <p className="register-banner-description">
            เริ่มต้นสร้างเป้าหมายสุขภาพ
            <br />
            และดูแลตัวเองไปพร้อมกับเรา
          </p>

          <div className="register-feature">
            <span className="register-feature-icon">✓</span>
            <p>บันทึกข้อมูลการออกกำลังกาย</p>
          </div>
          <div className="register-feature">
            <span className="register-feature-icon">✓</span>
            <p>ติดตามความก้าวหน้าของคุณ</p>
          </div>
          <div className="register-feature">
            <span className="register-feature-icon">✓</span>
            <p>วางแผนการออกกำลังกายได้ง่าย</p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="register-card">
          <div className="register-header">
            <div className="brand-mark register-mobile-logo">{logoSvg}</div>
            <h2>สร้างบัญชีใหม่</h2>
            <p>สมัครสมาชิกเพื่อเริ่มต้นดูแลสุขภาพของคุณ</p>
          </div>

          <form onSubmit={handleRegister}>
            {/* NAME */}
            <div className="compact-field">
              <label htmlFor="name">ชื่อ</label>
              <div className="input-wrap">
                <span className="input-icon">👤</span>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="กรอกชื่อของคุณ"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            {/* EMAIL */}
            <div className="compact-field">
              <label htmlFor="register-email">อีเมล</label>
              <div className="input-wrap">
                <span className="input-icon">✉</span>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="กรอกอีเมลของคุณ"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div className="compact-field">
              <label htmlFor="register-password">รหัสผ่าน</label>
              <div className="input-wrap">
                <span className="input-icon">🔒</span>
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>

              {password.length > 0 && (
                <div className="password-strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className={`strength-bar ${n <= strengthLevel ? "active" : ""} level-${strengthLevel}`}
                      />
                    ))}
                  </div>
                  <span className="strength-text">{strengthText}</span>
                </div>
              )}
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="compact-field">
              <label htmlFor="confirm-password">ยืนยันรหัสผ่าน</label>
              <div className="input-wrap">
                <span className="input-icon">🔐</span>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showConfirmPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {error && (
              <div className="register-error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="register-spinner"></span>
                  กำลังสมัครสมาชิก...
                </>
              ) : (
                <>สมัครสมาชิก</>
              )}
            </button>
          </form>

          <div className="register-divider">
            <span>หรือ</span>
          </div>

          <p className="register-login-text">
            มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
          </p>

          <p className="register-footer">© 2026 FitTrack</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html {
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow-x: hidden;
        }

        body {
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow-x: hidden;
          border: 0;
          background: #eef4fb;
          color: #173b73;
          font-family: "Anuphan", sans-serif;
        }

        button, input { font-family: inherit; }

        #root {
          width: 100%;
          min-height: 100vh;
          margin: 0;
          border: 0;
        }

        .register-page {
          width: 100%;
          min-height: 100vh;
          padding: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow-x: hidden;
          font-family: "Anuphan", sans-serif;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
        }

        /* ---------- MAIN CARD ---------- */

        .register-container {
          position: relative;
          width: 100%;
          max-width: 980px;
          min-height: 640px;
          display: grid;
          grid-template-columns: 42% 58%;
          overflow: hidden;
          border: 1px solid #dbe8f5;
          border-radius: 19px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 15px 40px rgba(35,82,137,.09);
        }

        .register-container::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          z-index: 3;
          background: linear-gradient(90deg, #1877f2, #74b3ff, transparent);
        }

        /* ---------- LEFT ---------- */

        .register-banner {
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: rgba(255,255,255,.93);
          border-right: 1px solid #dbe7f4;
        }

        .brand-block {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 0 30px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #5b9cf6, #1769dc);
          box-shadow: 0 9px 20px rgba(24,119,242,.22);
        }

        .brand-name {
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 22px;
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: -.15px;
        }

        .brand-tagline {
          margin-top: 3px;
          color: #8aa0b9;
          font-size: 9px;
          letter-spacing: .5px;
        }

        .register-banner h1 {
          margin: 0;
          font-family: "Kanit", sans-serif;
          font-size: clamp(27px, 3vw, 34px);
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -.35px;
          color: #11396f;
          background: linear-gradient(90deg, #123c78 0%, #1877f2 48%, #2f68bd 100%);
          background-size: 200% 100%;
          background-position: 0% 50%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: titleWink 3.6s ease-in-out infinite;
        }

        @keyframes titleWink {
          0%, 65%, 100% { background-position: 0% 50%; }
          78% { background-position: 100% 50%; }
        }

        .register-banner-description {
          margin: 10px 0 30px;
          color: #68809f;
          font-size: 14px;
          line-height: 1.7;
        }

        .register-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          padding: 11px 14px;
          border-radius: 15px;
          background: #e7f1ff;
        }

        .register-feature-icon {
          width: 31px;
          height: 31px;
          flex: 0 0 31px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          background: linear-gradient(145deg, #4d97f5, #1769dc);
          box-shadow: 0 5px 12px rgba(24,119,242,.2);
        }

        .register-feature p {
          margin: 0;
          color: #1558a9;
          font-size: 13px;
        }

        /* ---------- RIGHT ---------- */

        .register-card {
          padding: 42px 56px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .register-header { margin-bottom: 22px; }

        .register-mobile-logo {
          display: none;
          margin-bottom: 14px;
        }

        .register-header h2 {
          margin: 0 0 6px;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -.15px;
        }

        .register-header p {
          margin: 0;
          color: #8095ad;
          font-size: 13px;
          line-height: 1.6;
        }

        .compact-field { margin-bottom: 14px; }

        .compact-field label {
          display: block;
          margin-bottom: 5px;
          color: #6d8199;
          font-size: 11.5px;
          font-weight: 600;
        }

        .input-wrap { position: relative; }

        .input-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #6d8aab;
          font-size: 14px;
          pointer-events: none;
        }

        .input-wrap input {
          width: 100%;
          height: 44px;
          padding: 7px 44px 7px 38px;
          outline: none;
          border: 1px solid #d6e2ee;
          border-radius: 9px;
          color: #173b73;
          background: #fff;
          font-size: 13px;
          transition: .2s ease;
        }

        .input-wrap input::placeholder { color: #a6b5c6; }

        .input-wrap input:focus {
          border-color: #1877f2;
          box-shadow: 0 0 0 3px rgba(24,119,242,.08);
        }

        .password-toggle {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          font-size: 15px;
          transition: .2s ease;
        }

        .password-toggle:hover { background: #edf5ff; }

        /* password strength */

        .password-strength {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }

        .strength-bars {
          flex: 1;
          display: flex;
          gap: 5px;
        }

        .strength-bar {
          flex: 1;
          height: 5px;
          border-radius: 999px;
          background: #e4ecf5;
          transition: background .2s ease;
        }

        .strength-bar.active.level-1 { background: #ef6b6b; }
        .strength-bar.active.level-2 { background: #f5b04a; }
        .strength-bar.active.level-3 { background: #74b3ff; }
        .strength-bar.active.level-4 { background: #1877f2; }

        .strength-text {
          min-width: 62px;
          color: #8095ad;
          font-size: 10.5px;
          text-align: right;
        }

        /* error */

        .register-error {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid #ffd0d0;
          border-radius: 9px;
          color: #b42323;
          background: #fff0f0;
          font-size: 12px;
        }

        /* button */

        .primary-btn {
          width: 100%;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 9px;
          color: #fff;
          background: linear-gradient(135deg, #1877f2, #0d5dcc);
          box-shadow: 0 7px 15px rgba(24,119,242,.18);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          transition: .2s ease;
          will-change: transform;
        }

        .primary-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(24,119,242,.25);
        }

        .primary-btn:active:not(:disabled) { transform: translateY(1px) scale(.98); }

        .primary-btn:disabled {
          opacity: .7;
          cursor: not-allowed;
        }

        .register-spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* divider + footer */

        .register-divider {
          position: relative;
          margin: 20px 0 16px;
          text-align: center;
        }

        .register-divider::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 1px;
          background: #e4ecf5;
        }

        .register-divider span {
          position: relative;
          padding: 0 12px;
          color: #8095ad;
          background: #fff;
          font-size: 11px;
        }

        .register-login-text {
          margin: 0;
          color: #68809f;
          font-size: 13px;
          text-align: center;
        }

        .register-login-text a {
          margin-left: 6px;
          color: #1877f2;
          font-weight: 700;
          text-decoration: none;
        }

        .register-login-text a:hover { text-decoration: underline; }

        .register-footer {
          margin: 22px 0 0;
          color: #a6b5c6;
          font-size: 10px;
          text-align: center;
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 860px) {
          .register-container {
            max-width: 480px;
            grid-template-columns: 1fr;
          }

          .register-banner { display: none; }
          .register-card { padding: 34px 28px; }
          .register-mobile-logo { display: grid; }
        }

        @media (max-width: 460px) {
          .register-page { padding: 14px; }
          .register-card { padding: 28px 18px; }
          .register-header h2 { font-size: 22px; }
        }
      `}</style>
    </div>
  );
}
