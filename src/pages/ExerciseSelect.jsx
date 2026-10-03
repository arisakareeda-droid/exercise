import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import BodyMap, { BodyThumb, PREFERRED_VIEW, VISIBLE_PARTS } from "./BodyMap";

// แคชชื่อผู้ใช้ไว้ เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที ไม่กระพริบเป็นชื่ออื่น
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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// อ่านยอดแคลอรี่ที่บันทึกไว้ของวันนี้ (ใช้ key เดียวกับหน้า Dashboard)
const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

// ======================================================================
// ข้อมูลท่าออกกำลังกาย — ใช้กรองด้วย 3 ตัวแปรร่วมกัน:
// ส่วนร่างกาย (parts) + ประเภท (equipmentType) + ชนิดอุปกรณ์ (equipment)
// ======================================================================
const PART_LABEL = {
  shoulder: "ไหล่",
  chest: "อก",
  back: "หลัง",
  arm: "แขน",
  core: "ท้อง",
  leg: "สะโพก",
  leg2: "ต้นขา",
  calf: "น่อง",
};

const NONE = "none";

const partNames = (parts) => parts.map((p) => PART_LABEL[p]).join(" · ");
const equipmentLabel = (item) =>
  item.equipmentType === "bodyweight" ? "ไม่ใช้อุปกรณ์" : item.equipment;
const equipmentIcon = (item) => (item.equipmentType === "bodyweight" ? "🧍" : "🏋️");

// [id, name, thaiName, parts, equipment, sets, reps, level, howTo]
const makeExercise = (row, extra = {}) => {
  const [id, name, thaiName, parts, equipment, sets, reps, level, howTo] = row;
  const names = parts.map((p) => PART_LABEL[p]).join(" และ ");
  return {
    id,
    name,
    thaiName,
    parts,
    bodyPart: parts[0],
    muscle: names,
    equipmentType: equipment === NONE ? "bodyweight" : "equipment",
    equipment,
    sets: `${sets} เซ็ต`,
    reps,
    level,
    howTo,
    description:
      equipment === NONE
        ? `บริหารกล้ามเนื้อ${names} ด้วยน้ำหนักตัว`
        : `บริหารกล้ามเนื้อ${names} โดยใช้ ${equipment}`,
    video: null,
    ...extra,
  };
};

const BODYWEIGHT_ROWS = [
  // ไหล่
  ["pike_push_up", "Pike Push Up", "พุชอัพแบบพับสะโพก", ["shoulder"], NONE, 3, "8-12 ครั้ง", "กลาง", "ตั้งท่าวิดพื้นแล้วยกสะโพกขึ้นให้ลำตัวเป็นรูปตัว V คว่ำ งอศอกลดศีรษะลงใกล้พื้น แล้วดันตัวกลับขึ้น"],
  ["handstand_push_up", "Handstand Push Up", "แฮนด์สแตนด์พุชอัพ", ["shoulder", "arm"], NONE, 3, "3-6 ครั้ง", "ยาก", "ตั้งมือกับพื้นห่างกำแพงเล็กน้อย เตะขาขึ้นพิงกำแพง งอศอกลดศีรษะลงช้า ๆ แล้วดันกลับขึ้น"],
  ["plank_shoulder_tap", "Plank Shoulder Tap", "แพลงก์แตะไหล่", ["shoulder", "core"], NONE, 3, "20 ครั้ง", "กลาง", "ตั้งท่าแพลงก์แขนตรง กางเท้าให้กว้างพอทรงตัว สลับยกมือแตะไหล่ฝั่งตรงข้ามโดยไม่ให้สะโพกส่าย"],
  ["arm_circle", "Arm Circle", "หมุนแขน", ["shoulder"], NONE, 2, "20 ครั้ง", "ง่าย", "ยืนกางแขนระดับไหล่ หมุนแขนเป็นวงกลมเล็กไปวงใหญ่ ทั้งไปข้างหน้าและข้างหลัง โดยให้ไหล่ผ่อนคลาย"],
  // อก
  ["push_up", "Push Up", "วิดพื้น", ["chest", "arm"], NONE, 3, "10-15 ครั้ง", "กลาง", "วางมือกว้างกว่าไหล่เล็กน้อย ลำตัวตรงเป็นเส้นเดียว งอศอกลดอกลงใกล้พื้น แล้วดันกลับขึ้น"],
  ["wide_push_up", "Wide Push Up", "วิดพื้นมือกว้าง", ["chest"], NONE, 3, "8-12 ครั้ง", "กลาง", "วางมือกว้างกว่าไหล่ชัดเจน ลำตัวตรง ลดอกลงช้า ๆ ให้ศอกชี้ออกด้านข้าง แล้วดันกลับ"],
  ["diamond_push_up", "Diamond Push Up", "วิดพื้นมือเพชร", ["arm", "chest"], NONE, 3, "8-12 ครั้ง", "ยาก", "วางมือชิดกันใต้อกให้นิ้วโป้งและนิ้วชี้ประกบเป็นรูปข้าวหลามตัด ลดอกลงโดยให้ศอกแนบลำตัว แล้วดันกลับ"],
  ["incline_push_up", "Incline Push Up", "วิดพื้นมือสูง", ["chest"], NONE, 3, "10-15 ครั้ง", "ง่าย", "วางมือบนขอบโต๊ะหรือพื้นที่สูงที่มั่นคง ลำตัวตรง ลดอกลงเข้าหาขอบแล้วดันกลับ ท่านี้ง่ายกว่าวิดพื้นปกติ"],
  ["decline_push_up", "Decline Push Up", "วิดพื้นเท้าสูง", ["chest", "shoulder"], NONE, 3, "8-12 ครั้ง", "ยาก", "วางเท้าบนที่สูงที่มั่นคง มือบนพื้น ลำตัวตรง ลดอกลงแล้วดันกลับ ท่านี้เน้นอกส่วนบนและไหล่"],
  // หลัง
  ["superman", "Superman", "ซูเปอร์แมน", ["back"], NONE, 3, "12-15 ครั้ง", "ง่าย", "นอนคว่ำเหยียดแขนไปข้างหน้า ยกแขนและขาขึ้นจากพื้นพร้อมกัน ค้างไว้ 2 วินาที แล้วลดลงช้า ๆ"],
  ["bird_dog", "Bird Dog", "เบิร์ดด็อก", ["back", "core"], NONE, 3, "10 ครั้ง/ข้าง", "ง่าย", "ตั้งท่าคลาน เหยียดแขนข้างหนึ่งไปข้างหน้าและขาฝั่งตรงข้ามไปข้างหลังพร้อมกัน ค้างแล้วสลับข้างโดยลำตัวไม่เอียง"],
  ["reverse_snow_angel", "Reverse Snow Angel", "สโนว์แองเจิลย้อนกลับ", ["back", "shoulder"], NONE, 3, "12 ครั้ง", "กลาง", "นอนคว่ำยกแขนลอยจากพื้น กวาดแขนเป็นครึ่งวงกลมจากข้างลำตัวไปเหนือศีรษะแล้วกลับมาช้า ๆ"],
  // แขน
  ["tricep_dip", "Tricep Dip", "ดิปไตรเซปส์", ["arm"], NONE, 3, "10-15 ครั้ง", "กลาง", "นั่งขอบเก้าอี้ที่มั่นคง วางมือข้างสะโพก เลื่อนก้นออกมา งอศอกลดตัวลงแล้วดันกลับขึ้น"],
  ["close_grip_push_up", "Close Grip Push Up", "วิดพื้นมือแคบ", ["arm", "chest"], NONE, 3, "8-12 ครั้ง", "กลาง", "วางมือแคบกว่าไหล่ ศอกแนบลำตัว ลดอกลงช้า ๆ แล้วดันกลับ ท่านี้เน้นกล้ามเนื้อด้านหลังแขน"],
  // ท้อง
  ["crunch", "Crunch", "ครันช์", ["core"], NONE, 3, "15-20 ครั้ง", "ง่าย", "นอนหงายงอเข่า วางมือข้างศีรษะ ยกไหล่ขึ้นจากพื้นโดยใช้หน้าท้อง ไม่ดึงคอ แล้วลดลงช้า ๆ"],
  ["plank", "Plank", "แพลงก์", ["core"], NONE, 3, "30-45 วินาที", "ง่าย", "ค้ำตัวบนข้อศอกและปลายเท้า ลำตัวตรงเป็นเส้นเดียว เกร็งหน้าท้องและก้นค้างไว้ตามเวลา"],
  ["leg_raise", "Leg Raise", "ยกขา", ["core"], NONE, 3, "10-15 ครั้ง", "กลาง", "นอนหงายเหยียดขา ยกขาชิดกันขึ้นจนตั้งฉากกับพื้น แล้วลดลงช้า ๆ โดยไม่แอ่นหลัง"],
  ["russian_twist", "Russian Twist", "รัสเซียนทวิสต์", ["core"], NONE, 3, "20 ครั้ง", "กลาง", "นั่งเอนตัวเล็กน้อย ประสานมือแล้วบิดลำตัวสลับซ้ายขวา จะยกเท้าลอยหรือวางพื้นก็ได้"],
  ["bicycle_crunch", "Bicycle Crunch", "ครันช์ปั่นจักรยาน", ["core"], NONE, 3, "20 ครั้ง", "กลาง", "นอนหงายมือข้างศีรษะ ยกขาแล้วปั่นสลับ พร้อมบิดศอกเข้าหาเข่าฝั่งตรงข้าม"],
  ["mountain_climber", "Mountain Climber", "ปีนเขา", ["core", "leg2"], NONE, 3, "30 วินาที", "กลาง", "ตั้งท่าวิดพื้นแขนตรง สลับดึงเข่าเข้าหาอกอย่างรวดเร็วโดยสะโพกไม่ยกสูง"],
  // ขา / สะโพก / น่อง
  ["lunges", "Lunges", "ลันจ์", ["leg2", "leg"], NONE, 3, "10 ครั้ง/ข้าง", "ง่าย", "ก้าวเท้าข้างหนึ่งไปข้างหน้า ย่อเข่าทั้งสองจนต้นขาหน้าขนานพื้น แล้วดันกลับ สลับข้าง"],
  ["reverse_lunges", "Reverse Lunges", "ลันจ์ถอยหลัง", ["leg2", "leg"], NONE, 3, "10 ครั้ง/ข้าง", "ง่าย", "ก้าวเท้าข้างหนึ่งถอยไปด้านหลัง ย่อเข่าลง แล้วดันกลับสู่ท่ายืน สลับข้าง"],
  ["jump_squat", "Jump Squat", "กระโดดสควอท", ["leg2", "leg"], NONE, 3, "12 ครั้ง", "กลาง", "ย่อสควอทแล้วกระโดดขึ้นอย่างมีแรง ลงพื้นนุ่ม ๆ ด้วยปลายเท้าแล้วย่อต่อเนื่อง"],
  ["bulgarian_split_squat", "Bulgarian Split Squat", "บัลแกเรียนสปลิตสควอท", ["leg2", "leg"], NONE, 3, "8-10 ครั้ง/ข้าง", "ยาก", "วางเท้าหลังบนเก้าอี้หรือม้านั่งที่มั่นคง ย่อเข่าขาหน้าลงจนต้นขาขนานพื้น แล้วดันกลับ"],
  ["calf_raise", "Calf Raise", "เขย่งน่อง", ["calf"], NONE, 3, "15-20 ครั้ง", "ง่าย", "ยืนแยกเท้าเท่าสะโพก เขย่งขึ้นสุดปลายเท้า ค้างสั้น ๆ แล้วลดส้นลงช้า ๆ"],
  ["glute_bridge", "Glute Bridge", "สะพานสะโพก", ["leg"], NONE, 3, "12-15 ครั้ง", "ง่าย", "นอนหงายงอเข่า วางเท้าราบกับพื้น ยกสะโพกขึ้นจนลำตัวเป็นเส้นตรง เกร็งก้นค้างไว้แล้วลดลง"],
  ["hip_thrust", "Hip Thrust", "ฮิปทรัสต์", ["leg"], NONE, 3, "12-15 ครั้ง", "กลาง", "พิงหลังส่วนบนกับขอบเก้าอี้หรือโซฟาที่มั่นคง งอเข่า ดันสะโพกขึ้นจนลำตัวขนานพื้น เกร็งก้นแล้วลดลง"],
  ["donkey_kick", "Donkey Kick", "ดองกี้คิก", ["leg"], NONE, 3, "12 ครั้ง/ข้าง", "ง่าย", "ตั้งท่าคลาน งอเข่าข้างหนึ่งแล้วเตะขึ้นฟ้าโดยฝ่าเท้าชี้ขึ้น เกร็งก้นแล้วลดลง สลับข้าง"],
  ["fire_hydrant", "Fire Hydrant", "ไฟร์ไฮดรานต์", ["leg"], NONE, 3, "12 ครั้ง/ข้าง", "ง่าย", "ตั้งท่าคลาน ยกเข่าข้างหนึ่งออกด้านข้างโดยคงมุมงอเข่า ค้างสั้น ๆ แล้วลดลง สลับข้าง"],
];

