import React, { useEffect, useRef, useState } from 'react';

export default function Exercise() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('กำลังโหลด AI...');
  const [currentExercise, setCurrentExercise] = useState('squat');
  const [facingMode, setFacingMode] = useState('user');
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
    let poseInstance = null;

    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    let stage = 'up';

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

            // วาดจุดและเส้นโครงกระดูกแบบง่ายด้วย Canvas 2D API ปกติ
            canvasCtx.fillStyle = '#FF0000';
            canvasCtx.strokeStyle = '#00FF00';
            canvasCtx.lineWidth = 2;

            // วาดจุดข้อต่อหลักๆ
            landmarks.forEach((landmark) => {
              const x = landmark.x * canvasElement.width;
              const y = landmark.y * canvasElement.height;
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            });

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
  }, [currentExercise, facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl md:text-3xl font-bold mb-4 text-center">AI Exercise Tracker (MediaPipe)</h1>

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
          <p className="text-sm font-bold text-yellow-400 mt-2">{exerciseStatus}</p>
        </div>
      </div>
    </div>
  );
}