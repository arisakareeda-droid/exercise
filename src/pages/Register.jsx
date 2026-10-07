import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// อนุภาคลอยในพื้นหลัง (กำหนดค่าคงที่ ไม่สุ่มใหม่ทุกครั้งที่ re-render)
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 8) % 100}%`,
  size: 3 + ((i * 5) % 5),
  delay: `${-((i * 2.3) % 14)}s`,
  dur: `${12 + ((i * 3) % 9)}s`,
  tone: i % 3 === 0 ? 'cyan' : 'lime',
}));

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [registeredUser, setRegisteredUser] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');

  const navigate = useNavigate();
  const shellRef = useRef(null);

  // แสงสปอตไลต์ในการ์ดตามตำแหน่งเมาส์ (อัปเดตผ่าน CSS variable ไม่ต้อง re-render)
  const handleCardMove = (e) => {
    const el = shellRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const handleCaps = (e) => {
    if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('กรุณาระบุชื่อผู้ใช้งาน');
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      // 1. สร้างบัญชีใน Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. บันทึกข้อมูลผู้ใช้ลง Firestore
      await setDoc(doc(db, 'users', user.uid), {
        name: name.trim(),
        email: email,
        createdAt: new Date(),
      });

      // Firebase จะเข้าสู่ระบบให้อัตโนมัติหลังสร้างบัญชี
      // แสดงหน้าการยืนยันก่อนให้ผู้ใช้เข้าสู่ระบบต่อ โดยไม่ย้อนกลับหน้า Login
      setRegisteredUser(name.trim());
      setRegisteredEmail(email);
      setRegistered(true);
    } catch (err) {
      switch (err?.code) {
        case 'auth/email-already-in-use':
          setError('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น');
          break;
        case 'auth/invalid-email':
          setError('รูปแบบอีเมลไม่ถูกต้อง');
          break;
        case 'auth/weak-password':
          setError('รหัสผ่านไม่ปลอดภัย กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร');
          break;
        case 'auth/network-request-failed':
          setError('เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่');
          break;
        case 'auth/too-many-requests':
          setError('มีการทำรายการหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
          break;
        default:
          console.error('Register error:', err);
          setError('ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  const strengthLevel =
    password.length >= 10 ? 4 : password.length >= 8 ? 3 : password.length >= 6 ? 2 : 1;
  const strengthText = ['', 'สั้นเกินไป', 'พอใช้', 'ดี', 'แข็งแรง'][strengthLevel];
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const eyeIcon = (off) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );

  const goToApp = () => {
    // สมัครสมาชิกด้วย Firebase จะทำการ sign-in ให้โดยอัตโนมัติแล้ว
    navigate('/dashboard', { replace: true });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Anuphan:wght@400;500;600;700&display=swap');

        /* ทุกอย่างอยู่ใน .register-page เท่านั้น ไม่กระทบหน้าอื่น */
        .register-page,
        .register-page *,
        .register-page *::before,
        .register-page *::after { box-sizing: border-box; }

        .register-page {
          --lime: #8cff32;
          --lime-2: #c5ff43;
          --cyan: #18d8ff;
          --ink: #f4f8f6;
          --muted: #8fa3a7;

          position: fixed;
          inset: 0;
          display: flex;
          padding: 28px;
          overflow-x: hidden;
          overflow-y: auto;
          isolation: isolate;
          color: var(--ink);
          background: #0b1114;
          font-family: "Kanit", sans-serif;
          color-scheme: dark;
        }

        .register-page button,
        .register-page input { font: inherit; }

        /* ───────── พื้นหลัง ruu.png ───────── */
        .register-bg {
          position: fixed;
          inset: 0;
          z-index: -3;
          overflow: hidden;
          pointer-events: none;
          background: #0b1114;
        }

        .register-bg-img {
          position: absolute;
          inset: -2%;
          background: url('/ruu.png') center / cover no-repeat;
          animation: bg-drift 26s ease-in-out infinite alternate;
          will-change: transform;
        }

        .register-bg::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(105deg, rgba(4,10,13,.30) 0%, rgba(4,10,13,.46) 55%, rgba(4,10,13,.62) 100%),
            radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,.42) 100%);
        }

        @keyframes bg-drift {
          from { transform: scale(1.02) translate3d(0, 0, 0); }
          to   { transform: scale(1.09) translate3d(-1.2%, -1%, 0); }
        }

        /* ───────── เอฟเฟกต์แสงและอนุภาค ───────── */
        .ambient {
          position: fixed;
          inset: 0;
          z-index: -2;
          overflow: hidden;
          pointer-events: none;
        }

        .glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: .55;
        }
        .glow-a {
          width: 440px; height: 440px; top: -170px; right: -90px;
          background: rgba(24,216,255,.26);
          animation: ambient-a 14s ease-in-out infinite alternate;
        }
        .glow-b {
          width: 480px; height: 480px; bottom: -220px; left: -100px;
          background: rgba(140,255,50,.20);
          animation: ambient-b 17s ease-in-out infinite alternate;
        }
        @keyframes ambient-a { to { transform: translate(-50px, 40px) scale(1.1); } }
        @keyframes ambient-b { to { transform: translate(60px, -34px) scale(1.07); } }

        .particle {
          position: absolute;
          bottom: -12px;
          border-radius: 50%;
          opacity: 0;
          animation: rise linear infinite;
        }
        .particle.lime { background: var(--lime); box-shadow: 0 0 10px rgba(140,255,50,.8); }
        .particle.cyan { background: var(--cyan); box-shadow: 0 0 10px rgba(24,216,255,.8); }

        @keyframes rise {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          12%  { opacity: .75; }
          85%  { opacity: .45; }
          100% { transform: translateY(-105vh) translateX(26px); opacity: 0; }
        }

        /* ───────── การ์ดหลัก ───────── */
        .register-shell {
          --mx: 50%;
          --my: 0%;
          position: relative;
          width: min(980px, 100%);
          margin: auto;               /* จัดกลางเมื่อพอดีจอ และเลื่อนได้เมื่อจอเตี้ย */
          overflow: hidden;
          border: 1px solid rgba(120,170,180,.30);
          border-radius: 28px;
          background: rgba(6,13,16,.66);
          backdrop-filter: blur(22px) saturate(1.25);
          -webkit-backdrop-filter: blur(22px) saturate(1.25);
          box-shadow: 0 34px 90px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
          animation: shell-in .7s cubic-bezier(.2,.8,.2,1) both;
        }

        /* สปอตไลต์ตามเมาส์ */
        .register-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(420px circle at var(--mx) var(--my), rgba(140,255,50,.075), transparent 60%);
          transition: opacity .3s;
        }

        /* เส้นขอบไล่สี */
        .register-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 3;
          pointer-events: none;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(140,255,50,.55), transparent 30%, transparent 70%, rgba(24,216,255,.5));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        @keyframes shell-in {
          from { opacity: 0; transform: translateY(22px) scale(.975); }
          to   { opacity: 1; transform: none; }
        }

        .register-layout {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 42fr) minmax(0, 58fr);
          min-height: 620px;
        }

        /* ───────── ฝั่งซ้าย: แนะนำระบบ ───────── */
        .intro-panel {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 44px clamp(28px, 3.6vw, 48px);
          text-align: center;
          border-right: 1px solid rgba(90,130,138,.28);
          background:
            radial-gradient(circle at 50% 14%, rgba(140,255,50,.11), transparent 42%),
            linear-gradient(165deg, rgba(8,22,26,.62), rgba(5,11,14,.30));
        }

        .intro-panel::after {
          content: "";
          position: absolute;
          right: -1px;
          top: 16%;
          width: 2px;
          height: 68%;
          background: linear-gradient(transparent, var(--lime), var(--cyan), transparent);
          opacity: .65;
          animation: line-flow 5s ease-in-out infinite alternate;
        }
        @keyframes line-flow {
          from { top: 12%; opacity: .35; }
          to   { top: 20%; opacity: .8; }
        }

        .intro-content {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .brand-mark {
          width: min(250px, 80%);
          height: auto;
          object-fit: contain;
          margin: 0 auto 16px;
          animation: logo-in .9s .1s cubic-bezier(.2,.8,.2,1) both, logo-float 5s 1s ease-in-out infinite;
        }
        @keyframes logo-in {
          from { opacity: 0; transform: translateY(-14px) scale(.9); filter: blur(6px) drop-shadow(0 0 0 rgba(140,255,50,0)); }
          to   { opacity: 1; transform: none; filter: blur(0) drop-shadow(0 10px 28px rgba(140,255,50,.18)); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0);    filter: drop-shadow(0 10px 28px rgba(140,255,50,.12)); }
          50%      { transform: translateY(-5px); filter: drop-shadow(0 14px 36px rgba(140,255,50,.30)); }
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin: 0 auto 14px;
          padding: 7px 14px;
          border: 1px solid rgba(140,255,50,.24);
          border-radius: 999px;
          color: #b4c7c9;
          background: rgba(140,255,50,.06);
          font-family: "Anuphan", sans-serif;
          font-size: 12.5px;
          letter-spacing: .06em;
          animation: rise-in .7s .3s both;
        }
        .eyebrow i {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--lime);
          box-shadow: 0 0 10px rgba(140,255,50,.9);
          animation: dot-pulse 1.8s ease-in-out infinite;
        }
        @keyframes dot-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.5); opacity: .55; }
        }

        .intro-panel h1 {
          margin: 0;
          font-size: clamp(32px, 3.3vw, 42px);
          line-height: 1.18;
          font-weight: 600;
          letter-spacing: -.01em;
          animation: rise-in .8s .42s cubic-bezier(.2,.8,.2,1) both;
        }
        .intro-panel h1 .accent {
          display: inline-block;
          color: var(--lime);
          background: linear-gradient(100deg, #72ed2e, #d4ff5a, #72ed2e);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shine-text 4s linear infinite;
        }
        @keyframes shine-text { to { background-position: -200% 0; } }

        .intro-copy {
          max-width: 360px;
          margin: 12px auto 0;
          color: var(--muted);
          font-family: "Anuphan", sans-serif;
          font-size: 14px;
          line-height: 1.75;
          animation: rise-in .8s .54s both;
        }

        .feature-list {
          width: 100%;
          display: grid;
          gap: 10px;
          margin: 24px 0 0;
          padding: 0;
          list-style: none;
          text-align: left;
        }
        .feature-list li {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 9px 12px;
          border: 1px solid rgba(110,150,158,.18);
          border-radius: 13px;
          color: #c3cfd0;
          background: rgba(8,20,24,.45);
          font-family: "Anuphan", sans-serif;
          font-size: 13px;
          line-height: 1.45;
          opacity: 0;
          animation: feature-in .65s cubic-bezier(.2,.8,.2,1) forwards;
          transition: transform .25s ease, border-color .25s ease, background .25s ease;
        }
        .feature-list li:nth-child(1) { animation-delay: .68s; }
        .feature-list li:nth-child(2) { animation-delay: .80s; }
        .feature-list li:nth-child(3) { animation-delay: .92s; }
        .feature-list li:hover {
          transform: translateX(5px);
          border-color: rgba(140,255,50,.38);
          background: rgba(140,255,50,.06);
        }
        @keyframes feature-in {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .feature-icon {
          width: 32px; height: 32px;
          flex: 0 0 32px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(140,255,50,.22);
          border-radius: 10px;
          color: var(--lime);
          background: rgba(140,255,50,.07);
        }
        .feature-icon svg { width: 16px; height: 16px; }

        /* ───────── ฝั่งขวา: ฟอร์ม ───────── */
        .form-panel {
          display: flex;
          align-items: center;
          min-width: 0;
          padding: 40px clamp(24px, 4vw, 52px);
          background: rgba(3,8,10,.30);
        }

        .form-inner {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
        }

        .mobile-brand {
          display: none;
          width: 150px;
          height: auto;
          margin: 0 auto 18px;
        }

        .form-heading { margin-bottom: 22px; animation: rise-in .7s .2s both; }
        .form-heading h2 {
          margin: 0;
          font-size: 27px;
          font-weight: 600;
        }
        .form-heading p {
          margin: 6px 0 0;
          color: var(--muted);
          font-family: "Anuphan", sans-serif;
          font-size: 13.5px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 16px;
        }

        .form-group {
          min-width: 0;
          animation: rise-in .6s calc(.3s + var(--i, 0) * .08s) both;
        }

        .label-row {
          min-height: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 7px;
        }
        .field-label {
          color: #c6d2d3;
          font-family: "Anuphan", sans-serif;
          font-size: 12.5px;
          font-weight: 500;
        }

        .field { position: relative; }

        .field input {
          width: 100%;
          height: 48px;
          padding: 0 44px 0 42px;
          outline: none;
          border: 1px solid #2c4850;
          border-radius: 12px;
          color: #fff;
          background: rgba(5,16,20,.72);
          font-family: "Anuphan", sans-serif;
          font-size: 14px;
          transition: border-color .2s, background .2s, box-shadow .25s;
        }
        .field input:hover { border-color: #40676f; }
        .field input:focus {
          border-color: var(--lime);
          background: rgba(6,19,22,.92);
          box-shadow: 0 0 0 4px rgba(140,255,50,.10), 0 6px 22px rgba(140,255,50,.07);
        }
        .field input::placeholder { color: #567279; }

        .field-icon {
          position: absolute;
          left: 13px;
          top: 50%;
          width: 18px; height: 18px;
          transform: translateY(-50%);
          color: #668186;
          pointer-events: none;
          transition: color .2s, transform .25s;
        }
        .field:focus-within .field-icon {
          color: var(--lime);
          transform: translateY(-50%) scale(1.12);
        }

        .password-toggle {
          position: absolute;
          right: 6px;
          top: 50%;
          width: 36px; height: 36px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          border-radius: 9px;
          color: #86999e;
          background: transparent;
          cursor: pointer;
          transition: color .2s, background .2s;
        }
        .password-toggle:hover { color: var(--lime); background: rgba(140,255,50,.09); }
        .password-toggle svg { width: 19px; height: 19px; }

        .register-page :focus-visible {
          outline: 2px solid var(--cyan);
          outline-offset: 2px;
        }
        .field input:focus-visible { outline: none; }

        .strength { display: flex; align-items: center; gap: 7px; }
        .strength-bars { display: flex; gap: 3px; }
        .strength-bar {
          width: 16px; height: 4px;
          border-radius: 99px;
          background: #1f353b;
          transition: background .3s ease, transform .3s ease;
        }
        .strength-bar.active { transform: scaleY(1.25); }
        .strength-bar.active.level-1 { background: #ff5d73; }
        .strength-bar.active.level-2 { background: #ffb23e; }
        .strength-bar.active.level-3 { background: var(--cyan); }
        .strength-bar.active.level-4 { background: var(--lime); box-shadow: 0 0 8px rgba(140,255,50,.6); }

        .strength-text,
        .match-ok,
        .match-bad {
          font-family: "Anuphan", sans-serif;
          font-size: 11px;
        }
        .strength-text { color: #93a6aa; }
        .match-ok  { color: var(--lime); animation: pop .35s cubic-bezier(.2,1.6,.4,1) both; }
        .match-bad { color: #ff718b; }
        @keyframes pop {
          from { opacity: 0; transform: scale(.6); }
          to   { opacity: 1; transform: scale(1); }
        }

        .caps-hint {
          margin-top: 6px;
          color: #ffe735;
          font-family: "Anuphan", sans-serif;
          font-size: 11px;
          animation: rise-in .3s both;
        }

        .error-message {
          grid-column: 1 / -1;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 11px 13px;
          border: 1px solid rgba(255,75,113,.40);
          border-radius: 12px;
          color: #ff8fa3;
          background: rgba(150,15,48,.16);
          font-family: "Anuphan", sans-serif;
          font-size: 12.5px;
          line-height: 1.5;
          animation: shake .45s ease both;
        }
        .error-message svg { flex: 0 0 16px; width: 16px; height: 16px; margin-top: 2px; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }

        .form-actions {
          margin-top: 22px;
          animation: rise-in .6s .66s both;
        }

        .register-button,
        .success-button {
          position: relative;
          width: 100%;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          overflow: hidden;
          border: 0;
          border-radius: 13px;
          color: #071005;
          background: linear-gradient(100deg, #72ed2e, var(--lime-2));
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(125,255,45,.18);
          transition: transform .2s ease, box-shadow .25s ease, filter .2s ease;
        }
        /* แสงวิ่งผ่านปุ่ม */
        .register-button::after,
        .success-button::after {
          content: "";
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          left: -60%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent);
          transform: skewX(-20deg);
          animation: sheen 3.6s 1.4s ease-in-out infinite;
        }
        @keyframes sheen {
          0%   { left: -60%; }
          45%, 100% { left: 130%; }
        }
        .register-button:hover:not(:disabled),
        .success-button:hover {
          transform: translateY(-2px);
          filter: brightness(1.05);
          box-shadow: 0 16px 38px rgba(125,255,45,.30);
        }
        .register-button:active:not(:disabled),
        .success-button:active { transform: translateY(0) scale(.99); }
        .register-button:disabled { opacity: .75; cursor: progress; }
        .register-button:disabled::after { display: none; }

        .spinner {
          width: 17px; height: 17px;
          border: 2px solid rgba(7,16,5,.25);
          border-top-color: #071005;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .login-row {
          display: flex;
          justify-content: center;
          gap: 7px;
          margin-top: 18px;
          color: #7f959a;
          font-family: "Anuphan", sans-serif;
          font-size: 13.5px;
          animation: rise-in .6s .74s both;
        }
        .login-row a {
          position: relative;
          color: var(--lime);
          font-weight: 600;
          text-decoration: none;
        }
        .login-row a::after {
          content: "";
          position: absolute;
          left: 0; right: 0; bottom: -2px;
          height: 1.5px;
          background: currentColor;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform .3s ease;
        }
        .login-row a:hover { color: var(--lime-2); }
        .login-row a:hover::after { transform: scaleX(1); }

        .secure-note {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 6px;
          margin-top: 16px;
          color: #5d777c;
          font-family: "Anuphan", sans-serif;
          font-size: 11px;
          animation: rise-in .6s .8s both;
        }
        .secure-note svg { width: 14px; height: 14px; color: #759296; }

        /* ───────── หน้าสำเร็จ ───────── */
        .success-screen {
          width: 100%;
          max-width: 430px;
          margin: auto;
          text-align: center;
          animation: rise-in .5s both;
        }

        .success-icon {
          position: relative;
          width: 92px; height: 92px;
          display: grid;
          place-items: center;
          margin: 0 auto 24px;
          border: 1px solid rgba(140,255,50,.4);
          border-radius: 50%;
          color: var(--lime);
          background: rgba(140,255,50,.08);
          box-shadow: 0 0 44px rgba(140,255,50,.16);
          animation: icon-pop .6s cubic-bezier(.2,1.5,.4,1) both;
        }
        .success-icon::before,
        .success-icon::after {
          content: "";
          position: absolute;
          inset: -1px;
          border: 1px solid rgba(140,255,50,.45);
          border-radius: 50%;
          animation: ripple 2.4s ease-out infinite;
        }
        .success-icon::after { animation-delay: 1.2s; }
        @keyframes ripple {
          from { transform: scale(1);   opacity: .8; }
          to   { transform: scale(1.8); opacity: 0; }
        }
        @keyframes icon-pop {
          from { opacity: 0; transform: scale(.4) rotate(-20deg); }
          to   { opacity: 1; transform: none; }
        }

        .success-icon svg { width: 44px; height: 44px; }
        .success-icon path {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: draw .55s .35s ease forwards;
        }
        @keyframes draw { to { stroke-dashoffset: 0; } }

        .success-screen h2 {
          margin: 0;
          font-size: 29px;
          font-weight: 600;
          animation: rise-in .6s .3s both;
        }
        .success-screen h2 span { color: var(--lime); }

        .success-screen p {
          margin: 10px auto 0;
          color: #9aadb0;
          font-family: "Anuphan", sans-serif;
          font-size: 13.5px;
          line-height: 1.8;
          animation: rise-in .6s .4s both;
        }

        .account-chip {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          max-width: 100%;
          margin: 22px 0;
          padding: 10px 16px;
          border: 1px solid rgba(90,130,138,.45);
          border-radius: 999px;
          color: #cdd7d8;
          background: rgba(5,16,20,.72);
          font-family: "Anuphan", sans-serif;
          font-size: 13px;
          overflow-wrap: anywhere;
          animation: rise-in .6s .5s both;
        }
        .account-dot {
          flex: 0 0 7px;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--lime);
          box-shadow: 0 0 9px rgba(140,255,50,.8);
          animation: dot-pulse 1.8s ease-in-out infinite;
        }

        .success-button { animation: rise-in .6s .6s both; }

        .success-screen .success-hint {
          margin-top: 14px;
          color: #688085;
          font-size: 11px;
          animation: rise-in .6s .7s both;
        }

        /* keyframes กลางที่ใช้ร่วมกัน (ประกาศครั้งเดียว) */
        @keyframes rise-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ───────── Responsive ───────── */
        @media (max-width: 860px) {
          .register-page { padding: 18px; }
          .register-shell { width: min(560px, 100%); }
          .register-layout { grid-template-columns: 1fr; min-height: 0; }
          .intro-panel { display: none; }
          .form-panel { padding: 34px 36px; }
          .mobile-brand { display: block; }
        }

        @media (max-width: 560px) {
          .register-page { padding: 12px; }
          .register-shell { border-radius: 22px; }
          .form-panel { padding: 28px 20px; }
          .form-heading { margin-bottom: 18px; }
          .form-heading h2 { font-size: 24px; }
          .form-grid { grid-template-columns: 1fr; gap: 14px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .register-page *,
          .register-page *::before,
          .register-page *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            animation-delay: 0s !important;
            transition-duration: .01ms !important;
          }
          .particle { display: none; }
        }
      `}</style>

      <div className="register-page">
        <div className="register-bg" aria-hidden="true">
          <div className="register-bg-img" />
        </div>

        <div className="ambient" aria-hidden="true">
          <span className="glow glow-a" />
          <span className="glow glow-b" />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={`particle ${p.tone}`}
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                animationDelay: p.delay,
                animationDuration: p.dur,
              }}
            />
          ))}
        </div>

        <main className="register-shell" ref={shellRef} onMouseMove={handleCardMove}>
          <div className="register-layout">
            <section className="intro-panel" aria-label="ข้อมูลระบบ">
              <div className="intro-content">
                <img
                  src="/fittrack-hero-logo.png"
                  alt="FITTRACK"
                  className="brand-mark"
                  draggable="false"
                />

                <div className="eyebrow">
                  <i />
                  AI MOTION TRACKING
                </div>

                <h1>
                  เริ่มต้นเส้นทาง
                  <br />
                  สุขภาพที่ <span className="accent">ดีกว่า</span>
                </h1>

                <p className="intro-copy">
                  สร้างบัญชี FITTRACK เพื่อบันทึกการออกกำลังกาย
                  ติดตามผล และใช้งานระบบอัจฉริยะได้อย่างต่อเนื่อง
                </p>

                <ul className="feature-list">
                  <li>
                    <span className="feature-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 3 20 7.5v5c0 4.4-3.1 7.1-8 8.5-4.9-1.4-8-4.1-8-8.5v-5L12 3Z" />
                        <path d="m8.5 12 2.3 2.3 4.7-4.8" />
                      </svg>
                    </span>
                    ข้อมูลบัญชีจัดเก็บอย่างเป็นระบบ
                  </li>
                  <li>
                    <span className="feature-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M4 17V9m5 8V5m5 12v-6m5 6V3" />
                      </svg>
                    </span>
                    ติดตามความก้าวหน้าการออกกำลังกาย
                  </li>
                  <li>
                    <span className="feature-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 7.5v5l3.2 2" />
                      </svg>
                    </span>
                    พร้อมใช้งานทันทีหลังสมัครสมาชิก
                  </li>
                </ul>
              </div>
            </section>

            <section className="form-panel">
              {!registered ? (
                <div className="form-inner">
                  <img
                    src="/fittrack-hero-logo.png"
                    alt="FITTRACK"
                    className="mobile-brand"
                    draggable="false"
                  />

                  <div className="form-heading">
                    <h2>สร้างบัญชีผู้ใช้งาน</h2>
                    <p>กรอกข้อมูลด้านล่างเพื่อเริ่มใช้งาน FITTRACK</p>
                  </div>

                  <form onSubmit={handleRegister}>
                    <div className="form-grid">
                      <div className="form-group" style={{ '--i': 0 }}>
                        <div className="label-row">
                          <label className="field-label" htmlFor="name">ชื่อผู้ใช้งาน</label>
                        </div>
                        <div className="field">
                          <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="ชื่อที่ต้องการแสดง"
                            autoComplete="name"
                            required
                          />
                          <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <circle cx="12" cy="8" r="3.6" />
                            <path d="M4.5 20c.9-3.6 3.8-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
                          </svg>
                        </div>
                      </div>

                      <div className="form-group" style={{ '--i': 1 }}>
                        <div className="label-row">
                          <label className="field-label" htmlFor="register-email">อีเมล</label>
                        </div>
                        <div className="field">
                          <input
                            id="register-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            autoComplete="email"
                            required
                          />
                          <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="5" width="18" height="14" rx="3" />
                            <path d="m4 8 8 5.5L20 8" />
                          </svg>
                        </div>
                      </div>

                      <div className="form-group" style={{ '--i': 2 }}>
                        <div className="label-row">
                          <label className="field-label" htmlFor="register-password">รหัสผ่าน</label>
                          {password.length > 0 && (
                            <div className="strength" aria-live="polite">
                              <div className="strength-bars">
                                {[1, 2, 3, 4].map((n) => (
                                  <div
                                    key={n}
                                    className={`strength-bar ${n <= strengthLevel ? 'active' : ''} level-${strengthLevel}`}
                                  />
                                ))}
                              </div>
                              <span className="strength-text">{strengthText}</span>
                            </div>
                          )}
                        </div>

                        <div className="field">
                          <input
                            id="register-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handleCaps}
                            onKeyUp={handleCaps}
                            onBlur={() => setCapsOn(false)}
                            placeholder="อย่างน้อย 6 ตัวอักษร"
                            autoComplete="new-password"
                            minLength={6}
                            required
                          />
                          <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
                            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
                          </svg>
                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                          >
                            {eyeIcon(showPassword)}
                          </button>
                        </div>
                        {capsOn && <div className="caps-hint">Caps Lock เปิดอยู่</div>}
                      </div>

                      <div className="form-group" style={{ '--i': 3 }}>
                        <div className="label-row">
                          <label className="field-label" htmlFor="confirm-password">ยืนยันรหัสผ่าน</label>
                          {confirmPassword.length > 0 && (
                            passwordsMatch
                              ? <span className="match-ok">✓ ตรงกัน</span>
                              : <span className="match-bad">ยังไม่ตรงกัน</span>
                          )}
                        </div>

                        <div className="field">
                          <input
                            id="confirm-password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="กรอกรหัสผ่านอีกครั้ง"
                            autoComplete="new-password"
                            required
                          />
                          <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M12 3.2 19 6v5.4c0 4.4-2.9 7.6-7 9.4-4.1-1.8-7-5-7-9.4V6l7-2.8Z" />
                            <path d="m8.8 12 2.2 2.2 4.2-4.4" />
                          </svg>
                          <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                          >
                            {eyeIcon(showConfirmPassword)}
                          </button>
                        </div>
                      </div>

                      {error && (
                        <div className="error-message" role="alert" key={error}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3.5 22 20H2L12 3.5Z" />
                            <path d="M12 10v4.5M12 17.2v.1" />
                          </svg>
                          <span>{error}</span>
                        </div>
                      )}
                    </div>

                    <div className="form-actions">
                      <button type="submit" className="register-button" disabled={loading}>
                        {loading ? (
                          <>
                            <span className="spinner" />
                            กำลังสร้างบัญชี...
                          </>
                        ) : (
                          'สร้างบัญชีและดำเนินการต่อ'
                        )}
                      </button>
                    </div>
                  </form>

                  <div className="login-row">
                    <span>มีบัญชีอยู่แล้ว?</span>
                    <Link to="/login">เข้าสู่ระบบ</Link>
                  </div>

                  <div className="secure-note">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="5" y="10" width="14" height="10" rx="2.5" />
                      <path d="M8 10V7.8a4 4 0 0 1 8 0V10" />
                    </svg>
                    ข้อมูลบัญชีของคุณจะถูกบันทึกอย่างปลอดภัย
                  </div>
                </div>
              ) : (
                <div className="success-screen">
                  <div className="success-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.2 4.2L19.5 6.5" />
                    </svg>
                  </div>

                  <h2>สร้างบัญชี <span>สำเร็จ!</span></h2>
                  <p>
                    ยืนยันการสมัครสมาชิกเรียบร้อยแล้ว<br />
                    คุณสามารถเข้าสู่ระบบต่อได้ทันที โดยไม่ต้องกลับไปหน้าเข้าสู่ระบบ
                  </p>

                  <div className="account-chip">
                    <span className="account-dot" />
                    {registeredUser || 'ผู้ใช้งาน'} · {registeredEmail}
                  </div>

                  <button type="button" className="success-button" onClick={goToApp}>
                    ยืนยันและเข้าสู่ระบบ
                  </button>

                  <p className="success-hint">
                    ระบบเข้าสู่บัญชีของคุณไว้เรียบร้อยแล้ว
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}