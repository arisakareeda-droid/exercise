import React, { useState } from "react";

/* =====================================================================
   BodyMap — แผนผังร่างกายคนจริง (หน้า / หลัง / ข้าง) กดเลือกกล้ามเนื้อได้
   - เลือกส่วนไหน กล้ามเนื้อส่วนนั้นเรืองแสงเฉพาะจุด
   - เลือก "ทั้งหมด" จะแสดงทุกกลุ่มกล้ามเนื้อเป็นสีอ่อนๆ
   - ฝั่งซ้าย/ขวาของร่างกาย (หน้า/หลัง) วาดครึ่งเดียวแล้วสะท้อน (mirror)
   ===================================================================== */

export const PART_META = {
  shoulder: { name: "ไหล่", color: "#b7ff21" },
  chest: { name: "อก", color: "#00c8ff" },
  back: { name: "หลัง", color: "#b65cff" },
  arm: { name: "แขน", color: "#b7ff21" },
  core: { name: "ท้อง", color: "#00c8ff" },
  leg: { name: "สะโพก", color: "#b65cff" },
  leg2: { name: "ต้นขา", color: "#b7ff21" },
  calf: { name: "น่อง", color: "#00c8ff" },
};

// ส่วนที่มองเห็นในแต่ละมุม
export const VISIBLE_PARTS = {
  front: ["shoulder", "chest", "arm", "core", "leg", "leg2", "calf"],
  back: ["back", "shoulder", "arm", "leg", "leg2", "calf"],
  side: ["shoulder", "chest", "back", "arm", "core", "leg", "leg2", "calf"],
};

// มุมมองที่เหมาะกับแต่ละส่วนเมื่อกดจากปุ่มด้านข้าง
export const PREFERRED_VIEW = {
  back: "back",
  leg: "back",
  chest: "front",
  core: "front",
};

/* ---------------------------------------------------------------------
   เงาร่าง (silhouette) — ครึ่งขวา กึ่งกลางที่ x=150 (ใช้ mirror ได้)
   --------------------------------------------------------------------- */
const HALF_BODY =
  "M150 72 L163 72 L164 96 C182 100 200 104 214 112 C226 118 232 132 232 148 " +
  "C233 170 236 190 238 212 C240 232 246 252 252 276 C256 292 260 306 262 318 " +
  "C266 332 268 346 264 358 L254 362 C250 350 248 340 246 330 L240 318 " +
  "C234 296 226 274 220 254 C215 240 212 226 211 210 C210 192 209 174 207 160 " +
  "C204 180 198 204 193 226 C190 240 190 250 192 262 C198 278 204 296 204 316 " +
  "C206 346 205 380 202 410 C200 436 199 456 198 474 C197 500 200 520 199 540 " +
  "C198 560 199 580 200 598 L202 614 C204 624 190 628 176 626 L160 622 L158 604 " +
  "C157 580 157 560 158 540 C156 520 154 500 156 480 C157 450 158 430 158 410 " +
  "C156 380 153 350 152 330 L150 326 Z";

/* ---------------------------------------------------------------------
   กล้ามเนื้อด้านหน้า (ครึ่งขวา) — เรียงตามลำดับการวาด
   --------------------------------------------------------------------- */
