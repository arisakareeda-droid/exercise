import React, { useEffect, useRef, useState } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import * as drawingUtils from '@mediapipe/drawing_utils';

export default function Exercise() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('พร้อมเริ่ม');
  const [currentExercise, setCurrentExercise] = useState('squat'); // เลือกท่าออกกำลังกาย

  // ฟังก์ชันคำนวณมุมระหว่างจุด 3 จุด (เช่น สะโพก -> เข่า -> ข้อเท้า)
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
    const canvasCtx = canvasElement.getContext('2d');

    let stage = 'up'; // สำหรับเช็คจังหวะ ขึ้น/ลง

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
      
      // วาดภาพจากกล้องลงบน Canvas
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      if (results.poseLandmarks) {
        // วาดจุดข้อต่อ (Landmarks) บนร่างกาย
        drawingUtils.drawConnectors(canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawingUtils.drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 1 });

        const landmarks = results.poseLandmarks;

        if (currentExercise === 'squat') {
          // ตัวอย่างการคำนวณท่า Squat (ใช้จุดสะโพก(23), เข่า(25), ข้อเท้า(27) ข้างซ้าย)
          const hip = landmarks[23];
          const knee = landmarks[25];
          const ankle = landmarks[27];

          if (hip && knee && ankle) {
            const angle = calculateAngle(hip, knee, ankle);
            
            // เช็คเงื่อนไขการนับ Reps
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
        }
      }
      canvasCtx.restore();
    });

    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          await pose.send({ image: videoElement });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }
  }, [currentExercise]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-4">AI Exercise Tracker (MediaPipe)</h1>

      {/* เลือกท่าออกกำลังกาย */}
      <div className="mb-4 flex gap-4">
        <button 
          onClick={() => { setRepCount(0); setCurrentExercise('squat'); }}
          className={`px-4 py-2 rounded-lg font-semibold ${currentExercise === 'squat' ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          Squat
        </button>
      </div>

      {/* พื้นที่แสดงผลกล้องและ Canvas */}
      <div className="relative w-[640px] h-[480px] bg-black rounded-xl overflow-hidden shadow-lg border border-gray-700">
        <video ref={webcamRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" playsInline />
        <canvas ref={canvasRef} width={640} height={480} className="absolute top-0 left-0 w-full h-full" />
      </div>

      {/* แผงแสดงผลสถิติการออกกำลังกายแบบ Real-time */}
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
    </div>
  );
}