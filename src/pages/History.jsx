import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// ข้อมูลท่าออกกำลังกาย (id เดียวกับหน้าเลือกท่า) — calPerRep/secPerRep ใช้ประมาณค่าเมื่อเอกสารไม่ได้เก็บไว้
const EXERCISES = {
  squat: { name: 'Squat', thai: 'สควอท', muscle: 'ขา', equipment: 'ไม่มีอุปกรณ์', video: '/squats.mp4', calPerRep: 0.32, secPerRep: 4 },
  jumping_jack: { name: 'Jumping Jack', thai: 'กระโดดตบ', muscle: 'คาร์ดิโอ', equipment: 'ไม่มีอุปกรณ์', video: '/jumping_jack.mp4', calPerRep: 0.2, secPerRep: 1.5 },
  high_knees: { name: 'High Knees', thai: 'ยกเข่าสูง', muscle: 'ขา', equipment: 'ไม่มีอุปกรณ์', video: '/high_knees.mp4', calPerRep: 0.15, secPerRep: 1 },
  punches: { name: 'Punches', thai: 'ชกหมัด', muscle: 'แขน', equipment: 'ไม่มีอุปกรณ์', video: '/punches.mp4', calPerRep: 0.25, secPerRep: 1 },
};
const getExerciseInfo = (id) =>
  EXERCISES[id] || { name: id || 'ไม่ทราบท่า', thai: '', muscle: 'อื่นๆ', equipment: 'ไม่มีอุปกรณ์', video: '', calPerRep: 0.32, secPerRep: 3 };

