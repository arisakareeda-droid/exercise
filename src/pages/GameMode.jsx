import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ติดตั้งก่อนใช้: npm i @mediapipe/tasks-vision@0.10.14  (ใช้เวอร์ชันเดียวกับ WASM ด้านล่าง)
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const BEST_KEY = 'fittrack-game-best';

let W = 960; // ขนาดแคนวาส: แนวนอน 960x720 / แนวตั้ง 720x960 (ตั้งค่าตอนเริ่มเกมในฟังก์ชัน setSize)
let H = 720;
const setSize = (portrait) => { W = portrait ? 720 : 960; H = portrait ? 960 : 720; };
const MAX_LIVES = 3;
const FRUIT_R = 44;
const FIST_R = 38;

// ---- ค่าตรวจจับหมัด (ปรับได้ถ้าต่อยโดนยากหรือง่ายเกินไป) ----
const PUNCH_EXT = 130;      // มุมข้อศอก (องศา) ที่ถือว่าเหยียดแขนพอ ลดเลขถ้าต่อยไม่ติด (เพิ่มถ้าอยากให้เข้มขึ้น)
const PUNCH_RISE = 25;      // แขนต้องเหยียดเพิ่มอย่างน้อยกี่องศาภายใน 0.6 วินาที — คือต้อง "งอแล้วชกออก" จริง ๆ (กันการปัดมือ/ยืนเหยียดแขนค้าง)
const PUNCH_WINDOW = 500;   // ms หลังชก ที่หมัดนั้นทำให้ผลไม้แตกได้
const PUNCH_COOLDOWN = 250; // ms ระยะห่างขั้นต่ำระหว่างหมัดแต่ละครั้งของแขนเดียวกัน
const HIT_REACH = 1.5;      // ขยายโซนชนรอบกำปั้น (เท่าของ FIST_R) ยิ่งมากยิ่งโดนง่าย
const LOST_MS = 1200;       // มองไม่เห็นตัวนานเท่านี้ เกมจะหยุดชั่วคราว
const READY_MS = 1000;      // ต้องยืนอยู่ในตำแหน่งที่ถูกต้องนิ่ง ๆ นานเท่านี้ก่อนเริ่มนับถอยหลัง

const FRUITS = [
  ['🍎', '#ff4a4a'], ['🍊', '#ffa534'], ['🍉', '#ff5f7e'],
  ['🍌', '#ffe14a'], ['🍇', '#b073ff'], ['🍓', '#ff4f6d'], ['🍍', '#ffd24a'],
];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24]; // ไหล่ ศอก ข้อมือ สะโพก
const BONES = [[11, 12, null], [11, 13, 0], [13, 15, 0], [12, 14, 1], [14, 16, 1], [11, 23, null], [12, 24, null], [23, 24, null]];
const HUD0 = { score: 0, lives: MAX_LIVES, combo: 0, l: 0, r: 0 };
const CHK0 = { sh: false, el: false, wr: false, dist: 'none', progress: 0 };

const readBest = () => {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
};

const newFist = () => ({ ok: false, x: 0, y: 0, v: 0, t: 0, trail: [], ext: null, hist: [], punchAt: -1e9, active: false });
const newGame = () => ({
  objs: [], parts: [], floats: [], rings: [],
  score: 0, lives: MAX_LIVES, combo: 0, maxCombo: 0, hits: 0, bombs: 0,
  spawned: 0, bombStreak: 0, spawnIn: 700, flash: 0, shake: 0,
  last: 0, startedAt: performance.now(), pausedMs: 0, lostMs: 0, readyMs: 0, lastHint: 0,
  lastVideoTime: -1, pose: null, world: null, joints: {}, bodyOk: false,
  view: { sh: false, el: false, wr: false, dist: 'none' },
  punches: [0, 0], // จำนวนหมัดที่นับได้ [ซ้าย, ขวา]
  fists: [newFist(), newFist()],
});

// แปลงพิกัดจากวิดีโอ (object-fit: cover + กลับซ้ายขวา) ไปเป็นพิกัดแคนวาส
function mapPoint(p, video) {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const k = Math.max(W / vw, H / vh);
  return { x: W - (p.x * vw * k + (W - vw * k) / 2), y: p.y * vh * k + (H - vh * k) / 2 };
}

