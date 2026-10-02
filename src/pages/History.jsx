import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

const EXERCISE_LABELS = {
  squat: { name: 'Squat (ลุกนั่ง)', icon: '🏋️', calPerRep: 0.32 },
  jumping_jack: { name: 'Jumping Jack (กระโดดตบ)', icon: '⭐', calPerRep: 0.20 },
};

export default function History() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login');
        return;
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

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const totalReps = workouts.reduce((sum, w) => sum + (w.count || 0), 0);
  const totalCalories = workouts.reduce((sum, w) => {
    if (w.calories !== undefined) return sum + w.calories;
    const calPerRep = EXERCISE_LABELS[w.exercise]?.calPerRep || 0.32;
    return sum + (w.count || 0) * calPerRep;
  }, 0).toFixed(2);

  return (
    <div className="history-page">
      <aside className="history-sidebar">
        <div className="history-brand-block">
          <button
            className="history-brand-button"
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="กลับหน้าหลัก FitTrack"
          >
            <div className="history-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <defs>
                  <linearGradient id="historyBoltGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7d5cff" />
                    <stop offset="100%" stopColor="#1877f2" />
                  </linearGradient>
                </defs>
                <path
                  d="M18.7 2.5 7 17.3h8.1l-1.5 12.2L25 14.2h-8.5l2.2-11.7Z"
                  fill="url(#historyBoltGradient)"
                />
              </svg>
            </div>
            <div>
              <div className="history-brand-name">FitTrack</div>
              <div className="history-brand-tagline">Healthy Today</div>
            </div>
          </button>
        </div>

        <nav className="history-sidebar-nav">
          <button className="history-side-nav" type="button" onClick={() => navigate('/')}>
            <span>⌂</span>
            <b>หน้าหลัก</b>
          </button>
          <button className="history-side-nav" type="button" onClick={() => navigate('/exercises')}>
            <span>✦</span>
            <b>ออกกำลังกาย</b>
          </button>
          <button
            className="history-side-nav active"
            type="button"
            onClick={() => navigate('/history')}
          >
            <span>◷</span>
            <b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="history-side-logout" type="button" onClick={() => navigate('/login')}>
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="history-main">
        <header className="history-header">
          <div className="history-header-copy">
            <div className="history-logo">FITTRACK</div>
            <h1>ประวัติการออกกำลังกาย</h1>
            <p>ติดตามการออกกำลังกาย · สรุปจำนวนครั้ง · พลังงานที่ใช้</p>
          </div>
          <div className="history-header-actions">
            <button
              className="history-profile-pill"
              type="button"
              onClick={() => navigate('/profile')}
              title="โปรไฟล์ของฉัน"
            >
              <span className="history-profile-avatar">P</span>
              <span className="history-profile-name">โปรไฟล์</span>
              <span className="history-profile-chevron">›</span>
            </button>
          </div>
        </header>

        <div className="history-content">
          <section className="history-panel history-intro-panel">
            <div className="history-panel-heading">
              <div className="history-panel-icon">◷</div>
              <div>
                <h2>สรุปการออกกำลังกาย</h2>
                <span>ภาพรวมกิจกรรมที่บันทึกไว้</span>
              </div>
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
                  className="history-cta-button"
                  type="button"
                  onClick={() => navigate('/exercises')}
                >
                  เริ่มออกกำลังกายเลย <span>›</span>
                </button>
              </div>
            ) : (
              <div className="history-summary-grid">
                <div className="history-summary-card">
                  <div className="history-summary-top">
                    <span className="history-summary-icon blue">▣</span>
                    <span className="history-summary-label">จำนวนครั้งที่ออกกำลังกาย</span>
                  </div>
                  <strong>{workouts.length}</strong>
                  <small>เซสชัน</small>
                </div>
                <div className="history-summary-card">
                  <div className="history-summary-top">
                    <span className="history-summary-icon purple">✦</span>
                    <span className="history-summary-label">รวมจำนวนครั้ง</span>
                  </div>
                  <strong>{totalReps}</strong>
                  <small>Reps ทั้งหมด</small>
                </div>
                <div className="history-summary-card">
                  <div className="history-summary-top">
                    <span className="history-summary-icon orange">♨</span>
                    <span className="history-summary-label">พลังงานที่ใช้</span>
                  </div>
                  <strong>{totalCalories}</strong>
                  <small>kcal</small>
                </div>
              </div>
            )}
          </section>

          {!loading && !error && workouts.length > 0 && (
            <section className="history-panel history-list-panel">
              <div className="history-panel-heading history-list-heading">
                <div className="history-panel-icon">▤</div>
                <div>
                  <h2>รายการออกกำลังกาย</h2>
                  <span>เรียงจากรายการล่าสุด</span>
                </div>
                <span className="history-count-pill">{workouts.length} รายการ</span>
              </div>

              <div className="history-list">
                {workouts.map((w) => {
                  const info = EXERCISE_LABELS[w.exercise] || {
                    name: w.exercise,
                    icon: '💪',
                    calPerRep: 0.32,
                  };
                  const sessionCalories =
                    w.calories !== undefined
                      ? w.calories
                      : Number(((w.count || 0) * info.calPerRep).toFixed(2));

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

          <section className="history-ai-note">
            <div className="history-panel-icon purple">✧</div>
            <div className="history-ai-copy">
              <h2>บันทึกเพื่อพัฒนาสุขภาพ</h2>
              <p>ตรวจสอบประวัติการออกกำลังกาย เพื่อดูความต่อเนื่องและติดตามกิจกรรมของคุณ</p>
            </div>
            <button
              className="history-secondary-button"
              type="button"
              onClick={() => navigate('/exercises')}
            >
              ออกกำลังกาย <span>›</span>
            </button>
          </section>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
          margin: 0;
          background: #eef4fb;
          color: #173b73;
          font-family: "Anuphan", sans-serif;
        }
        button { font-family: inherit; }

        .history-page {
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          display: flex;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
          color: #173b73;
        }

        .history-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 232px;
          min-height: 100vh;
          padding: 31px 18px 24px;
          display: flex;
          flex-direction: column;
          z-index: 20;
          background: rgba(255,255,255,.93);
          border: 0;
          box-shadow: none;
          backdrop-filter: blur(18px);
        }
        .history-brand-block { padding: 0 10px 30px; }
        .history-brand-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .history-brand-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: linear-gradient(145deg, #5b9cf6, #1769dc);
          box-shadow: 0 9px 20px rgba(24,119,242,.22);
          overflow: hidden;
        }
        .history-brand-mark svg { width: 27px; height: 27px; display: block; }
        .history-brand-name {
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 21px;
          font-weight: 600;
          line-height: 1.1;
        }
        .history-brand-tagline {
          margin-top: 3px;
          color: #8aa0b9;
          font-size: 9px;
          letter-spacing: .5px;
        }
        .history-sidebar-nav { display: flex; flex-direction: column; gap: 8px; }
        .history-side-nav {
          width: 100%;
          min-height: 51px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 0;
          border-radius: 15px;
          cursor: pointer;
          color: #5c7594;
          background: transparent;
          font-size: 13px;
          text-align: left;
          transition: .22s ease;
        }
        .history-side-nav span {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #4376b8;
          background: #edf5ff;
          font-size: 16px;
        }
        .history-side-nav:hover, .history-side-nav.active {
          color: #1558a9;
          background: #e7f1ff;
          transform: translateX(2px);
        }
        .history-side-nav.active span {
          color: #fff;
          background: linear-gradient(145deg, #4d97f5, #1769dc);
          box-shadow: 0 5px 12px rgba(24,119,242,.2);
        }
        .history-side-logout {
          margin-top: auto;
          padding: 12px 14px;
          border: 0;
          color: #69809a;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 11px;
        }
        .history-side-logout span { margin-right: 9px; color: #3b79c5; font-size: 17px; }

        .history-main {
          width: calc(100% - 232px);
          max-width: calc(100% - 232px);
          min-width: 0;
          margin-left: 232px;
          padding: 0 31px 36px;
          border: 0;
          outline: 0;
        }
        .history-header {
          min-height: 122px;
          padding: 25px 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #dfe9f4;
        }
        .history-header-copy { text-align: center; }
        .history-logo {
          margin-bottom: 2px;
          color: #2b7eea;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2px;
        }
        .history-header h1 {
          margin: 0;
          color: #11396f;
          font-family: "Kanit", sans-serif;
          font-size: clamp(27px, 3.2vw, 39px);
          font-weight: 600;
          line-height: 1.25;
          background: linear-gradient(90deg, #11396f 0%, #1877f2 48%, #2f68bd 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .history-header p {
          margin: 5px 0 0;
          color: #68809f;
          font-size: 13px;
          line-height: 1.5;
        }
        .history-header-actions { position: absolute; right: 0; top: 33px; }
        .history-profile-pill {
          min-height: 43px;
          padding: 4px 12px 4px 4px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #dce8f5;
          border-radius: 24px;
          color: #315b8f;
          background: #fff;
          box-shadow: 0 8px 20px rgba(28,75,125,.07);
          cursor: pointer;
          transition: .2s ease;
        }
        .history-profile-pill:hover {
          transform: translateY(-2px);
          border-color: #a9c9ee;
          box-shadow: 0 11px 24px rgba(24,119,242,.13);
        }
        .history-profile-avatar {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(145deg, #4f99f6, #1769dc);
          font-weight: 700;
          font-size: 11px;
        }
        .history-profile-name { font-size: 11px; font-weight: 600; }
        .history-profile-chevron { color: #6d8aab; font-size: 19px; }

        .history-content {
          width: 100%;
          max-width: 1230px;
          min-width: 0;
          margin: 0 auto;
          padding-top: 20px;
        }
        .history-panel {
          position: relative;
          min-width: 0;
          padding: 20px;
          overflow: hidden;
          border: 1px solid #dbe8f5;
          border-radius: 19px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 10px 28px rgba(35,82,137,.065);
          transition: transform .22s ease, box-shadow .22s ease;
        }
        .history-panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, #1877f2, #74b3ff, transparent);
        }
        .history-panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 35px rgba(35,82,137,.09);
        }
        .history-intro-panel { margin-bottom: 18px; }
        .history-panel-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          margin-bottom: 16px;
        }
        .history-panel-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          font-size: 19px;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 17px rgba(24,119,242,.19);
        }
        .history-panel-icon.purple {
          background: linear-gradient(145deg, #8b6ff7, #5f3bd8);
          box-shadow: 0 8px 17px rgba(95,59,216,.18);
        }
        .history-panel-heading h2, .history-ai-copy h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
        }
        .history-panel-heading span {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 10px;
          line-height: 1.4;
        }
        .history-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .history-summary-card {
          min-width: 0;
          min-height: 140px;
          padding: 17px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          border: 1px solid #e1ebf5;
          border-radius: 15px;
          background: linear-gradient(145deg, #f9fcff, #f3f8fd);
        }
        .history-summary-top {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .history-summary-icon {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          font-size: 15px;
        }
        .history-summary-icon.blue { color: #1877f2; background: #e5f1ff; }
        .history-summary-icon.purple { color: #7654df; background: #f0ebff; }
        .history-summary-icon.orange { color: #ec8a19; background: #fff0dc; }
        .history-summary-label { color: #557394; font-size: 11px; font-weight: 600; }
        .history-summary-card strong {
          margin: 10px 0 0 2px;
          color: #173f79;
          font-family: "Kanit", sans-serif;
          font-size: 29px;
          font-weight: 600;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .history-summary-card small { margin: 3px 0 0 3px; color: #8aa0b9; font-size: 10px; }
        .history-state {
          min-height: 165px;
          padding: 25px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed #a8c9f1;
          border-radius: 15px;
          background: #f7fbff;
          text-align: center;
        }
        .history-state-icon { color: #438ce7; font-size: 35px; line-height: 1.2; }
        .history-state p { margin: 9px 0 0; color: #718ba8; font-size: 12px; }
        .history-error p { color: #d34c5b; }
        .history-cta-button, .history-secondary-button {
          margin-top: 13px;
          min-height: 40px;
          padding: 0 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 12px;
          color: #fff;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 18px rgba(24,119,242,.17);
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
        }
        .history-cta-button span, .history-secondary-button span { font-size: 18px; line-height: 1; }
        .history-list-panel { margin-bottom: 18px; }
        .history-list-heading { margin-bottom: 17px; }
        .history-count-pill {
          margin-left: auto;
          padding: 7px 11px;
          border: 1px solid #d8e9fb;
          border-radius: 999px;
          color: #3175c5 !important;
          background: #eaf3ff;
          font-size: 9px !important;
          white-space: nowrap;
        }
        .history-list { display: flex; flex-direction: column; gap: 10px; }
        .history-item {
          min-width: 0;
          padding: 13px 15px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid #e1ebf5;
          border-radius: 14px;
          background: linear-gradient(145deg, #fff, #f8fbff);
          transition: .2s ease;
        }
        .history-item:hover {
          transform: translateY(-1px);
          border-color: #c5dcf5;
          box-shadow: 0 7px 18px rgba(35,82,137,.07);
        }
        .history-item-icon {
          width: 45px;
          height: 45px;
          flex: 0 0 45px;
          display: grid;
          place-items: center;
          border: 1px solid #d7e9fb;
          border-radius: 13px;
          background: #eaf4ff;
          font-size: 22px;
        }
        .history-item-info { flex: 1; min-width: 0; text-align: left; }
        .history-item-name {
          color: #173f79;
          font-family: "Kanit", sans-serif;
          font-size: 14px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .history-item-date {
          margin-top: 3px;
          color: #8095ad;
          font-size: 10px;
        }
        .history-item-date span { margin-right: 4px; color: #4b91e8; }
        .history-item-stats { text-align: right; white-space: nowrap; }
        .history-item-stats strong {
          display: block;
          color: #1769dc;
          font-family: "Kanit", sans-serif;
          font-size: 14px;
          font-weight: 600;
        }
        .history-item-stats span { display: block; margin-top: 2px; color: #d78a22; font-size: 10px; }
        .history-ai-note {
          min-width: 0;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid #dbe8f5;
          border-radius: 19px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 10px 28px rgba(35,82,137,.065);
        }
        .history-ai-copy { min-width: 0; }
        .history-ai-copy h2 { font-size: 15px; }
        .history-ai-copy p { margin: 4px 0 0; color: #7b91aa; font-size: 10px; line-height: 1.6; }
        .history-secondary-button {
          flex: 0 0 auto;
          margin: 0 0 0 auto;
          color: #3175c5;
          border: 1px solid #d8e9fb;
          background: #eaf3ff;
          box-shadow: none;
        }

        @media (max-width: 1050px) {
          .history-sidebar { width: 200px; }
          .history-main {
            width: calc(100% - 200px);
            max-width: calc(100% - 200px);
            margin-left: 200px;
            padding: 0 20px 30px;
          }
        }
        @media (max-width: 760px) {
          .history-page { display: block; }
          .history-sidebar {
            position: static;
            width: 100%;
            min-height: 0;
            padding: 12px;
          }
          .history-brand-block { padding: 4px 8px 12px; }
          .history-sidebar-nav { flex-direction: row; }
          .history-side-nav { justify-content: center; min-height: 43px; padding: 0 8px; }
          .history-side-nav span { display: none; }
          .history-side-logout { display: none; }
          .history-main {
            width: 100%;
            max-width: 100%;
            margin-left: 0;
            padding: 0 12px 25px;
          }
          .history-header { min-height: 125px; padding: 17px 65px 17px 8px; }
          .history-header-actions { right: 0; top: 21px; }
          .history-profile-name, .history-profile-chevron { display: none; }
          .history-profile-pill { padding: 4px; }
          .history-header h1 { font-size: 28px; }
          .history-summary-grid { grid-template-columns: 1fr; gap: 10px; }
          .history-summary-card { min-height: 110px; }
          .history-ai-note { align-items: flex-start; flex-wrap: wrap; }
          .history-secondary-button { margin-left: 55px; }
        }
        @media (max-width: 420px) {
          .history-panel { padding: 15px; }
          .history-item { padding: 11px; gap: 9px; }
          .history-item-icon { width: 39px; height: 39px; flex-basis: 39px; }
          .history-item-name { font-size: 12px; }
          .history-item-date { font-size: 9px; }
          .history-item-stats strong { font-size: 12px; }
          .history-item-stats span { font-size: 9px; }
        }
      `}</style>
    </div>
  );
}