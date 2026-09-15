import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Exercise() {
  const navigate = useNavigate();

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);

  const [exerciseType, setExerciseType] = useState('jumpingJack');
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('กำลังโหลด AI...');
  const [errorMessage, setErrorMessage] = useState('');

  // ใช้สำหรับตรวจจับจังหวะ
  const stageRef = useRef('start');

  useEffect(() => {
    let isActive = true;
    let cameraStream = null;
    let animationFrameId = null;
    let poseInstance = null;

    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;

    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');

    // ================================
    // โหลด MediaPipe Pose
    // ================================

    const loadMediaPipeScript = () => {
      return new Promise((resolve, reject) => {
        if (window.Pose) {
          resolve(window.Pose);
          return;
        }

        const script = document.createElement('script');

        script.src =
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';

        script.async = true;

        script.onload = () => resolve(window.Pose);
        script.onerror = (err) => reject(err);

        document.body.appendChild(script);
      });
    };

    // ================================
    // คำนวณมุม
    // ================================

    const calculateAngle = (a, b, c) => {
      const radians =
        Math.atan2(c.y - b.y, c.x - b.x) -
        Math.atan2(a.y - b.y, a.x - b.x);

      let angle = Math.abs(radians * (180 / Math.PI));

      if (angle > 180) {
        angle = 360 - angle;
      }

      return angle;
    };

    // ================================
    // เริ่มต้น AI
    // ================================

    async function initPose() {
      try {
        const PoseConstructor =
          await loadMediaPipeScript();

        if (!isActive) return;

        poseInstance = new PoseConstructor({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // ================================
        // รับผลจาก AI
        // ================================

        poseInstance.onResults((results) => {
          if (!isActive) return;

          canvasCtx.save();

          canvasCtx.clearRect(
            0,
            0,
            canvasElement.width,
            canvasElement.height
          );

          // วาดภาพจากกล้อง
          if (results.image) {
            canvasCtx.drawImage(
              results.image,
              0,
              0,
              canvasElement.width,
              canvasElement.height
            );
          }

          if (!results.poseLandmarks) {
            setExerciseStatus(
              'ไม่พบผู้ใช้งาน กรุณาถอยหลังให้เห็นเต็มตัว'
            );

            canvasCtx.restore();
            return;
          }

          const landmarks = results.poseLandmarks;

          // ================================
          // วาดจุดร่างกาย
          // ================================

          canvasCtx.fillStyle = '#00ff88';
          canvasCtx.strokeStyle = '#00ff88';
          canvasCtx.lineWidth = 3;

          landmarks.forEach((landmark) => {
            const x =
              landmark.x * canvasElement.width;

            const y =
              landmark.y * canvasElement.height;

            canvasCtx.beginPath();

            canvasCtx.arc(
              x,
              y,
              4,
              0,
              2 * Math.PI
            );

            canvasCtx.fill();
          });

          // ================================
          // จุดสำคัญของร่างกาย
          // ================================

          const nose = landmarks[0];

          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];

          const leftElbow = landmarks[13];
          const rightElbow = landmarks[14];

          const leftWrist = landmarks[15];
          const rightWrist = landmarks[16];

          const leftHip = landmarks[23];
          const rightHip = landmarks[24];

          const leftKnee = landmarks[25];
          const rightKnee = landmarks[26];

          const leftAnkle = landmarks[27];
          const rightAnkle = landmarks[28];

          // ================================
          // ท่ากระโดดตบ
          // ================================

          if (exerciseType === 'jumpingJack') {
            if (
              leftWrist &&
              rightWrist &&
              leftShoulder &&
              rightShoulder &&
              leftAnkle &&
              rightAnkle
            ) {
              const handsUp =
                leftWrist.y < leftShoulder.y &&
                rightWrist.y < rightShoulder.y;

              const handsDown =
                leftWrist.y > leftShoulder.y &&
                rightWrist.y > rightShoulder.y;

              const feetSpread =
                Math.abs(
                  leftAnkle.x - rightAnkle.x
                ) > 0.30;

              const feetClose =
                Math.abs(
                  leftAnkle.x - rightAnkle.x
                ) < 0.15;

              // หุบแขนและขา
              if (
                handsDown &&
                feetClose
              ) {
                stageRef.current = 'in';

                setExerciseStatus(
                  'เตรียมตัวกระโดดกางแขนและขา'
                );
              }

              // กางแขนและขา
              if (
                handsUp &&
                feetSpread &&
                stageRef.current === 'in'
              ) {
                stageRef.current = 'out';

                setRepCount(
                  (prev) => prev + 1
                );

                setExerciseStatus(
                  'ยอดเยี่ยม! กระโดดตบถูกต้อง'
                );
              }
            }
          }

          // ================================
          // ท่าวิดพื้น
          // ================================

          if (exerciseType === 'pushUp') {
            if (
              leftShoulder &&
              leftElbow &&
              leftWrist &&
              leftHip &&
              leftAnkle &&
              rightShoulder &&
              rightElbow &&
              rightWrist &&
              rightHip &&
              rightAnkle
            ) {
              // คำนวณมุมข้อศอก
              const leftArmAngle =
                calculateAngle(
                  leftShoulder,
                  leftElbow,
                  leftWrist
                );

              const rightArmAngle =
                calculateAngle(
                  rightShoulder,
                  rightElbow,
                  rightWrist
                );

              const armAngle =
                (leftArmAngle +
                  rightArmAngle) /
                2;

              // ตรวจสอบแนวลำตัว
              const bodyAngle =
                calculateAngle(
                  leftShoulder,
                  leftHip,
                  leftKnee
                );

              // ============================
              // ลง
              // ============================

              if (
                armAngle < 100 &&
                stageRef.current !== 'down'
              ) {
                stageRef.current = 'down';

                setExerciseStatus(
                  'ลงให้สุด แล้วเตรียมดันตัวขึ้น'
                );
              }

              // ============================
              // ขึ้น
              // ============================

              if (
                armAngle > 160 &&
                stageRef.current === 'down'
              ) {
                stageRef.current = 'up';

                setRepCount(
                  (prev) => prev + 1
                );

                setExerciseStatus(
                  'ยอดเยี่ยม! วิดพื้นสำเร็จ'
                );
              }

              // แสดงคำแนะนำเพิ่มเติม
              if (
                bodyAngle < 150 &&
                bodyAngle > 30
              ) {
                setExerciseStatus(
                  'พยายามรักษาลำตัวให้ตรง'
                );
              }
            }
          }

          canvasCtx.restore();
        });

        startCamera();
      } catch (err) {
        console.error(
          'MediaPipe Load Error:',
          err
        );

        setErrorMessage(
          'ไม่สามารถโหลดระบบ AI MediaPipe ได้'
        );
      }
    }

    // ================================
    // เปิดกล้อง
    // ================================

    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: 'user',
            width: {
              ideal: 640,
            },
            height: {
              ideal: 480,
            },
          },
        };

        cameraStream =
          await navigator.mediaDevices.getUserMedia(
            constraints
          );

        videoElement.srcObject =
          cameraStream;

        await new Promise((resolve) => {
          videoElement.onloadedmetadata =
            () => resolve();
        });

        await videoElement.play();

        setExerciseStatus(
          'พร้อมเริ่มออกกำลังกาย'
        );

        // ================================
        // ส่งภาพไป AI
        // ================================

        async function sendFrame() {
          if (!isActive) return;

          if (
            videoElement.readyState >= 2 &&
            poseInstance
          ) {
            await poseInstance.send({
              image: videoElement,
            });
          }

          animationFrameId =
            requestAnimationFrame(
              sendFrame
            );
        }

        sendFrame();
      } catch (err) {
        console.error(
          'Camera Error:',
          err
        );

        setErrorMessage(
          'ไม่สามารถเปิดใช้งานกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง'
        );
      }
    }

    initPose();

    // ================================
    // Cleanup
    // ================================

    return () => {
      isActive = false;

      if (animationFrameId) {
        cancelAnimationFrame(
          animationFrameId
        );
      }

      if (cameraStream) {
        cameraStream
          .getTracks()
          .forEach((track) =>
            track.stop()
          );
      }

      if (poseInstance) {
        poseInstance.close();
      }
    };
  }, [exerciseType]);

  // ================================
  // เปลี่ยนท่า
  // ================================

  const changeExercise = (type) => {
    setExerciseType(type);
    setRepCount(0);
    setErrorMessage('');
    setExerciseStatus(
      'กำลังเตรียมระบบ AI...'
    );
    stageRef.current =
      type === 'jumpingJack'
        ? 'in'
        : 'up';
  };

  return (
    <>
      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
        }

        .exercise-page {
          min-height: 100vh;

          padding: 25px;

          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #071f18,
              #0b2e22,
              #061510
            );

          font-family:
            "Noto Sans Thai",
            "Segoe UI",
            sans-serif;
        }

        /* =========================
           HEADER
        ========================= */

        .exercise-header {
          max-width: 1000px;

          margin:
            0 auto 22px;

          text-align: center;
        }

        .exercise-logo {
          width: 55px;
          height: 55px;

          display: flex;

          align-items: center;
          justify-content: center;

          margin: 0 auto 12px;

          border-radius: 17px;

          background:
            linear-gradient(
              135deg,
              #10b981,
              #34d399
            );

          font-size: 28px;

          box-shadow:
            0 8px 25px
            rgba(16, 185, 129, 0.25);
        }

        .exercise-header h1 {
          margin: 0;

          font-size: 30px;

          font-weight: 800;
        }

        .exercise-header p {
          margin:
            7px 0 0;

          color: #94a3b8;

          font-size: 14px;
        }

        /* =========================
           EXERCISE SELECTOR
        ========================= */

        .exercise-selector {
          max-width: 640px;

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 12px;

          margin:
            0 auto 18px;
        }

        .exercise-option {
          padding: 15px;

          border:
            1px solid #1f4035;

          border-radius: 15px;

          background:
            rgba(17, 38, 31, 0.9);

          color: #94a3b8;

          cursor: pointer;

          transition: 0.2s;

          text-align: left;
        }

        .exercise-option:hover {
          border-color: #10b981;

          transform:
            translateY(-2px);
        }

        .exercise-option.active {
          border-color: #10b981;

          background:
            linear-gradient(
              135deg,
              rgba(5, 150, 105, 0.25),
              rgba(16, 185, 129, 0.12)
            );

          color: #ffffff;

          box-shadow:
            0 8px 25px
            rgba(16, 185, 129, 0.10);
        }

        .exercise-option-icon {
          font-size: 25px;

          margin-bottom: 5px;
        }

        .exercise-option-title {
          font-size: 15px;

          font-weight: 700;
        }

        .exercise-option-description {
          margin-top: 3px;

          font-size: 11px;

          color: #94a3b8;
        }

        /* =========================
           ERROR
        ========================= */

        .exercise-error {
          max-width: 640px;

          margin:
            0 auto 15px;

          padding: 13px 15px;

          border:
            1px solid #7f1d1d;

          border-radius: 12px;

          background: #3f1515;

          color: #fecaca;

          text-align: center;

          font-size: 13px;
        }

        /* =========================
           CAMERA
        ========================= */

        .camera-container {
          position: relative;

          width: 100%;

          max-width: 640px;

          aspect-ratio: 4 / 3;

          margin: 0 auto;

          overflow: hidden;

          border:
            2px solid #1f4035;

          border-radius: 20px;

          background: #000000;

          box-shadow:
            0 20px 50px
            rgba(0, 0, 0, 0.4);
        }

        .camera-video {
          position: absolute;

          width: 100%;
          height: 100%;

          object-fit: cover;

          display: none;
        }

        .camera-canvas {
          position: absolute;

          top: 0;
          left: 0;

          width: 100%;
          height: 100%;

          object-fit: contain;
        }

        /* AI badge */

        .ai-badge {
          position: absolute;

          top: 14px;
          left: 14px;

          display: flex;

          align-items: center;

          gap: 7px;

          padding: 7px 11px;

          border-radius: 20px;

          background:
            rgba(0, 0, 0, 0.6);

          backdrop-filter:
            blur(8px);

          font-size: 11px;

          font-weight: 600;
        }

        .ai-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #10b981;

          box-shadow:
            0 0 10px
            #10b981;
        }

        /* =========================
           STATS
        ========================= */

        .exercise-stats {
          max-width: 640px;

          display: grid;

          grid-template-columns:
            1fr 1.5fr;

          gap: 12px;

          margin:
            18px auto;
        }

        .stat-card {
          padding: 18px;

          border:
            1px solid #1f4035;

          border-radius: 16px;

          background:
            rgba(17, 38, 31, 0.9);

          text-align: center;
        }

        .stat-label {
          color: #94a3b8;

          font-size: 12px;
        }

        .rep-number {
          margin-top: 2px;

          color: #34d399;

          font-size: 42px;

          line-height: 1.2;

          font-weight: 800;
        }

        .status-text {
          margin-top: 9px;

          color: #fbbf24;

          font-size: 13px;

          font-weight: 700;

          line-height: 1.5;
        }

        /* =========================
           BUTTONS
        ========================= */

        .exercise-buttons {
          max-width: 640px;

          display: flex;

          gap: 10px;

          margin: 0 auto;

          justify-content: center;
        }

        .exercise-button {
          padding:
            10px 16px;

          border: none;

          border-radius: 11px;

          color: #ffffff;

          font-size: 13px;

          font-weight: 600;

          cursor: pointer;

          transition: 0.2s;
        }

        .exercise-button:hover {
          transform:
            translateY(-2px);
        }

        .button-back {
          background: #1f2937;
        }

        .button-home {
          background: #111827;
        }

        /* =========================
           MOBILE
        ========================= */

        @media (max-width: 600px) {

          .exercise-page {
            padding: 15px;
          }

          .exercise-header h1 {
            font-size: 24px;
          }

          .exercise-selector {
            gap: 8px;
          }

          .exercise-option {
            padding: 12px;
          }

          .exercise-option-icon {
            font-size: 21px;
          }

          .exercise-option-title {
            font-size: 13px;
          }

          .exercise-option-description {
            font-size: 10px;
          }

          .exercise-stats {
            grid-template-columns:
              1fr 1.3fr;
          }

          .rep-number {
            font-size: 35px;
          }

          .status-text {
            font-size: 11px;
          }

          .exercise-buttons {
            flex-direction: column;
          }

          .exercise-button {
            width: 100%;
          }
        }

      `}</style>

      <div className="exercise-page">

        {/* =========================
            HEADER
        ========================= */}

        <div className="exercise-header">

          <div className="exercise-logo">
            🏋️
          </div>

          <h1>
            AI Exercise Tracker
          </h1>

          <p>
            ระบบตรวจจับและนับจำนวนครั้งด้วย AI
          </p>

        </div>

        {/* =========================
            เลือกท่า
        ========================= */}

        <div className="exercise-selector">

          <button
            className={
              `exercise-option ${
                exerciseType ===
                'jumpingJack'
                  ? 'active'
                  : ''
              }`
            }
            onClick={() =>
              changeExercise(
                'jumpingJack'
              )
            }
          >

            <div className="exercise-option-icon">
              🤸
            </div>

            <div className="exercise-option-title">
              กระโดดตบ
            </div>

            <div className="exercise-option-description">
              Jumping Jack
            </div>

          </button>

          <button
            className={
              `exercise-option ${
                exerciseType ===
                'pushUp'
                  ? 'active'
                  : ''
              }`
            }
            onClick={() =>
              changeExercise(
                'pushUp'
              )
            }
          >

            <div className="exercise-option-icon">
              💪
            </div>

            <div className="exercise-option-title">
              วิดพื้น
            </div>

            <div className="exercise-option-description">
              Push Up
            </div>

          </button>

        </div>

        {/* =========================
            ERROR
        ========================= */}

        {errorMessage && (
          <div className="exercise-error">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* =========================
            CAMERA
        ========================= */}

        <div className="camera-container">

          <video
            ref={webcamRef}
            className="camera-video"
            playsInline
            muted
          />

          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="camera-canvas"
          />

          <div className="ai-badge">
            <span className="ai-dot"></span>
            AI Pose Detection
          </div>

        </div>

        {/* =========================
            STATS
        ========================= */}

        <div className="exercise-stats">

          <div className="stat-card">

            <div className="stat-label">
              จำนวนครั้ง
            </div>

            <div className="rep-number">
              {repCount}
            </div>

            <div className="stat-label">
              REPS
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-label">
              ท่าที่กำลังทำ
            </div>

            <div
              style={{
                marginTop: '6px',
                fontSize: '16px',
                fontWeight: '800',
              }}
            >
              {exerciseType ===
              'jumpingJack'
                ? '🤸 กระโดดตบ'
                : '💪 วิดพื้น'}
            </div>

            <div className="status-text">
              {exerciseStatus}
            </div>

          </div>

        </div>

        {/* =========================
            BUTTONS
        ========================= */}

        <div className="exercise-buttons">

          <button
            className="
              exercise-button
              button-back
            "
            onClick={() =>
              navigate('/exercises')
            }
          >
            ← เลือกท่าอื่น
          </button>

          <button
            className="
              exercise-button
              button-home
            "
            onClick={() =>
              navigate('/dashboard')
            }
          >
            ← กลับหน้าหลัก
          </button>

        </div>

      </div>
    </>
  );
}