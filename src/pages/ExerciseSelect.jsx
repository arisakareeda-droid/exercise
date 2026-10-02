import React from "react";
import { useNavigate } from "react-router-dom";

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const exercises = [
    {
      id: "squat",
      icon: "🏋️",
      name: "Squat",
      thaiName: "สควอท",
      video: "/squats.mp4",
      description: "บริหารกล้ามเนื้อต้นขา สะโพก และแกนกลางลำตัว",
      color: "#4b9af5",
      light: "#eaf4ff",
      shadow: "rgba(24,119,242,.18)",
    },
    {
      id: "jumping_jack",
      icon: "🤸",
      name: "Jumping Jack",
      thaiName: "กระโดดตบ",
      video: "/jumping_jack.mp4",
      description: "เพิ่มอัตราการเต้นของหัวใจและช่วยเผาผลาญพลังงาน",
      color: "#4b9af5",
      light: "#eaf4ff",
      shadow: "rgba(24,119,242,.18)",
    },
  ];

  return (
    <div className="dashboard-page">
      {/* Sidebar — รูปแบบเดียวกับ Dashboard */}
      <aside className="dashboard-sidebar">
        <div className="brand-block">
          <button
            className="brand-button"
            type="button"
            onClick={() => navigate("/")}
            aria-label="กลับหน้าหลัก FitTrack"
          >
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <defs>
                  <linearGradient id="boltGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7d5cff" />
                    <stop offset="100%" stopColor="#1877f2" />
                  </linearGradient>
                </defs>
                <path
                  d="M18.7 2.5 7 17.3h8.1l-1.5 12.2L25 14.2h-8.5l2.2-11.7Z"
                  fill="url(#boltGradient)"
                />
              </svg>
            </div>
            <div>
              <div className="brand-name">FitTrack</div>
              <div className="brand-tagline">Healthy Today</div>
            </div>
          </button>
        </div>

        <nav className="sidebar-nav">
          <button className="side-nav" type="button" onClick={() => navigate("/")}>
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

          <button className="side-nav" type="button" onClick={() => navigate("/history")}>
            <span>◷</span>
            <b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="side-logout" type="button">
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="dashboard-main">
        {/* Header — รูปแบบเดียวกับ Dashboard */}
        <header className="dashboard-header">
          <div className="header-copy">
            <div className="logo">FITTRACK</div>
            <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
            <p>เลือกท่าออกกำลังกาย · AI ตรวจจับท่าทาง · นับจำนวนครั้งอัตโนมัติ</p>
          </div>

          <div className="header-actions">
            <button
              className="profile-pill"
              type="button"
              onClick={() => navigate("/profile")}
              title="โปรไฟล์ของฉัน"
            >
              <div className="profile-avatar">P</div>
              <span className="profile-name">โปรไฟล์</span>
              <span className="profile-chevron">›</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content exercise-content">
          {/* Intro */}
          <section className="panel intro-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">💪</div>
              <div>
                <h2>เลือกท่าออกกำลังกาย</h2>
                <span>เลือกท่าที่ต้องการเพื่อเริ่มการออกกำลังกาย</span>
              </div>
            </div>

            <div className="intro-copy">
              <div>
                <strong>เริ่มต้นการออกกำลังกายของคุณ</strong>
                <p>
                  ระบบจะใช้ AI ตรวจจับท่าทางผ่านกล้อง
                  พร้อมนับจำนวนครั้งให้อัตโนมัติ เพื่อช่วยให้คุณออกกำลังกายได้อย่างถูกต้อง
                </p>
              </div>
              <span className="intro-badge">AI POWERED</span>
            </div>
          </section>

          {/* Exercise Cards */}
          <section className="exercise-grid">
            {exercises.map((exercise) => (
              <article className="panel exercise-card" key={exercise.id}>
                <div className="exercise-card-heading">
                  <div
                    className="exercise-icon"
                    style={{
                      background: exercise.light,
                      borderColor: "#d7e9fb",
                    }}
                  >
                    {exercise.icon}
                  </div>

                  <div className="exercise-title">
                    <h2>{exercise.name}</h2>
                    <span>{exercise.thaiName}</span>
                  </div>

                  <span className="exercise-chip">AI</span>
                </div>

                <div
                  className="video-wrapper"
                  style={{ boxShadow: `0 12px 30px ${exercise.shadow}` }}
                >
                  <video autoPlay loop muted playsInline className="exercise-video">
                    <source src={exercise.video} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>

                  <div className="video-top-label">
                    <span className="live-dot"></span>
                    AI Exercise
                  </div>
                </div>

                <p className="exercise-description">{exercise.description}</p>

                <div className="ai-status">
                  <span
                    className="status-dot"
                    style={{
                      background: exercise.color,
                      boxShadow: `0 0 9px ${exercise.color}`,
                    }}
                  />
                  <span>รองรับการตรวจจับท่าทางด้วย AI</span>
                </div>

                <button
                  type="button"
                  className="select-button"
                  onClick={() => navigate(`/settings?exercise=${exercise.id}`)}
                >
                  <span>เลือกท่านี้</span>
                  <span className="select-arrow">›</span>
                </button>
              </article>
            ))}
          </section>

          {/* AI information */}
          <section className="panel ai-info-panel">
            <div className="panel-icon purple">🤖</div>
            <div>
              <h2>ระบบตรวจจับการออกกำลังกายด้วย AI</h2>
              <p>
                FitTrack ใช้เทคโนโลยี AI ในการตรวจจับท่าทางผ่านกล้อง
                พร้อมนับจำนวนครั้งของการออกกำลังกายโดยอัตโนมัติ
              </p>
            </div>
            <div className="ai-info-pill">SMART WORKOUT</div>
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

        button, input { font-family: inherit; }

        .dashboard-page {
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
        }

        /* SIDEBAR */
        .dashboard-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 232px;
          padding: 31px 18px 24px;
          display: flex;
          flex-direction: column;
          z-index: 20;
          background: rgba(255,255,255,.93);
          border-right: 0;
          box-shadow: 8px 0 30px rgba(35,82,137,.045);
          backdrop-filter: blur(18px);
        }

        .brand-block {
          padding: 0 10px 30px;
        }

        .brand-button {
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

        .brand-mark {
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

        .brand-mark svg {
          width: 27px;
          height: 27px;
          display: block;
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

        /* MAIN */
        .dashboard-main {
          width: calc(100% - 232px);
          margin-left: 232px;
          min-width: 0;
          padding: 0 31px 36px;
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
          background: linear-gradient(90deg, #11396f 0%, #1877f2 48%, #2f68bd 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: titleWink 3.6s ease-in-out infinite;
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
          font-size: 11px;
        }

        .profile-name {
          font-size: 11px;
          font-weight: 600;
        }

        .profile-chevron {
          color: #6d8aab;
          font-size: 19px;
        }

        /* CONTENT */
        .dashboard-content {
          max-width: 1230px;
          margin: 0 auto;
          padding-top: 20px;
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

        .panel-heading {
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

        .panel-icon.purple {
          background: linear-gradient(145deg, #8b6ff7, #5f3bd8);
          box-shadow: 0 8px 17px rgba(95,59,216,.18);
        }

        .panel-heading h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
        }

        .panel-heading span {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 9.5px;
          line-height: 1.4;
        }

        .intro-panel {
          margin-bottom: 18px;
        }

        .intro-copy {
          min-height: 68px;
          padding: 13px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border: 1px solid #e1ebf5;
          border-radius: 15px;
          background: linear-gradient(145deg, #f9fcff, #f3f8fd);
        }

        .intro-copy strong {
          color: #244f87;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          font-weight: 600;
        }

        .intro-copy p {
          margin: 4px 0 0;
          color: #7b91aa;
          font-size: 10px;
          line-height: 1.6;
        }

        .intro-badge {
          flex: 0 0 auto;
          padding: 7px 11px;
          border-radius: 999px;
          color: #3175c5;
          background: #eaf3ff;
          border: 1px solid #d8e9fb;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .7px;
        }

        .exercise-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .exercise-card {
          padding: 18px;
        }

        .exercise-card-heading {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 14px;
        }

        .exercise-icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          flex: 0 0 48px;
          border: 1px solid;
          border-radius: 14px;
          font-size: 24px;
        }

        .exercise-title {
          min-width: 0;
        }

        .exercise-title h2 {
          margin: 0;
          color: #173f79;
          font-family: "Kanit", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.2;
        }

        .exercise-title span {
          display: block;
          margin-top: 3px;
          color: #4b87c8;
          font-size: 10px;
          font-weight: 600;
        }

        .exercise-chip {
          margin-left: auto;
          padding: 5px 8px;
          border-radius: 999px;
          color: #3175c5;
          background: #eaf3ff;
          border: 1px solid #d8e9fb;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .7px;
        }

        .video-wrapper {
          position: relative;
          width: 100%;
          height: 245px;
          border-radius: 15px;
          overflow: hidden;
          background: #eaf1f8;
          border: 1px solid #dce8f4;
          margin-bottom: 14px;
        }

        .exercise-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .video-top-label {
          position: absolute;
          top: 10px;
          left: 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 9px;
          border-radius: 999px;
          color: #fff;
          background: rgba(18,60,120,.78);
          backdrop-filter: blur(7px);
          font-size: 8px;
          font-weight: 600;
          letter-spacing: .3px;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4bd68b;
          box-shadow: 0 0 7px rgba(75,214,139,.75);
        }

        .exercise-description {
          min-height: 38px;
          margin: 0 0 11px;
          color: #66809e;
          font-size: 10.5px;
          line-height: 1.65;
        }

        .ai-status {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 13px;
          color: #8195aa;
          font-size: 9px;
        }

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
        }

        .select-button {
          width: 100%;
          min-height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 18px rgba(24,119,242,.17);
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          transition: .2s ease;
        }

        .select-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 25px rgba(24,119,242,.22);
        }

        .select-button:active {
          transform: translateY(1px) scale(.99);
        }

        .select-arrow {
          font-size: 20px;
          line-height: 1;
        }

        .ai-info-panel {
          margin-top: 18px;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .ai-info-panel h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 600;
        }

        .ai-info-panel p {
          margin: 4px 0 0;
          color: #7b91aa;
          font-size: 9.5px;
          line-height: 1.6;
        }

        .ai-info-pill {
          margin-left: auto;
          flex: 0 0 auto;
          padding: 7px 10px;
          border-radius: 999px;
          color: #6544c9;
          background: #f0ebff;
          border: 1px solid #dfd5ff;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .6px;
        }

        @keyframes titleWink {
          0%, 65%, 100% { background-position: 0% 50%; }
          78% { background-position: 100% 50%; }
        }

        @media (max-width: 1050px) {
          .dashboard-sidebar {
            width: 200px;
          }

          .dashboard-main {
            width: calc(100% - 200px);
            margin-left: 200px;
            padding: 0 20px 30px;
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

          .exercise-grid {
            grid-template-columns: 1fr;
          }

          .video-wrapper {
            height: 220px;
          }

          .intro-copy {
            align-items: flex-start;
            flex-direction: column;
          }

          .ai-info-panel {
            align-items: flex-start;
          }

          .ai-info-pill {
            display: none;
          }

          .dashboard-header h1 {
            font-size: 28px;
          }
        }
      `}</style>
    </div>
  );
}
