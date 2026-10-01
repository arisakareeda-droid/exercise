import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// ---------------------------------------------------------------
// ขนาดเฟรม (แนวตั้ง 3:4 เห็นทั้งตัวมากขึ้น)
// ---------------------------------------------------------------
const CANVAS_W = 480;
const CANVAS_H = 640;

// ---------------------------------------------------------------
// SQUAT: ใช้ 2 สัญญาณร่วมกัน
//  1) depth  = สะโพกลดลงกี่ % เทียบความสูงสะโพก->ข้อเท้าตอนยืน (ปรับเทียบเองอัตโนมัติ)
//              ใช้ได้ทั้งหันหน้าและหันข้างกล้อง
//  2) มุมเข่า = สำรอง/เสริม (หันข้างแม่น หันหน้าจะคลาดเคลื่อน)
// ---------------------------------------------------------------
const SQUAT_DEPTH_DOWN = 0.17;     // ลดลงเกินนี้ = ย่อแล้ว
const SQUAT_DEPTH_UP = 0.08;       // ต่ำกว่านี้ = ยืนแล้ว
const SQUAT_ANGLE_DOWN = 110;      // มุมเข่าต่ำกว่านี้ = ย่อแล้ว
const SQUAT_ANGLE_UP = 155;        // มุมเข่าสูงกว่านี้ = ยืนแล้ว
const SQUAT_CONFIRM_FRAMES = 2;    // ยืนยันสถานะกี่เฟรมติด (น้อยๆ เพื่อไม่พลาดท่าเร็ว)
const SQUAT_COOLDOWN_MS = 500;
const SQUAT_SMOOTH = 3;
const BASELINE_DECAY = 0.9995;     // ค่าอ้างอิงความสูงตอนยืนค่อยๆ ลดเอง (รองรับขยับเข้า-ออกกล้อง)
const MIN_VISIBILITY_SQUAT = 0.5;

// ---------------------------------------------------------------
// JUMPING JACK
// ---------------------------------------------------------------
const ARM_SMOOTHING_WINDOW = 2;
// ค่าแขน normalize ด้วยความยาวลำตัว: 0 = ข้อมือระดับไหล่, + = สูงกว่าไหล่, - = ต่ำกว่าไหล่
const ARM_UP_THRESHOLD = 0.25;
const ARM_DOWN_THRESHOLD = -0.45;
const FALLBACK_TORSO = 0.3;
const REQUIRE_LEGS_SPREAD = false;
const LEG_SPREAD_RATIO = 1.2;
const JJ_COOLDOWN_MS = 300;
const MIN_VISIBILITY_ARM = 0.4;

// ทั่วไป
const MIN_VISIBILITY_DRAW = 0.4;
const POSE_LOST_RESET_FRAMES = 15;
const SHOW_DEBUG = true;           // แสดงค่า depth / มุมเข่า ใต้ภาพ ไว้ช่วยจูน

