// ตัวกลางแลกเปลี่ยนข้อมูลพลังงานระหว่างหน้า Dashboard กับหน้าโหมดเกม
// วางไฟล์นี้ไว้ข้าง ๆ firebase.js (เช่น src/calorieSync.js) แล้ว import จากหน้า pages ด้วย '../calorieSync'
//
// ข้อมูลที่แชร์กัน (เก็บใน localStorage แยกตามวัน เหมือนที่ Dashboard เก็บแคลอรี่อาหารอยู่แล้ว)
//   fittrack-daily-target      เป้าหมายพลังงานต่อวัน (TDEE) — Dashboard เป็นคนเขียน ให้หน้าเกมอ่าน
//   fittrack-calories-<วัน>     แคลอรี่ที่กินเข้าไป — Dashboard เขียน (ของเดิม)
//   fittrack-burned-<วัน>       แคลอรี่ที่เผาผลาญจากเกม แยกตามเกม — หน้าเกมเขียน ให้ Dashboard อ่าน
//
// สูตร: ได้รับสุทธิ = กินเข้าไป − เผาผลาญจากเกม   |   เหลือ = เป้าหมาย − ได้รับสุทธิ

const TARGET_KEY = 'fittrack-daily-target';
const TDEE_KEY = 'fittrack-tdee';
const CAL_PREFIX = 'fittrack-calories-';
const BURN_PREFIX = 'fittrack-burned-';
const EVENT = 'fittrack:energy'; // ยิงในแท็บเดียวกัน (storage event ยิงเฉพาะแท็บอื่น)
export const DEFAULT_TARGET = 1650;

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const num = (v) => Math.max(0, Number(v) || 0);

export const dayKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
};
const emit = () => {
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ไม่ใช่เบราว์เซอร์ก็ข้าม */ }
};

// ---------- เป้าหมายพลังงานต่อวัน ----------
export const readTarget = () => {
  const n = Number(read(TARGET_KEY));
  return n > 0 ? Math.round(n) : DEFAULT_TARGET;
};
export const writeTarget = (n) => {
  const v = Math.round(Number(n));
  if (!(v > 0) || String(v) === read(TARGET_KEY)) return;
  write(TARGET_KEY, String(v));
  emit();
};
// ค่า TDEE ที่ผู้ใช้กดคำนวณไว้ (เก็บไว้ ไม่งั้นรีเฟรชแล้ว Dashboard จะกลับไปใช้ค่าเริ่มต้น)
export const readTdee = () => {
  const n = Number(read(TDEE_KEY));
  return n > 0 ? Math.round(n) : null;
};
export const writeTdee = (n) => {
  const v = Math.round(Number(n));
  if (v > 0) write(TDEE_KEY, String(v));
};

// ---------- แคลอรี่ที่กิน ----------
export const readConsumed = (day = dayKey()) => num(read(`${CAL_PREFIX}${day}`));

// ---------- แคลอรี่ที่เผาผลาญจากเกม ----------
const readGames = (day) => {
  try {
    const o = JSON.parse(read(`${BURN_PREFIX}${day}`) || '{}');
    return o && typeof o.games === 'object' && o.games ? o.games : {};
  } catch { return {}; }
};

export const readBurn = (day = dayKey()) => {
  const games = readGames(day);
  const clean = {};
  Object.keys(games).forEach((k) => { clean[k] = round1(num(games[k])); });
  const total = round1(Object.values(clean).reduce((a, b) => a + b, 0));
  return { games: clean, total };
};

// ตั้งยอดเผาผลาญ "ของเกมนั้นในวันนี้" (ค่ารวมสะสม ไม่ใช่ค่าที่บวกเพิ่ม จึงเรียกซ้ำกี่ครั้งก็ไม่นับซ้อน)
export const writeBurn = (game, kcal, day = dayKey()) => {
  const games = readGames(day);
  const next = round1(num(kcal));
  if (games[game] === next) return;
  games[game] = next;
  write(`${BURN_PREFIX}${day}`, JSON.stringify({ games, at: Date.now() }));
  emit();
};

// ---------- สรุปพลังงานของวัน ----------
export const readEnergy = (day = dayKey()) => {
  const target = readTarget();
  const consumed = Math.round(readConsumed(day));
  const { games, total } = readBurn(day);
  const net = Math.max(0, Math.round(consumed - total));
  const remaining = target - net;
  return {
    day, target, consumed, games, burned: total, net,
    remaining: Math.max(0, remaining), over: Math.max(0, -remaining),
  };
};

// ฟังการเปลี่ยนแปลงแบบเรียลไทม์: แท็บอื่น (storage event) + แท็บเดียวกัน (custom event)
// + ตรวจซ้ำทุก 1.5 วินาที และตอนกลับมาที่แท็บ เผื่อ event ตกหล่น  คืนฟังก์ชันยกเลิก
export const subscribeEnergy = (cb) => {
  let last = '';
  const push = (force = false) => {
    const e = readEnergy();
    const sig = JSON.stringify(e);
    if (force || sig !== last) { last = sig; cb(e); }
  };
  const onStorage = (ev) => { if (!ev.key || ev.key.startsWith('fittrack-')) push(); };
  const onVisible = () => { if (!document.hidden) push(); };
  const timer = window.setInterval(() => push(), 1500);
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, push);
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  push(true);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, push);
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

// ---------- แจ้งเตือนของเบราว์เซอร์ ----------
// ขอสิทธิ์ต้องเรียกหลังผู้ใช้กดเองเท่านั้น (เช่นกดปุ่มกระดิ่ง)
export const requestNotify = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    if (window.Notification.permission === 'default') return await window.Notification.requestPermission();
    return window.Notification.permission;
  } catch { return 'denied'; }
};
// ส่งแจ้งเตือนเฉพาะเมื่อผู้ใช้อนุญาตไว้แล้ว ถ้าไม่ได้อนุญาตก็ข้าม (หน้าเว็บยังมีข้อความแจ้งในหน้าอยู่)
export const notifyBrowser = (title, body, tag) => {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
      new window.Notification(title, { body, tag });
    }
  } catch { /* ส่งไม่ได้ก็ข้าม */ }
};
