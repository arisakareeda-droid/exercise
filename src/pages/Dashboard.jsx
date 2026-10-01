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
            เพิ่มรูปอาหาร เครื่องดื่ม หรือขนม
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
                  <span className="camera-icon">📷</span>
                  <strong>คลิกเพื่ออัปโหลดรูป</strong>
                  <small>อาหาร • เครื่องดื่ม • ขนม</small>
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

      <style>{`\n        @import url('https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: #f0f4f8;
          color: #172b4d;
          font-family: "Noto Sans Thai", sans-serif;
        }

        button,
        input {
          font-family: inherit;
        }

        /* =========================================================
           FITTRACK V5 — CLEAN BLUE SYSTEM
           โครงสร้างใหม่: Header → Health row → Workout → Daily plan
           เปลี่ยนเฉพาะ CSS / layout / visual design
           ========================================================= */

        .dashboard-page {
          min-height: 100vh;
          padding: 32px 30px 44px;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(180deg, #f8fbff 0%, #f2f6fa 48%, #eef3f8 100%);
        }

        .dashboard-page::before {
          content: "";
          position: absolute;
          width: 520px;
          height: 520px;
          left: -300px;
          top: 120px;
          border-radius: 50%;
          background: rgba(24,119,242,.035);
          pointer-events: none;
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 420px;
          height: 420px;
          right: -250px;
          bottom: 70px;
          border-radius: 50%;
          background: rgba(24,119,242,.025);
          pointer-events: none;
        }

        .dashboard-container {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        /* ---------- PROFILE ---------- */

        .top-profile-btn {
          position: fixed;
          top: 19px;
          right: 24px;
          z-index: 50;
          width: 46px;
          height: 46px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d5e0eb;
          border-radius: 50%;
          cursor: pointer;
          background: #fff;
          box-shadow: 0 7px 22px rgba(23,43,77,.12);
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-2px);
          border-color: #1877f2;
          box-shadow: 0 11px 28px rgba(24,119,242,.16);
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          background: #1877f2;
        }

        .profile-status-dot {
          position: absolute;
          right: 0;
          bottom: 1px;
          width: 10px;
          height: 10px;
          border: 2px solid #fff;
          border-radius: 50%;
          background: #31a24c;
        }

        /* ---------- HEADER ---------- */

        .dashboard-header {
          position: relative;
          min-height: 158px;
          margin: 0 0 22px;
          padding: 20px 90px 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-bottom: 1px solid #dfe7ef;
        }

        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin: 0 0 8px;
          color: #1877f2;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1.7px;
        }

        .logo::before {
          content: "FITTRACK";
        }

        .logo::after {
          display: none;
        }

        .dashboard-header h1 {
          max-width: 850px;
          margin: 0;
          color: #162b49;
          font-family: "Mitr", sans-serif;
          font-size: clamp(27px, 4vw, 37px);
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: -.2px;
        }

        .dashboard-header p {
          max-width: 720px;
          margin: 8px auto 0;
          color: #6d7f93;
          font-size: 13px;
          line-height: 1.75;
        }

        .welcome-icon {
          position: absolute;
          right: 3px;
          top: 17px;
          width: 58px;
          height: 58px;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d5e3f0;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 22px rgba(23,43,77,.08);
          font-size: 25px;
        }

        /* ---------- MAIN LAYOUT ---------- */

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(300px, .8fr);
          grid-template-areas:
            "health food"
            "workout workout"
            "daily daily";
          gap: 18px;
          align-items: stretch;
        }

        .main-grid > .main-card {
          grid-area: workout;
        }

        .main-grid > .feature-card:not(.span-2):nth-child(2) {
          grid-area: health;
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) {
          grid-area: food;
        }

        .main-grid > .feature-card.span-2 {
          grid-area: daily;
        }

        /* ---------- UNIVERSAL CARD ---------- */

        .main-card,
        .feature-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          padding: 24px;
          border: 1px solid #dbe4ed;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 8px 26px rgba(23,43,77,.065);
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        .main-card::before,
        .feature-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 3px;
          background: #1877f2;
        }

        .main-card:hover,
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: #cbd9e8;
          box-shadow: 0 12px 32px rgba(23,43,77,.09);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 7px;
          color: #172b4d;
          font-family: "Mitr", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.5;
        }

        .card-description,
        .card-desc {
          margin: 0 0 17px;
          color: #718096;
          font-size: 12px;
          line-height: 1.8;
        }

        /* ---------- BMI / HEALTH ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(2) {
          min-height: 295px;
        }

        .bmi-form {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 11px;
          align-items: end;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          color: #52667d;
          font-size: 11px;
          font-weight: 600;
        }

        .input-group input {
          width: 100%;
          min-height: 42px;
          padding: 9px 12px;
          outline: none;
          border: 1px solid #d5e0eb;
          border-radius: 9px;
          color: #172b4d;
          background: #f8fafc;
          font-size: 12px;
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
        }

        .input-group input::placeholder {
          color: #9aa9b9;
        }

        .input-group input:focus {
          border-color: #1877f2;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(24,119,242,.10);
        }

        .action-btn {
          width: 100%;
          min-height: 42px;
          padding: 9px 13px;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
          color: #fff;
          background: #172b4d;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 6px 14px rgba(23,43,77,.15);
          transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          background: #0f203a;
          box-shadow: 0 10px 20px rgba(23,43,77,.20);
        }

        .action-btn:active {
          transform: translateY(0);
        }

        .result-box {
          margin-top: 13px;
          padding: 13px 14px;
          border: 1px solid #dbe6f0;
          border-radius: 11px;
          color: #52667d;
          background: #f7faff;
          font-size: 11.5px;
          line-height: 1.75;
        }

        .result-box p {
          margin: 0;
        }

        .result-box p + p {
          margin-top: 5px;
        }

        .highlight {
          color: #1877f2;
          font-weight: 700;
        }

        .highlight-warning {
          color: #d97706;
          font-weight: 700;
        }

        /* ---------- FOOD SCAN / REDESIGNED ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(3) {
          min-height: 322px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(145deg, #ffffff 0%, #f8fbff 100%);
          border: 1px solid #d7e3ef;
          box-shadow: 0 10px 30px rgba(23,43,77,.07);
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3)::before {
          height: 4px;
          background: linear-gradient(90deg, #1877f2 0%, #64a8f7 100%);
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-title {
          position: relative;
          display: flex;
          align-items: center;
          gap: 11px;
          margin: 0 0 5px;
          padding-left: 0;
          color: #152d4c;
          font-family: "Mitr", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.45;
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-title::before {
          content: "📷";
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #eaf3ff;
          border: 1px solid #d5e6fa;
          font-size: 17px;
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-description,
        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-desc {
          margin: 0 0 16px 49px;
          color: #75869a;
          font-size: 11.5px;
          line-height: 1.7;
        }

        .upload-box {
          position: relative;
          width: 100%;
          min-height: 183px;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          border: 1.5px dashed #9fc6ee;
          border-radius: 16px;
          background:
            radial-gradient(circle at 50% 46%, rgba(24,119,242,.07), transparent 31%),
            #f7faff;
          transition:
            border-color .22s ease,
            background .22s ease,
            box-shadow .22s ease,
            transform .22s ease;
        }

        .upload-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          top: 14px;
          left: 16px;
          color: #7b91a8;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 1.7px;
        }

        .upload-box::after {
          content: "";
          position: absolute;
          width: 92px;
          height: 92px;
          right: -45px;
          bottom: -47px;
          border-radius: 50%;
          border: 1px solid rgba(24,119,242,.12);
          box-shadow: 0 0 0 14px rgba(24,119,242,.025);
          pointer-events: none;
        }

        .upload-box:hover {
          transform: translateY(-2px);
          border-color: #1877f2;
          background:
            radial-gradient(circle at 50% 46%, rgba(24,119,242,.10), transparent 33%),
            #f3f8ff;
          box-shadow:
            0 10px 24px rgba(24,119,242,.09),
            inset 0 0 24px rgba(24,119,242,.025);
        }

        .upload-placeholder {
          position: relative;
          z-index: 2;
          width: 100%;
          padding: 30px 20px 17px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: #63768c;
          text-align: center;
        }

        .camera-icon {
          width: 58px;
          height: 58px;
          margin-bottom: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d4e5f8;
          border-radius: 16px;
          background: #ffffff;
          box-shadow:
            0 8px 18px rgba(24,119,242,.10),
            0 2px 5px rgba(23,43,77,.05);
          font-size: 25px;
          line-height: 1;
          transition: transform .22s ease, box-shadow .22s ease;
        }

        .upload-box:hover .camera-icon {
          transform: translateY(-3px) scale(1.04);
          box-shadow:
            0 11px 23px rgba(24,119,242,.15),
            0 2px 6px rgba(23,43,77,.06);
        }

        .upload-placeholder strong {
          color: #172b4d;
          font-family: "Mitr", sans-serif;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.55;
        }

        .upload-placeholder small {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 1px;
          padding: 5px 10px;
          border-radius: 999px;
          color: #71859b;
          background: #edf4fb;
          border: 1px solid #dce9f6;
          font-size: 9.5px;
          line-height: 1.4;
        }

        .food-preview {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 14px;
        }

        .scanning-text {
          margin: 8px 0 0;
          color: #1877f2;
          font-size: 11px;
          line-height: 1.5;
          text-align: center;
          animation: scanPulse 1.3s ease-in-out infinite;
        }

        .error-text {
          margin: 8px 0 0 !important;
          color: #c24141 !important;
          font-size: 11px !important;
          line-height: 1.5;
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .result-box {
          margin-top: 12px;
          border-color: #d7e5f4;
          background: #f6f9fd;
        }

        @media (max-width: 680px) {
          .main-grid > .feature-card:not(.span-2):nth-child(3) {
            min-height: 300px;
          }

          .main-grid > .feature-card:not(.span-2):nth-child(3) .card-description,
          .main-grid > .feature-card:not(.span-2):nth-child(3) .card-desc {
            margin-left: 0;
          }

          .upload-box {
            min-height: 175px;
          }
        }

        /* ---------- WORKOUT ---------- */

        .main-grid > .main-card {
          padding: 25px;
        }

        .main-grid > .main-card .card-title {
          margin-bottom: 3px;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .menu-card {
          position: relative;
          min-height: 185px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: flex-start;
          width: 100%;
          padding: 21px;
          overflow: hidden;
          border: 1px solid #263c55;
          border-radius: 15px;
          cursor: pointer;
          color: #fff;
          text-align: left;
          font-family: inherit;
          background: #172b4d;
          box-shadow: 0 10px 24px rgba(23,43,77,.16);
          transition: transform .22s ease, box-shadow .22s ease, background .22s ease;
        }

        .menu-card::before {
          content: "";
          position: absolute;
          width: 150px;
          height: 150px;
          right: -72px;
          bottom: -78px;
          border-radius: 50%;
          background: rgba(24,119,242,.20);
          transition: transform .3s ease;
        }

        .menu-card::after {
          content: "";
          position: absolute;
          top: 18px;
          right: 20px;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #4594f5;
          box-shadow: 0 0 0 6px rgba(69,148,245,.10);
        }

        .menu-card:hover {
          transform: translateY(-4px);
          background: #10223c;
          box-shadow: 0 16px 30px rgba(23,43,77,.23);
        }

        .menu-card:hover::before {
          transform: scale(1.25);
        }

        .exercise-menu,
        .history-menu {
          background: #172b4d;
          border-color: #263c55;
        }

        .menu-icon {
          position: absolute;
          top: 20px;
          left: 21px;
          width: 47px;
          height: 47px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 13px;
          background: rgba(255,255,255,.08);
          font-size: 20px;
        }

        .menu-content {
          position: relative;
          z-index: 2;
          min-width: 0;
          padding-top: 52px;
        }

        .menu-content h2 {
          margin: 0;
          color: #fff;
          font-family: "Mitr", sans-serif;
          font-size: 17px;
          font-weight: 500;
          line-height: 1.55;
        }

        .menu-content p {
          max-width: 300px;
          margin: 6px 0 0;
          color: #c9d8ea;
          font-size: 11.5px;
          line-height: 1.75;
        }

        /* ลูกศรถูกตัดออกจากหน้าตา */
        .arrow {
          display: none !important;
        }

        /* ---------- INFO STRIP ---------- */

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 17px;
          padding-top: 15px;
          border-top: 1px solid #e0e7ef;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          padding: 10px 11px;
          border: 1px solid #e0e7ef;
          border-radius: 10px;
          background: #f8fafc;
        }

        .info-icon {
          width: 31px;
          height: 31px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #eaf3ff;
          font-size: 14px;
        }

        .info-item strong {
          display: block;
          color: #38516d;
          font-size: 10px;
          line-height: 1.45;
          font-weight: 600;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #8292a4;
          font-size: 8.5px;
          line-height: 1.45;
        }

        /* ---------- DAILY FOOD ---------- */

        .main-grid > .feature-card.span-2 {
          padding: 23px 24px;
        }

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
          margin-bottom: 13px;
        }

        .meal-item {
          position: relative;
          min-width: 0;
          padding: 15px 15px 15px 18px;
          border: 1px solid #dce5ee;
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
        }

        .meal-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: #1877f2;
        }

        .meal-item:hover {
          transform: translateY(-2px);
          border-color: #c5d5e6;
          box-shadow: 0 8px 20px rgba(23,43,77,.07);
        }

        .meal-item strong {
          display: block;
          margin-bottom: 6px;
          color: #245f9f;
          font-size: 11px;
          line-height: 1.5;
          font-weight: 700;
        }

        .meal-item p {
          margin: 0;
          color: #708297;
          font-size: 10.5px;
          line-height: 1.75;
        }

        .alert-box {
          margin-top: 10px;
          padding: 13px 14px;
          border-radius: 11px;
          font-size: 11px;
          line-height: 1.75;
        }

        .alert-success {
          color: #246b3d;
          border: 1px solid #cde6d4;
          background: #f1faf3;
        }

        .alert-danger {
          color: #a43e3e;
          border: 1px solid #efd0d0;
          background: #fff5f5;
        }

        .workout-suggestion {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid #e5ebf1;
        }

        .workout-suggestion ul {
          margin: 7px 0 10px 18px;
          padding: 0;
        }

        .workout-suggestion li + li {
          margin-top: 4px;
        }

        .start-now-btn {
          padding: 8px 14px;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          color: #fff;
          background: #1877f2;
          font-size: 11px;
          font-weight: 600;
          box-shadow: 0 6px 15px rgba(24,119,242,.18);
          transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
        }

        .start-now-btn:hover {
          transform: translateY(-2px);
          background: #166fe5;
          box-shadow: 0 9px 20px rgba(24,119,242,.24);
        }

        .dashboard-footer {
          margin-top: 20px;
          padding: 0 4px;
          text-align: center;
        }

        .dashboard-footer p {
          margin: 0;
          color: #91a0b0;
          font-size: 9px;
          line-height: 1.5;
          letter-spacing: .7px;
        }

        @keyframes scanPulse {
          0%, 100% { opacity: .55; }
          50% { opacity: 1; }
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 900px) {
          .dashboard-page {
            padding-left: 18px;
            padding-right: 18px;
          }

          .main-grid {
            grid-template-columns: 1fr;
            grid-template-areas:
              "health"
              "food"
              "workout"
              "daily";
          }

          .bmi-form {
            grid-template-columns: 1fr 1fr 1fr;
          }
        }

        @media (max-width: 680px) {
          .dashboard-page {
            padding: 18px 12px 28px;
          }

          .dashboard-header {
            min-height: 145px;
            margin-top: 32px;
            padding: 14px 10px 20px;
          }

          .welcome-icon {
            display: none;
          }

          .dashboard-header h1 {
            max-width: 100%;
            font-size: 25px;
          }

          .dashboard-header p {
            font-size: 11.5px;
          }

          .bmi-form {
            grid-template-columns: 1fr 1fr;
          }

          .action-btn {
            grid-column: 1 / -1;
          }

          .menu-grid {
            grid-template-columns: 1fr;
          }

          .meal-grid {
            grid-template-columns: 1fr;
          }

          .info-section {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 460px) {
          .top-profile-btn {
            top: 10px;
            right: 10px;
            width: 43px;
            height: 43px;
          }

          .main-card,
          .feature-card {
            padding: 18px;
            border-radius: 15px;
          }

          .bmi-form {
            grid-template-columns: 1fr;
          }

          .action-btn {
            grid-column: auto;
          }

          .card-title {
            font-size: 16px;
          }

          .dashboard-header h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}
