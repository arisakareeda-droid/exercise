import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// แคชชื่อผู้ใช้ (key เดียวกับ Dashboard) เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที
const NAME_CACHE_KEY = 'fittrack-user-name';
const getCachedName = () => {
  try { return localStorage.getItem(NAME_CACHE_KEY) || ''; } catch { return ''; }
};
const setCachedName = (name) => {
  try { localStorage.setItem(NAME_CACHE_KEY, name); } catch { /* storage optional */ }
};
const clearCachedName = () => {
  try { localStorage.removeItem(NAME_CACHE_KEY); } catch { /* storage optional */ }
};
const getInitialName = () => getCachedName() || auth.currentUser?.displayName || '';

// ผลคำนวณ BMI/TDEE ของ Dashboard (key เดียวกัน) ล้างตอนออกจากระบบเหมือนกัน
const HEALTH_CACHE_KEY = 'fittrack-health-result';
const clearHealthCache = () => {
  try { localStorage.removeItem(HEALTH_CACHE_KEY); } catch { /* storage optional */ }
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ยอดแคลอรี่จากอาหารที่บันทึกไว้ของวันนี้ (key เดียวกับ Dashboard)
const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

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
const SQUAT_DEPTH_DOWN = 0.2;  // ย่อลึกเกินนี้ = ย่อแล้ว (ปรับกลับจาก 0.22)
const SQUAT_DEPTH_UP = 0.08;  // ยืนขึ้นเกือบตรงก็พอ ไม่ต้องตรงเป๊ะ (เดิม 0.05 ทำให้ยืนแล้วไม่นับ)
const SQUAT_ANGLE_DOWN = 105;
const SQUAT_ANGLE_UP = 160;
const SQUAT_CONFIRM_FRAMES = 5;  // (เดิม 8)
const SQUAT_COOLDOWN_MS = 900;
const SQUAT_SMOOTH = 5;
const BASELINE_DECAY = 0.9995;     // ค่าอ้างอิงความสูงตอนยืนค่อยๆ ลดเอง (รองรับขยับเข้า-ออกกล้อง)
const MIN_VISIBILITY_SQUAT = 0.55;
const SQUAT_SHOULDER_DOWN = 0.08;  // ไหล่ต้องลดลงด้วย (กันแค่ก้มหรือขยับสะโพกอย่างเดียว)
const SQUAT_MIN_TORSO_RATIO = 0.55; // ลำตัวต้องไม่ก้มหรือเอนมากเกินไป (เทียบตอนยืน)
const SQUAT_MIN_HOLD_MS = 300;  // ค้างท่าย่ออย่างน้อยเท่านี้ (เดิม 400)
const SQUAT_MIN_REP_MS = 1000;  // 1 ครั้งต้องใช้เวลาอย่างน้อยเท่านี้ (เดิม 1400)
const SQUAT_MAX_FOOT_LEVEL = 0.15;  // ข้อเท้า 2 ข้างต่างระดับเกินนี้ (เทียบช่วงสะโพก->เท้า) = ยกเท้า ไม่นับ
const SQUAT_ANKLE_VISIBILITY = 0.4; // ข้อเท้ามักมั่นใจต่ำกว่าจุดอื่น จึงใช้เกณฑ์ที่ผ่อนกว่า
const SQUAT_MAX_KNEE_ASYM = 40;  // มุมเข่า 2 ข้างต่างกันเกินนี้ (องศา) = ขยับขาข้างเดียว/ตีเข่า ไม่นับ

// ---------------------------------------------------------------
// JUMPING JACK
// ---------------------------------------------------------------
const ARM_SMOOTHING_WINDOW = 5;
const JJ_CONFIRM_FRAMES = 4;  // (เดิม 3)
// ค่าแขน normalize ด้วยความยาวลำตัว: 0 = ข้อมือระดับไหล่, + = สูงกว่าไหล่, - = ต่ำกว่าไหล่
const ARM_UP_THRESHOLD = 0.35;  // ข้อมือต้องสูงกว่าไหล่ชัดเจน ทั้งสองแขน (เดิม 0.18)
const ARM_DOWN_THRESHOLD = -0.5;  // แขนต้องลงต่ำจริง ทั้งสองแขน (เดิม -0.25)
const FALLBACK_TORSO = 0.3;
const REQUIRE_LEGS_SPREAD = true;  // บังคับให้ต้องกางขาด้วย (เดิม false)
const LEG_SPREAD_RATIO = 1.5;  // ระยะข้อเท้า / ความกว้างไหล่ ที่ถือว่า "กางขา" (เดิม 1.2)
const JJ_COOLDOWN_MS = 800;  // (เดิม 600)
const MIN_VISIBILITY_ARM = 0.5;
const LEG_CLOSED_RATIO = 1.15;     // ข้อเท้าห่างน้อยกว่านี้ = เท้าชิด (ท่าเริ่มต้น/ท่ากลับ)
const LEG_MAX_LEVEL_DIFF = 0.2;    // ข้อเท้า 2 ข้างต่างระดับเกินนี้ = ยกขาข้างเดียว ไม่นับ
const JJ_BOTH_FRAMES = 3;          // ต้องเห็น "แขนอยู่สูง + ขากางกว้าง" พร้อมกันอย่างน้อยกี่เฟรม
const JJ_MIN_UP_MS = 150;          // ต้องค้างแขนอยู่ข้างบนอย่างน้อยเท่านี้

// ---------------------------------------------------------------
// HIGH KNEES (ยกเข่าสูง): นับทีละข้างเมื่อเข่ายกขึ้นมาใกล้ระดับสะโพก
// ค่า lift normalize ด้วยความยาวลำตัว: 0 = เข่าอยู่ระดับสะโพก, ติดลบ = เข่าต่ำกว่าสะโพก
//  ยืนปกติ ~ -0.85  |  ยกเข่าสูงถึงระดับสะโพก ~ 0
// ---------------------------------------------------------------
const HK_UP_THRESHOLD = -0.12;  // ต้องยกเข่าสูงขึ้น (เดิม -0.2)
const HK_DOWN_THRESHOLD = -0.6;  // ต้องวางเท้าลงจริง (เดิม -0.5)
const HK_CONFIRM_FRAMES = 3;  // (เดิม 2)
const HK_SMOOTH = 3;  // (เดิม 2)
const HK_LEG_COOLDOWN_MS = 450;  // (เดิม 350)
const HK_COOLDOWN_MS = 250;  // (เดิม 150)
const MIN_VISIBILITY_HK = 0.5;
const HK_OTHER_DOWN_MAX = -0.4;    // ตอนยกเข่าข้างหนึ่ง อีกข้างต้องอยู่ต่ำ (กันกระโดดตุ๊ยเข่า/นั่ง)
const REQUIRE_ALTERNATE = true;    // ต้องสลับซ้าย-ขวา ยกข้างเดิมซ้ำไม่นับ

// ---------------------------------------------------------------
// PUNCHES (ชกหมัด): นับทีละข้างเมื่อแขนเหยียดออกไปด้านหน้า แล้วกลับมาตั้งการ์ด
//  reach   = ระยะไหล่->ข้อมือ / ความยาวแขนทั้งท่อน (1 = เหยียดตรงเต็มที่ในภาพ 2 มิติ)
//  forward = ข้อมือยื่นเข้าหากล้องกี่เท่าของลำตัว (ใช้ z ช่วยตอนหันหน้าชกเข้าหากล้อง)
//  height  = ข้อมือสูงกว่าไหล่กี่เท่าของลำตัว (กันนับตอนปล่อยแขนห้อยตรงๆ)
// ---------------------------------------------------------------
const PUNCH_REACH_OUT = 0.9;  // หันข้าง: แขนเหยียดตรงเกินนี้ (เดิม 0.93)
const PUNCH_REACH_IN = 0.7;
const PUNCH_FORWARD_OUT = 0.5;  // หันหน้า: ข้อมือยื่นเข้าหากล้องเกินนี้ (เดิม 0.7)
const PUNCH_FORWARD_IN = 0.3;
const PUNCH_MIN_HEIGHT = -0.45;  // ข้อมือต่ำสุดที่ยังถือว่าอยู่ระดับอก
const PUNCH_CONFIRM_FRAMES = 2;  // ท่าเหยียดต้องต่อเนื่องกี่เฟรมถึงนับ (เดิม 4 หมัดเร็วจึงหลุด)
const PUNCH_ARM_COOLDOWN_MS = 300;  // (เดิม 400)
const PUNCH_COOLDOWN_MS = 120;  // (เดิม 200)
const MIN_VISIBILITY_PUNCH = 0.4;  // กำปั้นพุ่งเข้าหากล้องมักมั่นใจต่ำชั่วขณะ จึงใช้เกณฑ์ที่ผ่อนกว่า (เดิม 0.5)
const PUNCH_MAX_HEIGHT = 0.5;  // ข้อมือสูงสุดเทียบไหล่ (หมัดระดับหน้าอาจสูงกว่าไหล่)
const PUNCH_SMOOTH = 2;  // เฉลี่ยกี่เฟรม (เดิม 3 หน่วงเกินไปสำหรับหมัดเร็ว)
const PUNCH_Z_STEP = 0.1;  // หันหน้า: ไหล่->ศอก->ข้อมือ ไล่ระดับเข้าหากล้อง (เดิม 0.2)
const PUNCH_ELBOW_MIN = 160;       // ข้อศอกต้องเหยียดตรงอย่างน้อยกี่องศา (เดิม 150 → เข้มขึ้น กันฮุก/อัปเปอร์คัตที่แขนยังงอ)
const PUNCH_FRONT_ON = 0.5;        // ความกว้างไหล่/ลำตัว มากกว่านี้ = หันหน้าเข้ากล้อง
const PUNCH_FRONT_OFF = 0.35;      // น้อยกว่านี้ = หันข้าง (คั่นกลาง = คงโหมดเดิม กันสลับไปมาตอนลำตัวหมุน)
const PUNCH_REARM_ELBOW = 135;     // ข้อศอกงอต่ำกว่านี้ = ดึงหมัดกลับแล้ว พร้อมนับหมัดต่อไป
const PUNCH_REARM_FRAMES = 2;      // ต้องงออยู่กี่เฟรมถึงพร้อมนับครั้งต่อไป (กันค่าสั่นทำให้นับซ้ำ)
// --- ตรวจ "เส้นทางของข้อมือ" จากท่าการ์ดจนถึงท่าเหยียด (หน่วย: เท่าของความยาวลำตัว) ---
const PUNCH_TRAJ_FRAMES = 12;  // เก็บเส้นทางข้อมือย้อนหลังกี่เฟรม (ไม่ล้างตอนดึงหมัดกลับ หาจุดเริ่มหมัดเอง)
const PUNCH_MAX_DY = 0.3;  // ตลอดเส้นทางหมัด ข้อมือขึ้น/ลงจากจุดเริ่มเกินนี้ = อัปเปอร์คัต/ฮุกยกศอก ไม่นับ (เดิม 0.4 และเช็กแค่จุดจบ)
const PUNCH_MAX_DLAT = 0.35;  // หันหน้า: ตลอดเส้นทาง ข้อมือเหวี่ยงไปด้านข้างเกินนี้ = ฮุก ไม่นับ (เดิม 0.5)
const PUNCH_MAX_LAT = 0.6;  // หันหน้า: ข้อมืออยู่ห่างแนวไหล่เกินนี้ = ฮุก ไม่นับ (เดิม 0.8)
const PUNCH_TRAJ_MIN_FRAMES = 4;   // ข้อมูลเส้นทางน้อยกว่านี้ = ตัดสินไม่ได้ → ไม่นับ (เดิมถือว่าเป็นหมัดตรง)
const PUNCH_START_ELBOW_MAX = 140; // จุดเริ่มหมัดต้องเป็นท่าการ์ด (ศอกงอ) ไม่ใช่แขนเหยียดอยู่แล้วแล้วเหวี่ยง
const PUNCH_MIN_DFWD = 0.2;        // หันหน้า: ข้อมือต้องยื่นเข้าหากล้องเพิ่มจากจุดเริ่มอย่างน้อยเท่านี้ (หมัดตรง = พุ่งไปข้างหน้า)
const PUNCH_MIN_TRAVEL = 0.3;      // หันข้าง: ข้อมือต้องเคลื่อนไปข้างหน้าอย่างน้อยเท่านี้ (เท่าของลำตัว)
const PUNCH_MAX_SLOPE = 0.45;      // หันข้าง: ทิศหมัดเอียงขึ้น/ลงได้ไม่เกินสัดส่วนนี้ของระยะที่พุ่งไป (~24°) เกิน = อัปเปอร์คัต
const PUNCH_MAX_BOW = 0.25;        // หันข้าง: เส้นทางโค้งออกจากเส้นตรงได้ไม่เกินสัดส่วนนี้ของระยะที่พุ่งไป เกิน = ฮุก (วงสวิง)

// ทั่วไป
const MIN_VISIBILITY_DRAW = 0.4;
const POSE_LOST_RESET_FRAMES = 15;
const INIT_HOLD_FRAMES = 12;       // ต้องยืนท่าเริ่มต้นนิ่งๆ กี่เฟรมก่อนเริ่มนับ
const SHOW_DEBUG = true;           // แสดงค่า depth / มุมเข่า ใต้ภาพ ไว้ช่วยจูน

const calculateAngle = (a, b, c) => {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

const calculateAngle3D = (a, b, c) => {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const mu = Math.hypot(...u);
  const mv = Math.hypot(...v);
  if (mu === 0 || mv === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (mu * mv)))) * 180) / Math.PI;
};

const isVisible = (p, min = 0.65) => !!p && (p.visibility ?? 1) > min;
const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

