import React from "react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="dashboard-page">

      <div className="dashboard-container">

        {/* Header */}
        <header className="dashboard-header">

          <div className="logo">
            FITTRACK
          </div>

          <div className="welcome-icon">
            🏃
          </div>

          <h1>
            ยินดีต้อนรับสู่ FitTrack
          </h1>

          <p>
            ระบบออกกำลังกายอัจฉริยะ
            <br />
            ช่วยติดตามและนับจำนวนครั้งด้วย AI
          </p>

        </header>


        {/* Main Card */}
        <div className="main-card">

          <div className="card-title">
            <span>เริ่มต้นการออกกำลังกาย</span>
          </div>

          <p className="card-description">
            เลือกเมนูที่คุณต้องการใช้งาน
          </p>


          {/* Menu */}
          <div className="menu-grid">

            {/* Exercise */}
            <button
              className="menu-card exercise-menu"
              onClick={() => navigate("/exercises")}
            >

              <div className="menu-icon">
                🤸
              </div>

              <div className="menu-content">
                <h2>เลือกท่าออกกำลังกาย</h2>

                <p>
                  เลือกท่ากระโดดตบหรือสควอท
                  <br />
                  พร้อมระบบ AI ตรวจจับท่าทาง
                </p>
              </div>

              <div className="arrow">
                →
              </div>

            </button>


            {/* History */}
            <button
              className="menu-card history-menu"
              onClick={() => navigate("/history")}
            >

              <div className="menu-icon">
                📊
              </div>

              <div className="menu-content">
                <h2>ประวัติการออกกำลังกาย</h2>

                <p>
                  ดูผลการออกกำลังกายที่ผ่านมา
                  <br />
                  และติดตามความก้าวหน้า
                </p>
              </div>

              <div className="arrow">
                →
              </div>

            </button>

          </div>


          {/* Quick Info */}
          <div className="info-section">

            <div className="info-item">

              <div className="info-icon">
                🤖
              </div>

              <div>
                <strong>AI Detection</strong>
                <span>ตรวจจับท่าทางแบบ Real-time</span>
              </div>

            </div>


            <div className="info-item">

              <div className="info-icon">
                🔢
              </div>

              <div>
                <strong>นับจำนวนครั้ง</strong>
                <span>ระบบนับ Reps อัตโนมัติ</span>
              </div>

            </div>


            <div className="info-item">

              <div className="info-icon">
                📈
              </div>

              <div>
                <strong>ติดตามผล</strong>
                <span>บันทึกประวัติการออกกำลังกาย</span>
              </div>

            </div>

          </div>

        </div>


        {/* Footer */}
        <footer className="dashboard-footer">
          <p>FITTRACK • Smart Exercise System</p>
        </footer>

      </div>


      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            Tahoma,
            sans-serif;
        }


        /* =========================
           Page
        ========================= */

        .dashboard-page {
          min-height: 100vh;

          background:
            radial-gradient(
              circle at top right,
              rgba(34, 197, 94, 0.10),
              transparent 35%
            ),
            linear-gradient(
              135deg,
              #0f1115 0%,
              #15171d 50%,
              #101216 100%
            );

          color: white;

          padding: 45px 20px;

          display: flex;
          justify-content: center;
        }


        .dashboard-container {
          width: 100%;
          max-width: 900px;
        }


        /* =========================
           Header
        ========================= */

        .dashboard-header {
          text-align: center;
          margin-bottom: 32px;
        }


        .logo {
          display: inline-block;

          margin-bottom: 18px;

          color: #22c55e;

          font-size: 15px;
          font-weight: 800;

          letter-spacing: 4px;
        }


        .welcome-icon {
          width: 68px;
          height: 68px;

          margin: 0 auto 18px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          background: rgba(34, 197, 94, 0.10);

          border: 1px solid rgba(34, 197, 94, 0.30);

          font-size: 34px;

          box-shadow:
            0 0 30px rgba(34, 197, 94, 0.08);
        }


        .dashboard-header h1 {
          margin: 0;

          font-size: 34px;
          font-weight: 700;

          color: #ffffff;
        }


        .dashboard-header p {
          margin: 12px 0 0;

          color: #9ca3af;

          font-size: 17px;

          line-height: 1.7;
        }


        /* =========================
           Main Card
        ========================= */

        .main-card {
          padding: 32px;

          background: rgba(29, 31, 31, 0.92);

          border: 1px solid #333636;

          border-radius: 18px;

          box-shadow:
            0 20px 60px rgba(0, 0, 0, 0.30);
        }


        .card-title {
          text-align: center;

          font-size: 22px;
          font-weight: 700;

          color: #ffffff;
        }


        .card-description {
          text-align: center;

          margin: 8px 0 25px;

          color: #8f969f;

          font-size: 15px;
        }


        /* =========================
           Menu Grid
        ========================= */

        .menu-grid {
          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 18px;
        }


        .menu-card {
          position: relative;

          display: flex;
          align-items: center;

          gap: 17px;

          width: 100%;

          padding: 25px 22px;

          text-align: left;

          border-radius: 14px;

          cursor: pointer;

          color: white;

          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease;
        }


        .exercise-menu {
          background:
            linear-gradient(
              135deg,
              rgba(34, 197, 94, 0.13),
              rgba(29, 31, 31, 0.95)
            );

          border: 1px solid rgba(34, 197, 94, 0.35);
        }


        .history-menu {
          background:
            linear-gradient(
              135deg,
              rgba(59, 130, 246, 0.10),
              rgba(29, 31, 31, 0.95)
            );

          border: 1px solid rgba(59, 130, 246, 0.25);
        }


        .menu-card:hover {
          transform: translateY(-3px);
        }


        .exercise-menu:hover {
          border-color: #22c55e;

          background:
            linear-gradient(
              135deg,
              rgba(34, 197, 94, 0.18),
              rgba(29, 31, 31, 1)
            );
        }


        .history-menu:hover {
          border-color: #3b82f6;

          background:
            linear-gradient(
              135deg,
              rgba(59, 130, 246, 0.15),
              rgba(29, 31, 31, 1)
            );
        }


        /* =========================
           Menu Icon
        ========================= */

        .menu-icon {
          flex-shrink: 0;

          width: 58px;
          height: 58px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 13px;

          font-size: 29px;
        }


        .exercise-menu .menu-icon {
          background: rgba(34, 197, 94, 0.13);
        }


        .history-menu .menu-icon {
          background: rgba(59, 130, 246, 0.12);
        }


        /* =========================
           Menu Content
        ========================= */

        .menu-content {
          flex: 1;
        }


        .menu-content h2 {
          margin: 0;

          font-size: 18px;
          font-weight: 700;

          color: #ffffff;
        }


        .menu-content p {
          margin: 7px 0 0;

          color: #9ca3af;

          font-size: 13px;

          line-height: 1.6;
        }


        .arrow {
          flex-shrink: 0;

          font-size: 25px;

          color: #6b7280;

          transition:
            transform 0.2s ease,
            color 0.2s ease;
        }


        .menu-card:hover .arrow {
          transform: translateX(4px);

          color: #22c55e;
        }


        /* =========================
           Info Section
        ========================= */

        .info-section {
          display: grid;

          grid-template-columns: repeat(3, 1fr);

          gap: 12px;

          margin-top: 25px;

          padding-top: 24px;

          border-top: 1px solid #303333;
        }


        .info-item {
          display: flex;

          align-items: center;

          gap: 10px;

          padding: 13px;

          background: #181a1a;

          border-radius: 10px;
        }


        .info-icon {
          font-size: 22px;
        }


        .info-item strong {
          display: block;

          color: #d7d9dc;

          font-size: 13px;

          margin-bottom: 3px;
        }


        .info-item span {
          display: block;

          color: #747b84;

          font-size: 11px;
        }


        /* =========================
           Footer
        ========================= */

        .dashboard-footer {
          text-align: center;

          margin-top: 25px;
        }


        .dashboard-footer p {
          margin: 0;

          color: #555b63;

          font-size: 12px;

          letter-spacing: 1px;
        }


        /* =========================
           Tablet
        ========================= */

        @media (max-width: 750px) {

          .dashboard-page {
            padding: 35px 16px;
          }


          .dashboard-header h1 {
            font-size: 29px;
          }


          .main-card {
            padding: 24px;
          }


          .menu-grid {
            grid-template-columns: 1fr;
          }


          .info-section {
            grid-template-columns: 1fr;
          }

        }


        /* =========================
           Mobile
        ========================= */

        @media (max-width: 480px) {

          .dashboard-page {
            padding: 25px 13px;
          }


          .dashboard-header {
            margin-bottom: 25px;
          }


          .logo {
            font-size: 13px;
          }


          .welcome-icon {
            width: 58px;
            height: 58px;

            font-size: 29px;
          }


          .dashboard-header h1 {
            font-size: 25px;
          }


          .dashboard-header p {
            font-size: 14px;
          }


          .main-card {
            padding: 18px;
          }


          .card-title {
            font-size: 19px;
          }


          .menu-card {
            padding: 20px 17px;
          }


          .menu-icon {
            width: 50px;
            height: 50px;

            font-size: 25px;
          }


          .menu-content h2 {
            font-size: 16px;
          }


          .menu-content p {
            font-size: 12px;
          }


          .info-section {
            margin-top: 20px;
          }

        }

      `}</style>
    </div>
  );
}