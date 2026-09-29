import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// --- ค่าคงที่สำหรับกรองสัญญาณรบกวน / กันนับผิด ---
const SMOOTHING_WINDOW = 5;          // เฟรมที่ใช้เฉลี่ยมุมเข่า (squat เคลื่อนไหวช้า ใช้ window ยาวได้)
const STABLE_FRAMES_SQUAT = 4;       // squat ต้องนิ่งครบกี่เฟรมก่อนยืนยันเปลี่ยนท่า
const ARM_SMOOTHING_WINDOW = 3;      // jumping jack เคลื่อนไหวเร็ว ใช้ window สั้นกว่า ไม่ให้พลาดจังหวะ
const ARM_UP_THRESHOLD = 0.10;       // ค่าความต่าง (shoulder.y - wrist.y) ที่ถือว่า "ยกมือขึ้นจริง"
const ARM_DOWN_THRESHOLD = -0.05;    // ค่าที่ถือว่า "มือลงข้างตัวจริง"
const REP_COOLDOWN_MS = 600;         // เวลาขั้นต่ำระหว่างการนับแต่ละครั้ง (กันนับซ้ำ)
const MIN_VISIBILITY = 0.65;         // ความเชื่อมั่นขั้นต่ำของจุดที่จะนำมาคำนวณ