// เป้าหมายของผู้ใช้ (เก็บในเครื่อง)
// แคชประวัติการออกกำลังกายไว้ เพื่อให้เปิดหน้าแล้วเห็นค่าล่าสุดทันที (ไม่ขึ้น 0 ก่อน)
// แล้วค่อยรีเฟรชจาก Firestore เงียบ ๆ เมื่อข้อมูลล่าสุดมาถึง
const WORKOUT_CACHE_KEY = 'fittrack-history-workouts';
const readWorkoutCache = () => {
  try {
    const raw = localStorage.getItem(WORKOUT_CACHE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw, (_k, v) => (
      v && typeof v === 'object' && typeof v.__ts === 'number'
        ? { seconds: Math.floor(v.__ts / 1000), toDate: () => new Date(v.__ts) }
        : v
    ));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};
const writeWorkoutCache = (list) => {
  try {
    localStorage.setItem(WORKOUT_CACHE_KEY, JSON.stringify(list, function replacer(key, value) {
      const original = this[key];
      return original && typeof original.toDate === 'function'
        ? { __ts: original.toDate().getTime() }
        : value;
    }));
  } catch { /* storage optional */ }
};
const clearWorkoutCache = () => {
  try { localStorage.removeItem(WORKOUT_CACHE_KEY); } catch { /* storage optional */ }
};

const GOALS_KEY = 'fittrack-history-goals';
const DEFAULT_GOALS = { weeklyBurn: 10000, daysMin: 3, daysMax: 5, minMin: 45, minMax: 60, dailyKcal: 1650 };
const loadGoals = () => {
  try { return { ...DEFAULT_GOALS, ...JSON.parse(localStorage.getItem(GOALS_KEY) || '{}') }; } catch { return DEFAULT_GOALS; }
};

const DAY_MS = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const KCAL_PER_RICE_PLATE = 600; // ข้าวมันไก่ ~600 kcal/จาน (ค่าประมาณ)
const KCAL_PER_KG = 7700;

const fmtInt = (n) => Math.round(n || 0).toLocaleString('en-US');
const fmtKcal = (n) => (n >= 100 ? fmtInt(n) : String(Math.round((n || 0) * 10) / 10));
const durationParts = (sec) => {
  if (sec < 60) return [{ v: Math.round(sec), u: 'วิ' }];
  const m = Math.round(sec / 60);
  if (m < 60) return [{ v: m, u: 'นาที' }];
  return [{ v: Math.floor(m / 60), u: 'ชม.' }, { v: m % 60, u: 'นาที' }];
};
const fmtDuration = (sec) => durationParts(sec).map((p) => `${p.v} ${p.u}`).join(' ');
const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

// แคชชื่อผู้ใช้ไว้ เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที ไม่กระพริบเป็นชื่ออื่น
const NAME_CACHE_KEY = 'fittrack-user-name';
const getCachedName = () => {
  try { return localStorage.getItem(NAME_CACHE_KEY) || ''; } catch { return ''; }
};
const setCachedName = (name) => {
  try { localStorage.setItem(NAME_CACHE_KEY, name); } catch { /* storage optional */ }
};
const clearCachedName = () => {
  try { localStorage.removeItem(NAME_CACHE_KEY); } catch { /* storage optional */ }
};
const getInitialName = () => getCachedName() || auth.currentUser?.displayName || '';

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ยอดแคลอรี่จากอาหารที่บันทึกไว้ของวันนี้ (key เดียวกับหน้า Dashboard)
const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

// พลังงานของแต่ละเซสชัน
const getSessionCalories = (w) => {
  if (w.calories !== undefined) return Number(w.calories) || 0;
  return Number(((w.count || 0) * getExerciseInfo(w.exercise).calPerRep).toFixed(2));
};

// ระยะเวลาของแต่ละเซสชัน (วินาที): ใช้ค่าที่บันทึกไว้ถ้ามี ไม่งั้นประมาณจากจำนวนครั้ง
const getSessionSeconds = (w) => {
  const d = Number(w.durationSeconds ?? w.duration ?? w.seconds);
  if (d > 0) return d;
  return Math.max(30, Math.round((w.count || 0) * getExerciseInfo(w.exercise).secPerRep));
};

/* ไอคอนเส้น (SVG) */
const ICONS = {
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  clock: 'M12 7v5l3 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM10 2h4',
  dumbbell: 'M6 8v8M3 10v4M9 6v12M15 6v12M18 8v8M21 10v4M9 12h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4',
  scale: 'M6 4h12l2 16H4zM9 9a3 3 0 0 1 6 0',
  chev: 'M9 6l6 6-6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-.5-2h-4L10 7 8 8 6 7 4 11l2 1v2l-2 1 2 4 2-1 2 1 .5 2h4L14 19l2-1 2 1 2-4-2-1z',
};
const Ico = ({ n, size = 22 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[n]} />
  </svg>
);

const StatCard = ({ icon, label, children, delta, ring, color }) => (
  <div className="hx-stat" style={{ '--c': color }}>
    <span className="hx-stat-icon"><Ico n={icon} size={30} /></span>
    <div className="hx-stat-body">
      <span className="hx-stat-label">{label}</span>
      <strong className="hx-stat-value">{children}</strong>
      <span className={`hx-delta ${delta.dir}`}>{delta.text}</span>
    </div>
    <span className="hx-ring" style={{ '--p': Math.min(100, Math.max(0, ring.pct)) }} title={ring.title}>
      <Ico n={ring.icon} size={24} />
    </span>
  </div>
);

export default function History() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState(readWorkoutCache);
  // มีแคชอยู่แล้วก็ไม่ต้องโชว์สถานะ "กำลังโหลด" — แสดงค่าล่าสุดที่มีไว้ก่อน
  const [loading, setLoading] = useState(() => readWorkoutCache().length === 0);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyFoodCalories, setDailyFoodCalories] = useState(getSavedDailyCalories);

  // ธีม: "dark" (ค่าเริ่มต้น) | "light" — ใช้ key เดียวกับ Dashboard จึงจำค่าร่วมกัน
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('fittrack-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('fittrack-theme', theme);
    } catch {
      /* ไม่เป็นไรถ้าเบราว์เซอร์บล็อก storage */
    }
  }, [theme]);

  // ออกจากหน้านี้แล้วคืนค่า ก่อนหน้าถัดไปจะตั้งธีมของตัวเอง
  useLayoutEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);

  // สลับธีมจากแท็บ/หน้าอื่น → ตามทันที
  useEffect(() => {
    const onStorage = (ev) => {
      if (ev.key === 'fittrack-theme') setTheme(ev.newValue === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ใช้ค่า Animation จากหน้าตั้งค่า (ปิดแล้วอนิเมชันในหน้านี้จะหยุด) — เหมือนหน้า Dashboard
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      const saved = JSON.parse(localStorage.getItem('fittrack_user_settings') || '{}');
      root.setAttribute('data-anim', saved?.display?.animation === false ? 'off' : 'on');
    } catch {
      root.setAttribute('data-anim', 'on');
    }
    return () => root.removeAttribute('data-anim');
  }, []);

  // Toast เด้งขึ้นมาเมื่อกดปุ่ม (เหมือนหน้า Dashboard)
  const [toast, setToast] = useState(null);
  const showToast = (text, type = 'success') => setToast({ text, type, id: Date.now() });
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // วันที่/เวลาจริง
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearCachedName();
        clearWorkoutCache();
        navigate('/login');
        return;
      }

      // ชื่อผู้ใช้สำหรับแถบด้านบน (เหมือน Dashboard)
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        const name = data.name || user.displayName || user.email?.split('@')[0] || '';
        setCachedName(name);
        setDisplayName(name);
        setUserInitial(name.charAt(0).toUpperCase());
      } catch (err) {
        console.error('โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:', err);
      }

      try {
        const q = query(
          collection(db, 'workouts'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const fresh = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setWorkouts(fresh);
        writeWorkoutCache(fresh);
      } catch (err) {
        console.error('โหลดประวัติไม่สำเร็จ:', err);
        setError('ไม่สามารถโหลดประวัติได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const dateLabel = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(currentDateTime);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    setTimeout(() => root.classList.remove('theme-anim'), 450);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      clearCachedName();
      clearWorkoutCache();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  // ---------- การแจ้งเตือน ----------
  const todayKey = getLocalDateKey(currentDateTime);
  const todayWorkouts = workouts.filter(
    (w) => w.completedAt?.toDate && getLocalDateKey(w.completedAt.toDate()) === todayKey
  );
  const todayReps = todayWorkouts.reduce((sum, w) => sum + (w.count || 0), 0);
  const todayCalories = todayWorkouts.reduce((sum, w) => sum + getSessionCalories(w), 0).toFixed(2);

  const workoutNotice = todayWorkouts.length > 0
    ? `วันนี้ออกกำลังกายแล้ว ${todayWorkouts.length} เซสชัน · ${todayReps} ครั้ง · ใช้พลังงาน ${todayCalories} kcal`
    : workouts.length > 0
      ? `วันนี้ยังไม่ได้ออกกำลังกาย · สะสมทั้งหมด ${workouts.length} เซสชัน`
      : 'ยังไม่มีประวัติการออกกำลังกาย เริ่มต้นวันนี้ได้เลย';
  const foodNotice = dailyFoodCalories === 0
    ? 'วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้'
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyFoodCalories.toLocaleString()} kcal`;

  const handleNotifications = async () => {
    setDailyFoodCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === 'default') permission = await window.Notification.requestPermission();
        if (permission === 'granted') {
          new window.Notification('FitTrack · สรุปการออกกำลังกายวันนี้', {
            body: `${workoutNotice}. ${foodNotice}`,
            tag: `fittrack-history-${todayKey}`,
          });
        }
      } catch (err) {
        console.warn('ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:', err);
      }
    }
  };

  // ---------- ข้อมูลสรุป / กราฟ / ตัวกรอง ----------
  const [chartRange, setChartRange] = useState(7);
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('month');
  const [visibleCount, setVisibleCount] = useState(6);
  const [expandedId, setExpandedId] = useState(null);
  const [hoverBar, setHoverBar] = useState(null);
  const [goals, setGoals] = useState(loadGoals);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(DEFAULT_GOALS);

  const sessions = useMemo(
    () =>
      workouts
        .filter((w) => w.completedAt?.toDate)
        .map((w) => ({
          id: w.id,
          exercise: w.exercise,
          info: getExerciseInfo(w.exercise),
          count: w.count || 0,
          date: w.completedAt.toDate(),
          kcal: getSessionCalories(w),
          sec: getSessionSeconds(w),
        }))
        .sort((x, y) => y.date - x.date),
    [workouts]
  );

  const stats = useMemo(() => {
    const today0 = startOfDay(currentDateTime);
    const tomorrow = addDays(today0, 1);
    const weekStart = addDays(today0, -6);
    const prevStart = addDays(today0, -13);
    const monthStart = new Date(currentDateTime.getFullYear(), currentDateTime.getMonth(), 1);
    const agg = (list) => ({
      n: list.length,
      kcal: list.reduce((s, x) => s + x.kcal, 0),
      sec: list.reduce((s, x) => s + x.sec, 0),
      reps: list.reduce((s, x) => s + x.count, 0),
    });
    const within = (from, to) => sessions.filter((s) => s.date >= from && s.date < to);
    const weekList = within(weekStart, tomorrow);
    return {
      today0, tomorrow, weekStart, monthStart,
      total: agg(sessions),
      week: agg(weekList),
      prev: agg(within(prevStart, weekStart)),
      month: agg(within(monthStart, tomorrow)),
      activeDays: new Set(weekList.map((s) => getLocalDateKey(s.date))).size,
    };
  }, [sessions, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = useMemo(() => {
    const { today0 } = stats;
    const fmt = (d) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    let buckets = [];
    if (chartRange === 90) {
      for (let i = 12; i >= 0; i--) {
        const end = addDays(today0, -i * 7 + 1);
        const start = addDays(end, -7);
        const sum = sessions.filter((s) => s.date >= start && s.date < end).reduce((a, s) => a + s.kcal, 0);
        buckets.push({ label: fmt(addDays(start, 1)), tip: `สัปดาห์ ${fmt(addDays(start, 1))} – ${fmt(addDays(end, -1))}`, kcal: sum });
      }
    } else {
      for (let i = chartRange - 1; i >= 0; i--) {
        const day = addDays(today0, -i);
        const next = addDays(day, 1);
        const sum = sessions.filter((s) => s.date >= day && s.date < next).reduce((a, s) => a + s.kcal, 0);
        buckets.push({ label: fmt(day), tip: fmt(day), kcal: sum });
      }
    }
    const rough = Math.max(...buckets.map((b) => b.kcal), 40) / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough);
    const top = step * 4;
    return { buckets, top, ticks: [0, 1, 2, 3, 4].map((i) => i * step), every: Math.ceil(buckets.length / 7) };
  }, [sessions, chartRange, stats]);

  const typeOptions = useMemo(() => ['all', ...Array.from(new Set(sessions.map((s) => s.info.muscle)))], [sessions]);

  const filtered = useMemo(() => {
    const from =
      periodFilter === 'week' ? stats.weekStart
      : periodFilter === 'month' ? stats.monthStart
      : periodFilter === '3m' ? addDays(stats.today0, -89)
      : null;
    return sessions.filter((s) => (typeFilter === 'all' || s.info.muscle === typeFilter) && (!from || s.date >= from));
  }, [sessions, typeFilter, periodFilter, stats]);

  const pickFilter = (setter) => (e) => { setter(e.target.value); setVisibleCount(6); setExpandedId(null); };

  const openGoals = () => { setGoalDraft(goals); setGoalOpen(true); };
  const saveGoals = (e) => {
    e.preventDefault();
    const n = (v, d) => Math.max(1, Math.round(Number(v)) || d);
    const next = {
      weeklyBurn: n(goalDraft.weeklyBurn, DEFAULT_GOALS.weeklyBurn),
      daysMin: Math.min(7, n(goalDraft.daysMin, 3)),
      daysMax: Math.min(7, n(goalDraft.daysMax, 5)),
      minMin: n(goalDraft.minMin, 45),
      minMax: n(goalDraft.minMax, 60),
      dailyKcal: n(goalDraft.dailyKcal, 1650),
    };
    if (next.daysMin > next.daysMax) [next.daysMin, next.daysMax] = [next.daysMax, next.daysMin];
    if (next.minMin > next.minMax) [next.minMin, next.minMax] = [next.minMax, next.minMin];
    setGoals(next);
    try { localStorage.setItem(GOALS_KEY, JSON.stringify(next)); } catch { /* storage optional */ }
    setGoalOpen(false);
    showToast('บันทึกเป้าหมายเรียบร้อยแล้ว');
  };

  const { total, week, prev, month } = stats;
  const delta = (cur, before) => {
    const p = pctChange(cur, before);
    if (p === null) return { dir: 'flat', text: cur > 0 ? 'เริ่มต้นสัปดาห์นี้' : 'ยังไม่มีข้อมูลสัปดาห์นี้' };
    if (p === 0) return { dir: 'flat', text: 'เท่ากับสัปดาห์ที่แล้ว' };
    return { dir: p > 0 ? 'up' : 'down', text: `${p > 0 ? '↑' : '↓'} ${Math.abs(p)}% จากสัปดาห์ที่แล้ว` };
  };
  const weeklyPct = (week.kcal / goals.weeklyBurn) * 100;
  const ricePlates = week.kcal / KCAL_PER_RICE_PLATE;
  const weightLoss = month.kcal / KCAL_PER_KG;
  const avgMinutes = month.n ? Math.round(month.sec / month.n / 60) : 0;
  const avgKcal = month.n ? Math.round(month.kcal / month.n) : 0;
  const praise =
    workouts.length === 0
      ? { title: 'เริ่มต้นกันเลย!', text: 'เลือกท่าออกกำลังกายแรกของคุณ แล้วประวัติจะแสดงที่นี่' }
      : stats.activeDays >= goals.daysMin
        ? { title: 'คุณเก่งมาก!', text: `สัปดาห์นี้ออกกำลังกายแล้ว ${stats.activeDays} วัน ถึงเป้าหมายแล้ว — รักษาความสม่ำเสมอไว้นะ` }
        : { title: 'สู้ๆ นะ!', text: `สัปดาห์นี้ออกกำลังกายแล้ว ${stats.activeDays} วัน อีก ${goals.daysMin - stats.activeDays} วันถึงเป้าหมายขั้นต่ำ` };

  return (
    <div className="fittrack-app">
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" onClick={() => navigate('/dashboard')}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link" onClick={() => navigate('/exercises')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate('/gamemode')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 15h18a9 9 0 0 1 8.7 6.7l2.2 8.6a5.2 5.2 0 0 1-8.9 4.8L31 31H17l-4 4.1a5.2 5.2 0 0 1-8.9-4.8l2.2-8.6A9 9 0 0 1 15 15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M16 21v8M12 25h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="22.5" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg></span>โหมดเกม</button>
          <button className="side-link active" onClick={() => navigate('/history')}><span className="side-icon">◷</span>ประวัติ</button>
          <button className="side-link" onClick={() => navigate('/profile')}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{userInitial}</div>
              <span className="online-dot"></span>
            </div>
            <div>
              <div className="hello">สวัสดีครับ/ค่ะ</div>
              <strong>{displayName || "\u00A0"}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="ai-note">ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ <span>〽</span></div>
            <div className="notification-wrap">
              <button className="icon-button notification-bell" title="การแจ้งเตือน" aria-label="เปิดการแจ้งเตือน" aria-expanded={notificationsOpen} onClick={handleNotifications}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><i></i></button>
              {notificationsOpen && <div className="notification-panel" role="status">
                <div className="notification-panel-title"><span>การแจ้งเตือน <small>วันนี้</small></span><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotificationsOpen(false)}>×</button></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{workoutNotice}</span><small>ดูรายการทั้งหมดได้ที่ด้านล่างของหน้านี้</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{foodNotice}</span><small>ติดตามเป้าหมายพลังงานรายวันได้ที่หน้าหลัก</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
          </div>
        </header>

        <div className="history-content">
          <section className="dark-card hx-shell">
            <header className="hx-head">
              <span className="hx-head-icon"><Ico n="doc" size={34} /></span>
              <div>
                <h1>ประวัติการออกกำลังกาย</h1>
                <p>ติดตามความก้าวหน้า และดูสถิติการออกกำลังกายของคุณ</p>
              </div>
            </header>

            {error && <div className="hx-alert" role="alert">{error}</div>}

            {/* ===== สถิติรวม ===== */}
            <div className="hx-stats">
              <StatCard
                icon="flame" color="#8cff32" label="แคลอรี่ที่เผาผลาญรวม"
                delta={delta(week.kcal, prev.kcal)}
                ring={{ pct: weeklyPct, icon: 'flame', title: `สัปดาห์นี้ ${Math.round(weeklyPct)}% ของเป้าหมาย` }}
              >{fmtInt(total.kcal)} <small>kcal</small></StatCard>
              <StatCard
                icon="clock" color="#8cff32" label="เวลาออกกำลังกายรวม"
                delta={delta(week.sec, prev.sec)}
                ring={{ pct: (week.sec / 60 / (goals.minMin * goals.daysMax)) * 100, icon: 'clock', title: 'เวลาสัปดาห์นี้เทียบกับเป้าหมาย' }}
              >{durationParts(total.sec).map((p) => (<span key={p.u}>{p.v} <small>{p.u}</small> </span>))}</StatCard>
              <StatCard
                icon="dumbbell" color="#8cff32" label="จำนวนครั้งที่ออกกำลังกาย"
                delta={delta(week.n, prev.n)}
                ring={{ pct: (stats.activeDays / goals.daysMax) * 100, icon: 'chart', title: `สัปดาห์นี้ ${stats.activeDays}/${goals.daysMax} วัน` }}
              >{total.n} <small>ครั้ง</small></StatCard>
            </div>

            {/* ===== กราฟ + แคลอรี่ที่ลดได้ ===== */}
            <div className="hx-row hx-row-main">
              <div className="hx-col-main">
              <section className="hx-card">
                <div className="hx-card-head">
                  <span className="hx-mini-icon"><Ico n="chart" size={20} /></span>
                  <h2>กราฟแคลอรี่ที่เผาผลาญ</h2>
                  <div className="hx-tabs" role="tablist">
                    {[7, 30, 90].map((r) => (
                      <button key={r} type="button" role="tab" aria-selected={chartRange === r}
                        className={chartRange === r ? 'active' : ''}
                        onClick={() => { setChartRange(r); setHoverBar(null); }}>{r} วัน</button>
                    ))}
                  </div>
                </div>
                <div className="hx-plotwrap">
                  {chart.ticks.map((tk) => (
                    <div key={tk} className="hx-grid" style={{ bottom: `${(tk / chart.top) * 100}%` }}>
                      <span>{fmtInt(tk)}</span>
                    </div>
                  ))}
                  <div className="hx-bars">
                    {chart.buckets.map((b, i) => (
                      <div key={i} className="hx-barcol" onMouseEnter={() => setHoverBar(i)} onMouseLeave={() => setHoverBar(null)}>
                        <div className="hx-bar" tabIndex={0} aria-label={`${b.tip}: ${fmtKcal(b.kcal)} kcal`}
                          onFocus={() => setHoverBar(i)} onBlur={() => setHoverBar(null)}
                          style={{ height: `${Math.max((b.kcal / chart.top) * 100, b.kcal > 0 ? 1.5 : 0)}%` }}>
                          {hoverBar === i && <em className="hx-tip">{b.tip}<br /><b>{fmtKcal(b.kcal)} kcal</b></em>}
                        </div>
                        {i % chart.every === 0 || i === chart.buckets.length - 1 ? <span className="hx-xlabel">{b.label}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </section>


              {/* ===== รายการประวัติ ===== */}
              <section className="hx-card hx-list-card">
                <div className="hx-card-head">
                  <span className="hx-mini-icon"><Ico n="cal" size={20} /></span>
                  <h2>ประวัติการออกกำลังกายล่าสุด</h2>
                  <div className="hx-filters">
                    <select value={typeFilter} onChange={pickFilter(setTypeFilter)} aria-label="กรองตามกลุ่มกล้ามเนื้อ">
                      {typeOptions.map((o) => <option key={o} value={o}>{o === 'all' ? 'ทั้งหมด' : o}</option>)}
                    </select>
                    <select value={periodFilter} onChange={pickFilter(setPeriodFilter)} aria-label="กรองตามช่วงเวลา">
                      <option value="week">สัปดาห์นี้</option>
                      <option value="month">เดือนนี้</option>
                      <option value="3m">3 เดือน</option>
                      <option value="all">ทั้งหมด</option>
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div className="hx-empty"><p>กำลังโหลดข้อมูล...</p></div>
                ) : filtered.length === 0 ? (
                  <div className="hx-empty">
                    <p>{sessions.length === 0 ? 'ยังไม่มีประวัติการออกกำลังกาย' : 'ไม่พบรายการในช่วงที่เลือก'}</p>
                    <button className="lime-btn hx-cta" type="button" onClick={() => navigate('/exercises')}>เริ่มออกกำลังกายเลย ›</button>
                  </div>
                ) : (
                  <div className="hx-list" key={`${typeFilter}-${periodFilter}`}>
                    {filtered.slice(0, visibleCount).map((s) => {
                      const open = expandedId === s.id;
                      return (
                        <div key={s.id} className={`hx-item${open ? ' open' : ''}`}>
                          <button type="button" className="hx-item-main" aria-expanded={open}
                            onClick={() => setExpandedId(open ? null : s.id)}>
                            <span className="hx-thumb">
                              {s.info.video
                                ? <video src={`${s.info.video}#t=0.6`} muted playsInline preload="metadata" />
                                : <Ico n="dumbbell" size={26} />}
                            </span>
                            <span className="hx-item-info">
                              <small>{s.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {'  '}{s.date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })} น.</small>
                              <strong>{s.info.name}</strong>
                              <em><span>{s.info.muscle}</span> • <span className="eq">{s.info.equipment}</span></em>
                            </span>
                            <span className="hx-metric"><Ico n="flame" size={22} /><span><b>{fmtKcal(s.kcal)} kcal</b><small>เผาผลาญ</small></span></span>
                            <span className="hx-metric"><Ico n="clock" size={22} /><span><b>{fmtDuration(s.sec)}</b><small>ระยะเวลา</small></span></span>
                            <span className="hx-done">เสร็จสิ้น</span>
                            <span className="hx-chev"><Ico n="chev" size={20} /></span>
                          </button>
                          {open && (
                            <div className="hx-detail">
                              <div><small>จำนวนครั้ง</small><b>{s.count} ครั้ง</b></div>
                              <div><small>พลังงานต่อครั้ง</small><b>{s.count ? (s.kcal / s.count).toFixed(2) : '-'} kcal</b></div>
                              <div><small>ท่า</small><b>{s.info.thai || s.info.name}</b></div>
                              <button type="button" className="lime-btn hx-again"
                                onClick={() => navigate(`/settings?exercise=${s.exercise}`)}>ทำท่านี้อีกครั้ง ›</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filtered.length > visibleCount && (
                      <button type="button" className="hx-more" onClick={() => setVisibleCount((c) => c + 6)}>
                        ดูเพิ่มเติม ({filtered.length - visibleCount})
                      </button>
                    )}
                  </div>
                )}
              </section>
              </div>

              {/* ===== คอลัมน์ขวา: แคลอรี่ที่ลดได้ + สถิติ + เป้าหมาย ===== */}
              <aside className="hx-side">
                <section className="hx-card hx-burn">
                  <div className="hx-card-head">
                    <span className="hx-mini-icon"><Ico n="flame" size={20} /></span>
                    <h2>แคลอรี่ที่ลดได้จากการออกกำลังกาย</h2>
                  </div>
                  <div className="hx-burn-main">
                    <div>
                      <div className="hx-burn-value">{fmtInt(week.kcal)} <small>kcal</small></div>
                      <div className="hx-burn-eq">7 วันล่าสุด · เทียบเท่าข้าวมันไก่ {ricePlates.toFixed(1)} จาน</div>
                    </div>
                    <span className="hx-ring big" style={{ '--p': Math.min(100, weeklyPct), '--c': '#8cff32' }}><Ico n="flame" size={30} /></span>
                  </div>
                  <div className="hx-progress"><i style={{ width: `${Math.min(100, weeklyPct)}%` }} /></div>
                  <div className="hx-progress-label"><span>เป้าหมายรายสัปดาห์ ({Math.round(weeklyPct)}%)</span><span>{fmtInt(goals.weeklyBurn)} kcal</span></div>
                </section>

                <section className="hx-card">
                  <div className="hx-card-head">
                    <span className="hx-mini-icon"><Ico n="chart" size={20} /></span>
                    <h2>สถิติรายเดือน</h2>
                  </div>
                  <ul className="hx-kv">
                    <li><Ico n="cal" /><span>จำนวนครั้ง</span><b>{month.n} ครั้ง</b></li>
                    <li><Ico n="clock" /><span>เวลาเฉลี่ยต่อครั้ง</span><b>{avgMinutes} นาที</b></li>
                    <li><Ico n="flame" /><span>แคลอรี่เฉลี่ยต่อครั้ง</span><b>{fmtInt(avgKcal)} kcal</b></li>
                    <li><Ico n="scale" /><span>ส่วนน้ำหนักที่ลดได้ (โดยประมาณ)</span><b>{weightLoss.toFixed(2)} กก.</b></li>
                  </ul>
                </section>

                <section className="hx-card">
                  <div className="hx-card-head">
                    <span className="hx-mini-icon"><Ico n="target" size={20} /></span>
                    <h2>เป้าหมายของคุณ</h2>
                  </div>
                  <ul className="hx-kv goals">
                    <li><Ico n="cal" /><span>ออกกำลังกาย<small>สัปดาห์นี้ทำแล้ว {stats.activeDays} วัน</small></span><b>{goals.daysMin}-{goals.daysMax} วัน/สัปดาห์</b></li>
                    <li><Ico n="clock" /><span>ระยะเวลา<small>เฉลี่ยครั้งล่าสุด {week.n ? Math.round(week.sec / week.n / 60) : 0} นาที</small></span><b>{goals.minMin}–{goals.minMax} นาที/ครั้ง</b></li>
                    <li><Ico n="flame" /><span>แคลอรี่ที่ต้องการ<small>วันนี้บันทึกอาหาร {fmtInt(dailyFoodCalories)} kcal</small></span><b>{fmtInt(goals.dailyKcal)} kcal/วัน</b></li>
                  </ul>
                  <button type="button" className="hx-goal-btn" onClick={openGoals}><Ico n="settings" size={16} /> ปรับเป้าหมาย</button>
                </section>

                <section className="hx-card hx-praise">
                  <span className="hx-trophy"><Ico n="trophy" size={34} /></span>
                  <div>
                    <h3>{praise.title}</h3>
                    <p>{praise.text}</p>
                  </div>
                </section>
              </aside>
            </div>
          </section>

          {goalOpen && (
            <div className="hx-modal-bg" role="presentation" onClick={() => setGoalOpen(false)}>
              <form className="hx-modal" role="dialog" aria-modal="true" aria-label="ปรับเป้าหมาย" onClick={(e) => e.stopPropagation()} onSubmit={saveGoals}>
                <h3>ปรับเป้าหมาย</h3>
                {[
                  ['weeklyBurn', 'เป้าเผาผลาญรายสัปดาห์ (kcal)'],
                  ['daysMin', 'ออกกำลังกายขั้นต่ำ (วัน/สัปดาห์)'],
                  ['daysMax', 'ออกกำลังกายสูงสุด (วัน/สัปดาห์)'],
                  ['minMin', 'ระยะเวลาขั้นต่ำ (นาที/ครั้ง)'],
                  ['minMax', 'ระยะเวลาสูงสุด (นาที/ครั้ง)'],
                  ['dailyKcal', 'แคลอรี่ที่ต้องการ (kcal/วัน)'],
                ].map(([k, label]) => (
                  <label key={k}>{label}
                    <input type="number" min="1" inputMode="numeric" value={goalDraft[k]}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, [k]: e.target.value }))} />
                  </label>
                ))}
                <div className="hx-modal-actions">
                  <button type="button" className="hx-ghost" onClick={() => setGoalOpen(false)}>ยกเลิก</button>
                  <button type="submit" className="lime-btn">บันทึก</button>
                </div>
              </form>
            </div>
          )}
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

      {toast && (
        <div key={toast.id} className={`ft-toast ${toast.type === 'error' ? 'error' : ''}`} role="status">
          <span>{toast.type === 'error' ? '!' : '✓'}</span>
          {toast.text}
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
button,
input { font:inherit }
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

/* ===================== HISTORY PAGE (เนื้อหาเฉพาะหน้า) ===================== */
.history-content { width:100%; padding:20px 8px 0; }
.hx-shell { padding:22px 22px 24px; display:grid; gap:16px; border-color:#2f7a52; box-shadow:inset 0 0 0 1px rgba(110,255,50,.08), 0 0 28px rgba(80,255,120,.06); }
.hx-head { display:flex; align-items:center; gap:16px; }
.hx-head-icon { width:62px; height:62px; flex:none; display:grid; place-items:center; border:2px solid #7cff31; border-radius:14px; color:#8cff32; box-shadow:0 0 16px rgba(110,255,50,.25); }
.hx-head h1 { margin:0; font:600 32px/1.2 'Kanit',sans-serif; }
.hx-head p { margin:2px 0 0; color:var(--muted); font-size:14px; }
.hx-alert { padding:10px 14px; border:1px solid var(--red); border-radius:10px; color:var(--red); font-size:13px; }

.hx-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.hx-stat { display:flex; align-items:center; gap:14px; padding:16px 16px; border:1px solid #1f6d6a; border-radius:14px; background:linear-gradient(145deg,rgba(10,30,30,.7),rgba(4,14,16,.9)); }
.hx-stat-icon { width:58px; height:58px; flex:none; display:grid; place-items:center; border-radius:50%; color:#061006; background:radial-gradient(circle at 35% 30%,#b9ff52,#4fcf22); box-shadow:0 0 18px rgba(110,255,50,.35); }
.hx-stat-body { min-width:0; flex:1; display:flex; flex-direction:column; gap:2px; }
.hx-stat-label { font-size:13px; color:#dfe8e6; }
.hx-stat-value { font:600 30px/1.15 'Kanit',sans-serif; white-space:nowrap; }
.hx-stat-value small { font:500 15px 'Kanit',sans-serif; color:var(--green2); }
.hx-delta { font-size:12px; color:var(--muted); }
.hx-delta.up { color:#8cff32; }
.hx-delta.down { color:#ff8a5c; }
.hx-ring { --c:#8cff32; --p:0; position:relative; width:64px; height:64px; flex:none; display:grid; place-items:center; border-radius:50%; color:var(--c);
  background:conic-gradient(var(--c) calc(var(--p) * 1%), rgba(255,255,255,.1) 0); transition:background .5s ease; }
.hx-ring:before { content:''; position:absolute; inset:6px; border-radius:50%; background:#07161a; }
.hx-ring svg { position:relative; }
.hx-ring.big { width:78px; height:78px; }

.hx-row { display:grid; gap:14px; align-items:start; }
.hx-row-main { grid-template-columns:minmax(0,1.9fr) minmax(0,1fr); align-items:stretch; }
.hx-col-main { display:grid; gap:14px; min-width:0; }
.hx-card { padding:16px 18px 18px; border:1px solid #1f6d6a; border-radius:14px; background:linear-gradient(145deg,rgba(6,18,22,.85),rgba(3,10,13,.95)); min-width:0; }
.hx-card-head { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.hx-card-head h2 { margin:0; font:500 18px 'Kanit',sans-serif; color:var(--text); }
.hx-mini-icon { color:#8cff32; display:grid; place-items:center; }

.hx-tabs { margin-left:auto; display:flex; gap:6px; }
.hx-tabs button { height:30px; padding:0 14px; border:1px solid #2a5360; border-radius:8px; background:transparent; color:var(--text); font-size:12px; cursor:pointer; }
.hx-tabs button:hover { border-color:#6bd3ff; }
.hx-tabs button.active { background:linear-gradient(90deg,#72ed2e,#baff3e); border-color:transparent; color:#071005; font-weight:700; }

.hx-plotwrap { position:relative; height:190px; margin:8px 0 34px 40px; border-left:0; }
.hx-grid { position:absolute; left:0; right:0; border-top:1px solid rgba(120,170,190,.18); }
.hx-grid span { position:absolute; left:-40px; width:34px; text-align:right; top:0; transform:translateY(-50%); font-size:11px; color:var(--muted); }
.hx-bars { position:absolute; inset:0; display:flex; align-items:flex-end; justify-content:space-around; gap:4px; padding:0 4px; }
.hx-barcol { position:relative; flex:1; max-width:46px; height:100%; display:flex; align-items:flex-end; justify-content:center; }
.hx-bar { position:relative; width:62%; min-width:4px; border-radius:5px 5px 0 0; outline:none;
  background:linear-gradient(180deg,#9cff4a 0%,#2fd6a0 55%,#4a5cff 100%); box-shadow:0 0 12px rgba(80,255,150,.25);
  transform-origin:bottom; animation:hx-grow .6s ease both; transition:filter .15s ease; }
.hx-barcol:hover .hx-bar, .hx-bar:focus-visible { filter:brightness(1.25); }
@keyframes hx-grow { from { transform:scaleY(0); } to { transform:scaleY(1); } }
.hx-xlabel { position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap; font-size:11px; color:#dfe8e6; }
.hx-tip { position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%); z-index:5; padding:6px 10px; border:1px solid #2a5360; border-radius:8px; background:#07161a; color:#fff; font-style:normal; font-size:11px; line-height:1.4; text-align:center; white-space:nowrap; pointer-events:none; }
.hx-tip b { color:#b7ff21; }

.hx-burn { background:linear-gradient(145deg,rgba(8,26,22,.9),rgba(3,10,13,.95)); border-color:#3a8f3a; }
.hx-burn-main { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:6px 0 18px; }
.hx-burn-value { font:600 46px/1.1 'Kanit',sans-serif; }
.hx-burn-value small { font-size:22px; color:var(--green2); }
.hx-burn-eq { margin-top:6px; color:var(--muted); font-size:12.5px; }
.hx-progress { height:14px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
.hx-progress i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#4ee02a,#c6ff38); box-shadow:0 0 12px rgba(140,255,50,.5); transition:width .6s ease; }
.hx-progress-label { display:flex; justify-content:space-between; gap:8px; margin-top:10px; font-size:12.5px; color:#dfe8e6; }

.hx-filters { margin-left:auto; display:flex; gap:8px; }
.hx-filters select { height:34px; min-width:96px; padding:0 10px; border:1px solid #2a5360; border-radius:8px; background:#050e11; color:var(--text); font-size:13px; cursor:pointer; }
.hx-list { display:grid; gap:8px; }
.hx-item { border:1px solid #1f4f55; border-radius:12px; background:rgba(255,255,255,.015); transition:border-color .2s ease; }
.hx-item:hover, .hx-item.open { border-color:rgba(110,255,50,.5); }
.hx-item-main { width:100%; display:grid; grid-template-columns:72px minmax(120px,1.4fr) minmax(110px,1fr) minmax(110px,1fr) 78px 18px; align-items:center; gap:14px; padding:8px 12px 8px 8px; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.hx-thumb { width:72px; height:56px; border-radius:8px; overflow:hidden; display:grid; place-items:center; background:linear-gradient(135deg,#1c3a4a,#0b1a22); color:#7fa8b8; }
.hx-thumb video { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
.hx-item-info { display:flex; flex-direction:column; gap:1px; min-width:0; }
.hx-item-info small { font-size:11px; color:var(--muted); }
.hx-item-info strong { font:600 15px 'Kanit',sans-serif; }
.hx-item-info em { font-style:normal; font-size:11.5px; color:#78d6ff; }
.hx-item-info em .eq { color:#9fb4b8; }
.hx-metric { display:flex; align-items:center; gap:8px; color:#c6ff38; }
.hx-metric span { display:flex; flex-direction:column; }
.hx-metric b { font:600 14px 'Kanit',sans-serif; color:var(--text); white-space:nowrap; }
.hx-metric small { font-size:10.5px; color:var(--muted); }
.hx-metric svg:first-child { flex:none; }
.hx-done { justify-self:center; padding:4px 12px; border-radius:7px; background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; font-size:11px; font-weight:700; }
.hx-chev { color:#dfe8e6; transition:transform .2s ease; }
.hx-item.open .hx-chev { transform:rotate(90deg); }
.hx-detail { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) auto; gap:12px; align-items:center; padding:10px 16px 14px; border-top:1px dashed #1f4f55; }
.hx-detail div { display:flex; flex-direction:column; }
.hx-detail small { font-size:11px; color:var(--muted); }
.hx-detail b { font:500 14px 'Kanit',sans-serif; }
.hx-again { padding:0 16px; height:34px; font-size:12px; }
.hx-more { height:38px; border:1px dashed #2a5360; border-radius:10px; background:transparent; color:var(--text); cursor:pointer; font-size:13px; }
.hx-more:hover { border-color:#8cff32; color:#8cff32; }
.hx-empty { display:grid; justify-items:center; gap:10px; padding:34px 10px; color:var(--muted); text-align:center; }
.hx-empty p { margin:0; }
.hx-cta { padding:0 22px; }

.hx-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
.hx-side > .hx-card { flex:none; }
/* การ์ดสุดท้าย (คุณเก่งมาก) ยืดลงมาจนสุดแนวเดียวกับคอลัมน์ซ้าย ไม่เหลือช่องว่าง */
.hx-side > .hx-praise { flex:1 1 auto; }
.hx-kv { list-style:none; margin:0; padding:0; display:grid; gap:2px; }
.hx-kv li { display:flex; align-items:center; gap:10px; padding:9px 2px; border-bottom:1px solid rgba(120,170,190,.14); font-size:13px; }
.hx-kv li:last-child { border-bottom:0; }
.hx-kv li > svg { flex:none; color:#c6ff38; }
.hx-kv li > span { flex:1; min-width:0; }
.hx-kv li > span small { display:block; font-size:10.5px; color:var(--muted); }
.hx-kv li > b { font:600 13.5px 'Kanit',sans-serif; color:var(--green2); white-space:nowrap; }
.hx-goal-btn { width:100%; margin-top:10px; height:36px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid #2a5360; border-radius:9px; background:transparent; color:var(--text); font-size:13px; cursor:pointer; }
.hx-goal-btn:hover { border-color:#8cff32; color:#8cff32; }
.hx-praise { display:flex; align-items:center; gap:14px; border-color:#4fa83a; background:linear-gradient(135deg,rgba(14,40,22,.9),rgba(4,12,12,.95)); }
.hx-trophy { color:#c6ff38; flex:none; filter:drop-shadow(0 0 8px rgba(160,255,50,.5)); }
.hx-praise h3 { margin:0 0 4px; font:600 18px 'Kanit',sans-serif; color:#c6ff38 !important; }
.hx-praise p { margin:0; font-size:12.5px; line-height:1.55; color:#dfe8e6; }

.hx-modal-bg { position:fixed; inset:0; z-index:200; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.6); }
.hx-modal { width:min(400px,100%); max-height:92vh; overflow:auto; display:grid; gap:12px; padding:20px; border:1px solid #2a5360; border-radius:16px; background:#07131a; }
.hx-modal h3 { margin:0 0 2px; font:600 19px 'Kanit',sans-serif; }
.hx-modal label { display:grid; gap:5px; font-size:12.5px; color:var(--muted); }
.hx-modal input { height:38px; padding:0 12px; border:1px solid #2a5360; border-radius:8px; background:#050e11; color:var(--text); font-size:14px; }
.hx-modal input:focus { outline:2px solid #8cff32; outline-offset:1px; }
.hx-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:4px; }
.hx-modal-actions .lime-btn { padding:0 24px; }
.hx-ghost { height:37px; padding:0 18px; border:1px solid #2a5360; border-radius:8px; background:transparent; color:var(--text); cursor:pointer; }

@media (max-width:1200px) {
  .hx-row-main { grid-template-columns:1fr; }
  .hx-item-main { grid-template-columns:72px minmax(110px,1.3fr) minmax(100px,1fr) minmax(100px,1fr) 18px; }
  .hx-done { display:none; }
}
@media (max-width:900px) {
  .hx-stats { grid-template-columns:1fr; }
}
@media (max-width:640px) {
  .hx-shell { padding:14px; }
  .hx-head h1 { font-size:23px; }
  .hx-head-icon { width:48px; height:48px; }
  .hx-item-main { grid-template-columns:60px 1fr 18px; row-gap:8px; }
  .hx-thumb { width:60px; height:48px; }
  .hx-metric { grid-column:2; }
  .hx-chev { grid-row:1; grid-column:3; }
  .hx-detail { grid-template-columns:1fr 1fr; }
  .hx-filters { margin-left:0; width:100%; }
  .hx-filters select { flex:1; }
  .hx-tabs { margin-left:0; }
  .hx-burn-value { font-size:36px; }
}
@media (prefers-reduced-motion:reduce) { .hx-bar { animation:none; } }

/* โหมดสว่างของเนื้อหา */
html[data-theme="light"] .hx-shell { border-color:#9fd3a8; box-shadow:0 8px 24px rgba(29,76,56,.07); }
html[data-theme="light"] .hx-head h1 { color:#12201c; }
html[data-theme="light"] .hx-head-icon { color:#2a9d16; border-color:#4fb82b; box-shadow:none; }
html[data-theme="light"] .hx-stat,
html[data-theme="light"] .hx-card { background:#fff; border-color:#bfd8d0; }
html[data-theme="light"] .hx-burn,
html[data-theme="light"] .hx-praise { background:linear-gradient(135deg,#f1faec,#fff); border-color:#9ccb6b; }
html[data-theme="light"] .hx-stat-label,
html[data-theme="light"] .hx-xlabel,
html[data-theme="light"] .hx-progress-label,
html[data-theme="light"] .hx-praise p { color:#33433f; }
html[data-theme="light"] .hx-stat-value small,
html[data-theme="light"] .hx-burn-value small,
html[data-theme="light"] .hx-kv li > b { color:#2f8a10; }
html[data-theme="light"] .hx-delta.up { color:#2f8a10; }
html[data-theme="light"] .hx-delta.down { color:#c4620a; }
html[data-theme="light"] .hx-ring:before { background:#fff; }
html[data-theme="light"] .hx-ring { background:conic-gradient(var(--c) calc(var(--p) * 1%), rgba(0,0,0,.09) 0); color:#2a9d16; }
html[data-theme="light"] .hx-stat-icon { color:#fff; background:radial-gradient(circle at 35% 30%,#7ee04a,#2a9d16); box-shadow:none; }
html[data-theme="light"] .hx-mini-icon,
html[data-theme="light"] .hx-metric,
html[data-theme="light"] .hx-kv li > svg { color:#2a9d16; }
html[data-theme="light"] .hx-grid { border-top-color:rgba(60,100,90,.18); }
html[data-theme="light"] .hx-tabs button,
html[data-theme="light"] .hx-goal-btn,
html[data-theme="light"] .hx-ghost,
html[data-theme="light"] .hx-more { border-color:#b8cfc8; color:#2a3a36; background:#fff; }
html[data-theme="light"] .hx-filters select,
html[data-theme="light"] .hx-modal input { background:#fff; border-color:#afcbbd; color:#1a3026; }
html[data-theme="light"] .hx-item { background:#f8fbfa; border-color:#d0ddd9; }
html[data-theme="light"] .hx-item:hover,
html[data-theme="light"] .hx-item.open { border-color:#6cc943; background:#f1faec; }
html[data-theme="light"] .hx-detail { border-top-color:#cfe0d8; }
html[data-theme="light"] .hx-item-info em { color:#1f7aa6; }
html[data-theme="light"] .hx-metric b { color:#172923; }
html[data-theme="light"] .hx-chev { color:#40584e; }
html[data-theme="light"] .hx-kv li { border-bottom-color:#dde8e3; }
html[data-theme="light"] .hx-praise h3,
html[data-theme="light"] .hx-trophy { color:#2f8a10 !important; filter:none; }
html[data-theme="light"] .hx-tip { background:#fff; color:#172923; border-color:#bfd8d0; box-shadow:0 4px 14px rgba(0,0,0,.12); }
html[data-theme="light"] .hx-tip b { color:#2f8a10; }
html[data-theme="light"] .hx-modal { background:#fff; border-color:#bfd8d0; }
html[data-theme="light"] .hx-alert { color:#b52e4b; border-color:#b52e4b; }
/* โหมดสว่าง: แอนิเมชันเรืองแสงของโลโก้ต้องคงการกลับสี (invert) ไว้ ไม่งั้น filter ของ animation จะทับ
   จนตัวอักษรสีขาวของโลโก้หายไปบนพื้นขาว */
@keyframes fittrack-logo-glow-light {
  0%, 100% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 2px rgba(60,170,40,.10)); }
  50% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 5px rgba(60,170,40,.28)); }
}
html[data-theme="light"] .sidebar-logo {
  filter: invert(1) hue-rotate(180deg);
  mix-blend-mode: multiply;
  animation-name: fittrack-logo-glow-light !important;
}

/* ===================== MOTION (เหมือนหน้า Dashboard) ===================== */
@keyframes ft-rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
@keyframes ft-pop { 0% { opacity:0; transform:scale(.85); } 60% { transform:scale(1.06); } 100% { opacity:1; transform:none; } }
@keyframes ft-slide { from { opacity:0; transform:translateX(-14px); } to { opacity:1; transform:none; } }
@keyframes ft-grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }

/* ส่วนหลักไหลขึ้นทีละใบ (ใช้ backwards เพื่อไม่ให้ทับ transform ตอน hover) */
.hx-shell { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) backwards; }
.hx-head { animation:ft-rise .5s cubic-bezier(.2,.8,.2,1) .05s backwards; }
.hx-stats > .hx-stat:nth-child(1) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .1s backwards; }
.hx-stats > .hx-stat:nth-child(2) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .18s backwards; }
.hx-stats > .hx-stat:nth-child(3) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .26s backwards; }
.hx-col-main > .hx-card:nth-child(1) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .3s backwards; }
.hx-col-main > .hx-card:nth-child(2) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .38s backwards; }
.hx-side > .hx-card:nth-child(1) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .34s backwards; }
.hx-side > .hx-card:nth-child(2) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .42s backwards; }
.hx-side > .hx-card:nth-child(3) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .5s backwards; }
.hx-side > .hx-card:nth-child(4) { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .58s backwards; }
.hx-alert { animation:ft-rise .4s ease backwards; }

/* ชี้แล้วเรืองแสง/ยกขึ้นเล็กน้อย */
.hx-card, .hx-stat { transition:border-color .25s ease, box-shadow .25s ease, transform .25s ease; }
.hx-card:hover, .hx-stat:hover { border-color:#2f7a52; box-shadow:0 8px 28px rgba(80,255,120,.10); transform:translateY(-2px); }
.hx-head-icon { transition:box-shadow .3s ease, transform .2s ease; }
.hx-head-icon:hover { box-shadow:0 0 26px rgba(110,255,50,.4); transform:translateY(-2px); }

/* ตัวเลข / วงแหวน / แถบความคืบหน้า */
.hx-stat-value, .hx-burn-value { animation:ft-pop .45s cubic-bezier(.2,.8,.2,1) .2s backwards; }
.hx-progress i { transform-origin:left center; animation:ft-grow .9s cubic-bezier(.2,.8,.2,1) .5s backwards; }
.hx-kv li { animation:ft-slide .4s cubic-bezier(.2,.8,.2,1) backwards; transition:background .2s ease, transform .2s ease; }
.hx-kv li:nth-child(2) { animation-delay:.06s; }
.hx-kv li:nth-child(3) { animation-delay:.12s; }
.hx-kv li:nth-child(4) { animation-delay:.18s; }
.hx-trophy { animation:ft-pop .6s cubic-bezier(.2,.8,.2,1) .7s backwards; }

/* ปุ่มกดแล้วยุบเล็กน้อย */
.hx-tabs button { transition:background .2s ease, border-color .2s ease, transform .15s ease; }
.hx-tabs button:active { transform:scale(.96); }
.hx-goal-btn, .hx-more, .hx-cta, .hx-ghost, .hx-modal-actions .lime-btn { transition:transform .15s ease, box-shadow .2s ease, border-color .2s ease, color .2s ease; }
.hx-goal-btn:active, .hx-more:active, .hx-cta:active, .hx-ghost:active, .hx-modal-actions .lime-btn:active { transform:scale(.96); }
.hx-cta:hover, .hx-modal-actions .lime-btn:hover { box-shadow:0 0 18px rgba(125,255,45,.4); }

/* รายการประวัติ: แถวเลื่อนเข้าทีละแถวเมื่อเปลี่ยนตัวกรอง */
.hx-item { animation:ft-slide .4s cubic-bezier(.2,.8,.2,1) backwards; transition:border-color .2s ease, background .2s ease, transform .2s ease; }
.hx-item:nth-child(2) { animation-delay:.06s; }
.hx-item:nth-child(3) { animation-delay:.12s; }
.hx-item:nth-child(4) { animation-delay:.18s; }
.hx-item:nth-child(5) { animation-delay:.24s; }
.hx-item:nth-child(6) { animation-delay:.3s; }
.hx-item:nth-child(n+7) { animation-delay:.36s; }
.hx-item:hover { transform:translateX(3px); }
.hx-detail { animation:ft-rise .3s ease backwards; }
.hx-chev { transition:transform .25s ease; }
.hx-empty { animation:ft-rise .45s ease backwards; }

/* Modal เด้งขึ้นมา */
.hx-modal-bg { animation:ft-fade .2s ease backwards; }
.hx-modal { animation:ft-pop .35s cubic-bezier(.2,.8,.2,1) backwards; }
@keyframes ft-fade { from { opacity:0; } to { opacity:1; } }

html[data-theme="light"] .hx-card:hover, html[data-theme="light"] .hx-stat:hover { border-color:#6cc943; box-shadow:0 8px 22px rgba(29,76,56,.10); }

/* ปิดอนิเมชันตามค่าที่ตั้งไว้ หรือตามระบบ */
html[data-anim="off"] .hx-shell, html[data-anim="off"] .hx-head, html[data-anim="off"] .hx-stat, html[data-anim="off"] .hx-card,
html[data-anim="off"] .hx-alert, html[data-anim="off"] .hx-stat-value, html[data-anim="off"] .hx-burn-value, html[data-anim="off"] .hx-progress i,
html[data-anim="off"] .hx-kv li, html[data-anim="off"] .hx-trophy, html[data-anim="off"] .hx-item, html[data-anim="off"] .hx-detail,
html[data-anim="off"] .hx-empty, html[data-anim="off"] .hx-modal-bg, html[data-anim="off"] .hx-modal, html[data-anim="off"] .hx-bar { animation:none !important; }
html[data-anim="off"] .hx-card:hover, html[data-anim="off"] .hx-stat:hover, html[data-anim="off"] .hx-item:hover, html[data-anim="off"] .hx-head-icon:hover { transform:none; }
@media (prefers-reduced-motion: reduce) {
  .hx-shell, .hx-head, .hx-stat, .hx-card, .hx-alert, .hx-stat-value, .hx-burn-value, .hx-progress i, .hx-kv li, .hx-trophy,
  .hx-item, .hx-detail, .hx-empty, .hx-modal-bg, .hx-modal { animation:none !important; }
  .hx-card:hover, .hx-stat:hover, .hx-item:hover, .hx-head-icon:hover { transform:none; }
}

/* ===== Toast เด้งขึ้นมาเมื่อกดปุ่ม (เหมือนหน้า Dashboard) ===== */
.ft-toast { position:fixed; left:50%; bottom:26px; z-index:400; transform:translateX(-50%); display:flex; align-items:center; gap:10px; max-width:calc(100vw - 28px); padding:12px 20px; border:1px solid #7cff31; border-radius:12px; background:#071a10; color:#e9ffe0; font-size:14px; box-shadow:0 0 22px rgba(110,255,50,.3); animation:ft-toast-in .5s cubic-bezier(.2,.8,.2,1) both; }
.ft-toast span { width:22px; height:22px; flex:none; display:grid; place-items:center; border-radius:50%; background:#7cff31; color:#071005; font-weight:700; font-size:13px; }
.ft-toast.error { border-color:#ff476d; background:#1f0a10; color:#ffd5db; box-shadow:0 0 22px rgba(255,71,109,.3); }
.ft-toast.error span { background:#ff476d; color:#fff; }
@keyframes ft-toast-in { 0% { opacity:0; transform:translate(-50%,28px) scale(.9); } 60% { opacity:1; transform:translate(-50%,-8px) scale(1.04); } 100% { opacity:1; transform:translate(-50%,0) scale(1); } }
html[data-theme="light"] .ft-toast { background:#f1faec; color:#12201c; box-shadow:0 4px 14px rgba(0,0,0,.12); }
html[data-theme="light"] .ft-toast.error { background:#fff0f3; color:#8a2438; }
html[data-anim="off"] .ft-toast { animation:none !important; }
@media (prefers-reduced-motion: reduce) { .ft-toast { animation:none !important; } }
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