// มุมที่จุด b (องศา) จากพิกัด 3 มิติ — ใช้ world landmarks จึงวัดมุมศอกได้แม้ต่อยพุ่งเข้าหากล้อง
function angle3(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const m = Math.hypot(...v1) * Math.hypot(...v2);
  if (!m) return 0;
  const d = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  return (Math.acos(Math.max(-1, Math.min(1, d / m))) * 180) / Math.PI;
}

function trackFists(s, video, landmarker, now) {
  let pts = [null, null];
  let shoulder = 240;
  const ang = [null, null];
  s.joints = {};
  s.bodyOk = false;
  s.view = { sh: false, el: false, wr: false, dist: 'none' };

  if (landmarker && video && video.readyState >= 2 && video.currentTime !== s.lastVideoTime) {
    s.lastVideoTime = video.currentTime;
    try {
      const r = landmarker.detectForVideo(video, now);
      s.pose = r.landmarks?.[0] || null;
      s.world = r.worldLandmarks?.[0] || null;
    } catch { s.pose = null; s.world = null; }
  }

  const lm = s.pose;
  if (lm && video) {
    const seen = (i, th = 0.3) => !!lm[i] && (lm[i].visibility ?? 1) > th;
    JOINTS.forEach((i) => { if (seen(i)) s.joints[i] = mapPoint(lm[i], video); });
    if (seen(11) && seen(12)) {
      s.bodyOk = true;
      const a = mapPoint(lm[11], video);
      const b = mapPoint(lm[12], video);
      const raw = Math.hypot(a.x - b.x, a.y - b.y);
      shoulder = Math.max(80, raw);
      s.view = {
        sh: seen(11, 0.5) && seen(12, 0.5),
        el: seen(13, 0.5) && seen(14, 0.5),
        wr: seen(15, 0.5) && seen(16, 0.5),
        dist: raw < W * 0.10 ? 'far' : raw > W * 0.40 ? 'near' : 'ok',
      };
    }
    pts = [[15, 19], [16, 20]].map(([wrist, index]) => {
      if (!seen(wrist)) return null;
      const w = mapPoint(lm[wrist], video);
      if (!seen(index)) return w;
      const f = mapPoint(lm[index], video);
      return { x: (w.x + f.x) / 2, y: (w.y + f.y) / 2 };
    });
    const wl = s.world;
    if (wl) {
      [0, 1].forEach((i) => {
        if (seen(11 + i) && seen(13 + i) && seen(15 + i) && wl[11 + i] && wl[13 + i] && wl[15 + i]) {
          ang[i] = angle3(wl[11 + i], wl[13 + i], wl[15 + i]);
        }
      });
    }
  }

  s.fists.forEach((f, i) => {
    const p = pts[i];
    if (!p) { f.ok = false; f.v = 0; f.trail.length = 0; f.ext = null; f.hist.length = 0; f.active = false; return; }
    if (f.ok && (p.x !== f.x || p.y !== f.y)) {
      const secs = Math.max(0.008, (now - f.t) / 1000);
      f.v = Math.max(Math.hypot(p.x - f.x, p.y - f.y) / secs / shoulder, f.v * 0.8);
      f.t = now;
    } else {
      f.v *= 0.92;
      if (!f.ok) f.t = now;
    }
    f.ok = true; f.x = p.x; f.y = p.y;
    f.trail.push({ x: p.x, y: p.y });
    if (f.trail.length > 8) f.trail.shift();

    // ตรวจ "หมัดที่ถูกท่า": แขนต้องเหยียดสุดและเพิ่งเหยียดออกมาในช่วงสั้น ๆ
    const a = ang[i];
    if (a == null) {
      f.ext = null; f.hist.length = 0;
    } else {
      f.ext = f.ext == null ? a : f.ext * 0.4 + a * 0.6;
      f.hist.push({ t: now, a: f.ext });
      while (f.hist.length && now - f.hist[0].t > 600) f.hist.shift();
      const lowest = Math.min(...f.hist.map((h) => h.a));
      if (f.ext >= PUNCH_EXT && f.ext - lowest >= PUNCH_RISE && now - f.punchAt > PUNCH_COOLDOWN) {
        f.punchAt = now;
        s.punches[i] += 1;
      }
    }
    f.active = now - f.punchAt < PUNCH_WINDOW;
  });
}

function splash(s, o, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    s.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 3 + Math.random() * 6, life: 0.6 + Math.random() * 0.4, max: 1, color });
  }
}

