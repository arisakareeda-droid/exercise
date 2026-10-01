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

  // Food Analysis States
  const [itemImage, setItemImage] = useState(null);
  const [itemCalories, setItemCalories] = useState(0);
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemConfidence, setItemConfidence] = useState(null);
  const [itemNote, setItemNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

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

  // ฟังก์ชันวิเคราะห์ภาพผ่าน API หลังบ้าน
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      setItemCalories(
        Number.isFinite(Number(data.calories)) ? Number(data.calories) : 0
      );
      setItemConfidence(
        Number.isFinite(Number(data.confidence))
          ? Number(data.confidence)
          : null
      );
      setItemNote(data.note || "");
    } catch (error) {
      console.error("Food analysis error:", error);
      setItemName("");
      setItemCategory("");
      setItemCalories(0);
      setItemConfidence(null);
      setItemNote("");
      setAnalysisError(
        error.message || "ไม่สามารถวิเคราะห์ภาพได้ กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calorieSurplus = tdeeResult
    ? itemCalories - Math.round(tdeeResult / 3)
    : 0;

  const requiredSquatReps =
    calorieSurplus > 0 ? Math.ceil(calorieSurplus / 0.32) : 0;

  const requiredJumpingJackReps =
    calorieSurplus > 0 ? Math.ceil(calorieSurplus / 0.2) : 0;

  return (
    <div className="dashboard-page">
      <button
        className="top-profile-btn"
        onClick={() => navigate("/profile")}
        title="โปรไฟล์ของฉัน"
      >
        <div className="profile-avatar">
          <span>{userInitial}</span>
        </div>
        <div className="profile-status-dot"></div>
      </button>

      <div className="dashboard-container">
        <header className="dashboard-header">
          <div className="logo">FITTRACK</div>
          <div className="welcome-icon">🏃</div>
          <h1>ยินดีต้อนรับสู่ FitTrack</h1>
          <p>
            ระบบออกกำลังกายอัจฉริยะ ติดตามสุขภาพ โภชนาการ และ AI ตรวจจับท่าทาง
          </p>
        </header>

        <div className="main-grid">
          {/* เมนูหลัก */}
          <div className="main-card">
            <div className="card-title">
              <span>เริ่มต้นการออกกำลังกาย</span>
            </div>

            <p className="card-description">
              เลือกเมนูที่คุณต้องการใช้งาน
            </p>

            <div className="menu-grid">
              <button
                className="menu-card exercise-menu"
                onClick={() => navigate("/exercises")}
              >
                <div className="menu-icon">🤸</div>

                <div className="menu-content">
                  <h2>เลือกท่าออกกำลังกาย</h2>
                  <p>
                    Squat หรือ Jumping Jack
                    <br />
                    พร้อมระบบ AI นับ Reps
                  </p>
                </div>

                <div className="arrow">→</div>
              </button>

              <button
                className="menu-card history-menu"
                onClick={() => navigate("/history")}
              >
                <div className="menu-icon">📊</div>

                <div className="menu-content">
                  <h2>ประวัติการออกกำลังกาย</h2>
                  <p>
                    ดูผลย้อนหลัง
                    <br />
                    และแคลอรีที่เผาผลาญ
                  </p>
                </div>

                <div className="arrow">→</div>
              </button>
            </div>

            <div className="info-section">
              <div className="info-item">
                <div className="info-icon">🤖</div>
                <div>
                  <strong>AI Detection</strong>
                  <span>ตรวจจับท่าทาง Real-time</span>
                </div>
              </div>

              <div className="info-item">
                <div className="info-icon">🔢</div>
                <div>
                  <strong>นับจำนวนอัตโนมัติ</strong>
                  <span>แม่นยำและปลอดภัย</span>
                </div>
              </div>

              <div className="info-item">
                <div className="info-icon">📈</div>
                <div>
                  <strong>วิเคราะห์สุขภาพ</strong>
                  <span>BMI & Calorie Tracker</span>
                </div>
              </div>
            </div>
          </div>

          {/* คำนวณ BMI และพลังงาน (TDEE) */}
          <div className="feature-card">
            <div className="card-title">
              ⚖️ คำนวณ BMI และพลังงานต่อวัน
            </div>

            <form onSubmit={calculateHealth} className="bmi-form">
              <div className="input-group">
                <label>น้ำหนัก (kg):</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="เช่น 60"
                  required
                />
              </div>

              <div className="input-group">
                <label>ส่วนสูง (cm):</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="เช่น 170"
                  required
                />
              </div>

              <button type="submit" className="action-btn">
                คำนวณค่าสุขภาพ
              </button>
            </form>

            {bmiResult && (
              <div className="result-box">
                <p>
                  <strong>ค่า BMI:</strong>{" "}
                  <span className="highlight">{bmiResult.value}</span>{" "}
                  ({bmiResult.status})
                </p>

                <p>
                  <strong>พลังงานที่ควรได้รับต่อวัน (TDEE):</strong>{" "}
                  <span className="highlight">{tdeeResult} kcal</span>
                </p>
              </div>
            )}
          </div>

          {/* เพิ่มรูปอาหาร เครื่องดื่ม หรือขนม */}
          <div className="feature-card">
            <div className="card-title">
              🍰🥤🍲 เพิ่มรูปอาหาร เครื่องดื่ม หรือขนม
            </div>

            <p className="card-desc">
              อัปโหลดรูปภาพเพื่อประเมินพลังงานทุกหมวดหมู่
            </p>

            <label className="upload-box">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: "none" }}
              />

              {itemImage ? (
                <img
                  src={itemImage}
                  alt="Selected Item"
                  className="food-preview"
                />
              ) : (
                <div className="upload-placeholder">
                  📁 คลิกอัปโหลดรูป (อาหาร, เครื่องดื่ม, ขนม)
                </div>
              )}
            </label>

            {isAnalyzing && (
              <p className="scanning-text">
                🔍 AI กำลังมองภาพและวิเคราะห์เมนู...
              </p>
            )}

            {analysisError && (
              <p
                className="error-text"
                style={{
                  color: "#f87171",
                  fontSize: "13px",
                  marginTop: "8px",
                }}
              >
                ⚠️ {analysisError}
              </p>
            )}

            {itemName && !isAnalyzing && (
              <div className="result-box">
                <p>
                  🏷️ หมวดหมู่: <strong>{itemCategory}</strong>
                </p>

                <p>
                  🍽️ รายการ: <strong>{itemName}</strong>
                </p>

                <p>
                  🔥 พลังงาน:{" "}
                  <span className="highlight-warning">
                    {itemCalories} kcal
                  </span>
                </p>

                {itemConfidence !== null && (
                  <p style={{ fontSize: "11px", color: "#38bdf8" }}>
                    ความมั่นใจ: {itemConfidence}%
                  </p>
                )}
              </div>
            )}
          </div>

          {/* แนะนำอาหาร & แจ้งเตือนพลังงานเกิน */}
          <div className="feature-card span-2">
            <div className="card-title">
              🥗 เมนูอาหารแนะนำประจำวัน & แผนออกกำลังกายชดเชย
            </div>

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
              <div
                className={`alert-box ${
                  calorieSurplus > 0
                    ? "alert-danger"
                    : "alert-success"
                }`}
              >
                {calorieSurplus > 0 ? (
                  <>
                    ⚠️ <strong>แจ้งเตือน!</strong> พลังงานจากรายการนี้
                    (รวมเครื่องดื่ม/ขนม) เกินเกณฑ์เฉลี่ยไปประมาณ{" "}
                    <strong>{calorieSurplus} kcal</strong>

                    <div className="workout-suggestion">
                      🎯 <strong>คำแนะนำท่าออกกำลังกายชดเชย:</strong>

                      <ul>
                        <li>
                          🏋️ ทำท่า <strong>Squat</strong> จำนวน{" "}
                          <strong>{requiredSquatReps} ครั้ง</strong>
                        </li>

                        <li>
                          ⭐ หรือทำท่า <strong>Jumping Jack</strong> จำนวน{" "}
                          <strong>{requiredJumpingJackReps} ครั้ง</strong>
                        </li>
                      </ul>

                      <button
                        onClick={() => navigate("/exercises")}
                        className="start-now-btn"
                      >
                        ไปออกกำลังกายตอนนี้เลย
                      </button>
                    </div>
                  </>
                ) : (
                  <p>
                    ✅ พลังงานจากรายการนี้อยู่ในเกณฑ์ที่เหมาะสม เยี่ยมมาก!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="dashboard-footer">
          <p>FITTRACK • Smart Exercise System</p>
        </footer>
      </div>

      <style>{`\n        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&family=Kanit:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          font-family: "Prompt", "Kanit", sans-serif;
          background: #090d0b;
        }

        button, input { font-family: inherit; }

        .dashboard-page {
          min-height: 100vh;
          padding: 30px 22px 32px;
          display: flex;
          justify-content: center;
          position: relative;
          overflow: hidden;
          color: #f7faf8;
          background:
            radial-gradient(circle at 8% 4%, rgba(34,197,94,.14), transparent 28%),
            radial-gradient(circle at 96% 10%, rgba(56,189,248,.075), transparent 25%),
            radial-gradient(circle at 50% 105%, rgba(34,197,94,.065), transparent 38%),
            linear-gradient(145deg, #0a0e0c 0%, #101512 48%, #0b0f0d 100%);
        }

        .dashboard-page::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .32;
          background-image:
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, #000 0%, transparent 86%);
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 520px;
          height: 520px;
          left: 50%;
          top: -300px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: rgba(74,222,128,.035);
          filter: blur(40px);
          pointer-events: none;
        }

        .top-profile-btn {
          position: fixed;
          top: 18px;
          right: 20px;
          z-index: 20;
          display: flex;
          align-items: center;
          padding: 5px;
          border-radius: 999px;
          cursor: pointer;
          background: rgba(15,22,18,.82);
          border: 1px solid rgba(255,255,255,.10);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 14px 36px rgba(0,0,0,.30);
          transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-2px) scale(1.025);
          border-color: rgba(74,222,128,.42);
          box-shadow: 0 18px 42px rgba(0,0,0,.36), 0 0 0 4px rgba(34,197,94,.055);
        }

        .profile-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #062d17;
          font-size: 16px;
          font-weight: 700;
          background: linear-gradient(145deg, #86efac, #22c55e);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.22);
        }

        .profile-status-dot {
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #101512;
          box-shadow: 0 0 0 3px rgba(34,197,94,.13);
        }

        .dashboard-container {
          width: 100%;
          max-width: 1120px;
          position: relative;
          z-index: 1;
        }

        .dashboard-header {
          text-align: center;
          margin: 22px auto 30px;
          padding: 8px 12px;
        }

        .logo {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 13px;
          color: #65e68a;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 4px;
          text-shadow: 0 0 25px rgba(74,222,128,.20);
        }

        .logo::before, .logo::after {
          content: "";
          width: 30px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(74,222,128,.58));
        }

        .logo::after { transform: rotate(180deg); }

        .welcome-icon {
          width: 72px;
          height: 72px;
          margin: 0 auto 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 23px;
          font-size: 31px;
          background:
            linear-gradient(145deg, rgba(34,197,94,.18), rgba(34,197,94,.035)),
            rgba(255,255,255,.018);
          border: 1px solid rgba(74,222,128,.24);
          box-shadow: 0 16px 40px rgba(0,0,0,.23), inset 0 1px 0 rgba(255,255,255,.07);
          transform: rotate(-3deg);
          transition: transform .25s ease;
        }

        .welcome-icon:hover { transform: rotate(0deg) translateY(-2px); }

        .dashboard-header h1 {
          margin: 0;
          font-size: clamp(26px, 4vw, 34px);
          line-height: 1.25;
          font-weight: 700;
          letter-spacing: -.5px;
        }

        .dashboard-header p {
          max-width: 700px;
          margin: 10px auto 0;
          color: #98a49d;
          font-size: 13px;
          line-height: 1.8;
          font-weight: 300;
        }

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 18px;
        }

        .span-2 { grid-column: span 2; }

        .main-card, .feature-card {
          position: relative;
          overflow: hidden;
          padding: 24px;
          border-radius: 22px;
          background:
            linear-gradient(145deg, rgba(27,35,30,.96), rgba(14,20,17,.98));
          border: 1px solid rgba(255,255,255,.075);
          box-shadow:
            0 18px 55px rgba(0,0,0,.25),
            inset 0 1px 0 rgba(255,255,255,.035);
          transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease;
        }

        .main-card::before, .feature-card::before {
          content: "";
          position: absolute;
          width: 210px;
          height: 210px;
          right: -120px;
          top: -120px;
          border-radius: 50%;
          background: rgba(34,197,94,.055);
          pointer-events: none;
        }

        .main-card::after, .feature-card::after {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.10), transparent);
          pointer-events: none;
        }

        .main-card:hover, .feature-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,.11);
          box-shadow: 0 22px 62px rgba(0,0,0,.29), inset 0 1px 0 rgba(255,255,255,.045);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 8px;
          color: #f6faf7;
          font-size: 17px;
          line-height: 1.5;
          font-weight: 700;
        }

        .card-description, .card-desc {
          margin: 0 0 18px;
          color: #8f9c95;
          font-size: 12.5px;
          line-height: 1.75;
          font-weight: 300;
        }

        .menu-grid {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        .menu-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 16px;
          overflow: hidden;
          text-align: left;
          color: white;
          border-radius: 16px;
          cursor: pointer;
          font-family: inherit;
          transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease, background .22s ease;
        }

        .menu-card::after {
          content: "";
          position: absolute;
          width: 145px;
          height: 145px;
          right: -72px;
          top: -72px;
          border-radius: 50%;
          background: rgba(255,255,255,.035);
          transition: transform .32s ease;
        }

        .exercise-menu {
          background: linear-gradient(135deg, rgba(34,197,94,.14), rgba(20,27,23,.94));
          border: 1px solid rgba(34,197,94,.25);
        }

        .history-menu {
          background: linear-gradient(135deg, rgba(59,130,246,.12), rgba(20,25,24,.96));
          border: 1px solid rgba(96,165,250,.21);
        }

        .menu-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255,255,255,.18);
          box-shadow: 0 14px 30px rgba(0,0,0,.25);
        }

        .menu-card:hover::after { transform: scale(1.25); }

        .menu-icon {
          flex: 0 0 auto;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          font-size: 23px;
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.07);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        }

        .menu-content { min-width: 0; }

        .menu-content h2 {
          margin: 0;
          font-size: 15px;
          line-height: 1.5;
          font-weight: 600;
        }

        .menu-content p {
          margin: 4px 0 0;
          color: #98a49d;
          font-size: 11.5px;
          line-height: 1.6;
          font-weight: 300;
        }

        .arrow {
          margin-left: auto;
          padding-left: 7px;
          color: #6f7b74;
          font-size: 21px;
          transition: transform .22s ease, color .22s ease;
        }

        .menu-card:hover .arrow {
          transform: translateX(4px);
          color: #65e68a;
        }

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 20px;
          padding-top: 17px;
          border-top: 1px solid rgba(255,255,255,.07);
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 10px;
          border-radius: 13px;
          background: rgba(9,14,11,.55);
          border: 1px solid rgba(255,255,255,.05);
          transition: transform .2s ease, border-color .2s ease;
        }

        .info-item:hover {
          transform: translateY(-2px);
          border-color: rgba(74,222,128,.18);
        }

        .info-icon {
          flex: 0 0 auto;
          width: 31px;
          height: 31px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          font-size: 16px;
          background: rgba(255,255,255,.045);
        }

        .info-item strong {
          display: block;
          color: #d8e0db;
          font-size: 10.5px;
          line-height: 1.45;
          font-weight: 600;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #727e76;
          font-size: 9.5px;
          line-height: 1.45;
          font-weight: 300;
        }

        .bmi-form {
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          color: #aeb8b2;
          font-size: 11.5px;
          font-weight: 500;
        }

        .input-group input {
          width: 100%;
          padding: 11px 12px;
          border-radius: 11px;
          outline: none;
          color: #fff;
          font-size: 12.5px;
          background: rgba(7,11,9,.78);
          border: 1px solid rgba(255,255,255,.10);
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease, transform .2s ease;
        }

        .input-group input::placeholder { color: #59635d; }

        .input-group input:focus {
          background: rgba(8,13,10,.95);
          border-color: rgba(74,222,128,.55);
          box-shadow: 0 0 0 4px rgba(34,197,94,.08);
          transform: translateY(-1px);
        }

        .action-btn {
          width: 100%;
          margin-top: 2px;
          padding: 11px 13px;
          border: 0;
          border-radius: 11px;
          cursor: pointer;
          color: #052e16;
          font-size: 12.5px;
          font-weight: 700;
          background: linear-gradient(135deg, #86efac, #22c55e);
          box-shadow: 0 9px 22px rgba(34,197,94,.16);
          transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow: 0 12px 28px rgba(34,197,94,.23);
        }

        .action-btn:active { transform: translateY(0); }

        .result-box {
          margin-top: 12px;
          padding: 13px 14px;
          border-radius: 13px;
          color: #dbe4de;
          font-size: 12px;
          line-height: 1.7;
          background: rgba(8,13,10,.70);
          border: 1px solid rgba(255,255,255,.075);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
        }

        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 6px; }
        .highlight { color: #65e68a; font-weight: 700; }
        .highlight-warning { color: #facc15; font-weight: 700; }

        .upload-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 174px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 15px;
          border: 1.5px dashed rgba(148,163,184,.28);
          background:
            linear-gradient(145deg, rgba(255,255,255,.028), rgba(255,255,255,.012)),
            rgba(8,13,10,.50);
          transition: border-color .22s ease, background .22s ease, transform .22s ease, box-shadow .22s ease;
        }

        .upload-box::before {
          content: "";
          position: absolute;
          inset: 9px;
          border: 1px solid rgba(255,255,255,.025);
          border-radius: 11px;
          pointer-events: none;
        }

        .upload-box:hover {
          transform: translateY(-1px);
          border-color: rgba(56,189,248,.48);
          background: rgba(56,189,248,.035);
          box-shadow: 0 12px 28px rgba(0,0,0,.16);
        }

        .upload-placeholder {
          position: relative;
          z-index: 1;
          padding: 0 18px;
          color: #9ba69f;
          font-size: 12px;
          line-height: 1.7;
          text-align: center;
        }

        .food-preview {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .scanning-text {
          margin: 8px 0 0;
          color: #38bdf8;
          font-size: 11.5px;
          line-height: 1.5;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }

        .error-text {
          margin: 8px 0 0 !important;
          color: #fca5a5 !important;
          font-size: 11.5px !important;
          line-height: 1.5;
        }

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 15px;
        }

        .meal-item {
          position: relative;
          padding: 14px;
          border-radius: 14px;
          font-size: 11px;
          line-height: 1.65;
          background: linear-gradient(145deg, rgba(255,255,255,.038), rgba(255,255,255,.012));
          border: 1px solid rgba(255,255,255,.065);
          transition: transform .2s ease, border-color .2s ease, background .2s ease;
        }

        .meal-item:hover {
          transform: translateY(-2px);
          border-color: rgba(56,189,248,.22);
          background: rgba(56,189,248,.035);
        }

        .meal-item strong {
          display: block;
          margin-bottom: 6px;
          color: #67d4f8;
          font-size: 11px;
          font-weight: 600;
        }

        .meal-item p {
          margin: 0;
          color: #aeb8b2;
          font-weight: 300;
        }

        .alert-box {
          margin-top: 10px;
          padding: 14px;
          border-radius: 13px;
          font-size: 12px;
          line-height: 1.7;
        }

        .alert-success {
          color: #86efac;
          background: rgba(34,197,94,.075);
          border: 1px solid rgba(34,197,94,.24);
        }

        .alert-danger {
          color: #fca5a5;
          background: rgba(239,68,68,.075);
          border: 1px solid rgba(239,68,68,.23);
        }

        .workout-suggestion {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid rgba(255,255,255,.09);
        }

        .workout-suggestion ul {
          margin: 7px 0 10px 18px;
          padding: 0;
        }

        .workout-suggestion li + li { margin-top: 4px; }

        .start-now-btn {
          padding: 8px 13px;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
          color: #fff;
          font-size: 11.5px;
          font-weight: 600;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 7px 18px rgba(239,68,68,.14);
          transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }

        .start-now-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.04);
          box-shadow: 0 10px 23px rgba(239,68,68,.22);
        }

        .dashboard-footer {
          text-align: center;
          margin-top: 25px;
          padding: 2px 0;
        }

        .dashboard-footer p {
          margin: 0;
          color: #59635d;
          font-size: 10px;
          letter-spacing: 1.2px;
          font-weight: 400;
        }

        @keyframes pulseText {
          0%,100% { opacity: .55; }
          50% { opacity: 1; }
        }

        @media (max-width: 900px) {
          .dashboard-page { padding-left: 16px; padding-right: 16px; }
          .main-card, .feature-card { padding: 20px; }
        }

        @media (max-width: 768px) {
          .dashboard-page { padding-top: 25px; }
          .top-profile-btn { top: 14px; right: 14px; }
          .dashboard-header { margin-top: 24px; margin-bottom: 23px; }
          .dashboard-header h1 { font-size: 25px; }
          .dashboard-header p { font-size: 12.5px; }
          .main-grid { grid-template-columns: 1fr; }
          .span-2 { grid-column: span 1; }
          .info-section { grid-template-columns: 1fr; }
          .meal-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 480px) {
          .dashboard-page { padding: 18px 11px 22px; }
          .top-profile-btn { top: 10px; right: 10px; }
          .profile-avatar { width: 39px; height: 39px; }
          .dashboard-header { margin-top: 34px; }
          .welcome-icon { width: 60px; height: 60px; border-radius: 18px; font-size: 27px; }
          .main-card, .feature-card { padding: 17px; border-radius: 18px; }
          .card-title { font-size: 16px; }
          .menu-card { padding: 14px; }
          .menu-icon { width: 44px; height: 44px; }
        }
      `}</style>
    </div>
  );
}