const FRONT = [
  ["back", "M164 98 C182 102 200 106 214 114 C206 122 192 120 178 114 C170 110 166 104 164 98Z"], // trapezius
  ["core", "M192 172 L200 168 L199 180 L190 182Z"],
  ["core", "M190 186 L198 182 L196 194 L188 196Z"],
  ["core", "M188 200 L195 196 L192 208 L186 210Z"],
  ["chest", "M152 118 C170 114 192 116 206 124 C208 140 204 156 196 166 C184 178 162 176 152 164Z"],
  ["core", "M153 178 H172 Q176 178 176 182 V196 Q176 200 172 200 H153Z"],
  ["core", "M153 203 H172 Q176 203 176 207 V220 Q176 224 172 224 H153Z"],
  ["core", "M153 228 H172 Q176 228 176 232 V244 Q176 248 172 248 H153Z"],
  ["core", "M153 252 H171 Q174 252 174 256 V266 Q174 270 171 270 H153Z"],
  ["core", "M153 274 H168 Q170 274 170 278 V284 Q170 288 166 288 H153Z"],
  ["core", "M179 182 C186 184 190 194 190 214 C190 232 188 248 186 262 C182 268 179 276 176 284 C178 250 179 215 179 182Z"], // obliques
  ["leg", "M172 290 C184 288 196 296 202 308 C204 322 203 336 200 348 C190 342 180 328 174 312Z"], // hip
  ["leg2", "M153 334 C159 332 165 338 166 350 C166 362 162 368 158 374 C154 364 152 348 153 334Z"], // adductor
  ["leg2", "M170 322 C178 324 184 342 184 376 C184 396 182 412 176 424 C170 414 166 384 166 354 C166 338 168 328 170 322Z"], // rectus femoris
  ["leg2", "M187 330 C197 334 202 350 202 372 C202 396 200 416 197 430 C191 434 185 430 183 420 C187 398 189 364 187 330Z"], // vastus lateralis
  ["leg2", "M164 364 C160 376 158 394 160 412 C162 430 164 442 166 448 C172 446 176 436 176 424 C172 404 170 384 164 364Z"], // vastus medialis
  ["calf", "M187 488 C196 492 200 508 199 530 C198 542 196 548 192 554 C186 542 183 512 185 490Z"],
  ["calf", "M174 486 C181 500 183 534 181 572 C179 586 175 592 171 592 C167 572 167 520 169 490Z"],
  ["calf", "M160 490 C166 494 168 512 166 538 C165 550 162 556 159 552 C157 532 157 508 160 490Z"],
  ["arm", "M210 172 C218 170 227 178 231 192 C233 204 233 214 231 222 C225 228 216 228 212 222 C209 206 209 188 210 172Z"], // biceps
  ["arm", "M214 234 C224 232 236 234 242 244 C246 260 250 278 254 296 C248 300 242 300 238 296 C230 280 222 264 217 248Z"], // forearm
  ["shoulder", "M204 116 C216 112 228 124 231 148 C233 164 230 176 226 186 C214 180 207 168 206 152 C205 136 204 124 204 116Z"], // deltoid
];

/* ---------------------------------------------------------------------
   กล้ามเนื้อด้านหลัง (ครึ่งขวา)
   --------------------------------------------------------------------- */
const BACK = [
  ["back", "M202 164 C203 180 198 204 193 228 C191 242 191 250 192 258 C178 258 164 246 154 232 C166 212 178 192 188 168 C193 162 198 162 202 164Z"], // lat
  ["back", "M180 132 C194 128 204 136 207 150 C204 160 194 164 186 166 C180 156 177 144 180 132Z"], // infraspinatus/teres
  ["back", "M153 216 L162 216 C168 232 170 250 168 268 L153 268Z"], // erector
  ["back", "M150 96 L164 98 C182 102 200 106 214 114 C200 122 188 130 178 142 C168 166 160 190 150 216Z"], // trapezius
  ["leg", "M172 268 C184 266 196 274 202 286 C194 292 182 290 174 282Z"], // glute medius
  ["leg", "M150 270 C164 264 184 268 200 284 C204 302 202 326 190 340 C178 348 162 346 150 338Z"], // glute max
  ["leg2", "M185 352 C195 350 202 362 202 386 C202 410 200 430 196 446 C190 452 184 448 182 440 C186 412 187 382 185 352Z"],
  ["leg2", "M156 348 C168 352 180 354 183 362 C185 392 183 424 179 446 C173 454 165 452 163 444 C163 412 161 380 156 348Z"],
  ["calf", "M186 486 C195 485 200 496 199 520 C198 538 195 550 190 558 C184 548 181 522 183 496Z"],
  ["calf", "M159 486 C169 484 179 492 181 510 C182 530 179 546 173 558 C165 550 159 532 158 508Z"],
  ["calf", "M167 550 C175 550 185 550 191 558 C191 572 189 582 186 590 C180 592 174 592 170 590 C168 578 167 562 167 550Z"],
  ["arm", "M208 164 C218 160 229 172 233 190 C235 204 235 214 232 224 C226 230 216 230 212 222 C208 204 208 180 208 164Z"], // triceps
  ["arm", "M214 234 C224 232 236 234 242 244 C246 260 250 278 254 296 C248 300 242 300 238 296 C230 280 222 264 217 248Z"],
  ["shoulder", "M204 116 C216 112 228 124 231 148 C233 164 230 176 226 186 C214 180 207 168 206 152 C205 136 204 124 204 116Z"], // rear delt
];

