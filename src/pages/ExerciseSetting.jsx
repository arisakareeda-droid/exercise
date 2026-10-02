import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ExerciseSetting() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get("exercise") || "squat";
  const [targetCount, setTargetCount] = useState(10);

  const exerciseInfoMap = {
    squat: {
      name: "Squat",
      thaiName: "ลุกนั่ง",
      icon: "🏋️‍♂️",
      description: "บริหารกล้ามเนื้อขาและสะโพก",
    },
    jumping_jack: {
      name: "Jumping Jack",
      thaiName: "กระโดดตบ",
      icon: "⭐",
      description: "ช่วยเพิ่มการเผาผลาญและความแข็งแรง",
    },
    high_knees: {
      name: "High Knees",
      thaiName: "ยกเข่าสูง",
      icon: "🏃",
      description: "เพิ่มอัตราการเต้นของหัวใจและฝึกกล้ามเนื้อต้นขา",
    },
    punches: {
      name: "Punches",
      thaiName: "ชกหมัด",
      icon: "🥊",
      description: "ชกหมัดสลับซ้าย-ขวา ฝึกกล้ามเนื้อแขน ไหล่ และเพิ่มอัตราการเต้นของหัวใจ",
    },
  };

  const exerciseInfo = exerciseInfoMap[exerciseType] || exerciseInfoMap.squat;

  const handleStartSession = () => {
    const count = Math.max(1, Math.min(100, Number(targetCount) || 1));
    navigate(`/exercise?exercise=${exerciseType}&target=${count}`);
  };

  return (
    <div className="dashboard-page">
      {/* ---------- SIDEBAR ---------- */}
      <aside className="dashboard-sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-label="FitTrack">
            <svg
              viewBox="0 0 32 32"
              width="27"
              height="30"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M8 3.5h17l-4.5 7H29L13 28v-11H4l4-13.5Z"
                fill="#a855f7"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div>
            <div className="brand-name">FitTrack</div>
            <div className="brand-tagline">Healthy Today</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className="side-nav"
            type="button"
            onClick={() => navigate("/dashboard")}
          >
            <span>⌂</span>
            <b>หน้าหลัก</b>
          </button>

          <button
            className="side-nav active"
            type="button"
            onClick={() => navigate("/exercises")}
          >
            <span>✦</span>
            <b>ออกกำลังกาย</b>
          </button>

          <button
            className="side-nav"
            type="button"
            onClick={() => navigate("/history")}
          >
            <span>◷</span>
            <b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="side-logout" type="button">
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-copy">
            <div className="logo">FITTRACK</div>
            <h1>ตั้งค่าการออกกำลังกาย</h1>
            <p>เลือกท่า · กำหนดเป้าหมาย · เริ่มออกกำลังกาย</p>
          </div>

          <div className="header-actions">
            <button
              className="profile-pill"
              type="button"
              onClick={() => navigate("/profile")}
              title="โปรไฟล์ของฉัน"
            >
              <div className="profile-avatar">
                <span>U</span>
              </div>
              <span className="profile-name">โปรไฟล์</span>
              <span className="profile-chevron">›</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content setting-content">
          <section className="panel setting-panel">
            <div className="panel-heading">
              <div className="panel-icon">✦</div>
              <div>
                <h2>ตั้งค่าการออกกำลังกาย</h2>
                <span>เตรียมความพร้อมก่อนเริ่มเซสชัน</span>
              </div>
            </div>

            <div className="exercise-setting-card">
              <div className="exercise-visual">
                <div className="exercise-orb">
                  <span>{exerciseInfo.icon}</span>
                </div>

                <span className="exercise-label">SELECTED EXERCISE</span>

                <h3>
                  {exerciseInfo.name}
                  <small>({exerciseInfo.thaiName})</small>
                </h3>

                <p>{exerciseInfo.description}</p>
              </div>

              <div className="setting-divider" />

              <div className="target-section">
                <div className="target-heading">
                  <div>
                    <span className="target-label">TARGET</span>
                    <h3>เป้าหมายจำนวนครั้ง</h3>
                  </div>
                  <span className="reps-badge">REPS</span>
                </div>

                <div className="target-input-wrap">
                  <button
                    type="button"
                    className="count-btn"
                    onClick={() =>
                      setTargetCount((value) =>
                        Math.max(1, Number(value || 1) - 1)
                      )
                    }
                    aria-label="ลดจำนวนครั้ง"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={targetCount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setTargetCount("");
                        return;
                      }

                      setTargetCount(
                        Math.max(1, Math.min(100, Number(value)))
                      );
                    }}
                    min="1"
                    max="100"
                    aria-label="เป้าหมายจำนวนครั้ง"
                  />

                  <button
                    type="button"
                    className="count-btn"
                    onClick={() =>
                      setTargetCount((value) =>
                        Math.min(100, Number(value || 0) + 1)
                      )
                    }
                    aria-label="เพิ่มจำนวนครั้ง"
                  >
                    +
                  </button>
                </div>

                <div className="target-helper">
                  <span>กำหนดได้ตั้งแต่ 1–100 ครั้ง</span>
                  <strong>{Number(targetCount) || 0} ครั้ง</strong>
                </div>
              </div>

              <div className="setting-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => navigate("/exercises")}
                >
                  <span>‹</span>
                  ย้อนกลับ
                </button>

                <button
                  type="button"
                  className="primary-btn start-btn"
                  onClick={handleStartSession}
                >
                  <span>▶</span>
                  เริ่มออกกำลังกาย
                </button>
              </div>
            </div>
          </section>

          <section className="panel tips-panel">
            <div className="section-heading">
              <div className="panel-icon">✓</div>
              <div>
                <h2>ก่อนเริ่มออกกำลังกาย</h2>
                <span>คำแนะนำเพื่อการใช้งานที่ราบรื่น</span>
              </div>
            </div>

            <div className="tips-grid">
              <div className="tip-card">
                <span className="tip-icon">📷</span>
                <div>
                  <b>จัดตำแหน่งให้เหมาะสม</b>
                  <p>อยู่ในตำแหน่งที่กล้องสามารถมองเห็นร่างกายได้ชัดเจน</p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">🧍</span>
                <div>
                  <b>เตรียมพื้นที่ให้พร้อม</b>
                  <p>เลือกพื้นที่โล่งและปลอดภัยก่อนเริ่มท่าออกกำลังกาย</p>
                </div>
              </div>

              <div className="tip-card">
                <span className="tip-icon">🤖</span>
                <div>
                  <b>AI ช่วยตรวจจับท่าทาง</b>
                  <p>ระบบจะตรวจจับและนับจำนวนครั้งระหว่างการออกกำลังกาย</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="dashboard-footer">
          Small Steps · Big Changes · FITTRACK
        </footer>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
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

        button,
        input {
          font-family: inherit;
        }

        #root {
          width: 100%;
          min-height: 100vh;
          margin: 0;
          border: 0;
        }

        .dashboard-page {
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          margin: 0;
          border: 0;
          overflow-x: hidden;
          display: flex;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
        }

        /* ---------- SIDEBAR ---------- */

        .dashboard-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 232px;
          padding: 31px 18px 24px;
          display: flex;
          flex-direction: column;
          z-index: 20;
          background: rgba(255,255,255,.93);
          border-right: 1px solid #dbe7f4;
          box-shadow: 8px 0 30px rgba(35,82,137,.045);
          backdrop-filter: blur(18px);
        }

        .brand-block {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 10px 30px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
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
          font-size: 21px;
          font-weight: 600;
          line-height: 1.1;
        }

        .brand-tagline {
          margin-top: 3px;
          color: #8aa0b9;
          font-size: 9px;
          letter-spacing: .5px;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .side-nav {
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

        .side-nav span {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #4376b8;
          background: #edf5ff;
          font-size: 16px;
        }

        .side-nav:hover,
        .side-nav.active {
          color: #1558a9;
          background: #e7f1ff;
          transform: translateX(2px);
        }

        .side-nav.active span {
          color: #fff;
          background: linear-gradient(145deg, #4d97f5, #1769dc);
          box-shadow: 0 5px 12px rgba(24,119,242,.2);
        }

        .side-logout {
          margin-top: auto;
          padding: 12px 14px;
          border: 0;
          color: #69809a;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 11px;
        }

        .side-logout span {
          margin-right: 9px;
          color: #3b79c5;
          font-size: 17px;
        }

        /* ---------- MAIN ---------- */

        .dashboard-main {
          flex: 1 1 auto;
          width: auto;
          max-width: 100%;
          margin-left: 232px;
          min-width: 0;
          padding: 0 31px 36px;
          border: 0;
          outline: 0;
        }

        .dashboard-header {
          min-height: 122px;
          padding: 25px 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #dfe9f4;
        }

        .header-copy {
          text-align: center;
        }

        .logo {
          margin-bottom: 2px;
          color: #2b7eea;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .dashboard-header h1 {
          margin: 0;
          color: #11396f;
          font-family: "Kanit", sans-serif;
          font-size: clamp(27px, 3.2vw, 39px);
          font-weight: 600;
          line-height: 1.25;
        }

        .dashboard-header p {
          margin: 5px 0 0;
          color: #68809f;
          font-size: 13px;
          line-height: 1.5;
        }

        .header-actions {
          position: absolute;
          right: 0;
          top: 33px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .profile-pill {
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

        .profile-pill:hover {
          transform: translateY(-2px);
          border-color: #a9c9ee;
          box-shadow: 0 11px 24px rgba(24,119,242,.13);
        }

        .profile-avatar {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(145deg, #4f99f6, #1769dc);
          font-weight: 700;
        }

        .profile-name {
          font-size: 11px;
          font-weight: 600;
        }

        .profile-chevron {
          color: #6d8aab;
          font-size: 19px;
        }

        /* ---------- CONTENT / PANELS ---------- */

        .dashboard-content {
          max-width: 1000px;
          margin: 0 auto;
          padding-top: 20px;
          display: grid;
          gap: 18px;
        }

        .panel {
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

        .panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, #1877f2, #74b3ff, transparent);
        }

        .panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 35px rgba(35,82,137,.09);
        }

        .panel-heading,
        .section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          margin-bottom: 16px;
        }

        .panel-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          font-size: 18px;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 17px rgba(24,119,242,.19);
        }

        .panel-heading h2,
        .section-heading h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
        }

        .panel-heading span,
        .section-heading span {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 9.5px;
          line-height: 1.4;
        }

        /* ---------- EXERCISE SETTING ---------- */

        .setting-panel {
          padding: 22px;
        }

        .exercise-setting-card {
          max-width: 760px;
          margin: 0 auto;
          padding: 24px;
          border: 1px solid #dfeaf6;
          border-radius: 18px;
          background:
            radial-gradient(circle at 50% 0%, rgba(24,119,242,.07), transparent 35%),
            linear-gradient(145deg, #fbfdff, #f4f8fd);
        }

        .exercise-visual {
          padding: 8px 10px 4px;
          text-align: center;
        }

        .exercise-orb {
          width: 92px;
          height: 92px;
          margin: 0 auto 13px;
          display: grid;
          place-items: center;
          border: 8px solid #e7f1ff;
          border-radius: 50%;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 12px 25px rgba(24,119,242,.2);
        }

        .exercise-orb span {
          font-size: 42px;
          line-height: 1;
        }

        .exercise-label,
        .target-label {
          color: #6c91bb;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 1.7px;
        }

        .exercise-visual h3 {
          margin: 4px 0 2px;
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 25px;
          font-weight: 600;
        }

        .exercise-visual h3 small {
          margin-left: 6px;
          color: #55779d;
          font-family: "Anuphan", sans-serif;
          font-size: 13px;
          font-weight: 500;
        }

        .exercise-visual p {
          margin: 3px 0 0;
          color: #7a90a8;
          font-size: 10px;
        }

        .setting-divider {
          height: 1px;
          margin: 22px 0;
          background: #dfe8f2;
        }

        .target-section {
          padding: 0 8px;
        }

        .target-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .target-heading h3 {
          margin: 2px 0 0;
          color: #183f77;
          font-family: "Kanit", sans-serif;
          font-size: 17px;
          font-weight: 600;
        }

        .reps-badge {
          padding: 6px 11px;
          border: 1px solid #d7e7f8;
          border-radius: 999px;
          color: #3175c5;
          background: #eaf3ff;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .8px;
        }

        .target-input-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 14px;
        }

        .count-btn {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border: 1px solid #d5e4f3;
          border-radius: 12px;
          color: #3678bd;
          background: #fff;
          box-shadow: 0 5px 13px rgba(35,82,137,.06);
          cursor: pointer;
          font-size: 22px;
          transition: .2s ease;
        }

        .count-btn:hover {
          color: #fff;
          background: #1877f2;
          border-color: #1877f2;
          transform: translateY(-2px);
        }

        .target-input-wrap input {
          width: 150px;
          height: 62px;
          padding: 5px 15px;
          outline: none;
          border: 2px solid #bcd7f3;
          border-radius: 15px;
          color: #123c78;
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(24,119,242,.02), 0 8px 18px rgba(35,82,137,.06);
          font-family: "Kanit", sans-serif;
          font-size: 30px;
          font-weight: 600;
          text-align: center;
        }

        .target-input-wrap input:focus {
          border-color: #1877f2;
          box-shadow: 0 0 0 4px rgba(24,119,242,.08);
        }

        .target-helper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 8px;
          color: #899caf;
          font-size: 9px;
        }

        .target-helper strong {
          color: #3174bf;
          font-size: 10px;
        }

        .setting-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 10px;
          margin-top: 24px;
        }

        .secondary-btn,
        .primary-btn {
          min-height: 45px;
          border-radius: 11px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          transition: .2s ease;
        }

        .secondary-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid #d6e4f2;
          color: #587695;
          background: #fff;
        }

        .secondary-btn span {
          font-size: 18px;
          line-height: 1;
        }

        .secondary-btn:hover {
          transform: translateY(-2px);
          border-color: #b7d2ed;
          color: #2e6daa;
          background: #f6faff;
        }

        .primary-btn {
          border: 0;
          color: #fff;
          background: linear-gradient(135deg, #1877f2, #0d5dcc);
          box-shadow: 0 8px 17px rgba(24,119,242,.2);
        }

        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 11px 23px rgba(24,119,242,.28);
        }

        .start-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .start-btn span {
          font-size: 10px;
        }

        /* ---------- TIPS ---------- */

        .tips-panel {
          padding-bottom: 18px;
        }

        .tips-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .tip-card {
          min-width: 0;
          min-height: 95px;
          padding: 13px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid #dfe9f3;
          border-radius: 13px;
          background: #f9fbfd;
          transition: .2s ease;
        }

        .tip-card:hover {
          transform: translateY(-2px);
          border-color: #bdd7f3;
          background: #f3f8ff;
        }

        .tip-icon {
          width: 35px;
          height: 35px;
          flex: 0 0 35px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #e7f1ff;
          font-size: 17px;
        }

        .tip-card b {
          display: block;
          margin-top: 1px;
          color: #36597e;
          font-size: 10px;
        }

        .tip-card p {
          margin: 4px 0 0;
          color: #899bb0;
          font-size: 8px;
          line-height: 1.55;
        }

        .dashboard-footer {
          max-width: 1000px;
          margin: 20px auto 0;
          padding-top: 13px;
          border-top: 1px solid #dfe9f4;
          color: #8aa0b9;
          font-size: 9px;
          text-align: center;
          letter-spacing: .5px;
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 1050px) {
          .dashboard-sidebar {
            width: 200px;
          }

          .dashboard-main {
            margin-left: 200px;
            padding: 0 20px 30px;
          }

          .tips-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .dashboard-page {
            display: block;
          }

          .dashboard-sidebar {
            position: static;
            width: 100%;
            height: auto;
            padding: 12px;
            display: block;
          }

          .brand-block {
            padding: 4px 8px 12px;
          }

          .sidebar-nav {
            flex-direction: row;
          }

          .side-nav {
            justify-content: center;
            min-height: 43px;
            padding: 0 8px;
          }

          .side-nav span {
            display: none;
          }

          .side-logout {
            display: none;
          }

          .dashboard-main {
            width: 100%;
            margin-left: 0;
            padding: 0 12px 25px;
          }

          .dashboard-header {
            min-height: 125px;
            padding: 17px 65px 17px 8px;
          }

          .header-actions {
            right: 0;
            top: 21px;
          }

          .profile-name,
          .profile-chevron {
            display: none;
          }

          .profile-pill {
            padding: 4px;
          }

          .dashboard-content {
            padding-top: 14px;
          }

          .setting-panel {
            padding: 16px;
          }

          .exercise-setting-card {
            padding: 18px 14px;
          }

          .tips-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 460px) {
          .dashboard-header h1 {
            font-size: 24px;
          }

          .dashboard-header p {
            font-size: 10px;
          }

          .panel {
            padding: 16px;
            border-radius: 15px;
          }

          .panel-heading h2,
          .section-heading h2 {
            font-size: 16px;
          }

          .exercise-visual h3 {
            font-size: 22px;
          }

          .exercise-visual h3 small {
            display: block;
            margin: 2px 0 0;
          }

          .setting-actions {
            grid-template-columns: 1fr;
          }

          .target-input-wrap input {
            width: 125px;
          }

          .target-helper {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}