export default function Exercise() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';
  const parsedTarget = parseInt(searchParams.get('target') || '10', 10);
  const targetCount = Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : 10;

  // ------------------------------------------------------------------
  // แผนผังท่าออกกำลังกาย: ใช้ id ที่ส่งมาจาก ExerciseSetting โดยตรง
  // เพื่อให้หน้า Exercise รู้ว่าผู้ใช้เลือกท่าใด โดยไม่ต้อง hard-code แค่ 4 ท่า
  // ------------------------------------------------------------------
  const exerciseModeMap = {
    // ขา / squat pattern
    squat: 'squat', goblet_squat: 'squat', barbell_squat: 'squat', band_squat: 'squat',
    kettlebell_goblet_squat: 'squat',
    // push / chest
    push_up: 'push', diamond_push_up: 'push', bench_incline_pushup: 'push',
    dumbbell_bench_press: 'push', barbell_bench_press: 'push', band_chest_press: 'push',
    chest_press_machine: 'push',
    // แขนงอ/เหยียด
    dumbbell_curl: 'arm', cable_triceps_pushdown: 'arm', bench_dip: 'arm',
    // ยกแขน / press / lateral raise
    dumbbell_shoulder_press: 'arm_raise', dumbbell_lateral_raise: 'arm_raise',
    barbell_overhead_press: 'arm_raise', shoulder_press_machine: 'arm_raise',
    // ดึง/พาย
    dumbbell_row: 'row', cable_row: 'row', lat_pulldown: 'row', band_pull_apart: 'row',
    // สะโพก/ลำตัว
    barbell_deadlift: 'hinge', kettlebell_swing: 'hinge', bird_dog: 'knee',
    bench_step_up: 'knee', high_knees: 'high_knees',
    // น่อง
    dumbbell_calf_raise: 'calf', seated_calf_raise: 'calf', leg_press: 'leg_press',
    // ท้อง
    cable_crunch: 'crunch', kettlebell_russian_twist: 'twist',
    // static
    plank: 'plank',
    // ท่าเดิมที่มี detector เฉพาะ
    jumping_jack: 'jumping_jack', punches: 'punches',
    mountain_climber: 'knee', reverse_snow_angel: 'arm_raise',
    // ถ้ามีท่าใหม่จากหน้า Setting แต่ยังไม่ได้กำหนด mode จะใช้ generic movement
  };
  const exerciseMode = exerciseModeMap[exerciseType] || 'generic';

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraControlRef = useRef(null);

  // เริ่มต้นด้วยกล้องปิด ผู้ใช้กด "เปิดกล้อง" เองเมื่อพร้อม
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const cameraEnabledRef = useRef(false);
  cameraEnabledRef.current = cameraEnabled;
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
    let readyFrames = 0;            // นับเฟรมที่ยืนท่าเริ่มต้นนิ่งๆ
    let shoulderBuffer = [];
    let torsoBuffer = [];
    let asymBuffer = [];
    let feetBuffer = [];
    let baselineShoulderSpan = 0;
    let baselineTorso = 0;
    let downSince = 0;
    let cycleStart = 0;

    // jumping jack
    let armBuffer = [];
    let skipNextCount = false;
    let legsVisibleInCycle = false;
    let legsClosedSeen = false;     // เห็นเท้าชิดตอนอยู่ท่าแขนลง
    let closedAtStart = false;      // เริ่มรอบนี้จากท่าเท้าชิดหรือไม่
    let bothFrames = 0;             // จำนวนเฟรมที่แขนสูง + ขากางพร้อมกัน
    let liftedOneLegSeen = false;
    let upSince = 0;

    // high knees (แยกสถานะซ้าย/ขวา)
    let hkBuffer = { L: [], R: [] };
    let hkStage = { L: 'down', R: 'down' };
    let hkConfirm = { L: 0, R: 0 };
    let hkLast = { L: 0, R: 0 };
    let lastHkSide = null;

    // punches (แยกสถานะซ้าย/ขวา)
    let punchStage = { L: 'guard', R: 'guard' };
    let punchConfirm = { L: 0, R: 0 };
    let punchLast = { L: 0, R: 0 };
    let punchBuf = { L: [], R: [] };
    let punchTraj = { L: [], R: [] };
    let punchTrajOk = { L: false, R: false };
    let punchWhy = { L: '', R: '' };
    let punchRearm = { L: 0, R: 0 };
    let punchFront = true;
    let frontRatioBuf = [];
    let imgAspect = CANVAS_W / CANVAS_H;

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
      shoulderBuffer = [];
      torsoBuffer = [];
      asymBuffer = [];
      feetBuffer = [];
      punchBuf = { L: [], R: [] };
      punchTraj = { L: [], R: [] };
      punchTrajOk = { L: false, R: false };
      punchRearm = { L: 0, R: 0 };
      frontRatioBuf = [];
      baselineShoulderSpan = 0;
      baselineTorso = 0;
      readyFrames = 0;
      lastHkSide = null;
      legsClosedSeen = false;
      closedAtStart = false;
      bothFrames = 0;
      liftedOneLegSeen = false;
      legsVisibleInCycle = false;
      baselineSpan = 0;
      candidate = null;
      candidateFrames = 0;
      initialized = false;
      stage = null;
    };

    // ต้องยืนท่าเริ่มต้นนิ่งๆ ต่อเนื่องก่อนเริ่มนับ
    const holdReady = (cond) => {
      readyFrames = cond ? readyFrames + 1 : 0;
      return readyFrames >= INIT_HOLD_FRAMES;
    };

    const tryCountRep = (cooldown) => {
      if (finished) return false;
      const now = Date.now();
      if (now - lastRepTime < cooldown) return false;
      lastRepTime = now;

      count += 1;
      const caloriesPerRepMap = { squat: 0.32, jumping_jack: 0.2, high_knees: 0.1, punches: 0.15, push: 0.35, arm: 0.18, arm_raise: 0.2, row: 0.25, hinge: 0.3, knee: 0.12, calf: 0.12, crunch: 0.18, twist: 0.15, plank: 0.08, generic: 0.2 };
      const caloriesPerRep = caloriesPerRepMap[exerciseMode] ?? 0.2;
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
    const pushSmooth = (buf, v) => {
      buf.push(v);
      if (buf.length > SQUAT_SMOOTH) buf.shift();
      return average(buf);
    };

    const getSquatSignals = (lm) => {
      const v = MIN_VISIBILITY_SQUAT;

      // มุมเข่า (แยกซ้าย/ขวา เพื่อตรวจว่าย่อสองขาพร้อมกันหรือไม่)
      let leftA = null;
      let rightA = null;
      if (isVisible(lm[23], v) && isVisible(lm[25], v) && isVisible(lm[27], v)) {
        leftA = calculateAngle(lm[23], lm[25], lm[27]);
      }
      if (isVisible(lm[24], v) && isVisible(lm[26], v) && isVisible(lm[28], v)) {
        rightA = calculateAngle(lm[24], lm[26], lm[28]);
      }
      const angleList = [leftA, rightA].filter((x) => x !== null);
      const angle = angleList.length ? pushSmooth(angleBuffer, average(angleList)) : null;
      const kneeAsym =
        leftA !== null && rightA !== null
          ? pushSmooth(asymBuffer, Math.abs(leftA - rightA))
          : null;

      const hips = [lm[23], lm[24]].filter((p) => isVisible(p, v));
      const ankles = [lm[27], lm[28]].filter((p) => isVisible(p, SQUAT_ANKLE_VISIBILITY));
      const shoulders = [lm[11], lm[12]].filter((p) => isVisible(p, v));

      let depth = null;          // สะโพกลดลงกี่ % (วัดจากเท้าที่วางพื้น ไม่ใช่ค่าเฉลี่ย)
      let shoulderDepth = null;  // ไหล่ลดลงกี่ %
      let torsoRatio = null;     // ลำตัว (ไหล่->สะโพก) เหลือกี่ % เทียบตอนยืน
      let feetLevel = null;      // ข้อเท้า 2 ข้างต่างระดับกันแค่ไหน (ต้องเห็นเท้าทั้งสอง)
      if (hips.length && ankles.length) {
        const hipY = average(hips.map((p) => p.y));
        // ใช้ข้อเท้าที่ต่ำสุด (เท้าที่วางพื้น) เป็นฐาน ยกเท้าข้างหนึ่งจะไม่ทำให้ค่าเปลี่ยน
        const groundY = Math.max(...ankles.map((p) => p.y));
        const span = groundY - hipY;
        if (span > 0.1) {
          const smoothSpan = pushSmooth(spanBuffer, span);
          baselineSpan = Math.max(smoothSpan, baselineSpan * BASELINE_DECAY);
          depth = Math.max(0, 1 - smoothSpan / baselineSpan);

          if (ankles.length === 2) {
            feetLevel = pushSmooth(feetBuffer, Math.abs(ankles[0].y - ankles[1].y) / span);
          }

          if (shoulders.length) {
            const shoulderY = average(shoulders.map((p) => p.y));

            const sSpan = groundY - shoulderY;
            if (sSpan > 0.2) {
              const smoothS = pushSmooth(shoulderBuffer, sSpan);
              baselineShoulderSpan = Math.max(smoothS, baselineShoulderSpan * BASELINE_DECAY);
              shoulderDepth = Math.max(0, 1 - smoothS / baselineShoulderSpan);
            }

            const tLen = hipY - shoulderY;
            if (tLen > 0.05) {
              const smoothT = pushSmooth(torsoBuffer, tLen);
              baselineTorso = Math.max(smoothT, baselineTorso * BASELINE_DECAY);
              torsoRatio = smoothT / baselineTorso;
            }
          }
        }
      }

      return { angle, kneeAsym, depth, shoulderDepth, torsoRatio, feetLevel };
    };

    const handleSquat = (lm) => {
      const { angle, kneeAsym, depth, shoulderDepth, torsoRatio, feetLevel } = getSquatSignals(lm);

      updateDebug(
        `depth: ${depth === null ? '-' : Math.round(depth * 100) + '%'}  |  ไหล่: ${
          shoulderDepth === null ? '-' : Math.round(shoulderDepth * 100) + '%'
        }  |  ลำตัว: ${torsoRatio === null ? '-' : Math.round(torsoRatio * 100) + '%'}  |  เท้าต่างระดับ: ${
          feetLevel === null ? '-' : feetLevel.toFixed(2)
        }  |  เข่าต่างกัน: ${kneeAsym === null ? '-' : Math.round(kneeAsym) + '°'}  |  มุมเข่า: ${
          angle === null ? '-' : Math.round(angle) + '°'
        }  |  สถานะ: ${stage ?? '-'}`
      );

      // ต้องเห็นสะโพกและเท้าทั้งสองข้าง ถึงจะแยกท่าสควอทออกจากการยกเท้า/ตีเข่าได้
      if (depth === null || feetLevel === null) {
        readyFrames = 0;
        updateFeedback('ถอยให้เห็นสะโพกถึงเท้าทั้งสองข้าง');
        return;
      }

      const shoulderOk = shoulderDepth === null || shoulderDepth > SQUAT_SHOULDER_DOWN;
      const torsoOk = torsoRatio === null || torsoRatio > SQUAT_MIN_TORSO_RATIO;
      const feetOk = feetLevel < SQUAT_MAX_FOOT_LEVEL;                       // เท้าทั้งสองติดพื้น
      const kneesOk = kneeAsym === null || kneeAsym < SQUAT_MAX_KNEE_ASYM;   // ย่อสองขาพร้อมกัน
      const isDown = depth > SQUAT_DEPTH_DOWN && shoulderOk && torsoOk && feetOk && kneesOk;
      const isUp = depth < SQUAT_DEPTH_UP;

      const now = Date.now();

      if (!initialized) {
        if (holdReady(isUp || isDown)) {
          initialized = true;
          cycleStart = now;
          if (isUp) {
            stage = 'up';
            updateFeedback('พร้อมแล้ว ย่อตัวลงช้าๆ ได้เลย');
          } else {
            stage = 'down';
            downSince = now;
            updateFeedback('อยู่ในท่าย่อ ยืนขึ้นเพื่อเริ่มนับ');
          }
        } else {
          updateFeedback('ยืนตรงนิ่งๆ ก่อนเริ่มนับ');
        }
        return;
      }

      if (isDown) {
        if (confirm('down', SQUAT_CONFIRM_FRAMES)) {
          if (stage !== 'down') {
            downSince = now;
            updateFeedback('ดีมาก! ค้างไว้แป๊บ แล้วดันตัวขึ้นตรงๆ');
          }
          stage = 'down';
        }
      } else if (isUp) {
        if (confirm('up', SQUAT_CONFIRM_FRAMES)) {
          if (stage === 'down') {
            const heldMs = now - downSince;
            const cycleMs = now - cycleStart;
            if (heldMs >= SQUAT_MIN_HOLD_MS && cycleMs >= SQUAT_MIN_REP_MS) {
              tryCountRep(SQUAT_COOLDOWN_MS);
              updateFeedback('นับแล้ว! ย่อตัวลงอีกครั้ง');
            } else {
              updateFeedback('เร็วเกินไป ย่อลงช้าๆ แล้วค้างไว้สักครู่');
            }
          }
          if (stage !== 'up') cycleStart = now;
          stage = 'up';
        }
      } else {
        // อยู่ระหว่างทาง: ไม่เปลี่ยนสถานะ และไม่ล้างตัวนับเฟรมยืนยัน
        // (สัญญาณสั่นแค่เฟรมสองเฟรมที่จุดต่ำสุดจะไม่ทำให้ต้องเริ่มนับใหม่)
        if (depth > SQUAT_DEPTH_DOWN && !feetOk) {
          updateFeedback('วางเท้าทั้งสองข้างให้ติดพื้น อย่ายกเท้า');
        } else if (depth > SQUAT_DEPTH_DOWN && !kneesOk) {
          updateFeedback('ย่อสองขาพร้อมกัน อย่าตีเข่าข้างเดียว');
        } else if (depth > SQUAT_DEPTH_DOWN && !torsoOk) {
          updateFeedback('ตั้งหลังให้ตรงขึ้น อย่าก้มตัว');
        } else if (depth > SQUAT_DEPTH_DOWN && !shoulderOk) {
          updateFeedback('ย่อลงทั้งตัว ไม่ใช่แค่ก้ม');
        } else if (stage === 'up') {
          updateFeedback('ย่อลงอีกนิด');
        }
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

    // คืนค่า { lo, hi }: lo = แขนที่ต่ำกว่า, hi = แขนที่สูงกว่า (ต้องเห็นแขนทั้งสองข้าง)
    const getSmoothedArms = (lm) => {
      const v = MIN_VISIBILITY_ARM;
      if (!(isVisible(lm[11], v) && isVisible(lm[15], v) && isVisible(lm[12], v) && isVisible(lm[16], v))) {
        return null;
      }
      const torso = getTorsoLength(lm);
      const l = (lm[11].y - lm[15].y) / torso;
      const r = (lm[12].y - lm[16].y) / torso;
      armBuffer.push({ lo: Math.min(l, r), hi: Math.max(l, r) });
      if (armBuffer.length > ARM_SMOOTHING_WINDOW) armBuffer.shift();
      return {
        lo: average(armBuffer.map((a) => a.lo)),
        hi: average(armBuffer.map((a) => a.hi)),
      };
    };

    const getLegsInfo = (lm) => {
      const v = MIN_VISIBILITY_ARM;
      if (!(isVisible(lm[27], v) && isVisible(lm[28], v) && isVisible(lm[11], v) && isVisible(lm[12], v))) {
        return null;
      }
      const shoulderW = Math.abs(lm[11].x - lm[12].x);
      if (shoulderW < 0.02) return null;
      const ratio = Math.abs(lm[27].x - lm[28].x) / shoulderW;
      const levelDiff = Math.abs(lm[27].y - lm[28].y) / getTorsoLength(lm);
      const sameLevel = levelDiff < LEG_MAX_LEVEL_DIFF;
      return {
        ratio,
        levelDiff,
        closed: ratio < LEG_CLOSED_RATIO && sameLevel,
        spread: ratio > LEG_SPREAD_RATIO && sameLevel,
        oneLegLifted: !sameLevel,
      };
    };

    const handleJumpingJack = (lm) => {
      const arms = getSmoothedArms(lm);
      const legs = getLegsInfo(lm);
      updateDebug(
        `แขน(ต่ำ/สูง): ${arms === null ? '-' : arms.lo.toFixed(2) + ' / ' + arms.hi.toFixed(2)}  |  ขา(ห่าง/ต่างระดับ): ${
          legs === null ? '-' : legs.ratio.toFixed(2) + ' / ' + legs.levelDiff.toFixed(2)
        }  |  สถานะ: ${stage ?? '-'}`
      );

      if (arms === null) {
        updateFeedback('ถอยให้เห็นแขนทั้งสองข้างและลำตัวชัดเจน');
        return;
      }

      const now = Date.now();
      const armsUp = arms.lo > ARM_UP_THRESHOLD;     // ยกสูงทั้งสองแขน
      const armsDown = arms.hi < ARM_DOWN_THRESHOLD; // ลดต่ำทั้งสองแขน

      if (!initialized) {
        // เริ่มนับเมื่อยืนเท้าชิด แขนลงนิ่งๆ ชัดเจน
        const legsReady = !REQUIRE_LEGS_SPREAD || (legs !== null && legs.closed);
        if (holdReady(armsDown && legsReady)) {
          stage = 'down';
          initialized = true;
          legsClosedSeen = true;
          candidate = null;
          candidateFrames = 0;
          updateFeedback('พร้อมแล้ว กระโดดกางแขนขาออกพร้อมกันได้เลย');
        } else if (REQUIRE_LEGS_SPREAD && legs === null) {
          updateFeedback('ถอยให้เห็นขาทั้งสองข้างด้วย');
        } else {
          updateFeedback('ยืนเท้าชิด ลดแขนลงนิ่งๆ ก่อนเริ่มนับ');
        }
        return;
      }

      // เก็บข้อมูลระหว่างรอบ
      if (stage === 'down' && legs && legs.closed) legsClosedSeen = true;
      if (stage === 'up' && legs) {
        legsVisibleInCycle = true;
        if (legs.oneLegLifted) liftedOneLegSeen = true;
        // แขนสูง + ขากางกว้าง (ข้อเท้าอยู่ระดับเดียวกัน) ต้องเกิดพร้อมกัน
        if (armsUp && legs.spread) bothFrames += 1;
      }

      if (armsUp) {
        if (confirm('up', JJ_CONFIRM_FRAMES) && stage !== 'up') {
          stage = 'up';
          upSince = now;
          closedAtStart = legsClosedSeen;   // รอบนี้เริ่มจากเท้าชิดหรือไม่
          legsClosedSeen = false;
          bothFrames = 0;
          liftedOneLegSeen = false;
          legsVisibleInCycle = false;
          candidate = null;
          candidateFrames = 0;
          updateFeedback('ยอดเยี่ยม! หุบแขนขาลง');
        }
      } else if (armsDown) {
        if (confirm('down', JJ_CONFIRM_FRAMES) && stage !== 'down') {
          stage = 'down';
          candidate = null;
          candidateFrames = 0;
          const bothOk = bothFrames >= JJ_BOTH_FRAMES;
          const legsOk =
            !REQUIRE_LEGS_SPREAD || (closedAtStart && legsVisibleInCycle && bothOk);
          const heldOk = now - upSince >= JJ_MIN_UP_MS;
          if (legsOk && heldOk) {
            tryCountRep(JJ_COOLDOWN_MS);
            updateFeedback('นับแล้ว! กระโดดกางแขนขาออกอีกครั้ง');
          } else if (!legsVisibleInCycle) {
            updateFeedback('ถอยให้เห็นขาทั้งสองข้างด้วย');
          } else if (!closedAtStart) {
            updateFeedback('เริ่มจากยืนเท้าชิดก่อน แล้วกางแขนขาพร้อมกัน');
          } else if (!bothOk && liftedOneLegSeen) {
            updateFeedback('กางขาสองข้างพร้อมกัน อย่ายกขาข้างเดียว');
          } else if (!bothOk) {
            updateFeedback('กางขาให้กว้างพร้อมกับยกแขน');
          } else {
            updateFeedback('เร็วเกินไป ยกแขนให้สุดก่อนหุบลง');
          }
        } else if (stage === 'down') {
          updateFeedback('เตรียมตัว - กระโดดกางแขนขาออก');
        }
      } else {
        // ช่วงแขนกำลังเคลื่อนที่ ไม่เปลี่ยนสถานะและเริ่มนับเฟรมยืนยันใหม่
        candidate = null;
        candidateFrames = 0;
        if (stage === 'down' && arms.hi > ARM_UP_THRESHOLD && arms.lo <= ARM_UP_THRESHOLD) {
          updateFeedback('ยกแขนทั้งสองข้างพร้อมกันให้สูงเหนือไหล่');
        }
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

    const processKnee = (side, lift, other) => {
      if (lift === null) return;

      if (hkStage[side] === 'down') {
        // เข่าอีกข้างต้องอยู่ต่ำ ไม่งั้นถือว่ากระโดดตุ๊ยเข่า/นั่ง ไม่ใช่ยกเข่าสูง
        const otherDown = other === null || other < HK_OTHER_DOWN_MAX;
        if (lift > HK_UP_THRESHOLD && otherDown) {
          hkConfirm[side] += 1;
          if (hkConfirm[side] >= HK_CONFIRM_FRAMES) {
            hkStage[side] = 'up';
            hkConfirm[side] = 0;
            if (REQUIRE_ALTERNATE && lastHkSide === side) {
              updateFeedback('สลับยกเข่าอีกข้างด้วย');
              return;
            }
            const now = Date.now();
            if (now - hkLast[side] >= HK_LEG_COOLDOWN_MS) {
              hkLast[side] = now;
              if (tryCountRep(HK_COOLDOWN_MS) && !finished) {
                lastHkSide = side;
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
        if (holdReady(leftDown && rightDown)) {
          initialized = true;
          lastHkSide = null;
          hkStage = { L: 'down', R: 'down' };
          hkConfirm = { L: 0, R: 0 };
          updateFeedback('พร้อมแล้ว วิ่งอยู่กับที่ ยกเข่าสูงได้เลย');
        } else {
          updateFeedback('ยืนตรงนิ่งๆ ก่อนเริ่มนับ');
        }
        return;
      }

      processKnee('L', left, right);
      processKnee('R', right, left);
    };

    // ---------------- PUNCHES ----------------
    // ตัดสินว่ากำลังหันหน้าหรือหันข้างให้กล้อง (ใช้ร่วมกันทั้งสองแขน + กันค่าสลับไปมา)
    const updatePunchView = (lm) => {
      const v = MIN_VISIBILITY_PUNCH;
      if (!isVisible(lm[11], v) || !isVisible(lm[12], v)) return;
      const ratio = (Math.abs(lm[11].x - lm[12].x) * imgAspect) / getTorsoLength(lm);
      frontRatioBuf.push(ratio);
      if (frontRatioBuf.length > 8) frontRatioBuf.shift();
      const r = average(frontRatioBuf);
      if (r > PUNCH_FRONT_ON) punchFront = true;
      else if (r < PUNCH_FRONT_OFF) punchFront = false;
    };

    const getPunchSignal = (lm, shoulderIdx, elbowIdx, wristIdx, side) => {
      const v = MIN_VISIBILITY_PUNCH;
      const s = lm[shoulderIdx];
      const e = lm[elbowIdx];
      const w = lm[wristIdx];
      if (!isVisible(s, v) || !isVisible(e, v) || !isVisible(w, v)) return null;

      const armLen = Math.hypot(s.x - e.x, s.y - e.y) + Math.hypot(e.x - w.x, e.y - w.y);
      if (armLen < 0.05) return null;

      const torso = getTorsoLength(lm);
      const other = lm[shoulderIdx === 11 ? 12 : 11];
      // ทิศ "ออกนอกลำตัว" ของไหล่ข้างนี้ในแนวนอน
      const outSign = isVisible(other, v) ? Math.sign(s.x - other.x) || 1 : 1;

      const raw = {
        elbow3d: calculateAngle3D(s, e, w),
        elbow2d: calculateAngle(s, e, w),
        reach: Math.hypot(s.x - w.x, s.y - w.y) / armLen,
        forward: ((s.z ?? 0) - (w.z ?? 0)) / torso, // z ติดลบ = อยู่ใกล้กล้อง
        // ไหล่->ศอก และ ศอก->ข้อมือ ต้องยื่นเข้าหากล้องทั้งคู่ (ใช้ค่าที่น้อยกว่า)
        zStep: Math.min((s.z ?? 0) - (e.z ?? 0), (e.z ?? 0) - (w.z ?? 0)) / torso,
        height: (s.y - w.y) / torso,
      };

      // เก็บเส้นทางข้อมือเทียบไหล่ เพื่อแยกหมัดตรงออกจากฮุก/อัปเปอร์คัต
      const tr = punchTraj[side];
      tr.push({
        el3d: raw.elbow3d,
        el2d: raw.elbow2d,
        lat: ((w.x - s.x) * imgAspect * outSign) / torso, // + = ข้อมืออยู่นอกไหล่, - = ข้ามเข้าหาลำตัว
        up: (s.y - w.y) / torso,                          // + = ข้อมือสูงกว่าไหล่
        fwd: ((s.z ?? 0) - (w.z ?? 0)) / torso,           // + = ข้อมือยื่นเข้าหากล้อง
        xh: ((w.x - s.x) * imgAspect) / torso,            // ตำแหน่งข้อมือแนวนอนเทียบไหล่ (ใช้ตอนหันข้าง)
      });
      if (tr.length > PUNCH_TRAJ_FRAMES) tr.shift();

      // เฉลี่ยหลายเฟรม ลดการสั่นของจุด (z ของแขนสั่นง่าย)
      const buf = punchBuf[side];
      buf.push(raw);
      if (buf.length > PUNCH_SMOOTH) buf.shift();
      const avg = (k) => average(buf.map((b) => b[k]));
      return {
        elbow3d: avg('elbow3d'),
        elbow2d: avg('elbow2d'),
        reach: avg('reach'),
        forward: avg('forward'),
        zStep: avg('zStep'),
        height: avg('height'),
        front: punchFront,
      };
    };

    // ตรวจว่าเป็น "หมัดตรง" เท่านั้น: ข้อมือต้องพุ่งออกไปข้างหน้าเป็นเส้นตรงจากท่าการ์ด
    //  - อัปเปอร์คัต = ข้อมือยกขึ้น/ลงระหว่างทาง
    //  - ฮุก = ข้อมือเหวี่ยงไปด้านข้าง/วิ่งเป็นวงโค้ง หรือแขนเหยียดอยู่แล้วเหวี่ยงมา
    // ตรวจ "ตลอดเส้นทาง" ไม่ใช่แค่จุดเริ่มกับจุดจบ และถ้าข้อมูลไม่พอจะไม่นับ
    // จุดเริ่มหมัด = เฟรมที่งอข้อศอกมากที่สุดในช่วงที่ผ่านมา (ไม่ต้องรอให้ดึงหมัดกลับครบ)
    const NOT_STRAIGHT_UPPERCUT = 'ต้องเป็นหมัดตรงเท่านั้น ไม่ใช่อัปเปอร์คัต';
    const NOT_STRAIGHT_HOOK = 'ต้องเป็นหมัดตรงเท่านั้น ไม่ใช่ฮุก';

    const checkStraightPath = (side, front) => {
      const tr = punchTraj[side];
      if (tr.length < PUNCH_TRAJ_MIN_FRAMES) return { ok: false, why: '' };

      const key = front ? 'el3d' : 'el2d';
      const search = tr.slice(0, tr.length - 2);
      let oi = 0;
      search.forEach((x, i) => {
        if (x[key] < search[oi][key]) oi = i;
      });
      const o = search[oi];

      // ต้องเริ่มจากท่าการ์ด (ศอกงอ) ถ้าแขนเหยียดอยู่แล้วเหวี่ยง = ไม่ใช่หมัดตรง
      if (o[key] > PUNCH_START_ELBOW_MAX) {
        return { ok: false, why: 'ต้องเริ่มจากท่าการ์ด แล้วชกตรงออกไป' };
      }

      const path = tr.slice(oi);
      const tail = tr.slice(-2);
      const endUp = average(tail.map((x) => x.up));
      const endLat = average(tail.map((x) => x.lat));
      const endFwd = average(tail.map((x) => x.fwd));

      // อัปเปอร์คัต: ข้อมือขึ้น/ลงจากจุดเริ่มเกินกำหนด ณ จุดใดจุดหนึ่งของเส้นทาง
      const maxDy = Math.max(...path.map((x) => Math.abs(x.up - o.up)));
      if (maxDy > PUNCH_MAX_DY) return { ok: false, why: NOT_STRAIGHT_UPPERCUT };

      if (front) {
        // ฮุก: ข้อมือเหวี่ยงไปด้านข้างเกินกำหนด ณ จุดใดจุดหนึ่ง หรืออยู่ห่างแนวไหล่เกินไป
        const maxDlat = Math.max(...path.map((x) => Math.abs(x.lat - o.lat)));
        if (maxDlat > PUNCH_MAX_DLAT || Math.abs(endLat) > PUNCH_MAX_LAT) {
          return { ok: false, why: NOT_STRAIGHT_HOOK };
        }
        // หมัดตรงต้องพุ่งเข้าหากล้อง (ข้อมือยื่นออกมาจากจุดเริ่มชัดเจน)
        if (endFwd - o.fwd < PUNCH_MIN_DFWD) {
          return { ok: false, why: 'ต้องเป็นหมัดตรงเท่านั้น ชกพุ่งตรงไปข้างหน้า' };
        }
      } else {
        // หันข้าง: ดูเส้นทางข้อมือในระนาบภาพ (แนวนอน x แนวตั้ง)
        const p0 = { a: o.xh, b: o.up };
        const p1 = { a: path[path.length - 1].xh, b: path[path.length - 1].up };
        const dx = p1.a - p0.a;
        const dy = p1.b - p0.b;
        const L = Math.hypot(dx, dy);
        if (L < PUNCH_MIN_TRAVEL) {
          return { ok: false, why: 'ต้องเป็นหมัดตรงเท่านั้น ชกพุ่งตรงไปข้างหน้า' };
        }
        // ทิศหมัดเอียงขึ้น/ลงมากเกินไป = อัปเปอร์คัต
        if (Math.abs(endUp - o.up) / L > PUNCH_MAX_SLOPE || Math.abs(dy) / L > PUNCH_MAX_SLOPE) {
          return { ok: false, why: NOT_STRAIGHT_UPPERCUT };
        }
        // เส้นทางโค้งออกจากเส้นตรงมากเกินไป = ฮุก/วงสวิง
        const bow = Math.max(
          ...path.map((x) => Math.abs((x.xh - p0.a) * dy - (x.up - p0.b) * dx) / L)
        );
        if (bow / L > PUNCH_MAX_BOW) return { ok: false, why: NOT_STRAIGHT_HOOK };
      }
      return { ok: true, why: '' };
    };

    const processPunch = (side, sig) => {
      if (sig === null) return;

      // ข้อมืออยู่ช่วงอก-ไหล่ (ไม่ห้อยลง ไม่ชูสูงเกินไป)
      const heightOk = sig.height > PUNCH_MIN_HEIGHT && sig.height < PUNCH_MAX_HEIGHT;

      // หันหน้าเข้ากล้อง: ข้อศอก(3D)เหยียดตรง + ข้อมือยื่นเข้าหากล้อง + ไหล่->ศอก->ข้อมือ ไล่ระดับเข้าหากล้อง
      // หันข้างให้กล้อง: ข้อศอก(2D)เหยียดตรง + แขนเหยียดสุด
      const elbow = sig.front ? sig.elbow3d : sig.elbow2d;
      const straightPose = sig.front
        ? elbow > PUNCH_ELBOW_MIN && sig.forward > PUNCH_FORWARD_OUT && sig.zStep > PUNCH_Z_STEP
        : elbow > PUNCH_ELBOW_MIN && sig.reach > PUNCH_REACH_OUT;
      const extended = heightOk && straightPose;

      // ดึงหมัดกลับ: ข้อศอกงอ หรือข้อมือกลับมาใกล้ไหล่ หรือแขนลงต่ำ/ชูสูง
      const retracted =
        !heightOk ||
        elbow < PUNCH_REARM_ELBOW ||
        (sig.reach < PUNCH_REACH_IN && sig.forward < PUNCH_FORWARD_IN);

      if (punchStage[side] === 'guard') {
        punchRearm[side] = 0;
        if (extended) {
          // เฟรมแรกที่เห็นท่าเหยียด: ตัดสินจากเส้นทางข้อมือที่ผ่านมา แล้วล็อกผลไว้
          if (punchConfirm[side] === 0) {
            const r = checkStraightPath(side, sig.front);
            punchTrajOk[side] = r.ok;
            punchWhy[side] = r.why;
          }
          punchConfirm[side] += 1;
          if (punchConfirm[side] >= PUNCH_CONFIRM_FRAMES) {
            punchStage[side] = 'out';
            punchConfirm[side] = 0;
            if (!punchTrajOk[side]) {
              // ไม่ใช่หมัดตรง: ไม่นับ และรอให้ดึงแขนกลับก่อนถึงจะนับหมัดต่อไปได้
              if (punchWhy[side]) updateFeedback(punchWhy[side]);
            } else {
              const now = Date.now();
              if (now - punchLast[side] >= PUNCH_ARM_COOLDOWN_MS) {
                punchLast[side] = now;
                if (tryCountRep(PUNCH_COOLDOWN_MS) && !finished) {
                  updateFeedback('นับแล้ว! หมัดตรงสวย ชกอีกข้างต่อเลย');
                }
              }
            }
          }
        } else {
          punchConfirm[side] = 0;
        }
      } else if (retracted) {
        // ดึงหมัดกลับมาแล้ว (ต้องต่อเนื่องสั้นๆ กันค่าสั่น) พร้อมนับหมัดต่อไปของแขนข้างนี้
        punchRearm[side] += 1;
        if (punchRearm[side] >= PUNCH_REARM_FRAMES) {
          punchStage[side] = 'guard';
          punchConfirm[side] = 0;
          punchRearm[side] = 0;
        }
      } else {
        punchRearm[side] = 0;
      }
    };

    const handlePunches = (lm) => {
      updatePunchView(lm);
      const left = getPunchSignal(lm, 11, 13, 15, 'L');
      const right = getPunchSignal(lm, 12, 14, 16, 'R');

      const fmt = (s) =>
        s === null
          ? '-'
          : `ศอก ${Math.round(s.front ? s.elbow3d : s.elbow2d)}° reach ${s.reach.toFixed(2)} fwd ${s.forward.toFixed(2)} zStep ${s.zStep.toFixed(2)} สูง ${s.height.toFixed(2)}`;
      updateDebug(
        `[${punchFront ? 'หันหน้า' : 'หันข้าง'}] ซ้าย: ${fmt(left)}  |  ขวา: ${fmt(right)}  |  ${punchStage.L}/${punchStage.R}`
      );

      if (left === null && right === null) {
        updateFeedback('ถอยให้เห็นแขนและลำตัวชัดเจน');
        return;
      }

      if (!initialized) {
        if (holdReady(true)) {
          initialized = true;
          updateFeedback('พร้อมแล้ว ชกหมัดตรงสลับซ้าย-ขวาได้เลย (ฮุก/อัปเปอร์คัตไม่นับ)');
        } else {
          updateFeedback('ตั้งการ์ดนิ่งๆ ก่อนเริ่มนับ');
        }
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

    // ------------------------------------------------------------------
    // Generic detector สำหรับท่าที่ไม่ได้มี detector เฉพาะ
    // ใช้ landmark ของ MediaPipe Pose และเลือกสัญญาณตามรูปแบบการเคลื่อนไหว
    // ------------------------------------------------------------------
    let genericStage = 'start';
    let genericReady = false;
    let genericBuffer = [];
    let genericLastValue = null;
    let genericStaticStarted = 0;
    let genericStaticLastSecond = 0;

    const visiblePoint = (lm, i, v = 0.45) => isVisible(lm[i], v) ? lm[i] : null;
    const pointDistance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) : null;
    const torsoLength = (lm) => {
      const ls = visiblePoint(lm, 11), rs = visiblePoint(lm, 12);
      const lh = visiblePoint(lm, 23), rh = visiblePoint(lm, 24);
      const shoulder = pointDistance(ls, rs) || 0.2;
      const hip = pointDistance(lh, rh) || 0.2;
      const midShoulder = ls && rs ? { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: ((ls.z ?? 0) + (rs.z ?? 0)) / 2 } : null;
      const midHip = lh && rh ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: ((lh.z ?? 0) + (rh.z ?? 0)) / 2 } : null;
      return Math.max(0.12, pointDistance(midShoulder, midHip) || (shoulder + hip) / 2);
    };

    const getModeValue = (lm) => {
      const tl = torsoLength(lm);
      const angle = (a,b,c) => {
        if (!a || !b || !c) return null;
        return calculateAngle(a,b,c);
      };
      const L = (i) => visiblePoint(lm, i);
      const kneeL = angle(L(23), L(25), L(27));
      const kneeR = angle(L(24), L(26), L(28));
      const elbowL = angle(L(11), L(13), L(15));
      const elbowR = angle(L(12), L(14), L(16));
      const shoulderL = angle(L(23), L(11), L(13));
      const shoulderR = angle(L(24), L(12), L(14));
      const avg = (...xs) => { const a = xs.filter((x) => x !== null); return a.length ? average(a) : null; };

      if (exerciseMode === 'push') return avg(kneeL, kneeR) ?? avg(elbowL, elbowR);
      if (exerciseMode === 'arm') return avg(elbowL, elbowR);
      if (exerciseMode === 'arm_raise') {
        const ls=L(11), rs=L(12), lw=L(15), rw=L(16);
        if (!ls || !rs || !lw || !rw) return null;
        return avg((ls.y-lw.y)/tl, (rs.y-rw.y)/tl);
      }
      if (exerciseMode === 'row') return avg(elbowL, elbowR);
      if (exerciseMode === 'hinge') {
        return avg(angle(L(11),L(23),L(25)), angle(L(12),L(24),L(26)));
      }
      if (exerciseMode === 'knee') {
        const lh=L(23), rh=L(24), lk=L(25), rk=L(26);
        if (!lh || !rh || !lk || !rk) return null;
        return Math.min((lh.y-lk.y)/tl, (rh.y-rk.y)/tl);
      }
      if (exerciseMode === 'calf') {
        const la=L(27), ra=L(28), lh=L(23), rh=L(24);
        if (!la || !ra || !lh || !rh) return null;
        return avg(lh.y-la.y, rh.y-ra.y);
      }
      if (exerciseMode === 'leg_press') return avg(kneeL, kneeR);
      if (exerciseMode === 'crunch') {
        return avg(angle(L(11),L(23),L(25)), angle(L(12),L(24),L(26)));
      }
      if (exerciseMode === 'twist') {
        const ls=L(11), rs=L(12), lh=L(23), rh=L(24);
        if (!ls || !rs || !lh || !rh) return null;
        return ((ls.x+rs.x)/2 - (lh.x+rh.x)/2) / tl;
      }
      return null;
    };

    const handleGenericExercise = (lm) => {
      // Plank เป็นท่าค้าง จึงนับเป็นวินาทีแทนครั้ง
      if (exerciseMode === 'plank') {
        const now = Date.now();
        const shoulder = visiblePoint(lm,11), hip = visiblePoint(lm,23), ankle = visiblePoint(lm,27);
        if (!shoulder || !hip || !ankle) {
          updateFeedback('จัดตัวให้เห็นลำตัวและขาชัดเจน');
          genericStaticStarted = 0;
          return;
        }
        const bodyAngle = calculateAngle(shoulder, hip, ankle);
        if (bodyAngle > 145) {
          if (!genericStaticStarted) genericStaticStarted = now;
          if (now - genericStaticLastSecond >= 1000) {
            genericStaticLastSecond = now;
            tryCountRep(0);
          }
          updateFeedback(`ค้างท่าแพลงก์ ${counter}/${targetCount} วินาที`);
        } else {
          genericStaticStarted = 0;
          updateFeedback('รักษาลำตัวให้ตรง แล้วค้างท่า');
        }
        return;
      }

      const value = getModeValue(lm);
      if (value === null || !Number.isFinite(value)) {
        updateFeedback('จัดตำแหน่งให้เห็นร่างกายชัดเจน');
        return;
      }
      genericBuffer.push(value);
      if (genericBuffer.length > 5) genericBuffer.shift();
      const smooth = average(genericBuffer);

      // เริ่มจากท่าปกติก่อน แล้วตรวจการเคลื่อนกลับครบ 1 รอบ
      if (!genericReady) {
        genericLastValue = smooth;
        genericReady = true;
        genericStage = 'start';
        updateFeedback(`พร้อมแล้ว เริ่ม ${exerciseName || 'ท่านี้'} ได้เลย`);
        return;
      }

      const delta = smooth - genericLastValue;
      genericLastValue = smooth;

      // กลุ่มมุม: ลงต่ำ/งอ -> กลับตรง
      if (['push','arm','row','hinge','leg_press','crunch'].includes(exerciseMode)) {
        const down = smooth < (exerciseMode === 'push' ? 125 : exerciseMode === 'arm' || exerciseMode === 'row' ? 125 : 145);
        const up = smooth > (exerciseMode === 'push' ? 155 : exerciseMode === 'arm' || exerciseMode === 'row' ? 155 : 160);
        if (genericStage === 'start' && down) {
          genericStage = 'down';
          updateFeedback('ทำต่อจนกลับสู่ท่าเริ่มต้น');
        } else if (genericStage === 'down' && up) {
          if (tryCountRep(500)) genericStage = 'start';
        } else {
          updateFeedback(genericStage === 'down' ? 'กลับสู่ท่าเริ่มต้น' : 'ทำท่าให้สุดช่วงการเคลื่อนไหว');
        }
        return;
      }

      // กลุ่มยกแขน/เข่า/น่อง: ค่าต้องเปลี่ยนจาก baseline แล้วกลับมา
      const movement = Math.abs(delta);
      if (genericStage === 'start' && movement > 0.035) {
        genericStage = 'moving';
        updateFeedback('ดีมาก กลับสู่ท่าเริ่มต้น');
      } else if (genericStage === 'moving' && movement < 0.012) {
        if (tryCountRep(500)) genericStage = 'start';
      } else {
        updateFeedback('ทำท่าให้ชัดเจนและต่อเนื่อง');
      }
    };

    const onResults = (results) => {
      if (!active || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const cw = canvas.width;
      const ch = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, cw, ch);

      // กลับภาพกล้องเป็นแบบกระจก ให้ทิศทางในหน้าจอตรงกับท่าที่ผู้ใช้เห็นตัวเอง
      // การกลับทั้ง canvas ทำให้ภาพกล้องและโครงร่าง AI กลับด้านตรงกัน
      ctx.translate(cw, 0);
      ctx.scale(-1, 1);

      // คำนวณการวางภาพแบบ "cover" ให้เต็มแคนวาสแนวตั้ง
      const img = results.image;
      const iw = (img && (img.videoWidth || img.width)) || 640;
      const ih = (img && (img.videoHeight || img.height)) || 480;
      imgAspect = iw / ih; // ใช้แปลงแกน x ให้เป็นหน่วยเดียวกับแกน y
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
          if (exerciseMode === 'squat') handleSquat(lm);
          else if (exerciseMode === 'jumping_jack') handleJumpingJack(lm);
          else if (exerciseMode === 'high_knees') handleHighKnees(lm);
          else if (exerciseMode === 'punches') handlePunches(lm);
          else handleGenericExercise(lm);
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
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
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
        cameraControlRef.current = camera;
        // เปิดกล้องเฉพาะเมื่อผู้ใช้เปิดไว้ (ค่าเริ่มต้นคือปิด)
        if (cameraEnabledRef.current) {
          camera.start();
          updateFeedback('จัดท่าทางให้เห็นเต็มตัว');
        } else {
          updateFeedback('ปิดกล้องแล้ว กดเปิดกล้องเพื่อเริ่มตรวจจับ');
        }
      }
    };

    initPose();

    return () => {
      active = false;
      clearTimeout(initTimer);
      clearTimeout(navigateTimer);
      if (camera && typeof camera.stop === 'function') camera.stop();
      if (cameraControlRef.current === camera) cameraControlRef.current = null;
      if (pose && typeof pose.close === 'function') pose.close();
    };
  }, [exerciseType, targetCount]);

  // เปิด/ปิดกล้องโดยไม่รีเซ็ตจำนวนครั้งหรือผลการออกกำลังกาย
  useEffect(() => {
    const cam = cameraControlRef.current;
    if (!cam) return;

    if (cameraEnabled) {
      try { cam.start(); } catch (err) { console.warn('camera.start failed:', err); }
      setFeedback('กำลังติดตามร่างกาย');
    } else {
      try { cam.stop(); } catch (err) { console.warn('camera.stop failed:', err); }
      setFeedback('ปิดกล้องแล้ว กดเปิดกล้องเพื่อเริ่มตรวจจับ');
    }
  }, [cameraEnabled]);

  // ---------------- UI: โครงเดียวกับ Dashboard ----------------

  // ---------- โครงหน้าแบบเดียวกับ Dashboard: ชื่อผู้ใช้ ธีม แจ้งเตือน ออกจากระบบ ----------
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyFoodCalories, setDailyFoodCalories] = useState(getSavedDailyCalories);

  // ธีม: "dark" (ค่าเริ่มต้น) | "light" — ใช้ key เดียวกับ Dashboard จึงจำค่าร่วมกัน
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('fittrack-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('fittrack-theme', theme);
    } catch {
      /* ไม่เป็นไรถ้าเบราว์เซอร์บล็อก storage */
    }
  }, [theme]);

  // ออกจากหน้านี้แล้วคืนค่า ไม่ให้ธีมไปกระทบหน้าอื่น
  useLayoutEffect(() => () => document.documentElement.removeAttribute('data-theme'), []);

  // สลับธีมจากแท็บ/หน้าอื่น → ตามทันที
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'fittrack-theme') setTheme(e.newValue === 'light' ? 'light' : 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ใช้ค่า Animation จากหน้าตั้งค่า เหมือนหน้า Dashboard
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      const saved = JSON.parse(localStorage.getItem('fittrack_user_settings') || '{}');
      root.setAttribute('data-anim', saved?.display?.animation === false ? 'off' : 'on');
    } catch {
      root.setAttribute('data-anim', 'on');
    }
    return () => root.removeAttribute('data-anim');
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { clearCachedName(); return; }
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        const name = data.name || currentUser.displayName || currentUser.email?.split('@')[0] || '';
        setCachedName(name);
        setDisplayName(name);
        setUserInitial(name.charAt(0).toUpperCase());
      } catch (err) {
        console.error('โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:', err);
      }
    });
    return () => unsubscribe();
  }, []);

  const dateLabel = new Intl.DateTimeFormat('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(currentDateTime);
  const todayKey = getLocalDateKey(currentDateTime);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
    setTimeout(() => root.classList.remove('theme-anim'), 450);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      clearCachedName();
      clearHealthCache();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const exerciseNames = {
    push_up: 'Push Up', diamond_push_up: 'Diamond Push Up', bird_dog: 'Bird Dog',
    reverse_snow_angel: 'Reverse Snow Angel', plank: 'Plank', mountain_climber: 'Mountain Climber',
    dumbbell_shoulder_press: 'Dumbbell Shoulder Press', dumbbell_lateral_raise: 'Dumbbell Lateral Raise',
    dumbbell_bench_press: 'Dumbbell Bench Press', dumbbell_row: 'One-Arm Dumbbell Row',
    dumbbell_curl: 'Dumbbell Curl', goblet_squat: 'Goblet Squat', dumbbell_calf_raise: 'Dumbbell Calf Raise',
    barbell_bench_press: 'Barbell Bench Press', barbell_deadlift: 'Barbell Deadlift',
    barbell_squat: 'Barbell Back Squat', barbell_overhead_press: 'Barbell Overhead Press',
    cable_row: 'Seated Cable Row', cable_triceps_pushdown: 'Cable Triceps Pushdown',
    cable_crunch: 'Cable Crunch', lat_pulldown: 'Lat Pulldown', chest_press_machine: 'Chest Press Machine',
    leg_press: 'Leg Press', seated_calf_raise: 'Seated Calf Raise', shoulder_press_machine: 'Shoulder Press Machine',
    band_pull_apart: 'Band Pull Apart', band_chest_press: 'Band Chest Press', band_squat: 'Banded Squat',
    kettlebell_swing: 'Kettlebell Swing', kettlebell_goblet_squat: 'Kettlebell Goblet Squat',
    kettlebell_russian_twist: 'Kettlebell Russian Twist', bench_dip: 'Bench Dip', bench_step_up: 'Bench Step Up',
    bench_incline_pushup: 'Incline Push Up', squat: 'Squat', jumping_jack: 'Jumping Jack',
    high_knees: 'High Knees', punches: 'Punches',
  };
  const exerciseName = exerciseNames[exerciseType] || 'ออกกำลังกาย';
  const progress = Math.min(100, Math.round((counter / targetCount) * 100));

  const workoutNotice = counter >= targetCount
    ? `ครบเป้าหมาย ${targetCount} ครั้งแล้ว · ${exerciseName} · ใช้พลังงาน ${calories} kcal`
    : counter > 0
      ? `กำลังออกกำลังกาย ${exerciseName} · ${counter}/${targetCount} ครั้ง · ใช้พลังงาน ${calories} kcal`
      : `พร้อมเริ่ม ${exerciseName} · เป้าหมาย ${targetCount} ครั้ง`;
  const foodNotice = dailyFoodCalories === 0
    ? 'วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้'
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyFoodCalories.toLocaleString()} kcal`;

  const handleNotifications = async () => {
    setDailyFoodCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === 'default') permission = await window.Notification.requestPermission();
        if (permission === 'granted') {
          new window.Notification('FitTrack · สรุปการออกกำลังกาย', {
            body: `${workoutNotice}. ${foodNotice}`,
            tag: `fittrack-exercise-${todayKey}`,
          });
        }
      } catch (err) {
        console.warn('ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:', err);
      }
    }
  };

  return (
    <div className="fittrack-app">
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" onClick={() => navigate('/dashboard')}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link active" onClick={() => navigate('/exercises')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate('/gamemode')}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 15h18a9 9 0 0 1 8.7 6.7l2.2 8.6a5.2 5.2 0 0 1-8.9 4.8L31 31H17l-4 4.1a5.2 5.2 0 0 1-8.9-4.8l2.2-8.6A9 9 0 0 1 15 15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M16 21v8M12 25h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="22.5" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg></span>โหมดเกม</button>
          <button className="side-link" onClick={() => navigate('/history')}><span className="side-icon">◷</span>ประวัติ</button>
          <button className="side-link" onClick={() => navigate('/profile')}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" title="ออกจากระบบ" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{userInitial}</div>
              <span className="online-dot"></span>
            </div>
            <div>
              <div className="hello">สวัสดีครับ/ค่ะ</div>
              <strong>{displayName || '\u00A0'}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="ai-note">ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ <span>〽</span></div>
            <div className="notification-wrap">
              <button className="icon-button notification-bell" title="การแจ้งเตือน" aria-label="เปิดการแจ้งเตือน" aria-expanded={notificationsOpen} onClick={handleNotifications}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><i></i></button>
              {notificationsOpen && <div className="notification-panel" role="status">
                <div className="notification-panel-title"><span>การแจ้งเตือน <small>วันนี้</small></span><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotificationsOpen(false)}>×</button></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{workoutNotice}</span><small>ความสำเร็จ {progress}% ของเป้าหมาย</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{foodNotice}</span><small>ติดตามเป้าหมายพลังงานรายวันได้ที่หน้าหลัก</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              aria-label={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            >
              {theme === 'dark' ? '☼' : '☾'}
            </button>
          </div>
        </header>

        <div className="ex-content">
          <section className="dark-card ex-shell">
            <header className="ex-head">
              <span className="ex-head-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="34" height="34"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <div className="ex-head-copy">
                <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
                <p>ออกกำลังกายไปพร้อมระบบ AI ตรวจจับท่าทาง</p>
              </div>
              <button className="ex-back" type="button" onClick={() => navigate('/settings?exercise=' + encodeURIComponent(exerciseType) + '&target=' + encodeURIComponent(targetCount))}>กลับการตั้งค่าการออกกำลังกาย</button>
            </header>

            <div className="ex-grid">
              <section className="ex-card camera-panel">
                <div className="ex-card-head">
                  <span className="ex-mini-icon" aria-hidden="true">◎</span>
                  <div>
                    <h2>กล้องตรวจจับท่าทาง</h2>
                    <small>จัดตำแหน่งให้เห็นร่างกายชัดเจน</small>
                  </div>
                  <div className="ex-camera-actions">
                    <span className={`ex-live ${cameraEnabled ? '' : 'is-off'}`}><i /> {cameraEnabled ? 'AI LIVE' : 'กล้องปิด'}</span>
                    <button
                      type="button"
                      className={`ex-camera-toggle ${cameraEnabled ? 'is-on' : 'is-off'}`}
                      onClick={() => setCameraEnabled((prev) => !prev)}
                      aria-pressed={cameraEnabled}
                      aria-label={cameraEnabled ? 'ปิดกล้อง' : 'เปิดกล้อง'}
                    >
                      <span className="ex-toggle-dot" />
                      {cameraEnabled ? 'ปิดกล้อง' : 'เปิดกล้อง'}
                    </button>
                  </div>
                </div>

                <div className="ex-title-row">
                  <div>
                    <span className="ex-eyebrow">SMART AI WORKOUT</span>
                    <h3>{exerciseName}</h3>
                  </div>
                  <span className="ex-target">เป้าหมาย {targetCount} ครั้ง</span>
                </div>

                <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
                <div className={`ex-camera ${cameraEnabled ? '' : 'camera-disabled'}`}>
                  <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
                  {!cameraEnabled && (
                    <div className="ex-camera-off-overlay">
                      <div className="ex-camera-off-icon">◉</div>
                      <strong>กล้องถูกปิด</strong>
                      <span>กด “เปิดกล้อง” เพื่อเริ่มตรวจจับท่าทาง</span>
                    </div>
                  )}
                  <div className="ex-cam-top">
                    <span className="ex-cam-status"><i /> กำลังตรวจจับ</span>
                    <span className="ex-cam-ai-label">AI POSE DETECTION</span>
                  </div>
                  <div className="ex-cam-count" aria-live="polite">
                    <strong>{counter}</strong><span>/ {targetCount} ครั้ง</span>
                  </div>
                  <div className="ex-cam-bottom">
                    <span>จัดตำแหน่งให้เห็นร่างกายเต็มตัว</span>
                    <span className="ex-cam-calories">{calories} kcal</span>
                  </div>
                </div>
                {SHOW_DEBUG && debug && <p className="ex-debug">{debug}</p>}
              </section>

              <aside className="ex-side">
                <section className="ex-card">
                  <div className="ex-card-head">
                    <span className="ex-mini-icon" aria-hidden="true">✦</span>
                    <div>
                      <h2>ความคืบหน้าของคุณ</h2>
                      <small>ทำตามเป้าหมายในแต่ละเซสชัน</small>
                    </div>
                  </div>

                  <div className="ex-stats">
                    <div className="ex-stat">
                      <span className="ex-stat-label"><b>✓</b> ทำไปแล้ว</span>
                      <strong className="ex-stat-value">{counter}<small> / {targetCount}</small></strong>
                      <span className="ex-stat-note">ครั้ง</span>
                    </div>
                    <div className="ex-stat">
                      <span className="ex-stat-label"><b>♨</b> พลังงานที่ใช้</span>
                      <strong className="ex-stat-value">{calories}<small> kcal</small></strong>
                      <span className="ex-stat-note">โดยประมาณ</span>
                    </div>
                  </div>

                  <div className="ex-progress-box">
                    <div className="ex-progress-top"><span>ความสำเร็จ</span><strong>{progress}%</strong></div>
                    <div className="ex-progress"><i style={{ width: `${progress}%` }} /></div>
                    <div className="ex-progress-foot"><span>เริ่มต้น</span><span>เป้าหมาย {targetCount} ครั้ง</span></div>
                  </div>

                  <div className="ex-feedback">
                    <span className="ex-feedback-icon" aria-hidden="true">✧</span>
                    <div>
                      <small>สถานะปัจจุบัน</small>
                      <strong>{feedback}</strong>
                    </div>
                  </div>
                </section>

                <section className="ex-card ex-tips">
                  <div className="ex-card-head">
                    <span className="ex-mini-icon" aria-hidden="true">💡</span>
                    <div><h2>คำแนะนำในการใช้งาน</h2></div>
                  </div>
                  <ul>
                    <li>ยืนห่างจากกล้องพอให้เห็นร่างกายตามที่ระบบต้องใช้</li>
                    <li>ออกกำลังกายในบริเวณที่มีแสงสว่างเพียงพอ</li>
                    <li>ทำท่าช้า ๆ และต่อเนื่อง เพื่อให้ AI ตรวจจับได้ชัดเจน</li>
                  </ul>
                </section>
              </aside>
            </div>
          </section>
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

      <style>{styles}</style>
    </div>
  );
}

/* สไตล์ส่วนโครงหน้า (แถบข้าง แถบบน แจ้งเตือน ธีม) ใช้ชุดเดียวกับหน้า Dashboard */
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

.fittrack-app h1,
.fittrack-app h2,
.fittrack-app h3 { color:var(--text) }
.fittrack-app img { color:var(--muted) }
:root { --bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735 }
* { box-sizing:border-box }
html,
body,
#root { margin:0;min-height:100%;background:var(--bg) }
body { font-family:'Anuphan',sans-serif;color:var(--text);overflow-x:hidden }
button,
input { font:inherit }
.fittrack-app { min-height:100vh;background:radial-gradient(circle at 75% 8%,rgba(50,255,100,.06),transparent 22%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.045),transparent 22%),#020609 }
.sidebar { position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column }
.sidebar:after { display:none }
.sidebar-logo-wrap { text-align:center;padding:4px 4px 25px }
.sidebar-logo { display:block;width:190px;height:112px;object-fit:contain;margin:0 auto }
.logo-caption { font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px }
.side-menu { display:flex;flex-direction:column;gap:9px }
.side-link { height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s }
.side-link:hover { border-color:#35534a;background:rgba(103,255,41,.05) }
.side-link.active { color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05) }
.side-icon { width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef }
.side-link.active .side-icon { color:var(--green) }
.sidebar-quote { margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:'Kanit';font-size:15px;line-height:1.55;font-style:italic }
.pulse-line { margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39 }
.pulse-line:before { content:'';position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33 }
.pulse-line i:first-child { position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg) }
.pulse-line b { position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg) }
.pulse-line i:last-child { position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff }
.logout-link { height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px }
.logout-link span { font-size:24px;margin-right:12px;color:#dce6e6 }
.main-area { margin-left:220px;min-height:100vh;padding:0 10px 40px;width:calc(100% - 220px) }
.topbar { height:100px;border-bottom:1px solid #18343b;display:flex;align-items:center;justify-content:space-between;padding:0 5px 0 18px }
.user-block { display:flex;align-items:center;gap:12px }
.avatar-wrap { position:relative;width:58px;height:58px }
.avatar-fallback { width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-weight:700;font-size:20px;box-shadow:0 0 0 3px rgba(255,255,255,.03) }
.online-dot { position:absolute;right:0;bottom:0;width:17px;height:17px;border-radius:50%;background:#6eff35;border:2px solid #06100c }
.hello { font-size:13px;color:#ddd;line-height:1.1 }
.user-block strong { font-family:'Kanit';font-size:22px;line-height:1.15 }
.topbar-right { display:flex;align-items:center;gap:15px }
.ai-note { text-align:right;font-size:12px;line-height:1.35;color:#e4e4e4;font-style:italic }
.ai-note em { color:var(--green);font-style:normal;font-weight:700 }
.ai-note span { color:#a24aff;font-size:20px }
.icon-button { position:relative;width:42px;height:42px;background:transparent;border:0;color:#f2f2f2;font-size:25px;cursor:pointer }
.icon-button i { position:absolute;right:6px;top:6px;width:7px;height:7px;background:#ff4667;border-radius:50% }
.icon-button.sun { font-size:28px }
.date-box { border-right:1px solid #30434a;padding:3px 15px;color:#ddd;font-size:11px;line-height:1.4 }
.date-box small { font-size:10px }
.dark-card { background:linear-gradient(145deg,#050b0e,#071116);border:1px solid #2a5360;border-radius:15px;box-shadow:inset 0 0 25px rgba(0,0,0,.25) }
.card-title { display:flex;align-items:center;gap:10px }
.card-title h2 { font-family:'Kanit';font-size:18px;margin:0;font-weight:500 }
.title-icon { width:34px;height:34px;display:grid;place-items:center;border-radius:9px;font-size:20px }
.title-icon.purple { color:#df78ff;border:1px solid #9442ba;background:rgba(174,58,255,.1) }
.title-icon.green { color:#91ff3e;border:1px solid #5ea02c;background:rgba(110,255,45,.07) }
.title-icon.yellow { color:#e7ef36;border:1px solid #9b9f27;background:rgba(232,240,48,.05) }
.lime-btn { height:37px;border:0;border-radius:8px;background:linear-gradient(90deg,#72ed2e,#baff3e);color:#071005;font-weight:700;cursor:pointer;box-shadow:0 0 16px rgba(125,255,45,.15) }
@media(max-width:1100px) {
  .sidebar { width:190px }
  .main-area { margin-left:190px;width:calc(100% - 190px) }
}
@media(max-width:760px) {
  .sidebar { position:relative;width:100%;height:auto;min-height:auto;padding:10px }
  .sidebar:after { display:none }
  .sidebar-logo { width:155px;height:88px }
  .side-menu { display:grid;grid-template-columns:repeat(5,1fr) }
  .side-link { height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px }
  .side-icon { font-size:18px }
  .sidebar-quote,
.logout-link { display:none }
  .main-area { margin-left:0;width:100%;padding:0 10px 25px }
  .topbar { height:auto;padding:13px 2px;gap:10px }
  .topbar-right { gap:5px }
  .ai-note,
.date-box { display:none }
}
.sidebar { border-right:1px solid #18343b !important; }
.main-area { border-right:0 !important;   outline-right:0 !important; }
.main-area { width:calc(100% - 220px) !important;   padding-right:0 !important; }
html,
body { width:100% !important;   max-width:none !important;   margin:0 !important; }
#root { width:100% !important;   max-width:none !important;   margin:0 !important;   padding:0 !important;   border:0 !important;   border-inline:0 !important;   box-shadow:none !important; }
.fittrack-app { width:100%; }
html.theme-anim * { transition:background-color .3s ease,border-color .3s ease,color .3s ease !important; }
html[data-theme="dark"] { color-scheme:dark }
html[data-theme="light"] { color-scheme:light;   --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;   --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a; }
html[data-theme="light"] .fittrack-app { background:radial-gradient(circle at 75% 8%,rgba(60,200,100,.14),transparent 24%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.08),transparent 24%),#edf3f1; }
html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important }
html[data-theme="light"] .sidebar-logo { filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply }
html[data-theme="light"] .side-link { color:#2a3a36 }
html[data-theme="light"] .side-link:hover { border-color:#9bc59a;background:rgba(60,170,40,.08) }
html[data-theme="light"] .side-link.active { color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16) }
html[data-theme="light"] .side-icon { color:#33433f }
html[data-theme="light"] .side-link.active .side-icon { color:#2a9d16 }
html[data-theme="light"] .sidebar-quote { color:#2a3a36 }
html[data-theme="light"] .pulse-line { border-bottom-color:#4fb82b }
html[data-theme="light"] .logout-link { color:#33433f;border-top-color:#d5e1dd }
html[data-theme="light"] .logout-link span { color:#33433f }
html[data-theme="light"] .topbar { border-bottom-color:#d3dfdb }
html[data-theme="light"] .online-dot { border-color:#edf3f1 }
html[data-theme="light"] .hello { color:#4a5b57 }
html[data-theme="light"] .ai-note { color:#3a4a46 }
html[data-theme="light"] .icon-button { color:#1f2d29 }
html[data-theme="light"] .date-box { color:#3a4a46;border-right-color:#c9d7d3 }
html[data-theme="light"] .dark-card { background:linear-gradient(145deg,#ffffff,#f5f9f8);border-color:#cddbd7;box-shadow:none }
html[data-theme="light"] .title-icon.purple { color:#9a2fd0;border-color:#c48be4;background:rgba(174,58,255,.08) }
html[data-theme="light"] .title-icon.green { color:#2a8a14;border-color:#8fcf63;background:rgba(110,255,45,.12) }
html[data-theme="light"] .title-icon.yellow { color:#8a7d00;border-color:#d4c94a;background:rgba(232,240,48,.15) }
@keyframes fittrack-logo-glow { 0%, 100% {     filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);   }   50% {     filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);   } }
.sidebar-logo { animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;   will-change: filter; }
@media (prefers-reduced-motion: reduce) {
  .sidebar-logo { animation-duration: 8s !important; }
}
.notification-wrap { position: relative; }
.notification-wrap .icon-button { display: grid; place-items: center; }
.notification-panel { position: absolute; z-index: 100; top: calc(100% + 12px); right: -62px;   width: min(320px, calc(100vw - 28px)); padding: 14px;   border: 1px solid #2d535d; border-radius: 13px;   background: #071116; color: #f4f7f6; box-shadow: 0 14px 40px rgba(0,0,0,.55); }
.notification-panel-title { display:flex; align-items:center; justify-content:space-between; gap:12px; font: 600 15px 'Kanit',sans-serif; margin-bottom: 9px; }
.notification-panel-title button { border:0; background:transparent; color:#b9c5c7; font-size:22px; cursor:pointer; }
.notification-item { display:flex; flex-direction:column; gap:4px; padding:10px 0; border-top:1px solid #203941; }
.notification-item strong { color:#a8f34a; font-size:12px; }
.notification-item span { font-size:11px; line-height:1.5; }
.notification-item small,
.notification-hint { color:#93a1a5; font-size:9px; line-height:1.5; }
.notification-hint { display:block; padding-top:8px; border-top:1px solid #203941; }
html[data-theme="light"] .notification-panel { background:#fff; color:#1d302b; border-color:#c8d8d2; box-shadow:0 14px 40px rgba(20,45,35,.18); }
html[data-theme="light"] .notification-item { border-color:#e0e9e5; }
html[data-theme="light"] .notification-hint { border-color:#e0e9e5; }
@media(max-width:760px) {
  .notification-panel { right:-42px; top:calc(100% + 8px); }
}
html[data-theme="light"] body,
html[data-theme="light"] #root { background:#edf4f1; color:#172923; }
html[data-theme="light"] .fittrack-app { background:radial-gradient(circle at 74% 7%,rgba(111,210,80,.13),transparent 25%),              radial-gradient(circle at 92% 62%,rgba(170,91,225,.09),transparent 24%),#edf4f1;   color:#172923; }
html[data-theme="light"] .main-area { color:#172923; }
html[data-theme="light"] .topbar { background:rgba(249,252,250,.76); border-bottom-color:#c8d8d1; }
html[data-theme="light"] .hello,
html[data-theme="light"] .ai-note,
html[data-theme="light"] .date-box { color:#40554d; }
html[data-theme="light"] .user-block strong { color:#172923; }
html[data-theme="light"] .icon-button { color:#263c33; }
html[data-theme="light"] .icon-button:hover { color:#278b20; background:#e3f3df; border-radius:10px; }
html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#fbfefc 0%,#edf5f1 100%); border-right-color:#c8d8d1 !important; }
html[data-theme="light"] .logo-caption { color:#53675f; }
html[data-theme="light"] .side-link { color:#31473e; }
html[data-theme="light"] .side-link:hover { background:#e8f4e5; border-color:#b7d7ae; }
html[data-theme="light"] .side-link.active { color:#17351b; background:linear-gradient(100deg,#dff5d7,#f1faed); border-color:#65b947; box-shadow:0 5px 15px rgba(66,145,48,.12),inset 0 0 0 1px rgba(255,255,255,.65); }
html[data-theme="light"] .side-icon { color:#40584e; }
html[data-theme="light"] .side-link.active .side-icon { color:#258d20; }
html[data-theme="light"] .sidebar-quote { color:#40564c; }
html[data-theme="light"] .logout-link { color:#40564c; border-top-color:#cfddd7; }
html[data-theme="light"] .logout-link span { color:#40564c; }
html[data-theme="light"] .dark-card { color:#172923; border-color:#c5d8d0;   background:linear-gradient(145deg,#ffffff 0%,#f6fbf8 100%);   box-shadow:0 8px 24px rgba(29,76,56,.075),inset 0 1px 0 rgba(255,255,255,.9); }
html[data-theme="light"] .card-title h2 { color:#172923; }
html[data-theme="light"] .title-icon.green { color:#278b20; border-color:#a5d38f; background:#e8f7df; }
html[data-theme="light"] .title-icon.purple { color:#8734b7; border-color:#d3a7e8; background:#f5e9fc; }
html[data-theme="light"] .title-icon.yellow { color:#887500; border-color:#dfd17b; background:#fff9d9; }
html[data-theme="light"] .lime-btn { background:linear-gradient(100deg,#66d92e,#a4ed39); color:#15300e; box-shadow:0 4px 12px rgba(74,166,39,.16); }
html[data-theme="light"] .lime-btn:hover { filter:saturate(1.08) brightness(.98); }
html[data-theme="light"] .notification-panel { background:#fff; color:#20372d; border-color:#c8d9d1; box-shadow:0 14px 38px rgba(29,67,49,.17); }
html[data-theme="light"] .notification-panel-title button { color:#52685e; }
html[data-theme="light"] .notification-item { border-color:#dce7e1; }
html[data-theme="light"] .notification-item strong { color:#287f1b; }
html[data-theme="light"] .notification-item span { color:#2e4439; }
html[data-theme="light"] .notification-item small,
html[data-theme="light"] .notification-hint { color:#657970; }
html[data-theme="light"] .notification-hint { border-color:#dce7e1; }
html[data-theme="light"] .fittrack-app { background: radial-gradient(ellipse at 78% 0%, #e8f6ee 0%, #f4f8f5 38%, #f2f6f4 100%);   color: #182b24; }
html[data-theme="light"] .sidebar { background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;   border-right: 1px solid #c5d9ce !important;   box-shadow: 5px 0 22px rgba(26, 74, 49, .045); }
html[data-theme="light"] .topbar { background: rgba(255,255,255,.82);   border-bottom: 1px solid #d2e2d9; }
html[data-theme="light"] .card-title h2 { color:#183128; }
html[data-theme="light"] .card-title p { color:#50665b; }
html[data-theme="light"] input,
html[data-theme="light"] textarea,
html[data-theme="light"] select { background:#fff; color:#1a3026; border-color:#afcbbd; }
html[data-theme="light"] .lime-btn { background:linear-gradient(105deg,#4bbd2a,#8bdc43); color:#12320d; box-shadow:0 5px 14px rgba(55,145,29,.2); }
html[data-theme="light"] .side-link.active { background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32; }
html[data-theme="light"] .icon-button { background:#f0f8f3; border:1px solid #c8ded1; color:#244b35; }
html[data-theme="light"] .icon-button:hover { background:#e3f4e9; }
.notification-wrap .notification-bell { border-radius: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 5px; transition: color .2s ease, transform .2s ease; }
.notification-wrap .notification-bell svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.notification-wrap .notification-bell:hover { transform: translateY(-2px) scale(1.06); background: transparent !important; box-shadow: none !important; color: var(--green); }
.notification-panel { width:min(360px,calc(100vw - 28px)); padding:0; overflow:hidden; border-radius:16px; animation: notif-pop .2s ease-out; }
.notification-panel-title { padding:15px 16px 12px; margin:0; border-bottom:1px solid rgba(130,160,150,.2); }
.notification-panel-title>span { display:flex; align-items:baseline; gap:8px; }
.notification-panel-title>span>small { font:400 10px 'Anuphan',sans-serif; opacity:.65; }
.notification-panel-title button { width:27px;height:27px;border-radius:50%;line-height:1; }
.notification-panel-title button:hover { background:rgba(130,150,140,.15); }
.notification-item { position:relative; flex-direction:row; align-items:flex-start; gap:10px; padding:12px 15px; border-top:0; transition:background .18s ease; }
.notification-item:hover { background:rgba(120,160,140,.10); }
.notification-avatar { flex:0 0 38px; width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:17px;background:linear-gradient(145deg,#244d37,#142c22);box-shadow:0 2px 8px rgba(0,0,0,.14); }
.notification-avatar.goal-avatar { background:linear-gradient(145deg,#56317b,#322047); }
.notification-message { min-width:0; flex:1; display:flex; flex-direction:column; gap:3px; }
.notification-message strong { color:inherit; font-size:11px; }
.notification-message strong small { font-size:9px;font-weight:400;color:#94a39d; }
.notification-message span { font-size:11px;line-height:1.5; }
.notification-message>small { font-size:9px;line-height:1.4;color:#9aa9a3; }
.notification-unread { flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#4eaeef;margin:7px 1px 0 0;box-shadow:0 0 0 3px rgba(78,174,239,.12); }
.notification-hint { display:block;padding:10px 15px 12px;border-top:1px solid rgba(130,160,150,.2); }
@keyframes notif-pop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
html[data-theme="light"] .notification-panel { background:#fff; color:#24372e; border-color:#c9ddd2; }
html[data-theme="light"] .notification-panel-title { border-color:#e2ebe5; }
html[data-theme="light"] .notification-item:hover { background:#f3f9f5; }
html[data-theme="light"] .notification-avatar { background:linear-gradient(145deg,#dff4e5,#c5e9d1); }
html[data-theme="light"] .notification-avatar.goal-avatar { background:linear-gradient(145deg,#f0e1ff,#dfc7f7); }
html[data-theme="light"] .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-message strong small,
html[data-theme="light"] .notification-message>small { color:#6e8276; }
html[data-theme="light"] .notification-hint { border-color:#e2ebe5; }
@media (prefers-reduced-motion: reduce) {
  .notification-panel { animation:none!important;transition:none!important; }
}
.notification-wrap .notification-bell { appearance:none; -webkit-appearance:none; background:transparent!important; border:0!important; outline-offset:3px; box-shadow:none!important; border-radius:0!important; }
.notification-wrap .notification-bell:hover,
.notification-wrap .notification-bell:focus-visible { background:transparent!important; box-shadow:none!important; color:var(--green); }
html[data-theme="light"] .notification-wrap .notification-bell { background:transparent!important; border:0!important; box-shadow:none!important; color:#244b35; }
html[data-theme="light"] .notification-wrap .notification-bell:hover { background:transparent!important; color:#278b20; }
.title-icon .bmi-title-svg { width:23px;height:23px;display:block;flex:none }
.notification-wrap .notification-panel { position: fixed; z-index: 9999; top: 88px; right: 24px;   width: min(370px, calc(100vw - 28px)); max-height: calc(100vh - 110px);   overflow: visible; padding: 0; border: 0; border-radius: 0;   background: transparent; color: inherit; box-shadow: none;   display: flex; flex-direction: column; gap: 10px;   animation: none; }
.notification-panel-title { order: -1; display:flex; align-items:center; justify-content:space-between;   margin:0 0 2px; padding:0 2px 4px; border:0; font-size:12px;   color:var(--muted,#82918b); text-shadow:0 1px 5px rgba(0,0,0,.12); }
.notification-panel-title>span { display:flex; align-items:baseline; gap:7px; }
.notification-panel-title>span>small { font-size:10px; }
.notification-panel-title button { color:inherit; width:24px; height:24px; font-size:20px; }
.notification-panel .notification-item { box-sizing:border-box; width:100%; min-height:76px; padding:13px 14px;   display:flex; flex-direction:row; align-items:flex-start; gap:11px;   border:1px solid rgba(150,175,162,.24); border-radius:14px;   background:rgba(13,27,24,.97); color:#f5faf6;   box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12);   animation:toast-enter .42s cubic-bezier(.2,.8,.2,1) both; }
.notification-panel .notification-item:nth-of-type(3) { animation-delay:.22s; }
.notification-panel .notification-item:hover { transform:translateX(-3px); background:rgba(20,39,32,.99); }
.notification-panel .notification-avatar { flex:0 0 38px; width:38px; height:38px; }
.notification-panel .notification-message { flex:1; min-width:0; gap:4px; }
.notification-panel .notification-message strong { font-size:12px; color:#f4faf5; }
.notification-panel .notification-message strong small { font-size:10px; color:#a7b8ad; }
.notification-panel .notification-message span { font-size:12px; line-height:1.5; color:#eef5f0; }
.notification-panel .notification-message>small { font-size:10px; line-height:1.45; color:#aab9b0; }
.notification-panel .notification-unread { margin-top:6px; }
.notification-panel .notification-hint { display:none; }
html[data-theme="light"] .notification-panel-title { color:#5c7065; text-shadow:none; }
html[data-theme="light"] .notification-panel .notification-item { background:rgba(255,255,255,.98); color:#24372e;   border-color:#dce9e0; box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07); }
html[data-theme="light"] .notification-panel .notification-item:hover { background:#f9fffb; }
html[data-theme="light"] .notification-panel .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-panel .notification-message strong small,
html[data-theme="light"] .notification-panel .notification-message>small { color:#718378; }
html[data-theme="light"] .notification-panel .notification-message span { color:#2e4438; }
@keyframes toast-enter { from { opacity:0; transform:translate3d(28px,-8px,0) scale(.97); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
@media(max-width:600px) {
  .notification-wrap .notification-panel { top:76px; right:12px; width:min(360px,calc(100vw - 24px)); }
}
@media(prefers-reduced-motion:reduce) {
  .notification-panel .notification-item { animation:none!important; transition:none!important; }
}
.notification-panel .notification-item { text-align:left; justify-content:flex-start; }
.notification-panel .notification-message { text-align:left; align-items:flex-start; }
.notification-panel .notification-message strong,
.notification-panel .notification-message span,
.notification-panel .notification-message>small { display:block; width:100%; text-align:left; }
.notification-panel .notification-avatar.dumbbell-avatar { flex:0 0 36px; width:36px; height:36px; border-radius:10px;   display:grid; place-items:center; background:transparent!important;   box-shadow:none!important; color:#83dc78; margin-top:1px; }
.notification-panel .notification-avatar.dumbbell-avatar svg { display:block; width:25px; height:25px; fill:none; stroke:currentColor;   stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
html[data-theme="light"] .notification-panel .notification-avatar.dumbbell-avatar { color:#278b43; }
.notification-wrap .notification-panel { background:transparent!important; border:0!important; box-shadow:none!important; }
.notification-wrap .notification-panel .notification-item { background:rgba(13,27,24,.97)!important;   border:1px solid rgba(150,175,162,.24)!important;   border-radius:14px!important;   box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12)!important;   color:#f5faf6; }
html[data-theme="light"] .notification-wrap .notification-panel .notification-item { background:rgba(255,255,255,.98)!important;   border-color:#dce9e0!important;   box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07)!important;   color:#24372e; }
.notification-wrap .notification-panel .notification-message,
.notification-wrap .notification-panel .notification-message strong,
.notification-wrap .notification-panel .notification-message span,
.notification-wrap .notification-panel .notification-message>small { background:transparent!important; box-shadow:none!important; }
.notification-wrap .notification-panel .notification-item:hover { transform:translateX(-3px); }
html[data-theme="light"] .notification-wrap .notification-panel .notification-item:hover { background:#f9fffb!important; }
@media (max-width: 760px) {
  html,
body,
#root,
.fittrack-app { width:100%; min-width:0; max-width:100%; }
  body { overflow-x:hidden; }
  .sidebar { width:100%; min-width:0; padding:8px 7px 9px; }
  .sidebar-logo-wrap { padding:0 2px 8px; }
  .sidebar-logo { width:132px; height:68px; max-width:42vw; }
  .logo-caption { margin-top:-5px; font-size:6px; letter-spacing:1.5px; }
  .side-menu { width:100%; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; }
  .side-link { width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere; }
  .side-icon { width:auto; min-height:19px; font-size:19px; line-height:1; }
  .main-area { margin:0!important; width:100%!important; min-width:0; padding:0 10px 22px!important; }
  .topbar { width:100%; min-width:0; min-height:70px; height:auto; padding:10px 2px; gap:8px; }
  .user-block { min-width:0; gap:8px; }
  .avatar-wrap,
.avatar-fallback { width:42px; height:42px; }
  .avatar-fallback { font-size:16px; }
  .online-dot { width:12px; height:12px; }
  .hello { font-size:11px; }
  .user-block strong { display:block; max-width:32vw; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .topbar-right { min-width:0; gap:4px; }
  .icon-button { width:36px; height:38px; flex:0 0 36px; font-size:22px; }
  .icon-button.sun { font-size:24px; }
  .notification-wrap { position:relative; }
  .notification-wrap .notification-panel { position:absolute; top:calc(100% + 8px); right:-4px; left:auto; width:min(340px,calc(100vw - 24px)); max-height:min(65vh,440px); overflow-y:auto; z-index:1000; }
  .dark-card { width:100%; min-width:0; }
}
@media (max-width: 390px) {
  .main-area { padding-left:8px!important; padding-right:8px!important; }
  .topbar { gap:4px; }
  .user-block { gap:6px; }
  .avatar-wrap,
.avatar-fallback { width:38px; height:38px; }
  .user-block strong { font-size:16px; max-width:29vw; }
  .topbar-right { gap:1px; }
  .icon-button { width:32px; flex-basis:32px; }
}
@media (max-width: 340px) {
  .side-link { font-size:7.5px; }
}
@media (max-width: 760px) and (orientation: landscape) {
  .sidebar-logo-wrap { display:none; }
  .sidebar { padding:5px 7px; }
  .side-link { height:44px; flex-direction:row; font-size:9px; }
}
.side-icon-dumbbell { display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px; }
.side-icon-dumbbell svg { display:block; width:25px; height:25px; }
@media (max-width:760px) {
  .side-icon-dumbbell { flex:0 0 auto; min-height:19px; }
  .side-icon-dumbbell svg { width:19px; height:19px; }
}
.fittrack-footer { width:100%; min-width:0; margin:28px 0 0; padding:16px 8px 10px;   border-top:1px solid rgba(91,145,139,.24);   display:flex; align-items:center; justify-content:space-between; gap:12px;   color:var(--muted); font-family:'Anuphan',sans-serif; }
.footer-brand { display:flex; align-items:center; gap:9px; color:var(--text); white-space:nowrap }
.footer-mark { width:27px;height:27px;display:grid;place-items:center;border-radius:8px;   color:#071006;background:linear-gradient(135deg,#9cff37,#36d98a);   font:700 10px 'Kanit',sans-serif;letter-spacing:-.5px;   box-shadow:0 3px 12px rgba(125,255,54,.16) }
.footer-brand strong { font:600 15px 'Kanit',sans-serif;letter-spacing:.25px;   background:linear-gradient(90deg,#baff52,#42dca0);-webkit-background-clip:text;background-clip:text;color:transparent }
.footer-description { font-size:11px;text-align:center;line-height:1.5 }
.footer-copyright { font-size:10px;white-space:nowrap;opacity:.78 }
html[data-theme="light"] .fittrack-footer { border-top-color:rgba(57,120,99,.2);color:#64766d }
html[data-theme="light"] .footer-brand { color:#20382d }
@media(max-width:760px) {
  .fittrack-footer { margin-top:18px;padding:13px 4px 8px;flex-wrap:wrap;justify-content:center;gap:6px 12px }
  .footer-brand { width:100%;justify-content:center }
  .footer-description { font-size:10px;width:100% }
  .footer-copyright { font-size:9px;width:100%;text-align:center }
}


/* ===================== EXERCISE PAGE (เนื้อหาเฉพาะหน้า) ===================== */
.ex-content { width:100%; padding:20px 8px 0; }
.ex-shell { padding:22px 22px 24px; display:grid; gap:16px; border-color:#2f7a52; box-shadow:inset 0 0 0 1px rgba(110,255,50,.08), 0 0 28px rgba(80,255,120,.06); }
.ex-head { display:flex; align-items:center; gap:16px; }
.ex-head-icon { width:62px; height:62px; flex:none; display:grid; place-items:center; border:2px solid #7cff31; border-radius:14px; color:#8cff32; box-shadow:0 0 16px rgba(110,255,50,.25); }
.ex-head-copy { min-width:0; }
.ex-head h1 { margin:0; font:600 32px/1.2 'Kanit',sans-serif; }
.ex-head p { margin:2px 0 0; color:var(--muted); font-size:14px; }
.ex-back { margin-left:auto; flex:none; height:40px; padding:0 18px; border:1px solid #2a5360; border-radius:10px; background:transparent; color:var(--text); font-size:13px; cursor:pointer; transition:.2s ease; }
.ex-back:hover { border-color:#8cff32; color:#8cff32; box-shadow:0 0 14px rgba(110,255,50,.16); }

.ex-grid { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr); gap:14px; align-items:start; }
.ex-side { display:grid; gap:14px; min-width:0; }
.ex-card { min-width:0; padding:16px; border:1px solid #1f4f55; border-radius:14px; background:rgba(255,255,255,.015); box-shadow:inset 0 0 22px rgba(0,0,0,.18); }
.ex-card-head { display:flex; align-items:center; gap:12px; margin-bottom:14px; min-width:0; }
.ex-card-head h2 { margin:0; font:500 18px 'Kanit',sans-serif; line-height:1.35; letter-spacing:.1px; }
.ex-card-head small { display:block; margin-top:4px; font-size:11px; color:var(--muted); line-height:1.55; letter-spacing:.1px; }
.ex-mini-icon { width:34px; height:34px; flex:none; display:grid; place-items:center; border:1px solid #5ea02c; border-radius:9px; background:rgba(110,255,45,.07); color:#91ff3e; font-size:17px; }
.ex-camera-actions { margin-left:auto; display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
.ex-live { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid rgba(110,255,50,.35); border-radius:999px; background:rgba(110,255,50,.08); color:#8cff32; font-size:10px; font-weight:700; white-space:nowrap; }
.ex-live i, .ex-cam-status i { width:7px; height:7px; border-radius:50%; background:#6eff35; box-shadow:0 0 0 3px rgba(110,255,53,.18); }

.ex-title-row { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin:0 2px 12px; padding:0 2px; }
.ex-eyebrow { color:var(--cyan); font-size:10px; font-weight:700; letter-spacing:2px; }
.ex-title-row h3 { margin:5px 0 0; font:600 22px/1.35 'Kanit',sans-serif; letter-spacing:.1px; }
.ex-target { flex:none; padding:8px 14px; border:1px solid #2a5360; border-radius:999px; color:#78d6ff; font-size:11px; font-weight:700; }

.ex-camera { position:relative; width:fit-content; max-width:100%; margin:0 auto; padding:10px; overflow:hidden; border:1px solid #2a5a66; border-radius:14px; background:#050b0c; box-shadow:0 0 22px rgba(17,204,255,.05); }
/* สี่เหลี่ยมผืนผ้าแนวตั้ง 3:4 สูงตามหน้าจอ เพื่อให้เห็นทั้งตัวและเห็นตัวนับโดยไม่ต้องเลื่อน */
.ex-camera canvas { display:block; height:clamp(560px, calc(100vh - 150px), 900px); width:auto; aspect-ratio:3/4; border-radius:10px; background:#030708; }
.ex-cam-count { position:absolute; left:50%; bottom:46px; transform:translateX(-50%); display:flex; align-items:baseline; gap:6px; padding:6px 18px; border:1px solid rgba(110,255,50,.45); border-radius:14px; background:rgba(2,8,10,.72); backdrop-filter:blur(5px); color:#fff; pointer-events:none; box-shadow:0 0 16px rgba(110,255,50,.2); }
.ex-cam-count strong { font:600 40px/1 'Kanit',sans-serif; color:#8cff32; }
.ex-cam-count span { font:500 15px 'Kanit',sans-serif; color:#dfe8e6; }
.ex-cam-top, .ex-cam-bottom { position:absolute; left:22px; right:22px; display:flex; align-items:center; justify-content:space-between; gap:14px; color:#e4efef; font-size:11px; pointer-events:none; }
.ex-cam-top { top:22px; }
.ex-cam-bottom { bottom:22px; }
.ex-cam-status { display:inline-flex; align-items:center; gap:8px; padding:7px 11px; border-radius:999px; background:rgba(2,8,10,.7); backdrop-filter:blur(5px); }
.ex-cam-bottom span, .ex-cam-top > span:last-child { padding:7px 11px; border-radius:999px; background:rgba(2,8,10,.55); }

.ex-camera-toggle { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 12px; border:1px solid #355b63; border-radius:9px; background:rgba(255,255,255,.035); color:var(--text); font:600 11px 'Kanit',sans-serif; letter-spacing:.1px; cursor:pointer; transition:.2s ease; }
.ex-camera-toggle:hover { border-color:#8cff32; color:#8cff32; transform:translateY(-1px); }
.ex-camera-toggle.is-on { border-color:rgba(110,255,50,.4); background:rgba(110,255,50,.08); color:#9aff5b; }
.ex-camera-toggle.is-off { border-color:rgba(255,120,120,.35); background:rgba(255,90,90,.07); color:#ffb2b2; }
.ex-toggle-dot { width:7px; height:7px; border-radius:50%; background:#6eff35; box-shadow:0 0 0 3px rgba(110,255,53,.14); }
.ex-camera-toggle.is-off .ex-toggle-dot { background:#ff7777; box-shadow:0 0 0 3px rgba(255,119,119,.12); }
.ex-live.is-off { color:#ffb2b2; border-color:rgba(255,120,120,.28); background:rgba(255,90,90,.06); }
.ex-live.is-off i { background:#ff7777; box-shadow:0 0 0 3px rgba(255,119,119,.12); }
.ex-cam-ai-label { letter-spacing:1.4px; font-size:9px; font-weight:700; }
.ex-cam-calories { letter-spacing:.2px; }
.ex-camera-off-overlay { position:absolute; inset:10px; z-index:3; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; text-align:center; color:#eaf4f2; background:rgba(2,8,10,.76); backdrop-filter:blur(6px); border-radius:10px; pointer-events:none; }
.ex-camera-off-icon { width:48px; height:48px; display:grid; place-items:center; border:1px solid rgba(255,120,120,.35); border-radius:14px; background:rgba(255,90,90,.08); color:#ff9999; font-size:21px; }
.ex-camera-off-overlay strong { font:600 17px/1.35 'Kanit',sans-serif; }
.ex-camera-off-overlay span { max-width:290px; color:#aebfbc; font-size:11px; line-height:1.6; }

.ex-debug { margin:9px 2px 0; color:var(--muted); font-size:10px; text-align:center; }

.ex-stats { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ex-stat { display:flex; flex-direction:column; gap:4px; min-height:128px; padding:14px; border:1px solid #1f4f55; border-radius:12px; background:rgba(255,255,255,.02); }
.ex-stat-label { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; font-weight:600; }
.ex-stat-label b { width:25px; height:25px; display:grid; place-items:center; border-radius:8px; color:#8cff32; background:rgba(110,255,45,.1); font-size:12px; }
.ex-stat-value { margin-top:6px; font:600 34px/1.1 'Kanit',sans-serif; color:var(--text); }
.ex-stat-value small { color:var(--green2); font:500 11px 'Anuphan',sans-serif; }
.ex-stat-note { color:var(--muted); font-size:10px; }

.ex-progress-box { margin:14px 0; padding:14px; border:1px solid #1f4f55; border-radius:12px; }
.ex-progress-top, .ex-progress-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; color:var(--muted); font-size:11px; }
.ex-progress-top { margin-bottom:8px; }
.ex-progress-top strong { color:var(--green2); font:600 17px 'Kanit',sans-serif; }
.ex-progress { height:10px; overflow:hidden; border-radius:20px; background:rgba(255,255,255,.08); }
.ex-progress i { display:block; height:100%; border-radius:20px; background:linear-gradient(90deg,#72ed2e,#baff3e); box-shadow:0 0 12px rgba(125,255,45,.35); transition:width .3s ease; }
.ex-progress-foot { margin-top:6px; font-size:10px; }

.ex-feedback { display:flex; flex-direction:row; gap:12px; align-items:center; text-align:left; padding:13px; border:1px solid rgba(24,216,255,.28); border-radius:12px; background:linear-gradient(100deg,rgba(24,216,255,.09),rgba(24,216,255,.02)); }
.ex-feedback > div { flex:1 1 auto; min-width:0; text-align:left; }
.ex-feedback-icon { width:29px; height:29px; flex:none; display:grid; place-items:center; border-radius:9px; color:var(--cyan); background:rgba(24,216,255,.12); line-height:1; text-align:center; }
.ex-feedback small { display:block; margin-bottom:2px; font-size:10px; color:var(--muted); }
.ex-feedback strong { display:block; font-size:13px; line-height:1.5; font-weight:600; color:var(--text); }

.ex-tips ul { margin:0; padding:0; list-style:none; display:grid; gap:7px; }
.ex-tips li { position:relative; padding-left:16px; color:var(--muted); font-size:12px; line-height:1.55; text-align:left; }
.ex-tips ul { text-align:left; justify-items:stretch; }
.ex-tips .ex-card-head { justify-content:center; text-align:center; }
.ex-tips li:before { content:''; position:absolute; left:2px; top:.62em; width:6px; height:6px; border-radius:50%; background:#6eff35; box-shadow:0 0 8px rgba(110,255,53,.6); }

@media (max-width:1200px) {
  .ex-grid { grid-template-columns:1fr; }
}
@media (max-width:640px) {
  .ex-camera canvas { height:clamp(480px, 78vh, 780px); max-width:100%; }
  .ex-cam-count strong { font-size:32px; }
  .ex-shell { padding:14px; }
  .ex-head { flex-wrap:wrap; }
  .ex-head h1 { font-size:23px; }
  .ex-head-icon { width:48px; height:48px; }
  .ex-back { margin-left:0; width:100%; }
  .ex-camera-actions { width:100%; margin-left:0; justify-content:space-between; }
  .ex-live { display:inline-flex; }
  .ex-title-row { align-items:flex-start; flex-direction:column; }
  .ex-stat { min-height:108px; padding:11px; }
  .ex-stat-value { font-size:28px; }
  .ex-cam-top, .ex-cam-bottom { left:16px; right:16px; }
}

/* โหมดสว่างของเนื้อหา */
html[data-theme="light"] .ex-shell { border-color:#9fd3a8; box-shadow:0 8px 24px rgba(29,76,56,.07); }
html[data-theme="light"] .ex-head h1 { color:#12201c; }
html[data-theme="light"] .ex-head p,
html[data-theme="light"] .ex-card-head small,
html[data-theme="light"] .ex-stat-label,
html[data-theme="light"] .ex-stat-note,
html[data-theme="light"] .ex-progress-top,
html[data-theme="light"] .ex-progress-foot,
html[data-theme="light"] .ex-feedback small,
html[data-theme="light"] .ex-tips li,
html[data-theme="light"] .ex-debug { color:#4a5e57; }
html[data-theme="light"] .ex-head-icon { color:#2a9d16; border-color:#4fb82b; box-shadow:none; }
html[data-theme="light"] .ex-card,
html[data-theme="light"] .ex-stat,
html[data-theme="light"] .ex-progress-box { background:#fff; border-color:#bfd8d0; box-shadow:none; }
html[data-theme="light"] .ex-mini-icon { color:#2a9d16; border-color:#8cc97a; background:#f1faec; }
html[data-theme="light"] .ex-stat-label b { color:#2a9d16; background:#e6f5de; }
html[data-theme="light"] .ex-stat-value { color:#172923; }
html[data-theme="light"] .ex-stat-value small,
html[data-theme="light"] .ex-progress-top strong,
html[data-theme="light"] .ex-live { color:#2f8a10; }
html[data-theme="light"] .ex-live { border-color:#9ccb6b; background:#f1faec; }
html[data-theme="light"] .ex-eyebrow { color:#1f7aa6; }
html[data-theme="light"] .ex-target { color:#1f7aa6; border-color:#b8cfc8; }
html[data-theme="light"] .ex-back { color:#2a3a36; border-color:#b8cfc8; background:#fff; }
html[data-theme="light"] .ex-back:hover { color:#2f8a10; border-color:#6cc943; }
html[data-theme="light"] .ex-progress { background:rgba(0,0,0,.09); }
html[data-theme="light"] .ex-feedback { border-color:#a9d9e8; background:linear-gradient(100deg,#eef9fd,#fff); }
html[data-theme="light"] .ex-feedback-icon { color:#1f7aa6; background:#dff3fa; }
html[data-theme="light"] .ex-feedback strong { color:#172923; }
html[data-theme="light"] .ex-camera { border-color:#9fc3cf; box-shadow:none; }
html[data-theme="light"] .ex-camera-toggle { color:#29413a; border-color:#bfd2cb; background:#fff; }
html[data-theme="light"] .ex-camera-toggle.is-on { color:#2f8a10; border-color:#9ccb6b; background:#f1faec; }
html[data-theme="light"] .ex-camera-toggle.is-off { color:#a04a4a; border-color:#e2b9b9; background:#fff6f6; }
html[data-theme="light"] .ex-live.is-off { color:#a04a4a; border-color:#e2b9b9; background:#fff6f6; }
html[data-theme="light"] .ex-camera-off-overlay { background:rgba(245,249,248,.88); color:#20332e; }
html[data-theme="light"] .ex-camera-off-overlay span { color:#62736e; }

/* sidebar 5 เมนู: ปรับระยะตามความสูงจอ ให้ข้อความ "สุขภาพที่ดี…" และปุ่มออกจากระบบอยู่ในจอเสมอ */
.sidebar { overflow-y:auto; overflow-x:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.sidebar::-webkit-scrollbar { display:none; }
.sidebar-logo-wrap, .side-menu, .logout-link { flex-shrink:0; }
@media (min-width:761px) {
  .sidebar { padding-top:clamp(10px,2.2vh,22px); padding-bottom:clamp(8px,1.8vh,18px); }
  .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5vh,25px); }
  .sidebar-logo { height:clamp(64px,11vh,112px); }
  .side-menu { gap:clamp(3px,.9vh,9px); }
  .side-link { height:clamp(40px,7.2vh,57px); }
  .sidebar-quote { margin-bottom:clamp(4px,2vh,24px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(11px,1.7vh,15px); line-height:1.45; }
  .pulse-line { margin-top:clamp(4px,1.2vh,12px); }
  .logout-link { height:clamp(40px,6vh,54px); }
}
@supports (height:1dvh) {
  @media (min-width:761px) {
    .sidebar { padding-top:clamp(10px,2.2dvh,22px); padding-bottom:clamp(8px,1.8dvh,18px); }
    .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5dvh,25px); }
    .sidebar-logo { height:clamp(64px,11dvh,112px); }
    .side-menu { gap:clamp(3px,.9dvh,9px); }
    .side-link { height:clamp(40px,7.2dvh,57px); }
    .sidebar-quote { margin-bottom:clamp(4px,2dvh,24px); padding:clamp(4px,1dvh,12px) 14px; font-size:clamp(11px,1.7dvh,15px); line-height:1.45; }
    .pulse-line { margin-top:clamp(4px,1.2dvh,12px); }
    .logout-link { height:clamp(40px,6dvh,54px); }
  }
}
/* sidebar สมส่วน: ทุกส่วนโตตามความสูงจอ และเมนูกระจายตัวกินพื้นที่ที่เหลือ ไม่เกิดช่องว่างใหญ่ใต้เมนู */
@media (min-width:761px) {
  .sidebar-logo-wrap { padding-bottom:clamp(8px,2.6vh,28px); }
  .sidebar-logo { width:100%; height:clamp(78px,15vh,170px); transform:scale(1.18); transform-origin:center top; }
  .logo-caption { font-size:clamp(8px,1.15vh,11px); letter-spacing:2.4px; margin-top:clamp(4px,1.2vh,14px); }
  .side-menu { flex:1 0 auto; justify-content:space-evenly; gap:clamp(3px,.9vh,10px); }
  .side-link { height:clamp(44px,8vh,66px); font-size:clamp(14px,1.9vh,17px); }
  .side-icon { font-size:clamp(22px,2.9vh,28px); }
  .sidebar-quote { margin-top:clamp(6px,2vh,22px); margin-bottom:clamp(6px,2vh,22px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(14px,2.3vh,20px); line-height:1.5; text-align:center; }
  .pulse-line { margin-top:clamp(8px,1.8vh,18px); }
  .logout-link { height:clamp(44px,6.4vh,60px); font-size:clamp(14px,1.9vh,17px); }
}
/* มือถือ: แสดงปุ่มออกจากระบบเป็นไอคอนมุมขวาบนของแถบเมนู */
@media (max-width:760px) {
  .sidebar { overflow:visible; }
  .logout-link { display:flex !important; align-items:center; justify-content:center; position:absolute; top:10px; right:10px; z-index:2; width:42px; height:42px; padding:0; border:1px solid rgba(120,160,150,.45); border-radius:12px; font-size:0; }
  .logout-link span { margin:0; font-size:22px; }
}

`;