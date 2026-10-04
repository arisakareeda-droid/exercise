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
const PUNCH_SPEED = 1.1; // ความเร็วหมัดขั้นต่ำ (เท่าของความกว้างไหล่ต่อวินาที) — ลดเลขถ้าต่อยโดนยาก
const FRUITS = [
  ['🍎', '#ff4a4a'], ['🍊', '#ffa534'], ['🍉', '#ff5f7e'],
  ['🍌', '#ffe14a'], ['🍇', '#b073ff'], ['🍓', '#ff4f6d'], ['🍍', '#ffd24a'],
];

const readBest = () => {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
};

const newGame = () => ({
  objs: [], parts: [], floats: [], rings: [],
  score: 0, lives: MAX_LIVES, combo: 0, maxCombo: 0, hits: 0, bombs: 0,
  spawned: 0, bombStreak: 0, spawnIn: 700, flash: 0, shake: 0,
  last: 0, startedAt: performance.now(), lastVideoTime: -1, pose: null,
  fists: [0, 1].map(() => ({ ok: false, x: 0, y: 0, v: 0, t: 0, trail: [] })),
});

// แปลงพิกัดจากวิดีโอ (object-fit: cover + กลับซ้ายขวา) ไปเป็นพิกัดแคนวาส
function mapPoint(p, video) {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const k = Math.max(W / vw, H / vh);
  return { x: W - (p.x * vw * k + (W - vw * k) / 2), y: p.y * vh * k + (H - vh * k) / 2 };
}

function trackFists(s, video, landmarker, pointer, now) {
  let pts = [null, null];
  let shoulder = 240;
  if (pointer) {
    pts = [pointer, null];
  } else if (landmarker && video && video.readyState >= 2) {
    if (video.currentTime !== s.lastVideoTime) {
      s.lastVideoTime = video.currentTime;
      try { s.pose = landmarker.detectForVideo(video, now).landmarks?.[0] || null; } catch { s.pose = null; }
    }
    const lm = s.pose;
    if (lm) {
      const seen = (p) => p && (p.visibility ?? 1) > 0.3;
      if (seen(lm[11]) && seen(lm[12])) {
        const a = mapPoint(lm[11], video);
        const b = mapPoint(lm[12], video);
        shoulder = Math.max(80, Math.hypot(a.x - b.x, a.y - b.y));
      }
      pts = [[15, 19], [16, 20]].map(([wrist, index]) => {
        if (!seen(lm[wrist])) return null;
        const w = mapPoint(lm[wrist], video);
        if (!seen(lm[index])) return w;
        const f = mapPoint(lm[index], video);
        return { x: (w.x + f.x) / 2, y: (w.y + f.y) / 2 };
      });
    }
  }
  s.fists.forEach((f, i) => {
    const p = pts[i];
    if (!p) { f.ok = false; f.v = 0; f.trail.length = 0; return; }
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
  });
}

function splash(s, o, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    s.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 3 + Math.random() * 6, life: 0.6 + Math.random() * 0.4, max: 1, color });
  }
}

