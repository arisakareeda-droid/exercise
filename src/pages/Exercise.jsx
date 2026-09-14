import React, { useEffect, useRef, useState } from 'react';
import { Pose } from '@mediapipe/pose';
import * as drawingUtils from '@mediapipe/drawing_utils';

export default function Exercise() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('พร้อมเริ่ม');
  const [currentExercise, setCurrentExercise] = useState('squat');
  const [facingMode, setFacingMode] = useState('user'); // 'user' = กล้องหน้า, 'environment' = กล้องหลัง
  const [errorMessage, setErrorMessage] = useState('');

  // ฟังก์ชันคำนวณมุมระหว่างจุด 3 จุด
  const calculateAngle = (p1, p2, p3) => {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  };

  useEffect(() => {
    let isActive = true;
    let cameraStream = null;
    let animationFrameId = null;

    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    let stage = 'up';

    // ตั้งค่า MediaPipe Pose
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
      if (!isActive) return;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      // วาดภาพจากกล้องลงบน Canvas
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
        }
      }
      canvasCtx.restore();
    });

    // เปิดใช้งานกล้องที่รองรับทั้ง มือถือ และ PC
    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        };

        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = cameraStream;
        
        await new Promise((resolve) => {
          videoElement.onloadedmetadata = () => {
            resolve();
          };
        });

        videoElement.play();

        // ส่งภาพเข้า MediaPipe อย่างต่อเนื่อง
        async function sendFrame() {
          if (!isActive) return;
          if (videoElement.readyState >= 2) {
            await pose.send({ image: videoElement });
          }
          animationFrameId = requestAnimationFrame(sendFrame);
        }
        sendFrame();

      } catch (err) {
        console.error("Camera Error:", err);
        setErrorMessage("ไม่สามารถเปิดใช้งานกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง (Permission) หรือลองใช้ผ่าน HTTPS / Localhost");
      }
    }

    startCamera();

    return () => {
      isActive = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      pose.close();
    };
  }, [currentExercise, facingMode]);

  // สลับกล้องหน้า / กล้องหลัง (สำหรับมือถือ)
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-center">AI Exercise Tracker (Mobile & PC)</h1>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-600 text-white rounded-lg text-sm max-w-md text-center">
          {errorMessage}
        </div>
      )}

      {/* ปุ่มควบคุม */}
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        <button 
          onClick={() => { setRepCount(0); setCurrentExercise('squat'); }}
          className={`px-4 py-2 rounded-lg font-semibold ${currentExercise === 'squat' ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          Squat
        </button>
        <button 
          onClick={toggleCamera}
          className="px-4 py-2 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700"
        >
          🔄 สลับกล้องหน้า/หลัง
        </button>
      </div>

      {/* พื้นที่แสดงผลกล้องและ Canvas */}
      <div className="relative w-full max-w-[640px] aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-lg border border-gray-700 flex items-center justify-center">
        <video ref={webcamRef} className="absolute top-0 left-0 w-full h-full object-cover hidden" playsInline muted />
        <canvas ref={canvasRef} width={640} height={480} className="absolute top-0 left-0 w-full h-full object-contain" />
      </div>

      {/* แผงแสดงผลสถิติ */}
      <div className="mt-6 grid grid-cols-2 gap-4 w-full max-w-md text-center">
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
          <p className="text-gray-400 text-sm">จำนวนครั้ง (Reps)</p>
          <p className="text-4xl font-extrabold text-green-400 mt-1">{repCount}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
          <p className="text-gray-400 text-sm">สถานะท่าทาง</p>
          <p className="text-lg font-bold text-yellow-400 mt-2">{exerciseStatus}</p>
        </div>
      </div>
    </div>
  );
}