import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// ---------------------------------------------------------------
// ค่าคงที่ (ปรับจูนได้ที่นี่)
// ---------------------------------------------------------------
const SMOOTHING_WINDOW = 5;        // squat: เฉลี่ยมุมเข่าย้อนหลัง
const STABLE_FRAMES_SQUAT = 4;     // squat: ต้องนิ่งกี่เฟรมก่อนยืนยันเปลี่ยนท่า
const SQUAT_UP_ANGLE = 165;
const SQUAT_DOWN_ANGLE = 95;

const ARM_SMOOTHING_WINDOW = 2;    // jumping jack: window สั้นเพื่อไม่พลาดจุดสูงสุด
// ค่าแขน normalize ด้วยความยาวลำตัว: 0 = ข้อมือระดับไหล่, + = สูงกว่าไหล่, - = ต่ำกว่าไหล่
const ARM_UP_THRESHOLD = 0.25;
const ARM_DOWN_THRESHOLD = -0.45;
const FALLBACK_TORSO = 0.3;        // ใช้เมื่อมองไม่เห็นลำตัว

// เงื่อนไขขากางออก (ตรวจแบบผ่อนปรน: ถ้ามองไม่เห็นข้อเท้า จะไม่บล็อกการนับ)
const REQUIRE_LEGS_SPREAD = false; // เปลี่ยนเป็น true ถ้าต้องการให้ต้องกางขาด้วยจึงนับ
const LEG_SPREAD_RATIO = 1.2;      // ระยะข้อเท้า / ความกว้างไหล่

const REP_COOLDOWN_MS = 300;       // ตบเร็วสุดจริงๆ ไม่ควรต่ำกว่านี้
const MIN_VISIBILITY = 0.65;       // squat
const MIN_VISIBILITY_ARM = 0.4;    // แขนหลุดง่ายตอนขยับเร็ว จึงผ่อนปรน
const MIN_VISIBILITY_DRAW = 0.4;   // วาดโครงกระดูก
const POSE_LOST_RESET_FRAMES = 15; // ไม่เจอคนติดกันกี่เฟรมถึงล้าง buffer