function step(s, dt) {
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
    if (!f.ok || f.v < PUNCH_SPEED) return;
    const i = s.objs.findIndex((o) => Math.hypot(o.x - f.x, o.y - f.y) < FRUIT_R + FIST_R);
    if (i < 0) return;
    const o = s.objs.splice(i, 1)[0];
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
  ctx.font = '700 40px Kanit, sans-serif';
  s.floats.forEach((f) => {
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
    ctx.lineWidth = f.v >= PUNCH_SPEED ? 8 : 4;
    ctx.strokeStyle = f.v >= PUNCH_SPEED ? '#e9ffb0' : '#7cff31';
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
  const modeRef = useRef('cam');
  const pointerRef = useRef(null);
  const timerRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | countdown | playing | over
  const [mode, setMode] = useState('cam');
  const [count, setCount] = useState(3);
  const [message, setMessage] = useState('');
  const [hud, setHud] = useState({ score: 0, lives: MAX_LIVES, combo: 0 });
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

  const begin = async (nextMode) => {
    // มือถือ/iPad แนวตั้ง ใช้เวทีแนวตั้ง ส่วนจอแนวนอนใช้เวทีแนวนอน
    const isPortrait = window.innerHeight > window.innerWidth;
    setSize(isPortrait);
    setPortrait(isPortrait);
    setMode(nextMode);
    modeRef.current = nextMode;
    pointerRef.current = null;
    setMessage(nextMode === 'cam' ? 'กำลังเปิดกล้อง...' : '');
    setStatus('loading');
    if (nextMode === 'cam') {
      try {
        await openCamera(isPortrait);
      } catch (err) {
        console.error('เปิดโหมดกล้องไม่สำเร็จ:', err);
        const name = err?.name || '';
        let msg;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          msg = 'ยังไม่ได้อนุญาตให้ใช้กล้อง กรุณากดอนุญาตกล้องในเบราว์เซอร์ (ไอคอนแม่กุญแจข้างช่องที่อยู่เว็บ) หรือเลือกเล่นด้วยเมาส์/นิ้วแทน';
        } else if (name === 'InsecureContext') {
          msg = 'เบราว์เซอร์ไม่อนุญาตให้ใช้กล้องบนที่อยู่นี้ ต้องเปิดผ่าน https:// หรือ localhost เท่านั้น หรือเลือกเล่นด้วยเมาส์/นิ้วแทน';
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          msg = 'ไม่พบกล้องในเครื่องนี้ ลองต่อกล้องแล้วเริ่มใหม่ หรือเลือกเล่นด้วยเมาส์/นิ้วแทน';
        } else if (name === 'NotReadableError' || name === 'AbortError') {
          msg = 'เปิดกล้องไม่ได้ อาจมีแอปอื่นใช้กล้องอยู่ ปิดแอปนั้นแล้วลองใหม่ หรือเลือกเล่นด้วยเมาส์/นิ้วแทน';
        } else {
          msg = `เปิดกล้องหรือโหลดระบบตรวจจับไม่สำเร็จ (${name || err?.message || 'ไม่ทราบสาเหตุ'}) ต้องเชื่อมต่ออินเทอร์เน็ต ลองใหม่อีกครั้ง หรือเลือกเล่นด้วยเมาส์/นิ้วแทน`;
        }
        // ปล่อยกล้องคืน เพื่อไม่ให้ไฟกล้องค้างตอนเปิดไม่สำเร็จ
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setMessage(msg);
        setStatus('idle');
        return;
      }
    }
    setMessage('');
    let n = 3;
    setCount(n);
    setStatus('countdown');
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(timerRef.current);
      g.current = newGame();
      setHud({ score: 0, lives: MAX_LIVES, combo: 0 });
      setStatus('playing');
    }, 900);
  };

  useEffect(() => {
    if (status !== 'playing') return undefined;
    let raf;
    let shown = { score: 0, lives: MAX_LIVES, combo: 0 };
    const ctx = canvasRef.current.getContext('2d');
    const loop = (now) => {
      const s = g.current;
      const dt = Math.min(0.05, (now - (s.last || now)) / 1000);
      s.last = now;
      trackFists(s, videoRef.current, landmarkerRef.current, modeRef.current === 'mouse' ? pointerRef.current : null, now);
      step(s, dt);
      render(ctx, s, now);
      if (s.score !== shown.score || s.lives !== shown.lives || s.combo !== shown.combo) {
        shown = { score: s.score, lives: s.lives, combo: s.combo };
        setHud(shown);
      }
      if (s.lives <= 0) {
        const top = Math.max(readBest(), s.score);
        try { localStorage.setItem(BEST_KEY, String(top)); } catch { /* storage optional */ }
        setBest(top);
        setResult({
          score: s.score, hits: s.hits, bombs: s.bombs, maxCombo: s.maxCombo,
          secs: Math.round((now - s.startedAt) / 1000), record: s.score > 0 && s.score >= top,
        });
        setStatus('over');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const onPointer = (e) => {
    if (modeRef.current !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const playing = status === 'playing';
  return (
    <div className="gm-page">
      <header className="gm-top">
        <button type="button" className="gm-back" onClick={() => navigate('/dashboard')}>‹ หน้าหลัก</button>
        <div className="gm-title">
          <h1>โหมดเกม · ชกผลไม้</h1>
          <p>ต่อยผลไม้ให้แตก หลบระเบิดให้ทัน</p>
        </div>
        <div className="gm-best">สถิติสูงสุด <b>{best}</b></div>
      </header>

      <div className="gm-stage" style={{ aspectRatio: portrait ? '3 / 4' : '4 / 3', '--ar': portrait ? 0.75 : 1.3333 }} onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => { pointerRef.current = null; }}>
        <video ref={videoRef} className={`gm-video${mode === 'cam' && status !== 'idle' ? ' on' : ''}`} muted playsInline />
        <canvas ref={canvasRef} className="gm-canvas" width={portrait ? 720 : 960} height={portrait ? 960 : 720} />

        {playing && (
          <div className="gm-hud" aria-live="polite">
            <div className="gm-hearts" aria-label={`พลังชีวิต ${hud.lives} จาก ${MAX_LIVES}`}>
              {Array.from({ length: MAX_LIVES }, (_, i) => (
                <span key={i} className={i < hud.lives ? '' : 'lost'}>❤</span>
              ))}
            </div>
            <div className="gm-score">{hud.score}</div>
            <div className={`gm-combo${hud.combo >= 5 ? ' hot' : ''}`}>{hud.combo >= 2 ? `คอมโบ ${hud.combo}` : ''}</div>
          </div>
        )}

        {status === 'idle' && (
          <div className="gm-overlay">
            <h2>พร้อมชกหรือยัง?</h2>
            <ul className="gm-rules">
              <li>ต่อยผลไม้ที่ตกลงมาให้แตก ได้ 10 คะแนน ต่อเนื่องจะได้คะแนนคูณ</li>
              <li>ห้ามต่อยโดนระเบิด 💣 โดนแล้วเสียหัวใจ 1 ดวง (มี {MAX_LIVES} ดวง)</li>
              <li>หัวใจหมดเมื่อไหร่ เกมจบทันที</li>
              <li>ยืนห่างจากกล้องให้เห็นตั้งแต่ไหล่ถึงมือทั้งสองข้าง</li>
            </ul>
            {message && <p className="gm-msg" role="alert">{message}</p>}
            <div className="gm-actions">
              <button type="button" className="gm-btn primary" onClick={() => begin('cam')}>เริ่มเกมด้วยกล้อง</button>
              <button type="button" className="gm-btn" onClick={() => begin('mouse')}>เล่นด้วยเมาส์/นิ้ว</button>
            </div>
          </div>
        )}

        {status === 'loading' && <div className="gm-overlay"><p className="gm-msg">{message || 'กำลังเตรียมเกม...'}</p></div>}

        {status === 'countdown' && (
          <div className="gm-overlay dim"><div className="gm-count" key={count}>{count}</div><p>เตรียมตัว ยกหมัดขึ้น!</p></div>
        )}

        {status === 'over' && result && (
          <div className="gm-overlay">
            <h2>เกมจบแล้ว</h2>
            <div className="gm-final">{result.score}</div>
            <p className="gm-sub">{result.record ? 'สถิติใหม่!' : `คะแนนรอบนี้ · สถิติสูงสุด ${best}`}</p>
            <div className="gm-stats">
              <div><b>{result.hits}</b><span>ผลไม้ที่ต่อยแตก</span></div>
              <div><b>{result.maxCombo}</b><span>คอมโบสูงสุด</span></div>
              <div><b>{result.bombs}</b><span>โดนระเบิด</span></div>
              <div><b>{result.secs}</b><span>วินาที</span></div>
            </div>
            <div className="gm-actions">
              <button type="button" className="gm-btn primary" onClick={() => begin(mode)}>เล่นอีกครั้ง</button>
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
.gm-stage { position:relative; width:min(960px,100%); width:min(960px,100%,calc((100vh - 112px) * var(--ar,1.3333))); width:min(960px,100%,calc((100dvh - 112px) * var(--ar,1.3333))); min-width:min(280px,100%); aspect-ratio:4/3; overflow:hidden; border:1px solid #1f6d6a; border-radius:16px; background:linear-gradient(160deg,#07161a,#030b0e); touch-action:none; user-select:none; box-shadow:0 0 28px rgba(80,255,120,.08); }
.gm-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); opacity:0; }
.gm-video.on { opacity:.9; }
.gm-canvas { position:absolute; inset:0; width:100%; height:100%; }
.gm-hud { position:absolute; inset:0 0 auto 0; padding:14px 18px; display:grid; grid-template-columns:1fr auto 1fr; align-items:start; pointer-events:none; }
.gm-hearts { display:flex; gap:6px; font-size:32px; line-height:1; color:#ff476d; text-shadow:0 0 12px rgba(255,71,109,.6); }
.gm-hearts .lost { color:#3a4a50; text-shadow:none; }
.gm-score { font:700 46px/1 'Kanit',sans-serif; color:#fff; text-shadow:0 2px 12px rgba(0,0,0,.7); }
.gm-combo { justify-self:end; font:600 20px 'Kanit',sans-serif; color:#e9ffb0; text-shadow:0 2px 10px rgba(0,0,0,.7); }
.gm-combo.hot { color:#ffd24a; }
.gm-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:20px; text-align:center; background:rgba(2,8,10,.82); }
.gm-overlay.dim { background:rgba(2,8,10,.45); }
.gm-overlay h2 { margin:0; font:600 32px 'Kanit',sans-serif; }
.gm-overlay p { margin:0; }
.gm-rules { margin:0; padding:0; list-style:none; display:grid; gap:7px; max-width:480px; font-size:14px; line-height:1.5; color:#dfe8e6; }
.gm-msg { max-width:460px; font-size:14px; line-height:1.5; color:#ffb4c0; }
.gm-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:4px; }
.gm-btn { min-height:46px; padding:0 24px; border:1px solid #2a5360; border-radius:12px; background:transparent; color:inherit; font:500 15px 'Anuphan',sans-serif; cursor:pointer; transition:transform .15s, box-shadow .2s, border-color .2s; }
.gm-btn:hover { border-color:#7cff31; }
.gm-btn:active { transform:scale(.95); }
.gm-btn.primary { border-color:transparent; background:linear-gradient(90deg,#72ed2e,#baff3e); color:#071005; font-weight:700; }
.gm-btn.primary:hover { box-shadow:0 0 18px rgba(125,255,45,.45); }
.gm-btn:focus-visible, .gm-back:focus-visible { outline:2px solid #c6ff38; outline-offset:2px; }
.gm-count { font:700 140px/1 'Kanit',sans-serif; color:#c6ff38; text-shadow:0 0 30px rgba(110,255,50,.5); animation:gm-pop .8s ease-out both; }
@keyframes gm-pop { from { transform:scale(1.6); opacity:0; } 35% { opacity:1; } to { transform:scale(.9); opacity:.9; } }
.gm-final { font:700 80px/1 'Kanit',sans-serif; color:#c6ff38; }
.gm-sub { color:#9fb4b8; font-size:14px; }
.gm-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; width:min(520px,100%); }
.gm-stats div { display:flex; flex-direction:column; gap:2px; padding:10px 6px; border:1px solid #1f4f55; border-radius:12px; }
.gm-stats b { font:600 24px 'Kanit',sans-serif; }
.gm-stats span { font-size:11.5px; color:#9fb4b8; }
@media (max-width:640px) {
  .gm-title h1 { font-size:20px; }
  .gm-title p, .gm-best { display:none; }
  .gm-score { font-size:34px; }
  .gm-hearts { font-size:24px; }
  .gm-overlay { gap:10px; padding:14px; overflow-y:auto; }
  .gm-overlay h2 { font-size:25px; }
  .gm-rules { font-size:13px; }
  .gm-final { font-size:60px; }
  .gm-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (prefers-reduced-motion: reduce) { .gm-count { animation:none; } .gm-btn, .gm-back { transition:none; } }
`;