import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Exercise() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [repCount, setRepCount] = useState(0);
  const [exerciseStatus, setExerciseStatus] = useState('กำลังโหลด AI...');
  const [errorMessage, setErrorMessage] = useState('');

  // สถานะการออกกำลังกาย (สำหรับติดตามจังหวะ)
  const stageRef = useRef('in'); // 'in' = หุบแขนขา, 'out' = กางแขนขาออก
  const isCountingRef = useRef(false); // ป้องกันการนับซ้ำในจังหวะเดียว

  // โหลด MediaPipe Pose
  useEffect(() => {
    let isActive = true;
    let cameraStream = null;
    let animationFrameId = null;
    let poseInstance = null;

    const videoElement = webcamRef.current;
    const canvasElement = canvasRef.current;
    if (!canvasElement || !videoElement) return;

    const canvasCtx = canvasElement.getContext('2d');

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

    // ฟังก์ชันหลักในการตรวจจับท่าทาง
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
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // Callback เมื่อได้ผลลัพธ์จาก AI
        poseInstance.onResults((results) => {
          if (!isActive) return;
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
          
          // วาดภาพจากกล้อง
          if (results.image) {
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
          }

          if (results.poseLandmarks) {
            const landmarks = results.poseLandmarks;

            // วาดจุดและเส้นโครงกระดูก
            canvasCtx.fillStyle = '#FF0000'; // จุดสีแดง
            canvasCtx.strokeStyle = '#00FF00'; // เส้นสีเขียว
            canvasCtx.lineWidth = 2;

            landmarks.forEach((landmark) => {
              const x = landmark.x * canvasElement.width;
              const y = landmark.y * canvasElement.height;
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 4, 0, 2 * Math.PI);
              canvasCtx.fill();
            });

            // --- ลอจิกการตรวจจับท่า "กระโดดตบ" (Jumping Jack) ---
            // อ้างอิงตามดัชนีของ MediaPipe Pose
            // หัวไหล่ซ้าย (11), หัวไหล่ขวา (12)
            // ข้อมือซ้าย (15), ข้อมือขวา (16)
            // ข้อเท้าซ้าย (27), ข้อเท้าขวา (28)
            const leftWrist = landmarks[15];
            const rightWrist = landmarks[16];
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftAnkle = landmarks[27];
            const rightAnkle = landmarks[28];

            if (leftWrist && rightWrist && leftShoulder && rightShoulder && leftAnkle && rightAnkle) {
              // 1. ตรวจสอบท่า "กาง" (OUT): ข้อมือสูงกว่าหัวไหล่ และระยะห่างขามากกว่าเกณฑ์
              const isHandsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
              const isFeetSpread = Math.abs(leftAnkle.x - rightAnkle.x) > 0.3; // เกณฑ์ระยะห่างขา (ปรับได้ตามความเหมาะสม)

              // 2. ตรวจสอบท่า "หุบ" (IN): ข้อมือต่ำกว่าหัวไหล่ และระยะห่างขาน้อยกว่าเกณฑ์
              const isHandsDown = leftWrist.y > leftShoulder.y && rightWrist.y > rightShoulder.y;
              const isFeetClose = Math.abs(leftAnkle.x - rightAnkle.x) < 0.15;

              // อัปเดตสถานะและนับจำนวนครั้ง
              if (isHandsDown && isFeetClose && stageRef.current === 'out') {
                stageRef.current = 'in';
                setExerciseStatus('เตรียมตัว (หุบแขนขา)');
                isCountingRef.current = false; // รีเซ็ตสถานะการนับ
              }

              if (isHandsUp && isFeetSpread && stageRef.current === 'in' && !isCountingRef.current) {
                stageRef.current = 'out';
                setExerciseStatus('ยอดเยี่ยม! กางแขนขาออก');
                setRepCount((prev) => prev + 1);
                isCountingRef.current = true; // ป้องกันการนับซ้ำในจังหวะนี้
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

    // ฟังก์ชันเปิดใช้งานกล้อง
    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: 'user', // ใช้กล้องหน้า
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

        // ส่งเฟรมภาพจากวิดีโอไปยัง MediaPipe Pose อย่างต่อเนื่อง
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

    // เริ่มต้นระบบ AI
    initPose();

    // ฟังก์ชัน Cleanup เมื่อคอมโพเนนต์ถูกทำลาย
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
  }, []); // ทำงานเพียงครั้งเดียวตอนโหลดหน้า

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
          onClick={() => navigate('/exercises')}
          className="px-4 py-2 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600"
        >
          ← กลับไปเลือกท่าอื่น
        </button>
        <button 
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-lg font-semibold bg-gray-800 hover:bg-gray-700"
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