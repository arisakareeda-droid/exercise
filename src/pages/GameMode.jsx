import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase';

// ติดตั้งก่อนใช้: npm i @mediapipe/tasks-vision@0.10.14  (ใช้เวอร์ชันเดียวกับ WASM ด้านล่าง)
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const BEST_KEY = 'fittrack-game-best';
const WEIGHT_KEY = 'fittrack-game-weight';
const ROOMS = 'fittrack_rooms'; // คอลเลกชัน Firestore สำหรับห้องแข่งกับเพื่อนจริง

let W = 960; // ขนาดแคนวาส: แนวนอน 960x720 / แนวตั้ง 720x960 (ตั้งค่าตอนเริ่มเกมในฟังก์ชัน setSize)
let H = 720;
const setSize = (w, h) => { W = w; H = h; }; // เรียกจาก ResizeObserver ให้สัดส่วนแคนวาสตรงกับพื้นที่เล่นจริง
const MAX_LIVES = 3;
const FRUIT_R = 50;
const FIST_R = 38;

// ---- รายการเกม: เพิ่มเกมใหม่ได้ที่นี่ (time = จำกัดเวลาเป็นวินาที, lives = จำนวนหัวใจ) ----
const GAMES = {
  fruit: { id: 'fruit', emoji: '🍉', name: 'ชกผลไม้', desc: 'แบบคลาสสิก มีหัวใจ 3 ดวง โดนระเบิดเสียหัวใจ หมดแล้วเกมจบ', lives: MAX_LIVES, time: 0 },
  time: { id: 'time', emoji: '⏱', name: 'ชกจับเวลา 60 วินาที', desc: 'ทำคะแนนให้มากที่สุดใน 60 วินาที ไม่มีหัวใจ แต่โดนระเบิดหักคะแนน 20', lives: 0, time: 60 },
};
// ตัวเร่งความเร็วผลไม้ที่ตก (v = ตัวคูณความเร็ว และเป็นตัวคูณคะแนนด้วย ยิ่งเร็วยิ่งได้แต้มเยอะ)
const SPEEDS = [{ v: 0.75, label: 'ช้า' }, { v: 1, label: 'ปกติ' }, { v: 1.5, label: 'เร็ว' }, { v: 2, label: 'เร็วมาก' }];
const LIVE_MS = 330; // ส่งภาพการเล่นของเราให้เพื่อนทุกกี่ ms
// บอทคู่แข่ง: rate = จำนวนครั้งที่ชกต่อวินาที, acc = โอกาสชกโดนผลไม้, bomb = โอกาสพลาดไปโดนระเบิด
const BOTS = {
  easy: { label: 'ง่าย', name: 'บอทมือใหม่', rate: 0.6, acc: 0.6, bomb: 0.08 },
  mid: { label: 'ปานกลาง', name: 'บอทนักชก', rate: 0.85, acc: 0.75, bomb: 0.05 },
  hard: { label: 'ยาก', name: 'บอทแชมป์', rate: 1.0, acc: 0.9, bomb: 0.025 },
};
const clampW = (w) => Math.min(200, Math.max(30, Number(w) || 60));
const mulberry = (a) => () => { // ตัวสุ่มแบบกำหนด seed ให้ผู้เล่นสองคนได้ลำดับผลไม้เหมือนกัน
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const newSeed = () => Math.floor(Math.random() * 2147483647);

// ---- Firestore: ห้องแข่งกับเพื่อนจริง ----
const roomDoc = (code) => doc(getFirestore(auth.app), ROOMS, code);
const myName = () => auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'ผู้เล่น';

// ---- ค่าตรวจจับหมัด (ปรับได้ถ้าต่อยโดนยากหรือง่ายเกินไป) ----
const PUNCH_EXT = 110;      // มุมข้อศอก (องศา) ที่ถือว่าเหยียดแขนพอ (เดิม 130) ลดอีกถ้ายังต่อยไม่ติด
const PUNCH_RISE = 12;      // แขนต้องเหยียดเพิ่มอย่างน้อยกี่องศาภายใน 0.6 วินาที (เดิม 25)
const PUNCH_WINDOW = 800;   // ms หลังชก ที่หมัดนั้นทำให้ผลไม้แตกได้ (เดิม 500)
const PUNCH_COOLDOWN = 200; // ms ระยะห่างขั้นต่ำระหว่างหมัดแต่ละครั้งของแขนเดียวกัน
const FAST_V = 1.5;         // มือที่เคลื่อนเร็วกว่านี้ (เท่าของความกว้างไหล่/วินาที) ก็ทำให้ผลไม้แตกได้ แม้ระบบยังไม่ยืนยันว่าเป็นหมัด ตั้งเป็น 99 ถ้าอยากปิด
const HIT_DIST = FRUIT_R * 0.8 + FIST_R; // ระยะที่ถือว่า 'มือแตะผลไม้' (ประมาณขอบวงกำปั้นแตะขอบผลไม้ที่เห็นบนจอ) เพิ่มตัวเลขถ้าอยากให้โดนง่ายขึ้น
const LOST_MS = 1200;       // มองไม่เห็นตัวนานเท่านี้ เกมจะหยุดชั่วคราว
const READY_MS = 1000;      // ต้องยืนอยู่ในตำแหน่งที่ถูกต้องนิ่ง ๆ นานเท่านี้ก่อนเริ่มนับถอยหลัง

const FRUITS = [
  ['🍎', '#ff4a4a'], ['🍊', '#ffa534'], ['🍉', '#ff5f7e'],
  ['🍌', '#ffe14a'], ['🍇', '#b073ff'], ['🍓', '#ff4f6d'], ['🍍', '#ffd24a'],
];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24]; // ไหล่ ศอก ข้อมือ สะโพก
const BONES = [[11, 12, null], [11, 13, 0], [13, 15, 0], [12, 14, 1], [14, 16, 1], [11, 23, null], [12, 24, null], [23, 24, null]];
const HUD0 = { score: 0, lives: MAX_LIVES, combo: 0, l: 0, r: 0, kcal: 0, t: 0 };
const CHK0 = { sh: false, el: false, wr: false, dist: 'none', progress: 0 };

const r3 = (n) => Math.round(n * 1000) / 1000;
const JI = Object.fromEntries(JOINTS.map((id, i) => [id, i]));
// ---- เชื่อมกล้องหากันแบบตรงระหว่างเครื่อง (WebRTC) โดยใช้ Firestore แลกข้อมูลจับคู่ ----
const ICE = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // รีเลย์สาธารณะสำหรับทดสอบ ใช้เมื่อสองเครื่องเชื่อมตรงกันไม่ได้ (เช่นคนละเครือข่ายมือถือ) ถ้าจะใช้งานจริงจัง ควรเปลี่ยนเป็น TURN ของคุณเอง
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
const rtcDoc = (code) => doc(getFirestore(auth.app), ROOMS, `${code}-rtc`);
const waitIce = (pc) => new Promise((resolve) => { // รอเก็บเส้นทางเชื่อมต่อครบ แล้วส่งไปทีเดียว
  if (pc.iceGatheringState === 'complete') { resolve(); return; }
  const t = setTimeout(resolve, 3500);
  pc.addEventListener('icegatheringstatechange', () => {
    if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
  });
});
let liveErr = ''; // ข้อผิดพลาดล่าสุดตอนส่ง/รับภาพการเล่น (ไว้บอกผู้เล่น)
const newView = () => ({ tgt: null, curJ: null, curF: null, recvAt: 0, last: 0, since: performance.now(), parts: [], floats: [], rings: [], flash: 0, seen: 0, init: false });
const liveDoc = (code, uid) => doc(getFirestore(auth.app), ROOMS, `${code}-live-${uid}`);

// แพ็กภาพการเล่น (โครงร่าง กำปั้น ผลไม้ เหตุการณ์ และค่าสถานะ) เป็นอาร์เรย์ตัวเลขแบน ๆ — Firestore ไม่รองรับอาร์เรย์ซ้อนอาร์เรย์
function packLive(s) {
  const j = [];
  JOINTS.forEach((i) => { const p = s.joints[i]; j.push(p ? r3(p.x / W) : -1, p ? r3(p.y / H) : -1); });
  const f = [];
  s.fists.forEach((ft) => f.push(ft.ok ? r3(ft.x / W) : -1, ft.ok ? r3(ft.y / H) : -1, ft.active ? 1 : 0));
  const o = []; // ผลไม้/ระเบิด ลูกละ 5 ค่า: ชนิด(-1=ระเบิด), x, y, ความเร็วตก, มุมหมุน
  s.objs.slice(0, 12).forEach((ob) => o.push(ob.bomb ? -1 : FRUITS.findIndex((fr) => fr[0] === ob.emoji), r3(ob.x / W), r3(ob.y / H), r3((ob.vy * s.speed) / H), r3(ob.rot)));
  const e = []; // เหตุการณ์ผลไม้แตก/โดนระเบิด เหตุการณ์ละ 6 ค่า: id, ชนิด(0=ผลไม้ 1=ระเบิด), x, y, คะแนน, ชนิดผลไม้
  s.evq.forEach((ev) => e.push(ev.id, ev.k, r3(ev.x / W), r3(ev.y / H), ev.v, ev.f));
  return {
    j, f, o, e, ar: r3(W / H), sc: s.score, lv: s.lives, cb: s.combo, kc: Math.round(s.kcal * 10) / 10,
    sp: s.speed, l: s.punches[0], r: s.punches[1], tm: s.cfg.time ? 1 : 0,
    t: s.cfg.time ? Math.max(0, Math.ceil(s.cfg.time - s.activeMs / 1000)) : 0,
  };
}

function easeArr(cur, tgt, a, stride) {
  if (!cur || cur.length !== tgt.length) return tgt.slice();
  for (let i = 0; i < tgt.length; i += 1) {
    if (stride === 3 && i % 3 === 2) cur[i] = tgt[i];
    else if (tgt[i] < 0 || cur[i] < 0) cur[i] = tgt[i];
    else cur[i] += (tgt[i] - cur[i]) * a;
  }
  return cur;
}

// เอฟเฟกต์ระเบิดฝั่งเพื่อน (สร้างซ้ำจากเหตุการณ์ที่เพื่อนส่งมา) ขนาดสเกลตามแคนวาส (u)
function oppSplash(v, x, y, color, n, u) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    v.parts.push({ x, y, vx: Math.cos(a) * sp * u, vy: (Math.sin(a) * sp - 120) * u, r: Math.max(1.5, (3 + Math.random() * 6) * u), life: 0.6 + Math.random() * 0.4, color });
  }
}

