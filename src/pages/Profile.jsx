import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, verifyBeforeUpdateEmail, deleteUser,
} from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// ---------- คีย์ข้อมูลที่ใช้ร่วมกับหน้าอื่น ----------
const SETTINGS_KEY = 'fittrack_user_settings';
const HISTORY_GOALS_KEY = 'fittrack-history-goals'; // หน้า History อ่านเป้าหมายจากคีย์นี้
const THEME_KEY = 'fittrack-theme';                 // Dashboard/Exercise/History ใช้คีย์เดียวกัน
const NAME_CACHE_KEY = 'fittrack-user-name';
const avatarKey = (uid) => `fittrack_avatar_${uid}`;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage optional */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* storage optional */ } };

const setCachedName = (name) => lsSet(NAME_CACHE_KEY, name);
const clearCachedName = () => lsDel(NAME_CACHE_KEY);
const getInitialName = () => lsGet(NAME_CACHE_KEY) || auth.currentUser?.displayName || '';

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getSavedDailyCalories = () => {
  const saved = lsGet(`fittrack-calories-${getLocalDateKey()}`);
  return saved === null ? 0 : Math.max(0, Number(saved) || 0);
};

// ---------- ตัวเลือกและสูตรคำนวณ ----------
const GENDERS = [
  { v: 'male', l: 'ชาย', c: 5 },
  { v: 'female', l: 'หญิง', c: -161 },
  { v: 'other', l: 'ไม่ระบุ', c: -78 }, // ค่ากลางของสองสูตร
];
const ACTIVITIES = [
  { v: 'sedentary', l: 'น้อย (นั่งทำงานเป็นหลัก)', f: 1.2 },
  { v: 'light', l: 'เบา (ออกกำลังกาย 1–3 วัน/สัปดาห์)', f: 1.375 },
  { v: 'moderate', l: 'ปานกลาง (3–5 วัน/สัปดาห์)', f: 1.55 },
  { v: 'active', l: 'หนัก (6–7 วัน/สัปดาห์)', f: 1.725 },
];
const GOALS = [
  { v: 'lose', l: 'ลดน้ำหนัก', f: 0.85 },
  { v: 'maintain', l: 'รักษาน้ำหนัก', f: 1 },
  { v: 'muscle', l: 'เพิ่มกล้ามเนื้อ', f: 1.1 },
];
const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const TIME_OPTIONS = Array.from({ length: 38 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${mins % 60 === 0 ? '00' : '30'}`;
});

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

const calcBmi = (w, h) => {
  const W = num(w), H = num(h);
  if (!W || !H || W <= 0 || H <= 0) return null;
  return Number((W / Math.pow(H / 100, 2)).toFixed(2));
};
// เกณฑ์เดียวกับ Dashboard (เกณฑ์เอเชีย)
const bmiStatus = (bmi) => {
  if (bmi === null) return 'ยังไม่มีข้อมูล';
  if (bmi < 18.5) return 'ผอม';
  if (bmi < 23) return 'ปกติ';
  if (bmi < 25) return 'น้ำหนักเกิน';
  return 'อ้วน';
};
const bmiPosition = (bmi) => Math.max(2, Math.min(98, ((bmi - 15) / 20) * 100)); // สเกล BMI 15–35

// Mifflin-St Jeor × ระดับกิจกรรม × เป้าหมาย
const calcRecommendedKcal = ({ gender, age, weight, height, activity, goal }) => {
  const W = num(weight), H = num(height), A = num(age);
  if (!W || !H || !A) return null;
  const c = (GENDERS.find((g) => g.v === gender) || GENDERS[2]).c;
  const bmr = 10 * W + 6.25 * H - 5 * A + c;
  const af = (ACTIVITIES.find((a) => a.v === activity) || ACTIVITIES[2]).f;
  const gf = (GOALS.find((g) => g.v === goal) || GOALS[1]).f;
  return Math.round(bmr * af * gf);
};

const DEFAULT_SETTINGS = {
  phone: '', gender: '', age: '', weight: '', height: '', goal: '', activity: '',
  daysPerWeek: 3, minutesPerSession: 45, dailyKcal: '',
  notif: { workout: true, water: true, meal: false, daily: true, weekly: true },
  reminderTime: '18:00',
  reminderDays: [true, true, true, true, true, false, false],
  display: { theme: 'dark', animation: true, neon: true },
};

const loadSettings = () => {
  let saved = {};
  try { saved = JSON.parse(lsGet(SETTINGS_KEY) || '{}') || {}; } catch { saved = {}; }
  const merged = {
    ...DEFAULT_SETTINGS, ...saved,
    notif: { ...DEFAULT_SETTINGS.notif, ...(saved.notif || {}) },
    display: { ...DEFAULT_SETTINGS.display, ...(saved.display || {}) },
    reminderDays: Array.isArray(saved.reminderDays) && saved.reminderDays.length === 7
      ? saved.reminderDays : DEFAULT_SETTINGS.reminderDays,
  };
  // ธีมที่สลับจากหน้าอื่นมีผลก่อน ยกเว้นผู้ใช้เลือก "ตามระบบ"
  if (merged.display.theme !== 'system') {
    merged.display.theme = lsGet(THEME_KEY) === 'light' ? 'light' : 'dark';
  }
  return merged;
};

const systemPrefersLight = () => {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches; } catch { return false; }
};

const formatThaiDate = (d) => (d
  ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  : '-');

const authMessage = (err) => {
  const code = err?.code || '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
  if (code.includes('too-many-requests')) return 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (code.includes('weak-password')) return 'รหัสผ่านใหม่ง่ายเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร';
  if (code.includes('requires-recent-login')) return 'เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ก่อนทำรายการนี้';
  if (code.includes('email-already-in-use')) return 'อีเมลนี้ถูกใช้งานแล้ว';
  if (code.includes('invalid-email')) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (code.includes('network')) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่';
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
};

// ย่อรูปโปรไฟล์เป็นสี่เหลี่ยมจัตุรัส 160px เพื่อเก็บใน Firestore ได้โดยไม่ต้องใช้ Storage
const resizeImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
    canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
    URL.revokeObjectURL(url);
    resolve(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
  img.src = url;
});

const Ico = ({ d, size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const IC = {
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-.5-2h-4L10 7 8 8 6 7 4 11l2 1v2l-2 1 2 4 2-1 2 1 .5 2h4L14 19l2-1 2 1 2-4-2-1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  card: 'M4 5h16v14H4zM8 10a2 2 0 1 0 0-.01M13 10h4M13 14h4M6 16c.6-1.4 3.4-1.4 4 0',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  save: 'M5 4h12l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
};

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      className={`st-toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Modal({ title, children, onClose, danger }) {
  return (
    <div className="st-modal-bg" role="presentation" onClick={onClose}>
      <div className={`st-modal${danger ? ' danger' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState(null);
  const [photo, setPhoto] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [workouts, setWorkouts] = useState([]);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');

  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());
  const fileRef = useRef(null);

  const showToast = (text, type = 'success') => setToast({ text, type, id: Date.now() });
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const applyHeaderName = (value) => {
    setCachedName(value);
    setDisplayName(value);
    setUserInitial(value.charAt(0).toUpperCase());
  };

  const patch = (changes) => setSettings((s) => ({ ...s, ...changes }));
  const patchNotif = (key, value) => setSettings((s) => ({ ...s, notif: { ...s.notif, [key]: value } }));
  const patchDisplay = (key, value) => setSettings((s) => ({ ...s, display: { ...s.display, [key]: value } }));

  // ---------- วันที่/เวลา ----------
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const dateLabel = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(currentDateTime);

  // ---------- ธีม / Animation / Neon ----------
  const [systemLight, setSystemLight] = useState(systemPrefersLight);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: light)'); } catch { return undefined; }
    const onChange = (e) => setSystemLight(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  const themePref = settings.display.theme;
  const theme = themePref === 'system' ? (systemLight ? 'light' : 'dark') : themePref;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    lsSet(THEME_KEY, theme); // หน้าอื่นอ่านแค่ light/dark
  }, [theme]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-neon', settings.display.neon ? 'on' : 'off');
    root.setAttribute('data-anim', settings.display.animation ? 'on' : 'off');
  }, [settings.display.neon, settings.display.animation]);
  // คืนค่าตอนออกจากหน้า เพื่อไม่ให้กระทบหน้าอื่น
  useLayoutEffect(() => () => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.removeAttribute('data-neon');
    root.removeAttribute('data-anim');
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    patchDisplay('theme', theme === 'dark' ? 'light' : 'dark');
    setTimeout(() => root.classList.remove('theme-anim'), 450);
  };

  // ---------- โหลดข้อมูลผู้ใช้ (ข้อมูลกลางเดียวกับ Dashboard: users/{uid}) ----------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        clearCachedName();
        navigate('/login');
        return;
      }
      setUser(currentUser);
      setEmail(currentUser.email || '');
      setPhoto(lsGet(avatarKey(currentUser.uid)) || '');

      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        setName(data.name || '');
        setCreatedAt(data.createdAt?.toDate ? data.createdAt.toDate() : null);
        if (data.photoData) { setPhoto(data.photoData); lsSet(avatarKey(currentUser.uid), data.photoData); }
        applyHeaderName(data.name || currentUser.displayName || currentUser.email?.split('@')[0] || '');

        // ข้อมูลสุขภาพ/เบอร์โทรจาก Firestore มาก่อนค่าในเครื่อง (ใช้ร่วมกับ Dashboard)
        setSettings((s) => {
          const pick = (k) => (data[k] !== undefined && data[k] !== null ? data[k] : s[k]);
          return {
            ...s,
            phone: pick('phone'),
            gender: pick('gender'),
            age: pick('age'),
            weight: pick('weight'),
            height: pick('height'),
            goal: data.fitnessGoal ?? s.goal,
            activity: data.activityLevel ?? s.activity,
          };
        });
      } catch (err) {
        console.error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ:', err);
      }

      try {
        const snapshot = await getDocs(query(collection(db, 'workouts'), where('userId', '==', currentUser.uid)));
        setWorkouts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('โหลดประวัติการออกกำลังกายไม่สำเร็จ:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // ---------- ค่าที่คำนวณจากข้อมูลจริง ----------
  const bmi = useMemo(() => calcBmi(settings.weight, settings.height), [settings.weight, settings.height]);
  const recommendedKcal = useMemo(
    () => calcRecommendedKcal(settings),
    [settings.gender, settings.age, settings.weight, settings.height, settings.activity, settings.goal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const goalKcal = settings.dailyKcal !== '' ? Number(settings.dailyKcal) : recommendedKcal;

  const activeDays = useMemo(() => {
    const from = new Date(currentDateTime); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 6);
    const keys = new Set();
    workouts.forEach((w) => {
      const d = w.completedAt?.toDate ? w.completedAt.toDate() : null;
      if (d && d >= from) keys.add(getLocalDateKey(d));
    });
    return keys.size;
  }, [workouts, currentDateTime]);
  const goalDays = Math.max(1, Number(settings.daysPerWeek) || 1);
  const goalPct = Math.min(100, Math.round((activeDays / goalDays) * 100));

  const hasPasswordProvider = !!user?.providerData?.some((p) => p.providerId === 'password');
  const memberSince = createdAt || (user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : null);

  // ---------- เมนูตั้งค่า ----------
  const MENU = [
    { id: 'profile', label: 'โปรไฟล์', icon: IC.user },
    { id: 'account', label: 'ข้อมูลส่วนตัว', icon: IC.card },
    { id: 'health', label: 'ข้อมูลสุขภาพ', icon: IC.heart },
    { id: 'goals', label: 'เป้าหมายการออกกำลังกาย', icon: IC.target },
    { id: 'notifications', label: 'การแจ้งเตือน', icon: IC.bell },
    { id: 'security', label: 'ความปลอดภัย', icon: IC.shield },
    { id: 'display', label: 'รูปแบบการแสดงผล', icon: IC.palette },
  ];
  const goSection = (id) => {
    setActiveSection(id);
    document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ความครบถ้วนของข้อมูล (แสดงในเมนูซ้าย)
  const profileChecks = [
    ['รูปโปรไฟล์', !!photo, 'profile'],
    ['เบอร์โทรศัพท์', !!settings.phone, 'account'],
    ['เพศ', !!settings.gender, 'health'],
    ['อายุ', settings.age !== '', 'health'],
    ['น้ำหนัก', settings.weight !== '', 'health'],
    ['ส่วนสูง', settings.height !== '', 'health'],
    ['เป้าหมาย', !!settings.goal, 'health'],
    ['ระดับกิจกรรม', !!settings.activity, 'health'],
  ];
  const completePct = Math.round((profileChecks.filter((c) => c[1]).length / profileChecks.length) * 100);
  const nextMissing = profileChecks.find((c) => !c[1]);

  // ไฮไลต์เมนูตามตำแหน่งที่เลื่อนอยู่
  useEffect(() => {
    if (loading || typeof IntersectionObserver === 'undefined') return undefined;
    const ids = ['profile', 'account', 'health', 'goals', 'notifications', 'security', 'display'];
    const els = ids.map((id) => document.getElementById(`st-${id}`)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActiveSection(hit.target.id.replace('st-', ''));
    }, { rootMargin: '-10% 0px -65% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [loading]);

  // ---------- บัญชี: แก้ไขชื่อ / อีเมล / เบอร์ ----------
  const [acc, setAcc] = useState(null); // null = โหมดดู
  const openAccountEdit = () => {
    setAcc({ name, email, phone: settings.phone || '', password: '', error: '', busy: false });
  };
  const editNameShortcut = () => {
    openAccountEdit();
    goSection('account');
  };

  const saveAccount = async () => {
    const nextName = acc.name.trim();
    const nextEmail = acc.email.trim();
    const nextPhone = acc.phone.trim();
    if (!nextName) return setAcc({ ...acc, error: 'กรุณากรอกชื่อผู้ใช้' });
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return setAcc({ ...acc, error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    if (nextPhone && !/^[0-9+\-\s()]{8,20}$/.test(nextPhone)) return setAcc({ ...acc, error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' });
    const emailChanged = nextEmail !== email;
    if (emailChanged && !hasPasswordProvider) return setAcc({ ...acc, error: 'บัญชีนี้ไม่ได้เข้าสู่ระบบด้วยอีเมล จึงเปลี่ยนอีเมลที่นี่ไม่ได้' });
    if (emailChanged && !acc.password) return setAcc({ ...acc, error: 'กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนอีเมล' });

    setAcc({ ...acc, busy: true, error: '' });
    try {
      if (emailChanged) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, acc.password));
        await verifyBeforeUpdateEmail(user, nextEmail); // อีเมลจะเปลี่ยนเมื่อกดยืนยันจากลิงก์ที่ส่งไป
      }
      await setDoc(doc(db, 'users', user.uid), { name: nextName, phone: nextPhone }, { merge: true });
      setName(nextName);
      applyHeaderName(nextName);
      const nextSettings = { ...settings, phone: nextPhone };
      setSettings(nextSettings);
      lsSet(SETTINGS_KEY, JSON.stringify(nextSettings));
      setAcc(null);
      showToast(emailChanged
        ? `ส่งลิงก์ยืนยันไปที่ ${nextEmail} แล้ว อีเมลจะเปลี่ยนหลังกดยืนยัน`
        : 'บันทึกข้อมูลบัญชีเรียบร้อยแล้ว');
    } catch (err) {
      console.error('บันทึกข้อมูลบัญชีไม่สำเร็จ:', err);
      setAcc((a) => ({ ...a, busy: false, error: authMessage(err) }));
    }
  };

  // ---------- รูปโปรไฟล์ ----------
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) return showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
    if (file.size > 10 * 1024 * 1024) return showToast('ขนาดรูปภาพต้องไม่เกิน 10 MB', 'error');
    try {
      const data = await resizeImage(file);
      setPhoto(data);
      lsSet(avatarKey(user.uid), data);
      await setDoc(doc(db, 'users', user.uid), { photoData: data }, { merge: true });
      showToast('เปลี่ยนรูปโปรไฟล์เรียบร้อยแล้ว');
    } catch (err) {
      console.error('เปลี่ยนรูปไม่สำเร็จ:', err);
      showToast('เปลี่ยนรูปโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่', 'error');
    }
  };

  // ---------- บันทึกทั้งหมด ----------
  const validateAll = () => {
    const a = num(settings.age), w = num(settings.weight), h = num(settings.height);
    if (a !== null && !(Number.isInteger(a) && a >= 10 && a <= 100)) return 'อายุต้องอยู่ระหว่าง 10–100 ปี';
    if (w !== null && !(w >= 20 && w <= 300)) return 'น้ำหนักต้องอยู่ระหว่าง 20–300 kg';
    if (h !== null && !(h >= 100 && h <= 250)) return 'ส่วนสูงต้องอยู่ระหว่าง 100–250 cm';
    const d = Number(settings.daysPerWeek);
    if (!(Number.isInteger(d) && d >= 1 && d <= 7)) return 'จำนวนวันออกกำลังกายต้องอยู่ระหว่าง 1–7 วัน/สัปดาห์';
    const m = Number(settings.minutesPerSession);
    if (!(m >= 5 && m <= 300)) return 'ระยะเวลาเป้าหมายต้องอยู่ระหว่าง 5–300 นาที';
    if (settings.dailyKcal !== '' && !(Number(settings.dailyKcal) >= 500 && Number(settings.dailyKcal) <= 10000)) {
      return 'แคลอรี่เป้าหมายต้องอยู่ระหว่าง 500–10,000 kcal';
    }
    return '';
  };

  const saveAll = async () => {
    const problem = validateAll();
    if (problem) return showToast(problem, 'error');
    setSaving(true);

    // 1) เก็บในเครื่อง (ไม่หายเมื่อ Refresh)
    lsSet(SETTINGS_KEY, JSON.stringify(settings));
    // 2) เป้าหมายที่หน้าประวัติใช้ร่วมกัน
    let prevGoals = {};
    try { prevGoals = JSON.parse(lsGet(HISTORY_GOALS_KEY) || '{}') || {}; } catch { prevGoals = {}; }
    lsSet(HISTORY_GOALS_KEY, JSON.stringify({
      ...prevGoals,
      daysMin: Number(settings.daysPerWeek), daysMax: Number(settings.daysPerWeek),
      minMin: Number(settings.minutesPerSession), minMax: Number(settings.minutesPerSession),
      ...(goalKcal ? { dailyKcal: goalKcal } : {}),
    }));

    // 3) ข้อมูลกลางของผู้ใช้ใน Firestore (Dashboard อ่าน weight/height/age จากที่นี่)
    try {
      await setDoc(doc(db, 'users', user.uid), {
        phone: settings.phone || '',
        gender: settings.gender || '',
        age: num(settings.age) ?? '',
        weight: num(settings.weight) ?? '',
        height: num(settings.height) ?? '',
        fitnessGoal: settings.goal || '',
        activityLevel: settings.activity || '',
        workoutGoal: {
          daysPerWeek: Number(settings.daysPerWeek),
          minutesPerSession: Number(settings.minutesPerSession),
          dailyKcal: goalKcal || null,
        },
      }, { merge: true });
      showToast('บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว');
    } catch (err) {
      console.error('บันทึกไม่สำเร็จ:', err);
      showToast('บันทึกในเครื่องแล้ว แต่ซิงก์กับบัญชีไม่สำเร็จ กรุณาลองใหม่', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- เปลี่ยนรหัสผ่าน ----------
  const [pw, setPw] = useState(null);
  const submitPassword = async () => {
    const { current, next, confirm } = pw;
    if (!current || !next || !confirm) return setPw({ ...pw, error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    if (next.length < 6) return setPw({ ...pw, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    if (next !== confirm) return setPw({ ...pw, error: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
    if (next === current) return setPw({ ...pw, error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน' });
    setPw({ ...pw, busy: true, error: '' });
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, current));
      await updatePassword(user, next);
      setPw(null);
      showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    } catch (err) {
      console.error('เปลี่ยนรหัสผ่านไม่สำเร็จ:', err);
      setPw((p) => ({ ...p, busy: false, error: authMessage(err) }));
    }
  };

  // ---------- ออกจากระบบ / ลบบัญชี ----------
  const [logoutOpen, setLogoutOpen] = useState(false);
  const handleLogout = async () => {
    try {
      await signOut(auth);
      clearCachedName();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      setLogoutOpen(false);
      showToast('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่', 'error');
    }
  };

  const [del, setDel] = useState(null);
  const confirmDelete = async () => {
    if (hasPasswordProvider && !del.password) return setDel({ ...del, error: 'กรุณากรอกรหัสผ่านเพื่อยืนยันการลบบัญชี' });
    setDel({ ...del, busy: true, error: '' });
    try {
      if (hasPasswordProvider) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, del.password));
      }
      const uid = user.uid;
      const snap = await getDocs(query(collection(db, 'workouts'), where('userId', '==', uid)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'users', uid));
      await deleteUser(auth.currentUser);
      [SETTINGS_KEY, HISTORY_GOALS_KEY, NAME_CACHE_KEY, avatarKey(uid)].forEach(lsDel);
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('ลบบัญชีไม่สำเร็จ:', err);
      setDel((d) => ({ ...d, busy: false, error: authMessage(err) }));
    }
  };

  // ---------- แจ้งเตือนบนแถบด้านบน ----------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyCalories, setDailyCalories] = useState(getSavedDailyCalories);
  const calorieNotice = dailyCalories === 0
    ? 'วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้'
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyCalories.toLocaleString()} kcal`;
  const goalNotice = `สัปดาห์นี้ออกกำลังกายแล้ว ${activeDays} / ${goalDays} วัน`;
  const handleNotifications = async () => {
    setDailyCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === 'default') permission = await window.Notification.requestPermission();
        if (permission === 'granted') {
          new window.Notification('FitTrack · ตั้งค่า', {
            body: `${goalNotice}. ${calorieNotice}`,
            tag: `fittrack-settings-${getLocalDateKey(currentDateTime)}`,
          });
        }
      } catch (error) {
        console.warn('ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:', error);
      }
    }
  };

  const avatarContent = photo ? <img src={photo} alt="" /> : userInitial;

  const bmiText = bmi === null ? 'ยังไม่มีข้อมูล' : bmi.toFixed(2);
  const status = bmiStatus(bmi);

  return (
    <div className="fittrack-app">
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" type="button" onClick={() => navigate('/dashboard')}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link" type="button" onClick={() => navigate('/exercises')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate('/gamemode')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 15h18a9 9 0 0 1 8.7 6.7l2.2 8.6a5.2 5.2 0 0 1-8.9 4.8L31 31H17l-4 4.1a5.2 5.2 0 0 1-8.9-4.8l2.2-8.6A9 9 0 0 1 15 15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M16 21v8M12 25h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="22.5" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg></span>โหมดเกม</button>
          <button className="side-link" type="button" onClick={() => navigate('/history')}><span className="side-icon">◷</span>ประวัติ</button>
          <button className="side-link active" type="button" onClick={() => navigate('/profile')}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" type="button" onClick={() => setLogoutOpen(true)}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{avatarContent}</div>
              <span className="online-dot"></span>
            </div>
            <div>
              <div className="hello">สวัสดีครับ/ค่ะ</div>
              <strong>{displayName || '\u00A0'}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="ai-note">ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ <span>〽</span></div>
            <div className="notification-wrap">
              <button className="icon-button notification-bell" type="button" title="การแจ้งเตือน" aria-label="เปิดการแจ้งเตือน" aria-expanded={notificationsOpen} onClick={handleNotifications}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><i></i></button>
              {notificationsOpen && <div className="notification-panel" role="status">
                <div className="notification-panel-title"><span>การแจ้งเตือน <small>วันนี้</small></span><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotificationsOpen(false)}>×</button></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{goalNotice}</span><small>ปรับเป้าหมายได้ที่หน้านี้</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{calorieNotice}</span><small>ติดตามเป้าหมายพลังงานรายวันได้ที่หน้าหลัก</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun" type="button" onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
          </div>
        </header>

        <div className="st-content">
          <section className="dark-card st-shell">
            <header className="st-head">
              <span className="st-head-icon"><Ico d={IC.settings} size={34} /></span>
              <div className="st-head-copy">
                <h1>ตั้งค่าข้อมูลส่วนตัว</h1>
                <p>จัดการบัญชีและข้อมูลของคุณ</p>
              </div>
              <div className="st-head-ai">
                <span>ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ</span>
                <div className="pulse-line st-ecg"><i></i><b></b><i></i></div>
              </div>
            </header>

            {loading ? (
              <div className="st-loading">กำลังโหลดข้อมูล...</div>
            ) : (
              <div className="st-layout">
                {/* ===== เมนูตั้งค่า ===== */}
                <nav className="st-card st-menu" aria-label="เมนูตั้งค่า">
                  <div className="st-menu-sum">
                    <span className="st-menu-ava">{photo ? <img src={photo} alt="" /> : (name || email || '?').charAt(0).toUpperCase()}</span>
                    <div><strong>{name || '-'}</strong><small>{email}</small></div>
                  </div>
                  <h2 className="st-menu-title">เมนูตั้งค่า</h2>
                  <div className="st-menu-list">
                    {MENU.map((m) => (
                      <button key={m.id} type="button" className={`st-menu-item${activeSection === m.id ? ' active' : ''}`} onClick={() => goSection(m.id)}>
                        <Ico d={m.icon} size={20} /><span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="st-menu-meter">
                    <div className="st-ring" style={{ '--p': completePct }}><b>{completePct}%</b></div>
                    <div>
                      <strong>ความครบถ้วนของข้อมูล</strong>
                      {nextMissing
                        ? <button type="button" onClick={() => goSection(nextMissing[2])}>เพิ่ม{nextMissing[0]} </button>
                        : <small>ครบถ้วนแล้ว</small>}
                    </div>
                  </div>
                </nav>

                <div className="st-main">
                  <div className="st-grid">
                    <div className="st-col">
                    <section className="st-card" id="st-profile">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.user} size={18} /></span>โปรไฟล์ของฉัน</h2>
                      <div className="st-profile">
                        <div className="st-avatar">{photo ? <img src={photo} alt="รูปโปรไฟล์" /> : (name || email || '?').charAt(0).toUpperCase()}</div>
                        <strong className="st-profile-name">{name || '-'}</strong>
                        <span className="st-profile-mail">{email}</span>
                        <span className="st-profile-since">สมาชิกตั้งแต่ {formatThaiDate(memberSince)}</span>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
                        <div className="st-row">
                          <button type="button" className="st-btn ghost" onClick={editNameShortcut}>แก้ไขชื่อ</button>
                          <button type="button" className="st-btn primary" onClick={() => fileRef.current?.click()}>เปลี่ยนรูปโปรไฟล์</button>
                        </div>
                      </div>
                    </section>

                    <section className="st-card" id="st-health">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.heart} size={18} /></span>ข้อมูลสุขภาพ</h2>
                      <div className="st-fields">
                        <label>เพศ
                          <select className="st-input" value={settings.gender} onChange={(e) => patch({ gender: e.target.value })}>
                            <option value="">เลือกเพศ</option>
                            {GENDERS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                          </select>
                        </label>
                        <label>อายุ
                          <span className="st-unit"><input className="st-input" type="number" inputMode="numeric" min="10" max="100" placeholder="เช่น 21" value={settings.age} onChange={(e) => patch({ age: e.target.value })} /><em>ปี</em></span>
                        </label>
                        <label>น้ำหนัก
                          <span className="st-unit"><input className="st-input" type="number" inputMode="decimal" min="20" max="300" step="0.1" placeholder="เช่น 55" value={settings.weight} onChange={(e) => patch({ weight: e.target.value })} /><em>kg</em></span>
                        </label>
                        <label>ส่วนสูง
                          <span className="st-unit"><input className="st-input" type="number" inputMode="decimal" min="100" max="250" step="0.1" placeholder="เช่น 160" value={settings.height} onChange={(e) => patch({ height: e.target.value })} /><em>cm</em></span>
                        </label>
                        <label>เป้าหมาย
                          <select className="st-input" value={settings.goal} onChange={(e) => patch({ goal: e.target.value })}>
                            <option value="">เลือกเป้าหมาย</option>
                            {GOALS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
                          </select>
                        </label>
                        <label>ระดับกิจกรรม
                          <select className="st-input" value={settings.activity} onChange={(e) => patch({ activity: e.target.value })}>
                            <option value="">เลือกระดับกิจกรรม</option>
                            {ACTIVITIES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
                          </select>
                        </label>
                      </div>
                    </section>

                    <section className="st-card" id="st-goals">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.target} size={18} /></span>เป้าหมายการออกกำลังกาย</h2>
                      <div className="st-form">
                        <label>จำนวนวันที่ต้องออกกำลังกาย
                          <select className="st-input" value={settings.daysPerWeek} onChange={(e) => patch({ daysPerWeek: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d} วัน / สัปดาห์</option>)}
                          </select>
                        </label>
                        <label>ระยะเวลาเป้าหมาย
                          <select className="st-input" value={settings.minutesPerSession} onChange={(e) => patch({ minutesPerSession: Number(e.target.value) })}>
                            {[...new Set([15, 20, 30, 45, 60, 75, 90, Number(settings.minutesPerSession)])].filter(Boolean).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} นาที / ครั้ง</option>)}
                          </select>
                        </label>
                        <label>แคลอรี่เป้าหมาย (kcal / วัน)
                          <span className="st-unit">
                            <input className="st-input" type="number" inputMode="numeric" min="500" max="10000"
                              placeholder={recommendedKcal ? String(recommendedKcal) : 'ยังไม่มีข้อมูล'}
                              value={settings.dailyKcal} onChange={(e) => patch({ dailyKcal: e.target.value })} /><em>kcal</em>
                          </span>
                          <small className="st-hint">เว้นว่างไว้เพื่อใช้ค่าที่แนะนำ{recommendedKcal ? ` (${recommendedKcal.toLocaleString()} kcal)` : ''}</small>
                        </label>
                        <div className="st-progress-box">
                          <div className="st-progress"><i style={{ width: `${goalPct}%` }} /></div>
                          <div className="st-progress-foot"><span>{activeDays} / {goalDays} วัน</span><span>7 วันล่าสุด</span></div>
                        </div>
                      </div>
                    </section>

                    <section className="st-card" id="st-security">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.shield} size={18} /></span>ความปลอดภัยและบัญชี</h2>
                      <ul className="st-actions">
                        <li>
                          <div><strong>เปลี่ยนรหัสผ่าน</strong><small>{hasPasswordProvider ? 'ตั้งรหัสผ่านใหม่เพื่อความปลอดภัยของบัญชี' : 'บัญชีนี้ไม่ได้เข้าสู่ระบบด้วยรหัสผ่าน'}</small></div>
                          <button type="button" className="st-btn primary" disabled={!hasPasswordProvider} onClick={() => setPw({ current: '', next: '', confirm: '', error: '', busy: false })}>เปลี่ยนรหัสผ่าน</button>
                        </li>
                        <li>
                          <div><strong>ออกจากระบบ</strong><small>สิ้นสุดการใช้งานในอุปกรณ์นี้</small></div>
                          <button type="button" className="st-btn danger-soft" onClick={() => setLogoutOpen(true)}>ออกจากระบบ</button>
                        </li>
                        <li>
                          <div><strong>ลบบัญชี</strong><small>ลบบัญชีและประวัติการออกกำลังกายถาวร</small></div>
                          <button type="button" className="st-btn danger" onClick={() => setDel({ password: '', error: '', busy: false })}>ลบบัญชี</button>
                        </li>
                      </ul>
                    </section>
                    </div>
                    <div className="st-col">
                    <section className="st-card" id="st-account">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.card} size={18} /></span>ข้อมูลบัญชี</h2>
                      {acc ? (
                        <div className="st-form">
                          <label>ชื่อผู้ใช้<input className="st-input" value={acc.name} autoFocus onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></label>
                          <label>Email<input className="st-input" type="email" value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} /></label>
                          <label>เบอร์โทรศัพท์<input className="st-input" type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" value={acc.phone} onChange={(e) => setAcc({ ...acc, phone: e.target.value })} /></label>
                          {acc.email.trim() !== email && (
                            <label>รหัสผ่านปัจจุบัน (ยืนยันการเปลี่ยนอีเมล)<input className="st-input" type="password" autoComplete="current-password" value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} /></label>
                          )}
                          {acc.error && <p className="st-error" role="alert">{acc.error}</p>}
                          <div className="st-row">
                            <button type="button" className="st-btn ghost" disabled={acc.busy} onClick={() => setAcc(null)}>ยกเลิก</button>
                            <button type="button" className="st-btn primary" disabled={acc.busy} onClick={saveAccount}>{acc.busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <dl className="st-kv">
                            <div><dt>ชื่อผู้ใช้</dt><dd>{name || 'ยังไม่มีข้อมูล'}</dd></div>
                            <div><dt>Email</dt><dd>{email || 'ยังไม่มีข้อมูล'}</dd></div>
                            <div><dt>เบอร์โทรศัพท์</dt><dd>{settings.phone || 'ยังไม่มีข้อมูล'}</dd></div>
                          </dl>
                          <button type="button" className="st-btn primary full" onClick={openAccountEdit}>แก้ไขข้อมูล</button>
                        </>
                      )}
                    </section>

                    <section className="st-card st-bmi">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.flame} size={18} /></span>ข้อมูลสุขภาพของฉัน</h2>
                      <div className="st-stats">
                        <div><small>น้ำหนัก</small><b>{settings.weight !== '' ? <>{settings.weight} <i>kg</i></> : '-'}</b></div>
                        <div><small>ส่วนสูง</small><b>{settings.height !== '' ? <>{settings.height} <i>cm</i></> : '-'}</b></div>
                        <div><small>BMI</small><b className="hl">{bmiText}</b></div>
                        <div><small>สถานะ</small><b className={`status ${bmi === null ? '' : status === 'ปกติ' ? 'ok' : 'warn'}`}>{status}</b></div>
                      </div>
                      <div className="st-bmi-bar" aria-label="ตัวชี้วัด BMI">
                        <div className="st-bmi-track">
                          {bmi !== null && <span className="st-bmi-pin" style={{ left: `${bmiPosition(bmi)}%` }} />}
                        </div>
                        <div className="st-bmi-labels"><span>ผอม</span><span>ปกติ</span><span>น้ำหนักเกิน</span><span>อ้วน</span></div>
                      </div>
                      <div className="st-kcal">
                        <small>พลังงานที่แนะนำต่อวัน</small>
                        {recommendedKcal ? (
                          <strong><Ico d={IC.flame} size={26} /> {recommendedKcal.toLocaleString()} <i>kcal</i></strong>
                        ) : (
                          <strong className="empty">ยังไม่มีข้อมูล</strong>
                        )}
                        <span>{recommendedKcal ? 'คำนวณจากเพศ อายุ น้ำหนัก ส่วนสูง ระดับกิจกรรม และเป้าหมายของคุณ' : 'กรอกอายุ น้ำหนัก และส่วนสูงเพื่อดูค่าที่แนะนำ'}</span>
                      </div>
                    </section>

                    <section className="st-card" id="st-notifications">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.bell} size={18} /></span>การแจ้งเตือน</h2>
                      <ul className="st-toggles">
                        {[
                          ['workout', 'แจ้งเตือนการออกกำลังกาย'],
                          ['water', 'แจ้งเตือนดื่มน้ำ'],
                          ['meal', 'แจ้งเตือนมื้ออาหาร'],
                          ['daily', 'แจ้งเตือนเป้าหมายประจำวัน'],
                          ['weekly', 'สรุปกิจกรรมประจำสัปดาห์'],
                        ].map(([key, label]) => (
                          <li key={key}><span>{label}</span><Toggle on={settings.notif[key]} onChange={(v) => patchNotif(key, v)} label={label} /></li>
                        ))}
                      </ul>
                      {settings.notif.workout && (
                        <div className="st-reminder">
                          <label>เวลาแจ้งเตือน
                            <select className="st-input" value={settings.reminderTime} onChange={(e) => patch({ reminderTime: e.target.value })}>
                              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </label>
                          <div className="st-days" role="group" aria-label="วันที่แจ้งเตือน">
                            {WEEKDAYS.map((d, i) => (
                              <button key={d} type="button" aria-pressed={settings.reminderDays[i]}
                                className={settings.reminderDays[i] ? 'on' : ''}
                                onClick={() => patch({ reminderDays: settings.reminderDays.map((v, j) => (j === i ? !v : v)) })}>
                                <span>{d}</span><b>{settings.reminderDays[i] ? '✓' : '-'}</b>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="st-card" id="st-display">
                      <h2 className="st-card-title"><span className="st-mini"><Ico d={IC.palette} size={18} /></span>รูปแบบการแสดงผล</h2>
                      <div className="st-field-label">ธีม</div>
                      <div className="st-seg" role="radiogroup" aria-label="ธีม">
                        {[['dark', 'Dark'], ['light', 'Light'], ['system', 'ตามระบบ']].map(([v, l]) => (
                          <button key={v} type="button" role="radio" aria-checked={themePref === v} className={themePref === v ? 'on' : ''} onClick={() => patchDisplay('theme', v)}>{l}</button>
                        ))}
                      </div>
                      <ul className="st-toggles">
                        <li><span>Animation</span><Toggle on={settings.display.animation} onChange={(v) => patchDisplay('animation', v)} label="Animation" /></li>
                        <li><span>Neon Glow</span><Toggle on={settings.display.neon} onChange={(v) => patchDisplay('neon', v)} label="Neon Glow" /></li>
                      </ul>
                    </section>
                    </div>
                  </div>

                  <button type="button" className="st-save" disabled={saving} onClick={saveAll}>
                    <Ico d={IC.save} size={22} /> {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

      {/* ===== Modals ===== */}
      {pw && (
        <Modal title="เปลี่ยนรหัสผ่าน" onClose={() => !pw.busy && setPw(null)}>
          <label>รหัสผ่านปัจจุบัน<input className="st-input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label>รหัสผ่านใหม่<input className="st-input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <label>ยืนยันรหัสผ่านใหม่<input className="st-input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          {pw.error && <p className="st-error" role="alert">{pw.error}</p>}
          <div className="st-row end">
            <button type="button" className="st-btn ghost" disabled={pw.busy} onClick={() => setPw(null)}>ยกเลิก</button>
            <button type="button" className="st-btn primary" disabled={pw.busy} onClick={submitPassword}>{pw.busy ? 'กำลังเปลี่ยน...' : 'เปลี่ยนรหัสผ่าน'}</button>
          </div>
        </Modal>
      )}

      {logoutOpen && (
        <Modal title="ต้องการออกจากระบบหรือไม่?" onClose={() => setLogoutOpen(false)}>
          <div className="st-row end">
            <button type="button" className="st-btn ghost" onClick={() => setLogoutOpen(false)}>ยกเลิก</button>
            <button type="button" className="st-btn danger" onClick={handleLogout}>ออกจากระบบ</button>
          </div>
        </Modal>
      )}

      {del && (
        <Modal title="⚠️ ลบบัญชี" danger onClose={() => !del.busy && setDel(null)}>
          <p className="st-warn">การดำเนินการนี้อาจทำให้ข้อมูลบัญชีและประวัติการออกกำลังกายถูกลบ และไม่สามารถกู้คืนได้</p>
          {hasPasswordProvider && (
            <label>รหัสผ่านปัจจุบัน (เพื่อยืนยัน)<input className="st-input" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></label>
          )}
          {del.error && <p className="st-error" role="alert">{del.error}</p>}
          <div className="st-row end">
            <button type="button" className="st-btn ghost" disabled={del.busy} onClick={() => setDel(null)}>ยกเลิก</button>
            <button type="button" className="st-btn danger solid" disabled={del.busy} onClick={confirmDelete}>{del.busy ? 'กำลังลบ...' : 'ยืนยันการลบบัญชี'}</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div key={toast.id} className={`st-toast ${toast.type}`} role="status">
          <span>{toast.type === 'error' ? '!' : '✓'}</span>{toast.text}
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

/* สไตล์ส่วนโครงหน้า (แถบข้าง แถบบน แจ้งเตือน ธีม) ใช้ชุดเดียวกับหน้า Dashboard */
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

.fittrack-app h1,
.fittrack-app h2,
.fittrack-app h3 { color:var(--text) }
.fittrack-app img { color:var(--muted) }
:root { --bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735 }
* { box-sizing:border-box }
html,
body,
#root { margin:0;min-height:100%;background:var(--bg) }
body { font-family:'Anuphan',sans-serif;color:var(--text);overflow-x:hidden }
/* ช่องกรอก/ตัวเลือกทุกชนิดใช้ฟอนต์เดียวกับทั้งหน้า (เดิม select/option ใช้ฟอนต์ระบบของเบราว์เซอร์) */
button,
input,
select,
option,
optgroup,
textarea { font:inherit }

/* ใช้ฟอนต์ตัวเดียวทั้งหน้า: เปลี่ยนฟอนต์ได้ที่ตัวแปรนี้ที่เดียว (เช่น 'Kanit') */
:root { --font-main:'Kanit',sans-serif; }
body,
body *,
body *::before,
body *::after,
select,
option,
optgroup { font-family:var(--font-main) !important; }
.fittrack-app { min-height:100vh;background:radial-gradient(circle at 75% 8%,rgba(50,255,100,.06),transparent 22%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.045),transparent 22%),#020609 }
.sidebar { position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column }
.sidebar:after { display:none }
.sidebar-logo-wrap { text-align:center;padding:4px 4px 25px }
.sidebar-logo { display:block;width:190px;height:112px;object-fit:contain;margin:0 auto }
.logo-caption { font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px }
.side-menu { display:flex;flex-direction:column;gap:9px }
.side-link { height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s }
.side-link:hover { border-color:#35534a;background:rgba(103,255,41,.05) }
.side-link.active { color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05) }
.side-icon { width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef }
.side-link.active .side-icon { color:var(--green) }
.sidebar-quote { margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:'Kanit';font-size:15px;line-height:1.55;font-style:italic }
.pulse-line { margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39 }
.pulse-line:before { content:'';position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33 }
.pulse-line i:first-child { position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg) }
.pulse-line b { position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg) }
.pulse-line i:last-child { position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff }
.logout-link { height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px }
.logout-link span { font-size:24px;margin-right:12px;color:#dce6e6 }
.main-area { margin-left:220px;min-height:100vh;padding:0 10px 40px;width:calc(100% - 220px) }
.topbar { height:100px;border-bottom:1px solid #18343b;display:flex;align-items:center;justify-content:space-between;padding:0 5px 0 18px }
.user-block { display:flex;align-items:center;gap:12px }
.avatar-wrap { position:relative;width:58px;height:58px }
.avatar-fallback { width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-weight:700;font-size:20px;box-shadow:0 0 0 3px rgba(255,255,255,.03) }
.online-dot { position:absolute;right:0;bottom:0;width:17px;height:17px;border-radius:50%;background:#6eff35;border:2px solid #06100c }
.hello { font-size:13px;color:#ddd;line-height:1.1 }
.user-block strong { font-family:'Kanit';font-size:22px;line-height:1.15 }
.topbar-right { display:flex;align-items:center;gap:15px }
.ai-note { text-align:right;font-size:12px;line-height:1.35;color:#e4e4e4;font-style:italic }
.ai-note em { color:var(--green);font-style:normal;font-weight:700 }
.ai-note span { color:#a24aff;font-size:20px }
.icon-button { position:relative;width:42px;height:42px;background:transparent;border:0;color:#f2f2f2;font-size:25px;cursor:pointer }
.icon-button i { position:absolute;right:6px;top:6px;width:7px;height:7px;background:#ff4667;border-radius:50% }
.icon-button.sun { font-size:28px }
.date-box { border-right:1px solid #30434a;padding:3px 15px;color:#ddd;font-size:11px;line-height:1.4 }
.date-box small { font-size:10px }
.dark-card { background:linear-gradient(145deg,#050b0e,#071116);border:1px solid #2a5360;border-radius:15px;box-shadow:inset 0 0 25px rgba(0,0,0,.25) }
.card-title { display:flex;align-items:center;gap:10px }
.card-title h2 { font-family:'Kanit';font-size:18px;margin:0;font-weight:500 }
.title-icon { width:34px;height:34px;display:grid;place-items:center;border-radius:9px;font-size:20px }
.title-icon.purple { color:#df78ff;border:1px solid #9442ba;background:rgba(174,58,255,.1) }
.title-icon.green { color:#91ff3e;border:1px solid #5ea02c;background:rgba(110,255,45,.07) }
.title-icon.yellow { color:#e7ef36;border:1px solid #9b9f27;background:rgba(232,240,48,.05) }
.lime-btn { height:37px;border:0;border-radius:8px;background:linear-gradient(90deg,#72ed2e,#baff3e);color:#071005;font-weight:700;cursor:pointer;box-shadow:0 0 16px rgba(125,255,45,.15) }
@media(max-width:1100px) {
  .sidebar { width:190px }
  .main-area { margin-left:190px;width:calc(100% - 190px) }
}
@media(max-width:760px) {
  .sidebar { position:relative;width:100%;height:auto;min-height:auto;padding:10px }
  .sidebar:after { display:none }
  .sidebar-logo { width:155px;height:88px }
  .side-menu { display:grid;grid-template-columns:repeat(5,1fr) }
  .side-link { height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px }
  .side-icon { font-size:18px }
  .sidebar-quote,
.logout-link { display:none }
  .main-area { margin-left:0;width:100%;padding:0 10px 25px }
  .topbar { height:auto;padding:13px 2px;gap:10px }
  .topbar-right { gap:5px }
  .ai-note,
.date-box { display:none }
}
.sidebar { border-right:1px solid #18343b !important; }
.main-area { border-right:0 !important;   outline-right:0 !important; }
.main-area { width:calc(100% - 220px) !important;   padding-right:0 !important; }
html,
body { width:100% !important;   max-width:none !important;   margin:0 !important; }
#root { width:100% !important;   max-width:none !important;   margin:0 !important;   padding:0 !important;   border:0 !important;   border-inline:0 !important;   box-shadow:none !important; }
.fittrack-app { width:100%; }
html.theme-anim * { transition:background-color .3s ease,border-color .3s ease,color .3s ease !important; }
html[data-theme="dark"] { color-scheme:dark }
html[data-theme="light"] { color-scheme:light;   --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;   --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a; }
html[data-theme="light"] .fittrack-app { background:radial-gradient(circle at 75% 8%,rgba(60,200,100,.14),transparent 24%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.08),transparent 24%),#edf3f1; }
html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important }
html[data-theme="light"] .sidebar-logo { filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply }
html[data-theme="light"] .side-link { color:#2a3a36 }
html[data-theme="light"] .side-link:hover { border-color:#9bc59a;background:rgba(60,170,40,.08) }
html[data-theme="light"] .side-link.active { color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16) }
html[data-theme="light"] .side-icon { color:#33433f }
html[data-theme="light"] .side-link.active .side-icon { color:#2a9d16 }
html[data-theme="light"] .sidebar-quote { color:#2a3a36 }
html[data-theme="light"] .pulse-line { border-bottom-color:#4fb82b }
html[data-theme="light"] .logout-link { color:#33433f;border-top-color:#d5e1dd }
html[data-theme="light"] .logout-link span { color:#33433f }
html[data-theme="light"] .topbar { border-bottom-color:#d3dfdb }
html[data-theme="light"] .online-dot { border-color:#edf3f1 }
html[data-theme="light"] .hello { color:#4a5b57 }
html[data-theme="light"] .ai-note { color:#3a4a46 }
html[data-theme="light"] .icon-button { color:#1f2d29 }
html[data-theme="light"] .date-box { color:#3a4a46;border-right-color:#c9d7d3 }
html[data-theme="light"] .dark-card { background:linear-gradient(145deg,#ffffff,#f5f9f8);border-color:#cddbd7;box-shadow:none }
html[data-theme="light"] .title-icon.purple { color:#9a2fd0;border-color:#c48be4;background:rgba(174,58,255,.08) }
html[data-theme="light"] .title-icon.green { color:#2a8a14;border-color:#8fcf63;background:rgba(110,255,45,.12) }
html[data-theme="light"] .title-icon.yellow { color:#8a7d00;border-color:#d4c94a;background:rgba(232,240,48,.15) }
@keyframes fittrack-logo-glow { 0%, 100% {     filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);   }   50% {     filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);   } }
.sidebar-logo { animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;   will-change: filter; }
@media (prefers-reduced-motion: reduce) {
  .sidebar-logo { animation-duration: 8s !important; }
}
.notification-wrap { position: relative; }
.notification-wrap .icon-button { display: grid; place-items: center; }
.notification-panel { position: absolute; z-index: 100; top: calc(100% + 12px); right: -62px;   width: min(320px, calc(100vw - 28px)); padding: 14px;   border: 1px solid #2d535d; border-radius: 13px;   background: #071116; color: #f4f7f6; box-shadow: 0 14px 40px rgba(0,0,0,.55); }
.notification-panel-title { display:flex; align-items:center; justify-content:space-between; gap:12px; font: 600 15px 'Kanit',sans-serif; margin-bottom: 9px; }
.notification-panel-title button { border:0; background:transparent; color:#b9c5c7; font-size:22px; cursor:pointer; }
.notification-item { display:flex; flex-direction:column; gap:4px; padding:10px 0; border-top:1px solid #203941; }
.notification-item strong { color:#a8f34a; font-size:12px; }
.notification-item span { font-size:11px; line-height:1.5; }
.notification-item small,
.notification-hint { color:#93a1a5; font-size:9px; line-height:1.5; }
.notification-hint { display:block; padding-top:8px; border-top:1px solid #203941; }
html[data-theme="light"] .notification-panel { background:#fff; color:#1d302b; border-color:#c8d8d2; box-shadow:0 14px 40px rgba(20,45,35,.18); }
html[data-theme="light"] .notification-item { border-color:#e0e9e5; }
html[data-theme="light"] .notification-hint { border-color:#e0e9e5; }
@media(max-width:760px) {
  .notification-panel { right:-42px; top:calc(100% + 8px); }
}
html[data-theme="light"] body,
html[data-theme="light"] #root { background:#edf4f1; color:#172923; }
html[data-theme="light"] .fittrack-app { background:radial-gradient(circle at 74% 7%,rgba(111,210,80,.13),transparent 25%),              radial-gradient(circle at 92% 62%,rgba(170,91,225,.09),transparent 24%),#edf4f1;   color:#172923; }
html[data-theme="light"] .main-area { color:#172923; }
html[data-theme="light"] .topbar { background:rgba(249,252,250,.76); border-bottom-color:#c8d8d1; }
html[data-theme="light"] .hello,
html[data-theme="light"] .ai-note,
html[data-theme="light"] .date-box { color:#40554d; }
html[data-theme="light"] .user-block strong { color:#172923; }
html[data-theme="light"] .icon-button { color:#263c33; }
html[data-theme="light"] .icon-button:hover { color:#278b20; background:#e3f3df; border-radius:10px; }
html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#fbfefc 0%,#edf5f1 100%); border-right-color:#c8d8d1 !important; }
html[data-theme="light"] .logo-caption { color:#53675f; }
html[data-theme="light"] .side-link { color:#31473e; }
html[data-theme="light"] .side-link:hover { background:#e8f4e5; border-color:#b7d7ae; }
html[data-theme="light"] .side-link.active { color:#17351b; background:linear-gradient(100deg,#dff5d7,#f1faed); border-color:#65b947; box-shadow:0 5px 15px rgba(66,145,48,.12),inset 0 0 0 1px rgba(255,255,255,.65); }
html[data-theme="light"] .side-icon { color:#40584e; }
html[data-theme="light"] .side-link.active .side-icon { color:#258d20; }
html[data-theme="light"] .sidebar-quote { color:#40564c; }
html[data-theme="light"] .logout-link { color:#40564c; border-top-color:#cfddd7; }
html[data-theme="light"] .logout-link span { color:#40564c; }
html[data-theme="light"] .dark-card { color:#172923; border-color:#c5d8d0;   background:linear-gradient(145deg,#ffffff 0%,#f6fbf8 100%);   box-shadow:0 8px 24px rgba(29,76,56,.075),inset 0 1px 0 rgba(255,255,255,.9); }
html[data-theme="light"] .card-title h2 { color:#172923; }
html[data-theme="light"] .title-icon.green { color:#278b20; border-color:#a5d38f; background:#e8f7df; }
html[data-theme="light"] .title-icon.purple { color:#8734b7; border-color:#d3a7e8; background:#f5e9fc; }
html[data-theme="light"] .title-icon.yellow { color:#887500; border-color:#dfd17b; background:#fff9d9; }
html[data-theme="light"] .lime-btn { background:linear-gradient(100deg,#66d92e,#a4ed39); color:#15300e; box-shadow:0 4px 12px rgba(74,166,39,.16); }
html[data-theme="light"] .lime-btn:hover { filter:saturate(1.08) brightness(.98); }
html[data-theme="light"] .notification-panel { background:#fff; color:#20372d; border-color:#c8d9d1; box-shadow:0 14px 38px rgba(29,67,49,.17); }
html[data-theme="light"] .notification-panel-title button { color:#52685e; }
html[data-theme="light"] .notification-item { border-color:#dce7e1; }
html[data-theme="light"] .notification-item strong { color:#287f1b; }
html[data-theme="light"] .notification-item span { color:#2e4439; }
html[data-theme="light"] .notification-item small,
html[data-theme="light"] .notification-hint { color:#657970; }
html[data-theme="light"] .notification-hint { border-color:#dce7e1; }
html[data-theme="light"] .fittrack-app { background: radial-gradient(ellipse at 78% 0%, #e8f6ee 0%, #f4f8f5 38%, #f2f6f4 100%);   color: #182b24; }
html[data-theme="light"] .sidebar { background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;   border-right: 1px solid #c5d9ce !important;   box-shadow: 5px 0 22px rgba(26, 74, 49, .045); }
html[data-theme="light"] .topbar { background: rgba(255,255,255,.82);   border-bottom: 1px solid #d2e2d9; }
html[data-theme="light"] .card-title h2 { color:#183128; }
html[data-theme="light"] .card-title p { color:#50665b; }
html[data-theme="light"] input,
html[data-theme="light"] textarea,
html[data-theme="light"] select { background:#fff; color:#1a3026; border-color:#afcbbd; }
html[data-theme="light"] .lime-btn { background:linear-gradient(105deg,#4bbd2a,#8bdc43); color:#12320d; box-shadow:0 5px 14px rgba(55,145,29,.2); }
html[data-theme="light"] .side-link.active { background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32; }
html[data-theme="light"] .icon-button { background:#f0f8f3; border:1px solid #c8ded1; color:#244b35; }
html[data-theme="light"] .icon-button:hover { background:#e3f4e9; }
.notification-wrap .notification-bell { border-radius: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 5px; transition: color .2s ease, transform .2s ease; }
.notification-wrap .notification-bell svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.notification-wrap .notification-bell:hover { transform: translateY(-2px) scale(1.06); background: transparent !important; box-shadow: none !important; color: var(--green); }
.notification-panel { width:min(360px,calc(100vw - 28px)); padding:0; overflow:hidden; border-radius:16px; animation: notif-pop .2s ease-out; }
.notification-panel-title { padding:15px 16px 12px; margin:0; border-bottom:1px solid rgba(130,160,150,.2); }
.notification-panel-title>span { display:flex; align-items:baseline; gap:8px; }
.notification-panel-title>span>small { font:400 10px 'Anuphan',sans-serif; opacity:.65; }
.notification-panel-title button { width:27px;height:27px;border-radius:50%;line-height:1; }
.notification-panel-title button:hover { background:rgba(130,150,140,.15); }
.notification-item { position:relative; flex-direction:row; align-items:flex-start; gap:10px; padding:12px 15px; border-top:0; transition:background .18s ease; }
.notification-item:hover { background:rgba(120,160,140,.10); }
.notification-avatar { flex:0 0 38px; width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:17px;background:linear-gradient(145deg,#244d37,#142c22);box-shadow:0 2px 8px rgba(0,0,0,.14); }
.notification-avatar.goal-avatar { background:linear-gradient(145deg,#56317b,#322047); }
.notification-message { min-width:0; flex:1; display:flex; flex-direction:column; gap:3px; }
.notification-message strong { color:inherit; font-size:11px; }
.notification-message strong small { font-size:9px;font-weight:400;color:#94a39d; }
.notification-message span { font-size:11px;line-height:1.5; }
.notification-message>small { font-size:9px;line-height:1.4;color:#9aa9a3; }
.notification-unread { flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#4eaeef;margin:7px 1px 0 0;box-shadow:0 0 0 3px rgba(78,174,239,.12); }
.notification-hint { display:block;padding:10px 15px 12px;border-top:1px solid rgba(130,160,150,.2); }
@keyframes notif-pop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
html[data-theme="light"] .notification-panel { background:#fff; color:#24372e; border-color:#c9ddd2; }
html[data-theme="light"] .notification-panel-title { border-color:#e2ebe5; }
html[data-theme="light"] .notification-item:hover { background:#f3f9f5; }
html[data-theme="light"] .notification-avatar { background:linear-gradient(145deg,#dff4e5,#c5e9d1); }
html[data-theme="light"] .notification-avatar.goal-avatar { background:linear-gradient(145deg,#f0e1ff,#dfc7f7); }
html[data-theme="light"] .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-message strong small,
html[data-theme="light"] .notification-message>small { color:#6e8276; }
html[data-theme="light"] .notification-hint { border-color:#e2ebe5; }
@media (prefers-reduced-motion: reduce) {
  .notification-panel { animation:none!important;transition:none!important; }
}
.notification-wrap .notification-bell { appearance:none; -webkit-appearance:none; background:transparent!important; border:0!important; outline-offset:3px; box-shadow:none!important; border-radius:0!important; }
.notification-wrap .notification-bell:hover,
.notification-wrap .notification-bell:focus-visible { background:transparent!important; box-shadow:none!important; color:var(--green); }
html[data-theme="light"] .notification-wrap .notification-bell { background:transparent!important; border:0!important; box-shadow:none!important; color:#244b35; }
html[data-theme="light"] .notification-wrap .notification-bell:hover { background:transparent!important; color:#278b20; }
.title-icon .bmi-title-svg { width:23px;height:23px;display:block;flex:none }
.notification-wrap .notification-panel { position: fixed; z-index: 9999; top: 88px; right: 24px;   width: min(370px, calc(100vw - 28px)); max-height: calc(100vh - 110px);   overflow: visible; padding: 0; border: 0; border-radius: 0;   background: transparent; color: inherit; box-shadow: none;   display: flex; flex-direction: column; gap: 10px;   animation: none; }
.notification-panel-title { order: -1; display:flex; align-items:center; justify-content:space-between;   margin:0 0 2px; padding:0 2px 4px; border:0; font-size:12px;   color:var(--muted,#82918b); text-shadow:0 1px 5px rgba(0,0,0,.12); }
.notification-panel-title>span { display:flex; align-items:baseline; gap:7px; }
.notification-panel-title>span>small { font-size:10px; }
.notification-panel-title button { color:inherit; width:24px; height:24px; font-size:20px; }
.notification-panel .notification-item { box-sizing:border-box; width:100%; min-height:76px; padding:13px 14px;   display:flex; flex-direction:row; align-items:flex-start; gap:11px;   border:1px solid rgba(150,175,162,.24); border-radius:14px;   background:rgba(13,27,24,.97); color:#f5faf6;   box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12);   animation:toast-enter .42s cubic-bezier(.2,.8,.2,1) both; }
.notification-panel .notification-item:nth-of-type(3) { animation-delay:.22s; }
.notification-panel .notification-item:hover { transform:translateX(-3px); background:rgba(20,39,32,.99); }
.notification-panel .notification-avatar { flex:0 0 38px; width:38px; height:38px; }
.notification-panel .notification-message { flex:1; min-width:0; gap:4px; }
.notification-panel .notification-message strong { font-size:12px; color:#f4faf5; }
.notification-panel .notification-message strong small { font-size:10px; color:#a7b8ad; }
.notification-panel .notification-message span { font-size:12px; line-height:1.5; color:#eef5f0; }
.notification-panel .notification-message>small { font-size:10px; line-height:1.45; color:#aab9b0; }
.notification-panel .notification-unread { margin-top:6px; }
.notification-panel .notification-hint { display:none; }
html[data-theme="light"] .notification-panel-title { color:#5c7065; text-shadow:none; }
html[data-theme="light"] .notification-panel .notification-item { background:rgba(255,255,255,.98); color:#24372e;   border-color:#dce9e0; box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07); }
html[data-theme="light"] .notification-panel .notification-item:hover { background:#f9fffb; }
html[data-theme="light"] .notification-panel .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-panel .notification-message strong small,
html[data-theme="light"] .notification-panel .notification-message>small { color:#718378; }
html[data-theme="light"] .notification-panel .notification-message span { color:#2e4438; }
@keyframes toast-enter { from { opacity:0; transform:translate3d(28px,-8px,0) scale(.97); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
@media(max-width:600px) {
  .notification-wrap .notification-panel { top:76px; right:12px; width:min(360px,calc(100vw - 24px)); }
}
@media(prefers-reduced-motion:reduce) {
  .notification-panel .notification-item { animation:none!important; transition:none!important; }
}
.notification-panel .notification-item { text-align:left; justify-content:flex-start; }
.notification-panel .notification-message { text-align:left; align-items:flex-start; }
.notification-panel .notification-message strong,
.notification-panel .notification-message span,
.notification-panel .notification-message>small { display:block; width:100%; text-align:left; }
.notification-panel .notification-avatar.dumbbell-avatar { flex:0 0 36px; width:36px; height:36px; border-radius:10px;   display:grid; place-items:center; background:transparent!important;   box-shadow:none!important; color:#83dc78; margin-top:1px; }
.notification-panel .notification-avatar.dumbbell-avatar svg { display:block; width:25px; height:25px; fill:none; stroke:currentColor;   stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
html[data-theme="light"] .notification-panel .notification-avatar.dumbbell-avatar { color:#278b43; }
.notification-wrap .notification-panel { background:transparent!important; border:0!important; box-shadow:none!important; }
.notification-wrap .notification-panel .notification-item { background:rgba(13,27,24,.97)!important;   border:1px solid rgba(150,175,162,.24)!important;   border-radius:14px!important;   box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12)!important;   color:#f5faf6; }
html[data-theme="light"] .notification-wrap .notification-panel .notification-item { background:rgba(255,255,255,.98)!important;   border-color:#dce9e0!important;   box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07)!important;   color:#24372e; }
.notification-wrap .notification-panel .notification-message,
.notification-wrap .notification-panel .notification-message strong,
.notification-wrap .notification-panel .notification-message span,
.notification-wrap .notification-panel .notification-message>small { background:transparent!important; box-shadow:none!important; }
.notification-wrap .notification-panel .notification-item:hover { transform:translateX(-3px); }
html[data-theme="light"] .notification-wrap .notification-panel .notification-item:hover { background:#f9fffb!important; }
@media (max-width: 760px) {
  html,
body,
#root,
.fittrack-app { width:100%; min-width:0; max-width:100%; }
  body { overflow-x:hidden; }
  .sidebar { width:100%; min-width:0; padding:8px 7px 9px; }
  .sidebar-logo-wrap { padding:0 2px 8px; }
  .sidebar-logo { width:132px; height:68px; max-width:42vw; }
  .logo-caption { margin-top:-5px; font-size:6px; letter-spacing:1.5px; }
  .side-menu { width:100%; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; }
  .side-link { width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere; }
  .side-icon { width:auto; min-height:19px; font-size:19px; line-height:1; }
  .main-area { margin:0!important; width:100%!important; min-width:0; padding:0 10px 22px!important; }
  .topbar { width:100%; min-width:0; min-height:70px; height:auto; padding:10px 2px; gap:8px; }
  .user-block { min-width:0; gap:8px; }
  .avatar-wrap,
.avatar-fallback { width:42px; height:42px; }
  .avatar-fallback { font-size:16px; }
  .online-dot { width:12px; height:12px; }
  .hello { font-size:11px; }
  .user-block strong { display:block; max-width:32vw; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .topbar-right { min-width:0; gap:4px; }
  .icon-button { width:36px; height:38px; flex:0 0 36px; font-size:22px; }
  .icon-button.sun { font-size:24px; }
  .notification-wrap { position:relative; }
  .notification-wrap .notification-panel { position:absolute; top:calc(100% + 8px); right:-4px; left:auto; width:min(340px,calc(100vw - 24px)); max-height:min(65vh,440px); overflow-y:auto; z-index:1000; }
  .dark-card { width:100%; min-width:0; }
}
@media (max-width: 390px) {
  .main-area { padding-left:8px!important; padding-right:8px!important; }
  .topbar { gap:4px; }
  .user-block { gap:6px; }
  .avatar-wrap,
.avatar-fallback { width:38px; height:38px; }
  .user-block strong { font-size:16px; max-width:29vw; }
  .topbar-right { gap:1px; }
  .icon-button { width:32px; flex-basis:32px; }
}
@media (max-width: 340px) {
  .side-link { font-size:7.5px; }
}
@media (max-width: 760px) and (orientation: landscape) {
  .sidebar-logo-wrap { display:none; }
  .sidebar { padding:5px 7px; }
  .side-link { height:44px; flex-direction:row; font-size:9px; }
}
.side-icon-dumbbell { display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px; }
.side-icon-dumbbell svg { display:block; width:25px; height:25px; }
@media (max-width:760px) {
  .side-icon-dumbbell { flex:0 0 auto; min-height:19px; }
  .side-icon-dumbbell svg { width:19px; height:19px; }
}
.fittrack-footer { width:100%; min-width:0; margin:28px 0 0; padding:16px 8px 10px;   border-top:1px solid rgba(91,145,139,.24);   display:flex; align-items:center; justify-content:space-between; gap:12px;   color:var(--muted); font-family:'Anuphan',sans-serif; }
.footer-brand { display:flex; align-items:center; gap:9px; color:var(--text); white-space:nowrap }
.footer-mark { width:27px;height:27px;display:grid;place-items:center;border-radius:8px;   color:#071006;background:linear-gradient(135deg,#9cff37,#36d98a);   font:700 10px 'Kanit',sans-serif;letter-spacing:-.5px;   box-shadow:0 3px 12px rgba(125,255,54,.16) }
.footer-brand strong { font:600 15px 'Kanit',sans-serif;letter-spacing:.25px;   background:linear-gradient(90deg,#baff52,#42dca0);-webkit-background-clip:text;background-clip:text;color:transparent }
.footer-description { font-size:11px;text-align:center;line-height:1.5 }
.footer-copyright { font-size:10px;white-space:nowrap;opacity:.78 }
html[data-theme="light"] .fittrack-footer { border-top-color:rgba(57,120,99,.2);color:#64766d }
html[data-theme="light"] .footer-brand { color:#20382d }
@media(max-width:760px) {
  .fittrack-footer { margin-top:18px;padding:13px 4px 8px;flex-wrap:wrap;justify-content:center;gap:6px 12px }
  .footer-brand { width:100%;justify-content:center }
  .footer-description { font-size:10px;width:100% }
  .footer-copyright { font-size:9px;width:100%;text-align:center }
}



/* ===================== SETTINGS PAGE (เนื้อหาเฉพาะหน้า) ===================== */
.avatar-fallback { overflow:hidden; }
.avatar-fallback img { width:100%; height:100%; object-fit:cover; display:block; }
.st-content { width:100%; padding:20px 8px 0; }
.st-shell { padding:22px 22px 24px; display:grid; gap:16px; border-color:#2f7a52; box-shadow:inset 0 0 0 1px rgba(110,255,50,.08), 0 0 28px rgba(80,255,120,.06); }
.st-head { display:flex; align-items:center; gap:16px; }
.st-head-icon { width:62px; height:62px; flex:none; display:grid; place-items:center; border:2px solid #7cff31; border-radius:14px; color:#8cff32; box-shadow:0 0 16px rgba(110,255,50,.25); }
.st-head-copy { min-width:0; }
.st-head h1 { margin:0; font:600 32px/1.2 'Kanit',sans-serif; }
.st-head p { margin:2px 0 0; color:var(--muted); font-size:14px; }
.st-head-ai { margin-left:auto; width:210px; flex:none; text-align:right; font-size:12px; line-height:1.4; font-style:italic; color:#e4e4e4; }
.st-head-ai em { color:var(--green); font-style:normal; font-weight:700; }
.st-ecg { margin-top:6px; }
.st-loading { padding:40px 10px; text-align:center; color:var(--muted); }

.st-layout { display:grid; grid-template-columns:250px minmax(0,1fr); gap:16px; align-items:start; }
.st-main { display:grid; gap:16px; min-width:0; }
/* 2 คอลัมน์อิสระ ไม่มีช่องว่างระหว่างการ์ด การ์ดสุดท้ายของคอลัมน์ที่สั้นกว่าจะยืดให้ชนขอบล่างเท่ากัน */
.st-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:stretch; }
.st-col { display:flex; flex-direction:column; gap:14px; min-width:0; }
.st-col > .st-card:last-child { flex:1 1 auto; display:flex; flex-direction:column; }
.st-col > .st-card:last-child .st-actions { flex:1; grid-auto-rows:1fr; }
.st-col > .st-card:last-child .st-toggles { flex:1; align-content:space-around; }
.st-card { min-width:0; padding:16px; border:1px solid #1f4f55; border-radius:14px; background:rgba(255,255,255,.015); box-shadow:inset 0 0 22px rgba(0,0,0,.18), 0 0 12px rgba(24,216,255,.04); scroll-margin-top:12px; }
.st-card { transition:border-color .25s ease, box-shadow .25s ease; animation:st-rise .5s cubic-bezier(.2,.8,.2,1) both; }
.st-col > .st-card:nth-child(2) { animation-delay:.07s; }
.st-col > .st-card:nth-child(3) { animation-delay:.14s; }
.st-col > .st-card:nth-child(4) { animation-delay:.21s; }
.st-col > .st-card:hover { border-color:#2f7a52; box-shadow:inset 0 0 22px rgba(0,0,0,.18), 0 6px 26px rgba(80,255,120,.10); }
@keyframes st-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .st-card { animation:none; } }
.st-card-title { display:flex; align-items:center; gap:10px; margin:0 0 14px; font:500 18px 'Kanit',sans-serif; }
.st-mini { width:32px; height:32px; flex:none; display:grid; place-items:center; border:1px solid #5ea02c; border-radius:9px; background:rgba(110,255,45,.07); color:#91ff3e; }

.st-menu { position:sticky; top:12px; display:flex; flex-direction:column; gap:12px; }
.st-menu-title { order:0; }
.st-menu-sum { display:flex; align-items:center; gap:10px; padding:4px 2px 12px; border-bottom:1px dashed #1f4f55; min-width:0; }
.st-menu-sum > div { min-width:0; display:grid; }
.st-menu-sum strong { font:500 15px 'Kanit',sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.st-menu-sum small { color:var(--muted); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.st-menu-ava { width:42px; height:42px; flex:none; border-radius:50%; overflow:hidden; display:grid; place-items:center; border:2px solid var(--cyan); background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%); color:#fff; font:600 17px 'Kanit',sans-serif; }
.st-menu-ava img { width:100%; height:100%; object-fit:cover; display:block; }
.st-menu-meter { display:flex; align-items:center; gap:12px; margin-top:4px; padding:12px; border:1px solid rgba(110,255,50,.25); border-radius:12px; background:linear-gradient(135deg,rgba(14,40,22,.55),rgba(4,12,12,.4)); }
.st-menu-meter > div:last-child { min-width:0; display:grid; gap:3px; }
.st-menu-meter strong { font:500 12.5px 'Kanit',sans-serif; }
.st-menu-meter small { font-size:11.5px; color:var(--green2); }
.st-menu-meter button { padding:0; border:0; background:none; color:var(--green2); font-size:11.5px; text-align:left; cursor:pointer; }
.st-menu-meter button:hover { text-decoration:underline; }
.st-ring { --p:0; width:52px; height:52px; flex:none; display:grid; place-items:center; border-radius:50%; background:conic-gradient(var(--green) calc(var(--p) * 1%), rgba(255,255,255,.1) 0); position:relative; transition:background .4s ease; }
.st-ring::before { content:''; position:absolute; inset:5px; border-radius:50%; background:#07131a; }
.st-ring b { position:relative; font:600 12px 'Kanit',sans-serif; }
.st-menu-title { margin:0 0 10px; font:500 16px 'Kanit',sans-serif; color:var(--muted); }
.st-menu-list { display:grid; gap:6px; }
.st-menu-item { display:flex; align-items:center; gap:12px; min-height:46px; padding:0 12px; border:1px solid transparent; border-radius:11px; background:transparent; color:#d8dddd; font-size:13.5px; text-align:left; cursor:pointer; transition:.2s; }
.st-menu-item svg { flex:none; color:#cfe3dc; }
.st-menu-item:hover { border-color:#35534a; background:rgba(103,255,41,.05); }
.st-menu-item.active { color:#fff; border-color:#7cff31; background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04)); box-shadow:0 0 16px rgba(110,255,50,.18), inset 0 0 14px rgba(100,255,40,.05); }
.st-menu-item.active svg { color:var(--green); }

.st-profile { display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; }
.st-avatar { width:104px; height:104px; margin-bottom:8px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%); border:2px solid var(--cyan); box-shadow:0 0 0 4px rgba(24,216,255,.1), 0 0 20px rgba(110,255,50,.25); color:#fff; font:600 38px 'Kanit',sans-serif; }
.st-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
.st-profile-name { font:600 22px 'Kanit',sans-serif; word-break:break-word; }
.st-profile-mail { color:var(--muted); font-size:13px; word-break:break-all; }
.st-profile-since { color:var(--green2); font-size:12px; margin-bottom:10px; }

.st-row { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.st-row.end { justify-content:flex-end; }
.st-btn { min-height:38px; padding:0 18px; border-radius:10px; border:1px solid transparent; font-size:13px; font-weight:600; cursor:pointer; transition:.2s; max-width:100%; }
.st-btn:disabled { opacity:.5; cursor:not-allowed; }
.st-btn.full { width:100%; margin-top:12px; }
.st-btn.primary { background:linear-gradient(90deg,rgba(24,216,255,.14),rgba(110,255,50,.16)); border-color:#3fbf8f; color:var(--text); }
.st-btn.primary:hover:not(:disabled) { border-color:#8cff32; box-shadow:0 0 14px rgba(110,255,50,.25); }
.st-btn.ghost { background:transparent; border-color:#2a5360; color:var(--text); }
.st-btn.ghost:hover:not(:disabled) { border-color:#8cff32; color:#8cff32; }
.st-btn.danger { background:rgba(255,71,109,.08); border-color:rgba(255,71,109,.6); color:#ff7a93; }
.st-btn.danger:hover:not(:disabled) { background:rgba(255,71,109,.16); box-shadow:0 0 14px rgba(255,71,109,.25); }
.st-btn.danger.solid { background:linear-gradient(90deg,#ff3b5c,#ff6a3b); border-color:transparent; color:#fff; }
.st-btn.danger-soft { background:rgba(255,71,109,.05); border-color:rgba(255,71,109,.35); color:#ff8aa0; }
.st-btn.danger-soft:hover:not(:disabled) { background:rgba(255,71,109,.12); }

.st-kv { margin:0; display:grid; gap:2px; }
.st-kv > div { display:flex; justify-content:space-between; gap:14px; padding:10px 2px; border-bottom:1px solid rgba(120,170,190,.14); font-size:13.5px; }
.st-kv > div:last-child { border-bottom:0; }
.st-kv dt { color:var(--muted); flex:none; }
.st-kv dd { margin:0; text-align:right; min-width:0; word-break:break-word; }

.st-form, .st-modal { display:grid; gap:12px; }
.st-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.st-form label, .st-fields label, .st-modal label, .st-reminder label { display:grid; gap:5px; font-size:12.5px; color:var(--muted); min-width:0; }
.st-input { width:100%; min-width:0; height:40px; padding:0 12px; border:1px solid #2a5360; border-radius:9px; background:#050e11; color:var(--text); font-size:14px; }
.st-input:focus { outline:2px solid #8cff32; outline-offset:1px; }
select.st-input { appearance:auto; }
.st-unit { position:relative; display:block; }
.st-unit .st-input { padding-right:44px; }
.st-unit em { position:absolute; right:12px; top:50%; transform:translateY(-50%); font-style:normal; font-size:12px; color:var(--muted); pointer-events:none; }
.st-hint { font-size:11px; color:var(--muted); }
.st-error { margin:0; padding:9px 12px; border:1px solid rgba(255,71,109,.5); border-radius:9px; background:rgba(255,71,109,.08); color:#ff8aa0; font-size:12.5px; line-height:1.5; }
.st-warn { margin:0; font-size:13.5px; line-height:1.6; color:#ffd5db; }

.st-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
.st-stats > div { display:flex; flex-direction:column; gap:3px; padding:11px 12px; border:1px solid #1f4f55; border-radius:11px; background:rgba(255,255,255,.02); min-width:0; }
.st-stats small { color:var(--muted); font-size:11px; }
.st-stats b { font:600 22px 'Kanit',sans-serif; word-break:break-word; }
.st-stats b i { font:500 11px 'Anuphan',sans-serif; font-style:normal; color:var(--green2); }
.st-stats b.hl { color:var(--green2); }
.st-stats b.status { font-size:18px; }
.st-stats b.status.ok { color:#6eff35; }
.st-stats b.status.warn { color:var(--yellow); }
.st-bmi-bar { margin:4px 0 16px; }
.st-bmi-track { position:relative; height:12px; border-radius:20px; background:linear-gradient(90deg,#18d8ff 0%,#18d8ff 17%,#6eff35 20%,#6eff35 38%,#ffe735 42%,#ffe735 50%,#ff476d 55%,#ff476d 100%); }
.st-bmi-pin { position:absolute; top:50%; width:18px; height:18px; transform:translate(-50%,-50%); border-radius:50%; background:#fff; border:3px solid #071014; box-shadow:0 0 0 2px #fff, 0 0 12px rgba(255,255,255,.6); transition:left .3s ease; }
.st-bmi-labels { display:flex; justify-content:space-between; margin-top:7px; font-size:10.5px; color:var(--muted); gap:4px; }
.st-kcal { display:flex; flex-direction:column; gap:4px; padding:14px; border:1px solid rgba(110,255,50,.3); border-radius:12px; background:linear-gradient(135deg,rgba(14,40,22,.7),rgba(4,12,12,.6)); }
.st-kcal small { color:var(--muted); font-size:12px; }
.st-kcal strong { display:flex; align-items:center; gap:8px; font:600 32px/1.1 'Kanit',sans-serif; color:var(--green2); }
.st-kcal strong svg { color:#ffb12e; flex:none; }
.st-kcal strong i { font:500 13px 'Anuphan',sans-serif; font-style:normal; color:var(--text); }
.st-kcal strong.empty { font-size:20px; color:var(--muted); }
.st-kcal span { font-size:11px; color:var(--muted); line-height:1.5; }

.st-progress-box { padding:12px; border:1px solid #1f4f55; border-radius:12px; }
.st-progress { height:10px; overflow:hidden; border-radius:20px; background:rgba(255,255,255,.08); }
.st-progress i { display:block; height:100%; border-radius:20px; background:linear-gradient(90deg,#72ed2e,#baff3e); box-shadow:0 0 12px rgba(125,255,45,.35); transition:width .3s ease; }
.st-progress-foot { display:flex; justify-content:space-between; margin-top:7px; font-size:11.5px; color:var(--muted); }
.st-progress-foot span:first-child { color:var(--green2); font-weight:600; }

.st-toggles { list-style:none; margin:0; padding:0; display:grid; }
.st-toggles li { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 2px; border-bottom:1px solid rgba(120,170,190,.14); font-size:13.5px; }
.st-toggles li:last-child { border-bottom:0; }
.st-toggle { position:relative; flex:none; width:46px; height:26px; padding:0; border:1px solid #3a4a4f; border-radius:20px; background:#1a2429; cursor:pointer; transition:.2s; }
.st-toggle i { position:absolute; left:3px; top:3px; width:18px; height:18px; border-radius:50%; background:#8a979b; transition:.2s; }
.st-toggle.on { border-color:#7cff31; background:rgba(110,255,50,.25); box-shadow:0 0 12px rgba(110,255,50,.3); }
.st-toggle.on i { left:23px; background:#9cff00; }
.st-reminder { margin-top:12px; padding-top:12px; border-top:1px dashed #1f4f55; display:grid; gap:12px; }
.st-days { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; }
.st-days button { display:flex; flex-direction:column; align-items:center; gap:3px; padding:7px 0; border:1px solid #2a5360; border-radius:9px; background:transparent; color:var(--muted); font-size:12px; cursor:pointer; transition:.2s; }
.st-days button b { font-size:13px; }
.st-days button.on { border-color:#7cff31; color:var(--green); background:rgba(110,255,50,.1); }

.st-field-label { margin-bottom:8px; font-size:12.5px; color:var(--muted); }
.st-seg { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin-bottom:8px; }
.st-seg button { min-height:38px; border:1px solid #2a5360; border-radius:9px; background:transparent; color:var(--text); font-size:13px; cursor:pointer; transition:.2s; }
.st-seg button.on { border-color:#7cff31; color:var(--green); background:rgba(110,255,50,.1); box-shadow:0 0 12px rgba(110,255,50,.18); }

.st-actions { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.st-actions li { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:12px; border:1px solid #1f4f55; border-radius:12px; }
.st-actions li > div { min-width:0; flex:1 1 160px; }
.st-actions strong { display:block; font:500 15px 'Kanit',sans-serif; }
.st-actions small { display:block; margin-top:2px; font-size:11.5px; color:var(--muted); line-height:1.5; }

.st-save { position:sticky; bottom:12px; z-index:5; width:100%; min-height:56px; display:flex; align-items:center; justify-content:center; gap:10px; border:0; border-radius:14px; background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; font:600 18px 'Kanit',sans-serif; cursor:pointer; box-shadow:0 0 22px rgba(125,255,45,.3); transition:.2s; }
.st-save:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 0 32px rgba(125,255,45,.5); }
.st-save:disabled { opacity:.65; cursor:wait; }

.st-modal-bg { position:fixed; inset:0; z-index:300; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.65); }
.st-modal { width:min(420px,100%); max-height:92vh; overflow:auto; padding:20px; border:1px solid #2a5360; border-radius:16px; background:#07131a; box-shadow:0 0 30px rgba(24,216,255,.08); }
.st-modal.danger { border-color:rgba(255,71,109,.55); box-shadow:0 0 30px rgba(255,71,109,.12); }
.st-modal h3 { margin:0; font:600 19px 'Kanit',sans-serif; color:var(--text); }

.st-toast { position:fixed; left:50%; bottom:26px; z-index:400; transform:translateX(-50%); display:flex; align-items:center; gap:10px; max-width:calc(100vw - 28px); padding:12px 20px; border:1px solid #7cff31; border-radius:12px; background:#071a10; color:#e9ffe0; font-size:14px; box-shadow:0 0 22px rgba(110,255,50,.3); animation:st-toast-in .25s ease; }
.st-toast span { width:22px; height:22px; flex:none; display:grid; place-items:center; border-radius:50%; background:#7cff31; color:#071005; font-weight:700; font-size:13px; }
.st-toast.error { border-color:#ff476d; background:#1f0a10; color:#ffd5db; box-shadow:0 0 22px rgba(255,71,109,.3); }
.st-toast.error span { background:#ff476d; color:#fff; }
@keyframes st-toast-in { from { opacity:0; transform:translate(-50%,10px); } to { opacity:1; transform:translate(-50%,0); } }

/* ปิด Neon Glow / Animation (ตั้งค่าที่หน้านี้) */
html[data-neon="off"] .fittrack-app *, html[data-neon="off"] .st-modal, html[data-neon="off"] .st-toast { box-shadow:none !important; text-shadow:none !important; }
html[data-neon="off"] .sidebar-logo { filter:none !important; }
html[data-anim="off"] *, html[data-anim="off"] *::before, html[data-anim="off"] *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; }

@media (max-width:1200px) {
  .st-layout { grid-template-columns:1fr; }
  .st-menu { position:static; }
  .st-menu-title, .st-menu-sum, .st-menu-meter { display:none; }
  .st-menu-list { display:flex; overflow-x:auto; gap:8px; padding-bottom:4px; scrollbar-width:thin; }
  .st-menu-item { flex:none; white-space:nowrap; }
}
@media (max-width:900px) {
  .st-grid { grid-template-columns:1fr; }
  .st-col { display:contents; }
  #st-profile { order:1; } #st-account { order:2; } #st-health { order:3; } .st-bmi { order:4; }
  #st-goals { order:5; } #st-notifications { order:6; } #st-display { order:7; } #st-security { order:8; }
  .st-head-ai { display:none; }
}
@media (max-width:640px) {
  .st-shell { padding:14px; }
  .st-head h1 { font-size:24px; }
  .st-head-icon { width:48px; height:48px; }
  .st-fields { grid-template-columns:1fr; }
  .st-row .st-btn { flex:1 1 auto; }
  .st-save { font-size:16px; }
  .st-toast { bottom:14px; }
}

/* โหมดสว่างของเนื้อหา */
html[data-theme="light"] .st-shell { border-color:#9fd3a8; box-shadow:0 8px 24px rgba(29,76,56,.07); }
html[data-theme="light"] .st-head h1 { color:#12201c; }
html[data-theme="light"] .st-head p,
html[data-theme="light"] .st-menu-title,
html[data-theme="light"] .st-profile-mail,
html[data-theme="light"] .st-kv dt,
html[data-theme="light"] .st-form label,
html[data-theme="light"] .st-fields label,
html[data-theme="light"] .st-modal label,
html[data-theme="light"] .st-reminder label,
html[data-theme="light"] .st-hint,
html[data-theme="light"] .st-stats small,
html[data-theme="light"] .st-bmi-labels,
html[data-theme="light"] .st-kcal small,
html[data-theme="light"] .st-kcal span,
html[data-theme="light"] .st-progress-foot,
html[data-theme="light"] .st-field-label,
html[data-theme="light"] .st-actions small,
html[data-theme="light"] .st-loading,
html[data-theme="light"] .st-unit em { color:#4a5e57; }
html[data-theme="light"] .st-head-ai { color:#33433f; }
html[data-theme="light"] .st-head-icon,
html[data-theme="light"] .st-mini { color:#2a9d16; border-color:#4fb82b; box-shadow:none; background:#f1faec; }
html[data-theme="light"] .st-card,
html[data-theme="light"] .st-stats > div,
html[data-theme="light"] .st-progress-box,
html[data-theme="light"] .st-actions li { background:#fff; border-color:#bfd8d0; box-shadow:none; }
html[data-theme="light"] .st-menu-sum { border-bottom-color:#cfe0d8; }
html[data-theme="light"] .st-menu-sum small { color:#4a5e57; }
html[data-theme="light"] .st-menu-ava { border-color:#4fb8d6; }
html[data-theme="light"] .st-menu-meter { background:linear-gradient(135deg,#f1faec,#fff); border-color:#9ccb6b; }
html[data-theme="light"] .st-menu-meter small, html[data-theme="light"] .st-menu-meter button { color:#2f8a10; }
html[data-theme="light"] .st-ring::before { background:#f6fbf2; }
html[data-theme="light"] .st-ring { background:conic-gradient(#2a9d16 calc(var(--p) * 1%), rgba(0,0,0,.09) 0); }
html[data-theme="light"] .st-col > .st-card:hover { border-color:#6cc943; box-shadow:0 6px 20px rgba(29,76,56,.10); }
html[data-theme="light"] .st-menu-item { color:#2a3a36; }
html[data-theme="light"] .st-menu-item svg { color:#40584e; }
html[data-theme="light"] .st-menu-item:hover { background:#f1faec; border-color:#9ccb6b; }
html[data-theme="light"] .st-menu-item.active { color:#12201c; background:linear-gradient(90deg,#e4f6da,#f4fbef); border-color:#6cc943; box-shadow:none; }
html[data-theme="light"] .st-menu-item.active svg { color:#2a9d16; }
html[data-theme="light"] .st-profile-since,
html[data-theme="light"] .st-stats b i,
html[data-theme="light"] .st-stats b.hl,
html[data-theme="light"] .st-progress-foot span:first-child { color:#2f8a10; }
html[data-theme="light"] .st-avatar { border-color:#4fb8d6; box-shadow:none; }
html[data-theme="light"] .st-kv > div,
html[data-theme="light"] .st-toggles li { border-bottom-color:#dde8e3; }
html[data-theme="light"] .st-input,
html[data-theme="light"] .st-modal .st-input { background:#fff; border-color:#afcbbd; color:#1a3026; }
html[data-theme="light"] .st-btn.primary { background:linear-gradient(90deg,#e3f7fc,#e7f8dc); border-color:#6cc943; color:#12201c; }
html[data-theme="light"] .st-btn.ghost { color:#2a3a36; border-color:#b8cfc8; background:#fff; }
html[data-theme="light"] .st-btn.danger { background:#fff0f3; border-color:#e5738a; color:#c0344f; }
html[data-theme="light"] .st-btn.danger.solid { color:#fff; background:linear-gradient(90deg,#e0344f,#e8663a); }
html[data-theme="light"] .st-btn.danger-soft { background:#fff6f8; border-color:#eaa3b1; color:#c0344f; }
html[data-theme="light"] .st-kcal { background:linear-gradient(135deg,#f1faec,#fff); border-color:#9ccb6b; }
html[data-theme="light"] .st-kcal strong { color:#2f8a10; }
html[data-theme="light"] .st-kcal strong i { color:#172923; }
html[data-theme="light"] .st-stats b.status.ok { color:#2f8a10; }
html[data-theme="light"] .st-stats b.status.warn { color:#b07a00; }
html[data-theme="light"] .st-bmi-pin { background:#172923; border-color:#fff; box-shadow:0 0 0 2px #172923; }
html[data-theme="light"] .st-progress { background:rgba(0,0,0,.09); }
html[data-theme="light"] .st-toggle { background:#d5dfdb; border-color:#b8cfc8; }
html[data-theme="light"] .st-toggle i { background:#fff; }
html[data-theme="light"] .st-toggle.on { background:#bfe8a6; border-color:#4fb82b; }
html[data-theme="light"] .st-toggle.on i { background:#2a9d16; }
html[data-theme="light"] .st-reminder { border-top-color:#cfe0d8; }
html[data-theme="light"] .st-days button,
html[data-theme="light"] .st-seg button { color:#2a3a36; border-color:#b8cfc8; background:#fff; }
html[data-theme="light"] .st-days button.on,
html[data-theme="light"] .st-seg button.on { color:#2f8a10; border-color:#6cc943; background:#f1faec; box-shadow:none; }
html[data-theme="light"] .st-modal { background:#fff; border-color:#bfd8d0; box-shadow:none; }
html[data-theme="light"] .st-modal.danger { border-color:#e5738a; }
html[data-theme="light"] .st-modal h3 { color:#12201c; }
html[data-theme="light"] .st-warn { color:#8a2438; }
html[data-theme="light"] .st-error { color:#b52e4b; background:#fff0f3; border-color:#e5738a; }
html[data-theme="light"] .st-toast { background:#f1faec; color:#12201c; box-shadow:0 4px 14px rgba(0,0,0,.12); }
html[data-theme="light"] .st-toast.error { background:#fff0f3; color:#8a2438; }
/* sidebar 5 เมนู: ปรับระยะตามความสูงจอ ให้ข้อความ "สุขภาพที่ดี…" และปุ่มออกจากระบบอยู่ในจอเสมอ */
.sidebar { overflow-y:auto; overflow-x:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.sidebar::-webkit-scrollbar { display:none; }
.sidebar-logo-wrap, .side-menu, .logout-link { flex-shrink:0; }
@media (min-width:761px) {
  .sidebar { padding-top:clamp(10px,2.2vh,22px); padding-bottom:clamp(8px,1.8vh,18px); }
  .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5vh,25px); }
  .sidebar-logo { height:clamp(64px,11vh,112px); }
  .side-menu { gap:clamp(3px,.9vh,9px); }
  .side-link { height:clamp(40px,7.2vh,57px); }
  .sidebar-quote { margin-bottom:clamp(4px,2vh,24px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(11px,1.7vh,15px); line-height:1.45; }
  .pulse-line { margin-top:clamp(4px,1.2vh,12px); }
  .logout-link { height:clamp(40px,6vh,54px); }
}
@supports (height:1dvh) {
  @media (min-width:761px) {
    .sidebar { padding-top:clamp(10px,2.2dvh,22px); padding-bottom:clamp(8px,1.8dvh,18px); }
    .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5dvh,25px); }
    .sidebar-logo { height:clamp(64px,11dvh,112px); }
    .side-menu { gap:clamp(3px,.9dvh,9px); }
    .side-link { height:clamp(40px,7.2dvh,57px); }
    .sidebar-quote { margin-bottom:clamp(4px,2dvh,24px); padding:clamp(4px,1dvh,12px) 14px; font-size:clamp(11px,1.7dvh,15px); line-height:1.45; }
    .pulse-line { margin-top:clamp(4px,1.2dvh,12px); }
    .logout-link { height:clamp(40px,6dvh,54px); }
  }
}
/* sidebar สมส่วน: ทุกส่วนโตตามความสูงจอ และเมนูกระจายตัวกินพื้นที่ที่เหลือ ไม่เกิดช่องว่างใหญ่ใต้เมนู */
@media (min-width:761px) {
  .sidebar-logo-wrap { padding-bottom:clamp(8px,2.6vh,28px); }
  .sidebar-logo { width:100%; height:clamp(78px,15vh,170px); transform:scale(1.18); transform-origin:center top; }
  .logo-caption { font-size:clamp(8px,1.15vh,11px); letter-spacing:2.4px; margin-top:clamp(4px,1.2vh,14px); }
  .side-menu { flex:1 0 auto; justify-content:space-evenly; gap:clamp(3px,.9vh,10px); }
  .side-link { height:clamp(44px,8vh,66px); font-size:clamp(14px,1.9vh,17px); }
  .side-icon { font-size:clamp(22px,2.9vh,28px); }
  .sidebar-quote { margin-top:clamp(6px,2vh,22px); margin-bottom:clamp(6px,2vh,22px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(14px,2.3vh,20px); line-height:1.5; text-align:center; }
  .pulse-line { margin-top:clamp(8px,1.8vh,18px); }
  .logout-link { height:clamp(44px,6.4vh,60px); font-size:clamp(14px,1.9vh,17px); }
}
/* มือถือ: แสดงปุ่มออกจากระบบเป็นไอคอนมุมขวาบนของแถบเมนู */
@media (max-width:760px) {
  .sidebar { overflow:visible; }
  .logout-link { display:flex !important; align-items:center; justify-content:center; position:absolute; top:10px; right:10px; z-index:2; width:42px; height:42px; padding:0; border:1px solid rgba(120,160,150,.45); border-radius:12px; font-size:0; }
  .logout-link span { margin:0; font-size:22px; }
}
`;