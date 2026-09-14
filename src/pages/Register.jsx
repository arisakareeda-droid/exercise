import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    setError('');

    // ตรวจสอบชื่อ
    if (!name.trim()) {
      setError('กรุณากรอกชื่อของคุณ');
      return;
    }

    // ตรวจสอบรหัสผ่าน
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    // ตรวจสอบรหัสผ่านซ้ำ
    if (password !== confirmPassword) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      // 1. สร้างบัญชีใน Firebase Authentication
      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user = userCredential.user;

      // 2. บันทึกข้อมูลผู้ใช้ลง Firestore
      await setDoc(doc(db, 'users', user.uid), {
        name: name.trim(),
        email: email,
        createdAt: new Date(),
      });

      // สมัครสำเร็จ
      navigate('/dashboard');

    } catch (error) {

      if (error.code === 'auth/email-already-in-use') {
        setError('อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้อีเมลอื่น');
      } else if (error.code === 'auth/invalid-email') {
        setError('รูปแบบอีเมลไม่ถูกต้อง');
      } else if (error.code === 'auth/weak-password') {
        setError('รหัสผ่านไม่ปลอดภัย กรุณาใช้รหัสผ่านที่มีอย่างน้อย 6 ตัวอักษร');
      } else {
        setError('ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง');
      }

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

        /* =========================
           PAGE
        ========================= */

        .register-page {
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

        /* =========================
           BACKGROUND
        ========================= */

        .register-circle {
          position: absolute;

          border-radius: 50%;

          pointer-events: none;

          opacity: 0.5;
        }

        .register-circle-1 {
          width: 480px;
          height: 480px;

          top: -240px;
          right: -150px;

          background: #bbf7d0;
        }

        .register-circle-2 {
          width: 380px;
          height: 380px;

          bottom: -200px;
          left: -160px;

          background: #d1fae5;
        }

        /* =========================
           MAIN CARD
        ========================= */

        .register-container {
          width: 100%;
          max-width: 980px;

          min-height: 650px;

          display: grid;

          grid-template-columns: 44% 56%;

          position: relative;
          z-index: 2;

          background: #ffffff;

          border-radius: 30px;

          overflow: hidden;

          box-shadow:
            0 25px 70px rgba(0, 0, 0, 0.10),
            0 10px 30px rgba(16, 185, 129, 0.08);
        }

        /* =========================
           LEFT SIDE
        ========================= */

        .register-banner {
          display: flex;

          align-items: center;

          padding: 55px;

          color: #ffffff;

          background:
            linear-gradient(
              145deg,
              #047857,
              #059669 50%,
              #10b981 100%
            );
        }

        .register-banner-content {
          width: 100%;
        }

        .register-brand-icon {
          width: 75px;
          height: 75px;

          display: flex;

          align-items: center;
          justify-content: center;

          margin-bottom: 25px;

          border-radius: 22px;

          background:
            rgba(255, 255, 255, 0.17);

          font-size: 36px;

          backdrop-filter: blur(10px);
        }

        .register-banner h1 {
          margin: 0 0 12px;

          font-size: 40px;

          font-weight: 800;

          letter-spacing: -1px;
        }

        .register-banner-description {
          margin: 0 0 38px;

          color:
            rgba(255, 255, 255, 0.9);

          font-size: 16px;

          line-height: 1.8;
        }

        /* Features */

        .register-feature {
          display: flex;

          align-items: center;

          gap: 13px;

          margin-bottom: 20px;
        }

        .register-feature-icon {
          width: 27px;
          height: 27px;

          display: flex;

          align-items: center;
          justify-content: center;

          flex-shrink: 0;

          border-radius: 50%;

          background:
            rgba(255, 255, 255, 0.2);

          font-size: 13px;
        }

        .register-feature p {
          margin: 0;

          font-size: 14px;

          color:
            rgba(255, 255, 255, 0.95);
        }

        /* =========================
           RIGHT SIDE
        ========================= */

        .register-card {
          display: flex;

          flex-direction: column;

          justify-content: center;

          padding: 45px 65px;

          background: #ffffff;
        }

        /* Header */

        .register-header {
          margin-bottom: 25px;
        }

        .register-mobile-logo {
          display: none;
        }

        .register-header h2 {
          margin: 0 0 8px;

          color: #111827;

          font-size: 29px;

          font-weight: 750;
        }

        .register-header p {
          margin: 0;

          color: #6b7280;

          font-size: 14px;

          line-height: 1.6;
        }

        /* =========================
           FORM
        ========================= */

        .register-form-group {
          margin-bottom: 17px;
        }

        .register-form-group label {
          display: block;

          margin-bottom: 7px;

          color: #374151;

          font-size: 13px;

          font-weight: 600;
        }

        /* Input */

        .register-input-wrapper {
          position: relative;

          display: flex;

          align-items: center;
        }

        .register-input-icon {
          position: absolute;

          left: 15px;

          color: #9ca3af;

          font-size: 16px;

          pointer-events: none;
        }

        .register-input-wrapper input {
          width: 100%;

          height: 49px;

          padding:
            0 45px;

          border:
            1.5px solid #e5e7eb;

          border-radius: 12px;

          outline: none;

          background: #f9fafb;

          color: #111827;

          font-size: 14px;

          transition:
            all 0.2s ease;
        }

        .register-input-wrapper input::placeholder {
          color: #9ca3af;
        }

        .register-input-wrapper input:focus {
          border-color: #10b981;

          background: #ffffff;

          box-shadow:
            0 0 0 4px
            rgba(16, 185, 129, 0.10);
        }

        /* Password toggle */

        .register-password-toggle {
          position: absolute;

          right: 11px;

          border: none;

          background: transparent;

          cursor: pointer;

          font-size: 16px;

          opacity: 0.6;

          transition: 0.2s;
        }

        .register-password-toggle:hover {
          opacity: 1;
        }

        /* =========================
           PASSWORD STRENGTH
        ========================= */

        .password-strength {
          display: flex;

          align-items: center;

          gap: 8px;

          margin-top: 7px;
        }

        .strength-bars {
          display: flex;

          gap: 4px;

          flex: 1;
        }

        .strength-bar {
          height: 4px;

          flex: 1;

          border-radius: 10px;

          background: #e5e7eb;

          transition: 0.2s;
        }

        .strength-bar.active {
          background: #10b981;
        }

        .strength-text {
          min-width: 55px;

          text-align: right;

          color: #6b7280;

          font-size: 10px;
        }

        /* =========================
           ERROR
        ========================= */

        .register-error {
          display: flex;

          align-items: center;

          gap: 8px;

          margin-bottom: 17px;

          padding: 11px 13px;

          border:
            1px solid #fecaca;

          border-radius: 10px;

          background: #fef2f2;

          color: #dc2626;

          font-size: 12px;

          line-height: 1.5;
        }

        /* =========================
           BUTTON
        ========================= */

        .register-button {
          width: 100%;

          height: 51px;

          display: flex;

          align-items: center;
          justify-content: center;

          gap: 10px;

          margin-top: 5px;

          border: none;

          border-radius: 13px;

          background:
            linear-gradient(
              135deg,
              #059669,
              #10b981
            );

          color: #ffffff;

          font-size: 15px;

          font-weight: 700;

          cursor: pointer;

          box-shadow:
            0 8px 20px
            rgba(16, 185, 129, 0.25);

          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .register-button:hover:not(:disabled) {
          transform:
            translateY(-2px);

          box-shadow:
            0 12px 25px
            rgba(16, 185, 129, 0.30);
        }

        .register-button:active:not(:disabled) {
          transform:
            translateY(0);
        }

        .register-button:disabled {
          opacity: 0.7;

          cursor: not-allowed;
        }

        /* Loading */

        .register-spinner {
          width: 17px;
          height: 17px;

          border:
            2px solid
            rgba(255, 255, 255, 0.4);

          border-top-color:
            #ffffff;

          border-radius: 50%;

          animation:
            registerSpin 0.7s
            linear infinite;
        }

        @keyframes registerSpin {
          to {
            transform:
              rotate(360deg);
          }
        }

        /* =========================
           DIVIDER
        ========================= */

        .register-divider {
          display: flex;

          align-items: center;

          gap: 14px;

          margin: 22px 0;

          color: #9ca3af;

          font-size: 11px;
        }

        .register-divider::before,
        .register-divider::after {
          content: "";

          flex: 1;

          height: 1px;

          background: #e5e7eb;
        }

        /* =========================
           LOGIN LINK
        ========================= */

        .register-login-text {
          margin: 0;

          text-align: center;

          color: #6b7280;

          font-size: 13px;
        }

        .register-login-text a {
          margin-left: 5px;

          color: #059669;

          font-weight: 700;

          text-decoration: none;

          transition: 0.2s;
        }

        .register-login-text a:hover {
          color: #047857;

          text-decoration: underline;
        }

        /* =========================
           FOOTER
        ========================= */

        .register-footer {
          margin:
            25px 0 0;

          text-align: center;

          color: #d1d5db;

          font-size: 10px;
        }

        /* =========================
           TABLET
        ========================= */

        @media (max-width: 800px) {

          .register-page {
            padding: 20px;
          }

          .register-container {
            max-width: 520px;

            grid-template-columns: 1fr;

            min-height: auto;

            border-radius: 24px;
          }

          .register-banner {
            display: none;
          }

          .register-card {
            padding: 40px 35px;
          }

          .register-mobile-logo {
            width: 55px;
            height: 55px;

            display: flex;

            align-items: center;
            justify-content: center;

            margin-bottom: 16px;

            border-radius: 16px;

            background: #ecfdf5;

            font-size: 27px;
          }

          .register-header h2 {
            font-size: 27px;
          }
        }

        /* =========================
           MOBILE
        ========================= */

        @media (max-width: 450px) {

          .register-page {
            padding: 12px;
          }

          .register-container {
            border-radius: 20px;
          }

          .register-card {
            padding: 32px 23px;
          }

          .register-header {
            margin-bottom: 23px;
          }

          .register-header h2 {
            font-size: 24px;
          }

          .register-header p {
            font-size: 12px;
          }

          .register-form-group {
            margin-bottom: 15px;
          }

          .register-input-wrapper input {
            height: 48px;
          }

          .register-button {
            height: 50px;
          }
        }

      `}</style>

      <div className="register-page">

        {/* Background */}
        <div className="register-circle register-circle-1"></div>
        <div className="register-circle register-circle-2"></div>

        <div className="register-container">

          {/* =================================
              LEFT
          ================================= */}

          <div className="register-banner">

            <div className="register-banner-content">

              <div className="register-brand-icon">
                🏃‍♀️
              </div>

              <h1>
                FitTrack
              </h1>

              <p className="register-banner-description">
                เริ่มต้นสร้างเป้าหมายสุขภาพ
                <br />
                และดูแลตัวเองไปพร้อมกับเรา
              </p>

              <div className="register-feature">

                <div className="register-feature-icon">
                  ✓
                </div>

                <p>
                  บันทึกข้อมูลการออกกำลังกาย
                </p>

              </div>

              <div className="register-feature">

                <div className="register-feature-icon">
                  ✓
                </div>

                <p>
                  ติดตามความก้าวหน้าของคุณ
                </p>

              </div>

              <div className="register-feature">

                <div className="register-feature-icon">
                  ✓
                </div>

                <p>
                  วางแผนการออกกำลังกายได้ง่าย
                </p>

              </div>

            </div>

          </div>

          {/* =================================
              RIGHT
          ================================= */}

          <div className="register-card">

            <div className="register-header">

              <div className="register-mobile-logo">
                🏃‍♀️
              </div>

              <h2>
                สร้างบัญชีใหม่
              </h2>

              <p>
                สมัครสมาชิกเพื่อเริ่มต้นดูแลสุขภาพของคุณ
              </p>

            </div>

            <form onSubmit={handleRegister}>

              {/* NAME */}
              <div className="register-form-group">

                <label htmlFor="name">
                  ชื่อ
                </label>

                <div className="register-input-wrapper">

                  <span className="register-input-icon">
                    👤
                  </span>

                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) =>
                      setName(e.target.value)
                    }
                    placeholder="กรอกชื่อของคุณ"
                    autoComplete="name"
                    required
                  />

                </div>

              </div>

              {/* EMAIL */}
              <div className="register-form-group">

                <label htmlFor="register-email">
                  อีเมล
                </label>

                <div className="register-input-wrapper">

                  <span className="register-input-icon">
                    ✉
                  </span>

                  <input
                    id="register-email"
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

              {/* PASSWORD */}
              <div className="register-form-group">

                <label htmlFor="register-password">
                  รหัสผ่าน
                </label>

                <div className="register-input-wrapper">

                  <span className="register-input-icon">
                    🔒
                  </span>

                  <input
                    id="register-password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />

                  <button
                    type="button"
                    className="register-password-toggle"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                  >
                    {showPassword
                      ? '🙈'
                      : '👁️'}
                  </button>

                </div>

                {/* Password strength */}
                {password.length > 0 && (
                  <div className="password-strength">

                    <div className="strength-bars">

                      <div
                        className={
                          `strength-bar ${
                            password.length >= 1
                              ? 'active'
                              : ''
                          }`
                        }
                      />

                      <div
                        className={
                          `strength-bar ${
                            password.length >= 6
                              ? 'active'
                              : ''
                          }`
                        }
                      />

                      <div
                        className={
                          `strength-bar ${
                            password.length >= 8
                              ? 'active'
                              : ''
                          }`
                        }
                      />

                      <div
                        className={
                          `strength-bar ${
                            password.length >= 10
                              ? 'active'
                              : ''
                          }`
                        }
                      />

                    </div>

                    <span className="strength-text">
                      {password.length < 6
                        ? 'สั้นเกินไป'
                        : password.length < 8
                        ? 'พอใช้'
                        : password.length < 10
                        ? 'ดี'
                        : 'แข็งแรง'}
                    </span>

                  </div>
                )}

              </div>

              {/* CONFIRM PASSWORD */}
              <div className="register-form-group">

                <label htmlFor="confirm-password">
                  ยืนยันรหัสผ่าน
                </label>

                <div className="register-input-wrapper">

                  <span className="register-input-icon">
                    🔐
                  </span>

                  <input
                    id="confirm-password"
                    type={
                      showConfirmPassword
                        ? 'text'
                        : 'password'
                    }
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className="register-password-toggle"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                  >
                    {showConfirmPassword
                      ? '🙈'
                      : '👁️'}
                  </button>

                </div>

              </div>

              {/* ERROR */}
              {error && (
                <div className="register-error">

                  <span>
                    ⚠️
                  </span>

                  <span>
                    {error}
                  </span>

                </div>
              )}

              {/* REGISTER BUTTON */}
              <button
                type="submit"
                className="register-button"
                disabled={loading}
              >

                {loading ? (
                  <>
                    <span className="register-spinner"></span>
                    กำลังสมัครสมาชิก...
                  </>
                ) : (
                  <>
                    สมัครสมาชิก
                    <span>
                      →
                    </span>
                  </>
                )}

              </button>

            </form>

            {/* DIVIDER */}
            <div className="register-divider">
              <span>หรือ</span>
            </div>

            {/* LOGIN */}
            <p className="register-login-text">

              มีบัญชีอยู่แล้ว?

              <Link to="/login">
                เข้าสู่ระบบ
              </Link>

            </p>

            {/* FOOTER */}
            <p className="register-footer">
              © 2026 FitTrack
            </p>

          </div>

        </div>

      </div>
    </>
  );
}