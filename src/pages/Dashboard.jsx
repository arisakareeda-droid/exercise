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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Kanit:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          font-family: "Anuphan", "Kanit", sans-serif;
          background: #f6f8f7;
        }

        button, input { font-family: inherit; }

        /* =========================================================
           FITTRACK — CLEAN PREMIUM / WHITE EDITION
           ปรับเฉพาะการตกแต่งและการจัดวาง
           ========================================================= */

        .dashboard-page {
          min-height: 100vh;
          padding: 30px 34px 42px;
          color: #17251f;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 8% 0%, rgba(184,232,207,.38), transparent 25%),
            radial-gradient(circle at 94% 12%, rgba(214,238,226,.55), transparent 27%),
            linear-gradient(135deg, #ffffff 0%, #fbfcfb 55%, #f3f7f5 100%);
        }

        .dashboard-page::before {
          content: "";
          position: absolute;
          width: 560px;
          height: 560px;
          left: -360px;
          bottom: -300px;
          border-radius: 50%;
          border: 1px solid rgba(48,125,91,.08);
          box-shadow:
            0 0 0 35px rgba(48,125,91,.025),
            0 0 0 70px rgba(48,125,91,.018);
          pointer-events: none;
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 330px;
          height: 330px;
          right: -175px;
          top: 330px;
          border-radius: 50%;
          background: rgba(199,231,214,.24);
          filter: blur(8px);
          pointer-events: none;
        }

        /* ---------- PROFILE: คงการกดไป /profile ---------- */

        .top-profile-btn {
          position: fixed;
          top: 19px;
          right: 24px;
          z-index: 60;
          width: 50px;
          height: 50px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          cursor: pointer;
          background: #17231e;
          border: 1px solid #263a31;
          box-shadow: 0 12px 28px rgba(20,35,29,.18);
          transition: transform .25s ease, box-shadow .25s ease, background .25s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-3px) rotate(2deg);
          background: #20332b;
          box-shadow: 0 16px 35px rgba(20,35,29,.24);
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          color: #17231e;
          font-size: 16px;
          font-weight: 700;
          background: linear-gradient(145deg, #dff7e9, #8ed4ac);
        }

        .profile-status-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          right: -2px;
          bottom: -2px;
          border-radius: 50%;
          background: #49d48b;
          border: 2px solid #17231e;
          box-shadow: 0 0 0 3px rgba(73,212,139,.13);
        }

        .dashboard-container {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        /* ---------- HEADER / CENTER ---------- */

        .dashboard-header {
          position: relative;
          min-height: 180px;
          margin: 5px 0 24px;
          padding: 25px 100px 20px;
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
          text-align: center;
        }

        .logo {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 10px;
          color: #267b59;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 3px;
        }

        .logo::before {
          content: "✦";
          font-size: 15px;
          letter-spacing: 0;
        }

        .logo::after { display: none; }

        .welcome-icon {
          position: absolute;
          right: 8%;
          top: 36px;
          width: 66px;
          height: 66px;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 21px;
          font-size: 28px;
          background: #ffffff;
          border: 1px solid #dfeae4;
          box-shadow: 0 14px 34px rgba(33,70,56,.10);
          transform: rotate(5deg);
        }

        .dashboard-header h1 {
          margin: 0;
          color: #172f27;
          font-size: clamp(27px, 4vw, 38px);
          line-height: 1.25;
          font-weight: 700;
          letter-spacing: -.7px;
        }

        .dashboard-header p {
          max-width: 760px;
          margin: 9px auto 0;
          color: #71857d;
          font-size: 12.5px;
          line-height: 1.8;
          font-weight: 400;
          text-align: center;
        }

        /* ---------- LAYOUT ---------- */

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.62fr) minmax(280px, .78fr);
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

        /* ---------- ALL BOXES ---------- */

        .main-card,
        .feature-card {
          position: relative;
          overflow: hidden;
          padding: 23px;
          border-radius: 24px;
          background: rgba(255,255,255,.96);
          border: 1px solid #e1ebe6;
          box-shadow:
            0 16px 42px rgba(35,70,56,.065),
            0 2px 8px rgba(35,70,56,.035);
          transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
        }

        .main-card::before,
        .feature-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 105px;
          height: 4px;
          border-radius: 0 0 9px 0;
          background: linear-gradient(90deg, #245b46, #78c99e, transparent);
        }

        .main-card::after,
        .feature-card::after {
          content: "";
          position: absolute;
          width: 145px;
          height: 145px;
          right: -78px;
          top: -78px;
          border-radius: 50%;
          border: 1px solid rgba(47,124,91,.08);
          box-shadow: 0 0 0 20px rgba(47,124,91,.022);
          pointer-events: none;
        }

        .main-card:hover,
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: #cfe1d8;
          box-shadow:
            0 20px 46px rgba(35,70,56,.09),
            0 3px 10px rgba(35,70,56,.04);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 7px;
          color: #183b30;
          font-size: 16px;
          line-height: 1.55;
          font-weight: 700;
        }

        .card-description,
        .card-desc {
          margin: 0 0 18px;
          color: #7b9087;
          font-size: 11.5px;
          line-height: 1.7;
        }

        /* ---------- BMI ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(2) {
          min-height: 286px;
          background:
            linear-gradient(145deg, #ffffff 0%, #f7fbf9 100%);
        }

        .bmi-form {
          display: grid;
          grid-template-columns: 1fr 1fr .9fr;
          gap: 10px;
          align-items: end;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          color: #58736a;
          font-size: 10.5px;
          font-weight: 600;
        }

        .input-group input {
          width: 100%;
          padding: 11px 12px;
          border-radius: 12px;
          outline: none;
          color: #233f35;
          font-size: 12px;
          background: #ffffff;
          border: 1px solid #dce9e3;
          box-shadow: inset 0 1px 2px rgba(30,65,52,.025);
          transition: .22s ease;
        }

        .input-group input::placeholder { color: #a3b3ad; }

        .input-group input:focus {
          border-color: #5ba77f;
          box-shadow: 0 0 0 4px rgba(91,167,127,.10);
        }

        /* dark CTA */
        .action-btn,
        .start-now-btn {
          border: 1px solid #2d4037;
          cursor: pointer;
          color: #f7fffb;
          background: linear-gradient(135deg, #1d2c26, #0d1713);
          box-shadow:
            0 9px 20px rgba(18,34,27,.16),
            inset 0 1px 0 rgba(255,255,255,.08);
          transition: transform .22s ease, box-shadow .22s ease, background .22s ease;
        }

        .action-btn {
          width: 100%;
          min-height: 40px;
          padding: 9px 12px;
          border-radius: 12px;
          font-size: 11.5px;
          font-weight: 600;
        }

        .action-btn:hover,
        .start-now-btn:hover {
          transform: translateY(-3px);
          background: linear-gradient(135deg, #263b31, #101c17);
          box-shadow:
            0 14px 28px rgba(18,34,27,.23),
            0 0 0 4px rgba(71,130,101,.08);
        }

        .action-btn:active,
        .start-now-btn:active {
          transform: translateY(-1px) scale(.99);
        }

        .result-box {
          margin-top: 12px;
          padding: 13px 14px;
          border-radius: 14px;
          color: #506a60;
          font-size: 11px;
          line-height: 1.75;
          background: linear-gradient(135deg, #f1f8f4, #fbfdfc);
          border: 1px solid #dcebe4;
        }

        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 5px; }

        .highlight {
          color: #277a57;
          font-weight: 700;
        }

        .highlight-warning {
          color: #c77c16;
          font-weight: 700;
        }

        /* ---------- FOOD AI ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(3) {
          min-height: 286px;
          padding: 21px;
          background: linear-gradient(145deg, #ffffff, #f5faf7);
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-title {
          font-size: 14px;
        }

        .upload-box {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 150px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 18px;
          border: 1.5px dashed #a8cdb9;
          background:
            radial-gradient(circle at 50% 45%, rgba(173,224,196,.30), transparent 55%),
            #f8fcfa;
          transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease;
        }

        .upload-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          left: 13px;
          top: 10px;
          color: #82988f;
          font-size: 7.5px;
          font-weight: 700;
          letter-spacing: 1.5px;
        }

        .upload-box:hover {
          transform: translateY(-2px);
          border-color: #4d9a72;
          box-shadow:
            inset 0 0 30px rgba(63,143,101,.06),
            0 10px 22px rgba(38,91,68,.07);
        }

        .camera-icon {
          width: 47px;
          height: 47px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          font-size: 23px;
          background: #ffffff;
          border: 1px solid #dcebe4;
          box-shadow: 0 8px 17px rgba(39,92,69,.09);
        }

        .upload-placeholder strong {
          display: block;
          color: #36594c;
          font-size: 11.5px;
          font-weight: 700;
        }

        .upload-placeholder small {
          display: block;
          margin-top: 2px;
          color: #91a49c;
          font-size: 9px;
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
          color: #3a88a3;
          font-size: 10.5px;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }

        .error-text {
          margin: 7px 0 0 !important;
          color: #c95858 !important;
          font-size: 10.5px !important;
        }

        /* ---------- WORKOUT ---------- */

        .main-grid > .main-card {
          padding: 23px;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        /* dark interactive cards — ไม่มีลูกศร */
        .menu-card {
          position: relative;
          min-height: 174px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-end;
          gap: 9px;
          width: 100%;
          padding: 20px;
          overflow: hidden;
          text-align: left;
          color: #ffffff;
          border-radius: 19px;
          cursor: pointer;
          font-family: inherit;
          border: 1px solid #31463c;
          background: linear-gradient(145deg, #263b32, #111c17);
          box-shadow:
            0 14px 28px rgba(22,42,33,.16),
            inset 0 1px 0 rgba(255,255,255,.08);
          transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
        }

        .menu-card::before {
          content: "";
          position: absolute;
          width: 175px;
          height: 175px;
          right: -85px;
          bottom: -95px;
          border-radius: 50%;
          background: rgba(112,211,157,.10);
          border: 1px solid rgba(150,232,185,.10);
          transition: transform .35s ease;
        }

        .menu-card::after {
          position: absolute;
          right: 19px;
          top: 17px;
          font-size: 32px;
          opacity: .14;
          transition: transform .3s ease, opacity .3s ease;
        }

        .exercise-menu::after { content: "✦"; }
        .history-menu::after { content: "◌"; }

        .menu-card:hover {
          transform: translateY(-5px);
          border-color: #5b8f76;
          box-shadow:
            0 19px 34px rgba(22,42,33,.22),
            0 0 0 4px rgba(76,143,107,.07);
        }

        .menu-card:hover::before {
          transform: scale(1.18);
        }

        .menu-card:hover::after {
          opacity: .26;
          transform: rotate(15deg) scale(1.12);
        }

        .menu-icon {
          position: relative;
          z-index: 2;
          width: 48px;
          height: 48px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          font-size: 21px;
          background: rgba(255,255,255,.09);
          border: 1px solid rgba(255,255,255,.11);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }

        .menu-content {
          position: relative;
          z-index: 2;
          min-width: 0;
        }

        .menu-content h2 {
          margin: 0;
          color: #ffffff;
          font-size: 15px;
          line-height: 1.5;
          font-weight: 700;
        }

        .menu-content p {
          margin: 4px 0 0;
          color: #b8c9c1;
          font-size: 10.5px;
          line-height: 1.65;
        }

        /* ---------- INFO ---------- */

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 16px;
          padding-top: 15px;
          border-top: 1px solid #e7eee9;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 10px;
          border-radius: 13px;
          background: #f9fbfa;
          border: 1px solid #e5eee9;
          transition: transform .2s ease, border-color .2s ease;
        }

        .info-item:hover {
          transform: translateY(-2px);
          border-color: #cddfd5;
        }

        .info-icon {
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          font-size: 14px;
          background: #edf7f1;
        }

        .info-item strong {
          display: block;
          color: #4a675d;
          font-size: 9.5px;
          line-height: 1.4;
          font-weight: 700;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #91a19a;
          font-size: 8px;
          line-height: 1.4;
        }

        /* ---------- DAILY FOOD ---------- */

        .main-grid > .feature-card.span-2 {
          background: linear-gradient(145deg, #ffffff, #fbfcfb);
        }

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 13px;
        }

        .meal-item {
          position: relative;
          padding: 14px;
          border-radius: 14px;
          background: #f8fbf9;
          border: 1px solid #e3ece7;
          overflow: hidden;
          transition: .22s ease;
        }

        .meal-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: linear-gradient(#3e8e68, #a8ddbf);
        }

        .meal-item:hover {
          transform: translateY(-2px);
          border-color: #cbded5;
          box-shadow: 0 9px 20px rgba(40,87,67,.06);
        }

        .meal-item strong {
          display: block;
          margin-bottom: 5px;
          color: #39785b;
          font-size: 10.5px;
          font-weight: 700;
        }

        .meal-item p {
          margin: 0;
          color: #7e9189;
          font-size: 10px;
          line-height: 1.7;
        }

        .alert-box {
          margin-top: 10px;
          padding: 13px;
          border-radius: 13px;
          font-size: 11px;
          line-height: 1.7;
        }

        .alert-success {
          color: #267653;
          background: #eef9f3;
          border: 1px solid #cce9d8;
        }

        .alert-danger {
          color: #ad4c4c;
          background: #fff3f1;
          border: 1px solid #f0d1cc;
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

        .workout-suggestion li + li { margin-top: 4px; }

        .start-now-btn {
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 10.5px;
          font-weight: 600;
        }

        .dashboard-footer {
          margin-top: 20px;
          padding: 0 4px;
          text-align: center;
        }

        .dashboard-footer p {
          margin: 0;
          color: #9aa9a2;
          font-size: 8.5px;
          letter-spacing: 1px;
          font-weight: 500;
        }

        @keyframes pulseText {
          0%,100% { opacity: .52; }
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
        }

        @media (max-width: 700px) {
          .dashboard-page {
            padding: 16px 12px 25px;
          }

          .dashboard-header {
            min-height: 170px;
            margin-top: 30px;
            padding: 20px 8px 15px;
          }

          .welcome-icon {
            right: 6px;
            top: 5px;
            width: 51px;
            height: 51px;
            border-radius: 16px;
            font-size: 22px;
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

          .menu-grid,
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
            border-radius: 14px;
          }

          .main-card,
          .feature-card {
            padding: 17px;
            border-radius: 19px;
          }

          .bmi-form {
            grid-template-columns: 1fr;
          }

          .action-btn {
            grid-column: auto;
          }

          .dashboard-header h1 {
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