export default function Exercise() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';
  const targetCount = parseInt(searchParams.get('target') || '10', 10);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState("กำลังโหลด AI...");
  const [calories, setCalories] = useState(0);

  const stageRef = useRef(null);              // เริ่มเป็น null รอกำหนดจากท่าจริงในเฟรมแรก
  const hasInitializedStageRef = useRef(false); // กันไม่ให้นับก่อนรู้ท่าตั้งต้นจริง
  const angleBufferRef = useRef([]);            // buffer smoothing มุมเข่า (squat)
  const armBufferRef = useRef([]);              // buffer smoothing สัญญาณแขน (jumping jack)
  const candidateStageRef = useRef(null);       // stage ที่กำลังรอยืนยัน (ใช้กับ squat)
  const stableFrameCountRef = useRef(0);
  const lastRepTimeRef = useRef(0);

  const calculateAngle = (a, b, c) => {
    const radians =
      Math.atan2(c.y - b.y, c.x - b.x) -
      Math.atan2(a.y - b.y, a.x - b.x);

    let angle = Math.abs((radians * 180.0) / Math.PI);

    if (angle > 180.0) angle = 360 - angle;

    return angle;
  };

  const isVisible = (p) =>
    p && (p.visibility ?? 1) > MIN_VISIBILITY;

  // เฉลี่ยมุมเข่าซ้าย+ขวา แล้ว smoothing ย้อนหลังหลายเฟรม
  const getSmoothedKneeAngle = (lm) => {
    const angles = [];

    const hipL = lm[23],
      kneeL = lm[25],
      ankleL = lm[27];

    if (isVisible(hipL) && isVisible(kneeL) && isVisible(ankleL)) {
      angles.push(calculateAngle(hipL, kneeL, ankleL));
    }

    const hipR = lm[24],
      kneeR = lm[26],
      ankleR = lm[28];

    if (isVisible(hipR) && isVisible(kneeR) && isVisible(ankleR)) {
      angles.push(calculateAngle(hipR, kneeR, ankleR));
    }

    if (angles.length === 0) return null;

    const instant =
      angles.reduce((a, b) => a + b, 0) / angles.length;

    const buf = angleBufferRef.current;

    buf.push(instant);

    if (buf.length > SMOOTHING_WINDOW) buf.shift();

    return buf.reduce((a, b) => a + b, 0) / buf.length;
  };

  // ค่า "ยกแขนขึ้นแค่ไหน" เฉลี่ยซ้าย+ขวา บวก = มือสูงกว่าไหล่ (ยกขึ้น), ลบ = มือต่ำกว่าไหล่ (ปล่อยลง)
  const getSmoothedArmRaise = (lm) => {
    const vals = [];

    const shoulderL = lm[11],
      wristL = lm[15];

    if (isVisible(shoulderL) && isVisible(wristL)) {
      vals.push(shoulderL.y - wristL.y);
    }

    const shoulderR = lm[12],
      wristR = lm[16];

    if (isVisible(shoulderR) && isVisible(wristR)) {
      vals.push(shoulderR.y - wristR.y);
    }

    if (vals.length === 0) return null;

    const instant =
      vals.reduce((a, b) => a + b, 0) / vals.length;

    const buf = armBufferRef.current;

    buf.push(instant);

    if (buf.length > ARM_SMOOTHING_WINDOW) buf.shift();

    return buf.reduce((a, b) => a + b, 0) / buf.length;
  };

  // ใช้เฉพาะ squat: ต้องนิ่งอยู่ในเงื่อนไขเดิมครบจำนวนเฟรมก่อนยืนยันว่าเปลี่ยนท่าจริง
  const confirmStage = (candidate, framesRequired) => {
    if (candidateStageRef.current !== candidate) {
      candidateStageRef.current = candidate;
      stableFrameCountRef.current = 1;
      return false;
    }

    stableFrameCountRef.current += 1;

    return stableFrameCountRef.current >= framesRequired;
  };

  const tryCountRep = (nextCount) => {
    const now = Date.now();

    if (now - lastRepTimeRef.current < REP_COOLDOWN_MS) return;

    lastRepTimeRef.current = now;

    const caloriesPerRep =
      exerciseType === 'squat' ? 0.32 : 0.20;

    const totalCal = Number(
      (nextCount * caloriesPerRep).toFixed(2)
    );

    setCounter(nextCount);
    setCalories(totalCal);

    if (nextCount >= targetCount) {
      setTimeout(
        () =>
          navigate(
            `/result?exercise=${exerciseType}&count=${nextCount}&calories=${totalCal}`
          ),
        1000
      );
    }
  };

  useEffect(() => {
    let active = true;
    let camera = null;

    // รีเซ็ตสถานะทุกครั้งที่เปลี่ยนท่าออกกำลังกาย
    stageRef.current = null;
    hasInitializedStageRef.current = false;
    angleBufferRef.current = [];
    armBufferRef.current = [];
    candidateStageRef.current = null;
    stableFrameCountRef.current = 0;
    lastRepTimeRef.current = 0;

    setCounter(0);
    setCalories(0);

    const initPose = () => {
      if (!window.Pose || !window.Camera) {
        setTimeout(initPose, 500);
        return;
      }

      const pose = new window.Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });

      pose.onResults((results) => {
        if (!canvasRef.current || !active) return;

        const canvasCtx =
          canvasRef.current.getContext('2d');

        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, width, height);

        if (results.image) {
          canvasCtx.drawImage(
            results.image,
            0,
            0,
            width,
            height
          );
        }

        if (results.poseLandmarks) {
          const lm = results.poseLandmarks;

          if (window.POSE_CONNECTIONS) {
            canvasCtx.strokeStyle = '#00FF00';
            canvasCtx.lineWidth = 4;

            window.POSE_CONNECTIONS.forEach(([i, j]) => {
              const p1 = lm[i];
              const p2 = lm[j];

              if (
                p1 &&
                p2 &&
                isVisible(p1) &&
                isVisible(p2)
              ) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(
                  p1.x * width,
                  p1.y * height
                );
                canvasCtx.lineTo(
                  p2.x * width,
                  p2.y * height
                );
                canvasCtx.stroke();
              }
            });
          }

          canvasCtx.fillStyle = '#FF0000';

          lm.forEach((p) => {
            if (isVisible(p)) {
              canvasCtx.beginPath();

              canvasCtx.arc(
                p.x * width,
                p.y * height,
                4,
                0,
                2 * Math.PI
              );

              canvasCtx.fill();
            }
          });

          setFeedback("จัดท่าทางให้เห็นเต็มตัว");

          // --- เงื่อนไขท่า SQUAT ---
          if (exerciseType === "squat") {
            const angle = getSmoothedKneeAngle(lm);

            if (angle !== null) {
              // เฟรมแรกที่อ่านค่าได้: กำหนดท่าเริ่มต้นตามท่าจริง ไม่ใช่ hardcode
              // ป้องกันบั๊ก "ยืนนิ่งแป๊บเดียวก็นับ 1 ครั้ง"
              if (!hasInitializedStageRef.current) {
                stageRef.current =
                  angle > 130 ? "up" : "down";

                hasInitializedStageRef.current = true;

                setFeedback(
                  stageRef.current === "up"
                    ? "พร้อมแล้ว ย่อตัวลงได้เลย"
                    : "อยู่ในท่าย่อ ยืนขึ้นเพื่อเริ่มนับ"
                );
              } else if (angle > 165) {
                if (
                  confirmStage(
                    "up",
                    STABLE_FRAMES_SQUAT
                  )
                ) {
                  if (stageRef.current === "down") {
                    tryCountRep(counter + 1);
                  }

                  stageRef.current = "up";
                }

                setFeedback(
                  "ยืนตัวตรง - พร้อมแล้วย่อตัวลง"
                );
              } else if (angle < 95) {
                if (
                  confirmStage(
                    "down",
                    STABLE_FRAMES_SQUAT
                  ) &&
                  stageRef.current === "up"
                ) {
                  stageRef.current = "down";
                }

                setFeedback(
                  "ยอดเยี่ยม! ดันตัวขึ้นตรงๆ"
                );
              } else {
                candidateStageRef.current = null;
                stableFrameCountRef.current = 0;
              }
            }
          }

          // --- เงื่อนไขท่า JUMPING JACK ---
          else if (exerciseType === "jumping_jack") {
            const armRaise = getSmoothedArmRaise(lm);

            if (armRaise !== null) {
              // เฟรมแรกที่อ่านค่าได้: กำหนดท่าเริ่มต้นตามท่าจริง (มือลง = down)
              if (!hasInitializedStageRef.current) {
                stageRef.current =
                  armRaise > 0 ? "up" : "down";

                hasInitializedStageRef.current = true;

                setFeedback(
                  stageRef.current === "down"
                    ? "พร้อมแล้ว กระโดดยกแขนขึ้นได้เลย"
                    : "ลดแขนลงก่อนเริ่มนับ"
                );
              }

              // ใช้ threshold แบบ hysteresis ตรงๆ ไม่รอค้างนิ่งหลายเฟรม เพราะการกระโดดเร็วมาก
              else if (armRaise > ARM_UP_THRESHOLD) {
                if (stageRef.current === "down") {
                  stageRef.current = "up";

                  setFeedback(
                    "ยอดเยี่ยม! หุบแขนขาลง"
                  );
                }
              } else if (
                armRaise < ARM_DOWN_THRESHOLD
              ) {
                if (stageRef.current === "up") {
                  tryCountRep(counter + 1);

                  stageRef.current = "down";
                }

                setFeedback(
                  "เตรียมตัว - กระโดดกางแขนขาออก"
                );
              }

              // ค่ากลางระหว่าง threshold ทั้งสอง:
              // ยังไม่เปลี่ยนอะไร รอจนกว่าจะขยับชัดเจน
            }
          }
        }

        canvasCtx.restore();
      });

      if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && active) {
              await pose.send({
                image: videoRef.current,
              });
            }
          },
          width: 640,
          height: 480,
        });

        camera.start();
      }
    };

    initPose();

    return () => {
      active = false;

      if (
        camera &&
        typeof camera.stop === 'function'
      ) {
        camera.stop();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseType, targetCount, navigate]);

  return (
    <div
      style={{
        padding: '30px',
        maxWidth: '700px',
        margin: '0 auto',
        textAlign: 'center',
        color: '#fff',
        backgroundColor: '#121212',
        minHeight: '100vh',
        fontFamily: '"Kanit", sans-serif'
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&display=swap');

          * {
            font-family: "Kanit", sans-serif;
          }

          button,
          input,
          textarea,
          select {
            font-family: "Kanit", sans-serif;
          }
        `}
      </style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <button
          onClick={() => navigate('/exercises')}
          style={{
            padding: '8px 16px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: '"Kanit", sans-serif'
          }}
        >
          ← กลับหน้าเลือกท่า
        </button>

        <h2
          style={{
            margin: 0,
            textTransform: 'uppercase',
            fontSize: '20px',
            fontFamily: '"Kanit", sans-serif'
          }}
        >
          ท่า: {exerciseType} (เป้าหมาย: {targetCount} ครั้ง)
        </h2>
      </div>

      <div
        style={{
          background: '#1e1e1e',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #444',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '30px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}
        >
          <div>
            <p
              style={{
                color: '#aaa',
                margin: '0 0 5px',
                fontSize: '14px',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              ทำไปแล้ว
            </p>

            <span
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#007bff',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              {counter} / {targetCount}
            </span>
          </div>

          <div>
            <p
              style={{
                color: '#aaa',
                margin: '0 0 5px',
                fontSize: '14px',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              แคลอรี
            </p>

            <span
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#ffc107',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              {calories} kcal
            </span>
          </div>

          <div>
            <p
              style={{
                color: '#aaa',
                margin: '0 0 5px',
                fontSize: '14px',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              สถานะท่าทาง
            </p>

            <span
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#28a745',
                fontFamily: '"Kanit", sans-serif'
              }}
            >
              {feedback}
            </span>
          </div>
        </div>

        <video
          ref={videoRef}
          style={{ display: 'none' }}
          playsInline
          muted
        />

        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{
            width: '100%',
            maxWidth: '640px',
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid #444',
            background: '#000'
          }}
        />
      </div>
    </div>
  );
}