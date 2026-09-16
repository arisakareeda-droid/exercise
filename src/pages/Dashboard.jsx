import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export default function Dashboard() {
  const navigate = useNavigate();
  const [userInitial, setUserInitial] = useState("?");
  
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("21");
  const [bmiResult, setBmiResult] = useState(null);
  const [tdeeResult, setTdeeResult] = useState(null);

  const [itemImage, setItemImage] = useState(null);
  const [itemCalories, setItemCalories] = useState(0);
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const snap = await getDoc(doc(db, "users", currentUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.name) setUserInitial(data.name.charAt(0).toUpperCase());
            if (data.weight) setWeight(data.weight);
            if (data.height) setHeight(data.height);
          } else if (currentUser.email) {
            setUserInitial(currentUser.email.charAt(0).toUpperCase());
          }
        } catch (err) {
          console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const calculateHealth = (e) => {
    e.preventDefault();
    if (!weight || !height) return;
    const hM = height / 100;
    const bmi = (weight / (hM * hM)).toFixed(1);
    
    let status = "";
    if (bmi < 18.5) status = "น้ำหนักน้อยกว่าเกณฑ์";
    else if (bmi < 25) status = "น้ำหนักปกติ (สมส่วน)";
    else if (bmi < 30) status = "น้ำหนักเกินเกณฑ์";
    else status = "โรคอ้วน";

    setBmiResult({ value: bmi, status });
    const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    const tdee = Math.round(bmr * 1.55);
    setTdeeResult(tdee);
  };

  // ฟังก์ชันวิเคราะห์ภาพ: รับไฟล์ภาพจากเครื่องมาแสดง แล้วสุ่มวิเคราะห์เมนูโภชนาการจากฐานข้อมูล
  const handleImageSelect = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // ตรวจสอบว่าเป็นรูปภาพหรือไม่
  if (!file.type.startsWith("image/")) {
    setAnalysisError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
    setItemImage(null);
    setItemName("");
    setItemCategory("");
    setItemCalories(0);
    setItemConfidence(null);
    setItemNote("");
    return;
  }

  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    setAnalysisError("ขนาดรูปภาพต้องไม่เกิน 10 MB");
    return;
  }

  setAnalysisError("");
  setItemName("");
  setItemCategory("");
  setItemCalories(0);
  setItemConfidence(null);
  setItemNote("");

  // แสดงรูปภาพตัวอย่างทันที
  const imageUrl = URL.createObjectURL(file);
  setItemImage(imageUrl);
  setIsAnalyzing(true);
  setItemName("กำลังวิเคราะห์ภาพอาหารด้วย AI...");

  try {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/analyze-food", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "ไม่สามารถวิเคราะห์ภาพได้");
    }

    setItemName(data.name || "ไม่สามารถระบุได้ชัดเจน");
    setItemCategory(data.category || "ไม่สามารถระบุได้");
    setItemCalories(Number.isFinite(Number(data.calories)) ? Number(data.calories) : 0);
    setItemConfidence(Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : null);
    setItemNote(data.note || "");

  } catch (error) {
    console.error("Food analysis error:", error);
    setItemName("");
    setItemCategory("");
    setItemCalories(0);
    setItemConfidence(null);
    setItemNote("");
    setAnalysisError(error.message || "ไม่สามารถวิเคราะห์ภาพได้ กรุณาลองใหม่อีกครั้ง");
  } finally {
    setIsAnalyzing(false);
  }
};

  const calorieSurplus = tdeeResult ? itemCalories - Math.round(tdeeResult / 3) : 0;
  const requiredSquatReps = calorieSurplus > 0 ? Math.ceil(calorieSurplus / 0.32) : 0;
  const requiredJumpingJackReps = calorieSurplus > 0 ? Math.ceil(calorieSurplus / 0.20) : 0;

  return (
    <div className="dashboard-page">
      <button className="top-profile-btn" onClick={() => navigate("/profile")} title="โปรไฟล์ของฉัน">
        <div className="profile-avatar"><span>{userInitial}</span></div>
        <div className="profile-status-dot"></div>
      </button>

      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="logo">FITTRACK</div>
          <div className="welcome-icon">🏃</div>
          <h1>ยินดีต้อนรับสู่ FitTrack</h1>
          <p>ระบบออกกำลังกายอัจฉริยะ ติดตามสุขภาพ โภชนาการ และ AI ตรวจจับท่าทาง</p>
        </header>

        <div className="main-grid">
          {/* เมนูหลัก */}
          <div className="main-card">
            <div className="card-title"><span>เริ่มต้นการออกกำลังกาย</span></div>
            <p className="card-description">เลือกเมนูที่คุณต้องการใช้งาน</p>

            <div className="menu-grid">
              <button className="menu-card exercise-menu" onClick={() => navigate("/exercises")}>
                <div className="menu-icon">🤸</div>
                <div className="menu-content">
                  <h2>เลือกท่าออกกำลังกาย</h2>
                  <p>Squat หรือ Jumping Jack<br />พร้อมระบบ AI นับ Reps</p>
                </div>
                <div className="arrow">→</div>
              </button>

              <button className="menu-card history-menu" onClick={() => navigate("/history")}>
                <div className="menu-icon">📊</div>
                <div className="menu-content">
                  <h2>ประวัติการออกกำลังกาย</h2>
                  <p>ดูผลย้อนหลัง<br />และแคลอรีที่เผาผลาญ</p>
                </div>
                <div className="arrow">→</div>
              </button>
            </div>

            <div className="info-section">
              <div className="info-item">
                <div className="info-icon">🤖</div>
                <div><strong>AI Detection</strong><span>ตรวจจับท่าทาง Real-time</span></div>
              </div>
              <div className="info-item">
                <div className="info-icon">🔢</div>
                <div><strong>นับจำนวนอัตโนมัติ</strong><span>แม่นยำและปลอดภัย</span></div>
              </div>
              <div className="info-item">
                <div className="info-icon">📈</div>
                <div><strong>วิเคราะห์สุขภาพ</strong><span>BMI & Calorie Tracker</span></div>
              </div>
            </div>
          </div>

          {/* คำนวณ BMI และพลังงาน (TDEE) */}
          <div className="feature-card">
            <div className="card-title">⚖️ คำนวณ BMI และพลังงานต่อวัน</div>
            <form onSubmit={calculateHealth} className="bmi-form">
              <div className="input-group">
                <label>น้ำหนัก (kg):</label>
                <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="เช่น 60" required />
              </div>
              <div className="input-group">
                <label>ส่วนสูง (cm):</label>
                <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="เช่น 170" required />
              </div>
              <button type="submit" className="action-btn">คำนวณค่าสุขภาพ</button>
            </form>

            {bmiResult && (
              <div className="result-box">
                <p><strong>ค่า BMI:</strong> <span className="highlight">{bmiResult.value}</span> ({bmiResult.status})</p>
                <p><strong>พลังงานที่ควรได้รับต่อวัน (TDEE):</strong> <span className="highlight">{tdeeResult} kcal</span></p>
              </div>
            )}
          </div>

          {/* เพิ่มรูปอาหาร เครื่องดื่ม หรือขนมเพื่อคำนวณแคลอรี */}
          <div className="feature-card">
            <div className="card-title">🍰🥤🍲 เพิ่มรูปอาหาร เครื่องดื่ม หรือขนม</div>
            <p className="card-desc">อัปโหลดรูปภาพเพื่อประเมินพลังงานทุกหมวดหมู่</p>
            
            <label className="upload-box">
              <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
              {itemImage ? (
                <img src={itemImage} alt="Selected Item" className="food-preview" />
              ) : (
                <div className="upload-placeholder">📁 คลิกอัปโหลดรูป (อาหาร, เครื่องดื่ม, ขนม)</div>
              )}
            </label>

            {isAnalyzing && <p className="scanning-text">🔍 AI กำลังมองภาพและวิเคราะห์เมนู...</p>}
            
            {itemName && !isAnalyzing && (
              <div className="result-box">
                <p>🏷️ หมวดหมู่: <strong>{itemCategory}</strong></p>
                <p>🍽️ รายการ: <strong>{itemName}</strong></p>
                <p>🔥 พลังงาน: <span className="highlight-warning">{itemCalories} kcal</span></p>
              </div>
            )}
          </div>

          {/* แนะนำอาหาร & แจ้งเตือนพลังงานเกิน */}
          <div className="feature-card span-2">
            <div className="card-title">🥗 เมนูอาหารแนะนำประจำวัน & แผนออกกำลังกายชดเชย</div>
            
            <div className="meal-grid">
              <div className="meal-item">
                <strong>🌅 มื้อเช้า (~400 kcal)</strong>
                <p>ข้าวต้มปลา / โจ๊กหมูใส่ไข่ / ขนมปังโฮลวีท</p>
              </div>
              <div className="meal-item">
                <strong>☀️ มื้อกลางวัน (~550 kcal)</strong>
                <p>เกี๊ยวน้ำหมูแดง / ข้าวราดแกง / ส้มตำอกไก่</p>
              </div>
              <div className="meal-item">
                <strong>🌙 มื้อเย็น (~350 kcal)</strong>
                <p>แกงจืดเต้าหู้หมูสับ / สลัดปลาทูน่า</p>
              </div>
            </div>

            {itemCalories > 0 && tdeeResult && (
              <div className={`alert-box ${calorieSurplus > 0 ? 'alert-danger' : 'alert-success'}`}>
                {calorieSurplus > 0 ? (
                  <>
                    ⚠️ <strong>แจ้งเตือน!</strong> พลังงานจากรายการนี้ (รวมเครื่องดื่ม/ขนม) เกินเกณฑ์เฉลี่ยไปประมาณ <strong>{calorieSurplus} kcal</strong>
                    <div className="workout-suggestion">
                      🎯 <strong>คำแนะนำท่าออกกำลังกายชดเชย:</strong>
                      <ul>
                        <li>🏋️ ทำท่า <strong>Squat</strong> จำนวน <strong>{requiredSquatReps} ครั้ง</strong></li>
                        <li>⭐ หรือทำท่า <strong>Jumping Jack</strong> จำนวน <strong>{requiredJumpingJackReps} ครั้ง</strong></li>
                      </ul>
                      <button onClick={() => navigate("/exercises")} className="start-now-btn">ไปออกกำลังกายตอนนี้เลย</button>
                    </div>
                  </>
                ) : (
                  <p>✅ พลังงานจากรายการนี้อยู่ในเกณฑ์ที่เหมาะสม เยี่ยมมาก!</p>
                )}
              </div>
            )}
          </div>

        </div>

        <footer className="dashboard-footer">
          <p>FITTRACK • Smart Exercise System</p>
        </footer>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Noto Sans Thai", "Segoe UI", sans-serif; }
        .dashboard-page {
          min-height: 100vh; background: radial-gradient(circle at top right, rgba(34, 197, 94, 0.1), transparent 35%), linear-gradient(135deg, #0f1115 0%, #15171d 50%, #101216 100%);
          color: white; padding: 45px 20px; display: flex; justify-content: center; position: relative;
        }
        .top-profile-btn {
          position: absolute; top: 24px; right: 28px; background: rgba(26, 29, 36, 0.85); border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 4px; border-radius: 50px; display: flex; align-items: center; cursor: pointer; backdrop-filter: blur(8px); z-index: 10;
        }
        .profile-avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
        .profile-status-dot { position: absolute; bottom: 4px; right: 4px; width: 11px; height: 11px; background-color: #22c55e; border: 2px solid #15171d; border-radius: 50%; }
        .dashboard-container { width: 100vw; max-width: 1000px; }
        .dashboard-header { text-align: center; margin-bottom: 28px; }
        .logo { color: #22c55e; font-size: 15px; font-weight: 800; letter-spacing: 4px; margin-bottom: 10px; }
        .welcome-icon { width: 60px; height: 60px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); font-size: 28px; }
        .dashboard-header h1 { margin: 0; font-size: 28px; font-weight: 700; }
        .dashboard-header p { color: #9ca3af; font-size: 15px; margin-top: 8px; }

        .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .span-2 { grid-column: span 2; }

        .main-card, .feature-card {
          padding: 24px; background: rgba(29, 31, 31, 0.92); border: 1px solid #333636; border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .card-title { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 8px; }
        .card-description, .card-desc { color: #8f969f; font-size: 13px; margin-bottom: 18px; }

        .menu-grid { display: flex; flex-direction: column; gap: 12px; }
        .menu-card {
          position: relative; display: flex; align-items: center; gap: 15px; width: 100%; padding: 18px; text-align: left; border-radius: 12px; cursor: pointer; color: white; transition: 0.2s;
        }
        .exercise-menu { background: linear-gradient(135deg, rgba(34, 197, 94, 0.13), rgba(29, 31, 31, 0.95)); border: 1px solid rgba(34, 197, 94, 0.35); }
        .history-menu { background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(29, 31, 31, 0.95)); border: 1px solid rgba(59, 130, 246, 0.25); }
        .menu-card:hover { transform: translateY(-2px); }
        .menu-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 10px; font-size: 24px; background: rgba(255,255,255,0.05); }
        .menu-content h2 { margin: 0; font-size: 16px; font-weight: 700; }
        .menu-content p { margin: 4px 0 0; color: #9ca3af; font-size: 12px; }
        .arrow { margin-left: auto; font-size: 20px; color: #6b7280; }

        .info-section { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #303333; }
        .info-item { display: flex; align-items: center; gap: 8px; padding: 10px; background: #181a1a; border-radius: 8px; }
        .info-icon { font-size: 18px; }
        .info-item strong { display: block; color: #d7d9dc; font-size: 11px; }
        .info-item span { display: block; color: #747b84; font-size: 10px; }

        .bmi-form { display: flex; flex-direction: column; gap: 12px; }
        .input-group { display: flex; flex-direction: column; gap: 4px; }
        .input-group label { font-size: 12px; color: #aaa; }
        .input-group input { padding: 10px; border-radius: 8px; background: #121212; border: 1px solid #444; color: #fff; }
        .action-btn { padding: 10px; background: #22c55e; color: #000; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .action-btn:hover { background: #16a34a; color: #fff; }
        .result-box { margin-top: 12px; padding: 12px; background: #181a1a; border-radius: 8px; border: 1px solid #333; font-size: 13px; }
        .highlight { color: #4ade80; font-weight: bold; }
        .highlight-warning { color: #facc15; font-weight: bold; }

        .upload-box {
          display: flex; align-items: center; justify-content: center; width: 100%; height: 140px; border: 2px dashed #444; border-radius: 10px; cursor: pointer; background: #181a1a; overflow: hidden; position: relative;
        }
        .upload-placeholder { color: #aaa; font-size: 13px; text-align: center; padding: 0 10px; }
        .food-preview { width: 100%; height: 100%; object-fit: cover; }
        .scanning-text { text-align: center; color: #38bdf8; font-size: 13px; margin-top: 8px; }

        .meal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
        .meal-item { background: #181a1a; padding: 12px; border-radius: 8px; font-size: 12px; border: 1px solid #333; }
        .meal-item strong { color: #38bdf8; display: block; margin-bottom: 6px; }
        .meal-item p { margin: 0; color: #bbb; }

        .alert-box { padding: 14px; border-radius: 10px; font-size: 13px; margin-top: 10px; }
        .alert-success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #4ade80; }
        .alert-danger { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; }
        .workout-suggestion { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); }
        .workout-suggestion ul { margin: 6px 0 10px 16px; padding: 0; }
        .start-now-btn { padding: 6px 12px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
        .start-now-btn:hover { background: #dc2626; }

        .dashboard-footer { text-align: center; margin-top: 25px; }
        .dashboard-footer p { margin: 0; color: #555b63; font-size: 12px; letter-spacing: 1px; }

        @media (max-width: 768px) {
          .main-grid { grid-template-columns: 1fr; }
          .span-2 { grid-column: span 1; }
          .meal-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}