const EQUIPMENT_ROWS = [
  // ไหล่
  ["db_shoulder_press", "Dumbbell Shoulder Press", "ดัมเบลช็อลเดอร์เพรส", ["shoulder", "arm"], "ดัมเบล", 3, "10-12 ครั้ง", "กลาง", "นั่งหรือยืนหลังตรง ถือดัมเบลระดับหู ดันขึ้นเหนือศีรษะจนแขนเกือบตรง แล้วลดลงช้า ๆ"],
  ["lateral_raise", "Lateral Raise", "ยกดัมเบลด้านข้าง", ["shoulder"], "ดัมเบล", 3, "12-15 ครั้ง", "ง่าย", "ยืนถือดัมเบลข้างลำตัว ยกแขนออกด้านข้างจนเสมอไหล่ โดยงอศอกเล็กน้อย แล้วลดลงช้า ๆ"],
  ["front_raise", "Front Raise", "ยกดัมเบลด้านหน้า", ["shoulder"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ยืนถือดัมเบลหน้าต้นขา ยกแขนตรงไปข้างหน้าจนเสมอไหล่ แล้วลดลงช้า ๆ โดยไม่เหวี่ยงตัว"],
  ["arnold_press", "Arnold Press", "อาร์โนลด์เพรส", ["shoulder"], "ดัมเบล", 3, "8-12 ครั้ง", "กลาง", "เริ่มถือดัมเบลหน้าอกโดยฝ่ามือหันเข้าหาตัว ดันขึ้นพร้อมหมุนฝ่ามือออกด้านหน้า แล้วกลับท่าเดิม"],
  ["upright_row", "Upright Row", "อัพไรต์โรว์", ["shoulder"], "บาร์เบล", 3, "10-12 ครั้ง", "กลาง", "ถือบาร์เบลหน้าต้นขา ดึงบาร์ขึ้นชิดลำตัวถึงระดับอก โดยให้ศอกนำสูงกว่าข้อมือ แล้วลดลงช้า ๆ"],
  ["reverse_fly", "Reverse Fly", "รีเวิร์สฟลาย", ["shoulder", "back"], "เครื่องออกกำลังกาย", 3, "12-15 ครั้ง", "ง่าย", "นั่งหน้าเครื่องแล้วจับด้ามจับ ดึงแขนออกไปด้านหลังพร้อมบีบสะบัก แล้วกลับช้า ๆ"],
  ["barbell_overhead_press", "Barbell Overhead Press", "บาร์เบลโอเวอร์เฮดเพรส", ["shoulder", "arm"], "บาร์เบล", 3, "6-10 ครั้ง", "ยาก", "ยืนเกร็งหน้าท้อง ถือบาร์ที่ระดับไหล่ ดันขึ้นเหนือศีรษะจนแขนตรงโดยไม่แอ่นหลัง แล้วลดลง"],
  ["band_face_pull", "Band Face Pull", "เฟซพูลยางยืด", ["shoulder", "back"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "ผูกยางยืดระดับหน้า ดึงเข้าหาใบหน้าโดยศอกสูง บีบสะบักเข้าหากัน แล้วปล่อยกลับช้า ๆ"],
  ["kb_press", "Kettlebell Press", "เคตเทิลเบลเพรส", ["shoulder", "arm"], "Kettlebell", 3, "8-10 ครั้ง", "กลาง", "ถือเคตเทิลเบลที่ระดับไหล่ ข้อมือตรง ดันขึ้นเหนือศีรษะแล้วลดลงช้า ๆ"],
  ["cable_lateral_raise", "Cable Lateral Raise", "ยกด้านข้างด้วยเคเบิล", ["shoulder"], "เคเบิล", 3, "12-15 ครั้ง", "กลาง", "ยืนข้างเครื่อง จับสายเคเบิลด้วยมือที่อยู่ไกล ยกแขนออกด้านข้างจนเสมอไหล่ แล้วลดช้า ๆ"],
  // อก
  ["bb_bench_press", "Barbell Bench Press", "เบนช์เพรสบาร์เบล", ["chest", "arm"], "บาร์เบล", 4, "6-10 ครั้ง", "ยาก", "นอนบนม้านั่ง จับบาร์กว้างกว่าไหล่เล็กน้อย ลดบาร์ลงแตะกลางอกเบา ๆ แล้วดันขึ้น ควรมีผู้ช่วยดู"],
  ["db_bench_press", "Dumbbell Bench Press", "เบนช์เพรสดัมเบล", ["chest", "arm"], "ดัมเบล", 3, "8-12 ครั้ง", "กลาง", "นอนบนม้านั่งถือดัมเบลสองข้าง ดันขึ้นเหนืออกจนแขนเกือบตรง แล้วลดลงช้า ๆ"],
  ["incline_db_press", "Incline Dumbbell Press", "อินไคลน์เพรสดัมเบล", ["chest"], "ดัมเบล", 3, "8-12 ครั้ง", "กลาง", "ปรับม้านั่งให้เอียงเล็กน้อย ถือดัมเบลดันขึ้นเหนืออกส่วนบน แล้วลดลงช้า ๆ"],
  ["cable_fly", "Cable Fly", "เคเบิลฟลาย", ["chest"], "เคเบิล", 3, "12-15 ครั้ง", "กลาง", "ยืนกลางเครื่องจับสายเคเบิลสองข้าง งอศอกเล็กน้อย โน้มแขนมาบรรจบกันหน้าอก แล้วกลับช้า ๆ"],
  ["chest_press_machine", "Chest Press Machine", "เครื่องเชสต์เพรส", ["chest", "arm"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "ง่าย", "ปรับเบาะให้ด้ามจับอยู่ระดับกลางอก ดันออกจนแขนเกือบตรง แล้วกลับช้า ๆ"],
  ["band_chest_press", "Band Chest Press", "เชสต์เพรสยางยืด", ["chest"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "คล้องยางยืดไว้ที่หลังส่วนบน จับปลายสองข้าง ดันมือไปข้างหน้าจนแขนตรง แล้วกลับช้า ๆ"],
  ["kb_floor_press", "Kettlebell Floor Press", "ฟลอร์เพรสเคตเทิลเบล", ["chest", "arm"], "Kettlebell", 3, "8-10 ครั้ง/ข้าง", "กลาง", "นอนหงายถือเคตเทิลเบลมือเดียว ดันขึ้นเหนืออกจนแขนตรง ลดลงจนศอกแตะพื้นแล้วดันใหม่"],
  // หลัง
  ["bb_row", "Bent-Over Barbell Row", "บาร์เบลโรว์", ["back"], "บาร์เบล", 4, "8-10 ครั้ง", "ยาก", "โน้มตัวหลังตรง ถือบาร์เบล ดึงบาร์เข้าหาท้องน้อยพร้อมบีบสะบัก แล้วลดลงช้า ๆ"],
  ["db_row", "Dumbbell Row", "โรว์ดัมเบล", ["back", "arm"], "ดัมเบล", 3, "10-12 ครั้ง/ข้าง", "ง่าย", "ใช้มือและเข่าข้างหนึ่งพิงม้านั่ง หลังตรง ดึงดัมเบลเข้าหาสะโพก แล้วลดลงช้า ๆ"],
  ["lat_pulldown", "Lat Pulldown", "แลตพูลดาวน์", ["back"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "ง่าย", "นั่งล็อกต้นขา จับบาร์กว้างกว่าไหล่ ดึงบาร์ลงถึงระดับอกส่วนบนโดยไม่เอนตัวมาก แล้วปล่อยช้า ๆ"],
  ["seated_cable_row", "Seated Cable Row", "ซีทเคเบิลโรว์", ["back"], "เคเบิล", 3, "10-12 ครั้ง", "กลาง", "นั่งหลังตรง ดึงด้ามจับเข้าหาท้องพร้อมบีบสะบัก แล้วปล่อยกลับช้า ๆ"],
  ["band_pull_apart", "Band Pull Apart", "ดึงยางยืดแยกมือ", ["back", "shoulder"], "ยางยืด", 3, "15 ครั้ง", "ง่าย", "ถือยางยืดสองมือระดับอก แขนตรง ดึงแยกออกด้านข้างจนยางแตะอก บีบสะบัก แล้วกลับช้า ๆ"],
  ["kb_swing", "Kettlebell Swing", "เคตเทิลเบลสวิง", ["back", "leg"], "Kettlebell", 3, "12-15 ครั้ง", "กลาง", "ยืนกว้างกว่าไหล่ ถือเคตเทิลเบลสองมือ ดันสะโพกไปข้างหน้าเหวี่ยงให้ลอยถึงระดับอก ใช้แรงจากสะโพก ไม่ใช่แขน"],
  ["deadlift", "Deadlift", "เดดลิฟต์", ["back", "leg", "leg2"], "บาร์เบล", 4, "5-8 ครั้ง", "ยาก", "ยืนเท้าชิดบาร์ หลังตรง งอสะโพกจับบาร์ ดันเท้าลงพื้นยืดตัวขึ้นพร้อมบาร์ แล้ววางลงอย่างควบคุม"],
  ["chest_supported_row", "Chest-Supported Row", "โรว์พิงม้านั่ง", ["back"], "ม้านั่ง", 3, "10-12 ครั้ง", "ง่าย", "นอนคว่ำบนม้านั่งเอียง ถือดัมเบลสองข้าง ดึงศอกขึ้นด้านหลังพร้อมบีบสะบัก แล้วลดลงช้า ๆ"],
  // แขน
  ["db_curl", "Dumbbell Curl", "เคิร์ลดัมเบล", ["arm"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ยืนถือดัมเบลฝ่ามือหันไปข้างหน้า งอศอกยกดัมเบลขึ้นโดยศอกอยู่กับที่ แล้วลดลงช้า ๆ"],
  ["bb_curl", "Barbell Curl", "เคิร์ลบาร์เบล", ["arm"], "บาร์เบล", 3, "8-12 ครั้ง", "กลาง", "ยืนถือบาร์เบลฝ่ามือหงาย งอศอกยกบาร์ขึ้นโดยไม่เหวี่ยงตัว แล้วลดลงช้า ๆ"],
  ["hammer_curl", "Hammer Curl", "แฮมเมอร์เคิร์ล", ["arm"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ถือดัมเบลฝ่ามือหันเข้าหาลำตัว งอศอกยกขึ้นแล้วลดลงช้า ๆ"],
  ["overhead_tricep_ext", "Overhead Tricep Extension", "เหยียดไตรเซปส์เหนือศีรษะ", ["arm"], "ดัมเบล", 3, "10-12 ครั้ง", "กลาง", "ถือดัมเบลสองมือเหนือศีรษะ งอศอกลดไปด้านหลังศีรษะ แล้วเหยียดแขนกลับโดยศอกชี้ขึ้น"],
  ["cable_pushdown", "Cable Tricep Pushdown", "ผลักเคเบิลไตรเซปส์", ["arm"], "เคเบิล", 3, "12-15 ครั้ง", "ง่าย", "ยืนจับบาร์หรือเชือกที่ระดับอก ศอกแนบลำตัว กดลงจนแขนตรง แล้วปล่อยกลับช้า ๆ"],
  ["band_curl", "Band Curl", "เคิร์ลยางยืด", ["arm"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "เหยียบยางยืดไว้ใต้เท้า จับปลายสองข้าง งอศอกดึงขึ้นแล้วลดลงช้า ๆ"],
  ["bench_dip", "Bench Dip", "ดิปม้านั่ง", ["arm", "chest"], "ม้านั่ง", 3, "10-15 ครั้ง", "กลาง", "วางมือบนขอบม้านั่งด้านหลัง เหยียดขาไปข้างหน้า งอศอกลดตัวลงแล้วดันกลับ"],
  // ท้อง
  ["cable_crunch", "Cable Crunch", "ครันช์เคเบิล", ["core"], "เคเบิล", 3, "12-15 ครั้ง", "กลาง", "คุกเข่าหน้าเครื่องถือเชือกไว้ข้างศีรษะ ม้วนลำตัวลงโดยใช้หน้าท้อง แล้วกลับช้า ๆ"],
  ["ab_machine", "Ab Machine Crunch", "ครันช์เครื่องบริหารหน้าท้อง", ["core"], "เครื่องออกกำลังกาย", 3, "12-15 ครั้ง", "ง่าย", "ปรับเบาะและน้ำหนัก ใช้หน้าท้องม้วนลำตัวเข้าหาเข่า แล้วกลับช้า ๆ"],
  ["kb_russian_twist", "Kettlebell Russian Twist", "รัสเซียนทวิสต์ถือเคตเทิลเบล", ["core"], "Kettlebell", 3, "20 ครั้ง", "กลาง", "นั่งเอนตัวเล็กน้อย ถือเคตเทิลเบลสองมือ แล้วบิดลำตัวสลับซ้ายขวา"],
  ["pallof_press", "Band Pallof Press", "พาลอฟเพรสยางยืด", ["core"], "ยางยืด", 3, "10-12 ครั้ง/ข้าง", "กลาง", "ยืนข้างจุดยึดยาง ถือยางที่หน้าอก ดันออกไปข้างหน้าพร้อมต้านการบิดของลำตัว แล้วกลับ"],
  ["decline_sit_up", "Decline Sit Up", "ซิทอัพม้านั่งเอียง", ["core"], "ม้านั่ง", 3, "10-15 ครั้ง", "กลาง", "นอนบนม้านั่งเอียง ล็อกเท้า ยกลำตัวขึ้นโดยใช้หน้าท้อง แล้วลดลงช้า ๆ"],
  ["db_side_bend", "Dumbbell Side Bend", "เอนข้างถือดัมเบล", ["core"], "ดัมเบล", 3, "12-15 ครั้ง/ข้าง", "ง่าย", "ยืนถือดัมเบลมือเดียว เอนลำตัวลงด้านข้างช้า ๆ แล้วใช้หน้าท้องด้านข้างดึงกลับ"],
  ["barbell_rollout", "Barbell Rollout", "โรลเอาท์บาร์เบล", ["core"], "บาร์เบล", 3, "8-10 ครั้ง", "ยาก", "คุกเข่าจับบาร์เบลที่ติดแผ่นน้ำหนัก ค่อย ๆ กลิ้งไปข้างหน้าโดยหลังตรง แล้วดึงกลับด้วยหน้าท้อง"],
  // สะโพก
  ["bb_hip_thrust", "Barbell Hip Thrust", "ฮิปทรัสต์บาร์เบล", ["leg"], "บาร์เบล", 4, "8-12 ครั้ง", "กลาง", "พิงหลังส่วนบนบนม้านั่ง วางบาร์เบลบนสะโพก (ใช้แผ่นรอง) ดันสะโพกขึ้นจนลำตัวขนานพื้น เกร็งก้นแล้วลดลง"],
  ["cable_kickback", "Cable Glute Kickback", "เตะหลังเคเบิล", ["leg"], "เคเบิล", 3, "12-15 ครั้ง/ข้าง", "กลาง", "คล้องสายที่ข้อเท้า เกาะเครื่องไว้ เตะขาไปด้านหลังโดยเกร็งก้น แล้วกลับช้า ๆ"],
  ["hip_abduction", "Hip Abduction Machine", "เครื่องกางสะโพก", ["leg"], "เครื่องออกกำลังกาย", 3, "12-15 ครั้ง", "ง่าย", "นั่งหลังพิงเบาะ ดันเข่าออกด้านข้างเต็มช่วง แล้วกลับช้า ๆ"],
  ["band_lateral_walk", "Band Lateral Walk", "เดินข้างยางยืด", ["leg"], "ยางยืด", 3, "12 ก้าว/ข้าง", "ง่าย", "สวมยางเหนือเข่า ย่อเข่าเล็กน้อย ก้าวเท้าไปด้านข้างโดยให้ยางตึงตลอด"],
  ["db_rdl", "Dumbbell Romanian Deadlift", "รูมาเนียนเดดลิฟต์ดัมเบล", ["leg", "leg2"], "ดัมเบล", 3, "10-12 ครั้ง", "กลาง", "ถือดัมเบลหน้าต้นขา งอสะโพกเลื่อนก้นไปด้านหลังโดยหลังตรงและเข่างอเล็กน้อย จนรู้สึกตึงต้นขาด้านหลัง แล้วดันกลับ"],
  // ต้นขา
  ["bb_squat", "Barbell Back Squat", "สควอทบาร์เบล", ["leg2", "leg"], "บาร์เบล", 4, "6-10 ครั้ง", "ยาก", "วางบาร์บนบ่าหลัง ย่อตัวลงจนต้นขาขนานพื้นโดยหลังตรง แล้วดันเท้ากลับขึ้น ควรมีที่รองรับบาร์หรือผู้ช่วยดู"],
  ["goblet_squat", "Goblet Squat", "ก็อบเล็ตสควอท", ["leg2", "leg"], "ดัมเบล", 3, "10-12 ครั้ง", "ง่าย", "ถือดัมเบลแนบอก ยืนกว้างเท่าไหล่ ย่อตัวลงโดยอกตั้ง แล้วดันกลับขึ้น"],
  ["leg_press", "Leg Press", "เลกเพรส", ["leg2", "leg"], "เครื่องออกกำลังกาย", 3, "10-12 ครั้ง", "ง่าย", "นั่งหลังแนบเบาะ วางเท้ากว้างเท่าไหล่บนแท่น ดันออกจนเข่าเกือบตรงโดยไม่ล็อก แล้วกลับช้า ๆ"],
  ["leg_extension", "Leg Extension", "เลกเอกซ์เทนชัน", ["leg2"], "เครื่องออกกำลังกาย", 3, "12-15 ครั้ง", "ง่าย", "ปรับแผ่นรองให้อยู่เหนือข้อเท้า เหยียดเข่าจนตรง ค้างสั้น ๆ แล้วลดลงช้า ๆ"],
  ["kb_goblet_squat", "Kettlebell Goblet Squat", "ก็อบเล็ตสควอทเคตเทิลเบล", ["leg2", "leg"], "Kettlebell", 3, "10-12 ครั้ง", "ง่าย", "ถือเคตเทิลเบลแนบอกสองมือ ย่อสควอทโดยอกตั้ง แล้วดันกลับ"],
  ["db_lunge", "Dumbbell Lunge", "ลันจ์ถือดัมเบล", ["leg2", "leg"], "ดัมเบล", 3, "10 ครั้ง/ข้าง", "กลาง", "ถือดัมเบลสองข้าง ก้าวเท้าไปข้างหน้า ย่อเข่าลง แล้วดันกลับ สลับข้าง"],
  ["band_squat", "Band Squat", "สควอทยางยืด", ["leg2", "leg"], "ยางยืด", 3, "12-15 ครั้ง", "ง่าย", "เหยียบยางยืดไว้ใต้เท้า จับปลายยางที่ไหล่ ย่อสควอทแล้วดันกลับโดยให้ยางตึงตลอด"],
  ["bench_step_up", "Bench Step Up", "ก้าวขึ้นม้านั่ง", ["leg2", "leg"], "ม้านั่ง", 3, "10 ครั้ง/ข้าง", "ง่าย", "ยืนหน้าม้านั่ง ก้าวเท้าหนึ่งขึ้นแล้วยืดตัวให้สะโพกเหยียด ก้าวลงช้า ๆ สลับข้าง"],
  // น่อง
  ["standing_calf_raise", "Standing Calf Raise Machine", "เครื่องเขย่งน่องยืน", ["calf"], "เครื่องออกกำลังกาย", 4, "12-15 ครั้ง", "ง่าย", "วางไหล่ใต้แผ่นรอง เขย่งปลายเท้าขึ้นสุด ค้างสั้น ๆ แล้วลดส้นลงต่ำกว่าแท่นเล็กน้อย"],
  ["db_calf_raise", "Dumbbell Calf Raise", "เขย่งน่องถือดัมเบล", ["calf"], "ดัมเบล", 3, "15 ครั้ง", "ง่าย", "ยืนถือดัมเบลสองข้าง เขย่งขึ้นสุดปลายเท้าแล้วลดลงช้า ๆ"],
  ["bb_calf_raise", "Barbell Calf Raise", "เขย่งน่องบาร์เบล", ["calf"], "บาร์เบล", 3, "12-15 ครั้ง", "กลาง", "วางบาร์บนบ่าหลัง ยืนให้มั่นคง เขย่งปลายเท้าขึ้นแล้วลดลงช้า ๆ"],
  ["seated_calf_raise", "Seated Calf Raise Machine", "เครื่องเขย่งน่องนั่ง", ["calf"], "เครื่องออกกำลังกาย", 3, "12-15 ครั้ง", "ง่าย", "นั่งวางเข่าใต้แผ่นรอง ดันปลายเท้าขึ้นสุด แล้วลดส้นลงช้า ๆ"],
];

// ท่าเดิมที่มีวิดีโอในโปรเจกต์ — คง id / วิดีโอ / คำอธิบายเดิมไว้ทั้งหมด
const EXISTING_EXERCISES = [
  makeExercise(
    ["squat", "Squat", "สควอท", ["leg", "leg2"], NONE, 3, "10-15 ครั้ง", "ง่าย", "ยืนกว้างเท่าไหล่ ย่อสะโพกลงเหมือนนั่งเก้าอี้ โดยหลังตรงและเข่าไม่เลยปลายเท้ามากนัก แล้วดันส้นเท้ากลับขึ้น"],
    { description: "บริหารกล้ามเนื้อต้นขา สะโพก และแกนกลางลำตัว", video: "/squats.mp4" }
  ),
  makeExercise(
    ["jumping_jack", "Jumping Jack", "กระโดดตบ", ["leg2", "calf"], NONE, 3, "30 วินาที", "ง่าย", "ยืนเท้าชิด กระโดดแยกเท้าพร้อมยกแขนเหนือศีรษะ แล้วกระโดดกลับท่าเดิมอย่างต่อเนื่อง"],
    { description: "เพิ่มอัตราการเต้นของหัวใจและช่วยเผาผลาญพลังงาน", video: "/jumping_jack.mp4" }
  ),
  makeExercise(
    ["high_knees", "High Knees", "ยกเข่าสูง", ["leg2", "leg"], NONE, 3, "30 วินาที", "ง่าย", "วิ่งอยู่กับที่พร้อมยกเข่าสลับให้สูงถึงระดับสะโพก แกว่งแขนสลับ และลงพื้นเบา ๆ ด้วยปลายเท้า"],
    { description: "วิ่งอยู่กับที่พร้อมยกเข่าสูง เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อต้นขา", video: "/high_knees.mp4" }
  ),
  makeExercise(
    ["punches", "Punches", "ชกหมัด", ["arm", "shoulder"], NONE, 3, "30 วินาที", "ง่าย", "ยืนแยกเท้าเล็กน้อย ชกหมัดสลับซ้าย-ขวาไปข้างหน้าอย่างต่อเนื่อง เกร็งหน้าท้อง และหมุนลำตัวเล็กน้อยตามหมัด"],
    { description: "ชกหมัดสลับซ้าย-ขวา เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อแขน ไหล่ และแกนกลางลำตัว", video: "/punches.mp4" }
  ),
];

const EXERCISES = [
  ...EXISTING_EXERCISES,
  ...BODYWEIGHT_ROWS.map((row) => makeExercise(row)),
  ...EQUIPMENT_ROWS.map((row) => makeExercise(row)),
];

const LEVEL_RANK = { "ง่าย": 0, "กลาง": 1, "ยาก": 2 };

// ---------- ข้อควรระวัง / เวลาพัก ----------
const PART_CAUTION = {
  shoulder: "ไม่ยกเกินช่วงที่ไหล่รู้สึกตึงหรือเจ็บแปลบ และหลีกเลี่ยงการเหวี่ยงตัวช่วย",
  chest: "ดึงสะบักเข้าหากันและไม่แอ่นหลังมากเกินไปขณะออกแรง",
  back: "รักษาแนวหลังให้เป็นกลาง ไม่ก้มหลังโค้งขณะออกแรง",
  arm: "ไม่ล็อกข้อศอกสุดช่วง และควบคุมจังหวะขึ้น-ลงให้สม่ำเสมอ",
  core: "หายใจสม่ำเสมอ ไม่กลั้นหายใจ และไม่ดึงคอขณะทำท่า",
  leg: "ควบคุมสะโพกไม่ให้เอียง และไม่แอ่นหลังส่วนล่าง",
  leg2: "ให้เข่าชี้ไปทางเดียวกับปลายเท้า ไม่ให้เข่าบิดเข้าด้านใน",
  calf: "ทรงตัวให้มั่นคง ควบคุมจังหวะ ระวังข้อเท้าพลิก",
};

const EQUIPMENT_CAUTION = {
  [NONE]: "ใช้พื้นที่โล่ง พื้นไม่ลื่น และสวมรองเท้าที่เหมาะสม",
  "ดัมเบล": "เลือกน้ำหนักที่ควบคุมได้ตลอดท่า",
  "บาร์เบล": "ควรมีผู้ช่วยดูหรือใช้ที่รองรับบาร์เมื่อยกน้ำหนักมาก",
  "เคเบิล": "ตรวจสอบสายและที่ล็อกน้ำหนักก่อนใช้งาน",
  "เครื่องออกกำลังกาย": "ปรับที่นั่งและจุดหมุนให้พอดีกับร่างกายก่อนเริ่ม",
  "ยางยืด": "ตรวจดูรอยฉีกขาดของยางก่อนใช้ และยึดปลายยางให้แน่น",
  Kettlebell: "จับให้มั่นคง และระวังเหวี่ยงชนตัวเองหรือผู้อื่น",
  "ม้านั่ง": "ตรวจสอบความมั่นคงของม้านั่งหรือเก้าอี้ก่อนใช้",
};

const getCautions = (item) => [
  PART_CAUTION[item.parts[0]],
  EQUIPMENT_CAUTION[item.equipment] || EQUIPMENT_CAUTION[NONE],
  "หยุดทันทีหากรู้สึกเจ็บผิดปกติ เวียนศีรษะ หรือหายใจไม่ทัน",
].filter(Boolean);

const getRest = (item) => {
  if (item.reps.includes("วินาที")) return "30-45 วินาที";
  return item.equipmentType === "equipment" ? "60-90 วินาที" : "30-45 วินาที";
};

// ---------- โปรแกรมแนะนำ + คำแนะนำ AI (เปลี่ยนตามส่วนร่างกายและประเภท) ----------
const buildProgram = (part, type, equipChip, list) => {
  const partName = part === "all" ? "ทั้งตัว" : PART_LABEL[part];
  const withEquip = type === "equipment";
  const title =
    type === "all"
      ? `โปรแกรมฝึก${partName}`
      : `โปรแกรมฝึก${partName}${withEquip ? "ด้วยอุปกรณ์" : "แบบไม่ใช้อุปกรณ์"}`;
  const subtitle = withEquip
    ? equipChip !== "ทั้งหมด" ? `(${equipChip})` : "(อุปกรณ์ทุกประเภท)"
    : type === "bodyweight" ? "(Bodyweight)" : "(ผสมทุกประเภท)";
  const items = [...list]
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
    .slice(0, 4);
  return {
    title,
    subtitle,
    days: withEquip ? "3-4 วัน/สัปดาห์" : type === "all" ? "3-4 วัน/สัปดาห์" : "3 วัน/สัปดาห์",
    duration: withEquip ? "45-60 นาที" : type === "all" ? "40-50 นาที" : "30-40 นาที",
    level: withEquip ? "ระดับกลาง" : type === "all" ? "ปรับตามท่า" : "ผู้เริ่มต้น",
    items,
  };
};

const PART_TIPS = {
  all: ["วอร์มอัพทั้งตัวเบา ๆ 5-10 นาที ก่อนเริ่มออกกำลังกาย", "สลับกลุ่มกล้ามเนื้อที่ฝึกในแต่ละวัน เพื่อให้ร่างกายได้พักฟื้น"],
  shoulder: ["วอร์มอัพไหล่ 5-10 นาที ด้วยการหมุนแขนและยืดไหล่เบา ๆ", "ควบคุมท่าทาง ไม่เหวี่ยงตัวหรือยกไหล่ขึ้นหาใบหู"],
  chest: ["วอร์มอัพ 5-10 นาที โดยเปิดอกและหมุนไหล่เบา ๆ ก่อนเริ่ม", "ดึงสะบักเข้าหากัน และคุมจังหวะลง-ขึ้นให้ช้าสม่ำเสมอ"],
  back: ["วอร์มอัพ 5-10 นาที ด้วยการบิดลำตัวและยืดหลังเบา ๆ", "รักษาแนวหลังให้เป็นกลาง และนึกถึงการบีบสะบักทุกครั้งที่ดึง"],
  arm: ["วอร์มอัพข้อมือ ข้อศอก และไหล่ 5-10 นาที ก่อนเริ่ม", "ให้ศอกอยู่กับที่ ใช้กล้ามเนื้อแขนออกแรง ไม่เหวี่ยงตัวช่วย"],
  core: ["วอร์มอัพ 5-10 นาที ด้วยท่าบิดลำตัวและหมุนสะโพกเบา ๆ", "หายใจสม่ำเสมอ เกร็งหน้าท้องตลอดท่า และไม่ดึงคอ"],
  leg: ["วอร์มอัพสะโพก 5-10 นาที ด้วยการหมุนสะโพกและก้าวเดินเบา ๆ", "เกร็งก้นทุกครั้งที่ออกแรง และไม่แอ่นหลังส่วนล่าง"],
  leg2: ["วอร์มอัพขา 5-10 นาที ด้วยการเดินเร็วหรือย่อเข่าเบา ๆ", "ให้เข่าชี้ไปทางเดียวกับปลายเท้า และลงน้ำหนักที่ส้นเท้า"],
  calf: ["วอร์มอัพข้อเท้าและน่อง 5-10 นาที ก่อนเริ่ม", "ควบคุมจังหวะขึ้น-ลงให้ช้า และลงส้นเท้าให้สุดช่วง"],
};

const TYPE_TIPS = {
  bodyweight: ["เริ่มจากจำนวนครั้งที่ทำได้ด้วยฟอร์มที่ถูกต้อง แล้วค่อยเพิ่มทีละน้อย", "ปรับความยากด้วยการเปลี่ยนองศาหรือชะลอจังหวะ โดยไม่ต้องรีบเพิ่มจำนวนครั้ง"],
  equipment: ["เลือกน้ำหนักที่ทำครบจำนวนครั้งได้โดยฟอร์มไม่เสีย แล้วค่อยเพิ่มทีละน้อย", "ตรวจสอบอุปกรณ์ก่อนใช้ทุกครั้ง และให้มีผู้ช่วยดูเมื่อยกน้ำหนักมาก"],
  all: ["ผสมท่าที่ไม่ใช้อุปกรณ์และใช้อุปกรณ์ให้เหมาะกับสถานที่ฝึกของคุณ", "เริ่มจากท่าที่ง่ายก่อน แล้วค่อยขยับไปท่าที่ยากขึ้น"],
};

const buildAiTips = (part, type) => [
  ...(PART_TIPS[part] || PART_TIPS.all),
  ...(TYPE_TIPS[type] || TYPE_TIPS.all),
  "พักกล้ามเนื้อกลุ่มเดิมอย่างน้อย 48 ชม. ก่อนฝึกซ้ำ และหยุดทันทีหากเจ็บผิดปกติ",
];

const AI_TIP_ICONS = ["➜", "♧", "◷", "⌁", "⌁"];

// ---------- โปรแกรมของฉัน (เก็บไว้ในเครื่อง ไม่กระทบหน้าอื่น) ----------
const PROGRAM_KEY = "fittrack-my-program";
const loadSavedProgram = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRAM_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw)].filter((id) => EXERCISES.some((e) => e.id === id));
  } catch {
    return [];
  }
};

// ======================================================================
// Components เฉพาะหน้า "ออกกำลังกาย" (ใช้ในไฟล์นี้เท่านั้น)
// ======================================================================
function ExerciseMedia({ exercise }) {
  if (exercise.video) {
    return (
      <video autoPlay loop muted playsInline preload="metadata">
        <source src={exercise.video} type="video/mp4" />
      </video>
    );
  }
  return (
    <div className="media-fallback" aria-hidden="true">
      <span>{equipmentIcon(exercise)}</span>
      <small>{partNames(exercise.parts)}</small>
    </div>
  );
}

// ปิดด้วยปุ่ม Esc และล็อกการเลื่อนหน้าเบื้องหลังขณะเปิด Modal
function useModalBehavior(onClose) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
}

function ExerciseDetailModal({ exercise, added, onClose, onToggle, onStart }) {
  useModalBehavior(onClose);

  return (
    <div className="ft-modal-backdrop" onClick={onClose}>
      <div
        className="ft-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="ft-modal-close" aria-label="ปิด" onClick={onClose} autoFocus>
          ×
        </button>

        <div className="ft-modal-media">
          <ExerciseMedia exercise={exercise} />
        </div>

        <div className="ft-modal-body">
          <h2 id="exercise-modal-title">{exercise.name}</h2>
          <p className="ft-modal-thai">{exercise.thaiName}</p>

          <div className="exercise-tags">
            <span>{partNames(exercise.parts)}</span>
            <span>{equipmentIcon(exercise)} {equipmentLabel(exercise)}</span>
          </div>

          <div className="ft-stats">
            <div><b>{exercise.sets}</b><span>จำนวนเซ็ต</span></div>
            <div><b>{exercise.reps}</b><span>จำนวนครั้ง</span></div>
            <div><b>{getRest(exercise)}</b><span>เวลาพัก</span></div>
            <div><b>{exercise.level}</b><span>ระดับ</span></div>
          </div>

          <h3>กล้ามเนื้อที่ใช้</h3>
          <p>{partNames(exercise.parts)}</p>

          <h3>อุปกรณ์</h3>
          <p>{equipmentIcon(exercise)} {equipmentLabel(exercise)}</p>

          <h3>วิธีทำ</h3>
          <p>{exercise.howTo}</p>

          <h3>ข้อควรระวัง</h3>
          <ul className="ft-caution">
            {getCautions(exercise).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>

        <div className="ft-modal-actions">
          <button type="button" className="ft-btn-primary" onClick={() => onStart(exercise)}>
            เริ่มท่านี้
          </button>
          <button type="button" className="ft-btn-ghost" onClick={() => onToggle(exercise.id)}>
            {added ? "นำออกจากโปรแกรม" : "เพิ่มเข้าโปรแกรม"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgramDetailModal({ program, selectedIds, onClose, onAddAll, onOpenExercise }) {
  useModalBehavior(onClose);
  const allAdded = program.items.every((item) => selectedIds.includes(item.id));

  return (
    <div className="ft-modal-backdrop" onClick={onClose}>
      <div
        className="ft-modal ft-modal-program"
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="ft-modal-close" aria-label="ปิด" onClick={onClose} autoFocus>
          ×
        </button>

        <div className="ft-modal-body">
          <h2 id="program-modal-title">{program.title}</h2>
          <p className="ft-modal-thai">{program.subtitle}</p>

          <div className="ft-stats">
            <div><b>{program.days}</b><span>ความถี่</span></div>
            <div><b>{program.duration}</b><span>ระยะเวลา</span></div>
            <div><b>{program.level}</b><span>ระดับ</span></div>
            <div><b>{program.items.length} ท่า</b><span>จำนวนท่า</span></div>
          </div>

          <h3>ท่าในโปรแกรม</h3>
          <ul className="ft-program-items">
            {program.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpenExercise(item)}>
                  <strong>{item.name}</strong>
                  <span>{item.sets} · {item.reps}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ft-modal-actions">
          <button
            type="button"
            className="ft-btn-primary"
            disabled={allAdded}
            onClick={() => onAddAll(program.items.map((item) => item.id))}
          >
            {allAdded ? "เพิ่มเข้าโปรแกรมของฉันแล้ว" : "ใช้โปรแกรมนี้"}
          </button>
          <button type="button" className="ft-btn-ghost" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const exercises = EXERCISES;

  const bodyParts = [
    { id: "all", name: "ทั้งหมด", short: "ALL" },
    { id: "shoulder", name: "ไหล่", short: "SH" },
    { id: "chest", name: "อก", short: "CH" },
    { id: "back", name: "หลัง", short: "BK" },
    { id: "arm", name: "แขน", short: "AR" },
    { id: "core", name: "ท้อง", short: "CR" },
    { id: "leg", name: "สะโพก", short: "HP" },
    { id: "leg2", name: "ต้นขา", short: "LG" },
    { id: "calf", name: "น่อง", short: "CF" },
  ];

  const equipmentTypes = [
    "ทั้งหมด",
    "ดัมเบล",
    "บาร์เบล",
    "เคเบิล",
    "เครื่องออกกำลังกาย",
    "ยางยืด",
    "Kettlebell",
    "ม้านั่ง",
  ];

  const [selectedPart, setSelectedPart] = useState("shoulder");
  const [selectedEquipment, setSelectedEquipment] = useState("ทั้งหมด");
  // "bodyweight" = ไม่ใช้อุปกรณ์ | "equipment" = ใช้อุปกรณ์ | "all" = ทั้งหมด (ใช้ตอนกด “แสดงทั้งหมด”)
  const [equipmentType, setEquipmentType] = useState("bodyweight");
  const useEquipment = equipmentType === "equipment";
  const [bodyView, setBodyView] = useState("front");
  const [selectedExercises, setSelectedExercises] = useState(loadSavedProgram);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [showExerciseDetail, setShowExerciseDetail] = useState(false);
  const [showProgramDetail, setShowProgramDetail] = useState(false);

  const changeEquipmentType = (type) => {
    setEquipmentType(type);
    if (type !== "equipment") setSelectedEquipment("ทั้งหมด");
  };

  // บันทึกโปรแกรมของฉันไว้ในเครื่อง (key ใหม่ ไม่ชนกับหน้าอื่น)
  useEffect(() => {
    try {
      localStorage.setItem(PROGRAM_KEY, JSON.stringify(selectedExercises));
    } catch { /* storage optional */ }
  }, [selectedExercises]);

  // กดส่วนร่างกาย (จากปุ่มด้านข้าง หรือกดที่กล้ามเนื้อบนรูปร่างโดยตรง)
  // กดซ้ำที่ส่วนเดิม = ยกเลิก กลับไปแสดงทั้งหมด
  const handlePartSelect = (id) => {
    if (id === selectedPart) {
      setSelectedPart("all");
      return;
    }
    setSelectedPart(id);
    const preferred = PREFERRED_VIEW[id];
    if (bodyView !== "side") {
      if (preferred) setBodyView(preferred);
      else if (!VISIBLE_PARTS[bodyView].includes(id)) setBodyView("front");
    }
  };

  // ---------- ชื่อผู้ใช้ (ดึงจาก Firestore เหมือนหน้า Dashboard) ----------
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());

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
      } catch (err) {
        console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:", err);
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

  // ---------- ธีมมืด/สว่าง (ใช้ key เดียวกับ Dashboard จึงจำค่าร่วมกัน) ----------
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

  // ใช้ layout effect เพื่อให้คืนค่าก่อนหน้าถัดไปตั้งธีมใหม่ (กันธีมหายตอนเปลี่ยนหน้า)
  useLayoutEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  };

  // ---------- การแจ้งเตือน ----------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyCalories, setDailyCalories] = useState(getSavedDailyCalories);

  // กรองจาก 3 ตัวแปรร่วมกัน: ส่วนร่างกาย + ประเภท (ใช้/ไม่ใช้อุปกรณ์) + ชนิดอุปกรณ์
  const filteredExercises = useMemo(
    () =>
      EXERCISES.filter((item) => {
        if (selectedPart !== "all" && !item.parts.includes(selectedPart)) return false;
        if (equipmentType !== "all" && item.equipmentType !== equipmentType) return false;
        if (
          equipmentType === "equipment" &&
          selectedEquipment !== "ทั้งหมด" &&
          item.equipment !== selectedEquipment
        ) {
          return false;
        }
        return true;
      }),
    [selectedPart, equipmentType, selectedEquipment]
  );

  const partTitle = selectedPart === "all" ? "ทั้งหมด" : PART_LABEL[selectedPart];

  const recommendedProgram = useMemo(
    () => buildProgram(selectedPart, equipmentType, selectedEquipment, filteredExercises),
    [selectedPart, equipmentType, selectedEquipment, filteredExercises]
  );

  const aiTips = useMemo(
    () => buildAiTips(selectedPart, equipmentType),
    [selectedPart, equipmentType]
  );

  const myProgramItems = useMemo(
    () => selectedExercises.map((id) => EXERCISES.find((e) => e.id === id)).filter(Boolean),
    [selectedExercises]
  );

  // เริ่มท่า: ไปหน้าตั้งค่าการฝึกเหมือนเดิม (ฟังก์ชันเดิมของระบบ)
  const selectExercise = (exercise) => {
    navigate(`/settings?exercise=${exercise.id}`);
  };

  const openExerciseDetail = (exercise) => {
    setSelectedExercise(exercise);
    setShowExerciseDetail(true);
  };

  const closeExerciseDetail = () => setShowExerciseDetail(false);
  const closeProgramDetail = () => setShowProgramDetail(false);

  // เพิ่ม/ลบท่าในโปรแกรมของฉัน (ไม่เพิ่มซ้ำ)
  const toggleProgramExercise = (id) =>
    setSelectedExercises((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );

  const addProgramExercises = (ids) =>
    setSelectedExercises((current) => [
      ...current,
      ...ids.filter((id, index) => !current.includes(id) && ids.indexOf(id) === index),
    ]);

  const startMyProgram = () => {
    if (myProgramItems.length === 0) return;
    selectExercise(myProgramItems[0]);
  };

  const calorieNotice = dailyCalories === 0
    ? "วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้"
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyCalories.toLocaleString()} kcal`;
  const exerciseNotice = filteredExercises.length > 0
    ? `มี ${filteredExercises.length} ท่าออกกำลังกายให้เลือกตามเงื่อนไขที่คุณตั้งไว้`
    : "ยังไม่พบท่าที่ตรงกับเงื่อนไข ลองเปลี่ยนส่วนของร่างกายหรืออุปกรณ์";

  const handleNotifications = async () => {
    setDailyCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === "default") permission = await window.Notification.requestPermission();
        if (permission === "granted") {
          new window.Notification("FitTrack · เลือกท่าออกกำลังกาย", {
            body: `${calorieNotice}. ${exerciseNotice}`,
            tag: `fittrack-exercise-${getLocalDateKey(currentDateTime)}`,
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
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="fittrack-page">
      {/* ================= SIDEBAR (เหมือนหน้า Dashboard) ================= */}
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" type="button" onClick={() => navigate("/dashboard")}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link active" type="button" onClick={() => navigate("/exercises")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/history")}><span className="side-icon">◷</span>ประวัติการออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/settings")}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" type="button" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      {/* ================= MAIN ================= */}
      <main className="fit-main">
        {/* HEADER */}
        <header className="top-header">
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

          <div className="header-tools">
            <div className="notification-wrap">
              <button
                className="header-icon notification-bell"
                type="button"
                title="การแจ้งเตือน"
                aria-label="เปิดการแจ้งเตือน"
                aria-expanded={notificationsOpen}
                onClick={handleNotifications}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                </svg>
                <span className="notification-dot"></span>
              </button>

              {notificationsOpen && (
                <div className="notification-panel" role="status">
                  <div className="notification-panel-title">
                    <span>การแจ้งเตือน <small>วันนี้</small></span>
                    <button
                      type="button"
                      aria-label="ปิดการแจ้งเตือน"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="notification-item">
                    <span className="notification-avatar dumbbell-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg>
                    </span>
                    <div className="notification-message">
                      <strong>FitTrack <small>· ตอนนี้</small></strong>
                      <span>{calorieNotice}</span>
                      <small>ดูเป้าหมายพลังงานรายวันได้ที่หน้าหลัก</small>
                    </div>
                    <i className="notification-unread" />
                  </div>

                  <div className="notification-item">
                    <span className="notification-avatar dumbbell-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg>
                    </span>
                    <div className="notification-message">
                      <strong>FitTrack <small>· วันนี้</small></strong>
                      <span>{exerciseNotice}</span>
                      <small>กดปุ่ม “เลือก” เพื่อเพิ่มท่าเข้าโปรแกรมของฉัน</small>
                    </div>
                    <i className="notification-unread" />
                  </div>
                </div>
              )}
            </div>

            <div className="date-box">
              <strong>{dateLabel}</strong>
              <span>{timeLabel} น.</span>
            </div>

            <button
              className="theme-button"
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {theme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="fit-content">
          {/* PAGE TITLE */}
          <section className="page-title">
            <div className="title-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div>
              <h1>ออกกำลังกาย</h1>
              <p>เลือกส่วนที่ต้องการฝึก และดูท่าออกกำลังกายที่เหมาะกับคุณ</p>
            </div>

            <div className="ai-title">
              <span>ให้ <b>AI</b> เป็นผู้ช่วยของคุณ</span>
              <span>ในการดูแลสุขภาพ</span>
              <div className="mini-heartbeat">
                <svg viewBox="0 0 150 30">
                  <polyline
                    points="0,15 30,15 42,14 51,5 59,25 68,11 80,15 150,15"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
          </section>

          {/* MAIN EXERCISE AREA */}
          <section className="exercise-workspace">
            {/* ================= LEFT BODY ================= */}
            <div className="body-panel">
              <div className="body-visual">
                <div className="body-glow"></div>
                <BodyMap
                  view={bodyView}
                  selectedPart={selectedPart}
                  onSelectPart={handlePartSelect}
                />
              </div>

              {/* body side menu */}
              <div className="body-part-list">
                {bodyParts.slice(1).map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    className={`body-part ${
                      selectedPart === part.id ? "selected" : ""
                    }`}
                    onClick={() => handlePartSelect(part.id)}
                  >
                    <span className="part-mini">
                      <span></span>
                      <span></span>
                    </span>
                    <span>{part.name}</span>
                  </button>
                ))}
              </div>

              {/* body views */}
              <div className="body-views">
                {[
                  ["front", "ด้านหน้า"],
                  ["back", "ด้านหลัง"],
                  ["side", "ด้านข้าง"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className={`body-view ${bodyView === v ? "active" : ""}`}
                    onClick={() => setBodyView(v)}
                  >
                    <BodyThumb view={v} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ================= RIGHT EXERCISES ================= */}
            <div className="exercise-panel">
              <div className="exercise-panel-title">
                <div className="title-person-icon">
                  <svg viewBox="0 0 40 40">
                    <circle cx="20" cy="9" r="5"></circle>
                    <path d="M13 18 Q20 14 27 18 L30 29 M10 22 L30 22 M15 18 L12 31 M25 18 L28 31"></path>
                  </svg>
                </div>

                <div>
                  <h2>
                    ท่าออกกำลังกายสำหรับ:{" "}
                    <span>{partTitle}</span>
                  </h2>
                  <p>เลือกท่าที่เหมาะสมกับเป้าหมายของคุณ</p>
                </div>
              </div>

              {/* ประเภทการออกกำลังกาย: ไม่ใช้อุปกรณ์ / ใช้อุปกรณ์ */}
              <div className="equipment-title">ประเภทการออกกำลังกาย</div>
              <div className="equipment-toggle" role="group" aria-label="ประเภทการออกกำลังกาย">
                <button
                  type="button"
                  className={equipmentType === "bodyweight" ? "active" : ""}
                  aria-pressed={equipmentType === "bodyweight"}
                  onClick={() => changeEquipmentType("bodyweight")}
                >
                  <span className="toggle-icon">🧍</span>
                  ไม่ใช้อุปกรณ์
                </button>

                <button
                  type="button"
                  className={equipmentType === "equipment" ? "active" : ""}
                  aria-pressed={equipmentType === "equipment"}
                  onClick={() => changeEquipmentType("equipment")}
                >
                  <span className="toggle-icon">🏋️</span>
                  ใช้อุปกรณ์
                </button>
              </div>

              {/* ชนิดอุปกรณ์ — แสดงทันทีเมื่อเลือก “ใช้อุปกรณ์” */}
              {useEquipment && (
                <>
                  <div className="equipment-title">เลือกชนิดอุปกรณ์</div>
                  <div className="equipment-tabs" role="group" aria-label="ชนิดอุปกรณ์">
                    {equipmentTypes.map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={selectedEquipment === type}
                        className={selectedEquipment === type ? "selected" : ""}
                        onClick={() => setSelectedEquipment(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* exercise list */}
              <div className="exercise-list" aria-live="polite">
                {filteredExercises.length > 0 ? (
                  filteredExercises.map((exercise) => {
                    const added = selectedExercises.includes(exercise.id);
                    return (
                      <article
                        className={`exercise-row ${added ? "is-added" : ""}`}
                        key={exercise.id}
                      >
                        <div className="exercise-thumb">
                          <ExerciseMedia exercise={exercise} />
                          {exercise.video && <span className="thumb-play">▶</span>}
                        </div>

                        <div className="exercise-row-info">
                          <h3>{exercise.name}</h3>
                          <p className="exercise-desc">{exercise.description}</p>

                          <div className="exercise-tags">
                            <span>{partNames(exercise.parts)}</span>
                            <span>
                              {equipmentIcon(exercise)} {equipmentLabel(exercise)}
                            </span>
                          </div>

                          <div className="exercise-meta">
                            <span>
                              <i>◷</i>
                              {exercise.sets}
                            </span>

                            <span>
                              <i>◉</i>
                              {exercise.reps}
                            </span>

                            <span>
                              <i>◆</i>
                              ระดับ{exercise.level}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="play-button"
                          onClick={() => openExerciseDetail(exercise)}
                          aria-label={`ดูวิธีทำ ${exercise.thaiName}`}
                        >
                          ▶
                        </button>

                        <button
                          type="button"
                          className={`choose-button ${added ? "added" : ""}`}
                          aria-pressed={added}
                          onClick={() => toggleProgramExercise(exercise.id)}
                        >
                          {added ? "เลือกแล้ว" : "เลือก"}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-exercises">
                    <div>ไม่พบท่าออกกำลังกายที่ตรงกับตัวเลือก</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPart("all");
                        setSelectedEquipment("ทั้งหมด");
                        setEquipmentType("all");
                      }}
                    >
                      แสดงทั้งหมด
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ================= BOTTOM ================= */}
          <section className="bottom-grid">
            {/* recommendation */}
            <div className="recommendation-panel">
              <div className="bottom-title">
                <span className="star-icon">★</span>
                <div>
                  <h2>โปรแกรมแนะนำ</h2>
                  <span>({recommendedProgram.level})</span>
                </div>
              </div>

              <div className="program-card">
                <div className="program-image">
                  <div className="program-person"></div>
                </div>

                <div className="program-info">
                  <h3>{recommendedProgram.title}</h3>
                  <p>{recommendedProgram.subtitle}</p>

                  <div className="program-meta">
                    <span>▣ {recommendedProgram.days}</span>
                    <span>◷ {recommendedProgram.duration}</span>
                  </div>

                  <button
                    type="button"
                    disabled={recommendedProgram.items.length === 0}
                    onClick={() => setShowProgramDetail(true)}
                  >
                    ดูรายละเอียด
                  </button>
                </div>

                <div className="program-arrow">›</div>
              </div>
            </div>

            {/* AI */}
            <div className="ai-panel">
              <div className="ai-heading">
                <span className="bulb">♧</span>
                <h2>คำแนะนำจาก AI</h2>
              </div>

              <div className="ai-content">
                {aiTips.map((tip, index) => (
                  <div className="ai-item" key={tip}>
                    <span>{AI_TIP_ICONS[index % AI_TIP_ICONS.length]}</span>
                    <p>{tip}</p>
                  </div>
                ))}
              </div>

              <div className="ai-quote">
                <span>“ก้าวเล็ก ๆ</span>
                <span>ในทุกวัน</span>
                <span>คือการเปลี่ยนแปลง</span>
                <span>ที่ยิ่งใหญ่”</span>

                <svg viewBox="0 0 180 30">
                  <polyline
                    points="0,16 30,16 42,15 51,5 60,25 70,11 82,16 180,16"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
          </section>

          {/* ================= MY PROGRAM ================= */}
          <section className="my-program-panel">
            <div className="bottom-title">
              <span className="star-icon">✓</span>
              <div>
                <h2>โปรแกรมของฉัน</h2>
                <span>({myProgramItems.length} ท่า)</span>
              </div>
            </div>

            {myProgramItems.length > 0 ? (
              <ul className="my-program-list">
                {myProgramItems.map((item) => (
                  <li key={item.id}>
                    <span className="mp-check">✓</span>
                    <span className="mp-name">{item.name}</span>
                    <em>{item.sets} · {item.reps}</em>
                    <button
                      type="button"
                      aria-label={`นำ ${item.name} ออกจากโปรแกรม`}
                      onClick={() => toggleProgramExercise(item.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="my-program-empty">
                ยังไม่ได้เลือกท่า กดปุ่ม “เลือก” ที่ท่าออกกำลังกายเพื่อเพิ่มเข้าโปรแกรมของคุณ
              </p>
            )}

            <div className="my-program-actions">
              <button
                type="button"
                className="mp-start"
                disabled={myProgramItems.length === 0}
                onClick={startMyProgram}
              >
                เริ่มออกกำลังกาย
              </button>
              {myProgramItems.length > 0 && (
                <button type="button" className="mp-clear" onClick={() => setSelectedExercises([])}>
                  ล้างทั้งหมด
                </button>
              )}
            </div>
          </section>
        </div>
      </main>

      {showExerciseDetail && selectedExercise && (
        <ExerciseDetailModal
          exercise={selectedExercise}
          added={selectedExercises.includes(selectedExercise.id)}
          onClose={closeExerciseDetail}
          onToggle={toggleProgramExercise}
          onStart={selectExercise}
        />
      )}

      {showProgramDetail && recommendedProgram.items.length > 0 && (
        <ProgramDetailModal
          program={recommendedProgram}
          selectedIds={selectedExercises}
          onClose={closeProgramDetail}
          onAddAll={addProgramExercises}
          onOpenExercise={(item) => {
            setShowProgramDetail(false);
            openExerciseDetail(item);
          }}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
        }

        body {
          background: #020708;
          color: #f5f8f7;
          font-family: "Noto Sans Thai", sans-serif;
          overflow-x: hidden;
        }

        button {
          font-family: inherit;
        }

        button:focus-visible {
          outline: 2px solid #b7ff21;
          outline-offset: 2px;
        }

        /* =====================================================
           PAGE
        ===================================================== */

        .fittrack-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(
              circle at 65% 15%,
              rgba(0, 255, 120, .035),
              transparent 30%
            ),
            radial-gradient(
              circle at 95% 80%,
              rgba(0, 150, 255, .035),
              transparent 25%
            ),
            #020708;
        }

        .fittrack-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              90deg,
              transparent 0,
              rgba(182, 255, 40, .015) 50%,
              transparent 100%
            );
        }




























        /* =====================================================
           MAIN
        ===================================================== */

        .fit-main {
          width: calc(100% - 220px);
          margin-left: 220px;
          min-width: 0;
          padding: 0 19px 35px;
        }

        .top-header {
          height: 100px;
          padding: 0 5px 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #18343b;
        }

        .user-block { display: flex; align-items: center; gap: 12px; }
        .avatar-wrap { position: relative; width: 58px; height: 58px; }
        .avatar-fallback {
          width: 58px; height: 58px; border-radius: 50%;
          display: grid; place-items: center;
          background: radial-gradient(circle at 35% 25%, #4c5053, #101719 60%);
          border: 2px solid #8e9698; color: #fff;
          font-weight: 700; font-size: 20px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, .03);
        }
        .online-dot {
          position: absolute; right: 0; bottom: 0;
          width: 17px; height: 17px; border-radius: 50%;
          background: #6eff35; border: 2px solid #06100c;
        }
        .hello { font-size: 13px; color: #ddd; line-height: 1.1; }
        .user-block strong { font-family: "Kanit", sans-serif; font-size: 22px; line-height: 1.15; font-weight: 700; }

        .header-tools {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-icon,
        .theme-button {
          position: relative;
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #e5ece9;
          cursor: pointer;
          font-size: 25px;
        }

        .notification-dot {
          position: absolute;
          right: 3px;
          top: 3px;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ff304f;
          box-shadow: 0 0 8px rgba(255,48,79,.8);
        }

        .date-box {
          min-width: 105px;
          padding-left: 14px;
          border-left: 1px solid rgba(120, 196, 229, .35);
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .date-box strong,
        .date-box span {
          color: #e9efed;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          font-weight: 400;
        }

        .theme-button {
          margin-left: 2px;
          font-size: 27px;
        }

        /* =====================================================
           CONTENT
        ===================================================== */

        .fit-content {
          width: min(1230px, 100%);
          margin: 0 auto;
        }

        .page-title {
          min-height: 104px;
          padding: 21px 5px 12px;
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
        }

        .title-icon {
          width: 50px;
          height: 50px;
          flex: 0 0 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }

        .title-icon span {
          width: 7px;
          height: 31px;
          border: 2px solid #b7ff21;
          border-radius: 7px;
          box-shadow: 0 0 9px rgba(183,255,33,.7);
        }

        .title-icon span:nth-child(2) {
          height: 21px;
        }

        .page-title h1 {
          margin: 0;
          color: #f3f7f5;
          font-family: "Kanit", sans-serif;
          font-size: 29px;
          line-height: 1;
          font-weight: 500;
        }

        .page-title p {
          margin: 8px 0 0;
          color: #a7b3af;
          font-size: 12px;
        }

        .ai-title {
          margin-left: auto;
          padding-right: 3px;
          position: relative;
          color: #d9d3dd;
          font-family: "Kanit", sans-serif;
          font-size: 11px;
          font-style: italic;
          line-height: 1.5;
          text-align: right;
        }

        .ai-title b {
          color: #c7ff25;
          font-weight: 500;
        }

        .mini-heartbeat {
          width: 150px;
          height: 20px;
          margin-left: auto;
        }

        .mini-heartbeat svg {
          width: 100%;
          height: 100%;
        }

        .mini-heartbeat polyline {
          stroke: #c4ff27;
          stroke-width: 1.4;
          filter: drop-shadow(0 0 3px #b7ff21);
        }

        /* =====================================================
           WORKSPACE
        ===================================================== */

        .exercise-workspace {
          display: grid;
          grid-template-columns: minmax(400px, .88fr) minmax(540px, 1.12fr);
          gap: 12px;
          min-width: 0;
        }

        .body-panel,
        .exercise-panel {
          min-width: 0;
          border: 1px solid #0089c4;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              rgba(4, 16, 19, .96),
              rgba(1, 8, 11, .97)
            );
          box-shadow:
            inset 0 0 35px rgba(0, 152, 255, .025),
            0 0 22px rgba(0, 126, 174, .035);
        }

        /* =====================================================
           BODY PANEL
        ===================================================== */

        .body-panel {
          position: relative;
          min-height: 704px;
          padding: 22px 14px 12px;
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 112px;
          grid-template-rows: 1fr 104px;
          gap: 9px;
        }

        .body-visual {
          position: relative;
          min-width: 0;
          min-height: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .body-glow {
          position: absolute;
          width: 320px;
          height: 570px;
          border-radius: 50%;
          background:
            radial-gradient(
              ellipse,
              rgba(0, 183, 255, .09) 0%,
              rgba(105, 255, 47, .035) 30%,
              transparent 68%
            );
          filter: blur(10px);
        }

        .human-svg {
          position: relative;
          z-index: 2;
          width: min(90%, 330px);
          height: 590px;
          overflow: visible;
        }

        .body-outline {
          fill: rgba(9, 28, 39, .9);
          stroke: #76a3c1;
          stroke-width: 2;
          filter: drop-shadow(0 0 5px rgba(70, 179, 255, .35));
        }

        .body-shape {
          fill:
            linear-gradient(
              90deg,
              rgba(18, 60, 84, .9),
              rgba(12, 29, 43, .95)
            );
          stroke: #5c94b9;
          stroke-width: 1.8;
          filter: drop-shadow(0 0 4px rgba(30, 150, 255, .25));
        }

        .muscle {
          stroke-width: 1.2;
          opacity: .9;
          filter: drop-shadow(0 0 5px currentColor);
        }

        .muscle.green {
          fill: rgba(164, 255, 30, .6);
          stroke: #b8ff27;
        }

        .muscle.blue {
          fill: rgba(0, 171, 255, .55);
          stroke: #00d4ff;
        }

        .muscle.purple {
          fill: rgba(151, 51, 255, .48);
          stroke: #b65cff;
        }

        .body-part-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-self: center;
        }

        .body-part {
          min-height: 53px;
          padding: 6px 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #006d9f;
          border-radius: 11px;
          background: rgba(3, 17, 22, .72);
          color: #dce7e5;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          text-align: left;
          transition: .2s ease;
        }

        .body-part:hover {
          border-color: #6db6dd;
          transform: translateX(-2px);
        }

        .body-part.selected {
          color: #efffc7;
          border-color: #b7ff21;
          background:
            linear-gradient(
              90deg,
              rgba(135, 255, 15, .19),
              rgba(20, 69, 28, .16)
            );
          box-shadow:
            inset 0 0 15px rgba(168,255,24,.08),
            0 0 10px rgba(183,255,33,.12);
        }

        .part-mini {
          width: 30px;
          height: 35px;
          position: relative;
          flex: 0 0 30px;
        }

        .part-mini::before {
          content: "";
          position: absolute;
          top: 1px;
          left: 10px;
          width: 10px;
          height: 10px;
          border: 1px solid #8eb0c8;
          border-radius: 50%;
        }

        .part-mini::after {
          content: "";
          position: absolute;
          top: 12px;
          left: 7px;
          width: 16px;
          height: 19px;
          border: 1px solid #8eb0c8;
          border-radius: 45% 45% 30% 30%;
        }

        .part-mini span {
          position: absolute;
          top: 15px;
          width: 7px;
          height: 17px;
          border: 1px solid #8eb0c8;
          border-radius: 5px;
        }

        .part-mini span:first-child {
          left: 1px;
        }

        .part-mini span:last-child {
          right: 1px;
        }

        .body-part.selected .part-mini::before,
        .body-part.selected .part-mini::after,
        .body-part.selected .part-mini span {
          border-color: #b7ff21;
          box-shadow: 0 0 5px rgba(183,255,33,.4);
        }

        .body-views {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
        }

        .body-view {
          border: 1px solid #005f89;
          border-radius: 9px;
          background: rgba(3, 15, 20, .72);
          color: #b9c8c5;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          font-family: "Kanit", sans-serif;
          font-size: 9px;
        }

        .body-view.active {
          color: #eaffc1;
          border-color: #b7ff21;
          box-shadow: inset 0 0 15px rgba(183,255,33,.08);
        }

        .tiny-person {
          position: relative;
          width: 26px;
          height: 59px;
        }

        .tiny-person::before {
          content: "";
          position: absolute;
          top: 0;
          left: 8px;
          width: 10px;
          height: 10px;
          border: 1px solid #6b9fc0;
          border-radius: 50%;
        }

        .tiny-person::after {
          content: "";
          position: absolute;
          top: 11px;
          left: 7px;
          width: 12px;
          height: 28px;
          border: 1px solid #6b9fc0;
          border-radius: 6px;
          box-shadow:
            -6px 12px 0 -5px transparent,
            6px 12px 0 -5px transparent;
        }

        .tiny-person.front {
          filter: drop-shadow(0 0 4px rgba(183,255,33,.4));
        }

        .tiny-person.front::before,
        .tiny-person.front::after {
          border-color: #b7ff21;
        }

        /* =====================================================
           EXERCISE PANEL
        ===================================================== */

        .exercise-panel {
          padding: 15px;
          overflow: hidden;
        }

        .exercise-panel-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 11px;
        }

        .title-person-icon {
          width: 45px;
          height: 45px;
          flex: 0 0 45px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(48, 154, 255, .2),
            transparent 70%
          );
        }

        .title-person-icon svg {
          width: 39px;
          height: 39px;
        }

        .title-person-icon circle,
        .title-person-icon path {
          fill: none;
          stroke: #70c8ff;
          stroke-width: 1.6;
        }

        .exercise-panel-title h2 {
          margin: 0;
          color: #f1f7f4;
          font-family: "Kanit", sans-serif;
          font-size: 20px;
          font-weight: 500;
          line-height: 1.2;
        }

        .exercise-panel-title h2 span {
          color: #c9ff2b;
        }

        .exercise-panel-title p {
          margin: 3px 0 0;
          color: #e7eeeb;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
        }

        .equipment-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .equipment-toggle button {
          min-height: 49px;
          border: 1px solid #117eb4;
          border-radius: 11px;
          background: rgba(3, 19, 25, .78);
          color: #dce8e4;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          transition: .2s ease;
        }

        .equipment-toggle button.active {
          color: #efffcf;
          border-color: #a8ff1e;
          background:
            linear-gradient(
              90deg,
              rgba(131, 255, 14, .22),
              rgba(67, 153, 28, .14)
            );
          box-shadow:
            inset 0 0 17px rgba(183,255,33,.07),
            0 0 9px rgba(183,255,33,.08);
        }

        .toggle-icon {
          margin-right: 9px;
          color: #b7ff21;
          font-size: 19px;
        }

        .equipment-title {
          margin: 10px 0 7px;
          color: #e5ece9;
          font-family: "Kanit", sans-serif;
          font-size: 11px;
        }

        .equipment-title span {
          color: #8b9c99;
        }

        .equipment-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 10px;
        }

        .equipment-tabs button {
          min-width: 73px;
          height: 35px;
          padding: 0 12px;
          border: 1px solid #0877a8;
          border-radius: 18px;
          color: #dce5e2;
          background: rgba(3, 16, 21, .7);
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          transition: .2s ease;
        }

        .equipment-tabs button.selected {
          color: #071006;
          border-color: #b7ff21;
          background: linear-gradient(
            135deg,
            #d4ff31,
            #7cff1c
          );
          box-shadow: 0 0 11px rgba(183,255,33,.25);
        }

        .equipment-tabs button:disabled {
          opacity: .42;
          cursor: default;
        }

        .equipment-tabs button.selected:disabled {
          opacity: .9;
        }

        .exercise-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .exercise-row {
          position: relative;
          flex: 0 0 auto;          /* กันแถวถูกบีบจน thumbnail/ข้อความล้นกรอบ */
          min-height: 108px;
          padding: 8px;
          display: grid;
          grid-template-columns: 100px minmax(0, 1fr) 37px 58px;
          gap: 9px;
          align-items: center;
          border: 1px solid #007cae;
          border-radius: 12px;
          background:
            linear-gradient(
              100deg,
              rgba(5, 20, 25, .94),
              rgba(1, 11, 15, .92)
            );
          transition: .2s ease;
        }

        .exercise-row:hover {
          border-color: #2ac0ef;
          box-shadow: 0 0 17px rgba(0, 160, 220, .07);
          transform: translateY(-1px);
        }

        .exercise-thumb {
          position: relative;
          flex-shrink: 0;
          align-self: center;
          justify-self: center;
          width: 100px;
          height: 78px;
          overflow: hidden;
          border-radius: 9px;
          border: 1px solid #315c6d;
          background: #071114;
        }

        .exercise-thumb video,
        .exercise-thumb .media-fallback {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 25%;   /* เน้นตัวคน ไม่ตัดหัว */
          display: block;
        }

        .thumb-play {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #051006;
          background: #b7ff21;
          box-shadow: 0 0 10px rgba(183,255,33,.55);
          font-size: 10px;
        }

        .exercise-row-info {
          min-width: 0;
        }

        .exercise-row-info h3 {
          margin: 0 0 5px;
          color: #f4f8f5;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .exercise-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .exercise-tags span {
          padding: 2px 8px;
          border: 1px solid #39835d;
          border-radius: 12px;
          color: #e3f9d2;
          background: rgba(50, 122, 66, .17);
          font-size: 8px;
        }

        .exercise-tags span + span {
          color: #d0dae0;
          border-color: #1b5774;
          background: rgba(20, 70, 95, .17);
        }

        .exercise-meta {
          display: flex;
          gap: 11px;
          flex-wrap: wrap;
          color: #aebbb8;
          font-size: 8px;
        }

        .exercise-meta span {
          white-space: nowrap;
        }

        .exercise-meta i {
          margin-right: 4px;
          color: #e0e9e5;
          font-style: normal;
        }

        .play-button {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid rgba(183,255,33,.65);
          color: #09200a;
          background: rgba(158, 255, 31, .9);
          cursor: pointer;
          box-shadow: 0 0 11px rgba(183,255,33,.35);
          font-size: 12px;
          transition: .2s ease;
        }

        .play-button:hover {
          transform: scale(1.08);
          box-shadow: 0 0 17px rgba(183,255,33,.55);
        }

        .choose-button {
          height: 30px;
          border: 0;
          border-radius: 16px;
          color: #071207;
          background: linear-gradient(
            135deg,
            #d2ff31,
            #83ff1b
          );
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          font-weight: 600;
          box-shadow: 0 0 9px rgba(183,255,33,.2);
        }

        .choose-button:hover {
          box-shadow: 0 0 14px rgba(183,255,33,.45);
        }

        .empty-exercises {
          min-height: 220px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 14px;
          border: 1px dashed #147aa1;
          border-radius: 12px;
          color: #91a29e;
          font-size: 12px;
        }

        .empty-exercises button {
          padding: 7px 17px;
          border: 1px solid #9eff1e;
          border-radius: 20px;
          color: #0a1706;
          background: #b7ff21;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
        }

        /* =====================================================
           BOTTOM
        ===================================================== */

        .bottom-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
        }

        .recommendation-panel,
        .ai-panel {
          position: relative;
          min-height: 153px;
          padding: 13px 15px;
          border: 1px solid #0089c4;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              rgba(3, 16, 19, .96),
              rgba(1, 8, 11, .96)
            );
          overflow: hidden;
        }

        .recommendation-panel::before,
        .ai-panel::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(
            90deg,
            #b7ff21,
            #00b9ff,
            transparent
          );
        }

        .bottom-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 9px;
        }

        .star-icon {
          color: #d7ff26;
          font-size: 27px;
          text-shadow: 0 0 10px rgba(183,255,33,.65);
        }

        .bottom-title h2 {
          margin: 0;
          color: #edf5f1;
          font-family: "Kanit", sans-serif;
          font-size: 16px;
          font-weight: 500;
          line-height: 1;
        }

        .bottom-title span:not(.star-icon) {
          color: #9ba9a5;
          font-size: 8px;
        }

        .program-card {
          position: relative;
          min-height: 88px;
          padding: 7px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #278a52;
          border-radius: 10px;
          background: rgba(11, 29, 21, .55);
        }

        .program-image {
          width: 91px;
          height: 73px;
          flex: 0 0 91px;
          position: relative;
          overflow: hidden;
          border-radius: 7px;
          background:
            radial-gradient(
              circle at 55% 30%,
              rgba(100, 160, 130, .35),
              transparent 25%
            ),
            linear-gradient(
              135deg,
              #263c34,
              #0a1512
            );
        }

        .program-person {
          position: absolute;
          left: 35px;
          top: 8px;
          width: 21px;
          height: 52px;
          border-radius: 45% 45% 30% 30%;
          background: linear-gradient(
            180deg,
            #bfcac5,
            #394c47
          );
          box-shadow:
            0 0 12px rgba(180,255,220,.12);
        }

        .program-person::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 5px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #cdd8d3;
        }

        .program-info {
          min-width: 0;
          flex: 1;
        }

        .program-info h3 {
          margin: 0;
          color: #eff8f3;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          font-weight: 500;
        }

        .program-info p {
          margin: 1px 0 7px;
          color: #9ca9a5;
          font-size: 8px;
        }

        .program-meta {
          display: flex;
          gap: 12px;
          color: #b9c6c1;
          font-size: 7px;
        }

        .program-info button {
          margin-top: 7px;
          min-width: 95px;
          height: 26px;
          padding: 0 13px;
          border: 0;
          border-radius: 14px;
          color: #071206;
          background: linear-gradient(
            135deg,
            #caff2c,
            #75ff19
          );
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 9px;
          font-weight: 600;
        }

        .program-arrow {
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          margin-right: 4px;
          border-radius: 50%;
          color: #0b1b08;
          background: #82a4b8;
          font-size: 22px;
        }

        .ai-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 165px;
          gap: 12px;
        }

        .ai-heading {
          grid-column: 1 / -1;
          height: 25px;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .bulb {
          color: #d7ff26;
          font-size: 24px;
          text-shadow: 0 0 10px rgba(183,255,33,.5);
        }

        .ai-heading h2 {
          margin: 0;
          color: #f0f6f2;
          font-family: "Kanit", sans-serif;
          font-size: 16px;
          font-weight: 500;
        }

        .ai-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .ai-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .ai-item > span {
          width: 14px;
          color: #c5ff2c;
          font-size: 12px;
          line-height: 1.4;
        }

        .ai-item p {
          margin: 0;
          color: #bec9c5;
          font-size: 8px;
          line-height: 1.45;
        }

        .ai-quote {
          padding-left: 15px;
          border-left: 1px solid rgba(126, 204, 227, .22);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          color: #d7d0df;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          font-style: italic;
          line-height: 1.4;
        }

        .ai-quote span:nth-child(3),
        .ai-quote span:nth-child(4) {
          color: #c3bacb;
        }

        .ai-quote svg {
          width: 150px;
          height: 23px;
          margin-top: 6px;
        }

        .ai-quote polyline {
          stroke: #b7ff21;
          stroke-width: 1.3;
          filter: drop-shadow(0 0 4px rgba(183,255,33,.6));
        }

        /* =====================================================
           เพิ่มใหม่: การ์ดท่า / โปรแกรมของฉัน / Modal
           (ใช้เฉพาะหน้า ออกกำลังกาย)
        ===================================================== */

        .equipment-toggle {
          margin-bottom: 10px;
        }

        .toggle-icon {
          line-height: 1;
          vertical-align: middle;
        }

        .equipment-tabs {
          animation: ft-fade-in .22s ease;
        }

        @keyframes ft-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }

        /* รายการท่าเลื่อนอยู่ในกรอบเอง (เดสก์ท็อป/แล็ปท็อป) เพื่อให้ 2 คอลัมน์สูงสมดุลกัน
           จอเล็กปล่อยไหลตามปกติ (ดูใน @media ด้านล่าง) */
        .exercise-list {
          max-height: 640px;
          overflow-y: auto;
          padding: 2px 4px 2px 0;
          scrollbar-width: thin;
          scrollbar-color: #1c6b8a transparent;
        }

        .exercise-thumb .media-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-align: center;
          background:
            radial-gradient(circle at 50% 35%, rgba(183,255,33,.16), transparent 62%),
            linear-gradient(145deg, #06161b, #030b0e);
        }

        .media-fallback span {
          font-size: 26px;
          line-height: 1;
        }

        .media-fallback small {
          max-width: 90%;
          color: #8fb4a3;
          font-size: 9px;
          line-height: 1.2;
        }

        .exercise-desc {
          margin: 2px 0 5px;
          color: #8fa19d;
          font-size: 9px;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .exercise-row.is-added {
          border-color: #a8ff1e;
          box-shadow: 0 0 13px rgba(183,255,33,.12);
        }

        .choose-button.added {
          color: #d9ffa0;
          border: 1px solid #a8ff1e;
          background: rgba(131, 255, 14, .14);
          box-shadow: none;
        }

        .play-button,
        .choose-button,
        .ft-btn-primary,
        .ft-btn-ghost {
          touch-action: manipulation;
        }

        .program-card .empty-note {
          color: #91a29e;
          font-size: 11px;
        }

        .program-info button:disabled {
          opacity: .5;
          cursor: default;
        }

        /* ---------- โปรแกรมของฉัน ---------- */
        .my-program-panel {
          position: relative;
          margin-top: 12px;
          padding: 13px 15px;
          border: 1px solid #0089c4;
          border-radius: 14px;
          overflow: hidden;
          background:
            linear-gradient(145deg, rgba(3, 16, 19, .96), rgba(1, 8, 11, .96));
        }

        .my-program-panel::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, #b7ff21, #00b9ff, transparent);
        }

        .my-program-list {
          margin: 0 0 10px;
          padding: 0;
          list-style: none;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 7px;
        }

        .my-program-list li {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px 7px 10px;
          border: 1px solid #278a52;
          border-radius: 10px;
          background: rgba(11, 29, 21, .55);
        }

        .mp-check {
          color: #b7ff21;
          font-size: 13px;
        }

        .mp-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #edf5f1;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
        }

        .my-program-list em {
          color: #8fa19d;
          font-size: 9px;
          font-style: normal;
          white-space: nowrap;
        }

        .my-program-list li button {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border: 1px solid #315c6d;
          border-radius: 50%;
          color: #cfe0db;
          background: transparent;
          cursor: pointer;
          font-size: 15px;
          line-height: 1;
        }

        .my-program-list li button:hover {
          border-color: #ff6b6b;
          color: #ff9a9a;
        }

        .my-program-empty {
          margin: 0 0 10px;
          color: #8fa19d;
          font-size: 11px;
        }

        .my-program-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .mp-start,
        .mp-clear,
        .ft-btn-primary,
        .ft-btn-ghost {
          min-height: 38px;
          padding: 0 20px;
          border-radius: 20px;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          font-weight: 500;
          transition: .2s ease;
        }

        .mp-start,
        .ft-btn-primary {
          color: #071207;
          border: 0;
          background: linear-gradient(135deg, #d2ff31, #83ff1b);
          box-shadow: 0 0 11px rgba(183,255,33,.28);
        }

        .mp-start:hover:not(:disabled),
        .ft-btn-primary:hover:not(:disabled) {
          box-shadow: 0 0 17px rgba(183,255,33,.5);
        }

        .mp-start:disabled,
        .ft-btn-primary:disabled {
          opacity: .45;
          cursor: default;
          box-shadow: none;
        }

        .mp-clear,
        .ft-btn-ghost {
          color: #dce8e4;
          border: 1px solid #117eb4;
          background: rgba(3, 19, 25, .78);
        }

        .mp-clear:hover,
        .ft-btn-ghost:hover {
          border-color: #2ac0ef;
        }

        /* ---------- Modal ---------- */
        .ft-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(0, 4, 6, .78);
          backdrop-filter: blur(4px);
          animation: ft-fade-in .18s ease;
        }

        .ft-modal {
          position: relative;
          width: 100%;
          max-width: 640px;
          max-height: calc(100vh - 36px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #0089c4;
          border-radius: 16px;
          background: linear-gradient(145deg, rgba(5, 20, 25, .99), rgba(1, 9, 12, .99));
          box-shadow: 0 0 40px rgba(0, 160, 220, .16), 0 0 22px rgba(183,255,33,.07);
        }

        .ft-modal::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          z-index: 2;
          background: linear-gradient(90deg, #b7ff21, #00b9ff, transparent);
        }

        .ft-modal-close {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 3;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 1px solid #315c6d;
          border-radius: 50%;
          color: #e5ece9;
          background: rgba(2, 10, 13, .8);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }

        .ft-modal-close:hover {
          border-color: #b7ff21;
          color: #b7ff21;
        }

        .ft-modal-media {
          flex: 0 0 auto;
          height: 220px;
          background: #071114;
          border-bottom: 1px solid #1c4553;
        }

        .ft-modal-media video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .ft-modal-media .media-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background:
            radial-gradient(circle at 50% 40%, rgba(183,255,33,.18), transparent 60%),
            linear-gradient(145deg, #06161b, #030b0e);
        }

        .ft-modal-media .media-fallback span {
          font-size: 58px;
        }

        .ft-modal-media .media-fallback small {
          font-size: 12px;
        }

        .ft-modal-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 20px 6px;
        }

        .ft-modal-program .ft-modal-body {
          padding-top: 24px;
        }

        .ft-modal-body h2 {
          margin: 0;
          padding-right: 38px;
          color: #edf5f1;
          font-family: "Kanit", sans-serif;
          font-size: 22px;
          font-weight: 500;
          line-height: 1.2;
        }

        .ft-modal-thai {
          margin: 2px 0 10px;
          color: #9ba9a5;
          font-size: 12px;
        }

        .ft-modal-body h3 {
          margin: 14px 0 4px;
          color: #b7ff21;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          font-weight: 500;
        }

        .ft-modal-body p {
          margin: 0;
          color: #c9d6d2;
          font-size: 12px;
          line-height: 1.6;
        }

        .ft-modal .exercise-tags {
          margin-bottom: 4px;
        }

        .ft-stats {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .ft-stats div {
          padding: 8px 6px;
          text-align: center;
          border: 1px solid #1c4553;
          border-radius: 10px;
          background: rgba(3, 19, 25, .7);
        }

        .ft-stats b {
          display: block;
          color: #edf5f1;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.3;
        }

        .ft-stats span {
          display: block;
          margin-top: 2px;
          color: #8fa19d;
          font-size: 9px;
        }

        .ft-caution {
          margin: 0;
          padding-left: 18px;
          color: #c9d6d2;
          font-size: 12px;
          line-height: 1.6;
        }

        .ft-caution li::marker {
          color: #d7ff26;
        }

        .ft-program-items {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .ft-program-items button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          text-align: left;
          border: 1px solid #278a52;
          border-radius: 10px;
          color: #edf5f1;
          background: rgba(11, 29, 21, .55);
          cursor: pointer;
          font-family: "Kanit", sans-serif;
        }

        .ft-program-items button:hover {
          border-color: #a8ff1e;
        }

        .ft-program-items strong {
          font-size: 13px;
          font-weight: 500;
        }

        .ft-program-items span {
          color: #8fa19d;
          font-size: 10px;
          white-space: nowrap;
        }

        .ft-modal-actions {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px 20px 16px;
          border-top: 1px solid #12333d;
        }

        .ft-modal-actions button {
          flex: 1 1 150px;
        }

        /* =====================================================
           RESPONSIVE
        ===================================================== */

        @media (max-width: 1150px) {


          .exercise-workspace {
            grid-template-columns: minmax(330px, .8fr) minmax(460px, 1.2fr);
          }

          .body-panel {
            grid-template-columns: minmax(190px, 1fr) 95px;
          }

          .body-part {
            font-size: 10px;
          }

          .exercise-row {
            grid-template-columns: 85px minmax(0, 1fr) 33px 52px;
          }

          .exercise-thumb {
            width: 85px;
            height: 70px;
          }
        }

        @media (max-width: 950px) {










          .exercise-workspace {
            grid-template-columns: 1fr;
          }

          .body-panel {
            min-height: 560px;
          }

          .bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 650px) {
          .top-header { min-height: 70px; height: auto; padding: 10px 2px; }
          .user-block { min-width: 0; gap: 8px; }
          .avatar-wrap, .avatar-fallback { width: 42px; height: 42px; }
          .avatar-fallback { font-size: 16px; }
          .online-dot { width: 12px; height: 12px; }
          .hello { font-size: 11px; }
          .user-block strong { display: block; max-width: 32vw; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

          .header-tools {
            gap: 4px;
          }

          .date-box {
            display: none;
          }

          .theme-button {
            display: none;
          }

          .page-title {
            align-items: flex-start;
            padding-top: 18px;
          }

          .page-title h1 {
            font-size: 25px;
          }

          .page-title p {
            font-size: 10px;
          }

          .ai-title {
            display: none;
          }

          .body-panel {
            grid-template-columns: 1fr;
            grid-template-rows: 480px auto 90px;
          }

          .body-part-list {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 5px;
          }

          .body-part {
            min-height: 39px;
            justify-content: center;
            padding: 4px;
          }

          .part-mini {
            display: none;
          }

          .body-views {
            grid-row: 3;
          }

          .human-svg {
            height: 455px;
          }

          .exercise-panel {
            padding: 11px;
          }

          .equipment-toggle {
            grid-template-columns: 1fr 1fr;
          }

          .exercise-row {
            grid-template-columns: 72px minmax(0, 1fr) 34px;
          }

          .exercise-thumb {
            width: 72px;
            height: 68px;
          }

          .choose-button {
            display: none;
          }

          .exercise-meta {
            gap: 5px;
          }

          .exercise-meta span:nth-child(3) {
            display: none;
          }

          .ai-panel {
            display: block;
          }

          .ai-heading {
            margin-bottom: 10px;
          }

          .ai-quote {
            display: none;
          }

          .program-meta {
            flex-direction: column;
            gap: 2px;
          }
        }

        @media (max-width: 420px) {



          .body-part-list {
            grid-template-columns: repeat(3, 1fr);
          }

          .exercise-panel-title h2 {
            font-size: 17px;
          }

          .exercise-row-info h3 {
            font-size: 13px;
          }

          .exercise-tags span {
            font-size: 7px;
          }
        }


        /* =====================================================
           SIDEBAR — ชุดเดียวกับหน้า Dashboard (สกัดจากไฟล์ Dashboard โดยตรง)
        ===================================================== */

        :root { --bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735 }
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
        @media(max-width:1100px) {
          .sidebar { width:190px }
        }
        @media(max-width:760px) {
          .sidebar { position:relative;width:100%;height:auto;min-height:auto;padding:10px }
          .sidebar:after { display:none }
          .sidebar-logo { width:155px;height:88px }
          .side-menu { display:grid;grid-template-columns:repeat(4,1fr) }
          .side-link { height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px }
          .side-icon { font-size:18px }
          .sidebar-quote,
        .logout-link { display:none }
        }
        .sidebar { border-right:1px solid #18343b !important; }
        html[data-theme="light"] { color-scheme:light;   --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;   --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a; }
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
        @keyframes fittrack-logo-glow { 0%, 100% {     filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);   }   50% {     filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);   } }
        .sidebar-logo { animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;   will-change: filter; }
        @media (prefers-reduced-motion: reduce) {
          .sidebar-logo { animation-duration: 8s !important; }
        }
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
        html[data-theme="light"] .sidebar { background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;   border-right: 1px solid #c5d9ce !important;   box-shadow: 5px 0 22px rgba(26, 74, 49, .045); }
        html[data-theme="light"] .side-link.active { background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32; }
        @media (max-width: 760px) {
          .sidebar { width:100%; min-width:0; padding:8px 7px 9px; }
          .sidebar-logo-wrap { padding:0 2px 8px; }
          .sidebar-logo { width:132px; height:68px; max-width:42vw; }
          .logo-caption { margin-top:-5px; font-size:6px; letter-spacing:1.5px; }
          .side-menu { width:100%; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
          .side-link { width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere; }
          .side-icon { width:auto; min-height:19px; font-size:19px; line-height:1; }
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

        @media (max-width: 1100px) {
          .fit-main { width: calc(100% - 190px); margin-left: 190px; }
        }

        @media (max-width: 760px) {
          .fittrack-page { display: block; }
          .fit-main { width: 100%; margin-left: 0; padding: 0 12px 25px; }
        }

        /* =====================================================
           NOTIFICATIONS (เหมือนหน้า Dashboard) + THEME
        ===================================================== */

        .notification-wrap {
          position: relative;
        }

        .notification-wrap .notification-bell {
          padding: 5px;
          transition: color .2s ease, transform .2s ease;
        }

        .notification-wrap .notification-bell svg {
          width: 23px;
          height: 23px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .notification-wrap .notification-bell:hover {
          transform: translateY(-2px) scale(1.06);
          color: #b7ff21;
        }

        .notification-wrap .notification-panel {
          position: fixed;
          z-index: 9999;
          top: 88px;
          right: 24px;
          width: min(370px, calc(100vw - 28px));
          max-height: calc(100vh - 110px);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .notification-panel-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2px 4px;
          color: #82918b;
          font-size: 12px;
        }

        .notification-panel-title > span {
          display: flex;
          align-items: baseline;
          gap: 7px;
        }

        .notification-panel-title > span > small {
          font-size: 10px;
          opacity: .75;
        }

        .notification-panel-title button {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: inherit;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }

        .notification-panel-title button:hover {
          background: rgba(130, 150, 140, .18);
        }

        .notification-item {
          position: relative;
          width: 100%;
          min-height: 76px;
          padding: 13px 14px;
          display: flex;
          align-items: flex-start;
          gap: 11px;
          text-align: left;
          border: 1px solid rgba(150, 175, 162, .24);
          border-radius: 14px;
          background: rgba(13, 27, 24, .97);
          color: #f5faf6;
          box-shadow: 0 8px 26px rgba(0, 0, 0, .24), 0 2px 7px rgba(0, 0, 0, .12);
          animation: notif-enter .42s cubic-bezier(.2, .8, .2, 1) both;
          transition: transform .2s ease, background .2s ease;
        }

        .notification-item:nth-of-type(2) { animation-delay: .1s; }
        .notification-item:nth-of-type(3) { animation-delay: .2s; }

        .notification-item:hover {
          transform: translateX(-3px);
        }

        .notification-avatar {
          flex: 0 0 38px;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #9ff05b;
          background: linear-gradient(145deg, #244d37, #142c22);
        }

        .notification-avatar svg {
          width: 21px;
          height: 21px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .notification-message {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }

        .notification-message strong {
          color: #f4faf5;
          font-size: 12px;
        }

        .notification-message strong small {
          color: #a7b8ad;
          font-size: 10px;
          font-weight: 400;
        }

        .notification-message span {
          color: #eef5f0;
          font-size: 12px;
          line-height: 1.5;
        }

        .notification-message > small {
          color: #aab9b0;
          font-size: 10px;
          line-height: 1.45;
        }

        .notification-unread {
          flex: 0 0 7px;
          width: 7px;
          height: 7px;
          margin: 7px 1px 0 0;
          border-radius: 50%;
          background: #4eaeef;
          box-shadow: 0 0 0 3px rgba(78, 174, 239, .12);
        }

        @keyframes notif-enter {
          from { opacity: 0; transform: translateY(-8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 600px) {
          .notification-wrap .notification-panel {
            top: 76px;
            right: 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .notification-item { animation: none; transition: none; }
        }

        html.theme-anim *,
        html.theme-anim *::before,
        html.theme-anim *::after {
          transition: background-color .3s ease, border-color .3s ease, color .3s ease !important;
        }

        html[data-theme="dark"] { color-scheme: dark; }

        /* ===================== เพิ่มใหม่: Responsive ของส่วนที่เพิ่ม ===================== */

        @media (max-width: 950px) {
          .equipment-tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 6px;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin;
          }

          .equipment-tabs button {
            flex: 0 0 auto;
            height: 38px;
            font-size: 11px;
          }

          .equipment-toggle button {
            min-height: 52px;
          }

          .choose-button,
          .play-button {
            min-height: 36px;
          }

          .exercise-list {
            max-height: none;
            overflow: visible;
            padding-right: 0;
          }
        }

        @media (max-width: 650px) {
          .ft-modal-backdrop {
            padding: 0;
            align-items: flex-end;
          }

          .ft-modal {
            max-width: none;
            max-height: 94vh;
            border-radius: 16px 16px 0 0;
          }

          .ft-modal-media {
            height: 170px;
          }

          .ft-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .my-program-list {
            grid-template-columns: 1fr;
          }

          .mp-start,
          .mp-clear {
            flex: 1 1 140px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .equipment-tabs,
          .ft-modal-backdrop { animation: none; }
        }

        /* ===================== เพิ่มใหม่: โหมดสว่างของส่วนที่เพิ่ม ===================== */

        html[data-theme="light"] .exercise-thumb .media-fallback,
        html[data-theme="light"] .ft-modal-media .media-fallback {
          background:
            radial-gradient(circle at 50% 35%, rgba(110, 215, 40, .22), transparent 62%),
            linear-gradient(145deg, #eef6f3, #dfeae6);
        }
        html[data-theme="light"] .media-fallback small { color: #4a6a5c; }
        html[data-theme="light"] .exercise-desc { color: #5d6e6a; }
        html[data-theme="light"] .exercise-row.is-added { border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .choose-button.added { color: #1d4a0c; border-color: #4fb82b; background: #e3f5d6; }

        html[data-theme="light"] .my-program-panel {
          border-color: #8cc7de;
          background: linear-gradient(145deg, #ffffff, #f4f9f8);
          box-shadow: 0 8px 24px rgba(20, 60, 50, .08);
        }
        html[data-theme="light"] .my-program-list li { border-color: #9ccb6b; background: #f4fbef; }
        html[data-theme="light"] .mp-check { color: #3f9a1c; }
        html[data-theme="light"] .mp-name { color: #12201c; }
        html[data-theme="light"] .my-program-list em,
        html[data-theme="light"] .my-program-empty { color: #5d6e6a; }
        html[data-theme="light"] .my-program-list li button { border-color: #a9cfe0; color: #33433f; }
        html[data-theme="light"] .mp-clear,
        html[data-theme="light"] .ft-btn-ghost { color: #2a3a36; border-color: #8cc7de; background: #ffffff; }

        html[data-theme="light"] .ft-modal-backdrop { background: rgba(18, 32, 28, .5); }
        html[data-theme="light"] .ft-modal {
          border-color: #8cc7de;
          background: linear-gradient(145deg, #ffffff, #f4f9f8);
          box-shadow: 0 18px 50px rgba(20, 60, 50, .22);
        }
        html[data-theme="light"] .ft-modal-close { color: #1f2d29; border-color: #a9cfe0; background: rgba(255,255,255,.9); }
        html[data-theme="light"] .ft-modal-media { background: #e8efed; border-bottom-color: #c3d2ce; }
        html[data-theme="light"] .ft-modal-body h2 { color: #12201c; }
        html[data-theme="light"] .ft-modal-thai { color: #5d6e6a; }
        html[data-theme="light"] .ft-modal-body h3 { color: #2f8a10; }
        html[data-theme="light"] .ft-modal-body p,
        html[data-theme="light"] .ft-caution { color: #33433f; }
        html[data-theme="light"] .ft-stats div { border-color: #c3d9d2; background: #f4f9f8; }
        html[data-theme="light"] .ft-stats b { color: #12201c; }
        html[data-theme="light"] .ft-stats span { color: #5d6e6a; }
        html[data-theme="light"] .ft-program-items button { color: #12201c; border-color: #9ccb6b; background: #f4fbef; }
        html[data-theme="light"] .ft-program-items span { color: #5d6e6a; }
        html[data-theme="light"] .ft-modal-actions { border-top-color: #d2e2d9; }

        /* ===================== LIGHT THEME =====================
           ใช้เมื่อ <html data-theme="light"> (ปุ่มดวงอาทิตย์/พระจันทร์ที่ header)
           โหมดมืดคือสไตล์เดิมทั้งหมด ไม่ถูกแก้ไข */

        html[data-theme="light"] { color-scheme: light; }

        html[data-theme="light"] body {
          background: #edf3f1;
          color: #12201c;
        }

        html[data-theme="light"] .fittrack-page {
          background:
            radial-gradient(circle at 65% 15%, rgba(60, 200, 100, .12), transparent 30%),
            radial-gradient(circle at 95% 80%, rgba(0, 150, 255, .07), transparent 25%),
            #edf3f1;
        }

        html[data-theme="light"] .fittrack-page::before { display: none; }


        /* header */
        html[data-theme="light"] .top-header { background: rgba(255,255,255,.82); border-bottom-color: #d2e2d9; }
        html[data-theme="light"] .online-dot { border-color: #edf3f1; }
        html[data-theme="light"] .hello { color: #4a5b57; }
        html[data-theme="light"] .user-block strong { color: #172923; }
        html[data-theme="light"] .header-icon,
        html[data-theme="light"] .theme-button { color: #1f2d29; }
        html[data-theme="light"] .notification-wrap .notification-bell:hover,
        html[data-theme="light"] .theme-button:hover { color: #278b20; }
        html[data-theme="light"] .date-box { border-left-color: #c9d7d3; }
        html[data-theme="light"] .date-box strong,
        html[data-theme="light"] .date-box span { color: #3a4a46; }

        /* หัวข้อหน้า */
        html[data-theme="light"] .title-icon span { border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .page-title h1 { color: #12201c; }
        html[data-theme="light"] .page-title p { color: #5d6e6a; }
        html[data-theme="light"] .ai-title { color: #4a5b57; }
        html[data-theme="light"] .ai-title b { color: #2a8a14; }
        html[data-theme="light"] .mini-heartbeat polyline { stroke: #4fb82b; }

        /* แผงการ์ด */
        html[data-theme="light"] .body-panel,
        html[data-theme="light"] .exercise-panel,
        html[data-theme="light"] .recommendation-panel,
        html[data-theme="light"] .ai-panel {
          border-color: #8cc7de;
          background: linear-gradient(145deg, #ffffff, #f4f9f8);
          box-shadow: 0 8px 24px rgba(20, 60, 50, .08);
        }

        /* รูปร่างและส่วนของร่างกาย */
        html[data-theme="light"] .body-outline { fill: #e3eef4; stroke: #7a9fb8; }
        html[data-theme="light"] .body-shape { fill: #d5e4ec; stroke: #6d95b0; }
        html[data-theme="light"] .body-part {
          border-color: #9ccbe0;
          background: #ffffff;
          color: #2a3a36;
        }
        html[data-theme="light"] .body-part:hover { border-color: #4aa5cf; }
        html[data-theme="light"] .body-part.selected {
          color: #12341a;
          border-color: #4fb82b;
          background: linear-gradient(90deg, rgba(110, 215, 40, .2), rgba(110, 215, 40, .05));
          box-shadow: none;
        }
        html[data-theme="light"] .part-mini::before,
        html[data-theme="light"] .part-mini::after,
        html[data-theme="light"] .part-mini span { border-color: #6d8ea6; }
        html[data-theme="light"] .body-part.selected .part-mini::before,
        html[data-theme="light"] .body-part.selected .part-mini { border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .body-view { border-color: #9ccbe0; background: #ffffff; color: #4a5b57; }
        html[data-theme="light"] .body-view.active { color: #12341a; border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .tiny-person::before,
        html[data-theme="light"] .tiny-person::after { border-color: #6d8ea6; }
        html[data-theme="light"] .tiny-person.front::before,
        html[data-theme="light"] .tiny-person.front::after { border-color: #4fb82b; }

        /* แผงท่าออกกำลังกาย */
        html[data-theme="light"] .title-person-icon circle,
        html[data-theme="light"] .title-person-icon path { stroke: #2a8fcf; }
        html[data-theme="light"] .exercise-panel-title h2 { color: #12201c; }
        html[data-theme="light"] .exercise-panel-title h2 span { color: #2f8a10; }
        html[data-theme="light"] .exercise-panel-title p { color: #3a4a46; }
        html[data-theme="light"] .equipment-toggle button { border-color: #8cc7de; background: #ffffff; color: #2a3a36; }
        html[data-theme="light"] .equipment-toggle button.active {
          color: #12341a;
          border-color: #4fb82b;
          background: linear-gradient(90deg, rgba(110, 215, 40, .22), rgba(110, 215, 40, .06));
          box-shadow: none;
        }
        html[data-theme="light"] .toggle-icon { color: #2a9d16; }
        html[data-theme="light"] .equipment-title { color: #1f2f2b; }
        html[data-theme="light"] .equipment-title span { color: #4a5b57; }
        html[data-theme="light"] .equipment-tabs button { border-color: #9ccbe0; color: #2a3a36; background: #ffffff; }
        html[data-theme="light"] .equipment-tabs button.selected { color: #071006; border-color: #8bcf58; box-shadow: none; }
        /* ปุ่มที่ยังใช้ไม่ได้ (ยังไม่เลือก "ใช้อุปกรณ์"): ไม่ลด opacity ทั้งปุ่มแล้ว เพราะทำให้ตัวอักษรจาง
           ใช้พื้นเทาอ่อน + ตัวอักษรเข้มแทน ยังดูออกว่ากดไม่ได้แต่อ่านชัด */
        html[data-theme="light"] .equipment-tabs button:disabled:not(.selected) {
          opacity: 1;
          color: #3f504c;
          background: #eef4f3;
          border-color: #a9cfe0;
        }
        html[data-theme="light"] .equipment-tabs button.selected:disabled { opacity: 1; }
        html[data-theme="light"] .exercise-row {
          border-color: #9ccbe0;
          background: linear-gradient(100deg, #ffffff, #f4f9f8);
        }
        html[data-theme="light"] .exercise-row:hover { border-color: #2ac0ef; box-shadow: 0 4px 14px rgba(0, 120, 180, .1); }
        html[data-theme="light"] .exercise-thumb { border-color: #c3d2ce; background: #e8efed; }
        html[data-theme="light"] .exercise-row-info h3 { color: #12201c; }
        html[data-theme="light"] .exercise-tags span { border-color: #9ccb6b; color: #3f7a15; background: #e9f6df; }
        html[data-theme="light"] .exercise-tags span + span { border-color: #a9cfe0; color: #2f5f78; background: #e8f3f9; }
        html[data-theme="light"] .exercise-meta { color: #5d6e6a; }
        html[data-theme="light"] .exercise-meta i { color: #33433f; }
        html[data-theme="light"] .empty-exercises { border-color: #8cc7de; color: #667773; }

        /* โปรแกรมแนะนำ / AI */
        html[data-theme="light"] .star-icon,
        html[data-theme="light"] .bulb { color: #7aa800; }
        html[data-theme="light"] .bottom-title h2 { color: #12201c; }
        html[data-theme="light"] .bottom-title span:not(.star-icon) { color: #667773; }
        html[data-theme="light"] .program-card { border-color: #9ccb6b; background: #f4fbef; }
        html[data-theme="light"] .program-image { background: #e8f1ed; }
        html[data-theme="light"] .program-info h3 { color: #12201c; }
        html[data-theme="light"] .program-info p { color: #5d6e6a; }
        html[data-theme="light"] .program-meta { color: #4a5b57; }
        html[data-theme="light"] .ai-heading h2 { color: #12201c; }
        html[data-theme="light"] .ai-item > span { color: #2f8a10; }
        html[data-theme="light"] .ai-item p { color: #4a5b57; }
        html[data-theme="light"] .ai-quote { color: #4a5b57; border-left-color: rgba(0, 90, 130, .25); }
        html[data-theme="light"] .ai-quote span:nth-child(3),
        html[data-theme="light"] .ai-quote span:nth-child(4) { color: #667773; }
        html[data-theme="light"] .ai-quote polyline { stroke: #4fb82b; }

        /* การ์ดแจ้งเตือนโหมดสว่าง */
        html[data-theme="light"] .notification-panel-title { color: #5c7065; }
        html[data-theme="light"] .notification-item {
          background: rgba(255, 255, 255, .98);
          border-color: #dce9e0;
          color: #24372e;
          box-shadow: 0 8px 26px rgba(30, 65, 45, .14), 0 2px 7px rgba(30, 65, 45, .07);
        }
        html[data-theme="light"] .notification-item:hover { background: #f9fffb; }
        html[data-theme="light"] .notification-avatar {
          color: #278b43;
          background: linear-gradient(145deg, #dff4e5, #c5e9d1);
        }
        html[data-theme="light"] .notification-message strong { color: #263d32; }
        html[data-theme="light"] .notification-message strong small,
        html[data-theme="light"] .notification-message > small { color: #6e8276; }
        html[data-theme="light"] .notification-message span { color: #2e4438; }
      
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
`}</style>
    </div>
  );
}