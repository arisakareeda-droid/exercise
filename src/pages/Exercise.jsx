import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import * as drawingUtils from '@mediapipe/drawing_utils';

export default function Exercise() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('พร้อมเริ่ม');

  // รับค่าท่าที่ส่งมาจากหน้าเลือกท่า (ถ้าเข้าตรงๆ จะตั้งค่าเริ่มต้นเป็น squat)
  const selectedExerciseType = location.state?.exerciseType || 'squat';
  const selectedExerciseName = location.state?.exerciseName || 'Squat';
  const selectedThaiName = location.state?.thaiName || 'สควอท';

  const [currentExercise, setCurrentExercise] = useState(selectedExerciseType);

  // ฟังก์ชันคำนวณมุมระหว่างจุด 3 จุด (สำหรับ Squat)
  const calculateAngle = (p1, p2, p3) => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  };

  useEffect(() => {
    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasElement || !videoElement) return;
    const canvasCtx = canvasElement.getContext('2d');

    let stage = 'up';

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
      }

      if (results.poseLandmarks) {
        drawingUtils.drawConnectors(canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawingUtils.drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 1 });

        const landmarks = results.poseLandmarks;

        if (currentExercise === 'squat') {
          const hip = landmarks[23];
          const knee = landmarks[25];
          const ankle = landmarks[27];

          if (hip && knee && ankle) {
            const angle = calculateAngle(hip, knee, ankle);
            
            if (angle > 160) {
              stage = 'up';
              setExerciseStatus('ยืดตัวขึ้น');
            }
            if (angle < 90 && stage === 'up') {
              stage = 'down';
              setExerciseStatus('ย่อลงลึกเยี่ยม!');
              setRepCount((prev) => prev + 1);
            }
          }
        } else if (currentExercise === 'jumping_jack') {
          const leftWrist = landmarks[15];
          const rightWrist = landmarks[16];
          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];
          const leftAnkle = landmarks[27];
          const rightAnkle = landmarks[28];

          if (leftWrist && rightWrist && leftShoulder && rightShoulder && leftAnkle && rightAnkle) {
            const isHandsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
            const isFeetSpread = Math.abs(leftAnkle.x - rightAnkle.x) > 0.25;

            const isHandsDown = leftWrist.y > leftShoulder.y && rightWrist.y > rightShoulder.y;
            const isFeetClose = Math.abs(leftAnkle.x - rightAnkle.x) < 0.15;

            if (isHandsDown && isFeetClose) {
              stage = 'in';
              setExerciseStatus('เตรียมตัว (หุบแขนขา)');
            }
            if (isHandsUp && isFeetSpread && stage === 'in') {
              stage = 'out';
              setExerciseStatus('ยอดเยี่ยม! กางแขนขาออก');
              setRepCount((prev) => prev + 1);
            }
          }
        }
      } else {
        setExerciseStatus('ไม่พบตัวผู้ใช้งาน กรุณาถอยหลังให้เห็นเต็มตัว');
      }
      canvasCtx.restore();
    });

    let camera = null;
    if (videoElement) {
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }

    return () => {
      if (pose) {
        pose.close();
      }
    };
  }, [currentExercise]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-2">AI Exercise Tracker</h1>
      <p className="text-gray-400 mb-4">กำลังฝึกท่า: <span className="text-green-400 font-semibold">{selectedExerciseName} ({selectedThaiName})</span></p>

      {/* ปุ่มสลับท่าเผื่ออยากเปลี่ยนระหว่างเล่น */}
      <div className="mb-4 flex gap-4">
        <button 
          onClick={() => { setRepCount(0); setCurrentExercise('squat'); }}
          className={`px-4 py-2 rounded-lg font-semibold transition cursor-pointer ${currentExercise === 'squat' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          🏋️‍♂️ Squat (สควอท)
        </button>
        <button 
          onClick={() => { setRepCount(0); setCurrentExercise('jumping_jack'); }}
          className={`px-4 py-2 rounded-lg font-semibold transition cursor-pointer ${currentExercise === 'jumping_jack' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          ⭐ Jumping Jack (กระโดดตบ)
        </button>
      </div>

      {/* พื้นที่กล้องและ Canvas */}
      <div className="relative w-[640px] h-[480px] bg-black rounded-xl overflow-hidden shadow-lg border border-gray-700">
        <video ref={webcamRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" playsInline />
        <canvas ref={canvasRef} width={640} height={480} className="absolute top-0 left-0 w-full h-full" />
      </div>

      {/* แสดงผลสถิติ */}
      <div className="mt-6 grid grid-cols-2 gap-6 w-full max-w-md text-center">
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
          <p className="text-gray-400 text-sm">จำนวนครั้ง (Reps)</p>
          <p className="text-4xl font-extrabold text-green-400 mt-1">{repCount}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
          <p className="text-gray-400 text-sm">สถานะท่าทาง</p>
          <p className="text-xl font-bold text-yellow-400 mt-2">{exerciseStatus}</p>
        </div>
      </div>

      <button 
        onClick={() => navigate('/exercises')} 
        className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition cursor-pointer"
      >
        ← กลับไปเลือกท่าอื่น
      </button>
    </div>
  );
}