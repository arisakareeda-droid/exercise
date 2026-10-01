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

      <style>{`\n        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=Kanit:wght@400;500;600&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          font-family: "IBM Plex Sans Thai", "Kanit", sans-serif;
          background: #f7faf8;
        }

        button, input { font-family: inherit; }

        /* =========================================================
           FITTRACK — WHITE / SOFT GREEN DASHBOARD
           เปลี่ยนเฉพาะหน้าตาและการจัดวาง
           Logic, state, Firebase, API และปุ่มนำทางเดิมยังคงอยู่
           ========================================================= */

        .dashboard-page {
          min-height: 100vh;
          padding: 28px 34px 38px;
          color: #163b32;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 8% 8%, rgba(185,235,211,.48), transparent 24%),
            radial-gradient(circle at 94% 18%, rgba(222,245,236,.75), transparent 28%),
            linear-gradient(135deg, #ffffff 0%, #f8fcfa 52%, #f2f9f5 100%);
        }

        /* soft decorative shapes */
        .dashboard-page::before {
          content: "";
          position: absolute;
          width: 470px;
          height: 470px;
          left: -300px;
          bottom: -180px;
          border-radius: 50%;
          background: rgba(167,243,208,.18);
          box-shadow:
            120px -40px 0 rgba(209,250,229,.24),
            190px 55px 0 rgba(236,253,245,.55);
          pointer-events: none;
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 380px;
          height: 380px;
          right: -210px;
          top: 230px;
          border-radius: 50%;
          border: 1px solid rgba(52,148,111,.08);
          box-shadow:
            0 0 0 38px rgba(52,148,111,.025),
            0 0 0 76px rgba(52,148,111,.018);
          pointer-events: none;
        }

        /* profile button — คงการกดไป /profile ไว้ */
        .top-profile-btn {
          position: fixed;
          top: 20px;
          right: 25px;
          z-index: 50;
          width: 48px;
          height: 48px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          cursor: pointer;
          background: #ffffff;
          border: 1px solid #dcebe4;
          box-shadow: 0 9px 26px rgba(36,85,68,.13);
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-2px) scale(1.04);
          border-color: #9bd6bb;
          box-shadow: 0 13px 30px rgba(36,85,68,.18);
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          background: linear-gradient(145deg, #66b88e, #27845e);
        }

        .profile-status-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          right: 0;
          bottom: 1px;
          border-radius: 50%;
          background: #38c985;
          border: 2px solid #ffffff;
        }

        .dashboard-container {
          width: 100%;
          max-width: 1220px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        /* ---------- HEADER ---------- */

        .dashboard-header {
          position: relative;
          min-height: 112px;
          margin: 7px 0 24px;
          padding: 13px 90px 10px 4px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          margin-bottom: 8px;
          color: #25815e;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 2.4px;
        }

        .logo::before {
          content: "🌿";
          font-size: 20px;
          letter-spacing: 0;
        }

        .logo::after {
          display: none;
        }

        .welcome-icon {
          position: absolute;
          right: 5%;
          top: 17px;
          width: 68px;
          height: 68px;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px;
          font-size: 29px;
          background: linear-gradient(145deg, #e2f6eb, #f7fcf9);
          border: 1px solid #d4ebe0;
          box-shadow: 0 13px 32px rgba(44,105,80,.10);
          transform: rotate(4deg);
        }

        .dashboard-header h1 {
          margin: 0;
          color: #173e34;
          font-size: clamp(26px, 4vw, 36px);
          line-height: 1.25;
          font-weight: 700;
          letter-spacing: -.6px;
        }

        .dashboard-header p {
          max-width: 650px;
          margin: 7px 0 0;
          color: #779088;
          font-size: 12.5px;
          line-height: 1.75;
          font-weight: 300;
        }

        /* ---------- MAIN GRID
           1) BMI/TDEE top-left
           2) Food AI small top-right
           3) Exercise menu large below
           4) Daily food/compensation below
        */

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(280px, .75fr);
          grid-template-areas:
            "health food"
            "workout workout"
            "daily daily";
          gap: 18px;
          align-items: stretch;
        }

        /* Existing DOM order:
           .main-card = workout
           .feature-card #1 = health
           .feature-card #2 = food
           .span-2 = daily
        */
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

        .span-2 { min-width: 0; }

        /* ---------- CARD SYSTEM ---------- */

        .main-card,
        .feature-card {
          position: relative;
          overflow: hidden;
          padding: 22px;
          border-radius: 22px;
          background: rgba(255,255,255,.92);
          border: 1px solid #e2eee8;
          box-shadow:
            0 12px 35px rgba(40,91,72,.075),
            0 2px 7px rgba(40,91,72,.035);
          transition: transform .24s ease, box-shadow .24s ease, border-color .24s ease;
        }

        .main-card::before,
        .feature-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 80px;
          height: 4px;
          border-radius: 0 0 8px 0;
          background: linear-gradient(90deg, #49a978, #b8e8cf);
        }

        .main-card::after,
        .feature-card::after {
          content: "";
          position: absolute;
          width: 125px;
          height: 125px;
          right: -65px;
          top: -65px;
          border-radius: 50%;
          border: 1px solid rgba(64,155,113,.09);
          box-shadow: 0 0 0 18px rgba(64,155,113,.025);
          pointer-events: none;
        }

        .main-card:hover,
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: #d1e8dc;
          box-shadow:
            0 17px 40px rgba(40,91,72,.10),
            0 3px 9px rgba(40,91,72,.04);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 7px;
          color: #17443a;
          font-size: 17px;
          line-height: 1.5;
          font-weight: 700;
        }

        .card-description,
        .card-desc {
          margin: 0 0 17px;
          color: #7a9289;
          font-size: 11.5px;
          line-height: 1.75;
          font-weight: 300;
        }

        /* ---------- BMI / TDEE ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(2) {
          min-height: 295px;
        }

        .bmi-form {
          display: grid;
          grid-template-columns: 1.05fr 1.05fr .9fr;
          gap: 10px;
          align-items: end;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          color: #527269;
          font-size: 10.5px;
          font-weight: 500;
        }

        .input-group input {
          width: 100%;
          padding: 11px 12px;
          border-radius: 11px;
          outline: none;
          color: #244b40;
          font-size: 12px;
          background: #f7fbf9;
          border: 1px solid #dcebe4;
          transition: .2s ease;
        }

        .input-group input::placeholder {
          color: #a2b4ad;
        }

        .input-group input:focus {
          background: #ffffff;
          border-color: #6fc49b;
          box-shadow: 0 0 0 4px rgba(78,180,128,.10);
        }

        .action-btn {
          width: 100%;
          min-height: 40px;
          padding: 9px 12px;
          border: 0;
          border-radius: 11px;
          cursor: pointer;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 600;
          background: linear-gradient(135deg, #4cab7b, #27865f);
          box-shadow: 0 8px 18px rgba(39,134,95,.17);
          transition: .2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 11px 23px rgba(39,134,95,.22);
        }

        .result-box {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 13px;
          color: #47645a;
          font-size: 11px;
          line-height: 1.7;
          background: linear-gradient(135deg, #f2faf5, #fbfdfc);
          border: 1px solid #dceee5;
        }

        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 5px; }

        .highlight {
          color: #27865f;
          font-weight: 700;
        }

        .highlight-warning {
          color: #d88b19;
          font-weight: 700;
        }

        /* ---------- FOOD AI — เล็กด้านขวาบน ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(3) {
          min-height: 295px;
          padding: 20px;
          background: linear-gradient(150deg, #ffffff, #f6fcf9);
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-title {
          font-size: 15px;
        }

        .upload-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 145px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 16px;
          border: 1.5px dashed #acd8c0;
          background:
            radial-gradient(circle at center, rgba(180,232,205,.25), transparent 58%),
            #f7fcf9;
          transition: .24s ease;
        }

        .upload-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          left: 12px;
          top: 10px;
          color: #86a198;
          font-size: 7.5px;
          font-weight: 600;
          letter-spacing: 1.4px;
        }

        .upload-box:hover {
          border-color: #68b98e;
          background-color: #f1faf5;
          box-shadow: inset 0 0 28px rgba(68,170,119,.06);
        }

        .upload-placeholder {
          position: relative;
          z-index: 1;
          padding: 0 16px;
          color: #688279;
          font-size: 10.5px;
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
          margin: 7px 0 0;
          color: #3999bd;
          font-size: 10.5px;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }

        .error-text {
          margin: 7px 0 0 !important;
          color: #d85c5c !important;
          font-size: 10.5px !important;
        }

        /* ---------- WORKOUT MENU ---------- */

        .main-grid > .main-card {
          padding: 22px;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .menu-card {
          position: relative;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-end;
          gap: 8px;
          width: 100%;
          padding: 20px;
          overflow: hidden;
          text-align: left;
          color: #17443a;
          border-radius: 18px;
          cursor: pointer;
          font-family: inherit;
          transition: transform .24s ease, box-shadow .24s ease, border-color .24s ease;
        }

        .menu-card::before {
          content: "";
          position: absolute;
          right: -25px;
          bottom: -45px;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: rgba(255,255,255,.46);
          transition: transform .3s ease;
        }

        .menu-card::after {
          position: absolute;
          right: 18px;
          top: 16px;
          font-size: 30px;
          opacity: .18;
        }

        .exercise-menu {
          background: linear-gradient(135deg, #e8f8ef, #f7fcf9);
          border: 1px solid #d1eadc;
        }

        .exercise-menu::after {
          content: "🏃";
        }

        .history-menu {
          background: linear-gradient(135deg, #eef4ff, #f8fbff);
          border: 1px solid #dce6f8;
        }

        .history-menu::after {
          content: "📈";
        }

        .menu-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 15px 28px rgba(45,91,74,.10);
        }

        .menu-card:hover::before {
          transform: scale(1.22);
        }

        .menu-icon {
          width: 47px;
          height: 47px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          font-size: 21px;
          background: rgba(255,255,255,.72);
          border: 1px solid rgba(60,130,98,.10);
          box-shadow: 0 6px 15px rgba(43,103,79,.07);
        }

        .menu-content {
          min-width: 0;
          position: relative;
          z-index: 2;
        }

        .menu-content h2 {
          margin: 0;
          color: #19483d;
          font-size: 15px;
          line-height: 1.5;
          font-weight: 700;
        }

        .menu-content p {
          margin: 4px 0 0;
          color: #779087;
          font-size: 10.5px;
          line-height: 1.65;
          font-weight: 300;
        }

        .arrow {
          position: absolute;
          right: 18px;
          bottom: 17px;
          margin: 0;
          padding: 0;
          color: #438a6c;
          font-size: 19px;
          z-index: 3;
          transition: .2s ease;
        }

        .menu-card:hover .arrow {
          transform: translateX(4px);
        }

        /* ---------- INFO STRIP ---------- */

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 15px;
          padding-top: 14px;
          border-top: 1px solid #e7f0eb;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 9px;
          border-radius: 12px;
          background: #fbfdfc;
          border: 1px solid #e6efeb;
        }

        .info-icon {
          width: 29px;
          height: 29px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          font-size: 14px;
          background: #edf8f2;
        }

        .info-item strong {
          display: block;
          color: #46685d;
          font-size: 9.5px;
          line-height: 1.4;
          font-weight: 600;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #91a29b;
          font-size: 8px;
          line-height: 1.4;
          font-weight: 300;
        }

        /* ---------- DAILY FOOD ---------- */

        .main-grid > .feature-card.span-2 {
          background: linear-gradient(145deg, #ffffff, #fbfdfc);
        }

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 13px;
        }

        .meal-item {
          position: relative;
          padding: 13px;
          border-radius: 13px;
          background: #f8fbf9;
          border: 1px solid #e2eee8;
          overflow: hidden;
          transition: .2s ease;
        }

        .meal-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: #76c69b;
        }

        .meal-item:hover {
          transform: translateY(-2px);
          border-color: #cfe6da;
          box-shadow: 0 8px 18px rgba(42,92,73,.06);
        }

        .meal-item strong {
          display: block;
          margin-bottom: 5px;
          color: #3c8062;
          font-size: 10.5px;
          font-weight: 600;
        }

        .meal-item p {
          margin: 0;
          color: #7c9189;
          font-size: 10px;
          line-height: 1.7;
          font-weight: 300;
        }

        .alert-box {
          margin-top: 10px;
          padding: 13px;
          border-radius: 12px;
          font-size: 11px;
          line-height: 1.7;
        }

        .alert-success {
          color: #267a56;
          background: #effaf4;
          border: 1px solid #ccebd9;
        }

        .alert-danger {
          color: #b54e4e;
          background: #fff4f2;
          border: 1px solid #f2d3ce;
        }

        .workout-suggestion {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid rgba(90,120,105,.15);
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
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 600;
          background: linear-gradient(135deg, #ef6d61, #d95249);
          box-shadow: 0 7px 16px rgba(217,82,73,.15);
          transition: .2s ease;
        }

        .start-now-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 21px rgba(217,82,73,.21);
        }

        .dashboard-footer {
          margin-top: 20px;
          padding: 0 4px;
          text-align: center;
        }

        .dashboard-footer p {
          margin: 0;
          color: #9badA5;
          font-size: 8.5px;
          letter-spacing: 1px;
          font-weight: 500;
        }

        @keyframes pulseText {
          0%,100% { opacity: .5; }
          50% { opacity: 1; }
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 900px) {
          .dashboard-page {
            padding-left: 18px;
            padding-right: 18px;
          }

          .main-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "health health"
              "food food"
              "workout workout"
              "daily daily";
          }

          .main-grid > .feature-card:not(.span-2):nth-child(3) {
            min-height: 0;
          }

          .bmi-form {
            grid-template-columns: 1fr 1fr 1fr;
          }
        }

        @media (max-width: 700px) {
          .dashboard-page {
            padding: 18px 12px 25px;
          }

          .dashboard-header {
            min-height: 125px;
            margin-top: 35px;
            padding-right: 8px;
          }

          .welcome-icon {
            right: 8px;
            top: 8px;
            width: 54px;
            height: 54px;
            border-radius: 17px;
            font-size: 23px;
          }

          .dashboard-header h1 {
            max-width: calc(100% - 65px);
            font-size: 25px;
          }

          .dashboard-header p {
            max-width: 100%;
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
            width: 44px;
            height: 44px;
          }

          .main-card,
          .feature-card {
            padding: 17px;
            border-radius: 18px;
          }

          .bmi-form {
            grid-template-columns: 1fr;
          }

          .action-btn {
            grid-column: auto;
          }

          .dashboard-header h1 {
            max-width: 100%;
            font-size: 23px;
          }

          .welcome-icon {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
