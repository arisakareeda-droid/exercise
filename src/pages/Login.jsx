import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';

// ระบบ OTP ทำงานผ่าน Cloud Functions (ดู functions/index.js) เพราะ Firebase Auth ฝั่ง client ส่ง OTP ทางอีเมลเองไม่ได้
// ถ้า deploy Functions ไว้คนละ region ให้ใส่ชื่อ region เป็นอาร์กิวเมนต์ที่ 2 เช่น getFunctions(auth.app, 'asia-southeast1')
const functions = getFunctions(auth.app);
const callRequestOtp = httpsCallable(functions, 'requestPasswordResetOtp');
const callVerifyOtp = httpsCallable(functions, 'verifyPasswordResetOtp');
const callResetPassword = httpsCallable(functions, 'resetPasswordWithOtp');

const OTP_LEN = 6;
const RESEND_SECONDS = 60;
const MIN_PASSWORD = 6; // ปรับให้ตรงกับกฎรหัสผ่านในหน้าสมัครสมาชิก

const maskEmail = (v) => {
  const [name, domain] = v.split('@');
  if (!domain) return v;
  const keep = name.length > 2 ? 2 : 1;
  return `${name.slice(0, keep)}${'*'.repeat(Math.max(1, Math.min(name.length - keep, 5)))}@${domain}`;
};

const getStrength = (pw) => {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  const score = Math.max(1, s);
  return { score, label: ['', 'อ่อน', 'พอใช้', 'ดี', 'แข็งแรง'][score] };
};