function step(s, dt, now) {
  const level = 1 + Math.floor(s.hits / 8);
  s.spawnIn -= dt * 1000;
  if (s.spawnIn <= 0) {
    s.spawnIn = Math.max(460, 1050 - level * 60) * (0.8 + Math.random() * 0.5);
    const bomb = s.spawned >= 2 && s.bombStreak < 2 && Math.random() < Math.min(0.32, 0.2 + level * 0.012);
    const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    s.objs.push({
      bomb, emoji: bomb ? '💣' : fruit[0], color: fruit[1],
      x: 90 + Math.random() * (W - 180), y: -60,
      vy: 170 + level * 24 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3,
    });
    s.bombStreak = bomb ? s.bombStreak + 1 : 0;
    s.spawned += 1;
  }
  s.objs.forEach((o) => { o.y += o.vy * dt; o.rot += o.vr * dt; });
  s.objs = s.objs.filter((o) => o.y < H + 80);

  s.fists.forEach((f) => {
    if (!f.ok) return;
    const i = s.objs.findIndex((o) => Math.hypot(o.x - f.x, o.y - f.y) < FRUIT_R + FIST_R * HIT_REACH);
    if (i < 0) return;
    if (!f.active) {
      // มือไปแตะผลไม้ แต่ไม่ใช่หมัดจริง (ไม่ได้งอแล้วชกออก) → ไม่แตก และบอกให้ชกออกไป
      if (f.v > 0.5 && now - s.lastHint > 1600) {
        s.lastHint = now;
        s.floats.push({ x: Math.max(150, Math.min(W - 150, f.x)), y: f.y, text: 'ต้องชกหมัดออกไป!', color: '#ffd24a', life: 1, size: 30 });
      }
      return;
    }
    const o = s.objs.splice(i, 1)[0];
    f.active = false; f.punchAt = -1e9; f.v = 0; // หนึ่งหมัดทำให้แตกได้หนึ่งลูก
    if (o.bomb) {
      s.lives -= 1; s.combo = 0; s.bombs += 1; s.flash = 1; s.shake = 0.4;
      splash(s, o, '#ffb02e', 26); splash(s, o, '#ff4a2e', 14);
      s.rings.push({ x: o.x, y: o.y, r: 20, life: 0.5 });
      s.floats.push({ x: o.x, y: o.y, text: '-1 ❤', color: '#ff6b81', life: 1 });
      try { navigator.vibrate?.(180); } catch { /* ไม่รองรับก็ข้าม */ }
    } else {
      s.combo += 1; s.maxCombo = Math.max(s.maxCombo, s.combo); s.hits += 1;
      const mult = Math.min(4, 1 + Math.floor(s.combo / 5));
      s.score += 10 * mult;
      splash(s, o, o.color, 18);
      s.floats.push({ x: o.x, y: o.y, text: `+${10 * mult}`, color: '#c6ff38', life: 0.8 });
    }
  });

  s.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; });
  s.parts = s.parts.filter((p) => p.life > 0);
  s.floats.forEach((f) => { f.y -= 70 * dt; f.life -= dt; });
  s.floats = s.floats.filter((f) => f.life > 0);
  s.rings.forEach((r) => { r.r += 520 * dt; r.life -= dt; });
  s.rings = s.rings.filter((r) => r.life > 0);
  s.flash = Math.max(0, s.flash - dt * 2.5);
  s.shake = Math.max(0, s.shake - dt);
}

