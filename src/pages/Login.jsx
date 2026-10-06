import { useState, useEffect, useRef } from 'react';
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
  const videoRef = useRef(null);
  const [soundOn, setSoundOn] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const shellRef = useRef(null);
  const userToggledRef = useRef(false); // ผู้ใช้กดปุ่มลำโพงเองแล้ว -> ห้ามระบบเปิดเสียงทับ

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

  // เบราว์เซอร์ส่วนใหญ่ห้ามเล่น "เสียง" อัตโนมัติก่อนที่ผู้ใช้จะโต้ตอบกับหน้าเว็บ
  // ลำดับ: 1) ลองเล่นพร้อมเสียงทันที  2) ถ้าถูกบล็อก เล่นแบบไม่มีเสียงไปก่อน
  //        3) พอผู้ใช้แตะ/คลิก/พิมพ์ครั้งแรก ค่อยเปิดเสียง (ปุ่มลำโพงมุมซ้ายล่างใช้ปิด/เปิดเอง)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false; // กัน promise ที่ค้างอยู่ทำงานต่อหลัง unmount / StrictMode รันซ้ำ

    const events = ['pointerdown', 'keydown', 'touchstart'];
    const removeListeners = () => events.forEach((e) => window.removeEventListener(e, unlockOnGesture, true));

    function unlockOnGesture(e) {
      if (cancelled || userToggledRef.current) return; // ผู้ใช้เลือกเองแล้ว ไม่เปิดเสียงทับ
      // ถ้าผู้ใช้กดปุ่มลำโพงเอง ให้ปุ่มจัดการ ไม่ต้องเปิดซ้ำ
      if (e.target && e.target.closest && e.target.closest('.sound-toggle')) return;
      v.muted = false;
      v.play()
        .then(() => {
          if (cancelled) return;
          setSoundOn(true);
          removeListeners();
        })
        .catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
    }

    v.muted = false;
    v.play()
      .then(() => {
        if (!cancelled) setSoundOn(true);
      })
      .catch(() => {
        if (cancelled) return; // ถ้า unmount ไปแล้ว ห้ามเพิ่ม listener ค้างไว้
        v.muted = true;
        v.play().catch(() => {});
        setSoundOn(false);
        events.forEach((e) => window.addEventListener(e, unlockOnGesture, true));
      });

    return () => {
      cancelled = true;
      removeListeners();
      v.pause(); // หยุดวิดีโอ/เสียงเมื่อออกจากหน้า Login
    };
  }, []);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    userToggledRef.current = true;
    const next = !soundOn;
    v.muted = !next;
    if (next) v.play().catch(() => {});
    setSoundOn(next);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err) {
      switch (err?.code) {
        case 'auth/too-many-requests':
          setError('พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
          break;
        case 'auth/network-request-failed':
          setError('เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่');
          break;
        case 'auth/user-disabled':
          setError('บัญชีนี้ถูกระงับการใช้งาน');
          break;
        case 'auth/invalid-email':
          setError('รูปแบบอีเมลไม่ถูกต้อง');
          break;
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
          break;
        default:
          console.error('Login error:', err);
          setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
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

        /* ล้างสไตล์ตั้งต้นของโปรเจกต์ (เช่น #root จำกัดความกว้าง/มี border/padding) ที่ทำให้เห็นเส้นดำและพื้นหลังไม่เต็มจอ */
        html,
        body,
        #root {
          width: 100%;
          height: 100%;
          max-width: none;
          margin: 0;
          padding: 0;
          border: 0;
          background: #14181f;
          display: block;
          text-align: left;
          place-items: unset;
        }

        body {
          overflow: hidden;
          font-family: "Kanit", sans-serif;
        }

        .login-page {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          z-index: 0;
          display: flex;
          padding: 32px;
          padding-left: calc(50% + 32px); /* วิดีโอแบ่งสองซีก: ซ้ายเข้ม (โลโก้) / ขวาสว่าง (ที่ของฟอร์ม) */
          overflow-x: hidden;
          overflow-y: auto;
          background-color: #14181f;
        }

        /* =====================================================
           วิดีโอพื้นหลัง: ย่อโลโก้ให้เล็กลง และจัดไว้กึ่งกลางซีกซ้ายของจอ
           (ปรับค่าได้ที่ตัวแปรด้านล่างนี้ที่เดียว)
           ===================================================== */
        .video-stage {
          --logo-scale: 0.76;  /* ขนาดโลโก้: 1 = เดิม, ยิ่งน้อยยิ่งเล็ก */
          --logo-x: 0.305;     /* จุดกึ่งกลางโลโก้ในวิดีโอ แนวนอน (0-1) */
          --logo-y: 0.494;     /* จุดกึ่งกลางโลโก้ในวิดีโอ แนวตั้ง (0-1) */
          --target-x: 25vw;    /* ตำแหน่งที่ต้องการ = กึ่งกลางซีกซ้าย */
          --target-y: 50vh;
          --vid-w: max(100vw, 177.78vh);   /* ขนาดเฟรมวิดีโอ 16:9 แบบ cover */
          --vid-h: max(56.25vw, 100vh);

          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          background: #14181f;
          pointer-events: none;
        }

        .video-frame {
          position: absolute;
          left: 50%;
          top: 50%;
          width: var(--vid-w);
          height: var(--vid-h);
          background: url('/background-poster.jpg') center / cover no-repeat;
          transform:
            translate(
              calc(-50% + var(--target-x) - 50vw - (var(--logo-x) - 0.5) * var(--logo-scale) * var(--vid-w)),
              calc(-50% + var(--target-y) - 50vh - (var(--logo-y) - 0.5) * var(--logo-scale) * var(--vid-h))
            )
            scale(var(--logo-scale));
          /* เกลี่ยขอบวิดีโอให้กลืนกับพื้นหลังสีเข้ม ไม่เห็นเป็นกรอบสี่เหลี่ยม */
          -webkit-mask-image:
            linear-gradient(90deg, transparent 0, #000 10%, #000 90%, transparent 100%),
            linear-gradient(180deg, transparent 0, #000 14%, #000 86%, transparent 100%);
          -webkit-mask-composite: source-in;
          mask-image:
            linear-gradient(90deg, transparent 0, #000 10%, #000 90%, transparent 100%),
            linear-gradient(180deg, transparent 0, #000 14%, #000 86%, transparent 100%);
          mask-composite: intersect;
        }

        .bg-video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-video {
            display: none;
          }

          .login-shell,
          .login-shell *,
          .login-shell::before,
          .login-card::before,
          .login-card::after,
          .right-ambient * {
            animation-duration: 0.01ms !important;
            animation-delay: 0s !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        .sound-toggle {
          position: fixed;
          left: 24px;
          bottom: 24px;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 8px;
          height: 42px;
          padding: 0 16px;
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 999px;
          background: rgba(8,15,26,0.55);
          backdrop-filter: blur(10px);
          color: #e2f1ff;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .sound-toggle:hover {
          background: rgba(37,99,235,0.55);
          transform: translateY(-1px);
        }

        .sound-icon {
          font-size: 16px;
          line-height: 1;
        }

        .login-page::before,
        .login-page::after {
          content: "";
          display: none;
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
          max-width: 500px;
          margin: auto; /* อยู่กึ่งกลางซีกขวาของจอ */
          flex-shrink: 0;
          min-height: 600px;
          display: grid;
          grid-template-columns: 1fr;
          position: relative;
          z-index: 2;
          overflow: hidden;
          border: 0;
          border-radius: 28px;
          background: #ffffff;
          box-shadow:
            0 40px 90px rgba(8,145,178,0.16),
            0 12px 32px rgba(15,23,42,0.08);
          animation: card-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .login-brand-panel {
          position: relative;
          display: none; /* โลโก้และชื่อ FITTRACK อยู่ในภาพพื้นหลังแล้ว */
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

        /* =====================================================
           ฝั่งขวา: การ์ดเข้าสู่ระบบ (โทนฟ้า-ไซแอนจากโลโก้)
           ===================================================== */

        /* แสง/ลวดลายพื้นหลัง เฉพาะซีกขวาของจอ */
        .right-ambient {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          left: 50%;
          z-index: 1;
          overflow: hidden;
          pointer-events: none;
        }

        .right-ambient::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(15,23,42,0.13) 1px, transparent 1.3px);
          background-size: 24px 24px;
          -webkit-mask-image: radial-gradient(ellipse at 50% 50%, #000 15%, transparent 72%);
          mask-image: radial-gradient(ellipse at 50% 50%, #000 15%, transparent 72%);
        }

        .ambient-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
        }

        .blob-a {
          width: 440px;
          height: 440px;
          top: -140px;
          right: -90px;
          background: radial-gradient(circle, rgba(34,211,238,0.50), transparent 70%);
          animation: drift-a 16s ease-in-out infinite alternate;
        }

        .blob-b {
          width: 480px;
          height: 480px;
          bottom: -180px;
          right: -120px;
          background: radial-gradient(circle, rgba(59,130,246,0.40), transparent 70%);
          animation: drift-b 20s ease-in-out infinite alternate;
        }

        @keyframes drift-a {
          to { transform: translate(-70px, 90px) scale(1.12); }
        }

        @keyframes drift-b {
          to { transform: translate(90px, -70px) scale(1.1); }
        }


        /* การ์ดเข้าฉาก */
        @keyframes card-in {
          from { opacity: 0; transform: translateY(28px) scale(0.975); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* เนื้อหาในการ์ดทยอยขึ้นทีละส่วน (ปรับจังหวะที่ --i) */
        .reveal {
          opacity: 0;
          animation: rise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
          animation-delay: calc(var(--i, 0) * 90ms + 350ms);
        }

        @keyframes rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* กรอบเรืองแสงวิ่งรอบการ์ด เหมือนวงโคจรในแอนิเมชันโลโก้ */
        @property --ang {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        .login-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 4;
          padding: 1.5px;
          border-radius: inherit;
          pointer-events: none;
          background:
            conic-gradient(
              from var(--ang),
              transparent 0deg,
              transparent 40deg,
              #22d3ee 95deg,
              #3b82f6 145deg,
              transparent 210deg,
              transparent 360deg
            ),
            linear-gradient(rgba(148,163,184,0.30), rgba(148,163,184,0.30));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: ring-spin 6s linear infinite;
        }

        @keyframes ring-spin {
          to { --ang: 360deg; }
        }

        .login-card {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 56px 50px 44px;
          background:
            radial-gradient(circle at 100% 0%, rgba(34,211,238,0.13), transparent 42%),
            radial-gradient(circle at 0% 100%, rgba(59,130,246,0.09), transparent 40%),
            #ffffff;
        }

        .login-card > * {
          position: relative;
          z-index: 1;
        }

        /* สปอตไลต์ตามเมาส์ */
        .login-card::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.35s ease;
          background: radial-gradient(
            380px circle at var(--mx, 50%) var(--my, 0%),
            rgba(34,211,238,0.14),
            transparent 62%
          );
        }

        .login-shell:hover .login-card::before {
          opacity: 1;
        }

        /* เส้นสแกนบางๆ วิ่งผ่านการ์ดเป็นระยะ */
        .login-card::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 110px;
          z-index: 0;
          pointer-events: none;
          background: linear-gradient(180deg, transparent, rgba(34,211,238,0.09), transparent);
          transform: translateY(-120px);
          animation: scan 8s ease-in-out 2.5s infinite;
        }

        @keyframes scan {
          0%   { transform: translateY(-120px); opacity: 0; }
          10%  { opacity: 1; }
          55%  { transform: translateY(760px); opacity: 1; }
          56%, 100% { transform: translateY(760px); opacity: 0; }
        }

        .login-header {
          margin-bottom: 32px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 12px;
          color: #0891b2;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.3em;
        }

        .eyebrow::before {
          content: "";
          width: 0;
          height: 2px;
          border-radius: 2px;
          background: linear-gradient(90deg, #22d3ee, #3b82f6);
          animation: line-grow 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.7s forwards;
        }

        @keyframes line-grow {
          to { width: 30px; }
        }

        .login-header h1 {
          margin: 0 0 8px;
          padding: 0.05em 0;
          font-size: 34px;
          line-height: 1.5;
          font-weight: 800;
          background: linear-gradient(100deg, #0b1220 0%, #1e3a8a 38%, #0ea5e9 68%, #0b1220 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }

        .login-header h1.reveal {
          animation:
            rise 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both,
            title-shine 8s ease-in-out infinite;
          animation-delay: calc(var(--i, 0) * 90ms + 350ms), 1.5s;
        }

        @keyframes title-shine {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }

        .login-header p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.7;
        }

        .form-group {
          margin-bottom: 18px;
        }

        /* ช่องกรอกแบบ label ลอย + ไอคอนนำหน้า (โทนฟ้าให้เข้ากับปุ่ม/โลโก้) */
        .field {
          position: relative;
        }

        .field input {
          width: 100%;
          height: 62px;
          padding: 25px 16px 7px 54px;
          outline: none;
          border: 1.5px solid #d3e0d2;
          border-radius: 16px;
          background: #f0f5ef;
          color: #14231a;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 500;
          transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
        }

        .field input:hover {
          border-color: #a9c7a6;
          background: #f5f9f4;
        }

        .field input:focus {
          border-color: #4a9a2e;
          background: #f7fbf6;
          box-shadow:
            0 0 0 4px rgba(74,154,46,0.14),
            0 10px 24px rgba(74,154,46,0.10);
        }

        .field label {
          position: absolute;
          left: 54px;
          top: 19px;
          color: #78907a;
          font-size: 14px;
          line-height: 1.5;
          pointer-events: none;
          transition: top 0.2s ease, font-size 0.2s ease, color 0.2s ease;
        }

        .field input:focus + label,
        .field input:not(:placeholder-shown) + label,
        .field input:-webkit-autofill + label {
          top: 8px;
          font-size: 11px;
          font-weight: 600;
          color: #5f7a62;
        }

        .field input:focus + label {
          color: #3b8a24;
        }

        /* ไอคอนนำหน้าในวงกลมสีอ่อน */
        .field-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          width: 34px;
          height: 34px;
          padding: 8px;
          transform: translateY(-50%);
          border-radius: 11px;
          background: #e1ecdf;
          color: #5f7a62;
          pointer-events: none;
          transition: background 0.25s ease, color 0.25s ease;
        }

        .field input:focus ~ .field-icon {
          background: #d3e6cf;
          color: #3b8a24;
        }

        /* เส้นไล่สีวิ่งออกที่ขอบล่างเมื่อโฟกัส */
        .field-line {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 0;
          height: 2px;
          border-radius: 2px;
          background: linear-gradient(90deg, #3b8a24, #9acd32);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          pointer-events: none;
        }

        .field input:focus ~ .field-line {
          transform: scaleX(1);
        }

        /* กัน autofill ของเบราว์เซอร์ทับสีช่อง */
        .field input:-webkit-autofill,
        .field input:-webkit-autofill:focus {
          -webkit-text-fill-color: #14231a;
          -webkit-box-shadow: 0 0 0 100px #f0f5ef inset;
          transition: background-color 9999s ease-out 0s;
        }

        .field.has-toggle input {
          padding-right: 60px;
        }

        .password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: #78907a;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .password-toggle svg {
          width: 20px;
          height: 20px;
        }

        .password-toggle:hover,
        .password-toggle:focus-visible {
          outline: none;
          background: #e1ecdf;
          color: #3b8a24;
        }

        /* เตือน Caps Lock */
        .caps-hint {
          max-height: 0;
          margin-top: 0;
          overflow: hidden;
          opacity: 0;
          color: #b45309;
          font-size: 12px;
          transition: max-height 0.25s ease, opacity 0.25s ease, margin-top 0.25s ease;
        }

        .caps-hint.show {
          max-height: 28px;
          margin-top: 8px;
          opacity: 1;
        }

        .error-message {
          margin-bottom: 18px;
          padding: 10px 13px;
          border: 1px solid #e2a0ad;
          border-radius: 8px;
          background: #fff0f2;
          color: #b52e4b;
          font-size: 13px;
          line-height: 1.6;
          animation: shake 0.45s ease both;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }

        /* ปุ่มเข้าสู่ระบบ: ไล่สี + แสงกวาดตอนชี้ + เรืองเบาๆ เมื่อกรอกครบ */
        .login-button {
          position: relative;
          width: 100%;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          overflow: hidden;
          border: none;
          border-radius: 14px;
          background: linear-gradient(110deg, #1d4ed8 0%, #2563eb 38%, #0ea5e9 100%);
          background-size: 200% 100%;
          background-position: 0% 0;
          color: #ffffff;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.06em;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(37,99,235,0.26);
          transition: background-position 0.5s ease, transform 0.2s ease, box-shadow 0.3s ease, opacity 0.2s ease;
        }

        .login-button::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 38%;
          height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent);
          transform: skewX(-20deg);
          pointer-events: none;
        }

        .login-button:hover:not(:disabled) {
          background-position: 100% 0;
          transform: translateY(-2px);
          box-shadow: 0 18px 38px rgba(14,165,233,0.36);
        }

        .login-button:hover:not(:disabled)::after {
          animation: sweep 0.9s ease;
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }

        .login-button.ready:not(:hover) {
          animation: glow-pulse 2.4s ease-in-out infinite;
        }

        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 12px 28px rgba(37,99,235,0.26), 0 0 0 0 rgba(34,211,238,0.42); }
          50%      { box-shadow: 0 12px 28px rgba(37,99,235,0.26), 0 0 0 9px rgba(34,211,238,0); }
        }

        .login-button:disabled {
          cursor: progress;
          opacity: 0.85;
        }

        .login-button:disabled::after {
          animation: sweep 1.3s linear infinite;
        }

        @keyframes sweep {
          to { left: 130%; }
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
          margin: 26px 0 22px;
          color: #94a3b8;
          font-size: 11px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, #dbe4ef);
        }

        .divider::after {
          background: linear-gradient(90deg, #dbe4ef, transparent);
        }

        .register-text {
          margin: 0;
          text-align: center;
          color: #64748b;
          font-size: 14px;
        }

        .register-text a {
          position: relative;
          display: inline-block;
          margin-left: 6px;
          color: #2563eb;
          font-weight: 700;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .register-text a::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -2px;
          height: 2px;
          border-radius: 2px;
          background: linear-gradient(90deg, #22d3ee, #2563eb);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .register-text a:hover {
          color: #1d4ed8;
        }

        .register-text a:hover::after {
          transform: scaleX(1);
        }

        .login-footer {
          margin: 30px 0 0;
          text-align: center;
          color: #94a3b8;
          font-size: 10px;
          letter-spacing: 0.04em;
        }

        @media (max-width: 850px) {
          .video-stage {
            --target-x: 50vw;
            --logo-scale: 0.6;
          }

          .login-page {
            padding: 20px;
          }

          .login-shell {
            margin: auto;
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

          .sound-toggle {
            left: 14px;
            bottom: 14px;
            width: 42px;
            padding: 0;
            justify-content: center;
          }

          .sound-label {
            display: none;
          }

          .right-ambient {
            display: none;
          }

          .login-header h1 {
            font-size: 29px;
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
            font-size: 26px;
          }

          .login-header p {
            font-size: 12px;
          }
        }
      `}</style>

      <div className="login-page">
        <div className="video-stage" aria-hidden="true">
          <div className="video-frame">
            <video
              ref={videoRef}
              className="bg-video"
              src="/background.mp4"
              poster="/background-poster.jpg"
              autoPlay
              loop
              playsInline
              preload="auto"
            />
          </div>
        </div>

        <button
          type="button"
          className="sound-toggle"
          onClick={toggleSound}
          aria-label={soundOn ? 'ปิดเสียงพื้นหลัง' : 'เปิดเสียงพื้นหลัง'}
        >
          <span className="sound-icon">{soundOn ? '🔊' : '🔇'}</span>
          <span className="sound-label">{soundOn ? 'ปิดเสียง' : 'แตะเพื่อเปิดเสียง'}</span>
        </button>

        <div className="right-ambient" aria-hidden="true">
          <span className="ambient-blob blob-a" />
          <span className="ambient-blob blob-b" />
        </div>

        <div className="login-shell" ref={shellRef} onMouseMove={handleCardMove}>

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
              <span className="eyebrow reveal" style={{ '--i': 0 }}>MEMBER LOGIN</span>

              <h1 className="reveal" style={{ '--i': 1 }}>ยินดีต้อนรับกลับ</h1>
              <p className="reveal" style={{ '--i': 2 }}>เข้าสู่ระบบเพื่อเริ่มต้นการออกกำลังกายของคุณ</p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="form-group reveal" style={{ '--i': 3 }}>
                <div className="field">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder=" "
                    autoComplete="email"
                    required
                  />
                  <label htmlFor="email">อีเมล</label>
                  <span className="field-line" />
                  <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <path d="m4 8 8 5.5L20 8" />
                  </svg>
                </div>
              </div>

              <div className="form-group reveal" style={{ '--i': 4 }}>
                <div className="field has-toggle">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleCaps}
                    onKeyUp={handleCaps}
                    onBlur={() => setCapsOn(false)}
                    placeholder=" "
                    autoComplete="current-password"
                    required
                  />
                  <label htmlFor="password">รหัสผ่าน</label>
                  <span className="field-line" />
                  <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
                    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
                  </svg>

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                      <circle cx="12" cy="12" r="3" />
                      {showPassword && <path d="M4 4l16 16" />}
                    </svg>
                  </button>
                </div>

                <div className={`caps-hint ${capsOn ? 'show' : ''}`} role="status">
                  Caps Lock เปิดอยู่
                </div>
              </div>

              {error && (
                <div className="error-message" role="alert">
                  ⚠️ {error}
                </div>
              )}

              <div className="reveal" style={{ '--i': 5 }}>
                <button
                  type="submit"
                  className={`login-button ${email && password && !loading ? 'ready' : ''}`}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      กำลังเข้าสู่ระบบ...
                    </>
                  ) : (
                    'เข้าสู่ระบบ'
                  )}
                </button>
              </div>
            </form>

            <div className="divider reveal" style={{ '--i': 6 }}>
              <span>หรือ</span>
            </div>

            <p className="register-text reveal" style={{ '--i': 6 }}>
              ยังไม่มีบัญชี?
              <Link to="/register">สมัครสมาชิก</Link>
            </p>

            <p className="login-footer reveal" style={{ '--i': 7 }}>
              © 2026 FITTRACK · AI Exercise Tracking
            </p>
          </div>

        </div>
      </div>
    </>
  );
}