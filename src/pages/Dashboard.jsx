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

      <style>{`\n        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          font-family: "IBM Plex Sans Thai", sans-serif;
          background: #090d0b;
        }

        button, input { font-family: inherit; }

        /* =========================================================
           FITTRACK / REDESIGN 02
           เปลี่ยนเฉพาะการตกแต่ง ไม่แตะ React logic
           ========================================================= */

        .dashboard-page {
          min-height: 100vh;
          padding: 42px 28px 38px;
          color: #f4f8f5;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 0% 0%, rgba(34,197,94,.12), transparent 30%),
            radial-gradient(circle at 100% 8%, rgba(20,184,166,.08), transparent 28%),
            linear-gradient(135deg, #080c0a 0%, #0d1310 48%, #090d0b 100%);
        }

        /* decorative ambient lights */
        .dashboard-page::before {
          content: "";
          position: absolute;
          width: 620px;
          height: 620px;
          left: -310px;
          top: 34%;
          border-radius: 50%;
          border: 1px solid rgba(74,222,128,.055);
          box-shadow:
            0 0 0 70px rgba(74,222,128,.018),
            0 0 0 140px rgba(74,222,128,.012);
          pointer-events: none;
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 430px;
          height: 430px;
          right: -220px;
          bottom: 2%;
          border-radius: 50%;
          background: rgba(34,197,94,.045);
          filter: blur(70px);
          pointer-events: none;
        }

        .top-profile-btn {
          position: fixed;
          top: 22px;
          right: 24px;
          z-index: 30;
          width: 50px;
          height: 50px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          cursor: pointer;
          background: rgba(16,23,19,.92);
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 15px 35px rgba(0,0,0,.30);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: .25s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-3px) rotate(2deg);
          border-color: rgba(74,222,128,.45);
          box-shadow: 0 18px 42px rgba(0,0,0,.38), 0 0 22px rgba(34,197,94,.08);
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #082b18;
          font-size: 17px;
          font-weight: 700;
          background: linear-gradient(145deg, #a7f3b8, #22c55e);
        }

        .profile-status-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          right: -2px;
          bottom: -2px;
          border-radius: 50%;
          background: #4ade80;
          border: 2px solid #0c120f;
          box-shadow: 0 0 0 3px rgba(74,222,128,.13);
        }

        .dashboard-container {
          width: 100%;
          max-width: 1180px;
          position: relative;
          z-index: 1;
          margin: 0 auto;
        }

        /* ---------- HEADER: left aligned / editorial style ---------- */

        .dashboard-header {
          position: relative;
          text-align: left;
          margin: 12px 0 30px;
          padding: 12px 74px 12px 4px;
        }

        .dashboard-header::before {
          content: "SMART HEALTH • 01";
          display: block;
          width: fit-content;
          margin-bottom: 18px;
          padding: 5px 10px;
          border: 1px solid rgba(74,222,128,.20);
          border-radius: 999px;
          color: #6ee79a;
          background: rgba(34,197,94,.045);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 1.8px;
        }

        .logo {
          display: block;
          margin-bottom: 7px;
          color: #6ee79a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 4px;
        }

        .logo::before,
        .logo::after {
          display: none;
        }

        .welcome-icon {
          position: absolute;
          right: 5%;
          top: 20px;
          width: 88px;
          height: 88px;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 28px;
          font-size: 35px;
          background:
            linear-gradient(145deg, rgba(74,222,128,.14), rgba(20,184,166,.045));
          border: 1px solid rgba(74,222,128,.18);
          box-shadow:
            20px 20px 45px rgba(0,0,0,.28),
            inset 0 1px 0 rgba(255,255,255,.08);
          transform: rotate(5deg);
        }

        .dashboard-header h1 {
          max-width: 700px;
          margin: 0;
          font-size: clamp(29px, 4.5vw, 42px);
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: -1px;
        }

        .dashboard-header p {
          max-width: 650px;
          margin: 13px 0 0;
          color: #89978f;
          font-size: 13px;
          line-height: 1.8;
          font-weight: 300;
        }

        /* ---------- GRID ---------- */

        .main-grid {
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          gap: 20px;
          align-items: start;
        }

        .span-2 { grid-column: span 2; }

        /* ---------- CARDS: darker, sharper, less generic ---------- */

        .main-card,
        .feature-card {
          position: relative;
          overflow: hidden;
          padding: 25px;
          border-radius: 18px;
          background: rgba(14,20,17,.88);
          border: 1px solid rgba(255,255,255,.075);
          box-shadow:
            0 20px 55px rgba(0,0,0,.23),
            inset 0 1px 0 rgba(255,255,255,.035);
          transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
        }

        .main-card::before,
        .feature-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 58px;
          border-radius: 0 0 5px 0;
          background: linear-gradient(#4ade80, transparent);
          opacity: .85;
        }

        .main-card::after,
        .feature-card::after {
          content: "";
          position: absolute;
          width: 160px;
          height: 160px;
          right: -95px;
          top: -95px;
          border-radius: 50%;
          border: 1px solid rgba(74,222,128,.08);
          box-shadow: 0 0 0 24px rgba(74,222,128,.018);
          pointer-events: none;
        }

        .main-card:hover,
        .feature-card:hover {
          transform: translateY(-3px);
          border-color: rgba(74,222,128,.17);
          box-shadow:
            0 25px 65px rgba(0,0,0,.30),
            0 0 35px rgba(34,197,94,.035);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 9px;
          color: #f2f7f3;
          font-size: 16px;
          line-height: 1.55;
          font-weight: 600;
        }

        .card-description,
        .card-desc {
          margin: 0 0 19px;
          color: #7f8c84;
          font-size: 12px;
          line-height: 1.75;
          font-weight: 300;
        }

        /* ---------- MENU: large segmented controls ---------- */

        .menu-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .menu-card {
          position: relative;
          min-height: 145px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 17px;
          overflow: hidden;
          text-align: left;
          color: #fff;
          border-radius: 16px;
          cursor: pointer;
          font-family: inherit;
          transition: .25s ease;
        }

        .menu-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          opacity: .75;
        }

        .menu-card::after {
          content: "";
          position: absolute;
          width: 100px;
          height: 100px;
          right: -45px;
          bottom: -48px;
          border-radius: 50%;
          background: rgba(255,255,255,.035);
          transition: .35s ease;
        }

        .exercise-menu {
          background: linear-gradient(150deg, rgba(28,86,50,.30), rgba(13,24,18,.96));
          border: 1px solid rgba(74,222,128,.22);
        }

        .exercise-menu::before {
          background: linear-gradient(90deg, #4ade80, transparent);
        }

        .history-menu {
          background: linear-gradient(150deg, rgba(26,58,68,.34), rgba(12,22,23,.96));
          border: 1px solid rgba(56,189,248,.18);
        }

        .history-menu::before {
          background: linear-gradient(90deg, #38bdf8, transparent);
        }

        .menu-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255,255,255,.20);
          box-shadow: 0 17px 35px rgba(0,0,0,.25);
        }

        .menu-card:hover::after {
          transform: scale(1.5);
        }

        .menu-icon {
          width: 43px;
          height: 43px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          font-size: 20px;
          background: rgba(0,0,0,.17);
          border: 1px solid rgba(255,255,255,.07);
        }

        .menu-content {
          min-width: 0;
        }

        .menu-content h2 {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 600;
        }

        .menu-content p {
          margin: 4px 0 0;
          color: #87958d;
          font-size: 10.5px;
          line-height: 1.65;
          font-weight: 300;
        }

        .arrow {
          position: absolute;
          right: 14px;
          top: 13px;
          margin: 0;
          padding: 0;
          color: #65736b;
          font-size: 19px;
          transition: .25s ease;
        }

        .menu-card:hover .arrow {
          color: #72ee9a;
          transform: translate(3px,-2px);
        }

        /* ---------- INFO STRIP ---------- */

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
          margin-top: 17px;
          padding-top: 15px;
          border-top: 1px solid rgba(255,255,255,.065);
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 9px;
          border-radius: 11px;
          background: rgba(255,255,255,.018);
          border: 1px solid rgba(255,255,255,.045);
        }

        .info-icon {
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          font-size: 14px;
          background: rgba(74,222,128,.055);
        }

        .info-item strong {
          display: block;
          color: #d3ddd6;
          font-size: 9.5px;
          line-height: 1.45;
          font-weight: 600;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #68756e;
          font-size: 8.5px;
          line-height: 1.45;
          font-weight: 300;
        }

        /* ---------- FORM ---------- */

        .bmi-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          color: #a9b4ad;
          font-size: 10.5px;
          font-weight: 500;
        }

        .input-group input {
          width: 100%;
          padding: 12px 13px;
          border-radius: 10px;
          outline: none;
          color: #f5faf6;
          font-size: 12px;
          background: #090e0b;
          border: 1px solid rgba(255,255,255,.09);
          transition: .2s ease;
        }

        .input-group input::placeholder {
          color: #505c55;
        }

        .input-group input:focus {
          border-color: rgba(74,222,128,.58);
          box-shadow: 0 0 0 3px rgba(34,197,94,.08);
          background: #0b120e;
        }

        .action-btn {
          grid-column: 1 / -1;
          width: 100%;
          padding: 11px 14px;
          border: 1px solid rgba(134,239,172,.25);
          border-radius: 10px;
          cursor: pointer;
          color: #061d10;
          font-size: 11.5px;
          font-weight: 700;
          background: linear-gradient(135deg, #86efac, #22c55e);
          box-shadow: 0 10px 25px rgba(34,197,94,.13);
          transition: .2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(34,197,94,.20);
          filter: brightness(1.04);
        }

        .action-btn:active {
          transform: translateY(0);
        }

        .result-box {
          margin-top: 12px;
          padding: 13px;
          border-radius: 11px;
          color: #d8e2db;
          font-size: 11.5px;
          line-height: 1.7;
          background: #090e0b;
          border: 1px solid rgba(255,255,255,.065);
        }

        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 6px; }
        .highlight { color: #70eb96; font-weight: 700; }
        .highlight-warning { color: #facc15; font-weight: 700; }

        /* ---------- FOOD UPLOAD ---------- */

        .upload-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 180px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 15px;
          border: 1px dashed rgba(148,163,184,.28);
          background:
            repeating-linear-gradient(
              -45deg,
              rgba(255,255,255,.018) 0,
              rgba(255,255,255,.018) 1px,
              transparent 1px,
              transparent 9px
            ),
            #090e0b;
          transition: .25s ease;
        }

        .upload-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          top: 13px;
          left: 15px;
          color: #526158;
          font-size: 8px;
          font-weight: 600;
          letter-spacing: 1.5px;
        }

        .upload-box:hover {
          border-color: rgba(56,189,248,.52);
          background-color: #0b1110;
          box-shadow: inset 0 0 30px rgba(56,189,248,.025);
        }

        .upload-placeholder {
          position: relative;
          z-index: 1;
          padding: 0 18px;
          color: #89968e;
          font-size: 11.5px;
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
          font-size: 11px;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }

        .error-text {
          margin: 8px 0 0 !important;
          color: #fca5a5 !important;
          font-size: 11px !important;
          line-height: 1.5;
        }

        /* ---------- MEALS ---------- */

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-bottom: 14px;
        }

        .meal-item {
          position: relative;
          padding: 14px;
          border-radius: 13px;
          background: #0b100d;
          border: 1px solid rgba(255,255,255,.06);
          overflow: hidden;
          transition: .2s ease;
        }

        .meal-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 2px;
          height: 100%;
          background: rgba(103,212,248,.42);
        }

        .meal-item:hover {
          transform: translateY(-2px);
          border-color: rgba(103,212,248,.20);
          background: #0c1310;
        }

        .meal-item strong {
          display: block;
          margin-bottom: 6px;
          color: #67d4f8;
          font-size: 10.5px;
          font-weight: 600;
        }

        .meal-item p {
          margin: 0;
          color: #9ba69f;
          font-size: 10.5px;
          line-height: 1.7;
          font-weight: 300;
        }

        /* ---------- ALERT ---------- */

        .alert-box {
          margin-top: 10px;
          padding: 14px;
          border-radius: 12px;
          font-size: 11.5px;
          line-height: 1.7;
        }

        .alert-success {
          color: #86efac;
          background: rgba(34,197,94,.055);
          border: 1px solid rgba(34,197,94,.20);
        }

        .alert-danger {
          color: #fca5a5;
          background: rgba(239,68,68,.055);
          border: 1px solid rgba(239,68,68,.20);
        }

        .workout-suggestion {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid rgba(255,255,255,.08);
        }

        .workout-suggestion ul {
          margin: 7px 0 10px 18px;
          padding: 0;
        }

        .workout-suggestion li + li {
          margin-top: 4px;
        }

        .start-now-btn {
          padding: 8px 13px;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 8px 20px rgba(239,68,68,.13);
          transition: .2s ease;
        }

        .start-now-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 11px 25px rgba(239,68,68,.20);
        }

        .dashboard-footer {
          text-align: left;
          margin-top: 22px;
          padding: 0 4px;
        }

        .dashboard-footer p {
          margin: 0;
          color: #4f5b54;
          font-size: 9px;
          letter-spacing: 1.2px;
          font-weight: 500;
        }

        @keyframes pulseText {
          0%,100% { opacity: .5; }
          50% { opacity: 1; }
        }

        @media (max-width: 900px) {
          .dashboard-page {
            padding-left: 18px;
            padding-right: 18px;
          }

          .dashboard-header {
            padding-right: 100px;
          }

          .main-card,
          .feature-card {
            padding: 20px;
          }
        }

        @media (max-width: 768px) {
          .dashboard-page {
            padding-top: 25px;
          }

          .top-profile-btn {
            top: 14px;
            right: 14px;
          }

          .dashboard-header {
            margin-top: 26px;
            margin-bottom: 23px;
            padding-right: 80px;
          }

          .dashboard-header h1 {
            font-size: 27px;
          }

          .welcome-icon {
            width: 65px;
            height: 65px;
            right: 2%;
            top: 34px;
            font-size: 27px;
            border-radius: 20px;
          }

          .main-grid {
            grid-template-columns: 1fr;
          }

          .span-2 {
            grid-column: span 1;
          }

          .info-section {
            grid-template-columns: 1fr;
          }

          .meal-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .menu-grid {
            grid-template-columns: 1fr;
          }

          .menu-card {
            min-height: 125px;
          }

          .bmi-form {
            grid-template-columns: 1fr;
          }

          .action-btn {
            grid-column: auto;
          }
        }

        @media (max-width: 480px) {
          .dashboard-page {
            padding: 18px 11px 22px;
          }

          .top-profile-btn {
            top: 10px;
            right: 10px;
            width: 45px;
            height: 45px;
          }

          .dashboard-header {
            margin-top: 35px;
            padding-right: 5px;
          }

          .dashboard-header::before {
            margin-bottom: 14px;
          }

          .dashboard-header h1 {
            font-size: 25px;
            padding-right: 65px;
          }

          .dashboard-header p {
            font-size: 11.5px;
          }

          .welcome-icon {
            width: 52px;
            height: 52px;
            right: 3px;
            top: 47px;
            font-size: 23px;
            border-radius: 16px;
          }

          .main-card,
          .feature-card {
            padding: 17px;
            border-radius: 16px;
          }

          .card-title {
            font-size: 15px;
          }
        }
      `}</style>
    </div>
  );
}