/* ---------------------------------------------------------------------
   ด้านข้าง (หันขวา) — วาดทั้งตัว ไม่ mirror
   --------------------------------------------------------------------- */
const SIDE_BODY =
  "M138 74 L140 98 C128 104 118 114 116 134 C112 160 114 190 120 214 C124 232 124 252 122 266 " +
  "C112 280 106 300 110 322 C114 346 120 372 124 400 C126 430 124 452 124 474 C120 500 116 520 122 544 " +
  "C126 566 128 580 130 598 L130 614 L128 624 L196 626 C204 624 204 614 192 610 L168 604 " +
  "C166 590 166 570 166 548 C168 530 170 510 172 488 C178 470 180 450 178 430 C178 400 176 372 178 340 " +
  "C186 320 192 304 188 290 C192 276 192 262 190 248 C194 230 196 214 196 196 C200 180 202 160 198 142 " +
  "C194 124 184 108 168 98 L166 74 Z";

const SIDE_ARM =
  "M146 112 C164 108 176 120 176 142 C178 170 176 194 174 214 C174 232 176 250 178 274 " +
  "C180 294 182 310 180 326 C182 340 182 352 176 358 L164 358 C160 346 158 334 158 322 " +
  "C154 300 150 276 148 254 C146 236 144 214 142 190 C140 166 140 138 146 112Z";

const SIDE = [
  ["back", "M138 98 C128 106 121 116 119 134 C117 156 121 184 128 204 C136 196 141 170 143 140 C143 124 143 108 138 98Z"],
  ["back", "M124 208 C128 228 128 248 124 266 C134 262 140 248 140 232 C138 220 134 212 130 206Z"],
  ["leg", "M112 290 C110 306 112 322 118 336 C130 346 144 340 152 326 C156 306 148 286 134 278 C124 276 116 280 112 290Z"], // glute
  ["leg2", "M114 340 C128 348 142 346 154 340 C158 366 158 404 156 440 C148 452 134 452 130 442 C130 410 126 372 114 340Z"], // hamstring
  ["calf", "M125 480 C120 496 120 520 127 548 C136 552 146 546 150 532 C152 510 148 490 140 478 C134 476 130 476 125 480Z"],
  ["calf", "M164 492 C170 510 170 540 168 580 C162 586 156 584 154 574 C154 540 156 510 164 492Z"],
  ["core", "M176 190 C186 196 190 214 188 236 C188 252 186 266 182 280 C176 276 172 262 172 244 C172 224 174 206 176 190Z"],
  ["leg", "M160 292 C170 294 178 300 181 312 C180 328 174 338 168 342 C162 328 158 308 160 292Z"], // hip flexor / TFL
  ["leg2", "M158 338 C170 338 181 346 181 372 C181 400 180 424 175 446 C168 452 160 448 158 436 C158 400 156 360 158 338Z"], // quad
  ["chest", "M176 132 C188 134 197 144 197 158 C195 172 188 180 176 182 C172 168 172 148 176 132Z"],
];