// วาดฝั่งเพื่อน: ภาพกล้องของเพื่อน (ถ้าเชื่อมได้) + โครงร่าง กำปั้น ผลไม้ ระเบิด และเอฟเฟกต์แตก/คะแนน เหมือนที่เพื่อนเห็นบนจอตัวเอง
function renderOpp(canvas, v, now, done, rv, conn) {
  if (!canvas) return;
  const bw = canvas.clientWidth || 320;
  const bh = canvas.clientHeight || 240;
  const k = Math.min(1, 720 / Math.max(bw, bh));
  const cw = Math.max(2, Math.round(bw * k));
  const ch = Math.max(2, Math.round(bh * k));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, cw, ch);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hasVideo = !!rv && rv.readyState >= 2 && rv.videoWidth > 0;
  const d = v.tgt;
  if (!d && !hasVideo) {
    ctx.fillStyle = '#c4d6da';
    ctx.font = `${Math.max(12, Math.round(cw * 0.035))}px Anuphan, sans-serif`;
    const msg = liveErr ? `รับ/ส่งข้อมูลกับเพื่อนไม่ได้ (${liveErr}) ตรวจกฎ Firestore`
      : conn === 'failed' ? 'เชื่อมต่อกล้องเพื่อนไม่สำเร็จ เครือข่ายอาจบล็อกการเชื่อมต่อตรง'
        : now - v.since > 8000 ? 'ยังไม่ได้รับภาพจากเพื่อน ให้เพื่อนวางไฟล์เวอร์ชันล่าสุดแล้วรีเฟรชหน้าเกม'
          : 'กำลังเชื่อมต่อกล้องเพื่อน...';
    ctx.fillText(msg, cw / 2, ch / 2, cw * 0.9);
    return;
  }
  const ar = d?.ar || (hasVideo ? rv.videoWidth / rv.videoHeight : 1.333);
  let rw = cw;
  let rh = cw / ar;
  if (rh > ch) { rh = ch; rw = ch * ar; }
  const ox = (cw - rw) / 2;
  const oy = (ch - rh) / 2;
  const u = Math.max(rw, rh) / 960;
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  ctx.fillRect(ox, oy, rw, rh);
  if (hasVideo) { // ครอปแบบ cover และกลับซ้ายขวา เหมือนที่เพื่อนเห็นตัวเอง
    const va = rv.videoWidth / rv.videoHeight;
    const ra = rw / rh;
    let sw; let sh; let sx; let sy;
    if (va > ra) { sh = rv.videoHeight; sw = sh * ra; sx = (rv.videoWidth - sw) / 2; sy = 0; }
    else { sw = rv.videoWidth; sh = sw / ra; sx = 0; sy = (rv.videoHeight - sh) / 2; }
    ctx.save();
    ctx.translate(ox + rw, oy);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(rv, sx, sy, sw, sh, 0, 0, rw, rh);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(124,255,49,.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, rw, rh);
  if (!d) return; // ยังไม่มีข้อมูลโครงร่าง/ผลไม้ แสดงแค่ภาพกล้อง
  const dt = Math.min(0.1, (now - (v.last || now)) / 1000);
  v.last = now;
  const a = Math.min(1, dt * 12);
  v.curJ = easeArr(v.curJ, d.j, a, 2);
  v.curF = easeArr(v.curF, d.f, a, 3);

  // เหตุการณ์ใหม่จากเพื่อน (ผลไม้แตก / โดนระเบิด) → ทำเอฟเฟกต์เหมือนฝั่งเพื่อน
  const ev = d.e || [];
  if (!v.init) { // ข้อมูลชุดแรกของรอบนี้: จำ id ล่าสุดไว้ ไม่เล่นเหตุการณ์เก่าซ้ำ
    v.init = true;
    for (let i = 0; i + 5 < ev.length; i += 6) v.seen = Math.max(v.seen, ev[i]);
  } else {
    for (let i = 0; i + 5 < ev.length; i += 6) {
      if (ev[i] <= v.seen) continue;
      v.seen = ev[i];
      const ex = ox + ev[i + 2] * rw;
      const ey = oy + ev[i + 3] * rh;
      if (ev[i + 1] === 1) {
        oppSplash(v, ex, ey, '#ffb02e', 18, u); oppSplash(v, ex, ey, '#ff4a2e', 10, u);
        v.rings.push({ x: ex, y: ey, r: 14 * u, life: 0.5 });
        v.floats.push({ x: ex, y: ey, text: d.tm ? '-20' : '-1 ❤', color: '#ff6b81', life: 1 });
        v.flash = 1;
      } else {
        oppSplash(v, ex, ey, FRUITS[ev[i + 5]]?.[1] || '#c6ff38', 14, u);
        v.floats.push({ x: ex, y: ey, text: `+${ev[i + 4]}`, color: '#c6ff38', life: 0.8 });
      }
    }
  }
  v.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * u * dt; p.life -= dt; });
  v.parts = v.parts.filter((p) => p.life > 0);
  v.floats.forEach((f) => { f.y -= 70 * u * dt; f.life -= dt; });
  v.floats = v.floats.filter((f) => f.life > 0);
  v.rings.forEach((r) => { r.r += 520 * u * dt; r.life -= dt; });
  v.rings = v.rings.filter((r) => r.life > 0);
  v.flash = Math.max(0, v.flash - dt * 2.5);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, rw, rh);
  ctx.clip();
  ctx.lineCap = 'round';
  BONES.forEach(([p, q, side]) => {
    const i = JI[p] * 2;
    const j = JI[q] * 2;
    if (v.curJ[i] < 0 || v.curJ[j] < 0) return;
    const hot = side != null && v.curF[side * 3 + 2] > 0.5; // แขนข้างที่เพิ่งชกเรืองสว่างเหมือนฝั่งเพื่อน
    ctx.beginPath();
    ctx.moveTo(ox + v.curJ[i] * rw, oy + v.curJ[i + 1] * rh);
    ctx.lineTo(ox + v.curJ[j] * rw, oy + v.curJ[j + 1] * rh);
    ctx.strokeStyle = hot ? 'rgba(233,255,176,.95)' : 'rgba(124,255,49,.6)';
    ctx.lineWidth = Math.max(3, (hot ? 9 : 5) * u);
    ctx.stroke();
  });
  for (let i = 0; i < v.curJ.length; i += 2) {
    if (v.curJ[i] < 0) continue;
    ctx.beginPath();
    ctx.arc(ox + v.curJ[i] * rw, oy + v.curJ[i + 1] * rh, Math.max(2, 6 * u), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fill();
  }
  if (!done) { // ผลไม้และระเบิดที่กำลังตกฝั่งเพื่อน
    const el = Math.min(0.6, (now - v.recvAt) / 1000);
    const o = d.o || [];
    ctx.font = `${Math.max(30, Math.round(76 * u))}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    for (let i = 0; i + 4 < o.length; i += 5) {
      const y = o[i + 2] + o[i + 3] * el;
      if (y > 1.1) continue;
      const px = ox + o[i + 1] * rw;
      const py = oy + y * rh;
      if (o[i] < 0) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 130);
        ctx.beginPath();
        ctx.arc(px, py, (FRUIT_R + 6 + pulse * 6) * u, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,71,109,${0.45 + pulse * 0.4})`;
        ctx.lineWidth = Math.max(2, 4 * u);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(o[i + 4] || 0);
      ctx.fillText(o[i] < 0 ? '💣' : (FRUITS[o[i]]?.[0] || '🍎'), 0, 4 * u);
      ctx.restore();
    }
  }
  v.rings.forEach((r) => {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,190,70,${Math.max(0, r.life * 1.6)})`;
    ctx.lineWidth = Math.max(3, 8 * u);
    ctx.stroke();
  });
  v.parts.forEach((p) => {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.max(14, Math.round(40 * u))}px Kanit, sans-serif`;
  v.floats.forEach((f) => {
    ctx.globalAlpha = Math.min(1, f.life * 1.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 50 * u);
  });
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i += 3) {
    if (v.curF[i] < 0) continue;
    ctx.beginPath();
    ctx.arc(ox + v.curF[i] * rw, oy + v.curF[i + 1] * rh, FIST_R * u, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, (v.curF[i + 2] ? 8 : 4) * u);
    ctx.strokeStyle = v.curF[i + 2] ? '#e9ffb0' : '#7cff31';
    ctx.shadowColor = '#7cff31';
    ctx.shadowBlur = 12 * Math.max(0.5, u);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (v.flash > 0) {
    ctx.fillStyle = `rgba(255,40,70,${v.flash * 0.38})`;
    ctx.fillRect(ox, oy, rw, rh);
  }
  ctx.restore();
}

const readBest = (game) => {
  try {
    return Number(localStorage.getItem(`${BEST_KEY}-${game}`)) || (game === 'fruit' ? Number(localStorage.getItem(BEST_KEY)) || 0 : 0);
  } catch { return 0; }
};
const readWeight = () => {
  try { return Number(localStorage.getItem(WEIGHT_KEY)) || 60; } catch { return 60; }
};

