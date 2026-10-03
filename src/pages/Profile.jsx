import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// แคชชื่อผู้ใช้ไว้ เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที ไม่กระพริบเป็นชื่ออื่น (key เดียวกับทุกหน้า)
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

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  // ชื่อบนแถบด้านบน (เหมือน Dashboard) — เปลี่ยนเมื่อโหลดหรือบันทึกสำเร็จเท่านั้น ไม่เปลี่ยนตามที่กำลังพิมพ์
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());

  const applyHeaderName = (value) => {
    setCachedName(value);
    setDisplayName(value);
    setUserInitial(value.charAt(0).toUpperCase());
  };

  // ---------- วันที่/เวลาจริง ----------
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(currentDateTime);

  // ---------- ธีมมืด/สว่าง (key เดียวกับ Dashboard จึงจำค่าร่วมกัน) ----------
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

  // คืนค่าธีมตอนออกจากหน้า เพื่อไม่ให้กระทบหน้าอื่น
  useLayoutEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    setTimeout(() => root.classList.remove('theme-anim'), 450);
  };

  // ---------- โหลดข้อมูลผู้ใช้ ----------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        clearCachedName();
        navigate('/login');
        return;
      }

      setUser(currentUser);
      setEmail(currentUser.email || '');

      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        if (snap.exists()) {
          setName(data.name || '');
          setCreatedAt(data.createdAt);
        }
        applyHeaderName(data.name || currentUser.displayName || currentUser.email?.split('@')[0] || '');
      } catch (err) {
        console.error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      setMessageType('error');
      setMessage('กรุณากรอกชื่อ');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const trimmed = name.trim();
      await updateDoc(doc(db, 'users', user.uid), { name: trimmed });
      setName(trimmed);
      applyHeaderName(trimmed);
      setEditing(false);
      setMessageType('success');
      setMessage('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (err) {
      console.error('บันทึกข้อมูลไม่สำเร็จ:', err);
      setMessageType('error');
      setMessage('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
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
    return timestamp.toDate().toLocaleDateString('th-TH', { dateStyle: 'long' });
  };

  // ---------- การแจ้งเตือน ----------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyCalories, setDailyCalories] = useState(getSavedDailyCalories);

  const calorieNotice = dailyCalories === 0
    ? 'วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้'
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyCalories.toLocaleString()} kcal`;
  const accountNotice = email ? `บัญชีที่ใช้งานอยู่: ${email}` : 'กำลังโหลดข้อมูลบัญชี';

  const handleNotifications = async () => {
    setDailyCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === 'default') permission = await window.Notification.requestPermission();
        if (permission === 'granted') {
          new window.Notification('FitTrack · โปรไฟล์ของฉัน', {
            body: `${calorieNotice}. ${accountNotice}`,
            tag: `fittrack-profile-${getLocalDateKey(currentDateTime)}`,
          });
        }
      } catch (error) {
        console.warn('ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:', error);
      }
    }
  };

  return (
    <div className="fittrack-app">
      {/* ---------- SIDEBAR ---------- */}
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" type="button" onClick={() => navigate('/dashboard')}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link" type="button" onClick={() => navigate('/exercises')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate('/history')}><span className="side-icon">◷</span>ประวัติการออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate('/settings')}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" type="button" onClick={handleLogout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{userInitial}</div>
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
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{calorieNotice}</span><small>พลังงานที่บันทึก {dailyCalories.toLocaleString()} kcal</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{accountNotice}</span><small>แก้ไขชื่อที่แสดงได้ในหน้านี้</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun"
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
          </div>
        </header>

        <section className="pf-title">
          <div className="pf-title-icon" aria-hidden="true">☺</div>
          <div>
            <h1>โปรไฟล์ของฉัน</h1>
            <p>ดูและแก้ไขข้อมูลบัญชีของคุณ</p>
          </div>
          <button type="button" className="pf-back" onClick={() => navigate('/dashboard')}>← กลับหน้าหลัก</button>
        </section>

        <div className="pf-wrap">
          <section className="pf-card">
            {loading ? (
              <p className="pf-loading">กำลังโหลดข้อมูล...</p>
            ) : (
              <>
                <div className="pf-avatar">{(name || email || '?').charAt(0).toUpperCase()}</div>

                <div className="pf-field">
                  <label className="pf-label" htmlFor="pf-name">ชื่อ</label>
                  {editing ? (
                    <input
                      id="pf-name"
                      className="pf-input"
                      value={name}
                      autoFocus
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !saving) handleSave(); }}
                    />
                  ) : (
                    <p className="pf-value">{name || '-'}</p>
                  )}
                </div>

                <div className="pf-field">
                  <span className="pf-label">อีเมล</span>
                  <p className="pf-value">{email}</p>
                </div>

                <div className="pf-field">
                  <span className="pf-label">สมัครสมาชิกเมื่อ</span>
                  <p className="pf-value">{formatDate(createdAt)}</p>
                </div>

                {message && <p className={`pf-message${messageType === 'error' ? ' error' : ''}`}>{message}</p>}

                <div className="pf-row">
                  {editing ? (
                    <>
                      <button type="button" className="pf-btn secondary" onClick={() => { setEditing(false); setMessage(''); }} disabled={saving}>
                        ยกเลิก
                      </button>
                      <button type="button" className="pf-btn primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="pf-btn primary" onClick={() => { setEditing(true); setMessage(''); }}>
                      แก้ไขชื่อ
                    </button>
                  )}
                </div>

                <button type="button" className="pf-btn danger" onClick={handleLogout}>ออกจากระบบ</button>
              </>
            )}
          </section>
        </div>

        <footer className="pf-footer">Small Steps · Big Changes · FITTRACK</footer>
      </main>

      <style>{`
@import url("https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap");
.fittrack-app h1, .fittrack-app h2, .fittrack-app h3{color:var(--text)}
.fittrack-app img{color:var(--muted)}
:root{--bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735}
*{box-sizing:border-box}
html, body, #root{margin:0;min-height:100%;background:var(--bg)}
body{font-family:"Anuphan",sans-serif;color:var(--text);overflow-x:hidden}
button, input{font:inherit}
.fittrack-app{min-height:100vh;background:radial-gradient(circle at 75% 8%,rgba(50,255,100,.06),transparent 22%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.045),transparent 22%),#020609}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column}
.sidebar:after{display:none}
.sidebar-logo-wrap{text-align:center;padding:4px 4px 25px}
.sidebar-logo{display:block;width:190px;height:112px;object-fit:contain;margin:0 auto}
.logo-caption{font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px}
.side-menu{display:flex;flex-direction:column;gap:9px}
.side-link{height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s}
.side-link:hover{border-color:#35534a;background:rgba(103,255,41,.05)}
.side-link.active{color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05)}
.side-icon{width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef}
.side-link.active .side-icon{color:var(--green)}
.sidebar-quote{margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:"Kanit";font-size:15px;line-height:1.55;font-style:italic}
.pulse-line{margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39}
.pulse-line:before{content:"";position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33}
.pulse-line i:first-child{position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg)}
.pulse-line b{position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg)}
.pulse-line i:last-child{position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff}
.logout-link{height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px}
.logout-link span{font-size:24px;margin-right:12px;color:#dce6e6}
.main-area{margin-left:220px;min-height:100vh;padding:0 10px 40px;width:calc(100% - 220px)}
.topbar{height:100px;border-bottom:1px solid #18343b;display:flex;align-items:center;justify-content:space-between;padding:0 5px 0 18px}
.user-block{display:flex;align-items:center;gap:12px}
.avatar-wrap{position:relative;width:58px;height:58px}
.avatar-fallback{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-weight:700;font-size:20px;box-shadow:0 0 0 3px rgba(255,255,255,.03)}
.online-dot{position:absolute;right:0;bottom:0;width:17px;height:17px;border-radius:50%;background:#6eff35;border:2px solid #06100c}
.hello{font-size:13px;color:#ddd;line-height:1.1}
.user-block strong{font-family:"Kanit";font-size:22px;line-height:1.15}
.topbar-right{display:flex;align-items:center;gap:15px}
.ai-note{text-align:right;font-size:12px;line-height:1.35;color:#e4e4e4;font-style:italic}
.ai-note em{color:var(--green);font-style:normal;font-weight:700}
.ai-note span{color:#a24aff;font-size:20px}
.icon-button{position:relative;width:42px;height:42px;background:transparent;border:0;color:#f2f2f2;font-size:25px;cursor:pointer}
.icon-button i{position:absolute;right:6px;top:6px;width:7px;height:7px;background:#ff4667;border-radius:50%}
.icon-button.sun{font-size:28px}
.date-box{border-right:1px solid #30434a;padding:3px 15px;color:#ddd;font-size:11px;line-height:1.4}
.date-box small{font-size:10px}
@media(max-width:1100px){
.sidebar{width:190px}
.main-area{margin-left:190px;width:calc(100% - 190px)}
}
@media(max-width:760px){
.sidebar{position:relative;width:100%;height:auto;min-height:auto;padding:10px}
.sidebar:after{display:none}
.sidebar-logo{width:155px;height:88px}
.side-menu{display:grid;grid-template-columns:repeat(4,1fr)}
.side-link{height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px}
.side-icon{font-size:18px}
.sidebar-quote, .logout-link{display:none}
.main-area{margin-left:0;width:100%;padding:0 10px 25px}
.topbar{height:auto;padding:13px 2px;gap:10px}
.topbar-right{gap:5px}
.ai-note, .date-box{display:none}
}
.sidebar{border-right:1px solid #18343b !important;}
.main-area{border-right:0 !important;
  outline-right:0 !important;}
.main-area{width:calc(100% - 220px) !important;
  padding-right:0 !important;}
html, body{width:100% !important;
  max-width:none !important;
  margin:0 !important;}
#root{width:100% !important;
  max-width:none !important;
  margin:0 !important;
  padding:0 !important;
  border:0 !important;
  border-inline:0 !important;
  box-shadow:none !important;}
.fittrack-app{width:100%;}
html.theme-anim *{transition:background-color .3s ease,border-color .3s ease,color .3s ease !important;}
html[data-theme="light"]{color-scheme:light;
  --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;
  --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a;}
html[data-theme="light"] .fittrack-app{background:radial-gradient(circle at 75% 8%,rgba(60,200,100,.14),transparent 24%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.08),transparent 24%),#edf3f1;}
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important}
html[data-theme="light"] .sidebar-logo{filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply}
html[data-theme="light"] .side-link{color:#2a3a36}
html[data-theme="light"] .side-link:hover{border-color:#9bc59a;background:rgba(60,170,40,.08)}
html[data-theme="light"] .side-link.active{color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16)}
html[data-theme="light"] .side-icon{color:#33433f}
html[data-theme="light"] .side-link.active .side-icon{color:#2a9d16}
html[data-theme="light"] .sidebar-quote{color:#2a3a36}
html[data-theme="light"] .pulse-line{border-bottom-color:#4fb82b}
html[data-theme="light"] .logout-link{color:#33433f;border-top-color:#d5e1dd}
html[data-theme="light"] .logout-link span{color:#33433f}
html[data-theme="light"] .topbar{border-bottom-color:#d3dfdb}
html[data-theme="light"] .online-dot{border-color:#edf3f1}
html[data-theme="light"] .hello{color:#4a5b57}
html[data-theme="light"] .ai-note{color:#3a4a46}
html[data-theme="light"] .icon-button{color:#1f2d29}
html[data-theme="light"] .date-box{color:#3a4a46;border-right-color:#c9d7d3}
@keyframes fittrack-logo-glow {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);
  }
}
.sidebar-logo{animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;
  will-change: filter;}
@media (prefers-reduced-motion: reduce) {
.sidebar-logo{animation-duration: 8s !important;}
}
.notification-wrap{position: relative;}
.notification-wrap .icon-button{display: grid; place-items: center;}
.notification-panel{position: absolute; z-index: 100; top: calc(100% + 12px); right: -62px;
  width: min(320px, calc(100vw - 28px)); padding: 14px;
  border: 1px solid #2d535d; border-radius: 13px;
  background: #071116; color: #f4f7f6; box-shadow: 0 14px 40px rgba(0,0,0,.55);}
.notification-panel-title{display:flex; align-items:center; justify-content:space-between; gap:12px; font: 600 15px "Kanit",sans-serif; margin-bottom: 9px;}
.notification-panel-title button{border:0; background:transparent; color:#b9c5c7; font-size:22px; cursor:pointer;}
.notification-item{display:flex; flex-direction:column; gap:4px; padding:10px 0; border-top:1px solid #203941;}
.notification-item strong{color:#a8f34a; font-size:12px;}
.notification-item span{font-size:11px; line-height:1.5;}
.notification-item small, .notification-hint{color:#93a1a5; font-size:9px; line-height:1.5;}
.notification-hint{display:block; padding-top:8px; border-top:1px solid #203941;}
html[data-theme="light"] .notification-panel{background:#fff; color:#1d302b; border-color:#c8d8d2; box-shadow:0 14px 40px rgba(20,45,35,.18);}
html[data-theme="light"] .notification-item{border-color:#e0e9e5;}
html[data-theme="light"] .notification-hint{border-color:#e0e9e5;}
@media(max-width:760px) {
.notification-panel{right:-42px; top:calc(100% + 8px);}
}
html[data-theme="light"] body, html[data-theme="light"] #root{background:#edf4f1; color:#172923;}
html[data-theme="light"] .fittrack-app{background:radial-gradient(circle at 74% 7%,rgba(111,210,80,.13),transparent 25%),
             radial-gradient(circle at 92% 62%,rgba(170,91,225,.09),transparent 24%),#edf4f1;
  color:#172923;}
html[data-theme="light"] .main-area{color:#172923;}
html[data-theme="light"] .topbar{background:rgba(249,252,250,.76); border-bottom-color:#c8d8d1;}
html[data-theme="light"] .hello, html[data-theme="light"] .ai-note, html[data-theme="light"] .date-box{color:#40554d;}
html[data-theme="light"] .user-block strong{color:#172923;}
html[data-theme="light"] .icon-button{color:#263c33;}
html[data-theme="light"] .icon-button:hover{color:#278b20; background:#e3f3df; border-radius:10px;}
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,#fbfefc 0%,#edf5f1 100%); border-right-color:#c8d8d1 !important;}
html[data-theme="light"] .logo-caption{color:#53675f;}
html[data-theme="light"] .side-link{color:#31473e;}
html[data-theme="light"] .side-link:hover{background:#e8f4e5; border-color:#b7d7ae;}
html[data-theme="light"] .side-link.active{color:#17351b; background:linear-gradient(100deg,#dff5d7,#f1faed); border-color:#65b947; box-shadow:0 5px 15px rgba(66,145,48,.12),inset 0 0 0 1px rgba(255,255,255,.65);}
html[data-theme="light"] .side-icon{color:#40584e;}
html[data-theme="light"] .side-link.active .side-icon{color:#258d20;}
html[data-theme="light"] .sidebar-quote{color:#40564c;}
html[data-theme="light"] .logout-link{color:#40564c; border-top-color:#cfddd7;}
html[data-theme="light"] .logout-link span{color:#40564c;}
html[data-theme="light"] .notification-panel{background:#fff; color:#20372d; border-color:#c8d9d1; box-shadow:0 14px 38px rgba(29,67,49,.17);}
html[data-theme="light"] .notification-panel-title button{color:#52685e;}
html[data-theme="light"] .notification-item{border-color:#dce7e1;}
html[data-theme="light"] .notification-item strong{color:#287f1b;}
html[data-theme="light"] .notification-item span{color:#2e4439;}
html[data-theme="light"] .notification-item small, html[data-theme="light"] .notification-hint{color:#657970;}
html[data-theme="light"] .notification-hint{border-color:#dce7e1;}
html[data-theme="light"] .fittrack-app{background: radial-gradient(ellipse at 78% 0%, #e8f6ee 0%, #f4f8f5 38%, #f2f6f4 100%);
  color: #182b24;}
html[data-theme="light"] .sidebar{background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;
  border-right: 1px solid #c5d9ce !important;
  box-shadow: 5px 0 22px rgba(26, 74, 49, .045);}
html[data-theme="light"] .topbar{background: rgba(255,255,255,.82);
  border-bottom: 1px solid #d2e2d9;}
html[data-theme="light"] .side-link.active{background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32;}
html[data-theme="light"] .icon-button{background:#f0f8f3; border:1px solid #c8ded1; color:#244b35;}
html[data-theme="light"] .icon-button:hover{background:#e3f4e9;}
.notification-wrap .notification-bell{border-radius: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 5px; transition: color .2s ease, transform .2s ease;}
.notification-wrap .notification-bell svg{width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;}
.notification-wrap .notification-bell:hover{transform: translateY(-2px) scale(1.06); background: transparent !important; box-shadow: none !important; color: var(--green);}
.notification-panel{width:min(360px,calc(100vw - 28px)); padding:0; overflow:hidden; border-radius:16px; animation: notif-pop .2s ease-out;}
.notification-panel-title{padding:15px 16px 12px; margin:0; border-bottom:1px solid rgba(130,160,150,.2);}
.notification-panel-title>span{display:flex; align-items:baseline; gap:8px;}
.notification-panel-title>span>small{font:400 10px "Anuphan",sans-serif; opacity:.65;}
.notification-panel-title button{width:27px;height:27px;border-radius:50%;line-height:1;}
.notification-panel-title button:hover{background:rgba(130,150,140,.15);}
.notification-item{position:relative; flex-direction:row; align-items:flex-start; gap:10px; padding:12px 15px; border-top:0; transition:background .18s ease;}
.notification-item:hover{background:rgba(120,160,140,.10);}
.notification-avatar{flex:0 0 38px; width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:17px;background:linear-gradient(145deg,#244d37,#142c22);box-shadow:0 2px 8px rgba(0,0,0,.14);}
.notification-avatar.goal-avatar{background:linear-gradient(145deg,#56317b,#322047);}
.notification-message{min-width:0; flex:1; display:flex; flex-direction:column; gap:3px;}
.notification-message strong{color:inherit; font-size:11px;}
.notification-message strong small{font-size:9px;font-weight:400;color:#94a39d;}
.notification-message span{font-size:11px;line-height:1.5;}
.notification-message>small{font-size:9px;line-height:1.4;color:#9aa9a3;}
.notification-unread{flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#4eaeef;margin:7px 1px 0 0;box-shadow:0 0 0 3px rgba(78,174,239,.12);}
.notification-hint{display:block;padding:10px 15px 12px;border-top:1px solid rgba(130,160,150,.2);}
@keyframes notif-pop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
html[data-theme="light"] .notification-panel{background:#fff; color:#24372e; border-color:#c9ddd2;}
html[data-theme="light"] .notification-panel-title{border-color:#e2ebe5;}
html[data-theme="light"] .notification-item:hover{background:#f3f9f5;}
html[data-theme="light"] .notification-avatar{background:linear-gradient(145deg,#dff4e5,#c5e9d1);}
html[data-theme="light"] .notification-avatar.goal-avatar{background:linear-gradient(145deg,#f0e1ff,#dfc7f7);}
html[data-theme="light"] .notification-message strong{color:#263d32;}
html[data-theme="light"] .notification-message strong small, html[data-theme="light"] .notification-message>small{color:#6e8276;}
html[data-theme="light"] .notification-hint{border-color:#e2ebe5;}
@media (prefers-reduced-motion: reduce) {
.notification-panel{animation:none!important;transition:none!important;}
}
.notification-wrap .notification-bell{appearance:none; -webkit-appearance:none; background:transparent!important; border:0!important; outline-offset:3px; box-shadow:none!important; border-radius:0!important;}
.notification-wrap .notification-bell:hover, .notification-wrap .notification-bell:focus-visible{background:transparent!important; box-shadow:none!important; color:var(--green);}
html[data-theme="light"] .notification-wrap .notification-bell{background:transparent!important; border:0!important; box-shadow:none!important; color:#244b35;}
html[data-theme="light"] .notification-wrap .notification-bell:hover{background:transparent!important; color:#278b20;}
.notification-wrap .notification-panel{position: fixed; z-index: 9999; top: 88px; right: 24px;
  width: min(370px, calc(100vw - 28px)); max-height: calc(100vh - 110px);
  overflow: visible; padding: 0; border: 0; border-radius: 0;
  background: transparent; color: inherit; box-shadow: none;
  display: flex; flex-direction: column; gap: 10px;
  animation: none;}
.notification-panel-title{order: -1; display:flex; align-items:center; justify-content:space-between;
  margin:0 0 2px; padding:0 2px 4px; border:0; font-size:12px;
  color:var(--muted,#82918b); text-shadow:0 1px 5px rgba(0,0,0,.12);}
.notification-panel-title>span{display:flex; align-items:baseline; gap:7px;}
.notification-panel-title>span>small{font-size:10px;}
.notification-panel-title button{color:inherit; width:24px; height:24px; font-size:20px;}
.notification-panel .notification-item{box-sizing:border-box; width:100%; min-height:76px; padding:13px 14px;
  display:flex; flex-direction:row; align-items:flex-start; gap:11px;
  border:1px solid rgba(150,175,162,.24); border-radius:14px;
  background:rgba(13,27,24,.97); color:#f5faf6;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12);
  animation:toast-enter .42s cubic-bezier(.2,.8,.2,1) both;}
.notification-panel .notification-item:nth-of-type(3){animation-delay:.22s;}
.notification-panel .notification-item:hover{transform:translateX(-3px); background:rgba(20,39,32,.99);}
.notification-panel .notification-avatar{flex:0 0 38px; width:38px; height:38px;}
.notification-panel .notification-message{flex:1; min-width:0; gap:4px;}
.notification-panel .notification-message strong{font-size:12px; color:#f4faf5;}
.notification-panel .notification-message strong small{font-size:10px; color:#a7b8ad;}
.notification-panel .notification-message span{font-size:12px; line-height:1.5; color:#eef5f0;}
.notification-panel .notification-message>small{font-size:10px; line-height:1.45; color:#aab9b0;}
.notification-panel .notification-unread{margin-top:6px;}
.notification-panel .notification-hint{display:none;}
html[data-theme="light"] .notification-panel-title{color:#5c7065; text-shadow:none;}
html[data-theme="light"] .notification-panel .notification-item{background:rgba(255,255,255,.98); color:#24372e;
  border-color:#dce9e0; box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07);}
html[data-theme="light"] .notification-panel .notification-item:hover{background:#f9fffb;}
html[data-theme="light"] .notification-panel .notification-message strong{color:#263d32;}
html[data-theme="light"] .notification-panel .notification-message strong small, html[data-theme="light"] .notification-panel .notification-message>small{color:#718378;}
html[data-theme="light"] .notification-panel .notification-message span{color:#2e4438;}
@media(max-width:600px) {
.notification-wrap .notification-panel{top:76px; right:12px; width:min(360px,calc(100vw - 24px));}
}
@media(prefers-reduced-motion:reduce) {
.notification-panel .notification-item{animation:none!important; transition:none!important;}
}
.notification-panel .notification-item{text-align:left; justify-content:flex-start;}
.notification-panel .notification-message{text-align:left; align-items:flex-start;}
.notification-panel .notification-message strong, .notification-panel .notification-message span, .notification-panel .notification-message>small{display:block; width:100%; text-align:left;}
.notification-panel .notification-avatar.dumbbell-avatar{flex:0 0 36px; width:36px; height:36px; border-radius:10px;
  display:grid; place-items:center; background:transparent!important;
  box-shadow:none!important; color:#83dc78; margin-top:1px;}
.notification-panel .notification-avatar.dumbbell-avatar svg{display:block; width:25px; height:25px; fill:none; stroke:currentColor;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;}
html[data-theme="light"] .notification-panel .notification-avatar.dumbbell-avatar{color:#278b43;}
.notification-wrap .notification-panel{background:transparent!important; border:0!important; box-shadow:none!important;}
.notification-wrap .notification-panel .notification-item{background:rgba(13,27,24,.97)!important;
  border:1px solid rgba(150,175,162,.24)!important;
  border-radius:14px!important;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12)!important;
  color:#f5faf6;}
html[data-theme="light"] .notification-wrap .notification-panel .notification-item{background:rgba(255,255,255,.98)!important;
  border-color:#dce9e0!important;
  box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07)!important;
  color:#24372e;}
.notification-wrap .notification-panel .notification-message, .notification-wrap .notification-panel .notification-message strong, .notification-wrap .notification-panel .notification-message span, .notification-wrap .notification-panel .notification-message>small{background:transparent!important; box-shadow:none!important;}
.notification-wrap .notification-panel .notification-item:hover{transform:translateX(-3px);}
html[data-theme="light"] .notification-wrap .notification-panel .notification-item:hover{background:#f9fffb!important;}
@media (max-width: 760px) {
html, body, #root, .fittrack-app{width:100%; min-width:0; max-width:100%;}
body{overflow-x:hidden;}
.sidebar{width:100%; min-width:0; padding:8px 7px 9px;}
.sidebar-logo-wrap{padding:0 2px 8px;}
.sidebar-logo{width:132px; height:68px; max-width:42vw;}
.logo-caption{margin-top:-5px; font-size:6px; letter-spacing:1.5px;}
.side-menu{width:100%; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px;}
.side-link{width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere;}
.side-icon{width:auto; min-height:19px; font-size:19px; line-height:1;}
.main-area{margin:0!important; width:100%!important; min-width:0; padding:0 10px 22px!important;}
.topbar{width:100%; min-width:0; min-height:70px; height:auto; padding:10px 2px; gap:8px;}
.user-block{min-width:0; gap:8px;}
.avatar-wrap, .avatar-fallback{width:42px; height:42px;}
.avatar-fallback{font-size:16px;}
.online-dot{width:12px; height:12px;}
.hello{font-size:11px;}
.user-block strong{display:block; max-width:32vw; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.topbar-right{min-width:0; gap:4px;}
.icon-button{width:36px; height:38px; flex:0 0 36px; font-size:22px;}
.icon-button.sun{font-size:24px;}
.notification-wrap{position:relative;}
.notification-wrap .notification-panel{position:absolute; top:calc(100% + 8px); right:-4px; left:auto; width:min(340px,calc(100vw - 24px)); max-height:min(65vh,440px); overflow-y:auto; z-index:1000;}
}
@media (max-width: 390px) {
.main-area{padding-left:8px!important; padding-right:8px!important;}
.topbar{gap:4px;}
.user-block{gap:6px;}
.avatar-wrap, .avatar-fallback{width:38px; height:38px;}
.user-block strong{font-size:16px; max-width:29vw;}
.topbar-right{gap:1px;}
.icon-button{width:32px; flex-basis:32px;}
}
@media (max-width: 340px) {
.side-link{font-size:7.5px;}
}
@media (max-width: 760px) and (orientation: landscape) {
.sidebar-logo-wrap{display:none;}
.sidebar{padding:5px 7px;}
.side-link{height:44px; flex-direction:row; font-size:9px;}
}
.side-icon-dumbbell{display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px;}
.side-icon-dumbbell svg{display:block; width:25px; height:25px;}
@media (max-width:760px) {
.side-icon-dumbbell{flex:0 0 auto; min-height:19px;}
.side-icon-dumbbell svg{width:19px; height:19px;}
}

/* ===== Profile: เนื้อหาหน้า (ใช้ตัวแปรสีเดียวกับ Dashboard) ===== */
.pf-title{display:flex;align-items:center;gap:16px;padding:26px 8px 18px;flex-wrap:wrap}
.pf-title-icon{width:46px;height:46px;flex:0 0 46px;border-radius:12px;display:grid;place-items:center;color:var(--green);border:1px solid #5ea02c;background:rgba(110,255,45,.07);font-size:22px}
.pf-title h1{margin:0;font-family:'Kanit',sans-serif;font-size:32px;font-weight:600;line-height:1.15}
.pf-title p{margin:4px 0 0;color:var(--muted);font-size:14px}
.pf-back{margin-left:auto;height:40px;padding:0 18px;border-radius:10px;background:transparent;color:var(--text);border:1px solid var(--line);font-size:14px;font-weight:600;cursor:pointer;transition:.2s}
.pf-back:hover{border-color:#35534a;background:rgba(103,255,41,.05)}
.pf-wrap{display:flex;justify-content:center;padding-bottom:10px}
.pf-card{width:100%;max-width:560px;padding:28px;border-radius:15px;border:1px solid #2a5360;background:linear-gradient(145deg,#050b0e,#071116);box-shadow:inset 0 0 25px rgba(0,0,0,.25);display:flex;flex-direction:column;align-items:center}
html[data-theme="light"] .pf-card{background:linear-gradient(145deg,#ffffff,#f5f9f8);border-color:#cddbd7;box-shadow:none}
.pf-avatar{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;margin-bottom:26px;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-family:'Kanit',sans-serif;font-weight:700;font-size:36px;box-shadow:0 0 0 4px rgba(255,255,255,.03),0 0 24px rgba(125,255,45,.12)}
html[data-theme="light"] .pf-avatar{background:radial-gradient(circle at 35% 25%,#ffffff,#d5e3df 65%);border-color:#9fb4ae;color:#172923}
.pf-field{width:100%;margin-bottom:18px;text-align:left}
.pf-label{display:block;margin-bottom:6px;color:var(--muted);font-size:12px;letter-spacing:.5px}
.pf-value{margin:0;min-height:44px;display:flex;align-items:center;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);font-size:15px;word-break:break-all}
.pf-input{width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--green);background:var(--panel2);color:var(--text);font-size:15px;font-family:inherit;outline:none;box-shadow:0 0 0 3px rgba(125,255,45,.12)}
.pf-message{width:100%;margin:0 0 16px;padding:10px 14px;border-radius:10px;font-size:14px;color:var(--green);border:1px solid #2f5d2a;background:rgba(110,255,45,.07)}
.pf-message.error{color:var(--red);border-color:rgba(255,71,109,.4);background:rgba(255,71,109,.08)}
.pf-row{display:flex;gap:12px;width:100%;margin-bottom:14px}
.pf-btn{flex:1;height:44px;padding:0 20px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:.2s}
.pf-btn:disabled{opacity:.6;cursor:not-allowed}
.pf-btn.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}
.pf-btn.secondary:hover:not(:disabled){border-color:#35534a;background:rgba(103,255,41,.05)}
.pf-btn.primary{border:0;color:#071005;font-weight:700;background:linear-gradient(90deg,#72ed2e,#baff3e);box-shadow:0 0 16px rgba(125,255,45,.15)}
.pf-btn.primary:hover:not(:disabled){box-shadow:0 0 22px rgba(125,255,45,.3);transform:translateY(-1px)}
.pf-btn.danger{width:100%;flex:none;background:transparent;color:var(--red);border:1px solid rgba(255,71,109,.6)}
.pf-btn.danger:hover{background:rgba(255,71,109,.08)}
.pf-loading{color:var(--muted);padding:30px 0}
.pf-footer{padding:26px 0 10px;text-align:center;color:var(--muted);font-size:12px;letter-spacing:1.5px}

@media (max-width:760px){
  .pf-title{padding:18px 4px 12px;gap:12px}
  .pf-title h1{font-size:24px}
  .pf-back{margin-left:0;width:100%}
  .pf-card{padding:20px}
  .pf-row{flex-direction:column-reverse}
}

      
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
`}</style>
    </div>
  );
}