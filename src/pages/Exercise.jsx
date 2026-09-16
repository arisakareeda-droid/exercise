import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Exercise() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const exerciseType = searchParams.get('exercise') || 'squat';
  const targetCount = parseInt(searchParams.get('target') || '10', 10);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState("กำลังโหลด AI...");
  const [calories, setCalories] = useState(0); // เพิ่ม State สำหรับเก็บค่าแคลอรี
  const stageRef = useRef("up");

  const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  };

  useEffect(() => {
    let active = true;
    let camera = null;

    const initPose = () => {
      if (!window.Pose || !window.Camera) {
        setTimeout(initPose, 500);
        return;
      }

      const pose = new window.Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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
        const canvasCtx = canvasRef.current.getContext('2d');
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, width, height);
        
        if (results.image) {
          canvasCtx.drawImage(results.image, 0, 0, width, height);
        }

        if (results.poseLandmarks) {
          const lm = results.poseLandmarks;

          if (window.POSE_CONNECTIONS) {
            canvasCtx.strokeStyle = '#00FF00';
            canvasCtx.lineWidth = 4;
            window.POSE_CONNECTIONS.forEach(([i, j]) => {
              const p1 = lm[i];
              const p2 = lm[j];
              if (p1 && p2 && (p1.visibility ?? 1) > 0.6 && (p2.visibility ?? 1) > 0.6) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x * width, p1.y * height);
                canvasCtx.lineTo(p2.x * width, p2.y * height);
                canvasCtx.stroke();
              }
            });
          }

          canvasCtx.fillStyle = '#FF0000';
          lm.forEach((p) => {
            if (p && (p.visibility ?? 1) > 0.6) {
              canvasCtx.beginPath();
              canvasCtx.arc(p.x * width, p.y * height, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            }
          });

          setFeedback("จัดท่าทางให้เห็นเต็มตัว");

          // --- เงื่อนไขท่า SQUAT ---
          if (exerciseType === "squat") {
            const hip = lm[23], knee = lm[25], ankle = lm[27];
            if (hip && knee && ankle) {
              const angle = calculateAngle(hip, knee, ankle);
              
              if (angle > 160) {
                stageRef.current = "up";
                setFeedback("ยืนตัวตรง - พร้อมแล้วย่อตัวลง");
              }
              if (angle < 100 && stageRef.current === "up") {
                stageRef.current = "down";
                setCounter((prev) => {
                  const nextCount = prev + 1;
                  
                  // คำนวณแคลอรีสำหรับ Squat (0.32 kcal ต่อครั้ง)
                  const totalCal = Number((nextCount * 0.32).toFixed(2));
                  setCalories(totalCal);

                  if (nextCount >= targetCount) {
                    setTimeout(() => navigate(`/result?exercise=${exerciseType}&count=${nextCount}&calories=${totalCal}`), 1000);
                  }
                  return nextCount;
                });
                setFeedback("ยอดเยี่ยม! ดันตัวขึ้น");
              }
            }
          } 
          // --- เงื่อนไขท่า JUMPING JACK ---
          else if (exerciseType === "jumping_jack") {
            const shoulderL = lm[11], wristL = lm[15];
            const hipL = lm[23], ankleL = lm[27], ankleR = lm[28];
            
            if (shoulderL && wristL && hipL && ankleL && ankleR) {
              const isHandsUp = wristL.y < shoulderL.y;
              
              if (!isHandsUp) {
                stageRef.current = "down";
                setFeedback("เตรียมตัว - กระโดดตบ");
              }
              if (isHandsUp && stageRef.current === "down") {
                stageRef.current = "up";
                setCounter((prev) => {
                  const nextCount = prev + 1;
                  
                  // คำนวณแคลอรีสำหรับ Jumping Jack (0.20 kcal ต่อครั้ง)
                  const totalCal = Number((nextCount * 0.20).toFixed(2));
                  setCalories(totalCal);

                  if (nextCount >= targetCount) {
                    setTimeout(() => navigate(`/result?exercise=${exerciseType}&count=${nextCount}&calories=${totalCal}`), 1000);
                  }
                  return nextCount;
                });
                setFeedback("ยอดเยี่ยม!");
              }
            }
          }
        }
        canvasCtx.restore();
      });

      if (videoRef.current) {
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && active) {
              await pose.send({ image: videoRef.current });
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
      if (camera && typeof camera.stop === 'function') {
        camera.stop();
      }
    };
  }, [exerciseType, targetCount, navigate]);

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', textAlign: 'center', color: '#fff', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/exercises')}
          style={{ padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ← กลับหน้าเลือกท่า
        </button>
        <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: '20px' }}>
          ท่า: {exerciseType} (เป้าหมาย: {targetCount} ครั้ง)
        </h2>
      </div>

      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '1px solid #444', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* แผงแสดงผล: ทำไปแล้ว / แคลอรี / สถานะท่าทาง */}
        <div style={{ display: 'flex', gap: '30px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>ทำไปแล้ว</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#007bff' }}>{counter} / {targetCount}</span>
          </div>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>แคลอรี</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#ffc107' }}>{calories} kcal</span>
          </div>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px', fontSize: '14px' }}>สถานะท่าทาง</p>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>{feedback}</span>
          </div>
        </div>

        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
        
        <canvas 
          ref={canvasRef} 
          width="640" 
          height="480" 
          style={{ width: '100%', maxWidth: '640px', height: 'auto', borderRadius: '8px', border: '1px solid #444', background: '#000' }} 
        />
      </div>
    </div>
  );
}