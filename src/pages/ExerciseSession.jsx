import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export default function ExerciseSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // ดึงค่าประเภทท่าจาก URL เช่น ?exercise=squat หรือ ?exercise=jumping_jack
  const exerciseType = searchParams.get('exercise') || 'squat';

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [counter, setCounter] = useState(0);
  const [feedback, setFeedback] = useState("เตรียมตัวให้พร้อม");
  const stageRef = useRef("up");

  // ฟังก์ชันคำนวณมุมองศาจากข้อต่อ 3 จุด
  const calculateAngle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  };

  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      if (!canvasRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // วาดภาพจากกล้องลงบน Canvas
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      if (results.poseLandmarks) {
        // วาดเส้นโครงกระดูกและจุดข้อต่อ
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });

        const lm = results.poseLandmarks;

        // --- เงื่อนไขท่า SQUAT ---
        if (exerciseType === "squat") {
          const hip = lm[23], knee = lm[25], ankle = lm[27];
          if (hip && knee && ankle) {
            const angle = calculateAngle(hip, knee, ankle);
            if (angle > 160) {
              stageRef.current = "up";
              setFeedback("ยืนตัวตรง");
            }
            if (angle < 90 && stageRef.current === "up") {
              stageRef.current = "down";
              setCounter((prev) => prev + 1);
              setFeedback("ยอดเยี่ยม! ดันตัวขึ้น");
            }
          }
        } 
        // --- เงื่อนไขท่า JUMPING JACK ---
        else if (exerciseType === "jumping_jack") {
          const shoulderL = lm[11], wristL = lm[15];
          if (shoulderL && wristL) {
            if (wristL.y > shoulderL.y) {
              stageRef.current = "down";
              setFeedback("กางแขนและขาออก");
            }
            if (wristL.y < shoulderL.y && stageRef.current === "down") {
              stageRef.current = "up";
              setCounter((prev) => prev + 1);
              setFeedback("ยอดเยี่ยม!");
            }
          }
        }
      }
      canvasCtx.restore();
    });

    let camera = null;
    if (webcamRef.current) {
      camera = new Camera(webcamRef.current, {
        onFrame: async () => {
          if (webcamRef.current) {
            await pose.send({ image: webcamRef.current });
          }
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    return () => {
      if (camera) {
        // เคลียร์การทำงานเมื่อ component ถูก unmount
      }
    };
  }, [exerciseType]);

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', textAlign: 'center', color: '#fff', backgroundColor: '#121212', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/exercises')}
          style={{ padding: '8px 16px', background: '#444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ← กลับหน้าเลือกท่า
        </button>
        <h2 style={{ margin: 0, textTransform: 'uppercase' }}>ท่า: {exerciseType}</h2>
      </div>

      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '1px solid #444', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '30px', marginBottom: '20px' }}>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px' }}>จำนวนครั้ง</p>
            <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#007bff' }}>{counter}</span>
          </div>
          <div>
            <p style={{ color: '#aaa', margin: '0 0 5px' }}>คำแนะนำ</p>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>{feedback}</span>
          </div>
        </div>

        {/* Video ซ่อนสำหรับดึง Stream กล้อง */}
        <video ref={webcamRef} className="hidden" playsInline style={{ display: 'none' }} />
        
        {/* Canvas แสดงภาพกล้องพร้อมโครงกระดูก */}
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