const resetErrorMessage = (err, step) => {
  switch (err?.code) {
    case 'functions/invalid-argument':
      if (step === 'otp') return 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่';
      if (step === 'email') return 'รูปแบบอีเมลไม่ถูกต้อง';
      return 'รหัสผ่านใหม่ไม่ปลอดภัยพอ กรุณาตั้งรหัสผ่านใหม่';
    case 'functions/deadline-exceeded':
    case 'functions/permission-denied':
      return step === 'newpass'
        ? 'หมดเวลาทำรายการ กรุณาขอรหัส OTP ใหม่อีกครั้ง'
        : 'รหัส OTP หมดอายุแล้ว กรุณากดขอรหัสใหม่';
    case 'functions/resource-exhausted':
      return step === 'otp'
        ? 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่'
        : 'ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
    case 'functions/unavailable':
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
    default:
      console.error('Reset password error:', err);
      return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  }
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // ลืมรหัสผ่าน: view = login | email | otp | newpass
  const [view, setView] = useState('login');
  const [swapped, setSwapped] = useState(false); // true หลังสลับหน้าครั้งแรก -> ใช้จังหวะแอนิเมชันที่เร็วกว่าตอนโหลด
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LEN).fill(''));
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const changeView = (next) => {
    setError('');
    setSwapped(true);
    setView(next);
  };

  const goForgot = () => {
    setNotice('');
    setResetEmail(email);
    changeView('email');
  };

  const backToLogin = () => {
    setOtp(Array(OTP_LEN).fill(''));
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    changeView('login');
  };

  // ขั้น 1: ขอ OTP (ใช้ทั้งตอนกด "ส่งรหัส OTP" และ "ขอรหัสใหม่")
  const requestOtp = async (isResend = false) => {
    setError('');
    setResetLoading(true);
    try {
      await callRequestOtp({ email: resetEmail.trim() });
      setOtp(Array(OTP_LEN).fill(''));
      setCooldown(RESEND_SECONDS);
      if (isResend) otpRefs.current[0]?.focus();
      else changeView('otp');
    } catch (err) {
      setError(resetErrorMessage(err, 'email'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    requestOtp(false);
  };

  // ขั้น 2: ตรวจ OTP
  const submitOtp = async (code) => {
    if (resetLoading) return;
    setError('');
    setResetLoading(true);
    try {
      const res = await callVerifyOtp({ email: resetEmail.trim(), otp: code });
      setResetToken(res.data.resetToken);
      changeView('newpass');
    } catch (err) {
      setError(resetErrorMessage(err, 'otp'));
      setOtp(Array(OTP_LEN).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length === OTP_LEN) submitOtp(code);
  };

  // กรอก/วางตัวเลขลงช่อง OTP (รองรับ autofill จาก SMS/อีเมลบนมือถือที่ใส่ทั้ง 6 หลักในช่องเดียว)
  const fillOtp = (start, digits) => {
    setError('');
    const next = [...otp];
    digits.slice(0, OTP_LEN - start).split('').forEach((c, k) => {
      next[start + k] = c;
    });
    setOtp(next);
    otpRefs.current[Math.min(start + digits.length, OTP_LEN - 1)]?.focus();
    if (next.every(Boolean)) submitOtp(next.join(''));
  };

  const handleOtpChange = (i, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      const next = [...otp];
      next[i] = '';
      setOtp(next);
      return;
    }
    fillOtp(i, digits);
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      const next = [...otp];
      next[i - 1] = '';
      setOtp(next);
      otpRefs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      otpRefs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < OTP_LEN - 1) {
      otpRefs.current[i + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    fillOtp(0, digits);
  };

  // ขั้น 3: ตั้งรหัสผ่านใหม่
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < MIN_PASSWORD) {
      setError(`รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setResetLoading(true);
    try {
      await callResetPassword({ email: resetEmail.trim(), resetToken, newPassword });
      setEmail(resetEmail.trim());
      setPassword('');
      setNotice('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
      backToLogin();
    } catch (err) {
      const code = err?.code;
      const msg = resetErrorMessage(err, 'newpass');
      if (code === 'functions/deadline-exceeded' || code === 'functions/permission-denied') {
        // หมดเวลา: พากลับไปขอ OTP ใหม่ พร้อมคงข้อความแจ้งไว้
        setResetToken('');
        changeView('email');
      }
      setError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  const strength = getStrength(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const headerCopy = {
    login: ['เข้าสู่ระบบ', 'ระบบติดตามและวิเคราะห์การออกกำลังกายด้วย AI แบบเรียลไทม์'],
    email: ['ลืมรหัสผ่าน', 'กรอกอีเมลที่ใช้สมัคร แล้วเราจะส่งรหัส OTP 6 หลักไปให้'],
    otp: ['ยืนยันรหัส OTP', `หากอีเมล ${maskEmail(resetEmail.trim())} ลงทะเบียนไว้ เราได้ส่งรหัส 6 หลักไปให้แล้ว`],
    newpass: ['ตั้งรหัสผ่านใหม่', 'ยืนยันตัวตนสำเร็จ กรุณาตั้งรหัสผ่านใหม่ของคุณ'],
  }[view];

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
    setNotice('');
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
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Anuphan:wght@400;500;600;700&display=swap');

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
          overflow: hidden;
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
          max-width: 460px;
          max-height: calc(100dvh - 24px);
          margin: auto; /* อยู่กึ่งกลางซีกขวาของจอ */
          flex-shrink: 0;
          min-height: 0;
          display: grid;
          grid-template-columns: 1fr;
          position: relative;
          z-index: 2;
          overflow: hidden;
          border: 1px solid #2a5360;
          border-radius: 15px;
          background: #050b0e;
          color: #f4f7f6;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.005),
            0 24px 60px rgba(0,0,0,0.38),
            inset 0 0 25px rgba(0,0,0,0.25);
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
              #8cff32 95deg,
              #18d8ff 145deg,
              transparent 210deg,
              transparent 360deg
            ),
            linear-gradient(rgba(42,83,96,0.0), rgba(42,83,96,0.0));
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
          padding: 34px 44px 28px;
          background:
            radial-gradient(circle at 100% 0%, rgba(140,255,50,0.07), transparent 42%),
            radial-gradient(circle at 0% 100%, rgba(24,216,255,0.05), transparent 40%),
            linear-gradient(145deg, #050b0e, #071116);
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
            rgba(140,255,50,0.08),
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
          background: linear-gradient(180deg, transparent, rgba(140,255,50,0.05), transparent);
          transform: translateY(-120px);
          animation: scan 8s ease-in-out 2.5s infinite;
        }

        @keyframes scan {
          0%   { transform: translateY(-120px); opacity: 0; }
          10%  { opacity: 1; }
          55%  { transform: translateY(760px); opacity: 1; }
          56%, 100% { transform: translateY(760px); opacity: 0; }
        }

        /* หัวการ์ด: โลโก้ FITTRACK (ไม่มีกรอบ/พื้นหลัง) + ชื่อหน้า อยู่กึ่งกลาง */
        .login-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          margin-bottom: 22px;
          text-align: center;
        }

        /* ไฟล์โลโก้มีขอบโปร่งใสรอบตัว จึงใช้ margin ติดลบตามสัดส่วนความกว้างเพื่อดึงเนื้อหาให้เข้าใกล้กัน */
        .login-logo {
          --logo-w: 230px;
          display: block;
          width: var(--logo-w);
          max-width: 100%;
          height: auto;
          margin: calc(var(--logo-w) * -0.16) 0 calc(var(--logo-w) * -0.26);
          padding: 0;
          border: 0;
          background: none;
          box-shadow: none;
          object-fit: contain;
          user-select: none;
          -webkit-user-drag: none;
        }

        .login-header h1 {
          margin: 0;
          color: #f4f7f6;
          font-size: 24px;
          line-height: 1.3;
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        .login-header p {
          margin: 0;
          color: #93a1a5;
          font-size: 13px;
          line-height: 1.6;
        }

        /* เส้นไล่สีบางๆ คั่นหัวการ์ดกับฟอร์ม */
        .login-header::after {
          content: "";
          width: 100%;
          height: 1px;
          margin-top: 14px;
          background: linear-gradient(90deg, transparent, #2a5360 30%, #5ea02c 50%, #2a5360 70%, transparent);
        }

        .form-group {
          margin-bottom: 18px;
        }

        /* ช่องกรอก: label เล็กอยู่ด้านบน + กล่องสไตล์เดียวกับช่องกรอกของแดชบอร์ด (BMI) */
        .field-label {
          display: block;
          margin-bottom: 8px;
          color: #b8c1c3;
          font-family: "Anuphan", "Kanit", sans-serif;
          font-size: 12px;
        }

        .field {
          position: relative;
        }

        .field input {
          width: 100%;
          height: 48px;
          padding: 0 12px 0 44px;
          outline: none;
          border: 1px solid #304951;
          border-radius: 8px;
          background: #061015;
          color: #ffffff;
          font-family: "Anuphan", "Kanit", sans-serif;
          font-size: 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .field input::placeholder {
          color: #5f757b;
          opacity: 1;
        }

        .field input:hover {
          border-color: #3f6570;
        }

        .field input:focus {
          border-color: #8bff39;
          box-shadow: 0 0 0 2px rgba(139,255,57,0.08);
        }

        .field-icon {
          position: absolute;
          left: 13px;
          top: 50%;
          width: 18px;
          height: 18px;
          transform: translateY(-50%);
          color: #6f8a90;
          pointer-events: none;
          transition: color 0.2s ease;
        }

        .field input:focus ~ .field-icon {
          color: #8cff32;
        }

        /* กัน autofill ของเบราว์เซอร์ทับสีช่อง */
        .field input:-webkit-autofill,
        .field input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 100px #061015 inset;
          caret-color: #ffffff;
          transition: background-color 9999s ease-out 0s;
        }

        .field.has-toggle input {
          padding-right: 50px;
        }

        .password-toggle {
          position: absolute;
          right: 5px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #8fa3a8;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .password-toggle svg {
          width: 19px;
          height: 19px;
        }

        .password-toggle:hover,
        .password-toggle:focus-visible {
          outline: none;
          background: rgba(139,255,57,0.10);
          color: #8cff32;
        }

        /* เตือน Caps Lock */
        .caps-hint {
          max-height: 0;
          margin-top: 0;
          overflow: hidden;
          opacity: 0;
          color: #ffe735;
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
          border: 1px solid #a62c4d;
          border-radius: 8px;
          background: rgba(140,10,45,0.12);
          color: #ff7691;
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

        /* ปุ่มเข้าสู่ระบบ: สไตล์เดียวกับปุ่มสีเขียวมะนาวของแดชบอร์ด */
        .login-button {
          position: relative;
          width: 100%;
          height: 50px;
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          overflow: hidden;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(90deg, #72ed2e, #baff3e);
          background-size: 140% 100%;
          background-position: 0% 0;
          color: #071005;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          box-shadow: 0 0 16px rgba(125,255,45,0.15);
          transition: background-position 0.5s ease, transform 0.2s ease, box-shadow 0.3s ease, opacity 0.2s ease;
        }

        .login-button::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 38%;
          height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent);
          transform: skewX(-20deg);
          pointer-events: none;
        }

        .login-button:hover:not(:disabled) {
          background-position: 100% 0;
          transform: translateY(-1px);
          box-shadow: 0 0 24px rgba(125,255,45,0.32);
        }

        .login-button:hover:not(:disabled)::after {
          animation: sweep 0.9s ease;
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }

        .login-button:focus-visible {
          outline: 2px solid #c6ff38;
          outline-offset: 3px;
        }

        .login-button.ready:not(:hover) {
          animation: glow-pulse 2.4s ease-in-out infinite;
        }

        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(125,255,45,0.15), 0 0 0 0 rgba(140,255,50,0.40); }
          50%      { box-shadow: 0 0 16px rgba(125,255,45,0.15), 0 0 0 8px rgba(140,255,50,0); }
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
          margin: 22px 0 18px;
          color: #93a1a5;
          font-size: 11px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, #2a5360);
        }

        .divider::after {
          background: linear-gradient(90deg, #2a5360, transparent);
        }

        .register-text {
          margin: 0;
          text-align: center;
          color: #93a1a5;
          font-size: 14px;
        }

        .register-text a {
          position: relative;
          display: inline-block;
          margin-left: 6px;
          color: #8cff32;
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
          background: linear-gradient(90deg, #72ed2e, #c6ff38);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .register-text a:hover {
          color: #c6ff38;
        }

        .register-text a:hover::after {
          transform: scaleX(1);
        }

        .login-footer {
          margin: 22px 0 0;
          text-align: center;
          color: #6f7f83;
          font-size: 10px;
          letter-spacing: 0.04em;
        }

        /* =====================================================
           ลืมรหัสผ่าน / OTP / ตั้งรหัสผ่านใหม่
           ===================================================== */

        /* สลับหน้าในการ์ด: ใช้จังหวะที่เร็วกว่าตอนโหลดครั้งแรก */
        .view-swap .reveal {
          animation-delay: calc(var(--i, 0) * 60ms);
        }

        .field-meta {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-top: 8px;
        }

        .field-meta .caps-hint.show {
          margin-top: 0;
        }

        .forgot-link {
          margin-left: auto;
          padding: 2px 4px;
          border: 0;
          border-radius: 6px;
          background: none;
          color: #93a1a5;
          font-family: "Anuphan", "Kanit", sans-serif;
          font-size: 12px;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .forgot-link:hover,
        .forgot-link:focus-visible {
          outline: none;
          color: #8cff32;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .success-message {
          margin-bottom: 18px;
          padding: 10px 13px;
          border: 1px solid rgba(140,255,50,0.45);
          border-radius: 8px;
          background: rgba(140,255,50,0.07);
          color: #b6f58a;
          font-size: 13px;
          line-height: 1.6;
        }

        .otp-group {
          display: grid;
          grid-template-columns: repeat(${OTP_LEN}, 1fr);
          gap: 10px;
        }

        .otp-box {
          width: 100%;
          min-width: 0;
          height: 56px;
          padding: 0;
          outline: none;
          border: 1px solid #304951;
          border-radius: 8px;
          background: #061015;
          color: #ffffff;
          caret-color: #8cff32;
          text-align: center;
          font-family: "Kanit", sans-serif;
          font-size: 24px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .otp-box:hover {
          border-color: #3f6570;
        }

        .otp-box.filled {
          border-color: rgba(140,255,50,0.55);
        }

        .otp-box:focus {
          border-color: #8bff39;
          background: #08171d;
          box-shadow: 0 0 0 2px rgba(139,255,57,0.08);
        }

        .otp-box:disabled {
          opacity: 0.6;
        }

        .otp-group.has-error .otp-box {
          border-color: #a62c4d;
          animation: shake 0.45s ease both;
        }

        .otp-hint {
          margin: 10px 0 0;
          color: #6f8a90;
          font-size: 12px;
        }

        .strength {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }

        .strength-bars {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
        }

        .strength-bars i {
          height: 3px;
          border-radius: 2px;
          background: #1c2f36;
          transition: background 0.25s ease;
        }

        .strength.s1 i:nth-child(-n+1) { background: #ff7691; }
        .strength.s2 i:nth-child(-n+2) { background: #ffe735; }
        .strength.s3 i:nth-child(-n+3) { background: #c6ff38; }
        .strength.s4 i:nth-child(-n+4) { background: #8cff32; }

        .strength-label {
          min-width: 54px;
          min-height: 18px;
          text-align: right;
          color: #93a1a5;
          font-size: 12px;
        }

        .caps-hint.is-error {
          color: #ff7691;
        }

        .register-text.resend {
          margin-top: 16px;
        }

        .inline-link {
          position: relative;
          margin: 0 0 0 6px;
          padding: 0;
          border: 0;
          background: none;
          color: #8cff32;
          font-family: "Kanit", sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .inline-link:hover:not(:disabled),
        .inline-link:focus-visible {
          outline: none;
          color: #c6ff38;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .inline-link:disabled {
          opacity: 0.6;
          cursor: progress;
        }

        .resend-wait {
          margin-left: 6px;
          color: #6f8a90;
        }

        .back-row {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border: 0;
          border-radius: 8px;
          background: none;
          color: #93a1a5;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          cursor: pointer;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .back-link svg {
          width: 15px;
          height: 15px;
          transition: transform 0.2s ease;
        }

        .back-link:hover,
        .back-link:focus-visible {
          outline: none;
          color: #8cff32;
          background: rgba(139,255,57,0.08);
        }

        .back-link:hover svg {
          transform: translateX(-3px);
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
            max-width: 540px;
            min-height: auto;
            grid-template-columns: 1fr;
            border-radius: 15px;
          }

          .login-brand-panel {
            display: none;
          }

          .login-card {
            padding: 28px 32px 22px;
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

        }

        @media (max-width: 450px) {
          .login-page {
            padding: 14px;
          }

          .login-shell {
            border-radius: 15px;
          }

          .login-card {
            padding: 28px 22px 20px;
          }

          .otp-group { gap: 7px; }
          .otp-box { height: 52px; font-size: 22px; }
        }

        /* จอเตี้ย: ย่อระยะห่างลง เพื่อให้การ์ดอยู่ในจอพอดีโดยไม่ต้องเลื่อน */
        @media (max-height: 740px) {
          .login-page { padding-top: 12px; padding-bottom: 12px; }
          .login-card { padding: 26px 30px 16px; }
          .login-header { margin-bottom: 14px; }
          .login-header::after { margin-top: 10px; }
          .login-logo { --logo-w: 170px; }
          .login-header h1 { font-size: 21px; }
          .form-group { margin-bottom: 12px; }
          .field-label { margin-bottom: 6px; }
          .field input { height: 42px; }
          .login-button { height: 44px; margin-top: 2px; }
          .divider { margin: 14px 0 12px; }
          .login-footer { margin-top: 12px; }
          .otp-box { height: 48px; font-size: 21px; }
          .back-row { margin-top: 8px; }
          .register-text.resend { margin-top: 12px; }
          .strength { margin-top: 8px; }
        }

        @media (max-height: 580px) {
          .login-header p,
          .login-footer { display: none; }
          .login-logo { --logo-w: 130px; }
          .field input { height: 38px; }
          .login-button { height: 40px; }
          .divider { margin: 10px 0 8px; }
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
            <div key={view} className={swapped ? 'view-swap' : undefined}>
            <div className="login-header reveal" style={{ '--i': 0 }}>
              <img src="/fittrack-hero-logo.png" alt="FITTRACK" className="login-logo" draggable="false" />
              <h1>{headerCopy[0]}</h1>
              <p>{headerCopy[1]}</p>
            </div>

            {view === 'login' && (
            <>
            <form onSubmit={handleLogin}>
              <div className="form-group reveal" style={{ '--i': 3 }}>
                <label className="field-label" htmlFor="email">อีเมลบัญชี</label>
                <div className="field">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                  />
                  <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="3" />
                    <path d="m4 8 8 5.5L20 8" />
                  </svg>
                </div>
              </div>

              <div className="form-group reveal" style={{ '--i': 4 }}>
                <label className="field-label" htmlFor="password">รหัสผ่าน</label>
                <div className="field has-toggle">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleCaps}
                    onKeyUp={handleCaps}
                    onBlur={() => setCapsOn(false)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
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

                <div className="field-meta">
                  <div className={`caps-hint ${capsOn ? 'show' : ''}`} role="status">
                    Caps Lock เปิดอยู่
                  </div>
                  <button type="button" className="forgot-link" onClick={goForgot}>
                    ลืมรหัสผ่าน?
                  </button>
                </div>
              </div>

              {notice && (
                <div className="success-message" role="status">
                  ✅ {notice}
                </div>
              )}

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
                      กำลังตรวจสอบข้อมูล...
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
              ยังไม่มีบัญชีผู้ใช้งาน?
              <Link to="/register">ลงทะเบียน</Link>
            </p>
            </>
            )}

            {/* ---------- ขั้น 1: กรอกอีเมล ---------- */}
            {view === 'email' && (
              <>
                <form onSubmit={handleSendOtp}>
                  <div className="form-group reveal" style={{ '--i': 3 }}>
                    <label className="field-label" htmlFor="reset-email">อีเมลที่ใช้สมัคร</label>
                    <div className="field">
                      <input
                        id="reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        autoFocus
                        required
                      />
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="3" />
                        <path d="m4 8 8 5.5L20 8" />
                      </svg>
                    </div>
                  </div>

                  {error && (
                    <div className="error-message" role="alert">
                      ⚠️ {error}
                    </div>
                  )}

                  <div className="reveal" style={{ '--i': 4 }}>
                    <button
                      type="submit"
                      className={`login-button ${resetEmail && !resetLoading ? 'ready' : ''}`}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <>
                          <span className="spinner"></span>
                          กำลังส่งรหัส...
                        </>
                      ) : (
                        'ส่งรหัส OTP'
                      )}
                    </button>
                  </div>
                </form>

                <div className="back-row reveal" style={{ '--i': 5 }}>
                  <button type="button" className="back-link" onClick={backToLogin}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m15 6-6 6 6 6" />
                    </svg>
                    กลับไปเข้าสู่ระบบ
                  </button>
                </div>
              </>
            )}

            {/* ---------- ขั้น 2: กรอกรหัส OTP ---------- */}
            {view === 'otp' && (
              <>
                <form onSubmit={handleVerifyOtp}>
                  <div className="form-group reveal" style={{ '--i': 3 }}>
                    <span className="field-label" id="otp-label">รหัส OTP 6 หลัก</span>
                    <div
                      className={`otp-group ${error ? 'has-error' : ''}`}
                      role="group"
                      aria-labelledby="otp-label"
                      onPaste={handleOtpPaste}
                    >
                      {otp.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            otpRefs.current[i] = el;
                          }}
                          className={`otp-box ${d ? 'filled' : ''}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={d}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          onFocus={(e) => e.target.select()}
                          autoComplete={i === 0 ? 'one-time-code' : 'off'}
                          autoFocus={i === 0}
                          aria-label={`หลักที่ ${i + 1}`}
                          disabled={resetLoading}
                        />
                      ))}
                    </div>
                    <p className="otp-hint">รหัสมีอายุ 10 นาที · ตรวจสอบในกล่องจดหมายขยะด้วยหากไม่พบ</p>
                  </div>

                  {error && (
                    <div className="error-message" role="alert">
                      ⚠️ {error}
                    </div>
                  )}

                  <div className="reveal" style={{ '--i': 4 }}>
                    <button
                      type="submit"
                      className={`login-button ${otp.every(Boolean) && !resetLoading ? 'ready' : ''}`}
                      disabled={resetLoading || !otp.every(Boolean)}
                    >
                      {resetLoading ? (
                        <>
                          <span className="spinner"></span>
                          กำลังตรวจสอบรหัส...
                        </>
                      ) : (
                        'ยืนยันรหัส'
                      )}
                    </button>
                  </div>
                </form>

                <p className="register-text resend reveal" style={{ '--i': 5 }}>
                  ไม่ได้รับรหัส?
                  {cooldown > 0 ? (
                    <span className="resend-wait">ขอรหัสใหม่ได้ใน {cooldown} วินาที</span>
                  ) : (
                    <button type="button" className="inline-link" onClick={() => requestOtp(true)} disabled={resetLoading}>
                      ขอรหัสใหม่
                    </button>
                  )}
                </p>

                <div className="back-row reveal" style={{ '--i': 6 }}>
                  <button type="button" className="back-link" onClick={() => changeView('email')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m15 6-6 6 6 6" />
                    </svg>
                    ใช้อีเมลอื่น
                  </button>
                </div>
              </>
            )}

            {/* ---------- ขั้น 3: ตั้งรหัสผ่านใหม่ ---------- */}
            {view === 'newpass' && (
              <>
                <form onSubmit={handleResetPassword}>
                  <div className="form-group reveal" style={{ '--i': 3 }}>
                    <label className="field-label" htmlFor="new-password">รหัสผ่านใหม่</label>
                    <div className="field has-toggle">
                      <input
                        id="new-password"
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onKeyDown={handleCaps}
                        onKeyUp={handleCaps}
                        onBlur={() => setCapsOn(false)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        autoFocus
                        required
                      />
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
                        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
                      </svg>
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowNew(!showNew)}
                        aria-label={showNew ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
                          <circle cx="12" cy="12" r="3" />
                          {showNew && <path d="M4 4l16 16" />}
                        </svg>
                      </button>
                    </div>
                    <div className={`strength s${strength.score}`} aria-live="polite">
                      <span className="strength-bars" aria-hidden="true"><i /><i /><i /><i /></span>
                      <span className="strength-label">{strength.label}</span>
                    </div>
                  </div>

                  <div className="form-group reveal" style={{ '--i': 4 }}>
                    <label className="field-label" htmlFor="confirm-password">ยืนยันรหัสผ่านใหม่</label>
                    <div className="field">
                      <input
                        id="confirm-password"
                        type={showNew ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={handleCaps}
                        onKeyUp={handleCaps}
                        onBlur={() => setCapsOn(false)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                      />
                      <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
                        <path d="m9 15.5 2 2 4-4" />
                      </svg>
                    </div>
                    <div className={`caps-hint ${capsOn || mismatch ? 'show' : ''} ${!capsOn && mismatch ? 'is-error' : ''}`} role="status">
                      {capsOn ? 'Caps Lock เปิดอยู่' : 'รหัสผ่านไม่ตรงกัน'}
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
                      className={`login-button ${newPassword && confirmPassword && !mismatch && !resetLoading ? 'ready' : ''}`}
                      disabled={resetLoading}
                    >
                      {resetLoading ? (
                        <>
                          <span className="spinner"></span>
                          กำลังบันทึก...
                        </>
                      ) : (
                        'บันทึกรหัสผ่านใหม่'
                      )}
                    </button>
                  </div>
                </form>

                <div className="back-row reveal" style={{ '--i': 6 }}>
                  <button type="button" className="back-link" onClick={backToLogin}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m15 6-6 6 6 6" />
                    </svg>
                    ยกเลิก
                  </button>
                </div>
              </>
            )}

            <p className="login-footer reveal" style={{ '--i': 7 }}>
              © 2026 FITTRACK  ·  AI Motion Tracking
            </p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}