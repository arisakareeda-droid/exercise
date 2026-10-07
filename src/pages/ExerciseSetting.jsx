import React, { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import { readEnergy, subscribeEnergy } from "../calorieSync";

// แคชชื่อผู้ใช้ไว้ เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที ไม่กระพริบเป็นชื่ออื่น (key เดียวกับทุกหน้า)
const NAME_CACHE_KEY = "fittrack-user-name";
const getCachedName = () => {
  try { return localStorage.getItem(NAME_CACHE_KEY) || ""; } catch { return ""; }
};
const setCachedName = (name) => {
  try { localStorage.setItem(NAME_CACHE_KEY, name); } catch { /* storage optional */ }
};
const clearCachedName = () => {
  try { localStorage.removeItem(NAME_CACHE_KEY); } catch { /* storage optional */ }
};
const getInitialName = () => getCachedName() || auth.currentUser?.displayName || "";

// ผลคำนวณ BMI/TDEE ของ Dashboard (key เดียวกัน) ล้างตอนออกจากระบบเหมือนกัน
const HEALTH_CACHE_KEY = "fittrack-health-result";
const clearHealthCache = () => {
  try { localStorage.removeItem(HEALTH_CACHE_KEY); } catch { /* storage optional */ }
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ยอดแคลอรี่จากอาหารที่บันทึกไว้ของวันนี้ (key เดียวกับหน้า Dashboard)
const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

// ---------- ข้อมูลสำหรับการแจ้งเตือน (ชุดเดียวกับหน้า Dashboard / หน้าเลือกท่า) ----------
const readHealthCache = () => {
  try {
    const raw = localStorage.getItem(HEALTH_CACHE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
};

const WORKOUT_CACHE_KEY = "fittrack-history-workouts";
const CAL_PER_REP = { squat: 0.32, jumping_jack: 0.2, high_knees: 0.15, punches: 0.25 };
const workoutKcal = (w) => (
  w.calories !== undefined ? Number(w.calories) || 0 : (Number(w.count) || 0) * (CAL_PER_REP[w.exercise] ?? 0.32)
);
const workoutTime = (t) => {
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t.__ts === "number") return t.__ts;
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
};
const toWorkoutLog = (list) => list
  .map((w) => ({ t: workoutTime(w.completedAt), kcal: workoutKcal(w) }))
  .filter((x) => x.t);
const readWorkoutLog = () => {
  try {
    const raw = localStorage.getItem(WORKOUT_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? toWorkoutLog(list) : [];
  } catch {
    return [];
  }
};
const fmtBurn = (n) => (Math.round((n || 0) * 10) / 10).toLocaleString();

// ======================================================================
// แคตตาล็อกท่าออกกำลังกาย — ชุดเดียวกับหน้าเลือกท่า (ExerciseSelect)
// หน้านี้อ่านพารามิเตอร์ ?exercise=<id> แล้วค้นหาท่าจากที่นี่ จึงรองรับทุกท่าที่เลือกมา
// หมายเหตุ: ถ้าเพิ่มท่าใหม่ในหน้าเลือกท่า ให้เพิ่มแถวเดียวกันที่นี่ด้วย
// ======================================================================
const NONE = "none";

const PART_LABEL = {
  shoulder: "ไหล่", chest: "อก", back: "หลัง", arm: "แขน",
  core: "ท้อง", leg: "สะโพก", leg2: "ต้นขา", calf: "น่อง",
};

// ไฟล์วิดีโอตัวอย่าง (โฟลเดอร์ public) — ท่าที่ยังไม่มีคลิปจะแสดงไอคอนแทน
const EXERCISE_VIDEOS = {
  squat: "/squats.mp4",
  jumping_jack: "/jumping_jack.mp4",
  high_knees: "/high_knees.mp4",
  punches: "/punches.mp4",
  push_up: "/Push_up.mp4",
  diamond_push_up: "/Diamond_push_up.mp4",
  bird_dog: "/Bird_dog.mp4",
  mountain_climber: "/Mountain_climber.mp4",
  reverse_snow_angel: "/Reverse_snow_angel.mp4",
  plank: "/Plank.mp4",
};

const BODYWEIGHT_ROWS = [
  ["push_up", "Push Up", "วิดพื้น", ["chest", "arm"], NONE, 3, "10-15 ครั้ง", "กลาง", "วางมือกว้างกว่าไหล่เล็กน้อย ลำตัวตรงเป็นเส้นเดียว งอศอกลดอกลงใกล้พื้น แล้วดันกลับขึ้น"],
  ["diamond_push_up", "Diamond Push Up", "วิดพื้นมือเพชร", ["arm", "chest"], NONE, 3, "8-12 ครั้ง", "ยาก", "วางมือชิดกันใต้อกให้นิ้วโป้งและนิ้วชี้ประกบเป็นรูปข้าวหลามตัด ลดอกลงโดยให้ศอกแนบลำตัว แล้วดันกลับ"],
  ["bird_dog", "Bird Dog", "เบิร์ดด็อก", ["back", "core"], NONE, 3, "10 ครั้ง/ข้าง", "ง่าย", "ตั้งท่าคลาน เหยียดแขนข้างหนึ่งไปข้างหน้าและขาฝั่งตรงข้ามไปข้างหลังพร้อมกัน ค้างแล้วสลับข้างโดยลำตัวไม่เอียง"],
  ["reverse_snow_angel", "Reverse Snow Angel", "สโนว์แองเจิลย้อนกลับ", ["back", "shoulder"], NONE, 3, "12 ครั้ง", "กลาง", "นอนคว่ำยกแขนลอยจากพื้น กวาดแขนเป็นครึ่งวงกลมจากข้างลำตัวไปเหนือศีรษะแล้วกลับมาช้า ๆ"],
  ["plank", "Plank", "แพลงก์", ["core"], NONE, 3, "30-45 วินาที", "ง่าย", "ค้ำตัวบนข้อศอกและปลายเท้า ลำตัวตรงเป็นเส้นเดียว เกร็งหน้าท้องและก้นค้างไว้ตามเวลา"],
  ["mountain_climber", "Mountain Climber", "ปีนเขา", ["core", "leg2"], NONE, 3, "30 วินาที", "กลาง", "ตั้งท่าวิดพื้นแขนตรง สลับดึงเข่าเข้าหาอกอย่างรวดเร็วโดยสะโพกไม่ยกสูง"],
];

const EQUIPMENT_ROWS = [
  // ดัมเบล
  ["dumbbell_shoulder_press", "Dumbbell Shoulder Press", "ดัมเบลชอล์เดอร์เพรส", ["shoulder", "arm"], "ดัมเบล", 3, "8-12 ครั้ง", "กลาง", "นั่งหลังตรง ถือดัมเบลระดับหูฝ่ามือหันไปข้างหน้า ดันขึ้นเหนือศีรษะจนแขนเกือบตรง แล้วลดลงช้า ๆ"],
  ["dumbbell_lateral_raise", "Dumbbell Lateral Raise", "ดัมเบลยกไหล่ด้านข้าง", ["shoulder"], "ดัมเบล", 3, "12-15 ครั้ง", "ง่าย", "ยืนตรง ถือดัมเบลข้างลำตัว ยกแขนออกด้านข้างจนเสมอไหล่โดยศอกงอเล็กน้อย แล้วลดลงอย่างควบคุม"],
  ["dumbbell_bench_press", "Dumbbell Bench Press", "ดัมเบลเบนช์เพรส", ["chest", "arm"], "ดัมเบล", 3, "8-12 ครั้ง", "กลาง", "นอนหงายบนม้านั่ง ถือดัมเบลสองข้างระดับอก ดันขึ้นจนแขนเกือบตรง แล้วลดลงช้า ๆ ให้ศอกทำมุมประมาณ 45 องศา"],
  ["dumbbell_row", "One-Arm Dumbbell Row", "ดัมเบลโรว์แขนเดียว", ["back", "arm"], "ดัมเบล", 3, "10-12 ครั้ง/ข้าง", "กลาง", "ใช้มือและเข่าข้างหนึ่งยันม้านั่ง หลังขนานพื้น ดึงดัมเบลเข้าหาสะโพกพร้อมบีบสะบัก แล้วลดลงช้า ๆ"],
  ["dumbbell_curl", "Dumbbell Curl", "ดัมเบลเคิร์ล", ["arm"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ยืนตรง ศอกแนบลำตัว งอข้อศอกยกดัมเบลขึ้นหาไหล่ แล้วลดลงช้า ๆ โดยไม่เหวี่ยงตัว"],
  ["goblet_squat", "Goblet Squat", "ก็อบเล็ตสควอท", ["leg", "leg2"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ถือดัมเบลแนบอก ยืนกว้างเท่าไหล่ ย่อสะโพกลงโดยหลังตรง แล้วดันส้นเท้ากลับขึ้น"],
  ["dumbbell_calf_raise", "Dumbbell Calf Raise", "ดัมเบลเขย่งปลายเท้า", ["calf"], "ดัมเบล", 3, "15-20 ครั้ง", "ง่าย", "ถือดัมเบลสองข้างลำตัว เขย่งส้นเท้าขึ้นให้สูงที่สุด ค้างเล็กน้อย แล้วลดลงช้า ๆ"],
  // บาร์เบล
  ["barbell_bench_press", "Barbell Bench Press", "บาร์เบลเบนช์เพรส", ["chest", "arm"], "บาร์เบล", 4, "6-10 ครั้ง", "ยาก", "นอนหงาย จับบาร์กว้างกว่าไหล่ ลดบาร์ลงแตะกลางอก แล้วดันขึ้นจนแขนตรง ควรมีผู้ช่วยดู"],
  ["barbell_deadlift", "Barbell Deadlift", "บาร์เบลเดดลิฟต์", ["back", "leg"], "บาร์เบล", 3, "5-8 ครั้ง", "ยาก", "ยืนชิดบาร์ หลังตรง งอสะโพกจับบาร์ แล้วดันเท้าลงพื้นยืดลำตัวขึ้นพร้อมบาร์ ลดลงอย่างควบคุม"],
  ["barbell_squat", "Barbell Back Squat", "บาร์เบลสควอท", ["leg", "leg2"], "บาร์เบล", 4, "6-10 ครั้ง", "ยาก", "วางบาร์บนหลังส่วนบน ยืนกว้างเท่าไหล่ ย่อลงจนต้นขาขนานพื้นโดยหลังตรง แล้วดันขึ้น"],
  ["barbell_overhead_press", "Barbell Overhead Press", "บาร์เบลโอเวอร์เฮดเพรส", ["shoulder", "arm"], "บาร์เบล", 3, "6-10 ครั้ง", "ยาก", "ยืนตรง ถือบาร์ระดับไหล่ เกร็งท้อง ดันบาร์ขึ้นเหนือศีรษะจนแขนตรง แล้วลดกลับช้า ๆ"],
  // เคเบิล
  ["cable_row", "Seated Cable Row", "เคเบิลโรว์นั่ง", ["back", "arm"], "เคเบิล", 3, "10-12 ครั้ง", "กลาง", "นั่งหลังตรง ดึงมือจับเข้าหาท้องพร้อมบีบสะบักเข้าหากัน แล้วปล่อยกลับช้า ๆ"],
  ["cable_triceps_pushdown", "Cable Triceps Pushdown", "เคเบิลดันไตรเซ็ปส์", ["arm"], "เคเบิล", 3, "12-15 ครั้ง", "ง่าย", "ยืนหน้าเครื่อง ศอกแนบลำตัว กดมือจับลงจนแขนตรง แล้วปล่อยกลับช้า ๆ โดยศอกอยู่กับที่"],
  ["cable_crunch", "Cable Crunch", "เคเบิลครันช์", ["core"], "เคเบิล", 3, "12-15 ครั้ง", "กลาง", "คุกเข่าหน้าเครื่อง จับเชือกข้างศีรษะ ม้วนลำตัวลงโดยเกร็งหน้าท้อง แล้วกลับขึ้นช้า ๆ"],
  // เครื่องออกกำลังกาย
  ["lat_pulldown", "Lat Pulldown", "แลตพูลดาวน์", ["back", "arm"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "กลาง", "นั่งล็อกต้นขาให้แน่น จับบาร์กว้างกว่าไหล่ ดึงลงมาที่หน้าอกส่วนบนพร้อมบีบสะบัก แล้วปล่อยขึ้นช้า ๆ"],
  ["chest_press_machine", "Chest Press Machine", "เครื่องเชสต์เพรส", ["chest", "arm"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "ง่าย", "ปรับเบาะให้มือจับอยู่ระดับอก ดันไปข้างหน้าจนแขนเกือบตรง แล้วปล่อยกลับช้า ๆ"],
  ["leg_press", "Leg Press", "เลกเพรส", ["leg", "leg2"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "กลาง", "นั่งหลังแนบเบาะ วางเท้ากว้างเท่าไหล่บนแป้น ดันออกจนเกือบเหยียดเข่า แล้วงอกลับช้า ๆ โดยไม่ล็อกเข่า"],
  ["seated_calf_raise", "Seated Calf Raise", "เครื่องเขย่งน่องแบบนั่ง", ["calf"], "เครื่องออกกำลังกาย", 3, "15-20 ครั้ง", "ง่าย", "นั่งวางปลายเท้าบนแป้น ดันส้นเท้าขึ้นให้สูงที่สุด ค้างเล็กน้อย แล้วลดลงช้า ๆ"],
  ["shoulder_press_machine", "Shoulder Press Machine", "เครื่องชอล์เดอร์เพรส", ["shoulder"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "ง่าย", "ปรับเบาะให้มือจับอยู่ระดับไหล่ ดันขึ้นเหนือศีรษะ แล้วลดลงช้า ๆ โดยหลังแนบเบาะ"],
  // ยางยืด
  ["band_pull_apart", "Band Pull Apart", "ดึงยางยืดแยกแขน", ["back", "shoulder"], "ยางยืด", 3, "15 ครั้ง", "ง่าย", "ถือยางยืดสองมือระดับอกแขนตรง ดึงแยกออกด้านข้างพร้อมบีบสะบัก แล้วปล่อยกลับช้า ๆ"],
  ["band_chest_press", "Band Chest Press", "ยางยืดดันอก", ["chest", "arm"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "คล้องยางยืดไว้ด้านหลัง จับสองปลายที่ระดับอก ดันไปข้างหน้าจนแขนตรง แล้วปล่อยกลับช้า ๆ"],
  ["band_squat", "Banded Squat", "สควอทยางยืด", ["leg", "leg2"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "คล้องยางยืดเหนือเข่า ยืนกว้างเท่าไหล่ ย่อตัวลงโดยดันเข่าออกต้านยาง แล้วดันกลับขึ้น"],
  // Kettlebell
  ["kettlebell_swing", "Kettlebell Swing", "เคตเทิลเบลสวิง", ["leg", "back"], "Kettlebell", 3, "12-15 ครั้ง", "กลาง", "ยืนกว้างกว่าไหล่ ถือเคตเทิลเบลสองมือ ส่งสะโพกไปข้างหลังแล้วดันสะโพกไปข้างหน้าให้เคตเทิลเบลแกว่งถึงระดับอก"],
  ["kettlebell_goblet_squat", "Kettlebell Goblet Squat", "เคตเทิลเบลก็อบเล็ตสควอท", ["leg2", "leg"], "Kettlebell", 3, "10-12 ครั้ง", "ง่าย", "ถือเคตเทิลเบลแนบอก ย่อสะโพกลงโดยหลังตรง แล้วดันส้นเท้ากลับขึ้น"],
  ["kettlebell_russian_twist", "Kettlebell Russian Twist", "รัสเซียนทวิสต์เคตเทิลเบล", ["core"], "Kettlebell", 3, "20 ครั้ง", "กลาง", "นั่งเอนตัวเล็กน้อย ยกเท้าลอย ถือเคตเทิลเบลหน้าอก บิดลำตัวสลับซ้าย-ขวาอย่างควบคุม"],
  // ม้านั่ง
  ["bench_dip", "Bench Dip", "ดิปบนม้านั่ง", ["arm", "chest"], "ม้านั่ง", 3, "10-15 ครั้ง", "กลาง", "วางมือบนขอบม้านั่งด้านหลังลำตัว งอศอกลดตัวลงแล้วดันกลับขึ้น โดยศอกชี้ไปด้านหลัง"],
  ["bench_step_up", "Bench Step Up", "สเต็ปอัพบนม้านั่ง", ["leg", "leg2"], "ม้านั่ง", 3, "10 ครั้ง/ข้าง", "ง่าย", "ก้าวเท้าหนึ่งขึ้นบนม้านั่ง ดันตัวขึ้นจนยืนตรง แล้วก้าวลงช้า ๆ สลับข้าง"],
  ["bench_incline_pushup", "Incline Push Up", "วิดพื้นมือเหนือม้านั่ง", ["chest", "arm"], "ม้านั่ง", 3, "10-15 ครั้ง", "ง่าย", "วางมือบนม้านั่ง ลำตัวตรงเป็นเส้นเดียว งอศอกลดอกลงใกล้ขอบม้านั่ง แล้วดันกลับขึ้น"],
];

const EXISTING_ROWS = [
  ["squat", "Squat", "สควอท", ["leg", "leg2"], NONE, 3, "10-15 ครั้ง", "ง่าย", "ยืนกว้างเท่าไหล่ ย่อสะโพกลงเหมือนนั่งเก้าอี้ โดยหลังตรงและเข่าไม่เลยปลายเท้ามากนัก แล้วดันส้นเท้ากลับขึ้น", "บริหารกล้ามเนื้อต้นขา สะโพก และแกนกลางลำตัว"],
  ["jumping_jack", "Jumping Jack", "กระโดดตบ", ["leg2", "calf"], NONE, 3, "30 วินาที", "ง่าย", "ยืนเท้าชิด กระโดดแยกเท้าพร้อมยกแขนเหนือศีรษะ แล้วกระโดดกลับท่าเดิมอย่างต่อเนื่อง", "เพิ่มอัตราการเต้นของหัวใจและช่วยเผาผลาญพลังงาน"],
  ["high_knees", "High Knees", "ยกเข่าสูง", ["leg2", "leg"], NONE, 3, "30 วินาที", "ง่าย", "วิ่งอยู่กับที่พร้อมยกเข่าสลับให้สูงถึงระดับสะโพก แกว่งแขนสลับ และลงพื้นเบา ๆ ด้วยปลายเท้า", "วิ่งอยู่กับที่พร้อมยกเข่าสูง เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อต้นขา"],
  ["punches", "Punches", "ชกหมัด", ["arm", "shoulder"], NONE, 3, "30 วินาที", "ง่าย", "ยืนแยกเท้าเล็กน้อย ชกหมัดสลับซ้าย-ขวาไปข้างหน้าอย่างต่อเนื่อง เกร็งหน้าท้อง และหมุนลำตัวเล็กน้อยตามหมัด", "ชกหมัดสลับซ้าย-ขวา เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อแขน ไหล่ และแกนกลางลำตัว"],
];

// ดึงตัวเลขแนะนำจากข้อความ เช่น "10-15 ครั้ง" → { min: 10, max: 15, unit: "ครั้ง" }
const parseRecommended = (text = "") => {
  const m = String(text).match(/(\d+)(?:\s*-\s*(\d+))?\s*(ครั้ง|วินาที)/);
  if (!m) return { min: 10, max: 10, unit: "ครั้ง" };
  const min = Number(m[1]);
  return { min, max: m[2] ? Number(m[2]) : min, unit: m[3] };
};

const buildExercise = ([id, name, thaiName, parts, equipment, sets, reps, level, howTo, description]) => {
  const names = parts.map((p) => PART_LABEL[p]).join(" และ ");
  const bodyweight = equipment === NONE;
  const rec = parseRecommended(reps);
  return {
    id, name, thaiName, parts, level, howTo, reps,
    sets: Number(sets) || 3,
    equipment: bodyweight ? "ไม่ใช้อุปกรณ์" : equipment,
    bodyweight,
    muscles: parts.map((p) => PART_LABEL[p]),
    video: EXERCISE_VIDEOS[id] || null,
    description: description || (bodyweight
      ? `บริหารกล้ามเนื้อ${names} ด้วยน้ำหนักตัว`
      : `บริหารกล้ามเนื้อ${names} โดยใช้ ${equipment}`),
    recommended: rec,
    // ค่าเริ่มต้นของเป้าหมาย: ท่านับครั้งใช้ค่าต่ำสุดที่แนะนำ, ท่านับเวลาเริ่มที่ 10
    defaultTarget: rec.unit === "ครั้ง" ? Math.max(1, Math.min(100, rec.min)) : 10,
  };
};

const EXERCISE_CATALOG = Object.fromEntries(
  [...EXISTING_ROWS, ...BODYWEIGHT_ROWS, ...EQUIPMENT_ROWS].map((row) => {
    const ex = buildExercise(row);
    return [ex.id, ex];
  })
);

const LEVEL_CLASS = { "ง่าย": "easy", "กลาง": "mid", "ยาก": "hard" };
const TARGET_PRESETS = [5, 10, 15, 20, 30, 50];
const clampTarget = (n) => Math.max(1, Math.min(100, Math.round(Number(n) || 1)));

// ไอคอนแบบเส้น (SVG) ใช้แทนอิโมจิ ให้ดูเรียบและสมจริงเหมือนกันทุกอุปกรณ์
const ICON_PATHS = {
  clipboard: (<><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>),
  camera: (<><path d="M4 8a2 2 0 0 1 2-2h1.5l1.2-1.6a1 1 0 0 1 .8-.4h5a1 1 0 0 1 .8.4L16.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="12.5" r="3.5" /></>),
  space: (<><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /><circle cx="12" cy="9.5" r="1.7" /><path d="M9 16.5V15a3 3 0 0 1 6 0v1.5" /></>),
  dumbbell: (<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />),
  scan: (<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="9.5" r="2.2" /><path d="M8.2 16.5a3.8 3.8 0 0 1 7.6 0" /></>),
  pulse: (<path d="M3 12h4l3-7 4 14 3-7h4" />),
  bulb: (<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>),
  sliders: (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  body: (<><circle cx="12" cy="4.5" r="2" /><path d="M12 7.5v6.5M7.5 10l4.5-2.5 4.5 2.5M9 21l3-7 3 7" /></>),
  swap: (<path d="M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3-3m-3 3 3 3" />),
};

function Icon({ name, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  );
}

// ภาพตัวอย่างท่า: ใช้วิดีโอถ้ามี ไม่งั้น (หรือโหลดไม่ได้) แสดงไอคอนแทน
function ExerciseOrb({ info }) {
  const [failed, setFailed] = useState(false);
  const showVideo = Boolean(info.video) && !failed;
  return (
    <div className={`es-orb${showVideo ? " has-video" : ""}`}>
      {showVideo ? (
        <video src={info.video} autoPlay muted loop playsInline preload="metadata" onError={() => setFailed(true)} />
      ) : (
        <Icon name={info.bodyweight ? "body" : "dumbbell"} size={64} />
      )}
    </div>
  );
}

export default function ExerciseSetting() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const requestedExercise = searchParams.get("exercise") || "squat";
  const exerciseInfo = EXERCISE_CATALOG[requestedExercise] || EXERCISE_CATALOG.squat;
  const exerciseType = exerciseInfo.id;
  const [targetCount, setTargetCount] = useState(exerciseInfo.defaultTarget);

  // เปลี่ยนท่า (เช่นกดย้อนกลับแล้วเลือกท่าใหม่) → ตั้งเป้าหมายเริ่มต้นตามท่านั้น
  useEffect(() => {
    setTargetCount(exerciseInfo.defaultTarget);
  }, [exerciseType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ชื่อผู้ใช้ (ดึงจาก Firestore เหมือนหน้า Dashboard) ----------
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());

  const [weight, setWeight] = useState(() => readHealthCache()?.weight ?? "");
  const [goalWeight, setGoalWeight] = useState("");
  const [tdeeResult] = useState(() => {
    const v = Number(readHealthCache()?.tdee);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  // ยอดเผาผลาญจากโหมดเกม (calorieSync) และเซสชันออกกำลังกายที่บันทึกไว้
  const [energy, setEnergy] = useState(() => readEnergy());
  const [workoutLog, setWorkoutLog] = useState(readWorkoutLog);
  useEffect(() => subscribeEnergy(setEnergy), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { clearCachedName(); return; }
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        const name = data.name || currentUser.displayName || currentUser.email?.split("@")[0] || "";
        setCachedName(name);
        setDisplayName(name);
        setUserInitial(name.charAt(0).toUpperCase());
        if (data.weight) setWeight(data.weight);
        if (data.goalWeight || data.targetWeight) setGoalWeight(String(data.goalWeight || data.targetWeight));
      } catch (err) {
        console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:", err);
      }

      try {
        const snapshot = await getDocs(query(
          collection(db, "workouts"),
          where("userId", "==", currentUser.uid),
          orderBy("completedAt", "desc"),
          limit(200)
        ));
        setWorkoutLog(toWorkoutLog(snapshot.docs.map((item) => item.data())));
      } catch (err) {
        console.error("โหลดข้อมูลการออกกำลังกายไม่สำเร็จ:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------- วันที่/เวลาจริง ----------
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric",
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(currentDateTime);

  // ---------- ธีมมืด/สว่าง (key เดียวกับ Dashboard จึงจำค่าร่วมกัน) ----------
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("fittrack-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("fittrack-theme", theme);
    } catch {
      /* ไม่เป็นไรถ้าเบราว์เซอร์บล็อก storage */
    }
  }, [theme]);

  // คืนค่าธีมตอนออกจากหน้า เพื่อไม่ให้กระทบหน้าอื่น
  useLayoutEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  // สลับธีมจากแท็บ/หน้าอื่น → ตามทันที
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "fittrack-theme") setTheme(e.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ใช้ค่า Animation จากหน้าตั้งค่า เหมือนหน้า Dashboard
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      const saved = JSON.parse(localStorage.getItem("fittrack_user_settings") || "{}");
      root.setAttribute("data-anim", saved?.display?.animation === false ? "off" : "on");
    } catch {
      root.setAttribute("data-anim", "on");
    }
    return () => root.removeAttribute("data-anim");
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  };

  // ---------- การแจ้งเตือน ----------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyCalories, setDailyCalories] = useState(getSavedDailyCalories);

  const safeTarget = Number(targetCount) || 0;
  const todayKey = getLocalDateKey(currentDateTime);
  const dailyTarget = Number(tdeeResult || 0);
  const noTarget = dailyTarget <= 0;
  const gameBurned = energy.burned;
  const workoutBurned = workoutLog.reduce(
    (sum, w) => (getLocalDateKey(new Date(w.t)) === todayKey ? sum + w.kcal : sum), 0
  );
  const burnedKcal = gameBurned + workoutBurned;
  const netCalories = Math.max(0, Math.round(dailyCalories - burnedKcal));
  const remainingCalories = noTarget ? 0 : dailyTarget - netCalories;
  const overCalories = noTarget ? 0 : Math.max(0, -remainingCalories);

  const calorieNotice = dailyCalories === 0
    ? "วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้"
    : noTarget
      ? `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyCalories.toLocaleString()} kcal (ยังไม่ได้คำนวณเป้าหมายพลังงาน)`
      : overCalories > 0
      ? `วันนี้ได้รับพลังงานเกินเป้าหมาย ${overCalories.toLocaleString()} kcal`
      : `วันนี้ยังได้รับพลังงานต่ำกว่าเป้าหมาย ${Math.max(0, remainingCalories).toLocaleString()} kcal`;
  const gameLabels = { fruit: "ชกผลไม้", time: "ชกจับเวลา" };
  const burnDetail = Object.entries(energy.games)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${gameLabels[k] || k} ${v.toLocaleString()} kcal`)
    .join(" · ");
  const burnNotice = burnedKcal > 0
    ? `วันนี้เผาผลาญไปแล้ว ${fmtBurn(burnedKcal)} kcal (ออกกำลังกาย ${fmtBurn(workoutBurned)} · เล่นเกม ${fmtBurn(gameBurned)}) หักออกจากพลังงานที่ได้รับ`
    : "วันนี้ยังไม่มีการเผาผลาญจากการออกกำลังกายหรือโหมดเกม";
  const goalNotice = goalWeight && Number(weight) > 0
    ? `น้ำหนักปัจจุบัน ${Number(weight).toLocaleString()} กก. · เป้าหมาย ${Number(goalWeight).toLocaleString()} กก.`
    : "เพิ่มน้ำหนักปัจจุบันและน้ำหนักเป้าหมายในโปรไฟล์ เพื่อดูความคืบหน้าสู่เป้าหมาย";

  const handleNotifications = async () => {
    setDailyCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === "default") permission = await window.Notification.requestPermission();
        if (permission === "granted") {
          new window.Notification("FitTrack · สรุปสุขภาพวันนี้", {
            body: `${calorieNotice}. ${burnNotice}. ${goalNotice}`,
            tag: `fittrack-daily-${todayKey}`,
          });
        }
      } catch (error) {
        console.warn("ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:", error);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      clearCachedName();
      clearHealthCache();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleStartSession = () => {
    const count = Math.max(1, Math.min(100, Number(targetCount) || 1));
    navigate(`/exercise?exercise=${exerciseType}&target=${count}`);
  };

  return (
    <div className="fittrack-app">
      {/* ---------- SIDEBAR ---------- */}
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" onClick={() => navigate("/dashboard")}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link active" onClick={() => navigate("/exercises")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/gamemode")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 15h18a9 9 0 0 1 8.7 6.7l2.2 8.6a5.2 5.2 0 0 1-8.9 4.8L31 31H17l-4 4.1a5.2 5.2 0 0 1-8.9-4.8l2.2-8.6A9 9 0 0 1 15 15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M16 21v8M12 25h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="22.5" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg></span>โหมดเกม</button>
          <button className="side-link" onClick={() => navigate("/history")}><span className="side-icon">◷</span>ประวัติ</button>
          <button className="side-link" onClick={() => navigate("/profile")}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" type="button" title="ออกจากระบบ" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      {/* ---------- MAIN ---------- */}
      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{userInitial}</div>
              <span className="online-dot"></span>
            </div>
            <div>
              <div className="hello">สวัสดีครับ/ค่ะ</div>
              <strong>{displayName || "\u00A0"}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="ai-note">ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ <span>〽</span></div>
            <div className="notification-wrap">
              <button className="icon-button notification-bell" type="button" title="การแจ้งเตือน" aria-label="เปิดการแจ้งเตือน" aria-expanded={notificationsOpen} onClick={handleNotifications}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><i></i></button>
              {notificationsOpen && <div className="notification-panel" role="status">
                <div className="notification-panel-title"><span>การแจ้งเตือน <small>วันนี้</small></span><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotificationsOpen(false)}>×</button></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{calorieNotice}</span><small>ได้รับสุทธิ {netCalories.toLocaleString()} / {dailyTarget.toLocaleString()} kcal</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· โหมดเกม</small></strong><span>{burnNotice}</span><small>{burnDetail || "เล่นเกมชกผลไม้เพื่อเผาผลาญแคลอรี่"}</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{goalNotice}</span><small>ติดตามความคืบหน้าของคุณได้ที่หน้าโปรไฟล์</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun"
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {theme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </header>

        <div className="es-grid">
          {/* ---------- การ์ดตั้งค่า ---------- */}
          <section className="es-card">
            <div className="es-heading">
              <div className="es-icon" aria-hidden="true"><Icon name="sliders" size={20} /></div>
              <div>
                <h2>ตั้งค่าการออกกำลังกาย</h2>
                <span>เตรียมความพร้อมก่อนเริ่มเซสชัน</span>
              </div>
            </div>

            <div className="es-scroll">
            <div className="es-setting-body">
              <div className="es-visual">
                <ExerciseOrb key={exerciseType} info={exerciseInfo} />
                <span className="es-label">SELECTED EXERCISE</span>
                <h3>
                  {exerciseInfo.name}
                  <small>({exerciseInfo.thaiName})</small>
                </h3>
                <p>{exerciseInfo.description}</p>

                <div className="es-badges">
                  <span className={`es-level ${LEVEL_CLASS[exerciseInfo.level] || "mid"}`}>ระดับ{exerciseInfo.level}</span>
                  <span className="es-badge"><Icon name={exerciseInfo.bodyweight ? "body" : "dumbbell"} size={14} />{exerciseInfo.equipment}</span>
                  <span className="es-badge">{exerciseInfo.sets} เซ็ต</span>
                </div>
                <div className="es-muscles">
                  {exerciseInfo.muscles.map((m) => <span key={m}>{m}</span>)}
                </div>
                <button type="button" className="es-change" onClick={() => navigate("/exercises")}><Icon name="swap" size={14} />เปลี่ยนท่า</button>
              </div>

              <div className="es-divider" />

              <div className="es-target">
                <div className="es-target-heading">
                  <div>
                    <span className="es-target-label">TARGET</span>
                    <h3>เป้าหมายจำนวนครั้ง</h3>
                  </div>
                  <span className="es-reps">REPS</span>
                </div>

                <div className="es-input-wrap">
                  <button
                    type="button"
                    className="es-count-btn"
                    onClick={() => setTargetCount((value) => Math.max(1, Number(value || 1) - 1))}
                    aria-label="ลดจำนวนครั้ง"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    value={targetCount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        setTargetCount("");
                        return;
                      }
                      setTargetCount(Math.max(1, Math.min(100, Number(value))));
                    }}
                    min="1"
                    max="100"
                    aria-label="เป้าหมายจำนวนครั้ง"
                  />

                  <button
                    type="button"
                    className="es-count-btn"
                    onClick={() => setTargetCount((value) => Math.min(100, Number(value || 0) + 1))}
                    aria-label="เพิ่มจำนวนครั้ง"
                  >
                    +
                  </button>
                </div>

                <input
                  type="range"
                  className="es-range"
                  min="1"
                  max="100"
                  value={clampTarget(safeTarget)}
                  onChange={(e) => setTargetCount(clampTarget(e.target.value))}
                  style={{ "--fill": `${((clampTarget(safeTarget) - 1) / 99) * 100}%` }}
                  aria-label="ปรับเป้าหมายจำนวนครั้ง"
                />

                <div className="es-helper">
                  <span>กำหนดได้ตั้งแต่ 1–100 ครั้ง</span>
                  <strong>{safeTarget} ครั้ง</strong>
                </div>

                <div className="es-presets" role="group" aria-label="ค่าที่ใช้บ่อย">
                  {TARGET_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`es-preset${safeTarget === n ? " active" : ""}`}
                      onClick={() => setTargetCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <div className="es-recommend">
                  <span className="es-recommend-icon"><Icon name="bulb" size={18} /></span>
                  <p>
                    ท่านี้แนะนำ <b>{exerciseInfo.reps}</b> × {exerciseInfo.sets} เซ็ต
                    <button type="button" onClick={() => setTargetCount(exerciseInfo.defaultTarget)}>ใช้ค่าแนะนำ ({exerciseInfo.defaultTarget})</button>
                  </p>
                </div>
              </div>
            </div>
            </div>

            <div className="es-actions">
              <button type="button" className="es-secondary" onClick={() => navigate("/exercises")}>
                <span>‹</span>
                ย้อนกลับ
              </button>
              <button type="button" className="es-primary" onClick={handleStartSession}>
                <span>▶</span>
                เริ่มออกกำลังกาย
              </button>
            </div>
          </section>

          {/* ---------- คำแนะนำ ---------- */}
          <section className="es-card es-card-side">
            <div className="es-heading">
              <div className="es-icon" aria-hidden="true"><Icon name="clipboard" size={20} /></div>
              <div>
                <h2>ก่อนเริ่มออกกำลังกาย</h2>
                <span>คำแนะนำเพื่อให้การออกกำลังกายราบรื่น</span>
              </div>
            </div>

            <div className="es-tips">
              <article className="es-tip es-tip-howto">
                <span className="es-tip-icon"><Icon name="clipboard" size={20} /></span>
                <div className="es-tip-text">
                  <h4>วิธีทำท่า{exerciseInfo.thaiName}</h4>
                  <p>{exerciseInfo.howTo}</p>
                </div>
              </article>

              <article className="es-tip">
                <span className="es-tip-icon"><Icon name="pulse" size={20} /></span>
                <div className="es-tip-text">
                  <h4>อบอุ่นร่างกายก่อนเริ่ม</h4>
                  <p>ขยับข้อต่อและยืดกล้ามเนื้อเบา ๆ ประมาณ 2–3 นาที เพื่อลดความเสี่ยงต่อการบาดเจ็บ</p>
                </div>
              </article>

              <article className="es-tip">
                <span className="es-tip-icon"><Icon name={exerciseInfo.bodyweight ? "space" : "dumbbell"} size={20} /></span>
                <div className="es-tip-text">
                  <h4>{exerciseInfo.bodyweight ? "เตรียมพื้นที่ให้โล่ง" : `เตรียม${exerciseInfo.equipment}ให้พร้อม`}</h4>
                  <p>{exerciseInfo.bodyweight
                    ? "เลือกพื้นที่ที่กว้างพอให้ขยับตัวได้สะดวก ไม่มีสิ่งของกีดขวาง และพื้นไม่ลื่น"
                    : "ตรวจดูให้อุปกรณ์แน่นหนา และเว้นพื้นที่รอบตัวให้โล่งก่อนเริ่มทุกครั้ง"}</p>
                </div>
              </article>

              <article className="es-tip">
                <span className="es-tip-icon"><Icon name="camera" size={20} /></span>
                <div className="es-tip-text">
                  <h4>วางตำแหน่งให้กล้องเห็นทั้งตัว</h4>
                  <p>ตั้งกล้องให้เห็นร่างกายตั้งแต่ศีรษะถึงปลายเท้า และยืนห่างจากกล้องพอประมาณ</p>
                </div>
              </article>

              <article className="es-tip">
                <span className="es-tip-icon"><Icon name="scan" size={20} /></span>
                <div className="es-tip-text">
                  <h4>ระบบนับจำนวนครั้งให้อัตโนมัติ</h4>
                  <p>AI จะตรวจจับท่าทางผ่านกล้องและนับให้ขณะที่คุณออกกำลังกาย ไม่ต้องนับเอง</p>
                </div>
              </article>
            </div>
          </section>
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

      <style>{`
@import url("https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap");
.fittrack-app h1, .fittrack-app h2, .fittrack-app h3{color:var(--text)}
.fittrack-app img{color:var(--muted)}
:root{--bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735}
*{box-sizing:border-box}
html, body, #root{margin:0;min-height:100%;background:var(--bg)}
body{font-family:"Anuphan",sans-serif;color:var(--text);overflow-x:hidden}
button, input{font:inherit}
.fittrack-app{min-height:100vh;background:radial-gradient(circle at 75% 8%,rgba(50,255,100,.06),transparent 22%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.045),transparent 22%),#020609}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column}
.sidebar:after{display:none}
.sidebar-logo-wrap{text-align:center;padding:4px 4px 25px}
.sidebar-logo{display:block;width:190px;height:112px;object-fit:contain;margin:0 auto}
.logo-caption{font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px}
.side-menu{display:flex;flex-direction:column;gap:9px}
.side-link{height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s}
.side-link:hover{border-color:#35534a;background:rgba(103,255,41,.05)}
.side-link.active{color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05)}
.side-icon{width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef}
.side-link.active .side-icon{color:var(--green)}
.sidebar-quote{margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:"Kanit";font-size:15px;line-height:1.55;font-style:italic}
.pulse-line{margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39}
.pulse-line:before{content:"";position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33}
.pulse-line i:first-child{position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg)}
.pulse-line b{position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg)}
.pulse-line i:last-child{position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff}
.logout-link{height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px}
.logout-link span{font-size:24px;margin-right:12px;color:#dce6e6}
.main-area{margin-left:220px;min-height:100vh;padding:0 10px 40px;width:calc(100% - 220px)}
.topbar{height:100px;border-bottom:1px solid #18343b;display:flex;align-items:center;justify-content:space-between;padding:0 5px 0 18px}
.user-block{display:flex;align-items:center;gap:12px}
.avatar-wrap{position:relative;width:58px;height:58px}
.avatar-fallback{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-weight:700;font-size:20px;box-shadow:0 0 0 3px rgba(255,255,255,.03)}
.online-dot{position:absolute;right:0;bottom:0;width:17px;height:17px;border-radius:50%;background:#6eff35;border:2px solid #06100c}
.hello{font-size:13px;color:#ddd;line-height:1.1}
.user-block strong{font-family:"Kanit";font-size:22px;line-height:1.15}
.topbar-right{display:flex;align-items:center;gap:15px}
.ai-note{text-align:right;font-size:12px;line-height:1.35;color:#e4e4e4;font-style:italic}
.ai-note em{color:var(--green);font-style:normal;font-weight:700}
.ai-note span{color:#a24aff;font-size:20px}
.icon-button{position:relative;width:42px;height:42px;background:transparent;border:0;color:#f2f2f2;font-size:25px;cursor:pointer}
.icon-button i{position:absolute;right:6px;top:6px;width:7px;height:7px;background:#ff4667;border-radius:50%}
.icon-button.sun{font-size:28px}
.date-box{border-right:1px solid #30434a;padding:3px 15px;color:#ddd;font-size:11px;line-height:1.4}
.date-box small{font-size:10px}
@media(max-width:1100px){
.sidebar{width:190px}
.main-area{margin-left:190px;width:calc(100% - 190px)}
}
@media(max-width:760px){
.sidebar{position:relative;width:100%;height:auto;min-height:auto;padding:10px}
.sidebar:after{display:none}
.sidebar-logo{width:155px;height:88px}
.side-menu{display:grid;grid-template-columns:repeat(5,1fr)}
.side-link{height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px}
.side-icon{font-size:18px}
.sidebar-quote, .logout-link{display:none}
.main-area{margin-left:0;width:100%;padding:0 10px 25px}
.topbar{height:auto;padding:13px 2px;gap:10px}
.topbar-right{gap:5px}
.ai-note, .date-box{display:none}
}
.sidebar{border-right:1px solid #18343b !important;}
.main-area{border-right:0 !important;
  outline-right:0 !important;}
.main-area{width:calc(100% - 220px) !important;
  padding-right:0 !important;}
html, body{width:100% !important;
  max-width:none !important;
  margin:0 !important;}
#root{width:100% !important;
  max-width:none !important;
  margin:0 !important;
  padding:0 !important;
  border:0 !important;
  border-inline:0 !important;
  box-shadow:none !important;}
.fittrack-app{width:100%;}
html.theme-anim *{transition:background-color .3s ease,border-color .3s ease,color .3s ease !important;}
html[data-theme="light"]{color-scheme:light;
  --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;
  --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a;}
html[data-theme="light"] .fittrack-app{background:radial-gradient(circle at 75% 8%,rgba(60,200,100,.14),transparent 24%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.08),transparent 24%),#edf3f1;}
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important}
html[data-theme="light"] .sidebar-logo{filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply}
html[data-theme="light"] .side-link{color:#2a3a36}
html[data-theme="light"] .side-link:hover{border-color:#9bc59a;background:rgba(60,170,40,.08)}
html[data-theme="light"] .side-link.active{color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16)}
html[data-theme="light"] .side-icon{color:#33433f}
html[data-theme="light"] .side-link.active .side-icon{color:#2a9d16}
html[data-theme="light"] .sidebar-quote{color:#2a3a36}
html[data-theme="light"] .pulse-line{border-bottom-color:#4fb82b}
html[data-theme="light"] .logout-link{color:#33433f;border-top-color:#d5e1dd}
html[data-theme="light"] .logout-link span{color:#33433f}
html[data-theme="light"] .topbar{border-bottom-color:#d3dfdb}
html[data-theme="light"] .online-dot{border-color:#edf3f1}
html[data-theme="light"] .hello{color:#4a5b57}
html[data-theme="light"] .ai-note{color:#3a4a46}
html[data-theme="light"] .icon-button{color:#1f2d29}
html[data-theme="light"] .date-box{color:#3a4a46;border-right-color:#c9d7d3}
@keyframes fittrack-logo-glow {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);
  }
}
.sidebar-logo{animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;
  will-change: filter;}
@media (prefers-reduced-motion: reduce) {
.sidebar-logo{animation-duration: 8s !important;}
}
.notification-wrap{position: relative;}
.notification-wrap .icon-button{display: grid; place-items: center;}
.notification-panel{position: absolute; z-index: 100; top: calc(100% + 12px); right: -62px;
  width: min(320px, calc(100vw - 28px)); padding: 14px;
  border: 1px solid #2d535d; border-radius: 13px;
  background: #071116; color: #f4f7f6; box-shadow: 0 14px 40px rgba(0,0,0,.55);}
.notification-panel-title{display:flex; align-items:center; justify-content:space-between; gap:12px; font: 600 15px "Kanit",sans-serif; margin-bottom: 9px;}
.notification-panel-title button{border:0; background:transparent; color:#b9c5c7; font-size:22px; cursor:pointer;}
.notification-item{display:flex; flex-direction:column; gap:4px; padding:10px 0; border-top:1px solid #203941;}
.notification-item strong{color:#a8f34a; font-size:12px;}
.notification-item span{font-size:11px; line-height:1.5;}
.notification-item small, .notification-hint{color:#93a1a5; font-size:9px; line-height:1.5;}
.notification-hint{display:block; padding-top:8px; border-top:1px solid #203941;}
html[data-theme="light"] .notification-panel{background:#fff; color:#1d302b; border-color:#c8d8d2; box-shadow:0 14px 40px rgba(20,45,35,.18);}
html[data-theme="light"] .notification-item{border-color:#e0e9e5;}
html[data-theme="light"] .notification-hint{border-color:#e0e9e5;}
@media(max-width:760px) {
.notification-panel{right:-42px; top:calc(100% + 8px);}
}
html[data-theme="light"] body, html[data-theme="light"] #root{background:#edf4f1; color:#172923;}
html[data-theme="light"] .fittrack-app{background:radial-gradient(circle at 74% 7%,rgba(111,210,80,.13),transparent 25%),
             radial-gradient(circle at 92% 62%,rgba(170,91,225,.09),transparent 24%),#edf4f1;
  color:#172923;}
html[data-theme="light"] .main-area{color:#172923;}
html[data-theme="light"] .topbar{background:rgba(249,252,250,.76); border-bottom-color:#c8d8d1;}
html[data-theme="light"] .hello, html[data-theme="light"] .ai-note, html[data-theme="light"] .date-box{color:#40554d;}
html[data-theme="light"] .user-block strong{color:#172923;}
html[data-theme="light"] .icon-button{color:#263c33;}
html[data-theme="light"] .icon-button:hover{color:#278b20; background:#e3f3df; border-radius:10px;}
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,#fbfefc 0%,#edf5f1 100%); border-right-color:#c8d8d1 !important;}
html[data-theme="light"] .logo-caption{color:#53675f;}
html[data-theme="light"] .side-link{color:#31473e;}
html[data-theme="light"] .side-link:hover{background:#e8f4e5; border-color:#b7d7ae;}
html[data-theme="light"] .side-link.active{color:#17351b; background:linear-gradient(100deg,#dff5d7,#f1faed); border-color:#65b947; box-shadow:0 5px 15px rgba(66,145,48,.12),inset 0 0 0 1px rgba(255,255,255,.65);}
html[data-theme="light"] .side-icon{color:#40584e;}
html[data-theme="light"] .side-link.active .side-icon{color:#258d20;}
html[data-theme="light"] .sidebar-quote{color:#40564c;}
html[data-theme="light"] .logout-link{color:#40564c; border-top-color:#cfddd7;}
html[data-theme="light"] .logout-link span{color:#40564c;}
html[data-theme="light"] .notification-panel{background:#fff; color:#20372d; border-color:#c8d9d1; box-shadow:0 14px 38px rgba(29,67,49,.17);}
html[data-theme="light"] .notification-panel-title button{color:#52685e;}
html[data-theme="light"] .notification-item{border-color:#dce7e1;}
html[data-theme="light"] .notification-item strong{color:#287f1b;}
html[data-theme="light"] .notification-item span{color:#2e4439;}
html[data-theme="light"] .notification-item small, html[data-theme="light"] .notification-hint{color:#657970;}
html[data-theme="light"] .notification-hint{border-color:#dce7e1;}
html[data-theme="light"] .fittrack-app{background: radial-gradient(ellipse at 78% 0%, #e8f6ee 0%, #f4f8f5 38%, #f2f6f4 100%);
  color: #182b24;}
html[data-theme="light"] .sidebar{background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;
  border-right: 1px solid #c5d9ce !important;
  box-shadow: 5px 0 22px rgba(26, 74, 49, .045);}
html[data-theme="light"] .topbar{background: rgba(255,255,255,.82);
  border-bottom: 1px solid #d2e2d9;}
html[data-theme="light"] .side-link.active{background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32;}
html[data-theme="light"] .icon-button{background:#f0f8f3; border:1px solid #c8ded1; color:#244b35;}
html[data-theme="light"] .icon-button:hover{background:#e3f4e9;}
.notification-wrap .notification-bell{border-radius: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 5px; transition: color .2s ease, transform .2s ease;}
.notification-wrap .notification-bell svg{width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;}
.notification-wrap .notification-bell:hover{transform: translateY(-2px) scale(1.06); background: transparent !important; box-shadow: none !important; color: var(--green);}
.notification-panel{width:min(360px,calc(100vw - 28px)); padding:0; overflow:hidden; border-radius:16px; animation: notif-pop .2s ease-out;}
.notification-panel-title{padding:15px 16px 12px; margin:0; border-bottom:1px solid rgba(130,160,150,.2);}
.notification-panel-title>span{display:flex; align-items:baseline; gap:8px;}
.notification-panel-title>span>small{font:400 10px "Anuphan",sans-serif; opacity:.65;}
.notification-panel-title button{width:27px;height:27px;border-radius:50%;line-height:1;}
.notification-panel-title button:hover{background:rgba(130,150,140,.15);}
.notification-item{position:relative; flex-direction:row; align-items:flex-start; gap:10px; padding:12px 15px; border-top:0; transition:background .18s ease;}
.notification-item:hover{background:rgba(120,160,140,.10);}
.notification-avatar{flex:0 0 38px; width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:17px;background:linear-gradient(145deg,#244d37,#142c22);box-shadow:0 2px 8px rgba(0,0,0,.14);}
.notification-avatar.goal-avatar{background:linear-gradient(145deg,#56317b,#322047);}
.notification-message{min-width:0; flex:1; display:flex; flex-direction:column; gap:3px;}
.notification-message strong{color:inherit; font-size:11px;}
.notification-message strong small{font-size:9px;font-weight:400;color:#94a39d;}
.notification-message span{font-size:11px;line-height:1.5;}
.notification-message>small{font-size:9px;line-height:1.4;color:#9aa9a3;}
.notification-unread{flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#4eaeef;margin:7px 1px 0 0;box-shadow:0 0 0 3px rgba(78,174,239,.12);}
.notification-hint{display:block;padding:10px 15px 12px;border-top:1px solid rgba(130,160,150,.2);}
@keyframes notif-pop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
html[data-theme="light"] .notification-panel{background:#fff; color:#24372e; border-color:#c9ddd2;}
html[data-theme="light"] .notification-panel-title{border-color:#e2ebe5;}
html[data-theme="light"] .notification-item:hover{background:#f3f9f5;}
html[data-theme="light"] .notification-avatar{background:linear-gradient(145deg,#dff4e5,#c5e9d1);}
html[data-theme="light"] .notification-avatar.goal-avatar{background:linear-gradient(145deg,#f0e1ff,#dfc7f7);}
html[data-theme="light"] .notification-message strong{color:#263d32;}
html[data-theme="light"] .notification-message strong small, html[data-theme="light"] .notification-message>small{color:#6e8276;}
html[data-theme="light"] .notification-hint{border-color:#e2ebe5;}
@media (prefers-reduced-motion: reduce) {
.notification-panel{animation:none!important;transition:none!important;}
}
.notification-wrap .notification-bell{appearance:none; -webkit-appearance:none; background:transparent!important; border:0!important; outline-offset:3px; box-shadow:none!important; border-radius:0!important;}
.notification-wrap .notification-bell:hover, .notification-wrap .notification-bell:focus-visible{background:transparent!important; box-shadow:none!important; color:var(--green);}
html[data-theme="light"] .notification-wrap .notification-bell{background:transparent!important; border:0!important; box-shadow:none!important; color:#244b35;}
html[data-theme="light"] .notification-wrap .notification-bell:hover{background:transparent!important; color:#278b20;}
.notification-wrap .notification-panel{position: fixed; z-index: 9999; top: 88px; right: 24px;
  width: min(370px, calc(100vw - 28px)); max-height: calc(100vh - 110px);
  overflow: visible; padding: 0; border: 0; border-radius: 0;
  background: transparent; color: inherit; box-shadow: none;
  display: flex; flex-direction: column; gap: 10px;
  animation: none;}
.notification-panel-title{order: -1; display:flex; align-items:center; justify-content:space-between;
  margin:0 0 2px; padding:0 2px 4px; border:0; font-size:12px;
  color:var(--muted,#82918b); text-shadow:0 1px 5px rgba(0,0,0,.12);}
.notification-panel-title>span{display:flex; align-items:baseline; gap:7px;}
.notification-panel-title>span>small{font-size:10px;}
.notification-panel-title button{color:inherit; width:24px; height:24px; font-size:20px;}
.notification-panel .notification-item{box-sizing:border-box; width:100%; min-height:76px; padding:13px 14px;
  display:flex; flex-direction:row; align-items:flex-start; gap:11px;
  border:1px solid rgba(150,175,162,.24); border-radius:14px;
  background:rgba(13,27,24,.97); color:#f5faf6;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12);
  animation:toast-enter .42s cubic-bezier(.2,.8,.2,1) both;}
.notification-panel .notification-item:nth-of-type(3){animation-delay:.22s;}
.notification-panel .notification-item:hover{transform:translateX(-3px); background:rgba(20,39,32,.99);}
.notification-panel .notification-avatar{flex:0 0 38px; width:38px; height:38px;}
.notification-panel .notification-message{flex:1; min-width:0; gap:4px;}
.notification-panel .notification-message strong{font-size:12px; color:#f4faf5;}
.notification-panel .notification-message strong small{font-size:10px; color:#a7b8ad;}
.notification-panel .notification-message span{font-size:12px; line-height:1.5; color:#eef5f0;}
.notification-panel .notification-message>small{font-size:10px; line-height:1.45; color:#aab9b0;}
.notification-panel .notification-unread{margin-top:6px;}
.notification-panel .notification-hint{display:none;}
html[data-theme="light"] .notification-panel-title{color:#5c7065; text-shadow:none;}
html[data-theme="light"] .notification-panel .notification-item{background:rgba(255,255,255,.98); color:#24372e;
  border-color:#dce9e0; box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07);}
html[data-theme="light"] .notification-panel .notification-item:hover{background:#f9fffb;}
html[data-theme="light"] .notification-panel .notification-message strong{color:#263d32;}
html[data-theme="light"] .notification-panel .notification-message strong small, html[data-theme="light"] .notification-panel .notification-message>small{color:#718378;}
html[data-theme="light"] .notification-panel .notification-message span{color:#2e4438;}
@media(max-width:600px) {
.notification-wrap .notification-panel{top:76px; right:12px; width:min(360px,calc(100vw - 24px));}
}
@media(prefers-reduced-motion:reduce) {
.notification-panel .notification-item{animation:none!important; transition:none!important;}
}
.notification-panel .notification-item{text-align:left; justify-content:flex-start;}
.notification-panel .notification-message{text-align:left; align-items:flex-start;}
.notification-panel .notification-message strong, .notification-panel .notification-message span, .notification-panel .notification-message>small{display:block; width:100%; text-align:left;}
.notification-panel .notification-avatar.dumbbell-avatar{flex:0 0 36px; width:36px; height:36px; border-radius:10px;
  display:grid; place-items:center; background:transparent!important;
  box-shadow:none!important; color:#83dc78; margin-top:1px;}
.notification-panel .notification-avatar.dumbbell-avatar svg{display:block; width:25px; height:25px; fill:none; stroke:currentColor;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;}
html[data-theme="light"] .notification-panel .notification-avatar.dumbbell-avatar{color:#278b43;}
.notification-wrap .notification-panel{background:transparent!important; border:0!important; box-shadow:none!important;}
.notification-wrap .notification-panel .notification-item{background:rgba(13,27,24,.97)!important;
  border:1px solid rgba(150,175,162,.24)!important;
  border-radius:14px!important;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12)!important;
  color:#f5faf6;}
html[data-theme="light"] .notification-wrap .notification-panel .notification-item{background:rgba(255,255,255,.98)!important;
  border-color:#dce9e0!important;
  box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07)!important;
  color:#24372e;}
.notification-wrap .notification-panel .notification-message, .notification-wrap .notification-panel .notification-message strong, .notification-wrap .notification-panel .notification-message span, .notification-wrap .notification-panel .notification-message>small{background:transparent!important; box-shadow:none!important;}
.notification-wrap .notification-panel .notification-item:hover{transform:translateX(-3px);}
html[data-theme="light"] .notification-wrap .notification-panel .notification-item:hover{background:#f9fffb!important;}
@media (max-width: 760px) {
html, body, #root, .fittrack-app{width:100%; min-width:0; max-width:100%;}
body{overflow-x:hidden;}
.sidebar{width:100%; min-width:0; padding:8px 7px 9px;}
.sidebar-logo-wrap{padding:0 2px 8px;}
.sidebar-logo{width:132px; height:68px; max-width:42vw;}
.logo-caption{margin-top:-5px; font-size:6px; letter-spacing:1.5px;}
.side-menu{width:100%; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px;}
.side-link{width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere;}
.side-icon{width:auto; min-height:19px; font-size:19px; line-height:1;}
.main-area{margin:0!important; width:100%!important; min-width:0; padding:0 10px 22px!important;}
.topbar{width:100%; min-width:0; min-height:70px; height:auto; padding:10px 2px; gap:8px;}
.user-block{min-width:0; gap:8px;}
.avatar-wrap, .avatar-fallback{width:42px; height:42px;}
.avatar-fallback{font-size:16px;}
.online-dot{width:12px; height:12px;}
.hello{font-size:11px;}
.user-block strong{display:block; max-width:32vw; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.topbar-right{min-width:0; gap:4px;}
.icon-button{width:36px; height:38px; flex:0 0 36px; font-size:22px;}
.icon-button.sun{font-size:24px;}
.notification-wrap{position:relative;}
.notification-wrap .notification-panel{position:absolute; top:calc(100% + 8px); right:-4px; left:auto; width:min(340px,calc(100vw - 24px)); max-height:min(65vh,440px); overflow-y:auto; z-index:1000;}
}
@media (max-width: 390px) {
.main-area{padding-left:8px!important; padding-right:8px!important;}
.topbar{gap:4px;}
.user-block{gap:6px;}
.avatar-wrap, .avatar-fallback{width:38px; height:38px;}
.user-block strong{font-size:16px; max-width:29vw;}
.topbar-right{gap:1px;}
.icon-button{width:32px; flex-basis:32px;}
}
@media (max-width: 340px) {
.side-link{font-size:7.5px;}
}
@media (max-width: 760px) and (orientation: landscape) {
.sidebar-logo-wrap{display:none;}
.sidebar{padding:5px 7px;}
.side-link{height:44px; flex-direction:row; font-size:9px;}
}
.side-icon-dumbbell{display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px;}
.side-icon-dumbbell svg{display:block; width:25px; height:25px;}
@media (max-width:760px) {
.side-icon-dumbbell{flex:0 0 auto; min-height:19px;}
.side-icon-dumbbell svg{width:19px; height:19px;}
}

/* ===== ExerciseSetting: เนื้อหาหน้า (ใช้ตัวแปรสีเดียวกับ Dashboard) ===== */
.es-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.78fr);gap:18px;align-items:stretch;padding-top:22px}
.es-card{min-width:0;min-height:0;display:flex;flex-direction:column;padding:22px 22px 20px;border-radius:15px;border:1px solid #2a5360;background:linear-gradient(145deg,#050b0e,#071116);box-shadow:inset 0 0 25px rgba(0,0,0,.25)}
html[data-theme="light"] .es-card{background:linear-gradient(145deg,#ffffff,#f5f9f8);border-color:#cddbd7;box-shadow:none}
.es-heading{flex:0 0 auto;display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.es-icon{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:9px;font-size:18px;color:#91ff3e;border:1px solid #5ea02c;background:rgba(110,255,45,.07)}
html[data-theme="light"] .es-icon{color:#2a9d16}
.es-heading h2{margin:0;font-family:'Kanit',sans-serif;font-size:18px;font-weight:500}
.es-heading span{display:block;margin-top:2px;color:var(--muted);font-size:12px}

.es-scroll{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center}
.es-setting-body{display:grid;grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr);gap:26px;align-items:center}
.es-divider{align-self:stretch;background:var(--line)}
.es-visual{text-align:center}
.es-orb{width:112px;height:112px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:52px;background:radial-gradient(circle at 35% 25%,rgba(140,255,50,.22),rgba(5,11,14,.9) 70%);border:2px solid #5ea02c;box-shadow:0 0 26px rgba(125,255,45,.18)}
html[data-theme="light"] .es-orb{background:radial-gradient(circle at 35% 25%,rgba(60,200,100,.25),#ffffff 70%);box-shadow:0 0 18px rgba(60,200,100,.2)}
.es-label,.es-target-label{display:block;font-size:11px;letter-spacing:2px;color:var(--green);font-weight:600}
.es-visual h3{margin:6px 0 8px;font-family:'Kanit',sans-serif;font-size:26px;font-weight:600}
.es-visual h3 small{margin-left:8px;font-size:16px;font-weight:400;color:var(--muted)}
.es-visual p{margin:0 auto;max-width:340px;color:var(--muted);font-size:14px;line-height:1.55}

.es-target-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:16px;text-align:left}
.es-target-heading>div{min-width:0;text-align:left}
.es-target-heading h3{margin:2px 0 0;font-family:'Kanit',sans-serif;font-size:18px;font-weight:500;text-align:left}
.es-target-label{text-align:left}
.es-reps{flex:0 0 auto;padding:4px 12px;border-radius:999px;font-size:11px;letter-spacing:1.5px;font-weight:700;color:#df78ff;border:1px solid #9442ba;background:rgba(174,58,255,.1)}
.es-input-wrap{display:flex;align-items:center;justify-content:center;gap:12px}
.es-count-btn{width:52px;height:52px;border-radius:50%;border:1px solid #5ea02c;background:rgba(110,255,45,.07);color:var(--green);font-size:26px;line-height:1;cursor:pointer;transition:.2s}
.es-count-btn:hover{background:rgba(110,255,45,.16);box-shadow:0 0 14px rgba(125,255,45,.2)}
.es-input-wrap input{width:120px;height:64px;text-align:center;font-family:'Kanit',sans-serif;font-size:32px;font-weight:600;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:12px;outline:none;-moz-appearance:textfield}
.es-input-wrap input:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(125,255,45,.12)}
.es-input-wrap input::-webkit-outer-spin-button,.es-input-wrap input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.es-helper{display:flex;justify-content:space-between;gap:10px;margin-top:14px;color:var(--muted);font-size:13px}
.es-helper strong{color:var(--green);font-family:'Kanit',sans-serif;font-weight:500}

.es-actions{flex:0 0 auto;display:flex;justify-content:flex-end;gap:12px;margin-top:14px;padding-top:16px;border-top:1px solid var(--line)}
.es-secondary,.es-primary{height:44px;padding:0 22px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:.2s}
.es-secondary{background:transparent;color:var(--text);border:1px solid var(--line)}
.es-secondary:hover{border-color:#35534a;background:rgba(103,255,41,.05)}
.es-primary{border:0;color:#071005;font-weight:700;background:linear-gradient(90deg,#72ed2e,#baff3e);box-shadow:0 0 16px rgba(125,255,45,.15)}
.es-primary:hover{box-shadow:0 0 22px rgba(125,255,45,.3);transform:translateY(-1px)}

.es-tips{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:6px;margin-right:-6px;text-align:left}
.es-tip{flex:0 0 auto;display:flex;gap:14px;align-items:flex-start;text-align:left;padding:16px;border-radius:12px;border:1px solid var(--line);background:var(--panel2)}
.es-tip-icon{flex:0 0 40px;width:40px;height:40px;display:grid;place-items:center;border-radius:11px;color:#9bff4a;background:rgba(110,255,45,.07);border:1px solid #2f5d2a}
.es-tip-text{min-width:0;text-align:left}
.es-tip h4{margin:0;font-family:'Kanit',sans-serif;font-size:15px;font-weight:500;line-height:1.4;color:var(--text);text-align:left}
.es-tip p{margin:4px 0 0;color:var(--muted);font-size:13.5px;line-height:1.65;text-align:left}

@media (max-width:1100px){
  .es-grid{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:760px){
  .es-grid{padding-top:14px}
  .es-card-side{contain:none}
  .es-tips{max-height:460px}
  .es-card{padding:16px}
  .es-setting-body{grid-template-columns:minmax(0,1fr);gap:20px}
  .es-divider{width:100%;height:1px;align-self:auto}
  .es-actions{flex-direction:column-reverse}
  .es-secondary,.es-primary{width:100%}
}

      
/* โหมดสว่าง: แอนิเมชันเรืองแสงของโลโก้ต้องคงการกลับสี (invert) ไว้ ไม่งั้น filter ของ animation จะทับ
   จนตัวอักษรสีขาวของโลโก้หายไปบนพื้นขาว */
@keyframes fittrack-logo-glow-light {
  0%, 100% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 2px rgba(60,170,40,.10)); }
  50% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 5px rgba(60,170,40,.28)); }
}
html[data-theme="light"] .sidebar-logo {
  filter: invert(1) hue-rotate(180deg);
  mix-blend-mode: multiply;
  animation-name: fittrack-logo-glow-light !important;
}

/* ===== ExerciseSetting: ปรับโฉมให้สวยและรองรับทุกท่า ===== */
.es-card{position:relative;overflow:hidden}
.es-tips{scrollbar-width:thin;scrollbar-color:#2f5d2a transparent}
.es-tips::-webkit-scrollbar{width:6px}
.es-tips::-webkit-scrollbar-thumb{background:#2f5d2a;border-radius:6px}
/* กรอบคำแนะนำสูงเท่ากรอบตั้งค่า (ไม่ดันความสูงเอง) ถ้าเนื้อหาเกินให้เลื่อนในกรอบ */
.es-card-side{contain:size}
.es-card::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,transparent,#8cff32 30%,#18d8ff 70%,transparent);opacity:.55}
.es-orb{position:relative;width:148px;height:148px;overflow:hidden;box-shadow:0 0 0 6px rgba(125,255,45,.06),0 0 34px rgba(125,255,45,.22);animation:es-glow 3.2s ease-in-out infinite}
.es-orb.has-video{background:#04100c}
.es-orb video{width:100%;height:100%;object-fit:cover;display:block}
.es-orb svg{color:#9bff4a;stroke-width:1.4;filter:drop-shadow(0 0 10px rgba(125,255,45,.35))}
@keyframes es-glow{0%,100%{box-shadow:0 0 0 6px rgba(125,255,45,.05),0 0 26px rgba(125,255,45,.16)}50%{box-shadow:0 0 0 9px rgba(125,255,45,.08),0 0 40px rgba(125,255,45,.3)}}
.es-visual h3{overflow-wrap:anywhere}

.es-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:14px}
.es-badge,.es-level{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;border:1px solid var(--line);background:var(--panel2);color:var(--text)}
.es-level.easy{color:#b9ff7a;border-color:rgba(125,255,70,.5);background:rgba(125,255,70,.1)}
.es-level.mid{color:#ffe27a;border-color:rgba(255,214,74,.5);background:rgba(255,214,74,.1)}
.es-level.hard{color:#ff9aa8;border-color:rgba(255,107,125,.5);background:rgba(255,107,125,.1)}
.es-muscles{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:10px}
.es-muscles span{padding:3px 11px;border-radius:8px;font-size:12px;color:#7fe3ff;border:1px solid rgba(24,216,255,.35);background:rgba(24,216,255,.08)}
.es-change{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:6px 16px;border-radius:999px;border:1px dashed #3d6b45;background:transparent;color:var(--muted);font-size:12px;cursor:pointer;transition:.2s}
.es-change:hover{color:var(--green);border-color:var(--green);background:rgba(110,255,45,.06)}

.es-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:6px;margin:20px 0 4px;border-radius:999px;outline:none;cursor:pointer;background:linear-gradient(90deg,#72ed2e var(--fill,10%),var(--line) var(--fill,10%))}
.es-range::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#baff3e;border:3px solid #071005;box-shadow:0 0 0 2px #72ed2e,0 0 14px rgba(125,255,45,.5)}
.es-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#baff3e;border:3px solid #071005;box-shadow:0 0 0 2px #72ed2e,0 0 14px rgba(125,255,45,.5)}
.es-presets{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.es-preset{min-width:44px;height:34px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-family:'Kanit',sans-serif;font-size:14px;cursor:pointer;transition:.2s}
.es-preset:hover{border-color:#5ea02c;color:var(--green)}
.es-preset.active{color:#071005;font-weight:600;border-color:transparent;background:linear-gradient(90deg,#72ed2e,#baff3e);box-shadow:0 0 12px rgba(125,255,45,.25)}
.es-recommend{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:11px 14px;border-radius:12px;border:1px solid rgba(255,214,74,.3);background:linear-gradient(120deg,rgba(255,214,74,.08),transparent 70%)}
.es-recommend-icon{flex:0 0 auto;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:#ffd84a;background:rgba(255,214,74,.12)}
.es-recommend p{margin:0;align-self:center;font-size:13px;line-height:1.6;color:var(--muted);text-align:left}
.es-recommend b{color:var(--text);font-weight:600}
.es-recommend button{display:block;margin:1px 0 0;padding:0;border:0;background:none;color:var(--green);font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left}

.es-tip{transition:.2s}
.es-tip:hover{border-color:#2f5d2a;background:rgba(110,255,45,.04)}
.es-tip-howto{border-color:rgba(140,255,50,.4);background:linear-gradient(120deg,rgba(140,255,50,.1),var(--panel2) 70%)}
.es-tip-howto .es-tip-icon{background:rgba(140,255,50,.14);border-color:#5ea02c}
.es-tip-howto p{color:var(--text);opacity:.88}

html[data-theme="light"] .es-tip-icon{color:#2a9d16;background:#eef9e3;border-color:#b6dc94}
html[data-theme="light"] .es-orb svg{color:#2a9d16}
html[data-theme="light"] .es-recommend-icon{color:#8a6a00;background:#fff1c2}
html[data-theme="light"] .es-orb{box-shadow:0 0 0 6px rgba(60,200,100,.1),0 0 22px rgba(60,200,100,.22)}
html[data-theme="light"] .es-level.easy{color:#2a7a16;border-color:#8bcf58;background:#eaf7df}
html[data-theme="light"] .es-level.mid{color:#8a6a00;border-color:#e0c04a;background:#fff6d6}
html[data-theme="light"] .es-level.hard{color:#b02244;border-color:#e59aab;background:#fff0f3}
html[data-theme="light"] .es-muscles span{color:#1f6f8e;border-color:#a9cfe0;background:#e8f3f9}
html[data-theme="light"] .es-change{border-color:#9ccb6b}
html[data-theme="light"] .es-preset.active{color:#fff;background:linear-gradient(90deg,#2a9d16,#4cc02a)}
html[data-theme="light"] .es-recommend{border-color:#ecd48a;background:linear-gradient(120deg,#fff7dc,transparent 70%)}
html[data-theme="light"] .es-tip-howto{border-color:#b6dc94;background:linear-gradient(120deg,#eef9e3,#f7fbf9 70%)}

@media (max-width:760px){
  .es-orb{width:128px;height:128px}
  .es-presets .es-preset{flex:1 1 40px}
}
@media (prefers-reduced-motion:reduce){.es-orb{animation:none}}

/* ฟุตเตอร์แบรนด์ FitTrack (เหมือนหน้าเลือกท่า/Dashboard) */
.fittrack-footer{
  width:min(1230px,100%); min-width:0; margin:28px auto 0; padding:16px 8px 10px;
  border-top:1px solid rgba(91,145,139,.24);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  color:var(--muted); font-family:'Anuphan','Noto Sans Thai',sans-serif;
}
.footer-brand{display:flex; align-items:center; gap:9px; color:var(--text); white-space:nowrap}
.footer-mark{width:27px;height:27px;display:grid;place-items:center;border-radius:8px;
  color:#071006;background:linear-gradient(135deg,#9cff37,#36d98a);
  font:700 10px 'Kanit',sans-serif;letter-spacing:-.5px;
  box-shadow:0 3px 12px rgba(125,255,54,.16)}
.footer-brand strong{font:600 15px 'Kanit',sans-serif;letter-spacing:.25px;
  background:linear-gradient(90deg,#baff52,#42dca0);-webkit-background-clip:text;background-clip:text;color:transparent}
.footer-description{font-size:11px;text-align:center;line-height:1.5}
.footer-copyright{font-size:10px;white-space:nowrap;opacity:.78}
html[data-theme="light"] .fittrack-footer{border-top-color:rgba(57,120,99,.2);color:#64766d}
html[data-theme="light"] .footer-brand{color:#20382d}
@media(max-width:760px){
  .fittrack-footer{margin-top:18px;padding:13px 4px 8px;flex-wrap:wrap;justify-content:center;gap:6px 12px}
  .footer-brand{width:100%;justify-content:center}
  .footer-description{font-size:10px;width:100%}
  .footer-copyright{font-size:9px;width:100%;text-align:center}
}
@media (max-width:1100px){
  .es-card-side{contain:none}
  .es-tips{max-height:480px}
}

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

`}</style>
    </div>
  );
}