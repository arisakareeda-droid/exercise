import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const EXERCISE_LABELS = {
  squat: { name: 'Squat (ลุกนั่ง)', icon: '🏋️', calPerRep: 0.32 },
  jumping_jack: { name: 'Jumping Jack (กระโดดตบ)', icon: '⭐', calPerRep: 0.20 },
};

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
  const calPerRep = EXERCISE_LABELS[w.exercise]?.calPerRep || 0.32;
  return Number(((w.count || 0) * calPerRep).toFixed(2));
};

export default function History() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
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

  // วันที่/เวลาจริง
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearCachedName();
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
        setWorkouts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const totalReps = workouts.reduce((sum, w) => sum + (w.count || 0), 0);
  const totalCalories = workouts.reduce((sum, w) => sum + getSessionCalories(w), 0).toFixed(2);

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

  return (
    <div className="fittrack-app">
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" onClick={() => navigate('/')}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link" onClick={() => navigate('/exercises')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link active" onClick={() => navigate('/history')}><span className="side-icon">◷</span>ประวัติการออกกำลังกาย</button>
          <button className="side-link" onClick={() => navigate('/settings')}><span className="side-icon">⚙</span>ตั้งค่า</button>
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
          <section className="history-title">
            <span className="title-icon green" aria-hidden="true">◷</span>
            <div>
              <h1>ประวัติการออกกำลังกาย</h1>
              <p>ติดตามการออกกำลังกาย · สรุปจำนวนครั้ง · พลังงานที่ใช้</p>
            </div>
          </section>

          <section className="dark-card history-card">
            <div className="card-title">
              <span className="title-icon purple" aria-hidden="true">▣</span>
              <h2>
                สรุปการออกกำลังกาย
                <span className="history-card-sub">ภาพรวมกิจกรรมที่บันทึกไว้</span>
              </h2>
            </div>

            {loading ? (
              <div className="history-state">
                <span className="history-state-icon">⌛</span>
                <p>กำลังโหลดข้อมูล...</p>
              </div>
            ) : error ? (
              <div className="history-state history-error">
                <span className="history-state-icon">!</span>
                <p>{error}</p>
              </div>
            ) : workouts.length === 0 ? (
              <div className="history-state">
                <span className="history-state-icon">📭</span>
                <p>ยังไม่มีประวัติการออกกำลังกาย</p>
                <button
                  className="lime-btn history-cta"
                  type="button"
                  onClick={() => navigate('/exercises')}
                >
                  เริ่มออกกำลังกายเลย <span>›</span>
                </button>
              </div>
            ) : (
              <div className="history-summary-grid">
                <div className="history-stat green">
                  <div className="history-stat-top">
                    <span className="title-icon green" aria-hidden="true">▣</span>
                    <span>จำนวนครั้งที่ออกกำลังกาย</span>
                  </div>
                  <strong>{workouts.length}</strong>
                  <small>เซสชัน</small>
                </div>
                <div className="history-stat purple">
                  <div className="history-stat-top">
                    <span className="title-icon purple" aria-hidden="true">✦</span>
                    <span>รวมจำนวนครั้ง</span>
                  </div>
                  <strong>{totalReps}</strong>
                  <small>Reps ทั้งหมด</small>
                </div>
                <div className="history-stat yellow">
                  <div className="history-stat-top">
                    <span className="title-icon yellow" aria-hidden="true">♨</span>
                    <span>พลังงานที่ใช้</span>
                  </div>
                  <strong>{totalCalories}</strong>
                  <small>kcal</small>
                </div>
              </div>
            )}
          </section>

          {!loading && !error && workouts.length > 0 && (
            <section className="dark-card history-card">
              <div className="card-title">
                <span className="title-icon yellow" aria-hidden="true">▤</span>
                <h2>
                  รายการออกกำลังกาย
                  <span className="history-card-sub">เรียงจากรายการล่าสุด</span>
                </h2>
                <span className="history-count-pill">{workouts.length} รายการ</span>
              </div>

              <div className="history-list">
                {workouts.map((w) => {
                  const info = EXERCISE_LABELS[w.exercise] || {
                    name: w.exercise,
                    icon: '💪',
                    calPerRep: 0.32,
                  };
                  const sessionCalories = getSessionCalories(w);

                  return (
                    <article className="history-item" key={w.id}>
                      <div className="history-item-icon">{info.icon}</div>
                      <div className="history-item-info">
                        <div className="history-item-name">{info.name}</div>
                        <div className="history-item-date">
                          <span>◷</span> {formatDate(w.completedAt)}
                        </div>
                      </div>
                      <div className="history-item-stats">
                        <strong>{w.count || 0} ครั้ง</strong>
                        <span>-{sessionCalories} kcal</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="dark-card history-note">
            <span className="title-icon purple" aria-hidden="true">✧</span>
            <div className="history-note-copy">
              <h2>บันทึกเพื่อพัฒนาสุขภาพ</h2>
              <p>ตรวจสอบประวัติการออกกำลังกาย เพื่อดูความต่อเนื่องและติดตามกิจกรรมของคุณ</p>
            </div>
            <button
              className="lime-btn"
              type="button"
              onClick={() => navigate('/exercises')}
            >
              ออกกำลังกาย <span>›</span>
            </button>
          </section>
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

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
  .side-menu { display:grid;grid-template-columns:repeat(4,1fr) }
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
  .side-menu { width:100%; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
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
.history-content { width:100%; padding:26px 8px 0; display:grid; gap:18px; }

.history-title { display:flex; align-items:center; gap:14px; padding:0 4px; }
.history-title .title-icon { width:48px; height:48px; border-radius:13px; font-size:24px; flex:none; }
.history-title h1 { margin:0; font:600 28px/1.2 'Kanit',sans-serif; }
.history-title p { margin:4px 0 0; color:var(--muted); font-size:13px; }

.history-card { padding:20px 22px 22px; }
.history-card .card-title { margin-bottom:16px; }
.history-card-sub { display:block; margin-top:2px; color:var(--muted); font-size:12px; font-weight:400; }
.history-card .card-title h2 { line-height:1.25; }

.history-summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.history-stat {
  padding:16px 18px; display:flex; flex-direction:column; gap:6px;
  border:1px solid var(--line); border-radius:13px; background:rgba(255,255,255,.02);
}
.history-stat-top { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:12.5px; }
.history-stat-top .title-icon { width:30px; height:30px; font-size:16px; flex:none; }
.history-stat strong { font:600 36px/1.1 'Kanit',sans-serif; }
.history-stat.green strong { color:var(--green2); }
.history-stat.purple strong { color:#d28bff; }
.history-stat.yellow strong { color:var(--yellow); }
.history-stat small { color:var(--muted); font-size:12px; }

.history-count-pill {
  margin-left:auto; padding:4px 13px; border:1px solid var(--line); border-radius:999px;
  color:var(--muted); font-size:12px; white-space:nowrap;
}

.history-list { display:grid; gap:10px; }
.history-item {
  display:flex; align-items:center; gap:14px; padding:12px 14px;
  border:1px solid var(--line); border-radius:13px; background:rgba(255,255,255,.02);
  transition:transform .2s ease, border-color .2s ease, background .2s ease;
}
.history-item:hover { transform:translateX(3px); border-color:rgba(110,255,50,.45); }
.history-item-icon {
  width:46px; height:46px; flex:none; display:grid; place-items:center; font-size:22px;
  border-radius:12px; background:rgba(110,255,50,.09); border:1px solid rgba(110,255,50,.25);
}
.history-item-info { min-width:0; flex:1; }
.history-item-name { font:500 15px 'Kanit',sans-serif; }
.history-item-date { margin-top:3px; color:var(--muted); font-size:12px; }
.history-item-stats { display:flex; flex-direction:column; align-items:flex-end; gap:2px; text-align:right; }
.history-item-stats strong { font:600 16px 'Kanit',sans-serif; }
.history-item-stats span { color:#ff9a3d; font-size:12px; }

.history-state { display:grid; justify-items:center; gap:10px; padding:34px 10px; color:var(--muted); text-align:center; }
.history-state-icon { font-size:34px; line-height:1; }
.history-state p { margin:0; }
.history-error { color:var(--red); }
.history-cta { margin-top:6px; padding:0 22px; display:inline-flex; align-items:center; gap:8px; }

.history-note { display:flex; align-items:center; gap:16px; padding:18px 22px; }
.history-note .title-icon { width:42px; height:42px; font-size:20px; flex:none; }
.history-note-copy { min-width:0; flex:1; }
.history-note-copy h2 { margin:0; font:500 17px 'Kanit',sans-serif; }
.history-note-copy p { margin:4px 0 0; color:var(--muted); font-size:13px; }
.history-note .lime-btn { padding:0 20px; white-space:nowrap; display:inline-flex; align-items:center; gap:8px; }

@media (max-width:900px) {
  .history-summary-grid { grid-template-columns:1fr; }
  .history-note { flex-wrap:wrap; }
  .history-title h1 { font-size:23px; }
}
@media (max-width:600px) {
  .history-card { padding:16px; }
  .history-item { gap:10px; padding:10px; }
  .history-item-icon { width:40px; height:40px; font-size:19px; }
}

/* โหมดสว่างของเนื้อหา */
html[data-theme="light"] .history-stat,
html[data-theme="light"] .history-item { background:#f8fbfa; border-color:#d0ddd9; }
html[data-theme="light"] .history-item:hover { border-color:#6cc943; background:#f1faec; }
html[data-theme="light"] .history-item-icon { background:#eaf7e1; border-color:#a6d58a; }
html[data-theme="light"] .history-stat.green strong { color:#2f8a10; }
html[data-theme="light"] .history-stat.purple strong { color:#9a2fd0; }
html[data-theme="light"] .history-stat.yellow strong { color:#a07400; }
html[data-theme="light"] .history-item-stats span { color:#c4620a; }
html[data-theme="light"] .history-count-pill { border-color:#c3d2ce; }
html[data-theme="light"] .history-error { color:#b52e4b; }
`;