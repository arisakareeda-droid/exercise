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
const SQUAT_DEPTH_DOWN = 0.13;     // ลดลงเกินนี้ = ย่อแล้ว
const SQUAT_DEPTH_UP = 0.06;       // ต่ำกว่านี้ = ยืนแล้ว
const SQUAT_ANGLE_DOWN = 118;      // ใช้มุมเข่าเป็นสัญญาณสำรองเมื่อวัด depth ไม่ได้
const SQUAT_ANGLE_UP = 150;
const SQUAT_CONFIRM_FRAMES = 3;    // กรองการแกว่งของจุดตรวจจับ
const SQUAT_COOLDOWN_MS = 650;
const SQUAT_SMOOTH = 5;
const BASELINE_DECAY = 0.9995;     // ค่าอ้างอิงความสูงตอนยืนค่อยๆ ลดเอง (รองรับขยับเข้า-ออกกล้อง)
const MIN_VISIBILITY_SQUAT = 0.5;

// ---------------------------------------------------------------
// JUMPING JACK
// ---------------------------------------------------------------
const ARM_SMOOTHING_WINDOW = 5;
const JJ_CONFIRM_FRAMES = 3;
// ค่าแขน normalize ด้วยความยาวลำตัว: 0 = ข้อมือระดับไหล่, + = สูงกว่าไหล่, - = ต่ำกว่าไหล่
const ARM_UP_THRESHOLD = 0.18;
const ARM_DOWN_THRESHOLD = -0.25;
const FALLBACK_TORSO = 0.3;
const REQUIRE_LEGS_SPREAD = false;
const LEG_SPREAD_RATIO = 1.2;
const JJ_COOLDOWN_MS = 600;
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

      // ใช้ depth เป็นหลัก เพราะมุมเข่าคลาดเคลื่อนได้เมื่อหันหน้าหากล้อง
      // ใช้มุมเข่าเฉพาะกรณีที่ประเมิน depth ไม่ได้
      const isDown = depth !== null
        ? depth > SQUAT_DEPTH_DOWN
        : angle !== null && angle < SQUAT_ANGLE_DOWN;
      const isUp = depth !== null
        ? depth < SQUAT_DEPTH_UP
        : angle !== null && angle > SQUAT_ANGLE_UP;

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
        // เริ่มนับเมื่อผู้ใช้อยู่ในท่าแขนลงชัดเจน ป้องกันเริ่มกลางจังหวะ
        if (armRaise < ARM_DOWN_THRESHOLD) {
          stage = 'down';
          initialized = true;
          candidate = null;
          candidateFrames = 0;
          updateFeedback('พร้อมแล้ว กระโดดยกแขนขึ้นได้เลย');
        } else {
          updateFeedback('ลดแขนลงก่อนเริ่มนับ');
        }
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
        if (confirm('up', JJ_CONFIRM_FRAMES) && stage !== 'up') {
          stage = 'up';
          candidate = null;
          candidateFrames = 0;
          legsSpreadSeen = false;
          legsVisibleInCycle = false;
          updateFeedback('ยอดเยี่ยม! หุบแขนขาลง');
        }
      } else if (armRaise < ARM_DOWN_THRESHOLD) {
        if (confirm('down', JJ_CONFIRM_FRAMES) && stage !== 'down') {
          stage = 'down';
          candidate = null;
          candidateFrames = 0;
          const legsOk = !REQUIRE_LEGS_SPREAD || !legsVisibleInCycle || legsSpreadSeen;
          if (legsOk) {
            tryCountRep(JJ_COOLDOWN_MS);
            updateFeedback('นับแล้ว! กระโดดกางแขนขาออกอีกครั้ง');
          } else {
            updateFeedback('กางขาให้กว้างขึ้นด้วย');
          }
        } else if (stage === 'down') {
          updateFeedback('เตรียมตัว - กระโดดกางแขนขาออก');
        }
      } else {
        // ช่วงแขนกำลังเคลื่อนที่ ไม่เปลี่ยนสถานะและเริ่มนับเฟรมยืนยันใหม่
        candidate = null;
        candidateFrames = 0;
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

  // ---------------- UI: FitTrack dashboard style ----------------
  const exerciseName = exerciseType === 'squat' ? 'Squat' : exerciseType === 'jumping_jack' ? 'Jumping Jack' : 'ออกกำลังกาย';
  const progress = Math.min(100, Math.round((counter / targetCount) * 100));

  return (
    <div className="exercise-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .exercise-shell { min-height:100vh; color:#17365f; background:linear-gradient(135deg,#f9fcff 0%,#eef5ff 48%,#f7fbff 100%); font-family:'Kanit',sans-serif; padding:30px; }
        .exercise-shell * { font-family:'Kanit',sans-serif; }
        .ex-wrap { max-width:1240px; margin:0 auto; }
        .ex-header { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:6px 2px 22px; border-bottom:1px solid #dce8f5; margin-bottom:24px; }
        .ex-brand { display:flex; align-items:center; gap:12px; }
        .ex-mark { width:50px;height:50px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#5b9cf6,#1769dc);box-shadow:0 10px 24px #287ee833; }
        .ex-brand-name {font-size:23px;font-weight:700;color:#123c78;line-height:1.1}.ex-brand-tag {font-size:11px;letter-spacing:1.5px;color:#7b93b2;margin:4px 0 0 10px}
        .ex-back {border:1px solid #d9e6f5;background:#fff;color:#315b8f;padding:11px 18px;border-radius:28px;cursor:pointer;font-size:14px;font-weight:500;box-shadow:0 8px 22px #1c4b7d0d;transition:.2s}.ex-back:hover {transform:translateY(-1px);border-color:#9dc3f0;background:#f3f8ff}
        .ex-heading {text-align:center;margin:4px 0 27px;padding:4px 0 24px;border-bottom:1px solid #e1ebf7}.ex-eyebrow {font-size:11px;letter-spacing:2.5px;color:#287ee8;font-weight:700}.ex-heading h1 {font-size:clamp(27px,3.2vw,39px);margin:5px 0;color:#123c78;font-weight:700;letter-spacing:.1px;background:linear-gradient(90deg,#123c78 0%,#1877f2 52%,#2f68bd 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}.ex-heading p {margin:0;color:#7188a5;font-size:15px}
        .ex-layout {display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.8fr);gap:22px;align-items:start}
        .ex-panel {background:#fff;border:1px solid #dce9f9;border-radius:22px;box-shadow:0 14px 34px #244e7c0c;padding:24px;min-width:0;position:relative;overflow:hidden}.ex-panel:before {content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#1877f2,#74b3ff,transparent)}
        .ex-panel-title {display:flex;align-items:center;gap:12px;margin-bottom:18px}.ex-panel-icon {width:48px;height:48px;border-radius:15px;background:linear-gradient(145deg,#4f99f6,#1769dc);color:#fff;display:grid;place-items:center;font-size:21px;box-shadow:0 8px 20px #287ee82b}.ex-panel-title h2 {font-size:19px;margin:0;color:#173e70;font-weight:700}.ex-panel-title span {font-size:13px;color:#8195ae;display:block;margin-top:2px}
        .ex-camera {background:linear-gradient(145deg,#245da4,#102f5c);border-radius:18px;padding:10px;overflow:hidden;box-shadow:0 12px 28px #102f5c20,inset 0 0 0 1px #b9d6fa33}.ex-camera canvas {display:block;width:100%;max-width:560px;aspect-ratio:3/4;height:auto;object-fit:contain;border-radius:12px;margin:auto;background:#0b2040}
        .ex-camera-foot {display:flex;justify-content:space-between;align-items:center;gap:10px;color:#c5d8f1;font-size:12px;padding:10px 5px 2px}.ex-live {display:inline-flex;align-items:center;gap:7px}.ex-live i {width:8px;height:8px;border-radius:50%;background:#36c98f;box-shadow:0 0 0 4px #36c98f25;display:inline-block}
        .ex-stats {display:grid;grid-template-columns:1fr 1fr;gap:12px}.ex-stat {background:linear-gradient(145deg,#f9fcff,#f3f8fd);border:1px solid #e2edf9;border-radius:17px;padding:17px}.ex-stat-label {font-size:12px;color:#7890ae;display:flex;align-items:center;gap:7px}.ex-stat-value {font-size:31px;line-height:1.25;font-weight:700;color:#1769d2;margin-top:5px;letter-spacing:-.5px}.ex-stat-value small {font-size:12px;font-weight:500;color:#8195ae;letter-spacing:0}.ex-progress-wrap {margin:18px 0 20px}.ex-progress-top {display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6d85a4;margin-bottom:8px}.ex-progress-track {height:10px;background:#eaf1fa;border-radius:20px;overflow:hidden}.ex-progress-fill {height:100%;border-radius:20px;background:linear-gradient(90deg,#74b9ff,#1877f2);transition:width .3s ease}
        .ex-feedback {padding:15px 16px;border-radius:15px;background:linear-gradient(100deg,rgba(39,112,190,.10),rgba(39,112,190,.04));border:1px solid #dcecff;color:#245c9c;font-size:14px;line-height:1.5;display:flex;gap:10px;align-items:flex-start}.ex-feedback-icon {width:26px;height:26px;border-radius:9px;background:#dcecff;display:grid;place-items:center;flex:none}.ex-tip {margin-top:18px;padding-top:16px;border-top:1px solid #edf2f8}.ex-tip h3 {font-size:13px;margin:0 0 7px;color:#315b8f}.ex-tip p {font-size:12px;color:#8295ae;line-height:1.65;margin:0}.ex-debug {font-size:11px;color:#93a5bb;margin:12px 2px 0;text-align:center}
        @media(max-width:820px){.exercise-shell{padding:17px}.ex-layout{grid-template-columns:1fr}.ex-panel{padding:19px}.ex-camera canvas{max-width:440px}}
        @media(max-width:480px){.exercise-shell{padding:12px}.ex-header{margin-bottom:18px;padding-bottom:15px}.ex-brand-name{font-size:18px}.ex-mark{width:40px;height:40px}.ex-back{padding:9px 11px;font-size:12px}.ex-heading h1{font-size:25px}.ex-panel{padding:13px;border-radius:18px}.ex-stats{gap:8px}.ex-stat{padding:12px}.ex-stat-value{font-size:26px}}
      `}</style>
      <main className="ex-wrap">
        <header className="ex-header">
          <div className="ex-brand">
            <div className="ex-mark" aria-label="FitTrack"><svg viewBox="0 0 32 32" width="25" height="25" aria-hidden="true"><path d="M8 3.5h17l-4.5 7H29L13 28v-11H4l4-13.5Z" fill="#a855f7" /></svg></div>
            <div><div className="ex-brand-name">FitTrack</div><div className="ex-brand-tag">HEALTHY TODAY</div></div>
          </div>
          <button className="ex-back" onClick={() => navigate('/exercises')}>← กลับหน้าเลือกท่า</button>
        </header>
        <section className="ex-heading"><div className="ex-eyebrow">SMART AI WORKOUT</div><h1>{exerciseName}</h1><p>ออกกำลังกายไปพร้อมระบบ AI ตรวจจับท่าทาง</p></section>
        <div className="ex-layout">
          <section className="ex-panel">
            <div className="ex-panel-title"><div className="ex-panel-icon">◎</div><div><h2>กล้องตรวจจับท่าทาง</h2><span>จัดตำแหน่งให้เห็นร่างกายชัดเจน</span></div></div>
            <video ref={videoRef} style={{display:'none'}} playsInline muted />
            <div className="ex-camera"><canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} /><div className="ex-camera-foot"><span className="ex-live"><i/> AI กำลังติดตาม</span><span>วางกล้องให้เห็นตัวเต็ม</span></div></div>
            {SHOW_DEBUG && debug && <p className="ex-debug">{debug}</p>}
          </section>
          <aside className="ex-panel">
            <div className="ex-panel-title"><div className="ex-panel-icon">✦</div><div><h2>ความคืบหน้าของคุณ</h2><span>ทำตามเป้าหมายในแต่ละเซสชัน</span></div></div>
            <div className="ex-stats">
              <div className="ex-stat"><div className="ex-stat-label">✓ ทำไปแล้ว</div><div className="ex-stat-value">{counter}<small> / {targetCount} ครั้ง</small></div></div>
              <div className="ex-stat"><div className="ex-stat-label">♨ พลังงานที่ใช้</div><div className="ex-stat-value">{calories}<small> kcal</small></div></div>
            </div>
            <div className="ex-progress-wrap"><div className="ex-progress-top"><span>ความสำเร็จ</span><strong>{progress}%</strong></div><div className="ex-progress-track"><div className="ex-progress-fill" style={{width:`${progress}%`}}/></div></div>
            <div className="ex-feedback"><span className="ex-feedback-icon">✧</span><span>{feedback}</span></div>
            <div className="ex-tip"><h3>คำแนะนำในการใช้งาน</h3><p>• ยืนห่างจากกล้องพอให้เห็นร่างกายตามที่ระบบต้องใช้<br/>• ออกกำลังกายในบริเวณที่มีแสงสว่างเพียงพอ<br/>• ทำท่าช้า ๆ และต่อเนื่อง เพื่อให้ AI ตรวจจับได้ชัดเจน</p></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