function render(ctx, s, now) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * s.shake * 2, (Math.random() - 0.5) * 18 * s.shake * 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // โครงร่างร่างกายที่ระบบตรวจจับได้ ให้ผู้เล่นเห็นว่าท่าทางถูกอ่านอยู่
  ctx.lineCap = 'round';
  BONES.forEach(([a, b, side]) => {
    const p = s.joints[a];
    const q = s.joints[b];
    if (!p || !q) return;
    const hot = side != null && s.fists[side].active;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = hot ? 'rgba(233,255,176,.95)' : 'rgba(124,255,49,.55)';
    ctx.lineWidth = hot ? 9 : 5;
    ctx.stroke();
  });
  Object.values(s.joints).forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fill();
  });

  s.objs.forEach((o) => {
    if (o.bomb) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 130);
      ctx.beginPath();
      ctx.arc(o.x, o.y, FRUIT_R + 6 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,71,109,${0.45 + pulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.font = '76px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(o.emoji, 0, 4);
    ctx.restore();
  });
  s.rings.forEach((r) => {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,190,70,${Math.max(0, r.life * 1.6)})`;
    ctx.lineWidth = 8;
    ctx.stroke();
  });
  s.parts.forEach((p) => {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  s.floats.forEach((f) => {
    ctx.font = `700 ${f.size || 40}px Kanit, sans-serif`;
    ctx.globalAlpha = Math.min(1, f.life * 1.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 50);
  });
  ctx.globalAlpha = 1;
  s.fists.forEach((f) => {
    if (!f.ok) return;
    f.trail.forEach((t, i) => {
      ctx.globalAlpha = (i / f.trail.length) * 0.35;
      ctx.fillStyle = '#7cff31';
      ctx.beginPath();
      ctx.arc(t.x, t.y, FIST_R * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, FIST_R, 0, Math.PI * 2);
    ctx.lineWidth = f.active ? 8 : 4;
    ctx.strokeStyle = f.active ? '#e9ffb0' : '#7cff31';
    ctx.shadowColor = '#7cff31';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  ctx.restore();
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,40,70,${s.flash * 0.38})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export default function GameMode() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const g = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | check | countdown | playing | over
  const [count, setCount] = useState(3);
  const [message, setMessage] = useState('');
  const [hud, setHud] = useState(HUD0);
  const [chk, setChk] = useState(CHK0);
  const [lost, setLost] = useState(false);
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(readBest);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { if (!user) navigate('/login'); });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { landmarkerRef.current?.close(); } catch { /* ปิดไม่ได้ก็ข้าม */ }
  }, []);

  const openCamera = async (isPortrait) => {
    // เบราว์เซอร์จะไม่ให้ใช้กล้องถ้าไม่ใช่ https หรือ localhost (navigator.mediaDevices จะเป็น undefined)
    if (!navigator.mediaDevices?.getUserMedia) {
      const e = new Error('mediaDevices unavailable');
      e.name = 'InsecureContext';
      throw e;
    }
    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', aspectRatio: { ideal: isPortrait ? 3 / 4 : 4 / 3 } }, audio: false,
      });
    }
    const v = videoRef.current;
    v.srcObject = streamRef.current;
    await v.play();
    if (!landmarkerRef.current) {
      setMessage('กำลังโหลดระบบตรวจจับท่าทาง...');
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try {
        landmarkerRef.current = await make('GPU');
      } catch (gpuErr) {
        // เครื่อง/เบราว์เซอร์ที่ใช้ GPU ไม่ได้ ให้ถอยไปใช้ CPU แทน
        console.warn('GPU delegate ใช้ไม่ได้ ลองใช้ CPU แทน', gpuErr);
        landmarkerRef.current = await make('CPU');
      }
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const begin = async () => {
    // มือถือ/iPad แนวตั้ง ใช้เวทีแนวตั้ง ส่วนจอแนวนอนใช้เวทีแนวนอน
    const isPortrait = window.innerHeight > window.innerWidth;
    setSize(isPortrait);
    setPortrait(isPortrait);
    setMessage('กำลังเปิดกล้อง...');
    setStatus('loading');
    try {
      await openCamera(isPortrait);
    } catch (err) {
      console.error('เปิดกล้องไม่สำเร็จ:', err);
      const name = err?.name || '';
      let msg;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        msg = 'ยังไม่ได้อนุญาตให้ใช้กล้อง กรุณากดอนุญาตกล้องในเบราว์เซอร์ (ไอคอนแม่กุญแจข้างช่องที่อยู่เว็บ) แล้วกดเริ่มใหม่';
      } else if (name === 'InsecureContext') {
        msg = 'เบราว์เซอร์ไม่อนุญาตให้ใช้กล้องบนที่อยู่นี้ ต้องเปิดผ่าน https:// หรือ localhost เท่านั้น';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        msg = 'ไม่พบกล้องในเครื่องนี้ ลองต่อกล้องแล้วกดเริ่มใหม่';
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        msg = 'เปิดกล้องไม่ได้ อาจมีแอปอื่นใช้กล้องอยู่ ปิดแอปนั้นแล้วลองใหม่';
      } else {
        msg = `เปิดกล้องหรือโหลดระบบตรวจจับไม่สำเร็จ (${name || err?.message || 'ไม่ทราบสาเหตุ'}) ต้องเชื่อมต่ออินเทอร์เน็ต ลองใหม่อีกครั้ง`;
      }
      stopCamera();
      setMessage(msg);
      setStatus('idle');
      return;
    }
    setMessage('');
    g.current = newGame();
    setChk(CHK0);
    setLost(false);
    setHud(HUD0);
    setStatus('check');
  };

  const cancelCheck = () => {
    clearInterval(timerRef.current);
    stopCamera();
    setStatus('idle');
  };

  const startCountdown = () => {
    let n = 3;
    setCount(n);
    setStatus('countdown');
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(timerRef.current);
      g.current = newGame();
      setHud(HUD0);
      setLost(false);
      setStatus('playing');
    }, 900);
  };

  const finish = (s, now) => {
    const top = Math.max(readBest(), s.score);
    try { localStorage.setItem(BEST_KEY, String(top)); } catch { /* storage optional */ }
    setBest(top);
    setResult({
      score: s.score, hits: s.hits, bombs: s.bombs, maxCombo: s.maxCombo,
      left: s.punches[0], right: s.punches[1],
      secs: Math.max(0, Math.round((now - s.startedAt - s.pausedMs) / 1000)),
      record: s.score > 0 && s.score >= top,
    });
    setStatus('over');
  };

  useEffect(() => {
    if (status !== 'check' && status !== 'countdown' && status !== 'playing') return undefined;
    let raf;
    let shown = HUD0;
    let shownChk = '';
    let shownLost = false;
    const ctx = canvasRef.current.getContext('2d');
    const loop = (now) => {
      const s = g.current;
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000);
      s.last = now;
      trackFists(s, videoRef.current, landmarkerRef.current, now);

      if (status === 'check') {
        // ขั้นตรวจท่าทาง: ต้องเห็นไหล่ ศอก มือทั้งสองข้าง และยืนในระยะที่เหมาะสมนิ่ง ๆ ก่อนเริ่ม
        const v = s.view;
        const ok = v.sh && v.el && v.wr && v.dist === 'ok';
        s.readyMs = ok ? s.readyMs + dt * 1000 : 0;
        const key = `${+v.sh}${+v.el}${+v.wr}${v.dist}${Math.floor(s.readyMs / 150)}`;
        if (key !== shownChk) {
          shownChk = key;
          setChk({ ...v, progress: Math.min(1, s.readyMs / READY_MS) });
        }
        render(ctx, s, now);
        if (s.readyMs >= READY_MS) { startCountdown(); return; }
      } else if (status === 'countdown') {
        render(ctx, s, now);
      } else {
        // กำลังเล่น: ถ้ามองไม่เห็นตัวผู้เล่น เกมจะหยุดชั่วคราว (ไม่นับเวลา ผลไม้ไม่ตก)
        s.lostMs = s.bodyOk ? 0 : s.lostMs + dt * 1000;
        const paused = s.lostMs > LOST_MS;
        if (paused !== shownLost) { shownLost = paused; setLost(paused); }
        if (paused) s.pausedMs += dt * 1000; else step(s, dt, now);
        render(ctx, s, now);
        if (s.score !== shown.score || s.lives !== shown.lives || s.combo !== shown.combo
          || s.punches[0] !== shown.l || s.punches[1] !== shown.r) {
          shown = { score: s.score, lives: s.lives, combo: s.combo, l: s.punches[0], r: s.punches[1] };
          setHud(shown);
        }
        if (s.lives <= 0) { finish(s, now); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const playing = status === 'playing';
  const diff = result ? Math.abs(result.left - result.right) : 0;
  const total = result ? result.left + result.right : 0;
  const weaker = result && total >= 10 && diff / total > 0.3 ? (result.left > result.right ? 'ขวา' : 'ซ้าย') : null;
  const tip = chk.dist === 'none' ? 'ยังไม่เห็นตัวคุณ ยืนให้เห็นไหล่ทั้งสองข้าง'
    : chk.dist === 'far' ? 'ขยับเข้าใกล้กล้องอีกนิด'
      : chk.dist === 'near' ? 'ถอยห่างจากกล้องอีกหน่อย'
        : !(chk.el && chk.wr) ? 'ให้เห็นข้อศอกและมือทั้งสองข้างด้วย'
          : 'ดีมาก! ยืนนิ่ง ๆ สักครู่...';

  return (
    <div className="gm-page">
      <header className="gm-top">
        <button type="button" className="gm-back" onClick={() => navigate('/dashboard')}>‹ หน้าหลัก</button>
        <div className="gm-title">
          <h1>โหมดเกม · ชกผลไม้</h1>
          <p>ออกกำลังกายด้วยท่าต่อยหมัด ระบบตรวจจับท่าทางจากกล้อง</p>
        </div>
        <div className="gm-best">สถิติสูงสุด <b>{best}</b></div>
      </header>

      <div className="gm-stage" style={{ aspectRatio: portrait ? '3 / 4' : '4 / 3', '--ar': portrait ? 0.75 : 1.3333 }}>
        <video ref={videoRef} className={`gm-video${status !== 'idle' ? ' on' : ''}`} muted playsInline />
        <canvas ref={canvasRef} className="gm-canvas" width={portrait ? 720 : 960} height={portrait ? 960 : 720} />

        {playing && (
          <div className="gm-hud" aria-live="polite">
            <div className="gm-hearts" aria-label={`พลังชีวิต ${hud.lives} จาก ${MAX_LIVES}`}>
              {Array.from({ length: MAX_LIVES }, (_, i) => (
                <span key={i} className={i < hud.lives ? '' : 'lost'}>❤</span>
              ))}
            </div>
            <div className="gm-score">{hud.score}</div>
            <div className="gm-side">
              <div className={`gm-combo${hud.combo >= 5 ? ' hot' : ''}`}>{hud.combo >= 2 ? `คอมโบ ${hud.combo}` : ''}</div>
              <div className="gm-lr">หมัดซ้าย {hud.l} · ขวา {hud.r}</div>
            </div>
          </div>
        )}

        {playing && (
          <button type="button" className="gm-end" onClick={() => finish(g.current, performance.now())}>จบเกม</button>
        )}

        {playing && lost && (
          <div className="gm-overlay dim">
            <h2>หยุดชั่วคราว</h2>
            <p>มองไม่เห็นตัวคุณ ยืนให้เห็นไหล่ทั้งสองข้างเพื่อเล่นต่อ</p>
          </div>
        )}

        {status === 'idle' && (
          <div className="gm-overlay">
            <h2>พร้อมออกกำลังกายหรือยัง?</h2>
            <ul className="gm-rules">
              <li>ยืนห่างกล้องประมาณ 1.5–2 เมตร ให้เห็นตั้งแต่ศีรษะถึงเอว และเห็นแขนทั้งสองข้าง</li>
              <li>ต้องชกหมัดจริง งอแขนแล้วชกออกไปให้เหยียดตรง ผลไม้ถึงจะแตก (แค่เอามือไปโดนหรือปัดมือไม่แตก) ได้ 10 คะแนน ต่อเนื่องจะได้คะแนนคูณ</li>
              <li>ห้ามต่อยโดนระเบิด 💣 โดนแล้วเสียหัวใจ 1 ดวง (มี {MAX_LIVES} ดวง) หมดเมื่อไหร่เกมจบทันที</li>
              <li>ก้าวเท้าซ้าย-ขวาตามตำแหน่งผลไม้ และสลับแขนให้สมดุลกัน</li>
              <li>วอร์มไหล่และแขนก่อนเล่น หากรู้สึกเจ็บหรือเวียนศีรษะให้หยุดพักทันที</li>
              <li>ภาพจากกล้องถูกประมวลผลบนเครื่องของคุณเท่านั้น</li>
            </ul>
            {message && <p className="gm-msg" role="alert">{message}</p>}
            <div className="gm-actions">
              <button type="button" className="gm-btn primary" onClick={begin}>เริ่มเกม (เปิดกล้อง)</button>
            </div>
          </div>
        )}

        {status === 'loading' && <div className="gm-overlay"><p className="gm-msg">{message || 'กำลังเตรียมเกม...'}</p></div>}

        {status === 'check' && (
          <div className="gm-check">
            <h2>ยืนให้เห็นตัวตามนี้</h2>
            <div className="gm-chips">
              <span className={`gm-chip${chk.sh ? ' ok' : ''}`}>{chk.sh ? '✓' : '○'} ไหล่</span>
              <span className={`gm-chip${chk.el ? ' ok' : ''}`}>{chk.el ? '✓' : '○'} ข้อศอก</span>
              <span className={`gm-chip${chk.wr ? ' ok' : ''}`}>{chk.wr ? '✓' : '○'} มือ</span>
              <span className={`gm-chip${chk.dist === 'ok' ? ' ok' : ''}`}>{chk.dist === 'ok' ? '✓' : '○'} ระยะห่าง</span>
            </div>
            <div className="gm-bar" aria-hidden="true"><i style={{ width: `${Math.round(chk.progress * 100)}%` }} /></div>
            <p className="gm-tip" role="status">{tip}</p>
            <button type="button" className="gm-btn" onClick={cancelCheck}>ยกเลิก</button>
          </div>
        )}

        {status === 'countdown' && (
          <div className="gm-overlay dim"><div className="gm-count" key={count}>{count}</div><p>ยกการ์ดขึ้น แล้วชกให้สุดแขน!</p></div>
        )}

        {status === 'over' && result && (
          <div className="gm-overlay">
            <h2>จบเกม</h2>
            <div className="gm-final">{result.score}</div>
            <p className="gm-sub">{result.record ? 'สถิติใหม่!' : `คะแนนรอบนี้ · สถิติสูงสุด ${best}`}</p>
            <div className="gm-stats">
              <div><b>{result.hits}</b><span>ผลไม้ที่ต่อยแตก</span></div>
              <div><b>{result.left}</b><span>หมัดซ้าย</span></div>
              <div><b>{result.right}</b><span>หมัดขวา</span></div>
              <div><b>{result.maxCombo}</b><span>คอมโบสูงสุด</span></div>
              <div><b>{result.bombs}</b><span>โดนระเบิด</span></div>
              <div><b>{result.secs}</b><span>วินาทีที่ออกกำลัง</span></div>
            </div>
            {weaker && <p className="gm-sub">รอบนี้ใช้แขน{weaker}น้อยกว่าอย่างชัดเจน รอบหน้าลองสลับแขนให้สมดุลขึ้น</p>}
            <div className="gm-actions">
              <button type="button" className="gm-btn primary" onClick={begin}>เล่นอีกครั้ง</button>
              <button type="button" className="gm-btn" onClick={() => navigate('/dashboard')}>กลับหน้าหลัก</button>
            </div>
          </div>
        )}
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600&display=swap');
.gm-page { min-height:100vh; padding:18px 16px 32px; display:flex; flex-direction:column; align-items:center; gap:14px; background:radial-gradient(circle at 70% 0%,rgba(50,255,100,.07),transparent 40%),#020609; color:#eef6f1; font-family:'Anuphan',sans-serif; }
.gm-top { width:min(960px,100%); display:flex; align-items:center; gap:14px; }
.gm-back { min-height:44px; padding:0 16px; border:1px solid #2a5360; border-radius:10px; background:transparent; color:inherit; font-size:14px; cursor:pointer; transition:border-color .2s, color .2s, transform .15s; }
.gm-back:hover { border-color:#7cff31; color:#7cff31; }
.gm-back:active { transform:scale(.96); }
.gm-title { flex:1; min-width:0; }
.gm-title h1 { margin:0; font:600 26px/1.2 'Kanit',sans-serif; }
.gm-title p { margin:2px 0 0; font-size:13px; color:#9fb4b8; }
.gm-best { font-size:13px; color:#9fb4b8; white-space:nowrap; }
.gm-best b { margin-left:4px; font:600 20px 'Kanit',sans-serif; color:#c6ff38; }
.gm-stage { position:relative; width:min(960px,100%); width:min(960px,100%,calc((100vh - 112px) * var(--ar,1.3333))); width:min(960px,100%,calc((100dvh - 112px) * var(--ar,1.3333))); min-width:min(280px,100%); aspect-ratio:4/3; overflow:hidden; border:1px solid #1f6d6a; border-radius:16px; background:linear-gradient(160deg,#07161a,#030b0e); user-select:none; box-shadow:0 0 28px rgba(80,255,120,.08); }
.gm-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); opacity:0; }
.gm-video.on { opacity:.9; }
.gm-canvas { position:absolute; inset:0; width:100%; height:100%; }
.gm-hud { position:absolute; inset:0 0 auto 0; padding:14px 18px; display:grid; grid-template-columns:1fr auto 1fr; align-items:start; pointer-events:none; }
.gm-hearts { display:flex; gap:6px; font-size:32px; line-height:1; color:#ff476d; text-shadow:0 0 12px rgba(255,71,109,.6); }
.gm-hearts .lost { color:#3a4a50; text-shadow:none; }
.gm-score { font:700 46px/1 'Kanit',sans-serif; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.7); }
.gm-side { justify-self:end; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.gm-combo { font:600 20px 'Kanit',sans-serif; color:#e9ffb0; text-shadow:0 2px 10px rgba(0,0,0,.7); min-height:1em; }
.gm-combo.hot { color:#ffd24a; }
.gm-lr { font-size:13px; color:#dff1ec; text-shadow:0 2px 10px rgba(0,0,0,.8); }
.gm-end { position:absolute; right:12px; bottom:12px; min-height:38px; padding:0 16px; border:1px solid rgba(255,255,255,.28); border-radius:10px; background:rgba(2,8,10,.55); color:#eef6f1; font:500 13px 'Anuphan',sans-serif; cursor:pointer; transition:border-color .2s, transform .15s; }
.gm-end:hover { border-color:#ff6b81; }
.gm-end:active { transform:scale(.95); }
.gm-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:20px; text-align:center; background:rgba(2,8,10,.82); }
.gm-overlay.dim { background:rgba(2,8,10,.45); }
.gm-overlay h2 { margin:0; font:600 32px 'Kanit',sans-serif; }
.gm-overlay p { margin:0; }
.gm-rules { margin:0; padding:0; list-style:none; display:grid; gap:7px; max-width:520px; font-size:14px; line-height:1.5; color:#dfe8e6; }
.gm-msg { max-width:460px; font-size:14px; line-height:1.5; color:#ffb4c0; }
.gm-check { position:absolute; left:0; right:0; bottom:0; padding:28px 18px 18px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; background:linear-gradient(0deg,rgba(2,8,10,.94),rgba(2,8,10,.7) 70%,transparent); }
.gm-check h2 { margin:0; font:600 22px 'Kanit',sans-serif; }
.gm-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
.gm-chip { padding:6px 14px; border:1px solid #2a5360; border-radius:999px; font-size:13px; color:#9fb4b8; transition:border-color .2s, color .2s, background .2s; }
.gm-chip.ok { border-color:#7cff31; color:#c6ff38; background:rgba(124,255,49,.1); }
.gm-bar { width:min(320px,80%); height:8px; border-radius:99px; background:#12323a; overflow:hidden; }
.gm-bar i { display:block; height:100%; background:linear-gradient(90deg,#72ed2e,#baff3e); transition:width .15s; }
.gm-tip { margin:0; font-size:14px; color:#e9ffb0; }
.gm-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:4px; }
.gm-btn { min-height:46px; padding:0 24px; border:1px solid #2a5360; border-radius:12px; background:transparent; color:inherit; font:500 15px 'Anuphan',sans-serif; cursor:pointer; transition:transform .15s, box-shadow .2s, border-color .2s; }
.gm-btn:hover { border-color:#7cff31; }
.gm-btn:active { transform:scale(.95); }
.gm-btn.primary { border-color:transparent; background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; font-weight:700; }
.gm-btn.primary:hover { box-shadow:0 0 18px rgba(125,255,45,.45); }
.gm-btn:focus-visible, .gm-back:focus-visible, .gm-end:focus-visible { outline:2px solid #c6ff38; outline-offset:2px; }
.gm-count { font:700 140px/1 'Kanit',sans-serif; color:#c6ff38; text-shadow:0 0 30px rgba(110,255,50,.5); animation:gm-pop .8s ease-out both; }
@keyframes gm-pop { from { transform:scale(1.6); opacity:0; } 35% { opacity:1; } to { transform:scale(.9); opacity:.9; } }
.gm-final { font:700 80px/1 'Kanit',sans-serif; color:#c6ff38; }
.gm-sub { color:#9fb4b8; font-size:14px; max-width:460px; }
.gm-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; width:min(520px,100%); }
.gm-stats div { display:flex; flex-direction:column; gap:2px; padding:10px 6px; border:1px solid #1f4f55; border-radius:12px; }
.gm-stats b { font:600 24px 'Kanit',sans-serif; }
.gm-stats span { font-size:11.5px; color:#9fb4b8; }
@media (max-width:640px) {
  .gm-title h1 { font-size:20px; }
  .gm-title p, .gm-best { display:none; }
  .gm-score { font-size:34px; }
  .gm-hearts { font-size:24px; }
  .gm-lr { font-size:11px; }
  .gm-overlay { gap:10px; padding:14px; overflow-y:auto; }
  .gm-overlay:not(.dim) { justify-content:flex-start; }
  .gm-overlay h2 { font-size:25px; }
  .gm-rules { font-size:13px; }
  .gm-final { font-size:60px; }
  .gm-check { padding:20px 12px 12px; gap:8px; }
  .gm-check h2 { font-size:18px; }
}
@media (prefers-reduced-motion: reduce) { .gm-count { animation:none; } .gm-btn, .gm-back, .gm-end, .gm-bar i, .gm-chip { transition:none; } }
`;