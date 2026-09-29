import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// --- ค่าคงที่สำหรับกรองสัญญาณรบกวน / กันนับผิด ---
const SMOOTHING_WINDOW = 5;      // จำนวนเฟรมที่ใช้เฉลี่ยมุม (ลด noise)
const STABLE_FRAMES_REQUIRED = 4; // ต้องอยู่ในท่านิ่งครบกี่เฟรมก่อนยืนยันว่าเปลี่ยน stage จริง
const REP_COOLDOWN_MS = 600;      // เวลาขั้นต่ำระหว่างการนับแต่ละครั้ง (กันนับซ้ำ)
const MIN_VISIBILITY = 0.65;      // ความเชื่อมั่นขั้นต่ำของจุดที่จะนำมาคำนวณ

export default function Exercise() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';
  const targetCount = parseInt(searchParams.get('target') || '10', 10);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState("กำลังโหลด AI...");
  const [calories, setCalories] = useState(0);

  const stageRef = useRef("up");
  const angleBufferRef = useRef([]);          // buffer สำหรับ smoothing มุม squat
  const candidateStageRef = useRef(null);     // stage ที่กำลังจะเปลี่ยนไป (รอยืนยัน)
  const stableFrameCountRef = useRef(0);      // นับจำนวนเฟรมที่ท่านิ่งต่อเนื่อง
  const lastRepTimeRef = useRef(0);           // เวลาที่นับครั้งล่าสุด (สำหรับ cooldown)

  const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  };

  const isVisible = (p) => p && (p.visibility ?? 1) > MIN_VISIBILITY;

  // เฉลี่ยมุมจากขาซ้าย+ขวา (ถ้ามองเห็นทั้งคู่) เพื่อความเสถียร มากกว่าใช้ขาเดียว
  const getSmoothedKneeAngle = (lm) => {
    const angles = [];

    const hipL = lm[23], kneeL = lm[25], ankleL = lm[27];
    if (isVisible(hipL) && isVisible(kneeL) && isVisible(ankleL)) {
      angles.push(calculateAngle(hipL, kneeL, ankleL));
    }

    const hipR = lm[24], kneeR = lm[26], ankleR = lm[28];
    if (isVisible(hipR) && isVisible(kneeR) && isVisible(ankleR)) {
      angles.push(calculateAngle(hipR, kneeR, ankleR));
    }

    if (angles.length === 0) return null;
    const instantAngle = angles.reduce((a, b) => a + b, 0) / angles.length;

    // เก็บลง buffer แล้วเฉลี่ยย้อนหลังเพื่อลดการแกว่งจาก noise เฟรมต่อเฟรม
    const buf = angleBufferRef.current;
    buf.push(instantAngle);
    if (buf.length > SMOOTHING_WINDOW) buf.shift();
    return buf.reduce((a, b) => a + b, 0) / buf.length;
  };

  // ยืนยันการเปลี่ยน stage ก็ต่อเมื่อ "นิ่ง" อยู่ในเงื่อนไขนั้นครบจำนวนเฟรมที่กำหนด
  // ป้องกันการขยับตัวแว้บเดียวแล้วโดนนับว่าเปลี่ยนท่า
  const confirmStage = (candidate) => {
    if (candidateStageRef.current !== candidate) {
      candidateStageRef.current = candidate;
      stableFrameCountRef.current = 1;
      return false;
    }
    stableFrameCountRef.current += 1;
    return stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED;
  };

  const tryCountRep = (nextCount) => {
    const now = Date.now();
    if (now - lastRepTimeRef.current < REP_COOLDOWN_MS) return; // ยังอยู่ในช่วง cooldown ไม่นับซ้ำ
    lastRepTimeRef.current = now;

    const caloriesPerRep = exerciseType === 'squat' ? 0.32 : 0.20;
    const totalCal = Number((nextCount * caloriesPerRep).toFixed(2));
    setCounter(nextCount);
    setCalories(totalCal);

    if (nextCount >= targetCount) {
      setTimeout(
        () => navigate(`/result?exercise=${exerciseType}&count=${nextCount}&calories=${totalCal}`),
        1000
      );
    }
  };

  useEffect(() => {
    let active = true;
    let camera = null;

    // รีเซ็ตสถานะทุกครั้งที่เปลี่ยนท่าออกกำลังกาย
    stageRef.current = "up";
    angleBufferRef.current = [];
    candidateStageRef.current = null;
    stableFrameCountRef.current = 0;
    lastRepTimeRef.current = 0;
    setCounter(0);
    setCalories(0);

    const initPose = () => {
      if (!window.Pose || !window.Camera) {
        setTimeout(initPose, 500);
        return;
      }

      const pose = new window.Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });

      pose.onResults((results) => {
        if (!canvasRef.current || !active) return;
        const canvasCtx = canvasRef.current.getContext('2d');
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, width, height);

        if (results.image) {
          canvasCtx.drawImage(results.image, 0, 0, width, height);
        }

        if (results.poseLandmarks) {
          const lm = results.poseLandmarks;

          if (window.POSE_CONNECTIONS) {
            canvasCtx.strokeStyle = '#00FF00';
            canvasCtx.lineWidth = 4;
            window.POSE_CONNECTIONS.forEach(([i, j]) => {
              const p1 = lm[i];
              const p2 = lm[j];
              if (p1 && p2 && isVisible(p1) && isVisible(p2)) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * width, p1.y * height);
                canvasCtx.lineTo(p2.x * width, p2.y * height);
                canvasCtx.stroke();
              }
            });
          }

          canvasCtx.fillStyle = '#FF0000';
          lm.forEach((p) => {
            if (isVisible(p)) {
              canvasCtx.beginPath();
              canvasCtx.arc(p.x * width, p.y * height, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            }
          });

          setFeedback("จัดท่าทางให้เห็นเต็มตัว");

          // --- เงื่อนไขท่า SQUAT ---
          if (exerciseType === "squat") {
            const angle = getSmoothedKneeAngle(lm);

            if (angle !== null) {
              // ยืนตัวตรง (มากกว่า 165 องศา) — ต้องนิ่งครบเฟรมก่อนยืนยัน
              if (angle > 165) {
                if (confirmStage("up")) {
                  if (stageRef.current === "down") {
                    tryCountRep(counter + 1);
                  }
                  stageRef.current = "up";
                }
                setFeedback("ยืนตัวตรง - พร้อมแล้วย่อตัวลง");
              }
              // ย่อลงลึก (น้อยกว่า 95 องศา) — ต้องนิ่งครบเฟรมก่อนยืนยัน
              else if (angle < 95) {
                if (confirmStage("down") && stageRef.current === "up") {
                  stageRef.current = "down";
                }
                setFeedback("ยอดเยี่ยม! ดันตัวขึ้นตรงๆ");
              } else {
                // อยู่ระหว่างกลาง ไม่ถือเป็นการยืนยัน stage ใหม่ แต่ไม่รีเซ็ต stage ปัจจุบัน
                candidateStageRef.current = null;
                stableFrameCountRef.current = 0;
              }
            }
          }
          // --- เงื่อนไขท่า JUMPING JACK ---
          else if (exerciseType === "jumping_jack") {
            const shoulderL = lm[11], wristL = lm[15];
            const ankleL = lm[27], ankleR = lm[28];

            if (isVisible(shoulderL) && isVisible(wristL) && isVisible(ankleL) && isVisible(ankleR)) {
              const isHandsUp = wristL.y < shoulderL.y;

              if (!isHandsUp) {
                if (confirmStage("down")) {
                  if (stageRef.current === "up") {
                    tryCountRep(counter + 1);
                  }
                  stageRef.current = "down";
                }
                setFeedback("เตรียมตัว - กระโดดกางแขนขาออก");
              } else {
                if (confirmStage("up") && stageRef.current === "down") {
                  stageRef.current = "up";
                }
                setFeedback("ยอดเยี่ยม! หุบแขนขาลง");
              }
            }
          }
        }
        canvasCtx.restore();
      });

      if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && active) {
              await pose.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        camera.start();
      }
    };

    initPose();

    return () => {
      active = false;
      if (camera && typeof camera.stop === 'function') {
        camera.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseType, targetCount, navigate]);

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', textAlign: 'center', color: '#fff', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => navigate('/exercises')}
          style={{ padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ← กลับหน้าเลือกท่า
        </button>
        <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: '20px' }}>
          ท่า: {exerciseType} (เป้าหมาย: {targetCount} ครั้ง)
        </h2>
      </div>

      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '1px solid #444', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ display: 'flex', gap: '30px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>ทำไปแล้ว</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#007bff' }}>{counter} / {targetCount}</span>
          </div>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>แคลอรี</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>{calories} kcal</span>
          </div>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>สถานะท่าทาง</p>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>{feedback}</span>
          </div>
        </div>

        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{ width: '100%', maxWidth: '640px', height: 'auto', borderRadius: '8px', border: '1px solid #444', background: '#000' }}
        />
      </div>
    </div>
  );
}