const SIDE_ARM_MUSCLES = [
  ["shoulder", "M144 114 C160 108 175 118 175 142 C175 154 171 164 167 172 C156 168 146 156 142 140 C140 128 142 120 144 114Z"],
  ["arm", "M144 166 C142 190 144 214 148 234 C156 236 164 232 170 226 C172 206 170 186 166 170 C158 174 150 172 144 166Z"],
  ["arm", "M150 244 C158 246 168 244 174 240 C176 262 179 284 179 310 C172 318 164 318 160 312 C154 292 150 268 150 244Z"],
];

/* ===================================================================== */

export default function BodyMap({ view = "front", selectedPart = "all", onSelectPart }) {
  const [hover, setHover] = useState(null);
  const all = selectedPart === "all";

  const renderMuscles = (list, keyPrefix) =>
    list.map(([part, d], i) => {
      const on = selectedPart === part;
      const hov = hover === part;
      return (
        <g
          key={`${keyPrefix}-${i}`}
          className={`bm-m${on ? " on" : ""}${all ? " all" : ""}${hov ? " hov" : ""}`}
          style={{ "--c": PART_META[part].color }}
          onClick={() => onSelectPart && onSelectPart(part)}
          onMouseEnter={() => setHover(part)}
          onMouseLeave={() => setHover(null)}
        >
          <title>{PART_META[part].name}</title>
          <path d={d} className="bm-fill" />
          <path d={d} className="bm-sheen" />
        </g>
      );
    });

  const half = (list, mirror, key) => (
    <g key={key} transform={mirror ? "translate(300 0) scale(-1 1)" : undefined}>
      <path d={HALF_BODY} className="bm-skin" />
      {renderMuscles(list, key)}
    </g>
  );

  const label = all ? "" : PART_META[selectedPart]?.name;

  return (
    <>
      <svg className="bm-svg" viewBox="0 0 300 640" role="img" aria-label="แผนผังกล้ามเนื้อร่างกาย">
        <defs>
          <linearGradient id="bm-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity=".28" />
            <stop offset=".45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".32" />
          </linearGradient>
          <radialGradient id="bm-head" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="var(--bm-skin-hi)" />
            <stop offset="1" stopColor="var(--bm-skin)" />
          </radialGradient>
        </defs>

        {view === "side" ? (
          <g>
            <ellipse cx="156" cy="46" rx="28" ry="37" className="bm-skin bm-head" />
            <path d={SIDE_BODY} className="bm-skin" />
            {renderMuscles(SIDE, "side")}
            <path d={SIDE_ARM} className="bm-skin" />
            {renderMuscles(SIDE_ARM_MUSCLES, "sidearm")}
          </g>
        ) : (
          <g>
            {half(view === "back" ? BACK : FRONT, false, "r")}
            {half(view === "back" ? BACK : FRONT, true, "l")}
            {/* ปิดรอยต่อกลางลำตัว */}
            <rect x="148" y="73" width="4" height="252" className="bm-seam" />
            <ellipse cx="150" cy="46" rx="26" ry="37" className="bm-skin bm-head" />
            <ellipse cx="124" cy="52" rx="4" ry="9" className="bm-skin bm-head" />
            <ellipse cx="176" cy="52" rx="4" ry="9" className="bm-skin bm-head" />
            {view === "front" ? (
              <g className="bm-detail">
                <path d="M152 114 C170 111 190 113 206 119" />
                <path d="M148 114 C130 111 110 113 94 119" />
                <ellipse cx="150" cy="249" rx="2.6" ry="4.5" />
                <ellipse cx="177" cy="458" rx="9" ry="11" />
                <ellipse cx="123" cy="458" rx="9" ry="11" />
              </g>
            ) : (
              <g className="bm-detail">
                <path d="M150 100 L150 268" />
                <path d="M150 336 L150 326" />
              </g>
            )}
          </g>
        )}
      </svg>
      {label && <div className="bm-label" style={{ "--c": PART_META[selectedPart].color }}>{label}</div>}
      <style>{BM_CSS}</style>
    </>
  );
}

