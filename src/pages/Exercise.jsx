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

// ---------------------------------------------------------------
// HIGH KNEES (ยกเข่าสูง): นับทีละข้างเมื่อเข่ายกขึ้นมาใกล้ระดับสะโพก
// ค่า lift normalize ด้วยความยาวลำตัว: 0 = เข่าอยู่ระดับสะโพก, ติดลบ = เข่าต่ำกว่าสะโพก
//  ยืนปกติ ~ -0.85  |  ยกเข่าสูงถึงระดับสะโพก ~ 0
// ---------------------------------------------------------------
const HK_UP_THRESHOLD = -0.2;      // เข่าสูงกว่าค่านี้ = ยกแล้ว (ยิ่งใกล้ 0 ต้องยกสูงขึ้น)
const HK_DOWN_THRESHOLD = -0.5;    // เข่าต่ำกว่าค่านี้ = วางลงแล้ว
const HK_CONFIRM_FRAMES = 2;
const HK_SMOOTH = 2;
const HK_LEG_COOLDOWN_MS = 350;    // กันนับซ้ำของเข่าข้างเดียวกัน
const HK_COOLDOWN_MS = 150;        // กันนับซ้ำรวมทั้งสองข้าง
const MIN_VISIBILITY_HK = 0.4;

// ---------------------------------------------------------------
// PUNCHES (ชกหมัด): นับทีละข้างเมื่อแขนเหยียดออกไปด้านหน้า แล้วกลับมาตั้งการ์ด
//  reach   = ระยะไหล่->ข้อมือ / ความยาวแขนทั้งท่อน (1 = เหยียดตรงเต็มที่ในภาพ 2 มิติ)
//  forward = ข้อมือยื่นเข้าหากล้องกี่เท่าของลำตัว (ใช้ z ช่วยตอนหันหน้าชกเข้าหากล้อง)
//  height  = ข้อมือสูงกว่าไหล่กี่เท่าของลำตัว (กันนับตอนปล่อยแขนห้อยตรงๆ)
// ---------------------------------------------------------------
const PUNCH_REACH_OUT = 0.9;       // reach เกินนี้ = หมัดเหยียดออกแล้ว
const PUNCH_REACH_IN = 0.65;       // reach ต่ำกว่านี้ = ดึงหมัดกลับแล้ว
const PUNCH_FORWARD_OUT = 0.55;    // ข้อมือยื่นเข้าหากล้องเกินนี้ = ชกแล้ว
const PUNCH_FORWARD_IN = 0.3;
const PUNCH_MIN_HEIGHT = -0.35;    // ข้อมือต้องอยู่ประมาณระดับอกขึ้นไป
const PUNCH_CONFIRM_FRAMES = 2;
const PUNCH_ARM_COOLDOWN_MS = 250; // กันนับซ้ำของแขนข้างเดียวกัน
const PUNCH_COOLDOWN_MS = 120;     // กันนับซ้ำรวมทั้งสองข้าง
const MIN_VISIBILITY_PUNCH = 0.4;

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

    // high knees (แยกสถานะซ้าย/ขวา)
    let hkBuffer = { L: [], R: [] };
    let hkStage = { L: 'down', R: 'down' };
    let hkConfirm = { L: 0, R: 0 };
    let hkLast = { L: 0, R: 0 };

    // punches (แยกสถานะซ้าย/ขวา)
    let punchStage = { L: 'guard', R: 'guard' };
    let punchConfirm = { L: 0, R: 0 };
    let punchLast = { L: 0, R: 0 };

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
      hkBuffer = { L: [], R: [] };
      hkStage = { L: 'down', R: 'down' };
      hkConfirm = { L: 0, R: 0 };
      punchStage = { L: 'guard', R: 'guard' };
      punchConfirm = { L: 0, R: 0 };
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
      const caloriesPerRepMap = { squat: 0.32, jumping_jack: 0.2, high_knees: 0.1, punches: 0.15 };
      const caloriesPerRep = caloriesPerRepMap[exerciseType] ?? 0.2;
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

    // ---------------- HIGH KNEES ----------------
    const getKneeLift = (lm, hipIdx, kneeIdx, side) => {
      const v = MIN_VISIBILITY_HK;
      if (!isVisible(lm[hipIdx], v) || !isVisible(lm[kneeIdx], v)) return null;
      const torso = getTorsoLength(lm);
      const lift = (lm[hipIdx].y - lm[kneeIdx].y) / torso;
      hkBuffer[side].push(lift);
      if (hkBuffer[side].length > HK_SMOOTH) hkBuffer[side].shift();
      return average(hkBuffer[side]);
    };

    const processKnee = (side, lift) => {
      if (lift === null) return;

      if (hkStage[side] === 'down') {
        if (lift > HK_UP_THRESHOLD) {
          hkConfirm[side] += 1;
          if (hkConfirm[side] >= HK_CONFIRM_FRAMES) {
            hkStage[side] = 'up';
            hkConfirm[side] = 0;
            const now = Date.now();
            if (now - hkLast[side] >= HK_LEG_COOLDOWN_MS) {
              hkLast[side] = now;
              if (tryCountRep(HK_COOLDOWN_MS) && !finished) {
                updateFeedback('นับแล้ว! ยกเข่าอีกข้างต่อเลย');
              }
            }
          }
        } else {
          hkConfirm[side] = 0;
        }
      } else if (lift < HK_DOWN_THRESHOLD) {
        // วางเท้าลงแล้ว พร้อมนับครั้งต่อไปของเข่าข้างนี้
        hkStage[side] = 'down';
        hkConfirm[side] = 0;
      }
    };

    const handleHighKnees = (lm) => {
      const left = getKneeLift(lm, 23, 25, 'L');
      const right = getKneeLift(lm, 24, 26, 'R');

      updateDebug(
        `เข่าซ้าย: ${left === null ? '-' : left.toFixed(2)}  |  เข่าขวา: ${
          right === null ? '-' : right.toFixed(2)
        }  |  ซ้าย: ${hkStage.L}  ขวา: ${hkStage.R}`
      );

      if (left === null && right === null) {
        updateFeedback('ถอยให้เห็นสะโพกและเข่าชัดเจน');
        return;
      }

      if (!initialized) {
        // เริ่มนับเมื่อยืนตรง เข่าทั้งสองข้างอยู่ต่ำ
        const leftDown = left === null || left < HK_DOWN_THRESHOLD;
        const rightDown = right === null || right < HK_DOWN_THRESHOLD;
        if (leftDown && rightDown) {
          initialized = true;
          hkStage = { L: 'down', R: 'down' };
          hkConfirm = { L: 0, R: 0 };
          updateFeedback('พร้อมแล้ว วิ่งอยู่กับที่ ยกเข่าสูงได้เลย');
        } else {
          updateFeedback('ยืนตรงก่อนเริ่มนับ');
        }
        return;
      }

      processKnee('L', left);
      processKnee('R', right);
    };

    // ---------------- PUNCHES ----------------
    const getPunchSignal = (lm, shoulderIdx, elbowIdx, wristIdx) => {
      const v = MIN_VISIBILITY_PUNCH;
      const s = lm[shoulderIdx];
      const e = lm[elbowIdx];
      const w = lm[wristIdx];
      if (!isVisible(s, v) || !isVisible(e, v) || !isVisible(w, v)) return null;

      const armLen = Math.hypot(s.x - e.x, s.y - e.y) + Math.hypot(e.x - w.x, e.y - w.y);
      if (armLen < 0.05) return null;

      const torso = getTorsoLength(lm);
      return {
        reach: Math.hypot(s.x - w.x, s.y - w.y) / armLen,
        forward: ((s.z ?? 0) - (w.z ?? 0)) / torso, // z ติดลบ = อยู่ใกล้กล้อง
        height: (s.y - w.y) / torso,
      };
    };

    const processPunch = (side, sig) => {
      if (sig === null) return;

      const heightOk = sig.height > PUNCH_MIN_HEIGHT;
      const extended =
        heightOk && (sig.reach > PUNCH_REACH_OUT || sig.forward > PUNCH_FORWARD_OUT);
      const retracted =
        !heightOk || (sig.reach < PUNCH_REACH_IN && sig.forward < PUNCH_FORWARD_IN);

      if (punchStage[side] === 'guard') {
        if (extended) {
          punchConfirm[side] += 1;
          if (punchConfirm[side] >= PUNCH_CONFIRM_FRAMES) {
            punchStage[side] = 'out';
            punchConfirm[side] = 0;
            const now = Date.now();
            if (now - punchLast[side] >= PUNCH_ARM_COOLDOWN_MS) {
              punchLast[side] = now;
              if (tryCountRep(PUNCH_COOLDOWN_MS) && !finished) {
                updateFeedback('นับแล้ว! ชกอีกข้างต่อเลย');
              }
            }
          }
        } else {
          punchConfirm[side] = 0;
        }
      } else if (retracted) {
        // ดึงหมัดกลับมาแล้ว พร้อมนับหมัดต่อไปของแขนข้างนี้
        punchStage[side] = 'guard';
        punchConfirm[side] = 0;
      }
    };

    const handlePunches = (lm) => {
      const left = getPunchSignal(lm, 11, 13, 15);
      const right = getPunchSignal(lm, 12, 14, 16);

      const fmt = (s) =>
        s === null ? '-' : `${s.reach.toFixed(2)}/${s.forward.toFixed(2)}/${s.height.toFixed(2)}`;
      updateDebug(
        `หมัดซ้าย(reach/fwd/สูง): ${fmt(left)}  |  หมัดขวา: ${fmt(right)}  |  ซ้าย: ${punchStage.L}  ขวา: ${punchStage.R}`
      );

      if (left === null && right === null) {
        updateFeedback('ถอยให้เห็นแขนและลำตัวชัดเจน');
        return;
      }

      if (!initialized) {
        initialized = true;
        updateFeedback('พร้อมแล้ว ตั้งการ์ดแล้วชกหมัดได้เลย');
        return;
      }

      processPunch('L', left);
      processPunch('R', right);
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
          else if (exerciseType === 'high_knees') handleHighKnees(lm);
          else if (exerciseType === 'punches') handlePunches(lm);
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
  const exerciseNames = {
    squat: 'Squat',
    jumping_jack: 'Jumping Jack',
    high_knees: 'High Knees',
    punches: 'Punches',
  };
  const exerciseName = exerciseNames[exerciseType] || 'ออกกำลังกาย';
  const progress = Math.min(100, Math.round((counter / targetCount) * 100));

  return (
    <div className="exercise-page">
      <aside className="exercise-sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-label="FitTrack">
            <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <path d="M8 3.5h17l-4.5 7H29L13 28v-11H4l4-13.5Z" fill="#a855f7" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">FitTrack</div>
            <div className="brand-tagline">Healthy Today</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="side-nav" type="button" onClick={() => navigate('/')}>
            <span>⌂</span><b>หน้าหลัก</b>
          </button>
          <button className="side-nav active" type="button" onClick={() => navigate('/exercises')}>
            <span>✦</span><b>ออกกำลังกาย</b>
          </button>
          <button className="side-nav" type="button" onClick={() => navigate('/history')}>
            <span>◷</span><b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="side-logout" type="button">
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="exercise-main">
        <header className="exercise-header">
          <div className="header-copy">
            <div className="header-logo">FITTRACK</div>
            <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
            <p>ออกกำลังกายไปพร้อมระบบ AI ตรวจจับท่าทาง</p>
          </div>

          <button className="back-pill" type="button" onClick={() => navigate('/exercises')}>
            <span>←</span> กลับหน้าเลือกท่า
          </button>
        </header>

        <div className="exercise-content">
          <section className="panel camera-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">◎</div>
              <div>
                <h2>กล้องตรวจจับท่าทาง</h2>
                <span>จัดตำแหน่งให้เห็นร่างกายชัดเจน</span>
              </div>
              <div className="live-badge"><i /> AI LIVE</div>
            </div>

            <div className="exercise-title-row">
              <div>
                <span className="eyebrow">SMART AI WORKOUT</span>
                <h2>{exerciseName}</h2>
              </div>
              <div className="target-pill">เป้าหมาย {targetCount} ครั้ง</div>
            </div>

            <video ref={videoRef} style={{display:'none'}} playsInline muted />
            <div className="camera-card">
              <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
              <div className="camera-overlay-top">
                <span className="camera-status"><i /> กำลังติดตาม</span>
                <span>AI Pose Detection</span>
              </div>
              <div className="camera-overlay-bottom">
                <span>วางกล้องให้เห็นตัวเต็ม</span>
                <span>{progress}% สำเร็จ</span>
              </div>
            </div>
            {SHOW_DEBUG && debug && <p className="debug-text">{debug}</p>}
          </section>

          <aside className="panel progress-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">✦</div>
              <div>
                <h2>ความคืบหน้าของคุณ</h2>
                <span>ทำตามเป้าหมายในแต่ละเซสชัน</span>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label"><span>✓</span> ทำไปแล้ว</div>
                <div className="stat-value">{counter}<small> / {targetCount}</small></div>
                <div className="stat-note">ครั้ง</div>
              </div>
              <div className="stat-card calorie-stat">
                <div className="stat-label"><span>♨</span> พลังงานที่ใช้</div>
                <div className="stat-value">{calories}<small> kcal</small></div>
                <div className="stat-note">โดยประมาณ</div>
              </div>
            </div>

            <div className="progress-box">
              <div className="progress-top"><span>ความสำเร็จ</span><strong>{progress}%</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}} /></div>
              <div className="progress-foot"><span>เริ่มต้น</span><span>เป้าหมาย {targetCount} ครั้ง</span></div>
            </div>

            <div className="feedback-box">
              <div className="feedback-icon">✧</div>
              <div>
                <span>สถานะปัจจุบัน</span>
                <strong>{feedback}</strong>
              </div>
            </div>

            <div className="tip-box">
              <div className="tip-icon">💡</div>
              <div>
                <h3>คำแนะนำในการใช้งาน</h3>
                <p>ยืนห่างจากกล้องพอให้เห็นร่างกายตามที่ระบบต้องใช้</p>
                <p>ออกกำลังกายในบริเวณที่มีแสงสว่างเพียงพอ</p>
                <p>ทำท่าช้า ๆ และต่อเนื่อง เพื่อให้ AI ตรวจจับได้ชัดเจน</p>
              </div>
            </div>
          </aside>
        </div>

        <footer className="exercise-footer">Small Steps · Big Changes · FITTRACK</footer>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin:0; background:#eef4fb; color:#173b73; font-family:"Anuphan",sans-serif; }
        button { font-family:inherit; }

        .exercise-page {
          min-height:100vh;
          display:flex;
          background:
            radial-gradient(circle at 72% 8%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg,#f9fcff 0%,#eef5ff 48%,#f7fbff 100%);
        }

        .exercise-sidebar {
          position:fixed;
          inset:0 auto 0 0;
          width:232px;
          padding:31px 18px 24px;
          display:flex;
          flex-direction:column;
          z-index:20;
          background:rgba(255,255,255,.93);
          border-right:1px solid #dbe7f4;
          box-shadow:8px 0 30px rgba(35,82,137,.045);
          backdrop-filter:blur(18px);
        }

        .brand-block { display:flex; align-items:center; gap:10px; padding:0 10px 30px; }
        .brand-mark {
          width:42px; height:42px; display:grid; place-items:center; border-radius:13px;
          background:linear-gradient(145deg,#5b9cf6,#1769dc);
          box-shadow:0 9px 20px rgba(24,119,242,.22);
        }
        .brand-mark svg { width:27px; height:30px; display:block; }
        .brand-name { color:#123c78; font-family:"Kanit",sans-serif; font-size:21px; font-weight:600; line-height:1.1; }
        .brand-tagline { margin-top:3px; color:#8aa0b9; font-size:9px; letter-spacing:.5px; }

        .sidebar-nav { display:flex; flex-direction:column; gap:8px; }
        .side-nav {
          width:100%; min-height:51px; padding:0 14px; display:flex; align-items:center; gap:13px;
          border:0; border-radius:15px; cursor:pointer; color:#5c7594; background:transparent;
          font-size:13px; text-align:left; transition:.22s ease;
        }
        .side-nav span { width:31px; height:31px; display:grid; place-items:center; border-radius:10px; color:#4376b8; background:#edf5ff; font-size:16px; }
        .side-nav:hover,.side-nav.active { color:#1558a9; background:#e7f1ff; transform:translateX(2px); }
        .side-nav.active span { color:#fff; background:linear-gradient(145deg,#4d97f5,#1769dc); box-shadow:0 5px 12px rgba(24,119,242,.2); }
        .side-logout { margin-top:auto; padding:12px 14px; border:0; color:#69809a; background:transparent; cursor:pointer; text-align:left; font-size:11px; }
        .side-logout span { margin-right:9px; color:#3b79c5; font-size:17px; }

        .exercise-main { width:calc(100% - 232px); margin-left:232px; min-width:0; padding:0 31px 30px; }
        .exercise-header {
          min-height:122px; padding:25px 10px 20px; display:flex; align-items:center; justify-content:center;
          position:relative; border-bottom:1px solid #dfe9f4;
        }
        .header-copy { text-align:center; }
        .header-logo { margin-bottom:2px; color:#2b7eea; font-size:9px; font-weight:700; letter-spacing:2px; }
        .exercise-header h1 {
          margin:0; color:#11396f; font-family:"Kanit",sans-serif; font-size:clamp(27px,3.2vw,39px); font-weight:600; line-height:1.25;
          background:linear-gradient(90deg,#123c78 0%,#1877f2 52%,#2f68bd 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
        }
        .exercise-header p { margin:5px 0 0; color:#68809f; font-size:13px; line-height:1.5; }
        .back-pill {
          position:absolute; right:0; top:33px; min-height:43px; padding:4px 15px; display:flex; align-items:center; gap:8px;
          border:1px solid #dce8f5; border-radius:24px; color:#315b8f; background:#fff; box-shadow:0 8px 20px rgba(28,75,125,.07); cursor:pointer; transition:.2s ease; font-size:11px; font-weight:600;
        }
        .back-pill:hover { transform:translateY(-2px); border-color:#a9c9ee; box-shadow:0 11px 24px rgba(24,119,242,.13); }
        .back-pill span { font-size:18px; color:#3b79c5; }

        .exercise-content {
          max-width:1230px; margin:0 auto; padding-top:20px; display:grid;
          grid-template-columns:minmax(0,1.7fr) minmax(330px,.9fr); gap:18px; align-items:start;
        }
        .panel {
          position:relative; min-width:0; padding:20px; overflow:hidden; border:1px solid #dbe8f5; border-radius:19px;
          background:rgba(255,255,255,.94); box-shadow:0 10px 28px rgba(35,82,137,.065); transition:transform .22s ease,box-shadow .22s ease;
        }
        .panel::before { content:""; position:absolute; top:0; left:0; width:100%; height:3px; background:linear-gradient(90deg,#1877f2,#74b3ff,transparent); }
        .panel:hover { transform:translateY(-2px); box-shadow:0 15px 35px rgba(35,82,137,.09); }
        .panel-heading { display:flex; align-items:center; gap:10px; min-width:0; margin-bottom:16px; }
        .panel-icon { width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center; border-radius:13px; color:#fff; font-size:18px; background:linear-gradient(145deg,#4e98f6,#1769dc); box-shadow:0 8px 17px rgba(24,119,242,.19); }
        .panel-heading h2 { margin:0; color:#153d78; font-family:"Kanit",sans-serif; font-size:18px; font-weight:600; line-height:1.3; }
        .panel-heading span:not(.live-badge) { display:block; margin-top:2px; color:#8095ad; font-size:9.5px; line-height:1.4; }
        .live-badge { margin-left:auto; display:inline-flex!important; align-items:center; gap:6px; padding:6px 9px; border-radius:999px; color:#21845c; background:#e7f8ef; border:1px solid #d1f0df; font-size:8.5px!important; font-weight:700; white-space:nowrap; }
        .live-badge i { width:6px; height:6px; border-radius:50%; background:#2fbd7e; box-shadow:0 0 0 3px rgba(47,189,126,.13); }

        .exercise-title-row { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin:3px 2px 13px; }
        .eyebrow { color:#287ee8!important; font-size:9px!important; font-weight:700; letter-spacing:2px; }
        .exercise-title-row h2 { margin:3px 0 0; color:#123c78; font-family:"Kanit",sans-serif; font-size:25px; font-weight:600; }
        .target-pill { flex:0 0 auto; padding:7px 10px; border:1px solid #d8e9fb; border-radius:999px; color:#3175c5; background:#eaf3ff; font-size:9px; font-weight:700; }

        .camera-card { position:relative; padding:10px; overflow:hidden; border-radius:18px; background:linear-gradient(145deg,#245da4,#102f5c); box-shadow:0 12px 28px rgba(16,47,92,.12),inset 0 0 0 1px rgba(185,214,250,.2); }
        .camera-card canvas { display:block; width:100%; max-width:560px; aspect-ratio:3/4; height:auto; object-fit:contain; border-radius:12px; margin:auto; background:#0b2040; }
        .camera-overlay-top,.camera-overlay-bottom { position:absolute; left:20px; right:20px; display:flex; align-items:center; justify-content:space-between; gap:10px; color:#d6e7fb; font-size:9px; pointer-events:none; }
        .camera-overlay-top { top:19px; }
        .camera-overlay-bottom { bottom:18px; }
        .camera-status { display:inline-flex!important; align-items:center; gap:6px; padding:5px 8px; border-radius:999px; color:#d9f8e9!important; background:rgba(21,46,79,.66); backdrop-filter:blur(5px); }
        .camera-status i { width:6px; height:6px; border-radius:50%; background:#36c98f; box-shadow:0 0 0 3px rgba(54,201,143,.15); }
        .debug-text { margin:9px 2px 0; color:#93a5bb; font-size:9px; text-align:center; }

        .stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
        .stat-card { min-height:143px; padding:15px; border:1px solid #e2ebf5; border-radius:15px; background:linear-gradient(145deg,#f9fcff,#f3f8fd); transition:.2s ease; }
        .stat-card:hover { transform:translateY(-2px); border-color:#c9ddef; box-shadow:0 8px 20px rgba(24,119,242,.07); }
        .stat-label { display:flex; align-items:center; gap:7px; color:#7890ae; font-size:10px; font-weight:600; }
        .stat-label span { width:25px; height:25px; display:grid; place-items:center; border-radius:8px; color:#2f7ee8; background:#e6f1ff; font-size:12px; }
        .calorie-stat .stat-label span { color:#ff9d31; background:#fff0db; }
        .stat-value { margin-top:7px; color:#123c78; font-family:"Kanit",sans-serif; font-size:31px; font-weight:600; line-height:1.15; }
        .stat-value small { color:#66809e; font-family:"Anuphan",sans-serif; font-size:10px; font-weight:500; }
        .stat-note { margin-top:5px; color:#8a9caf; font-size:8.5px; }

        .progress-box { margin:15px 0; padding:15px; border:1px solid #e2ebf5; border-radius:15px; background:#fff; }
        .progress-top,.progress-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; color:#6d85a4; font-size:10px; }
        .progress-top { margin-bottom:8px; }
        .progress-top strong { color:#1769d2; font-family:"Kanit",sans-serif; font-size:15px; }
        .progress-track { height:10px; overflow:hidden; border-radius:20px; background:#eaf1fa; }
        .progress-fill { height:100%; border-radius:20px; background:linear-gradient(90deg,#74b9ff,#1877f2); transition:width .3s ease; }
        .progress-foot { margin-top:6px; color:#9aabba; font-size:8px; }

        .feedback-box { display:flex; gap:10px; align-items:flex-start; padding:14px; border:1px solid #dcecff; border-radius:15px; background:linear-gradient(100deg,rgba(39,112,190,.10),rgba(39,112,190,.04)); }
        .feedback-icon { width:29px; height:29px; flex:0 0 29px; display:grid; place-items:center; border-radius:9px; color:#2c70b8; background:#dcecff; }
        .feedback-box span:not(.feedback-icon) { display:block; color:#7d93ac; font-size:8px; margin-bottom:2px; }
        .feedback-box strong { display:block; color:#245c9c; font-size:11px; line-height:1.5; font-weight:600; }

        .tip-box { display:flex; gap:10px; margin-top:15px; padding:14px; border-top:1px solid #edf2f8; background:linear-gradient(145deg,#fbfdff,#f6faff); border-radius:14px; }
        .tip-icon { width:32px; height:32px; flex:0 0 32px; display:grid; place-items:center; border-radius:10px; background:#edf5ff; font-size:15px; }
        .tip-box h3 { margin:1px 0 6px; color:#315b8f; font-family:"Kanit",sans-serif; font-size:12px; font-weight:600; }
        .tip-box p { margin:0 0 4px; color:#8295ae; font-size:9px; line-height:1.5; }
        .tip-box p::before { content:'• '; color:#4c91e7; }

        .exercise-footer { max-width:1230px; margin:18px auto 0; padding:13px 0 0; border-top:1px solid #dfe9f4; color:#9aaabd; text-align:center; font-size:9px; letter-spacing:.3px; }

        @media(max-width:900px){
          .exercise-sidebar { width:190px; }
          .exercise-main { width:calc(100% - 190px); margin-left:190px; padding:0 20px 25px; }
          .exercise-content { grid-template-columns:1fr; }
          .back-pill { right:8px; }
        }
        @media(max-width:680px){
          .exercise-sidebar { position:static; width:100%; height:auto; padding:14px; border-right:0; border-bottom:1px solid #dbe7f4; }
          .exercise-page { display:block; }
          .brand-block { padding:0 5px 12px; }
          .sidebar-nav { flex-direction:row; }
          .side-nav { min-height:43px; justify-content:center; padding:0 8px; }
          .side-nav b { font-size:10px; }
          .side-nav span { width:27px; height:27px; }
          .side-logout { display:none; }
          .exercise-main { width:100%; margin-left:0; padding:0 12px 20px; }
          .exercise-header { min-height:145px; padding:20px 5px 62px; }
          .back-pill { top:auto; bottom:13px; right:5px; left:5px; justify-content:center; }
          .exercise-header h1 { font-size:26px; }
          .exercise-header p { font-size:11px; }
          .panel { padding:14px; border-radius:17px; }
          .stats-grid { gap:8px; }
          .stat-card { padding:12px; }
          .stat-value { font-size:26px; }
          .camera-overlay-top,.camera-overlay-bottom { left:16px; right:16px; }
          .live-badge { display:none!important; }
        }
        @media(max-width:420px){
          .side-nav b { display:none; }
          .side-nav { flex:1; }
          .exercise-title-row { align-items:flex-start; flex-direction:column; }
          .target-pill { align-self:flex-start; }
          .panel-heading h2 { font-size:16px; }
        }
      `}</style>
    </div>
  );
}