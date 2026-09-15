import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Exercise() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('กำลังโหลด AI...');
  const [currentExercise, setCurrentExercise] = useState('jumping_jack');
  const [facingMode, setFacingMode] = useState('user');
  const [errorMessage, setErrorMessage] = useState('');

  // ฟังก์ชันคำนวณระยะห่างหรือตำแหน่ง (ในที่นี้ใช้เช็กท่ากระโดดตบจากความสูงของมือเทียบกับหัวไหล่ และระยะห่างขา)
  useEffect(() => {
    let isActive = true;
    let cameraStream = null;
    let animationFrameId = null;
    let poseInstance = null;

    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    let stage = 'in'; // 'in' = หุบแขนขา, 'out' = กางแขนขาออก (กระโดดตบ)

    // โหลด Script MediaPipe Pose จาก CDN
    const loadMediaPipeScript = () => {
      return new Promise((resolve, reject) => {
        if (window.Pose) {
          resolve(window.Pose);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
        script.async = true;
        script.onload = () => resolve(window.Pose);
        script.onerror = (err) => reject(err);
        document.body.appendChild(script);
      });
    };

    async function initPose() {
      try {
        const PoseConstructor = await loadMediaPipeScript();
        if (!isActive) return;

        poseInstance = new PoseConstructor({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        poseInstance.onResults((results) => {
          if (!isActive) return;
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
          
          if (results.image) {
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
          }

          if (results.poseLandmarks) {
            const landmarks = results.poseLandmarks;

            // วาดจุดและเส้นโครงกระดูก
            canvasCtx.fillStyle = '#FF0000';
            canvasCtx.strokeStyle = '#00FF00';
            canvasCtx.lineWidth = 2;

            landmarks.forEach((landmark) => {
              const x = landmark.x * canvasElement.width;
              const y = landmark.y * canvasElement.height;
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            });

            // ดัชนี MediaPipe Pose สำหรับกระโดดตบ:
            // ข้อมือซ้าย (15), ข้อมือขวา (16), หัวไหล่ซ้าย (11), หัวไหล่ขวา (12)
            // ข้อเท้าซ้าย (27), ข้อเท้าขวา (28)
            const leftWrist = landmarks[15];
            const rightWrist = landmarks[16];
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftAnkle = landmarks[27];
            const rightAnkle = landmarks[28];

            if (leftWrist && rightWrist && leftShoulder && rightShoulder && leftAnkle && rightAnkle) {
              // เช็กว่ากางแขนออกหรือยัง (ข้อมืออยู่สูงกว่าหรือระดับเดียวกับไหล่ และกว้างกว่าไหล่)
              // ในระบบพิกัด Canvas ของ MediaPipe แกน Y ยิ่งน้อยยิ่งอยู่สูง
              const isHandsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
              const isFeetSpread = Math.abs(leftAnkle.x - rightAnkle.x) > 0.25; // ระยะห่างขา

              const isHandsDown = leftWrist.y > leftShoulder.y && rightWrist.y > rightShoulder.y;
              const isFeetClose = Math.abs(leftAnkle.x - rightAnkle.x) < 0.18;

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
          } else {
            setExerciseStatus('ไม่พบตัวผู้ใช้งาน กรุณาถอยหลังให้เห็นเต็มตัว');
          }
          canvasCtx.restore();
        });

        startCamera();
      } catch (err) {
        console.error("MediaPipe Load Error:", err);
        setErrorMessage("ไม่สามารถโหลดระบบ AI MediaPipe ได้");
      }
    }

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
          videoElement.onloadedmetadata = () => resolve();
        });

        videoElement.play();
        setExerciseStatus('พร้อมเริ่มออกกำลังกาย');

        async function sendFrame() {
          if (!isActive) return;
          if (videoElement.readyState >= 2 && poseInstance) {
            await poseInstance.send({ image: videoElement });
          }
          animationFrameId = requestAnimationFrame(sendFrame);
        }
        sendFrame();

      } catch (err) {
        console.error("Camera Error:", err);
        setErrorMessage("ไม่สามารถเปิดใช้งานกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงกล้อง");
      }
    }

    initPose();

    return () => {
      isActive = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (poseInstance) {
        poseInstance.close();
      }
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl md:text-3xl font-bold mb-2 text-center">AI Exercise Tracker (Jumping Jack)</h1>
      <p className="text-gray-400 mb-4 text-sm">ท่ากระโดดตบ</p>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-600 text-white rounded-lg text-sm max-w-md text-center">
          {errorMessage}
        </div>
      )}

      {/* ปุ่มควบคุม */}
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        <button 
          onClick={toggleCamera}
          className="px-4 py-2 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700"
        >
          🔄 สลับกล้องหน้า/หลัง
        </button>
        <button 
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600"
        >
          ← กลับหน้าหลัก
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
          <p className="text-sm font-bold text-yellow-400 mt-2">{exerciseStatus}</p>
        </div>
      </div>
    </div>
  );
}