/* รูปย่อของร่างกายสำหรับปุ่มเปลี่ยนมุมมอง */
export function BodyThumb({ view }) {
  return (
    <svg className="bm-thumb" viewBox="0 0 300 640" aria-hidden="true">
      {view === "side" ? (
        <g>
          <ellipse cx="156" cy="46" rx="28" ry="37" />
          <path d={SIDE_BODY} />
          <path d={SIDE_ARM} />
        </g>
      ) : (
        <g>
          <path d={HALF_BODY} />
          <path d={HALF_BODY} transform="translate(300 0) scale(-1 1)" />
          <ellipse cx="150" cy="46" rx="26" ry="37" />
        </g>
      )}
    </svg>
  );
}

const BM_CSS = `
.body-visual { --bm-skin:#1a3a50; --bm-skin-hi:#27526e; --bm-line:#78a8c6; --bm-mus:rgba(130,180,210,.17); --bm-mus-line:rgba(150,200,230,.5); }
html[data-theme="light"] .body-visual { --bm-skin:#d7e5ed; --bm-skin-hi:#eef5f9; --bm-line:#7a9fb8; --bm-mus:rgba(90,130,160,.15); --bm-mus-line:rgba(70,115,150,.45); }

.bm-svg { position:relative; z-index:2; width:100%; height:100%; max-height:590px; overflow:visible; }
.bm-skin { fill:var(--bm-skin); stroke:var(--bm-line); stroke-width:1.6; stroke-linejoin:round; }
.bm-head { fill:url(#bm-head); }
.bm-seam { fill:var(--bm-skin); }
.bm-detail * { fill:none; stroke:var(--bm-mus-line); stroke-width:1.2; stroke-linecap:round; opacity:.8; }

.bm-m { cursor:pointer; }
.bm-fill { fill:var(--bm-mus); stroke:var(--bm-mus-line); stroke-width:1; stroke-linejoin:round; transition:fill .25s ease, stroke .25s ease, filter .25s ease, fill-opacity .25s ease; }
.bm-sheen { fill:url(#bm-sheen); pointer-events:none; }

.bm-m.all .bm-fill { fill:var(--c); fill-opacity:.3; stroke:var(--c); stroke-opacity:.7; }
.bm-m.hov .bm-fill { fill:var(--c); fill-opacity:.38; stroke:var(--c); stroke-opacity:.9; }
.bm-m.on .bm-fill { fill:var(--c); fill-opacity:.72; stroke:var(--c); stroke-width:1.4; filter:drop-shadow(0 0 7px var(--c)); animation:bm-pulse 2.2s ease-in-out infinite; }
.bm-m.on .bm-sheen { opacity:.9; }

@keyframes bm-pulse { 0%,100% { fill-opacity:.62; } 50% { fill-opacity:.82; } }
@media (prefers-reduced-motion: reduce) { .bm-m.on .bm-fill { animation:none; } }

.bm-label { position:absolute; left:50%; bottom:6px; transform:translateX(-50%); z-index:3; padding:3px 14px; border-radius:99px; border:1px solid var(--c); color:var(--c); background:rgba(0,0,0,.35); font-family:"Kanit",sans-serif; font-size:13px; pointer-events:none; }
html[data-theme="light"] .bm-label { background:rgba(255,255,255,.8); color:#12341a; }

.bm-thumb { height:62px; width:auto; }
.bm-thumb * { fill:rgba(110,160,190,.18); stroke:#6b9fc0; stroke-width:6; }
.body-view.active .bm-thumb * { fill:rgba(183,255,33,.2); stroke:#b7ff21; }
html[data-theme="light"] .body-view.active .bm-thumb * { stroke:#4fb82b; fill:rgba(110,215,40,.2); }
`;
