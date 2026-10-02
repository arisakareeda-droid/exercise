import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- ค่าคงที่สำหรับกรองสัญญาณรบกวน / กันนับผิด ---
const SMOOTHING_WINDOW = 5;
const STABLE_FRAMES_SQUAT = 4;
const ARM_SMOOTHING_WINDOW = 3;
const ARM_UP_THRESHOLD = 0.10;
const ARM_DOWN_THRESHOLD = -0.05;
const REP_COOLDOWN_MS = 600;
const MIN_VISIBILITY = 0.65;

// HIGH KNEES: lift = (hip.y - knee.y) / ความยาวลำตัว  (0 = เข่าระดับสะโพก)
const HK_UP_THRESHOLD = -0.2;
const HK_DOWN_THRESHOLD = -0.5;
const HK_LEG_COOLDOWN_MS = 350;

export default function ExerciseSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState("เตรียมตัวให้พร้อม");
  const stageRef = useRef("up");
  const hkStageRef = useRef({ L: "down", R: "down" });
  const hkLastRef = useRef({ L: 0, R: 0 });

  const calculateAngle = (a, b, c) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) -
      Math.atan2(a.y - b.y, a.x - b.x);

    let angle = Math.abs((radians * 180.0) / Math.PI);

    if (angle > 180.0) angle = 360 - angle;

    return angle;
  };

  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      if (!canvasRef.current) return;

      const canvasCtx = canvasRef.current.getContext('2d');

      canvasCtx.save();
      canvasCtx.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );

      canvasCtx.drawImage(
        results.image,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );

      if (results.poseLandmarks) {
        drawConnectors(
          canvasCtx,
          results.poseLandmarks,
          POSE_CONNECTIONS,
          { color: '#00FF00', lineWidth: 4 }
        );

        drawLandmarks(
          canvasCtx,
          results.poseLandmarks,
          { color: '#FF0000', lineWidth: 2 }
        );

        const lm = results.poseLandmarks;

        // --- เงื่อนไขท่า SQUAT ---
        if (exerciseType === "squat") {
          const hip = lm[23],
            knee = lm[25],
            ankle = lm[27];

          if (hip && knee && ankle) {
            const angle = calculateAngle(
              hip,
              knee,
              ankle
            );

            if (angle > 160) {
              stageRef.current = "up";
              setFeedback("ยืนตัวตรง");
            }

            if (
              angle < 90 &&
              stageRef.current === "up"
            ) {
              stageRef.current = "down";
              setCounter((prev) => prev + 1);
              setFeedback("ยอดเยี่ยม! ดันตัวขึ้น");
            }
          }
        }

        // --- เงื่อนไขท่า HIGH KNEES ---
        else if (exerciseType === "high_knees") {
          const shoulderMid = lm[11] && lm[12] ? (lm[11].y + lm[12].y) / 2 : null;
          const hipMid = lm[23] && lm[24] ? (lm[23].y + lm[24].y) / 2 : null;
          const torso =
            shoulderMid !== null && hipMid !== null && Math.abs(hipMid - shoulderMid) > 0.05
              ? Math.abs(hipMid - shoulderMid)
              : 0.3;

          const legs = [
            { side: "L", hip: lm[23], knee: lm[25] },
            { side: "R", hip: lm[24], knee: lm[26] },
          ];

          legs.forEach(({ side, hip, knee }) => {
            if (!hip || !knee) return;
            if ((hip.visibility ?? 1) < 0.4 || (knee.visibility ?? 1) < 0.4) return;

            const lift = (hip.y - knee.y) / torso;
            const stage = hkStageRef.current[side];

            if (stage === "down" && lift > HK_UP_THRESHOLD) {
              hkStageRef.current[side] = "up";
              const now = Date.now();
              if (now - hkLastRef.current[side] >= HK_LEG_COOLDOWN_MS) {
                hkLastRef.current[side] = now;
                setCounter((prev) => prev + 1);
                setFeedback("ยอดเยี่ยม! ยกเข่าอีกข้าง");
              }
            } else if (stage === "up" && lift < HK_DOWN_THRESHOLD) {
              hkStageRef.current[side] = "down";
            }
          });
        }

        // --- เงื่อนไขท่า JUMPING JACK ---
        else if (exerciseType === "jumping_jack") {
          const shoulderL = lm[11],
            wristL = lm[15];

          if (shoulderL && wristL) {
            if (wristL.y > shoulderL.y) {
              stageRef.current = "down";
              setFeedback("กางแขนและขาออก");
            }

            if (
              wristL.y < shoulderL.y &&
              stageRef.current === "down"
            ) {
              stageRef.current = "up";
              setCounter((prev) => prev + 1);
              setFeedback("ยอดเยี่ยม!");
            }
          }
        }
      }

      canvasCtx.restore();
    });

    let camera = null;

    if (webcamRef.current) {
      camera = new Camera(webcamRef.current, {
        onFrame: async () => {
          if (webcamRef.current) {
            await pose.send({
              image: webcamRef.current,
            });
          }
        },
        width: 640,
        height: 480,
      });

      camera.start();
    }

    return () => {
      if (camera) camera.stop();
      pose.close();
    };
  }, [exerciseType]);

  const exerciseNames = {
    squat: "Squat (ลุกนั่ง)",
    jumping_jack: "Jumping Jack (กระโดดตบ)",
    high_knees: "High Knees (ยกเข่าสูง)",
  };
  const exerciseName = exerciseNames[exerciseType] || exerciseNames.squat;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #eef4fb;
          color: #173b73;
          font-family: "Anuphan", sans-serif;
        }
        button { font-family: inherit; }

        .session-page {
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          display: flex;
          overflow-x: hidden;
          color: #173b73;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
        }
        .session-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 20;
          width: 232px;
          min-height: 100vh;
          padding: 31px 18px 24px;
          display: flex;
          flex-direction: column;
          background: rgba(255,255,255,.94);
          backdrop-filter: blur(18px);
        }
        .session-brand { padding: 0 10px 30px; }
        .session-brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .session-brand-mark {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: linear-gradient(145deg, #5b9cf6, #1769dc);
          box-shadow: 0 9px 20px rgba(24,119,242,.22);
        }
        .session-brand-mark svg { width: 27px; height: 27px; }
        .session-brand-name {
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 21px;
          font-weight: 600;
          line-height: 1.1;
        }
        .session-brand-tagline {
          margin-top: 3px;
          color: #8aa0b9;
          font-size: 9px;
          letter-spacing: .5px;
        }
        .session-nav { display: flex; flex-direction: column; gap: 8px; }
        .session-nav-item {
          width: 100%;
          min-height: 51px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 0;
          border-radius: 15px;
          color: #5c7594;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 13px;
          transition: .2s ease;
        }
        .session-nav-item span {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #4376b8;
          background: #edf5ff;
          font-size: 16px;
        }
        .session-nav-item:hover, .session-nav-item.active {
          color: #1558a9;
          background: #e7f1ff;
        }
        .session-nav-item.active span {
          color: white;
          background: linear-gradient(145deg, #4d97f5, #1769dc);
          box-shadow: 0 5px 12px rgba(24,119,242,.2);
        }
        .session-logout {
          margin-top: auto;
          padding: 12px 14px;
          border: 0;
          color: #69809a;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 11px;
        }
        .session-logout span { margin-right: 9px; color: #3b79c5; font-size: 17px; }

        .session-main {
          width: calc(100% - 232px);
          max-width: calc(100% - 232px);
          min-width: 0;
          margin-left: 232px;
          padding: 0 31px 36px;
        }
        .session-header {
          min-height: 150px;
          padding: 26px 10px 21px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #dfe9f4;
        }
        .session-header-copy { text-align: center; }
        .session-logo {
          margin-bottom: 2px;
          color: #2b7eea;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2px;
        }
        .session-header h1 {
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
        .session-header p {
          margin: 5px 0 0;
          color: #68809f;
          font-size: 13px;
        }
        .session-back {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          min-height: 40px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #d8e9fb;
          border-radius: 12px;
          color: #3175c5;
          background: #fff;
          box-shadow: 0 6px 16px rgba(28,75,125,.06);
          cursor: pointer;
          font-size: 11px;
          transition: .2s ease;
        }
        .session-back:hover {
          transform: translateY(calc(-50% - 2px));
          border-color: #a9c9ee;
          box-shadow: 0 9px 20px rgba(24,119,242,.12);
        }
        .session-profile {
          position: absolute;
          right: 0;
          top: 33px;
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
        }
        .session-profile-avatar {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(145deg, #4f99f6, #1769dc);
          font-size: 11px;
          font-weight: 700;
        }
        .session-profile-label { font-size: 11px; font-weight: 600; }
        .session-profile-arrow { color: #6d8aab; font-size: 19px; }

        .session-content {
          width: 100%;
          max-width: 1230px;
          min-width: 0;
          margin: 0 auto;
          padding-top: 22px;
        }
        .session-card {
          position: relative;
          min-width: 0;
          padding: 22px;
          overflow: hidden;
          border: 1px solid #dbe8f5;
          border-radius: 20px;
          background: rgba(255,255,255,.95);
          box-shadow: 0 10px 28px rgba(35,82,137,.065);
        }
        .session-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, #1877f2, #74b3ff, transparent);
        }
        .session-card-heading {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 17px;
        }
        .session-heading-icon {
          width: 43px;
          height: 43px;
          flex: 0 0 43px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 17px rgba(24,119,242,.19);
          font-size: 19px;
        }
        .session-card-heading h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 19px;
          font-weight: 600;
          line-height: 1.3;
        }
        .session-card-heading p {
          margin: 2px 0 0;
          color: #8095ad;
          font-size: 10px;
        }
        .session-live-badge {
          margin-left: auto;
          padding: 7px 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #cceedd;
          border-radius: 999px;
          color: #198653;
          background: #e9f9f0;
          font-size: 10px;
          white-space: nowrap;
        }
        .session-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #27b46e;
          box-shadow: 0 0 0 3px rgba(39,180,110,.12);
        }
        .session-stats {
          display: grid;
          grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
          gap: 13px;
          margin-bottom: 17px;
        }
        .session-stat {
          min-width: 0;
          min-height: 103px;
          padding: 14px 17px;
          border: 1px solid #e1ebf5;
          border-radius: 15px;
          background: linear-gradient(145deg, #f9fcff, #f3f8fd);
          text-align: left;
        }
        .session-stat-label {
          color: #68809f;
          font-size: 11px;
          font-weight: 600;
        }
        .session-count {
          display: block;
          margin-top: 1px;
          color: #1769dc;
          font-family: "Kanit", sans-serif;
          font-size: 37px;
          font-weight: 600;
          line-height: 1.25;
        }
        .session-feedback {
          display: block;
          margin-top: 8px;
          color: #168653;
          font-family: "Kanit", sans-serif;
          font-size: 17px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .session-camera-frame {
          width: 100%;
          padding: 9px;
          border: 1px solid #dce9f7;
          border-radius: 17px;
          background: linear-gradient(145deg, #f5faff, #edf5ff);
        }
        .session-camera-top {
          padding: 2px 4px 9px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #7690af;
          font-size: 9px;
          letter-spacing: .8px;
        }
        .session-camera-top strong { color: #377dcf; font-size: 9px; letter-spacing: 1px; }
        .session-canvas {
          display: block;
          width: 100%;
          max-width: 800px;
          height: auto;
          margin: 0 auto;
          border: 1px solid #d8e7f7;
          border-radius: 12px;
          background: #071426;
          box-shadow: 0 7px 20px rgba(23,59,115,.12);
        }
        .session-tip {
          margin-top: 15px;
          padding: 12px 15px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid #dce9f7;
          border-radius: 13px;
          background: #f6faff;
          color: #718ba8;
          font-size: 10px;
          line-height: 1.65;
        }
        .session-tip-icon {
          width: 25px;
          height: 25px;
          flex: 0 0 25px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: #2878d7;
          background: #e4f0ff;
          font-size: 13px;
        }
        .session-tip strong { color: #315f96; }
        @media (max-width: 1050px) {
          .session-sidebar { width: 200px; }
          .session-main {
            width: calc(100% - 200px);
            max-width: calc(100% - 200px);
            margin-left: 200px;
            padding: 0 20px 30px;
          }
          .session-back { position: static; transform: none; }
          .session-back:hover { transform: translateY(-2px); }
          .session-header { justify-content: center; gap: 10px; flex-wrap: wrap; }
        }
        @media (max-width: 760px) {
          .session-page { display: block; }
          .session-sidebar {
            position: static;
            width: 100%;
            min-height: 0;
            padding: 12px;
          }
          .session-brand { padding: 4px 8px 12px; }
          .session-nav { flex-direction: row; }
          .session-nav-item { justify-content: center; min-height: 43px; padding: 0 8px; }
          .session-nav-item span { display: none; }
          .session-logout { display: none; }
          .session-main {
            width: 100%;
            max-width: 100%;
            margin-left: 0;
            padding: 0 12px 25px;
          }
          .session-header {
            min-height: 125px;
            padding: 17px 8px;
            flex-direction: column;
            gap: 8px;
          }
          .session-header h1 { font-size: 28px; }
          .session-back, .session-profile { position: static; transform: none; }
          .session-back:hover { transform: translateY(-2px); }
          .session-profile { position: absolute; right: 0; top: 12px; padding: 3px; }
          .session-profile-label, .session-profile-arrow { display: none; }
          .session-card { padding: 15px; }
          .session-stats { grid-template-columns: 1fr 1fr; gap: 9px; }
          .session-stat { padding: 12px; }
          .session-count { font-size: 31px; }
          .session-feedback { font-size: 14px; }
        }
        @media (max-width: 420px) {
          .session-card-heading h2 { font-size: 16px; }
          .session-live-badge { padding: 6px 8px; font-size: 9px; }
          .session-stat-label { font-size: 10px; }
          .session-feedback { font-size: 12px; }
          .session-camera-frame { padding: 6px; }
        }
      `}</style>

      <div className="session-page">
        <aside className="session-sidebar">
          <div className="session-brand">
            <button className="session-brand-link" type="button" onClick={() => navigate('/')}>
              <div className="session-brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32">
                  <path
                    d="M18.7 2.5 7 17.3h8.1l-1.5 12.2L25 14.2h-8.5l2.2-11.7Z"
                    fill="#a36bff"
                  />
                </svg>
              </div>
              <div>
                <div className="session-brand-name">FitTrack</div>
                <div className="session-brand-tagline">Healthy Today</div>
              </div>
            </button>
          </div>
          <nav className="session-nav">
            <button className="session-nav-item" type="button" onClick={() => navigate('/')}>
              <span>⌂</span><b>หน้าหลัก</b>
            </button>
            <button className="session-nav-item active" type="button" onClick={() => navigate('/exercises')}>
              <span>✦</span><b>ออกกำลังกาย</b>
            </button>
            <button className="session-nav-item" type="button" onClick={() => navigate('/history')}>
              <span>◷</span><b>ประวัติการใช้งาน</b>
            </button>
          </nav>
          <button className="session-logout" type="button" onClick={() => navigate('/login')}>
            <span>↪</span> ออกจากระบบ
          </button>
        </aside>

        <main className="session-main">
          <header className="session-header">
            <button className="session-back" type="button" onClick={() => navigate('/exercises')}>
              <span>←</span> กลับหน้าเลือกท่า
            </button>
            <div className="session-header-copy">
              <div className="session-logo">FITTRACK</div>
              <h1>กำลังออกกำลังกาย</h1>
              <p>ติดตามการเคลื่อนไหว · ตรวจจับท่าทางด้วย AI</p>
            </div>
            <button className="session-profile" type="button" onClick={() => navigate('/profile')}>
              <span className="session-profile-avatar">P</span>
              <span className="session-profile-label">โปรไฟล์</span>
              <span className="session-profile-arrow">›</span>
            </button>
          </header>

          <div className="session-content">
            <section className="session-card">
              <div className="session-card-heading">
                <div className="session-heading-icon">✦</div>
                <div>
                  <h2>{exerciseName}</h2>
                  <p>ระบบตรวจจับและนับจำนวนครั้งอัตโนมัติ</p>
                </div>
                <span className="session-live-badge"><i className="session-live-dot" /> กำลังทำงาน</span>
              </div>

              <div className="session-stats">
                <div className="session-stat">
                  <div className="session-stat-label">จำนวนครั้ง</div>
                  <strong className="session-count">{counter}</strong>
                </div>
                <div className="session-stat">
                  <div className="session-stat-label">คำแนะนำ</div>
                  <strong className="session-feedback">{feedback}</strong>
                </div>
              </div>

              <video ref={webcamRef} playsInline style={{ display: 'none' }} />

              <div className="session-camera-frame">
                <div className="session-camera-top">
                  <span>AI POSE DETECTION</span>
                  <strong>CAMERA VIEW</strong>
                </div>
                <canvas
                  ref={canvasRef}
                  width="640"
                  height="480"
                  className="session-canvas"
                />
              </div>

              <div className="session-tip">
                <span className="session-tip-icon">ⓘ</span>
                <div>
                  <strong>คำแนะนำ:</strong> จัดตำแหน่งร่างกายให้อยู่ในกรอบกล้อง และออกกำลังกายในบริเวณที่มีแสงสว่างเพียงพอ เพื่อช่วยให้ระบบตรวจจับท่าทางได้
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}