const calculateAngle = (a, b, c) => {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

const isVisible = (p, min = 0.65) => !!p && (p.visibility ?? 1) > min;
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
  const [debug, setDebug] = useState('');

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

    let count = 0;
    let finished = false;
    let lastFeedback = '';
    let lastDebug = '';
    let stage = null;               // 'up' | 'down'
    let initialized = false;
    let lastRepTime = 0;
    let lostFrames = 0;

    // squat
    let angleBuffer = [];
    let spanBuffer = [];
    let baselineSpan = 0;
    let candidate = null;
    let candidateFrames = 0;

    // jumping jack
    let armBuffer = [];
    let skipNextCount = false;
    let legsSpreadSeen = false;
    let legsVisibleInCycle = false;

    setCounter(0);
    setCalories(0);
    setDebug('');

    const updateFeedback = (text) => {
      if (lastFeedback !== text) {
        lastFeedback = text;
        setFeedback(text);
      }
    };

    const updateDebug = (text) => {
      if (SHOW_DEBUG && lastDebug !== text) {
        lastDebug = text;
        setDebug(text);
      }
    };

    const resetTracking = () => {
      angleBuffer = [];
      spanBuffer = [];
      armBuffer = [];
      baselineSpan = 0;
      candidate = null;
      candidateFrames = 0;
      initialized = false;
      stage = null;
    };

    const tryCountRep = (cooldown) => {
      if (finished) return false;
      const now = Date.now();
      if (now - lastRepTime < cooldown) return false;
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

    // เปลี่ยนสถานะต้องยืนยันซ้ำกี่เฟรม
    const confirm = (name, frames) => {
      if (candidate !== name) {
        candidate = name;
        candidateFrames = 1;
      } else {
        candidateFrames += 1;
      }
      return candidateFrames >= frames;
    };

    // ---------------- SQUAT ----------------
    const getSquatSignals = (lm) => {
      const v = MIN_VISIBILITY_SQUAT;

      // มุมเข่า
      const angles = [];
      if (isVisible(lm[23], v) && isVisible(lm[25], v) && isVisible(lm[27], v)) {
        angles.push(calculateAngle(lm[23], lm[25], lm[27]));
      }
      if (isVisible(lm[24], v) && isVisible(lm[26], v) && isVisible(lm[28], v)) {
        angles.push(calculateAngle(lm[24], lm[26], lm[28]));
      }
      let angle = null;
      if (angles.length) {
        angleBuffer.push(average(angles));
        if (angleBuffer.length > SQUAT_SMOOTH) angleBuffer.shift();
        angle = average(angleBuffer);
      }

      // depth จากระยะสะโพก->ข้อเท้า (แกนตั้ง)
      const hips = [lm[23], lm[24]].filter((p) => isVisible(p, v));
      const ankles = [lm[27], lm[28]].filter((p) => isVisible(p, v));
      let depth = null;
      if (hips.length && ankles.length) {
        const span = average(ankles.map((p) => p.y)) - average(hips.map((p) => p.y));
        if (span > 0.1) {
          spanBuffer.push(span);
          if (spanBuffer.length > SQUAT_SMOOTH) spanBuffer.shift();
          const smoothSpan = average(spanBuffer);
          baselineSpan = Math.max(smoothSpan, baselineSpan * BASELINE_DECAY);
          depth = Math.max(0, 1 - smoothSpan / baselineSpan);
        }
      }

      return { angle, depth };
    };

    const handleSquat = (lm) => {
      const { angle, depth } = getSquatSignals(lm);

      updateDebug(
        `depth: ${depth === null ? '-' : Math.round(depth * 100) + '%'}  |  มุมเข่า: ${
          angle === null ? '-' : Math.round(angle) + '°'
        }  |  สถานะ: ${stage ?? '-'}`
      );

      if (angle === null && depth === null) {
        updateFeedback('ถอยให้เห็นสะโพกถึงเท้า');
        return;
      }

      const isDown =
        (depth !== null && depth > SQUAT_DEPTH_DOWN) ||
        (angle !== null && angle < SQUAT_ANGLE_DOWN);
      const isUp =
        (depth === null || depth < SQUAT_DEPTH_UP) &&
        (angle === null || angle > SQUAT_ANGLE_UP);

      if (!initialized) {
        if (isUp) {
          stage = 'up';
          initialized = true;
          updateFeedback('พร้อมแล้ว ย่อตัวลงได้เลย');
        } else if (isDown) {
          stage = 'down';
          initialized = true;
          updateFeedback('อยู่ในท่าย่อ ยืนขึ้นเพื่อเริ่มนับ');
        }
        return;
      }

      if (isDown) {
        if (confirm('down', SQUAT_CONFIRM_FRAMES)) {
          if (stage !== 'down') updateFeedback('ดีมาก! ดันตัวขึ้นตรงๆ');
          stage = 'down';
        }
      } else if (isUp) {
        if (confirm('up', SQUAT_CONFIRM_FRAMES)) {
          if (stage === 'down') {
            tryCountRep(SQUAT_COOLDOWN_MS);
            updateFeedback('นับแล้ว! ย่อตัวลงอีกครั้ง');
          }
          stage = 'up';
        }
      } else {
        // อยู่ระหว่างทาง: ไม่เปลี่ยนสถานะ (hysteresis)
        candidate = null;
        candidateFrames = 0;
        if (stage === 'up') updateFeedback('ย่อลงอีกนิด');
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

    const getLegsSpread = (lm) => {
      const v = MIN_VISIBILITY_ARM;
      if (!(isVisible(lm[27], v) && isVisible(lm[28], v) && isVisible(lm[11], v) && isVisible(lm[12], v))) {
        return null;
      }
      const shoulderW = Math.abs(lm[11].x - lm[12].x);
      if (shoulderW < 0.02) return null;
      return Math.abs(lm[27].x - lm[28].x) / shoulderW > LEG_SPREAD_RATIO;
    };

    const handleJumpingJack = (lm) => {
      const armRaise = getSmoothedArmRaise(lm);
      updateDebug(
        `แขน: ${armRaise === null ? '-' : armRaise.toFixed(2)}  |  สถานะ: ${stage ?? '-'}`
      );

      if (armRaise === null) {
        updateFeedback('ถอยให้เห็นแขนและลำตัวชัดเจน');
        return;
      }

      if (!initialized) {
        stage = armRaise > 0 ? 'up' : 'down';
        skipNextCount = stage === 'up';
        initialized = true;
        updateFeedback(
          stage === 'down' ? 'พร้อมแล้ว กระโดดยกแขนขึ้นได้เลย' : 'ลดแขนลงก่อนเริ่มนับ'
        );
        return;
      }

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
          const legsOk = !REQUIRE_LEGS_SPREAD || !legsVisibleInCycle || legsSpreadSeen;
          if (skipNextCount) {
            skipNextCount = false;
          } else if (legsOk) {
            tryCountRep(JJ_COOLDOWN_MS);
          } else {
            updateFeedback('กางขาให้กว้างขึ้นด้วย');
            return;
          }
        }
        updateFeedback('เตรียมตัว - กระโดดกางแขนขาออก');
      }
    };

    // ---------------- วาดภาพ (cover-crop ลงแคนวาสแนวตั้ง) ----------------
    const drawSkeleton = (ctx, lm, map) => {
      if (window.POSE_CONNECTIONS) {
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        window.POSE_CONNECTIONS.forEach(([i, j]) => {
          const p1 = lm[i];
          const p2 = lm[j];
          if (isVisible(p1, MIN_VISIBILITY_DRAW) && isVisible(p2, MIN_VISIBILITY_DRAW)) {
            ctx.beginPath();
            ctx.moveTo(map.x(p1), map.y(p1));
            ctx.lineTo(map.x(p2), map.y(p2));
            ctx.stroke();
          }
        });
      }
      ctx.fillStyle = '#FF0000';
      lm.forEach((p) => {
        if (isVisible(p, MIN_VISIBILITY_DRAW)) {
          ctx.beginPath();
          ctx.arc(map.x(p), map.y(p), 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    };

    const onResults = (results) => {
      if (!active || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const cw = canvas.width;
      const ch = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, cw, ch);

      // คำนวณการวางภาพแบบ "cover" ให้เต็มแคนวาสแนวตั้ง
      const img = results.image;
      const iw = (img && (img.videoWidth || img.width)) || 640;
      const ih = (img && (img.videoHeight || img.height)) || 480;
      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      const map = {
        x: (p) => p.x * dw + ox,
        y: (p) => p.y * dh + oy,
      };

      if (img) ctx.drawImage(img, ox, oy, dw, dh);

      if (results.poseLandmarks) {
        lostFrames = 0;
        const lm = results.poseLandmarks;
        drawSkeleton(ctx, lm, map);

        if (!finished) {
          if (exerciseType === 'squat') handleSquat(lm);
          else if (exerciseType === 'jumping_jack') handleJumpingJack(lm);
          else updateFeedback('ไม่รู้จักท่านี้');
        }
      } else {
        lostFrames += 1;
        if (lostFrames >= POSE_LOST_RESET_FRAMES) resetTracking();
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
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      pose.onResults(onResults);

      if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (!active || !videoRef.current || !pose) return;
            try {
              await pose.send({ image: videoRef.current });
            } catch (err) {
              console.warn('pose.send failed:', err);
            }
          },
          width: CANVAS_W,
          height: CANVAS_H,
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
  const labelStyle = { color: '#aaa', margin: '0 0 5px', fontSize: '14px' };

  return (
    <div
      style={{
        padding: '20px',
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
          marginBottom: '16px',
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
          padding: '16px',
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
            gap: '24px',
            marginBottom: '16px',
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
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: '100%',
            maxWidth: '420px',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid #444',
            background: '#000',
          }}
        />

        {SHOW_DEBUG && debug && (
          <p style={{ color: '#888', fontSize: '12px', margin: '10px 0 0' }}>{debug}</p>
        )}
      </div>
    </div>
  );
}