const newFist = () => ({ ok: false, x: 0, y: 0, v: 0, t: 0, trail: [], ext: null, hist: [], punchAt: -1e9, active: false });
const newBot = (lvl) => ({ p: BOTS[lvl] || BOTS.mid, score: 0, lives: MAX_LIVES, combo: 0, t: 0, next: 1, done: false });
const newGame = (o = {}) => ({
  objs: [], parts: [], floats: [], rings: [],
  score: 0, lives: GAMES[o.game]?.lives || MAX_LIVES, combo: 0, maxCombo: 0, hits: 0, bombs: 0,
  spawned: 0, bombStreak: 0, spawnIn: 700, flash: 0, shake: 0, evId: 0, evq: [],
  last: 0, activeMs: 0, pausedMs: 0, lostMs: 0, readyMs: 0, lastHint: 0,
  lastVideoTime: -1, pose: null, world: null, joints: {}, bodyOk: false,
  view: { sh: false, el: false, wr: false, dist: 'none' },
  punches: [0, 0], // จำนวนหมัดที่นับได้ [ซ้าย, ขวา]
  fists: [newFist(), newFist()],
  cfg: GAMES[o.game] || GAMES.fruit, mode: o.mode || 'solo',
  rng: mulberry(o.seed ?? newSeed()), speed: o.speed || 1,
  weight: o.weight || 60, kcal: 0,
  bot: o.mode === 'bot' ? newBot(o.botLvl) : null, syncAt: 0, sent: '', liveAt: 0, dcAt: 0,
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
      // วัดระยะห่างจากกล้องเป็นสัดส่วนของภาพวิดีโอ (ไม่ขึ้นกับการครอปตามขนาดจอ)
      const rawN = Math.hypot((lm[11].x - lm[12].x) * (video.videoWidth || 4), (lm[11].y - lm[12].y) * (video.videoHeight || 3)) / (video.videoWidth || 4);
      s.view = {
        sh: seen(11, 0.5) && seen(12, 0.5),
        el: seen(13, 0.5) && seen(14, 0.5),
        wr: seen(15, 0.5) && seen(16, 0.5),
        dist: rawN < 0.10 ? 'far' : rawN > 0.40 ? 'near' : 'ok',
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

const segDist = (px, py, ax, ay, bx, by) => { // ระยะจากจุด (px,py) ถึงเส้นตรง a→b
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function splash(s, o, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    s.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 3 + Math.random() * 6, life: 0.6 + Math.random() * 0.4, max: 1, color });
  }
}

// บอทจำลองการเล่น: ชกเป็นจังหวะ มีโอกาสโดนผลไม้/พลาด/โดนระเบิด ตามระดับความยาก
function botTick(b, dt, cfg) {
  if (b.done) return;
  b.t += dt;
  b.next -= dt;
  while (b.next <= 0 && !b.done) {
    b.next += (1 / b.p.rate) * (0.7 + Math.random() * 0.6);
    const r = Math.random();
    if (r < b.p.bomb) {
      b.combo = 0;
      if (cfg.time) b.score = Math.max(0, b.score - 20); else b.lives -= 1;
    } else if (r < b.p.bomb + b.p.acc * (1 - b.p.bomb)) {
      b.combo += 1;
      b.score += 10 * Math.min(4, 1 + Math.floor(b.combo / 5));
    } else b.combo = 0;
    if (!cfg.time && b.lives <= 0) b.done = true;
  }
  if ((cfg.time && b.t >= cfg.time) || b.t >= 180) b.done = true;
}

function step(s, dt, now) {
  // โหมดแข่งกับเพื่อนจริง ระดับความยากอิงจำนวนผลไม้ที่ออก (ไม่ใช่จำนวนที่ต่อยแตก) เพื่อให้สองคนได้ชุดผลไม้เหมือนกัน
  const level = 1 + Math.floor((s.mode === 'real' ? s.spawned / 10 : s.hits / 8));
  s.activeMs += dt * 1000;
  // แคลอรี่ = MET × น้ำหนัก(กก.) × ชั่วโมง ; MET เพิ่มตามความถี่หมัด (4 → 9)
  const ppm = (s.punches[0] + s.punches[1]) / Math.max(0.5, s.activeMs / 60000);
  s.kcal += (Math.min(9, 4 + ppm / 12) * s.weight * dt) / 3600;
  if (s.bot) botTick(s.bot, dt, s.cfg);

  s.spawnIn -= dt * 1000 * s.speed;
  if (s.spawnIn <= 0) {
    const r = s.rng; // สุ่มครบทุกค่าในลำดับเดิมเสมอ เพื่อให้ผลไม้ลูกที่ n ของทุกคนเหมือนกัน
    const [rBomb, rFruit, rX, rVy, rRot, rVr, rGap] = [r(), r(), r(), r(), r(), r(), r()];
    s.spawnIn = Math.max(460, 1050 - level * 60) * (0.8 + rGap * 0.5);
    const bomb = s.spawned >= 2 && s.bombStreak < 2 && rBomb < Math.min(0.32, 0.2 + level * 0.012);
    const fruit = FRUITS[Math.floor(rFruit * FRUITS.length)];
    s.objs.push({
      bomb, emoji: bomb ? '💣' : fruit[0], color: fruit[1],
      x: 90 + rX * (W - 180), y: -60,
      vy: 170 + level * 24 + rVy * 50, rot: rRot * 6, vr: (rVr - 0.5) * 3,
    });
    s.bombStreak = bomb ? s.bombStreak + 1 : 0;
    s.spawned += 1;
  }
  s.objs.forEach((o) => { o.y += o.vy * s.speed * dt; o.rot += o.vr * dt; });
  s.objs = s.objs.filter((o) => o.y < H + 80);

  s.fists.forEach((f) => {
    if (!f.ok) return;
    // เฉพาะผลไม้ที่มือข้างนี้แตะจริงเท่านั้น (นับรวมเส้นทางที่มือเพิ่งเคลื่อนผ่านในเฟรมนี้ กันมือเร็วทะลุผลไม้) และเลือกลูกที่ใกล้ที่สุด
    const pv = f.trail.length > 1 ? f.trail[f.trail.length - 2] : null;
    const ax = pv && Math.hypot(f.x - pv.x, f.y - pv.y) < 260 ? pv.x : f.x;
    const ay = pv && Math.hypot(f.x - pv.x, f.y - pv.y) < 260 ? pv.y : f.y;
    let i = -1;
    let bestD = HIT_DIST;
    s.objs.forEach((o, k) => {
      const d = segDist(o.x, o.y, ax, ay, f.x, f.y);
      if (d < bestD) { bestD = d; i = k; }
    });
    if (i < 0) return;
    if (!f.active && f.v <= FAST_V) {
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
      s.combo = 0; s.bombs += 1; s.flash = 1; s.shake = 0.4;
      splash(s, o, '#ffb02e', 26); splash(s, o, '#ff4a2e', 14);
      s.rings.push({ x: o.x, y: o.y, r: 20, life: 0.5 });
      if (s.cfg.time) {
        s.score = Math.max(0, s.score - 20);
        s.floats.push({ x: o.x, y: o.y, text: '-20', color: '#ff6b81', life: 1 });
      } else {
        s.lives -= 1;
        s.floats.push({ x: o.x, y: o.y, text: '-1 ❤', color: '#ff6b81', life: 1 });
      }
      s.evId += 1; s.evq.push({ id: s.evId, k: 1, x: o.x, y: o.y, v: 0, f: -1 }); if (s.evq.length > 6) s.evq.shift();
      try { navigator.vibrate?.(180); } catch { /* ไม่รองรับก็ข้าม */ }
    } else {
      s.combo += 1; s.maxCombo = Math.max(s.maxCombo, s.combo); s.hits += 1;
      const mult = Math.min(4, 1 + Math.floor(s.combo / 5));
      const pts = Math.round(10 * mult * s.speed); // ยิ่งเร่งความเร็ว ยิ่งได้คะแนนคูณ
      s.score += pts;
      splash(s, o, o.color, 18);
      s.floats.push({ x: o.x, y: o.y, text: `+${pts}`, color: '#c6ff38', life: 0.8 });
      s.evId += 1; s.evq.push({ id: s.evId, k: 0, x: o.x, y: o.y, v: pts, f: FRUITS.findIndex((fr) => fr[0] === o.emoji) }); if (s.evq.length > 6) s.evq.shift();
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
  const unsubRef = useRef(null); // ยกเลิกการฟังห้อง
  const roomMeta = useRef(null); // { code, isHost, uid }
  const roomData = useRef(null); // ข้อมูลห้องล่าสุดจาก Firestore
  const oppRef = useRef(null);
  const mine = useRef(null); // สถานะของเราที่เขียนลงห้อง
  const finalRef = useRef(null);
  const finishedRef = useRef(false);
  const pipRef = useRef(null); // แคนวาสมุมมองของเพื่อน
  const stageRef = useRef(null); // พื้นที่เล่นของเรา (ใช้วัดขนาดจริง)
  const remoteRef = useRef(null); // <video> ที่รับภาพกล้องของเพื่อน (ซ่อนไว้ แล้ววาดลงแคนวาสฝั่งเพื่อน)
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const pcStream = useRef(null);
  const rtcUnsub = useRef(null);
  const rtcMyId = useRef('');
  const rtcLastId = useRef('');
  const pendingOffer = useRef(null);
  const oppView = useRef(newView());
  const liveUnsub = useRef(null);
  const liveFor = useRef(null);
  const hadOpp = useRef(false); // เคยมีเพื่อนในห้องแล้ว (ใช้ตรวจว่าเพื่อนออกจากห้อง)

  // menu → idle(กติกา) → loading → check → [waiting] → countdown → playing → [waitend] → over
  const [status, setStatus] = useState('menu');
  const [menuStep, setMenuStep] = useState('game'); // game | mode | opp | room | lobby
  const [setup, setSetup] = useState(() => ({ game: 'fruit', mode: 'solo', botLvl: 'mid', weight: readWeight() }));
  const [speedIdx, setSpeedIdx] = useState(1);
  const [bests, setBests] = useState(() => ({ fruit: readBest('fruit'), time: readBest('time') }));
  const [room, setRoom] = useState(null);
  const [opp, setOpp] = useState(null);
  const [oppLive, setOppLive] = useState(null); // ค่าสถานะสดของเพื่อน (หัวใจ คอมโบ แคลอรี่ ความเร็ว ฯลฯ) ไว้โชว์เหมือนจอเรา
  const [joinCode, setJoinCode] = useState('');
  const [count, setCount] = useState(3);
  const [message, setMessage] = useState('');
  const [hud, setHud] = useState(HUD0);
  const [chk, setChk] = useState(CHK0);
  const [lost, setLost] = useState(false);
  const [result, setResult] = useState(null);
  const [dims, setDims] = useState({ w: 960, h: 720 });

  const statusRef = useRef(status); statusRef.current = status;
  const setupRef = useRef(setup); setupRef.current = setup;
  const speedRef = useRef(1); speedRef.current = SPEEDS[speedIdx].v;

  const mk = (extra = {}) => {
    const st = setupRef.current;
    return newGame({ ...st, weight: clampW(st.weight), speed: speedRef.current, ...extra });
  };

  // ให้แคนวาสมีสัดส่วนเท่าพื้นที่เล่นจริง (เต็มจอ แบ่งครึ่ง แนวตั้ง/แนวนอน) ตำแหน่งกำปั้นจึงตรงกับภาพกล้อง
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const apply = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      const r = width / height;
      const w = r >= 1 ? 960 : Math.round(960 * r);
      const h = r >= 1 ? Math.round(960 / r) : 960;
      if (w !== W || h !== H) { setSize(w, h); setDims({ w, h }); }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { if (!user) navigate('/login'); });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const bye = () => { try { leaveRoom(); } catch { /* ออกไม่ได้ก็ข้าม */ } };
    window.addEventListener('pagehide', bye); // ปิดแท็บ/รีเฟรช ให้เพื่อนรู้ว่าออกจากห้องแล้ว (ทำได้เท่าที่เบราว์เซอร์ให้เวลา)
    return () => {
      window.removeEventListener('pagehide', bye);
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { landmarkerRef.current?.close(); } catch { /* ปิดไม่ได้ก็ข้าม */ }
      leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เร่ง/ลดความเร็วผลไม้ด้วยปุ่มลูกศรบนคีย์บอร์ดได้ด้วย
  const changeSpeed = (i) => {
    const k = Math.max(0, Math.min(SPEEDS.length - 1, i));
    setSpeedIdx(k);
    if (g.current) g.current.speed = SPEEDS[k].v;
  };
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowUp') changeSpeed(speedIdx + 1);
      else if (e.key === 'ArrowDown') changeSpeed(speedIdx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, speedIdx]);

  // รอเพื่อนจริงเล่นจบ แล้วค่อยสรุปผล
  useEffect(() => {
    if (status === 'waitend' && opp?.done && finalRef.current) {
      setResult({ ...finalRef.current, opp });
      setStatus('over');
    }
  }, [status, opp]);

  // ---------- เชื่อมกล้องกับเพื่อน (WebRTC) ----------
  const closePeer = () => {
    try { dcRef.current?.close(); } catch { /* ปิดไม่ได้ก็ข้าม */ }
    try { pcRef.current?.close(); } catch { /* ปิดไม่ได้ก็ข้าม */ }
    dcRef.current = null;
    pcRef.current = null;
    pcStream.current = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
  };

  const makePeer = () => {
    closePeer();
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;
    pcStream.current = streamRef.current;
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    pc.ontrack = (ev) => {
      const v = remoteRef.current;
      if (!v) return;
      v.srcObject = ev.streams[0] || new MediaStream([ev.track]);
      v.play?.().catch(() => {});
    };
    return pc;
  };

  // ช่องข้อมูลตรงระหว่างเครื่อง ส่งโครงร่าง/ผลไม้ได้ถี่และลื่นกว่าผ่าน Firestore
  const wireDc = (dc) => {
    dcRef.current = dc;
    dc.onmessage = (e) => {
      try { oppView.current.tgt = JSON.parse(e.data); oppView.current.recvAt = performance.now(); } catch { /* ข้อมูลเสียก็ข้าม */ }
    };
  };

  const hostOffer = async () => {
    const m = roomMeta.current;
    if (!m?.isHost) return;
    const id = String(Date.now());
    rtcMyId.current = id;
    const pc = makePeer();
    wireDc(pc.createDataChannel('live', { ordered: false, maxRetransmits: 0 }));
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    if (pcRef.current !== pc) return; // เปลี่ยนรอบไปแล้ว
    await setDoc(rtcDoc(m.code), { id, offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, answer: null });
  };

  const guestAnswer = async (d) => {
    const m = roomMeta.current;
    if (!m || m.isHost || !streamRef.current || rtcLastId.current === d.id) return;
    rtcLastId.current = d.id;
    try {
      const pc = makePeer();
      pc.ondatachannel = (ev) => wireDc(ev.channel);
      await pc.setRemoteDescription(d.offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      if (pcRef.current !== pc) return;
      await updateDoc(rtcDoc(m.code), { answer: { id: d.id, type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (e) { rtcLastId.current = ''; console.warn('rtc answer', e); }
  };

  // เรียกหลังเปิดกล้องแล้ว: เจ้าของห้องส่งข้อเสนอเชื่อมต่อ ส่วนเพื่อนตอบกลับ
  const startRtc = () => {
    const m = roomMeta.current;
    if (!m || typeof RTCPeerConnection === 'undefined') return;
    const pc = pcRef.current;
    const alive = !!pc && pcStream.current === streamRef.current && !['closed', 'failed', 'disconnected'].includes(pc.connectionState);
    if (alive) return;
    if (m.isHost) hostOffer().catch((e) => console.warn('rtc offer', e));
    else { rtcLastId.current = ''; if (pendingOffer.current) guestAnswer(pendingOffer.current); }
  };

  // ---------- ห้องแข่งกับเพื่อนจริง ----------
  const pushMine = (patch) => {
    const m = roomMeta.current;
    if (!m) return;
    mine.current = { ...mine.current, ...patch };
    updateDoc(roomDoc(m.code), { [`p.${m.uid}`]: mine.current }).catch((e) => console.warn('sync', e));
  };

  const leaveRoom = () => {
    unsubRef.current?.();
    unsubRef.current = null;
    liveUnsub.current?.();
    liveUnsub.current = null;
    liveFor.current = null;
    const m = roomMeta.current;
    rtcUnsub.current?.();
    rtcUnsub.current = null;
    closePeer();
    pendingOffer.current = null;
    if (m) deleteDoc(liveDoc(m.code, m.uid)).catch(() => {});
    if (m?.isHost) deleteDoc(rtcDoc(m.code)).catch(() => {});
    roomMeta.current = null; roomData.current = null; oppRef.current = null; mine.current = null;
    hadOpp.current = false;
    setRoom(null);
    if (!m) return;
    if (m.isHost) deleteDoc(roomDoc(m.code)).catch(() => {});
    else updateDoc(roomDoc(m.code), { guest: null, guestName: '' }).catch(() => {});
  };

  const toMenu = (msg = '') => {
    clearInterval(timerRef.current);
    stopCamera();
    leaveRoom();
    g.current = null;
    setOpp(null); setOppLive(null); setResult(null); setMessage(msg);
    setJoinCode(''); // ไม่ค้างรหัสห้องเดิม
    setMenuStep('game'); setStatus('menu');
  };

  // เพื่อนออกจากห้อง: ปกติเด้งกลับเมนูทั้งคู่ แต่ถ้าอยู่หน้าสรุปผลอยู่ จะเก็บหน้าผลไว้ให้ดู แล้วออกจากห้องให้เงียบ ๆ
  const peerGone = (msg) => {
    const st = statusRef.current;
    if (st === 'over' || st === 'waitend') {
      leaveRoom();
      if (st === 'waitend' && finalRef.current) setResult({ ...finalRef.current, opp: null });
      setOpp(null); setOppLive(null); setJoinCode(''); setMessage(msg);
      statusRef.current = 'over';
      setStatus('over');
    } else toMenu(msg);
  };

  const listen = (code, isHost) => {
    unsubRef.current?.();
    const uid = auth.currentUser.uid;
    hadOpp.current = false;
    roomMeta.current = { code, isHost, uid };
    mine.current = { ready: false, score: 0, lives: 0, kcal: 0, done: false, out: false };
    rtcUnsub.current?.();
    pendingOffer.current = null; rtcLastId.current = ''; rtcMyId.current = '';
    rtcUnsub.current = onSnapshot(rtcDoc(code), (sn) => {
      if (!sn.exists()) return;
      const d = sn.data();
      if (isHost) {
        const pc = pcRef.current;
        if (d.answer && d.answer.id === rtcMyId.current && pc && pc.signalingState === 'have-local-offer') {
          pc.setRemoteDescription({ type: d.answer.type, sdp: d.answer.sdp }).catch((e) => console.warn('rtc remote', e));
        }
      } else if (d.offer) {
        pendingOffer.current = d;
        guestAnswer(d);
      }
    }, (e) => { liveErr = e?.code || 'rtc'; console.warn('rtc listen', e); });
    unsubRef.current = onSnapshot(roomDoc(code), (snap) => {
      if (!snap.exists()) { peerGone('เพื่อนออกจากห้องแล้ว'); return; }
      const d = snap.data();
      roomData.current = d;
      const oppUid = isHost ? d.guest : d.host;
      if (oppUid) hadOpp.current = true;
      else if (hadOpp.current) { peerGone('เพื่อนออกจากห้องแล้ว'); return; } // เพื่อนกดออก → เราเด้งออกด้วย
      const oppName = (isHost ? d.guestName : d.hostName) || 'เพื่อน';
      const p = oppUid ? d.p?.[oppUid] : null;
      setRoom({ code, isHost, joined: !!oppUid, oppName });
      const o = oppUid ? { name: oppName, score: p?.score || 0, done: !!p?.done, ready: !!p?.ready, out: !!p?.out } : null;
      oppRef.current = o;
      setOpp(o);
      if (oppUid && liveFor.current !== oppUid) { // ฟังภาพการเล่นของเพื่อน
        liveUnsub.current?.();
        liveFor.current = oppUid;
        liveUnsub.current = onSnapshot(liveDoc(code, oppUid), (sn) => {
          if (!sn.exists()) return;
          oppView.current.tgt = sn.data();
          oppView.current.recvAt = performance.now();
        }, (e) => { liveErr = e?.code || 'error'; console.warn('live recv', e); });
      }
      if (!isHost && d.game !== setupRef.current.game) setSetup((s) => ({ ...s, game: d.game }));
      if (isHost && oppUid && statusRef.current === 'menu') setStatus('idle'); // เพื่อนเข้าห้องแล้ว
      if (statusRef.current === 'waiting' && d.p?.[uid]?.ready && p?.ready) startCountdown(); // ทั้งคู่พร้อม
    }, (err) => {
      console.error(err);
      toMenu('เชื่อมต่อห้องไม่ได้ ตรวจสอบว่าเปิดใช้ Firestore และตั้งสิทธิ์อ่าน/เขียนแล้ว');
    });
  };

  const createRoom = async () => {
    setMessage('');
    const user = auth.currentUser;
    if (!user) return;
    try {
      let code = '';
      for (let i = 0; i < 6 && !code; i += 1) {
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!(await getDoc(roomDoc(c))).exists()) code = c;
      }
      if (!code) throw new Error('no-code');
      await setDoc(roomDoc(code), {
        host: user.uid, hostName: myName(), guest: null, guestName: '',
        game: setupRef.current.game, seed: newSeed(), createdAt: serverTimestamp(), p: {},
      });
      listen(code, true);
      setMenuStep('lobby');
    } catch (e) {
      console.error(e);
      setMessage('สร้างห้องไม่สำเร็จ ตรวจสอบว่าเปิดใช้ Firestore และตั้งสิทธิ์อ่าน/เขียนแล้ว');
    }
  };

  const joinRoom = async () => {
    setMessage('');
    const code = joinCode.trim();
    const user = auth.currentUser;
    if (!/^\d{4}$/.test(code)) { setMessage('ใส่รหัสห้อง 4 หลักของเพื่อน'); return; }
    try {
      await runTransaction(getFirestore(auth.app), async (tx) => {
        const snap = await tx.get(roomDoc(code));
        if (!snap.exists()) throw new Error('NOROOM');
        const d = snap.data();
        if (d.host === user.uid) throw new Error('SELF');
        if (d.guest && d.guest !== user.uid) throw new Error('FULL');
        tx.update(roomDoc(code), { guest: user.uid, guestName: myName() });
      });
      listen(code, false);
      setStatus('idle');
    } catch (e) {
      setMessage(e.message === 'NOROOM' ? 'ไม่พบห้องนี้ ตรวจรหัสอีกครั้ง'
        : e.message === 'FULL' ? 'ห้องนี้มีผู้เล่นครบแล้ว'
          : e.message === 'SELF' ? 'นี่คือห้องที่คุณสร้างเอง ให้เพื่อนเป็นคนใส่รหัส'
            : 'เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  // ---------- กล้อง ----------
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
    closePeer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const begin = async () => {
    // มือถือ/iPad แนวตั้ง ใช้เวทีแนวตั้ง ส่วนจอแนวนอนใช้เวทีแนวนอน
    const isPortrait = window.innerHeight > window.innerWidth;
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
    try { localStorage.setItem(WEIGHT_KEY, String(clampW(setupRef.current.weight))); } catch { /* storage optional */ }
    g.current = mk();
    finishedRef.current = false;
    oppView.current = newView();
    startRtc();
    if (roomMeta.current) {
      // เริ่มรอบใหม่: ล้างสถานะเดิมของเรา และให้เจ้าของห้องสุ่มชุดผลไม้ใหม่
      pushMine({ ready: false, score: 0, lives: 0, kcal: 0, done: false, out: false });
      if (roomMeta.current.isHost) updateDoc(roomDoc(roomMeta.current.code), { seed: newSeed() }).catch(() => {});
    }
    setChk(CHK0);
    setLost(false);
    setHud(HUD0);
    setStatus('check');
  };

  const cancelCheck = () => {
    clearInterval(timerRef.current);
    if (roomMeta.current) pushMine({ ready: false });
    stopCamera();
    setStatus('idle');
  };

  const startCountdown = () => {
    if (statusRef.current === 'countdown' || statusRef.current === 'playing') return;
    statusRef.current = 'countdown';
    let n = 3;
    setCount(n);
    setStatus('countdown');
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(timerRef.current);
      g.current = mk({ seed: setupRef.current.mode === 'real' ? roomData.current?.seed : undefined });
      finishedRef.current = false;
      oppView.current = newView();
      setOppLive(null);
      setHud(HUD0);
      setLost(false);
      if (setupRef.current.mode !== 'real') setOpp(null);
      setStatus('playing');
    }, 900);
  };

  // ตรวจท่าผ่านแล้ว: เล่นคนเดียว/บอทเริ่มนับถอยหลังเลย ส่วนเพื่อนจริงต้องรอให้อีกฝ่ายพร้อมด้วย
  const onReady = () => {
    if (setupRef.current.mode === 'real' && roomMeta.current) {
      statusRef.current = 'waiting';
      setStatus('waiting');
      pushMine({ ready: true });
    } else startCountdown();
  };

  const finish = (s) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const id = s.cfg.id;
    const top = Math.max(readBest(id), s.score);
    try { localStorage.setItem(`${BEST_KEY}-${id}`, String(top)); } catch { /* storage optional */ }
    setBests((b) => ({ ...b, [id]: top }));
    const total = s.punches[0] + s.punches[1];
    const res = {
      game: id, score: s.score, hits: s.hits, bombs: s.bombs, maxCombo: s.maxCombo,
      left: s.punches[0], right: s.punches[1], secs: Math.round(s.activeMs / 1000),
      kcal: s.kcal, ppm: Math.round(total / Math.max(1 / 60, s.activeMs / 60000)),
      weight: s.weight, record: s.score > 0 && s.score >= top, opp: null,
    };
    if (s.mode === 'bot') {
      // ให้บอทเล่นต่อจนจบ เพื่อเทียบผลสุดท้ายอย่างยุติธรรม
      const b = s.bot;
      for (let n = 0; !b.done && n < 5000; n += 1) botTick(b, 0.1, s.cfg);
      res.opp = { name: b.p.name, score: b.score, done: true };
    }
    if (s.mode === 'real' && roomMeta.current) {
      // โหมดมีหัวใจ: ใครหัวใจหมดก่อนแพ้ทันที อีกฝั่งชนะทันที (ไม่ต้องรอ ไม่เทียบคะแนน)
      const iOut = !!s.cfg.lives && s.lives <= 0;
      const oppOut = !!s.cfg.lives && (!!oppRef.current?.out || !!s.forceWin);
      pushMine({ score: s.score, lives: Math.max(0, s.lives), kcal: Math.round(s.kcal * 10) / 10, done: true, out: iOut && !oppOut });
      finalRef.current = res;
      const o = oppRef.current;
      if (iOut && !oppOut) { // เราแพ้ (หัวใจหมดก่อน)
        res.opp = { name: o?.name || 'เพื่อน', score: o?.score || 0, done: true };
        res.outcome = 'lose';
      } else if (oppOut && !iOut) { // เพื่อนแพ้ (หัวใจหมดก่อน) เราชนะทันที
        res.opp = { name: o?.name || 'เพื่อน', score: o?.score || 0, done: true };
        res.outcome = 'win';
      } else if (o?.done) res.opp = o;
      else { setResult(res); setStatus('waitend'); return; }
    }
    setResult(res);
    setStatus('over');
  };

  const skipWait = () => { setResult({ ...finalRef.current, opp: null }); setStatus('over'); };

  useEffect(() => {
    if (!['check', 'waiting', 'countdown', 'playing', 'waitend'].includes(status)) return undefined;
    let raf;
    let shown = HUD0;
    let shownChk = '';
    let shownLost = false;
    let shownBot = '';
    let oppKey = '';
    let oppAt = 0;
    const mirror = (now) => { // คัดค่าสถานะสดของเพื่อนขึ้นจอ (ไม่ถี่เกินไป)
      if (now - oppAt < 150) return;
      oppAt = now;
      const t = oppView.current.tgt;
      if (!t) return;
      const key = `${t.sc}|${t.lv}|${t.cb}|${t.kc}|${t.sp}|${t.l}|${t.r}|${t.t}`;
      if (key === oppKey) return;
      oppKey = key;
      setOppLive({ sc: t.sc, lives: t.lv, combo: t.cb, kcal: t.kc, speed: t.sp, l: t.l, r: t.r, t: t.t, tm: t.tm });
    };
    const ctx = canvasRef.current.getContext('2d');
    const loop = (now) => {
      if (status === 'waitend') { // เล่นจบแล้ว ยังดูเพื่อนเล่นต่อได้
        mirror(now);
        renderOpp(pipRef.current, oppView.current, now, oppRef.current?.done, remoteRef.current, pcRef.current?.connectionState);
        raf = requestAnimationFrame(loop);
        return;
      }
      const s = g.current;
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000);
      s.last = now;
      if (s.mode === 'real') { mirror(now); renderOpp(pipRef.current, oppView.current, now, oppRef.current?.done, remoteRef.current, pcRef.current?.connectionState); }
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
        if (s.readyMs >= READY_MS) { onReady(); return; }
      } else if (status === 'countdown' || status === 'waiting') {
        render(ctx, s, now);
      } else {
        // กำลังเล่น: ถ้ามองไม่เห็นตัวผู้เล่น เกมจะหยุดชั่วคราว (ไม่นับเวลา ผลไม้ไม่ตก)
        s.lostMs = s.bodyOk ? 0 : s.lostMs + dt * 1000;
        const paused = s.lostMs > LOST_MS;
        if (paused !== shownLost) { shownLost = paused; setLost(paused); }
        if (paused) s.pausedMs += dt * 1000; else step(s, dt, now);
        render(ctx, s, now);
        const t = s.cfg.time ? Math.max(0, Math.ceil(s.cfg.time - s.activeMs / 1000)) : 0;
        const kcal = Math.round(s.kcal * 10) / 10;
        if (s.score !== shown.score || s.lives !== shown.lives || s.combo !== shown.combo
          || s.punches[0] !== shown.l || s.punches[1] !== shown.r || kcal !== shown.kcal || t !== shown.t) {
          shown = { score: s.score, lives: s.lives, combo: s.combo, l: s.punches[0], r: s.punches[1], kcal, t };
          setHud(shown);
        }
        if (s.bot) {
          const k = `${s.bot.score}${s.bot.done}${s.bot.lives}`;
          if (k !== shownBot) { shownBot = k; setOpp({ name: s.bot.p.name, score: s.bot.score, done: s.bot.done, lives: s.bot.lives }); }
        }
        if (s.mode === 'real') {
          const dc = dcRef.current;
          if (dc && dc.readyState === 'open') {
            if (now - s.dcAt > 50) { s.dcAt = now; try { dc.send(JSON.stringify(packLive(s))); } catch { /* ส่งไม่ได้ก็ข้าม */ } }
          } else if (roomMeta.current && now - s.liveAt > LIVE_MS) {
            s.liveAt = now;
            setDoc(liveDoc(roomMeta.current.code, roomMeta.current.uid), packLive(s)).catch((e) => { liveErr = e?.code || 'error'; console.warn('live send', e); });
          }
        }
        if (s.mode === 'real' && now - s.syncAt > 700) {
          s.syncAt = now;
          const sig = `${s.score}|${s.lives}`;
          if (sig !== s.sent) { s.sent = sig; pushMine({ score: s.score, lives: s.lives, kcal: Math.round(s.kcal * 10) / 10 }); }
        }
        if (s.mode === 'real' && s.cfg.lives && s.lives > 0 && oppRef.current?.out) { s.forceWin = true; finish(s); return; }
        if (s.cfg.time ? s.activeMs >= s.cfg.time * 1000 : s.lives <= 0) { finish(s); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const game = GAMES[setup.game];
  const versus = setup.mode !== 'solo';
  const playing = status === 'playing';
  const camOn = status !== 'menu' && status !== 'idle';
  const immersive = ['check', 'waiting', 'countdown', 'playing', 'waitend'].includes(status); // ซ่อนหัวเรื่อง เล่นเต็มจอ
  const split = setup.mode !== 'solo' && immersive; // แบ่ง 2 ฝั่ง: เรา | เพื่อน/บอท
  const friendState = opp?.done ? 'จบแล้ว ✓' : status === 'playing' ? 'กำลังเล่น...' : opp?.ready ? 'พร้อมแล้ว' : 'กำลังเตรียมตัว...';
  const toggleFull = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } catch { /* เบราว์เซอร์ไม่รองรับก็ข้าม */ }
  };
  const best = bests[setup.game] || 0;
  const diff = result ? Math.abs(result.left - result.right) : 0;
  const total = result ? result.left + result.right : 0;
  const weaker = result && total >= 10 && diff / total > 0.3 ? (result.left > result.right ? 'ขวา' : 'ซ้าย') : null;
  const vs = result?.opp ? (result.outcome || (result.score > result.opp.score ? 'win' : result.score < result.opp.score ? 'lose' : 'draw')) : null;
  const modeLabel = setup.mode === 'solo' ? 'เล่นคนเดียว'
    : setup.mode === 'bot' ? `แข่งกับ ${BOTS[setup.botLvl].name}`
      : `แข่งกับเพื่อน · ห้อง ${room?.code || ''} · ${room?.joined ? room.oppName : 'กำลังรอเพื่อนเข้าห้อง...'}`;
  const tip = chk.dist === 'none' ? 'ยังไม่เห็นตัวคุณ ยืนให้เห็นไหล่ทั้งสองข้าง'
    : chk.dist === 'far' ? 'ขยับเข้าใกล้กล้องอีกนิด'
      : chk.dist === 'near' ? 'ถอยห่างจากกล้องอีกหน่อย'
        : !(chk.el && chk.wr) ? 'ให้เห็นข้อศอกและมือทั้งสองข้างด้วย'
          : 'ดีมาก! ยืนนิ่ง ๆ สักครู่...';

  return (
    <div className="gm-page">
      {!immersive && (
      <header className="gm-top">
        <button type="button" className="gm-back" onClick={() => navigate('/dashboard')}>‹ หน้าหลัก</button>
        <div className="gm-title">
          <h1>โหมดเกม · {game.name}</h1>
          <p>ออกกำลังกายด้วยท่าต่อยหมัด ระบบตรวจจับท่าทางจากกล้อง</p>
        </div>
        <button type="button" className="gm-back" onClick={toggleFull} aria-label="เต็มจอ">⛶</button>
        <div className="gm-best">สถิติสูงสุด <b>{best}</b></div>
      </header>
      )}

      <div className={`gm-wrap${split ? ' split' : ''}${immersive ? ' imm' : ''}`}>
      <div className="gm-stage" ref={stageRef}>
        <video ref={videoRef} className={`gm-video${camOn ? ' on' : ''}`} muted playsInline />
        <canvas ref={canvasRef} className="gm-canvas" width={dims.w} height={dims.h} />

        {playing && (
          <div className="gm-hud" aria-live="polite">
            {game.time ? (
              <div className="gm-timer" aria-label={`เหลือเวลา ${hud.t} วินาที`}>⏱ {hud.t}s</div>
            ) : (
              <div className="gm-hearts" aria-label={`พลังชีวิต ${hud.lives} จาก ${MAX_LIVES}`}>
                {Array.from({ length: MAX_LIVES }, (_, i) => (
                  <span key={i} className={i < hud.lives ? '' : 'lost'}>❤</span>
                ))}
              </div>
            )}
            <div className="gm-mid">
              <div className="gm-score">{hud.score}</div>
            </div>
            <div className="gm-side">
              <div className={`gm-combo${hud.combo >= 5 ? ' hot' : ''}`}>{hud.combo >= 2 ? `คอมโบ ${hud.combo}` : ''}</div>
              <div className="gm-kcal">🔥 {hud.kcal.toFixed(1)} kcal</div>
              <div className="gm-lr">หมัดซ้าย {hud.l} · ขวา {hud.r}</div>
            </div>
          </div>
        )}

        {playing && (
          <div className="gm-speed" role="group" aria-label="ความเร็วผลไม้ที่ตก (คะแนนคูณตามความเร็ว)">
            <span>ความเร็ว</span>
            {SPEEDS.map((sp, i) => (
              <button key={sp.v} type="button" className={i === speedIdx ? 'on' : ''} aria-pressed={i === speedIdx} onClick={() => changeSpeed(i)}>×{sp.v}</button>
            ))}
          </div>
        )}

        {playing && (
          <button type="button" className="gm-end" onClick={() => finish(g.current)}>จบเกม</button>
        )}

        {playing && lost && (
          <div className="gm-overlay dim">
            <h2>หยุดชั่วคราว</h2>
            <p>มองไม่เห็นตัวคุณ ยืนให้เห็นไหล่ทั้งสองข้างเพื่อเล่นต่อ</p>
          </div>
        )}

        {status === 'menu' && (
          <div className="gm-overlay">
            {menuStep === 'game' && (
              <>
                <h2>เลือกเกม</h2>
                <div className="gm-cards">
                  {Object.values(GAMES).map((gm) => (
                    <button key={gm.id} type="button" className="gm-card" onClick={() => { setSetup((s) => ({ ...s, game: gm.id })); setMessage(''); setMenuStep('mode'); }}>
                      <span className="gm-card-ico">{gm.emoji}</span>
                      <b>{gm.name}</b>
                      <small>{gm.desc}</small>
                      <small className="gm-card-best">สถิติสูงสุด {bests[gm.id]}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {menuStep === 'mode' && (
              <>
                <h2>{game.name}</h2>
                <p className="gm-sub">เลือกโหมดการเล่น</p>
                <div className="gm-cards">
                  <button type="button" className="gm-card" onClick={() => { setSetup((s) => ({ ...s, mode: 'solo' })); setMessage(''); setStatus('idle'); }}>
                    <span className="gm-card-ico">🧍</span><b>เล่นคนเดียว</b><small>ทำคะแนนให้สูงกว่าสถิติของตัวเอง</small>
                  </button>
                  <button type="button" className="gm-card" onClick={() => { setMessage(''); setMenuStep('opp'); }}>
                    <span className="gm-card-ico">👥</span><b>แข่งกับเพื่อน</b><small>เลือกแข่งกับบอทหรือเพื่อนตัวจริง</small>
                  </button>
                </div>
                <label className="gm-weight">
                  น้ำหนักตัว (กก.)
                  <input className="gm-input" type="number" inputMode="decimal" min="30" max="200" value={setup.weight} onChange={(e) => setSetup((s) => ({ ...s, weight: e.target.value }))} />
                </label>
                <p className="gm-note">ใช้คำนวณแคลอรี่ที่เผาผลาญระหว่างเล่น</p>
                <button type="button" className="gm-btn" onClick={() => setMenuStep('game')}>‹ ย้อนกลับ</button>
              </>
            )}

            {menuStep === 'opp' && (
              <>
                <h2>แข่งกับเพื่อน</h2>
                <p className="gm-sub">เล่นกับบอท เลือกระดับความยาก</p>
                <div className="gm-row">
                  {Object.entries(BOTS).map(([k, b]) => (
                    <button key={k} type="button" className="gm-btn" onClick={() => { setSetup((s) => ({ ...s, mode: 'bot', botLvl: k })); setMessage(''); setStatus('idle'); }}>🤖 {b.label}</button>
                  ))}
                </div>
                <p className="gm-sub">หรือเล่นกับเพื่อนตัวจริง</p>
                <button type="button" className="gm-btn primary" onClick={() => { setSetup((s) => ({ ...s, mode: 'real' })); setMessage(''); setMenuStep('room'); }}>🧑‍🤝‍🧑 เพื่อนตัวจริง (ใช้รหัสห้อง)</button>
                <button type="button" className="gm-btn" onClick={() => setMenuStep('mode')}>‹ ย้อนกลับ</button>
              </>
            )}

            {menuStep === 'room' && (
              <>
                <h2>เพื่อนตัวจริง</h2>
                <button type="button" className="gm-btn primary" onClick={createRoom}>สร้างห้อง</button>
                <p className="gm-sub">หรือใส่รหัสห้องที่เพื่อนสร้างไว้</p>
                <div className="gm-row">
                  <input className="gm-input" inputMode="numeric" maxLength={4} placeholder="รหัส 4 หลัก" aria-label="รหัสห้อง" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))} />
                  <button type="button" className="gm-btn" onClick={joinRoom}>เข้าห้อง</button>
                </div>
                <button type="button" className="gm-btn" onClick={() => { setJoinCode(''); setMessage(''); setMenuStep('opp'); }}>‹ ย้อนกลับ</button>
              </>
            )}

            {menuStep === 'lobby' && (
              <>
                <h2>รอเพื่อนเข้าห้อง</h2>
                <p className="gm-sub">บอกรหัสนี้ให้เพื่อน แล้วให้เพื่อนเลือก “เพื่อนตัวจริง → เข้าห้อง”</p>
                <div className="gm-code">{room?.code || '····'}</div>
                <button type="button" className="gm-btn" onClick={() => { leaveRoom(); setJoinCode(''); setMenuStep('room'); }}>ยกเลิกห้อง</button>
              </>
            )}

            {message && <p className="gm-msg" role="alert">{message}</p>}
          </div>
        )}

        {status === 'idle' && (
          <div className="gm-overlay">
            <h2>พร้อมออกกำลังกายหรือยัง?</h2>
            <p className="gm-sub">{game.emoji} {game.name} · {modeLabel}</p>
            <div className="gm-pick" role="group" aria-label="ระดับความเร็วผลไม้">
              <span>เลือกความเร็วผลไม้ก่อนเริ่ม (ยิ่งเร็ว คะแนนคูณตามความเร็ว)</span>
              <div className="gm-row">
                {SPEEDS.map((sp, i) => (
                  <button key={sp.v} type="button" aria-pressed={i === speedIdx} className={`gm-btn small${i === speedIdx ? ' primary' : ''}`} onClick={() => changeSpeed(i)}>{sp.label} ×{sp.v}</button>
                ))}
              </div>
            </div>
            <ul className="gm-rules">
              <li>ยืนห่างกล้องประมาณ 1.5–2 เมตร ให้เห็นตั้งแต่ศีรษะถึงเอว และเห็นแขนทั้งสองข้าง</li>
              <li>ต้องชกหมัดจริง งอแขนแล้วชกออกไปให้เหยียดตรง ผลไม้ถึงจะแตก (แค่เอามือไปโดนหรือปัดมือไม่แตก) ได้ 10 คะแนน ต่อเนื่องจะได้คะแนนคูณ</li>
              {game.time
                ? <li>มีเวลา {game.time} วินาที ห้ามต่อยโดนระเบิด 💣 โดนแล้วถูกหักคะแนน 20</li>
                : <li>ห้ามต่อยโดนระเบิด 💣 โดนแล้วเสียหัวใจ 1 ดวง (มี {MAX_LIVES} ดวง) หมดเมื่อไหร่เกมจบทันที</li>}
              <li>ระหว่างเล่นกดปุ่ม ×0.75 – ×2 (หรือลูกศรขึ้น/ลง) เพื่อเร่งความเร็วผลไม้ ยิ่งเร็วยิ่งได้คะแนนคูณ และเผาผลาญมากขึ้น</li>
              <li>ระบบจะนับแคลอรี่ที่เผาผลาญให้ตามน้ำหนักตัว {clampW(setup.weight)} กก. และความถี่ของหมัด</li>
              {versus && <li>แข่งกับ{setup.mode === 'bot' ? 'บอท' : 'เพื่อน'}: ใครได้คะแนนรวมมากกว่าชนะ{setup.mode === 'real' ? ' ผลไม้และระเบิดเรียงเหมือนกันทั้งสองฝั่ง' : ''}</li>}
              {setup.mode === 'real' && !game.time && <li>ถ้าใครหัวใจหมดก่อน คนนั้นแพ้ทันที เกมจบ และอีกฝั่งชนะเลยโดยไม่ต้องรอ</li>}
              <li>ก้าวเท้าซ้าย-ขวาตามตำแหน่งผลไม้ และสลับแขนให้สมดุลกัน</li>
              <li>วอร์มไหล่และแขนก่อนเล่น หากรู้สึกเจ็บหรือเวียนศีรษะให้หยุดพักทันที</li>
              <li>ภาพจากกล้องถูกประมวลผลบนเครื่องของคุณเท่านั้น{setup.mode === 'real' ? ' แต่ตอนแข่งกับเพื่อนตัวจริง ภาพกล้องของคุณจะถูกส่งตรงไปให้เพื่อนในห้องดูด้วย (และคุณก็เห็นกล้องเพื่อน)' : ''}</li>
            </ul>
            {message && <p className="gm-msg" role="alert">{message}</p>}
            <div className="gm-actions">
              <button type="button" className="gm-btn primary" onClick={begin} disabled={setup.mode === 'real' && !room?.joined}>เริ่มเกม (เปิดกล้อง)</button>
              <button type="button" className="gm-btn" onClick={() => toMenu()}>‹ เปลี่ยนเกม/โหมด</button>
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

        {status === 'waiting' && (
          <div className="gm-overlay dim">
            <h2>พร้อมแล้ว!</h2>
            <p>รอ{opp?.name || 'เพื่อน'}ยืนตำแหน่งให้พร้อม...</p>
            <button type="button" className="gm-btn" onClick={cancelCheck}>ยกเลิก</button>
          </div>
        )}

        {status === 'countdown' && (
          <div className="gm-overlay dim"><div className="gm-count" key={count}>{count}</div><p>ยกการ์ดขึ้น แล้วชกให้สุดแขน!</p></div>
        )}

        {status === 'waitend' && result && (
          <div className="gm-overlay">
            <h2>จบรอบของคุณแล้ว</h2>
            <div className="gm-final">{result.score}</div>
            <p className="gm-sub">รอ{opp?.name || 'เพื่อน'}เล่นจบ... ตอนนี้เพื่อนได้ {opp?.score ?? 0} คะแนน</p>
            <button type="button" className="gm-btn" onClick={skipWait}>ไม่รอแล้ว ดูผลของฉัน</button>
          </div>
        )}

        {status === 'over' && result && (
          <div className="gm-overlay gm-overlay-result">
            <div className={`gm-panel${vs ? ` ${vs}` : ''}`}>
              <h2 className="gm-result-title">{vs === 'win' ? '🏆 คุณชนะ!' : vs === 'lose' ? 'คุณแพ้ในรอบนี้' : vs === 'draw' ? '🤝 เสมอกัน' : 'จบเกม'}</h2>
              <div className="gm-final">{result.score}</div>
              <p className="gm-final-label">คะแนนของคุณ</p>
              {vs && (
                <p className={`gm-vs ${vs}`}>
                  {result.outcome === 'win' ? `${result.opp.name} หัวใจหมดก่อน คุณชนะทันที!`
                    : result.outcome === 'lose' ? 'หัวใจของคุณหมดก่อน เพื่อนชนะทันที'
                      : vs === 'win' ? 'ชนะด้วยคะแนนที่มากกว่า' : vs === 'lose' ? 'แพ้นิดเดียว สู้ใหม่อีกที!' : 'คะแนนเท่ากันพอดี'}
                  <span className="gm-vs-score">{result.opp.name} · {result.opp.score} คะแนน</span>
                </p>
              )}
              <p className="gm-sub">{result.record ? '🎉 สถิติใหม่!' : `สถิติสูงสุด ${bests[result.game] || 0}`}</p>
              <div className="gm-stats">
                <div className="hot"><b>{result.kcal.toFixed(1)}</b><span>แคลอรี่ที่เผาผลาญ (kcal)</span></div>
                <div><b>{result.hits}</b><span>ผลไม้ที่ต่อยแตก</span></div>
                <div><b>{result.left}</b><span>หมัดซ้าย</span></div>
                <div><b>{result.right}</b><span>หมัดขวา</span></div>
                <div><b>{result.ppm}</b><span>หมัดต่อนาที</span></div>
                <div><b>{result.maxCombo}</b><span>คอมโบสูงสุด</span></div>
                <div><b>{result.bombs}</b><span>โดนระเบิด</span></div>
                <div><b>{result.secs}</b><span>วินาทีที่ออกกำลัง</span></div>
              </div>
              <p className="gm-note">แคลอรี่เป็นค่าประมาณจากน้ำหนัก {result.weight} กก. เวลาที่เล่น และความถี่ของหมัด ไม่ใช่ค่าที่วัดได้จริง</p>
              {weaker && <p className="gm-tipbox">💡 รอบนี้ใช้แขน{weaker}น้อยกว่าอย่างชัดเจน รอบหน้าลองสลับแขนให้สมดุลขึ้น</p>}
              {message && <p className="gm-msg" role="alert">{message}</p>}
              <div className="gm-actions">
                <button type="button" className="gm-btn primary" onClick={begin} disabled={setup.mode === 'real' && !room?.joined}>เล่นอีกครั้ง</button>
                <button type="button" className="gm-btn" onClick={() => toMenu()}>เปลี่ยนเกม/โหมด</button>
                <button type="button" className="gm-btn" onClick={() => navigate('/dashboard')}>กลับหน้าหลัก</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {split && (
        <div className="gm-stage gm-friend">
          {setup.mode === 'real' ? (
            <>
              <canvas ref={pipRef} className="gm-canvas" />
              <div className="gm-fhud">
                <div className="gm-fname">{opp?.name || 'เพื่อน'}</div>
                <div className="gm-fscore">{opp?.done ? opp.score : (oppLive?.sc ?? opp?.score ?? 0)}</div>
                {!game.time && (
                  <div className="gm-hearts" aria-label={`พลังชีวิตเพื่อน ${opp?.out ? 0 : (oppLive?.lives ?? MAX_LIVES)}`}>
                    {Array.from({ length: MAX_LIVES }, (_, i) => (
                      <span key={i} className={i < (opp?.out ? 0 : (oppLive?.lives ?? MAX_LIVES)) ? '' : 'lost'}>❤</span>
                    ))}
                  </div>
                )}
                {game.time > 0 && oppLive && <div className="gm-ftimer">⏱ {oppLive.t}s</div>}
                <div className="gm-fstate">{friendState}</div>
              </div>
              {oppLive && (
                <div className="gm-fside">
                  {oppLive.combo >= 2 && <div className={`combo${oppLive.combo >= 5 ? ' hot' : ''}`}>คอมโบ {oppLive.combo}</div>}
                  <div className="kcal">🔥 {Number(oppLive.kcal || 0).toFixed(1)} kcal</div>
                  <div className="lr">หมัดซ้าย {oppLive.l} · ขวา {oppLive.r}</div>
                </div>
              )}
              {oppLive && <div className="gm-fspeed">ความเร็ว ×{oppLive.speed}</div>}
            </>
          ) : (
            <div className="gm-botcard">
              <span className="gm-bot-ico">🤖</span>
              <b>{BOTS[setup.botLvl].name}</b>
              <div className="gm-fscore">{opp?.score ?? 0}</div>
              {!game.time && (
                <div className="gm-hearts" aria-label={`พลังชีวิตบอท ${opp?.lives ?? MAX_LIVES}`}>
                  {Array.from({ length: MAX_LIVES }, (_, i) => (
                    <span key={i} className={i < (opp?.lives ?? MAX_LIVES) ? '' : 'lost'}>❤</span>
                  ))}
                </div>
              )}
              <div className="gm-fstate">{opp?.done ? 'จบแล้ว ✓' : status === 'playing' ? 'กำลังเล่น...' : 'พร้อมแล้ว'}</div>
            </div>
          )}
        </div>
      )}
      </div>

      <video ref={remoteRef} className="gm-rvideo" muted playsInline autoPlay />
      <style>{css}</style>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600&display=swap');
.gm-page { position:fixed; inset:0; height:100dvh; padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); display:flex; flex-direction:column; overflow:hidden; background:radial-gradient(circle at 70% 0%,rgba(50,255,100,.07),transparent 40%),#020609; color:#eef6f1; font-family:'Anuphan',sans-serif; }
.gm-top { display:flex; align-items:center; gap:12px; padding:10px 16px; }
.gm-wrap { flex:1; min-height:0; display:flex; flex-direction:row; gap:6px; padding:0 10px 10px; }
.gm-wrap.imm { padding:0; gap:3px; }
@media (orientation:portrait) { .gm-wrap { flex-direction:column; } }
.gm-back { min-height:44px; padding:0 16px; border:1px solid #4f8f9c; border-radius:10px; background:rgba(255,255,255,.06); color:#f4fbf7; font-size:14px; cursor:pointer; transition:border-color .2s, color .2s, transform .15s; }
.gm-back:hover { border-color:#7cff31; color:#7cff31; }
.gm-back:active { transform:scale(.96); }
.gm-title { flex:1; min-width:0; }
.gm-title h1 { margin:0; font:600 26px/1.2 'Kanit',sans-serif; }
.gm-title p { margin:2px 0 0; font-size:13px; color:#c4d6da; }
.gm-best { font-size:13px; color:#c4d6da; white-space:nowrap; }
.gm-best b { margin-left:4px; font:600 20px 'Kanit',sans-serif; color:#c6ff38; }
.gm-stage { position:relative; flex:1 1 0; min-width:0; min-height:0; overflow:hidden; border:1px solid #1f6d6a; border-radius:16px; background:linear-gradient(160deg,#07161a,#030b0e); user-select:none; box-shadow:0 0 28px rgba(80,255,120,.08); }
.gm-wrap.imm .gm-stage { border-radius:0; border-width:0; }
.gm-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); opacity:0; }
.gm-video.on { opacity:.9; }
.gm-canvas { position:absolute; inset:0; width:100%; height:100%; }
.gm-hud { position:absolute; inset:0 0 auto 0; padding:14px 18px; display:grid; grid-template-columns:1fr auto 1fr; align-items:start; pointer-events:none; }
.gm-hearts { display:flex; gap:4px; width:max-content; padding:4px 10px; border-radius:99px; background:rgba(2,8,10,.6); font-size:clamp(18px,5vmin,32px); line-height:1; color:#ff476d; text-shadow:0 0 12px rgba(255,71,109,.6); }
.gm-hearts .lost { color:rgba(255,255,255,.34); text-shadow:0 1px 3px rgba(0,0,0,.8); }
.gm-score { padding:4px 18px; border-radius:16px; background:rgba(2,8,10,.6); backdrop-filter:blur(6px); font:700 clamp(26px,7vmin,46px)/1 'Kanit',sans-serif; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.9); }
.gm-side { justify-self:end; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.gm-combo { padding:2px 12px; border-radius:99px; background:rgba(2,8,10,.6); font:600 20px 'Kanit',sans-serif; color:#e9ffb0; text-shadow:0 2px 8px rgba(0,0,0,.9); min-height:1em; }
.gm-combo:empty { display:none; }
.gm-combo.hot { color:#ffd24a; }
.gm-lr { padding:2px 10px; border-radius:99px; background:rgba(2,8,10,.6); font-size:13px; color:#f0faf6; text-shadow:0 1px 6px rgba(0,0,0,.9); }
.gm-end { position:absolute; right:12px; bottom:12px; min-height:38px; padding:0 16px; border:1px solid rgba(255,255,255,.28); border-radius:10px; background:rgba(2,8,10,.75); color:#f4fbf7; font:500 13px 'Anuphan',sans-serif; cursor:pointer; transition:border-color .2s, transform .15s; }
.gm-end:hover { border-color:#ff6b81; }
.gm-end:active { transform:scale(.95); }
.gm-overlay { color:#f4fbf7; position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:safe center; gap:14px; padding:20px; overflow-y:auto; text-align:center; background:rgba(2,8,10,.82); }
.gm-overlay.dim { background:rgba(2,8,10,.45); }
.gm-overlay h2 { margin:0; font:600 32px 'Kanit',sans-serif; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.6); }
.gm-overlay p { margin:0; }
.gm-rules { margin:0; padding:0; list-style:none; display:grid; gap:7px; max-width:520px; font-size:14px; line-height:1.5; color:#eaf3f0; }
.gm-msg { max-width:460px; font-size:14px; line-height:1.5; color:#ffc2cc; }
.gm-check { position:absolute; left:0; right:0; bottom:0; padding:28px 18px 18px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; background:linear-gradient(0deg,rgba(2,8,10,.94),rgba(2,8,10,.7) 70%,transparent); }
.gm-check h2 { margin:0; font:600 22px 'Kanit',sans-serif; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.8); }
.gm-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
.gm-chip { padding:6px 14px; border:1px solid #4f8f9c; border-radius:999px; font-size:13px; color:#c4d6da; transition:border-color .2s, color .2s, background .2s; }
.gm-chip.ok { border-color:#7cff31; color:#c6ff38; background:rgba(124,255,49,.1); }
.gm-bar { width:min(320px,80%); height:8px; border-radius:99px; background:#12323a; overflow:hidden; }
.gm-bar i { display:block; height:100%; background:linear-gradient(90deg,#72ed2e,#baff3e); transition:width .15s; }
.gm-tip { margin:0; font-size:14px; color:#e9ffb0; }
.gm-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:4px; }
.gm-btn { min-height:46px; padding:0 24px; border:1px solid #4f8f9c; border-radius:12px; background:rgba(255,255,255,.06); color:#f4fbf7; font:500 15px 'Anuphan',sans-serif; cursor:pointer; transition:transform .15s, box-shadow .2s, border-color .2s; }
.gm-btn:hover { border-color:#7cff31; }
.gm-btn:active { transform:scale(.95); }
.gm-btn.primary { border-color:transparent; background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; font-weight:700; }
.gm-btn.primary:hover { box-shadow:0 0 18px rgba(125,255,45,.45); }
.gm-btn:focus-visible, .gm-back:focus-visible, .gm-end:focus-visible { outline:2px solid #c6ff38; outline-offset:2px; }
.gm-count { font:700 clamp(72px,22vmin,140px)/1 'Kanit',sans-serif; color:#c6ff38; text-shadow:0 0 30px rgba(110,255,50,.5); animation:gm-pop .8s ease-out both; }
@keyframes gm-pop { from { transform:scale(1.6); opacity:0; } 35% { opacity:1; } to { transform:scale(.9); opacity:.9; } }
.gm-final { font:700 84px/1 'Kanit',sans-serif; color:#c6ff38; text-shadow:0 0 28px rgba(110,255,50,.35); }
.gm-sub { color:#c4d6da; font-size:14px; max-width:460px; }
.gm-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:10px; width:min(600px,100%); }
.gm-stats div { display:flex; flex-direction:column; gap:2px; padding:12px 6px; border:1px solid #3c7581; border-radius:14px; background:rgba(255,255,255,.05); }
.gm-stats b { font:600 26px 'Kanit',sans-serif; color:#fff; }
.gm-stats .hot b { color:#ffc58a; }
.gm-stats span { font-size:12.5px; color:#d3e2e5; }
.gm-btn:disabled { opacity:.4; cursor:not-allowed; }
.gm-friend { background:radial-gradient(circle at 50% 0%,rgba(124,255,49,.06),transparent 60%),#030b0e; }
.gm-fhud { position:absolute; left:50%; top:10px; transform:translateX(-50%); padding:6px 18px; border-radius:16px; background:rgba(2,8,10,.62); backdrop-filter:blur(6px); display:flex; flex-direction:column; align-items:center; gap:2px; pointer-events:none; text-shadow:0 2px 8px rgba(0,0,0,.9); }
.gm-fname { font-size:clamp(11px,2.4vmin,15px); color:#f0faf6; }
.gm-fscore { font:700 clamp(26px,7vmin,46px)/1 'Kanit',sans-serif; color:#ffd24a; }
.gm-fstate { font-size:clamp(10px,2.2vmin,13px); color:#c4d6da; }
.gm-botcard { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; }
.gm-bot-ico { font-size:clamp(48px,14vmin,96px); line-height:1; }
.gm-botcard b { font:600 clamp(16px,3.5vmin,24px) 'Kanit',sans-serif; }
.gm-wrap.split .gm-speed span, .gm-wrap.split .gm-lr { display:none; }
.gm-rvideo { position:absolute; width:2px; height:2px; opacity:0; pointer-events:none; }
.gm-btn.small { min-height:38px; padding:0 14px; font-size:13px; }
.gm-pick { display:flex; flex-direction:column; align-items:center; gap:8px; font-size:13px; color:#c4d6da; }
.gm-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; width:min(620px,100%); }
.gm-card { color:#f4fbf7; display:flex; flex-direction:column; align-items:center; gap:6px; padding:16px 14px; border:1px solid #4f8f9c; border-radius:14px; background:rgba(8,28,34,.85); font-family:inherit; text-align:center; cursor:pointer; transition:border-color .2s, transform .15s, box-shadow .2s; }
.gm-card:hover { border-color:#7cff31; box-shadow:0 0 16px rgba(125,255,45,.2); }
.gm-card:active { transform:scale(.97); }
.gm-card:focus-visible, .gm-input:focus-visible, .gm-speed button:focus-visible { outline:2px solid #c6ff38; outline-offset:2px; }
.gm-card-ico { font-size:38px; line-height:1; }
.gm-card b { font:600 18px 'Kanit',sans-serif; }
.gm-card small { font-size:12.5px; line-height:1.45; color:#c4d6da; }
.gm-card .gm-card-best { color:#c6ff38; }
.gm-row { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; }
.gm-input { width:140px; min-height:46px; padding:0 14px; border:1px solid #4f8f9c; border-radius:12px; background:rgba(8,28,34,.85); color:#f4fbf7; font:500 16px 'Anuphan',sans-serif; text-align:center; }
.gm-weight { display:flex; align-items:center; gap:10px; font-size:14px; color:#eaf3f0; }
.gm-weight .gm-input { width:96px; }
.gm-note { max-width:460px; font-size:12px; line-height:1.5; color:#a9bdc2; }
.gm-code { font:700 72px/1 'Kanit',sans-serif; letter-spacing:.12em; color:#c6ff38; text-shadow:0 0 24px rgba(110,255,50,.4); }
.gm-mid { display:flex; flex-direction:column; align-items:center; gap:4px; }
.gm-fhud .gm-hearts { padding:2px 8px; background:transparent; font-size:clamp(14px,3.6vmin,22px); }
.gm-ftimer { font:700 clamp(16px,3.6vmin,24px)/1 'Kanit',sans-serif; color:#ffd24a; }
.gm-fside { position:absolute; right:10px; top:10px; display:flex; flex-direction:column; align-items:flex-end; gap:4px; pointer-events:none; }
.gm-fside > div { padding:2px 10px; border-radius:99px; background:rgba(2,8,10,.7); font-size:clamp(10px,2.2vmin,13px); color:#f0faf6; text-shadow:0 1px 6px rgba(0,0,0,.9); }
.gm-fside .combo { font:600 clamp(13px,3vmin,18px) 'Kanit',sans-serif; color:#e9ffb0; }
.gm-fside .combo.hot { color:#ffd24a; }
.gm-fside .kcal { color:#ffc58a; }
.gm-wrap.split .gm-fside .lr { display:none; }
.gm-fspeed { position:absolute; left:10px; bottom:10px; padding:3px 10px; border-radius:99px; background:rgba(2,8,10,.7); font-size:clamp(10px,2.2vmin,12px); color:#f0faf6; pointer-events:none; }
.gm-opp { padding:3px 12px; border-radius:99px; background:rgba(2,8,10,.7); font-size:13px; color:#f0faf6; white-space:nowrap; }
.gm-opp b { margin-left:4px; font:600 16px 'Kanit',sans-serif; color:#ffd24a; }
.gm-timer { width:max-content; padding:6px 14px; border-radius:14px; background:rgba(2,8,10,.6); font:700 30px/1 'Kanit',sans-serif; color:#ffd24a; text-shadow:0 2px 10px rgba(0,0,0,.9); }
.gm-kcal { padding:2px 10px; border-radius:99px; background:rgba(2,8,10,.6); font-size:13px; color:#ffc58a; text-shadow:0 1px 6px rgba(0,0,0,.9); }
.gm-speed { position:absolute; left:12px; bottom:12px; display:flex; align-items:center; gap:4px; padding:4px 6px 4px 10px; border:1px solid rgba(255,255,255,.28); border-radius:12px; background:rgba(2,8,10,.75); font-size:12px; color:#f0faf6; }
.gm-speed button { min-width:42px; min-height:36px; border:1px solid transparent; border-radius:8px; background:transparent; color:#f4fbf7; font:600 13px 'Kanit',sans-serif; cursor:pointer; }
.gm-speed button.on { background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; }
.gm-vs { display:flex; flex-direction:column; align-items:center; gap:2px; font:600 21px 'Kanit',sans-serif; }
.gm-vs-score { font:500 14px 'Anuphan',sans-serif; color:#eaf3f0; }
.gm-vs.win { color:#d6ff5a; } .gm-vs.lose { color:#ffa3b3; } .gm-vs.draw { color:#ffe07a; }
.gm-overlay-result { background:rgba(2,8,10,.78); backdrop-filter:blur(8px); }
.gm-panel { display:flex; flex-direction:column; align-items:center; gap:12px; width:min(660px,100%); padding:26px 22px 22px; border:1px solid rgba(124,255,49,.4); border-radius:24px; background:linear-gradient(165deg,rgba(12,36,42,.97),rgba(4,15,19,.98)); box-shadow:0 18px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08); color:#f4fbf7; }
.gm-panel.win { border-color:rgba(198,255,56,.7); box-shadow:0 18px 60px rgba(0,0,0,.6), 0 0 40px rgba(124,255,49,.22); }
.gm-panel.lose { border-color:rgba(255,141,161,.6); box-shadow:0 18px 60px rgba(0,0,0,.6), 0 0 36px rgba(255,71,109,.18); }
.gm-panel.draw { border-color:rgba(255,210,74,.6); }
.gm-panel.lose .gm-final { color:#ffd0d8; text-shadow:0 0 24px rgba(255,71,109,.3); }
.gm-result-title { font:700 30px 'Kanit',sans-serif !important; }
.gm-final-label { margin:-6px 0 0; font-size:13px; color:#c4d6da; letter-spacing:.04em; }
.gm-tipbox { margin:0; max-width:480px; padding:10px 14px; border:1px solid rgba(255,210,74,.5); border-radius:12px; background:rgba(255,210,74,.1); font-size:13.5px; line-height:1.5; color:#fff1c2; }
@media (max-width:640px) {
  .gm-panel { padding:18px 14px 16px; gap:10px; border-radius:18px; }
  .gm-result-title { font-size:24px !important; }
  .gm-speed span { display:none; }
  .gm-code { font-size:52px; }
  .gm-timer { font-size:24px; }
  .gm-kcal { font-size:11px; }
  .gm-opp { font-size:11px; }
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