// ---------------------------------------------------------------
// ฟังก์ชันช่วย (ไม่พึ่ง state)
// ---------------------------------------------------------------
const calculateAngle = (a, b, c) => {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

const isVisible = (p, min = MIN_VISIBILITY) =>
  !!p && (p.visibility ?? 1) > min;

const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

export default function Exercise() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';
  const parsedTarget = parseInt(searchParams.get('target') || '10', 10);
  const targetCount = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : 10;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState('กำลังโหลด AI...');
  const [calories, setCalories] = useState(0);

  // เก็บค่า navigate ล่าสุดไว้ใน ref เพื่อไม่ให้ effect รีสตาร์ทกล้องโดยไม่จำเป็น
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let active = true;
    let camera = null;
    let pose = null;
    let initTimer = null;
    let navigateTimer = null;

    // state ภายในทั้งหมดอยู่ในตัวแปรของ effect นี้ -> ไม่มี stale closure
    let count = 0;
    let finished = false;
    let lastFeedback = '';
    let stage = null;               // 'up' | 'down'
    let initialized = false;
    let skipNextCount = false;      // เริ่มมาในท่า "up" ของ jumping jack: รอบแรกยังไม่นับ
    let angleBuffer = [];
    let armBuffer = [];
    let candidateStage = null;
    let stableFrames = 0;
    let lastRepTime = 0;
    let lostFrames = 0;
    let legsSpreadSeen = false;     // เคยกางขาระหว่างที่แขนอยู่ข้างบน
    let legsVisibleInCycle = false;

    setCounter(0);
    setCalories(0);

    const updateFeedback = (text) => {
      if (lastFeedback !== text) {
        lastFeedback = text;
        setFeedback(text);
      }
    };

    const resetBuffers = () => {
      angleBuffer = [];
      armBuffer = [];
      candidateStage = null;
      stableFrames = 0;
    };

    const tryCountRep = () => {
      if (finished) return false;

      const now = Date.now();
      if (now - lastRepTime < REP_COOLDOWN_MS) return false;
      lastRepTime = now;

      count += 1;
      const caloriesPerRep = exerciseType === 'squat' ? 0.32 : 0.2;
      const totalCal = Number((count * caloriesPerRep).toFixed(2));

      setCounter(count);
      setCalories(totalCal);

      if (count >= targetCount) {
        finished = true;
        updateFeedback('ครบเป้าหมายแล้ว เยี่ยมมาก!');
        const finalCount = count;
        navigateTimer = setTimeout(() => {
          navigateRef.current(
            `/result?exercise=${exerciseType}&count=${finalCount}&calories=${totalCal}`
          );
        }, 1000);
      }
      return true;
    };

    // ---------------- SQUAT ----------------
    const getSmoothedKneeAngle = (lm) => {
      const angles = [];
      if (isVisible(lm[23]) && isVisible(lm[25]) && isVisible(lm[27])) {
        angles.push(calculateAngle(lm[23], lm[25], lm[27]));
      }
      if (isVisible(lm[24]) && isVisible(lm[26]) && isVisible(lm[28])) {
        angles.push(calculateAngle(lm[24], lm[26], lm[28]));
      }
      if (angles.length === 0) return null;

      angleBuffer.push(average(angles));
      if (angleBuffer.length > SMOOTHING_WINDOW) angleBuffer.shift();
      return average(angleBuffer);
    };

    const confirmStage = (candidate, framesRequired) => {
      if (candidateStage !== candidate) {
        candidateStage = candidate;
        stableFrames = 1;
        return false;
      }
      stableFrames += 1;
      return stableFrames >= framesRequired;
    };

    const handleSquat = (lm) => {
      const angle = getSmoothedKneeAngle(lm);
      if (angle === null) {
        updateFeedback('ถอยให้เห็นขาทั้งสองข้าง');
        return;
      }

      if (!initialized) {
        stage = angle > 130 ? 'up' : 'down';
        initialized = true;
        updateFeedback(
          stage === 'up'
            ? 'พร้อมแล้ว ย่อตัวลงได้เลย'
            : 'อยู่ในท่าย่อ ยืนขึ้นเพื่อเริ่มนับ'
        );
        return;
      }

      if (angle > SQUAT_UP_ANGLE) {
        if (confirmStage('up', STABLE_FRAMES_SQUAT)) {
          if (stage === 'down') tryCountRep();
          stage = 'up';
        }
        updateFeedback('ยืนตัวตรง - พร้อมแล้วย่อตัวลง');
      } else if (angle < SQUAT_DOWN_ANGLE) {
        if (confirmStage('down', STABLE_FRAMES_SQUAT) && stage === 'up') {
          stage = 'down';
        }
        updateFeedback('ยอดเยี่ยม! ดันตัวขึ้นตรงๆ');
      } else {
        candidateStage = null;
        stableFrames = 0;
      }
    };

    // ---------------- JUMPING JACK ----------------
    const getTorsoLength = (lm) => {
      const v = MIN_VISIBILITY_ARM;
      if (isVisible(lm[11], v) && isVisible(lm[12], v) && isVisible(lm[23], v) && isVisible(lm[24], v)) {
        const len = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2);
        if (len > 0.05) return len;
      }
      return FALLBACK_TORSO;
    };

    const getSmoothedArmRaise = (lm) => {
      const torso = getTorsoLength(lm);
      const vals = [];

      if (isVisible(lm[11], MIN_VISIBILITY_ARM) && isVisible(lm[15], MIN_VISIBILITY_ARM)) {
        vals.push((lm[11].y - lm[15].y) / torso);
      }
      if (isVisible(lm[12], MIN_VISIBILITY_ARM) && isVisible(lm[16], MIN_VISIBILITY_ARM)) {
        vals.push((lm[12].y - lm[16].y) / torso);
      }
      if (vals.length === 0) return null;

      armBuffer.push(average(vals));
      if (armBuffer.length > ARM_SMOOTHING_WINDOW) armBuffer.shift();
      return average(armBuffer);
    };

    // คืนค่า true = กางขา, false = ไม่กาง, null = มองไม่เห็นข้อเท้า
    const getLegsSpread = (lm) => {
      const v = MIN_VISIBILITY_ARM;
      if (!(isVisible(lm[27], v) && isVisible(lm[28], v) && isVisible(lm[11], v) && isVisible(lm[12], v))) {
        return null;
      }
      const shoulderW = Math.abs(lm[11].x - lm[12].x);
      if (shoulderW < 0.02) return null;
      const ankleW = Math.abs(lm[27].x - lm[28].x);
      return ankleW / shoulderW > LEG_SPREAD_RATIO;
    };

    const handleJumpingJack = (lm) => {
      const armRaise = getSmoothedArmRaise(lm);
      if (armRaise === null) {
        updateFeedback('ถอยให้เห็นแขนและลำตัวชัดเจน');
        return;
      }

      if (!initialized) {
        stage = armRaise > 0 ? 'up' : 'down';
        skipNextCount = stage === 'up'; // เริ่มตอนแขนยกอยู่ -> ครั้งแรกที่ลงยังไม่นับ
        initialized = true;
        updateFeedback(
          stage === 'down'
            ? 'พร้อมแล้ว กระโดดยกแขนขึ้นได้เลย'
            : 'ลดแขนลงก่อนเริ่มนับ'
        );
        return;
      }

      // ติดตามการกางขาตอนแขนอยู่ข้างบน
      if (stage === 'up') {
        const spread = getLegsSpread(lm);
        if (spread !== null) {
          legsVisibleInCycle = true;
          if (spread) legsSpreadSeen = true;
        }
      }

      if (armRaise > ARM_UP_THRESHOLD) {
        if (stage === 'down') {
          stage = 'up';
          legsSpreadSeen = false;
          legsVisibleInCycle = false;
          updateFeedback('ยอดเยี่ยม! หุบแขนขาลง');
        }
      } else if (armRaise < ARM_DOWN_THRESHOLD) {
        if (stage === 'up') {
          stage = 'down';

          const legsOk =
            !REQUIRE_LEGS_SPREAD || !legsVisibleInCycle || legsSpreadSeen;

          if (skipNextCount) {
            skipNextCount = false;
          } else if (legsOk) {
            tryCountRep();
          } else {
            updateFeedback('กางขาให้กว้างขึ้นด้วย');
            return;
          }
        }
        updateFeedback('เตรียมตัว - กระโดดกางแขนขาออก');
      }
      // ช่วงกลางระหว่าง threshold: ไม่ทำอะไร (hysteresis)
    };

    // ---------------- วาดภาพ + ประมวลผล ----------------
    const drawSkeleton = (ctx, lm, width, height) => {
      if (window.POSE_CONNECTIONS) {
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        window.POSE_CONNECTIONS.forEach(([i, j]) => {
          const p1 = lm[i];
          const p2 = lm[j];
          if (isVisible(p1, MIN_VISIBILITY_DRAW) && isVisible(p2, MIN_VISIBILITY_DRAW)) {
            ctx.beginPath();
            ctx.moveTo(p1.x * width, p1.y * height);
            ctx.lineTo(p2.x * width, p2.y * height);
            ctx.stroke();
          }
        });
      }

      ctx.fillStyle = '#FF0000';
      lm.forEach((p) => {
        if (isVisible(p, MIN_VISIBILITY_DRAW)) {
          ctx.beginPath();
          ctx.arc(p.x * width, p.y * height, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    };

    const onResults = (results) => {
      if (!active || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      if (results.image) ctx.drawImage(results.image, 0, 0, width, height);

      if (results.poseLandmarks) {
        lostFrames = 0;
        const lm = results.poseLandmarks;
        drawSkeleton(ctx, lm, width, height);

        if (!finished) {
          if (exerciseType === 'squat') handleSquat(lm);
          else if (exerciseType === 'jumping_jack') handleJumpingJack(lm);
          else updateFeedback('ไม่รู้จักท่านี้');
        }
      } else {
        lostFrames += 1;
        if (lostFrames >= POSE_LOST_RESET_FRAMES) {
          // หายไปนาน: ล้างค่าเก่า แล้วกำหนดท่าตั้งต้นใหม่เมื่อกลับเข้ากรอบ
          resetBuffers();
          initialized = false;
          stage = null;
        }
        if (!finished) updateFeedback('จัดท่าทางให้เห็นเต็มตัว');
      }

      ctx.restore();
    };

    const initPose = () => {
      if (!active) return;

      if (!window.Pose || !window.Camera) {
        initTimer = setTimeout(initPose, 500);
        return;
      }

      pose = new window.Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });

      pose.onResults(onResults);

      if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (!active || !videoRef.current || !pose) return;
            try {
              await pose.send({ image: videoRef.current });
            } catch (err) {
              // เฟรมที่พลาดไม่ควรทำให้แอปล่ม
              console.warn('pose.send failed:', err);
            }
          },
          width: 640,
          height: 480,
        });
        camera.start();
        updateFeedback('จัดท่าทางให้เห็นเต็มตัว');
      }
    };

    initPose();

    return () => {
      active = false;
      clearTimeout(initTimer);
      clearTimeout(navigateTimer);
      if (camera && typeof camera.stop === 'function') camera.stop();
      if (pose && typeof pose.close === 'function') pose.close();
    };
  }, [exerciseType, targetCount]);

  // ---------------- UI ----------------
  const labelStyle = {
    color: '#aaa',
    margin: '0 0 5px',
    fontSize: '14px',
  };

  return (
    <div
      style={{
        padding: '30px',
        maxWidth: '700px',
        margin: '0 auto',
        textAlign: 'center',
        color: '#fff',
        backgroundColor: '#121212',
        minHeight: '100vh',
        fontFamily: '"Kanit", sans-serif',
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap');
          * { font-family: "Kanit", sans-serif; }
          button, input, textarea, select { font-family: "Kanit", sans-serif; }
        `}
      </style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => navigate('/exercises')}
          style={{
            padding: '8px 16px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ← กลับหน้าเลือกท่า
        </button>

        <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: '20px' }}>
          ท่า: {exerciseType} (เป้าหมาย: {targetCount} ครั้ง)
        </h2>
      </div>

      <div
        style={{
          background: '#1e1e1e',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #444',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '30px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <div>
            <p style={labelStyle}>ทำไปแล้ว</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#007bff' }}>
              {counter} / {targetCount}
            </span>
          </div>

          <div>
            <p style={labelStyle}>แคลอรี</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>
              {calories} kcal
            </span>
          </div>

          <div>
            <p style={labelStyle}>สถานะท่าทาง</p>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>
              {feedback}
            </span>
          </div>
        </div>

        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{
            width: '100%',
            maxWidth: '640px',
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid #444',
            background: '#000',
          }}
        />
      </div>
    </div>
  );
}
