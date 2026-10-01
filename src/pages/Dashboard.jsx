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
        @import url('https://fonts.googleapis.com/css2?family=Mitr:wght@300;400;500;600&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          background: #f5f8fc;
          font-family: "Mitr", "Noto Sans Thai", sans-serif;
        }

        button, input { font-family: inherit; }

        /* =========================================================
           FITTRACK — FACEBOOK BLUE / WHITE REDESIGN
           เปลี่ยนเฉพาะการจัดวางและการตกแต่ง
           Logic / Firebase / API / navigate / state เดิมไม่ถูกแตะ
           ========================================================= */

        .dashboard-page {
          min-height: 100vh;
          padding: 28px 34px 42px;
          color: #172b4d;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 8% 0%, rgba(24,119,242,.055), transparent 24%),
            linear-gradient(180deg, #ffffff 0%, #f7f9fc 58%, #f2f6fb 100%);
        }

        .dashboard-page::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: linear-gradient(90deg, #1877f2 0%, #69aaf8 32%, transparent 62%);
          pointer-events: none;
        }

        .dashboard-page::after {
          content: "";
          position: absolute;
          width: 310px;
          height: 310px;
          right: -170px;
          top: 120px;
          border-radius: 50%;
          background: rgba(24,119,242,.025);
          border: 1px solid rgba(24,119,242,.045);
          pointer-events: none;
        }

        /* ---------- PROFILE: คงปุ่มและ navigate /profile ---------- */

        .top-profile-btn {
          position: fixed;
          top: 19px;
          right: 24px;
          z-index: 60;
          width: 48px;
          height: 48px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          cursor: pointer;
          background: #ffffff;
          border: 1px solid #d9e3ef;
          box-shadow: 0 8px 24px rgba(23,55,91,.12);
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }

        .top-profile-btn:hover {
          transform: translateY(-2px) scale(1.04);
          border-color: #9fc6f4;
          box-shadow: 0 12px 30px rgba(24,119,242,.16);
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
          font-weight: 600;
          background: linear-gradient(145deg, #4b93ed, #1877f2);
        }

        .profile-status-dot {
          position: absolute;
          right: 0;
          bottom: 1px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #31a24c;
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
          min-height: 150px;
          margin: 10px 0 22px;
          padding: 10px 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .logo {
          width: fit-content;
          margin: 0 auto 8px;
          color: #1877f2;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 600;
          letter-spacing: 1.7px;
        }

        .logo::before,
        .logo::after {
          display: none;
        }

        .welcome-icon {
          display: none;
        }

        .dashboard-header h1 {
          margin: 0;
          color: #172b4d;
          font-size: clamp(27px, 4vw, 38px);
          line-height: 1.3;
          font-weight: 600;
          letter-spacing: -.35px;
        }

        .dashboard-header p {
          max-width: 760px;
          margin: 9px auto 0;
          color: #6b7c93;
          font-size: 15px;
          line-height: 1.85;
          font-weight: 400;
          letter-spacing: .1px;
        }

        /* ---------- LAYOUT ----------
           BMI = top left
           FOOD = top right
           WORKOUT = full width below
           DAILY = full width last
        */

        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(310px, .78fr);
          grid-template-areas:
            "health food"
            "workout workout"
            "daily daily";
          gap: 20px;
          align-items: stretch;
        }

        .main-grid > .main-card { grid-area: workout; }
        .main-grid > .feature-card:not(.span-2):nth-child(2) { grid-area: health; }
        .main-grid > .feature-card:not(.span-2):nth-child(3) { grid-area: food; }
        .main-grid > .feature-card.span-2 { grid-area: daily; }

        /* ---------- CARD BASE ---------- */

        .main-card,
        .feature-card {
          position: relative;
          overflow: hidden;
          padding: 25px;
          border-radius: 18px;
          background: rgba(255,255,255,.98);
          border: 1px solid #dfe7f0;
          box-shadow:
            0 9px 28px rgba(23,55,91,.065),
            0 1px 3px rgba(23,55,91,.035);
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }

        .main-card::before,
        .feature-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 74px;
          height: 3px;
          border-radius: 0 0 8px 0;
          background: #1877f2;
        }

        .main-card::after,
        .feature-card::after {
          display: none;
        }

        .main-card:hover,
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: #c9d8e8;
          box-shadow:
            0 14px 34px rgba(23,55,91,.09),
            0 2px 5px rgba(23,55,91,.04);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 8px;
          color: #172b4d;
          font-size: 18px;
          line-height: 1.55;
          font-weight: 600;
          letter-spacing: .05px;
        }

        .card-description,
        .card-desc {
          margin: 0 0 19px;
          color: #6b7c93;
          font-size: 13px;
          line-height: 1.8;
          font-weight: 400;
        }

        /* ---------- BMI ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(2) {
          min-height: 300px;
        }

        .bmi-form {
          display: grid;
          grid-template-columns: 1fr 1fr .95fr;
          gap: 12px;
          align-items: end;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .input-group label {
          color: #506784;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 500;
        }

        .input-group input {
          width: 100%;
          padding: 12px 13px;
          border-radius: 10px;
          outline: none;
          color: #172b4d;
          font-size: 13px;
          background: #f7f9fc;
          border: 1px solid #d8e2ed;
          transition: .2s ease;
        }

        .input-group input::placeholder {
          color: #9aa9bb;
        }

        .input-group input:focus {
          background: #ffffff;
          border-color: #1877f2;
          box-shadow: 0 0 0 3px rgba(24,119,242,.10);
        }

        .action-btn {
          width: 100%;
          min-height: 43px;
          padding: 9px 14px;
          border: 0;
          border-radius: 10px;
          cursor: pointer;
          color: #ffffff;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 500;
          background: #1877f2;
          box-shadow: 0 7px 16px rgba(24,119,242,.18);
          transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          background: #166fe5;
          box-shadow: 0 11px 23px rgba(24,119,242,.24);
        }

        .action-btn:active {
          transform: translateY(0);
          box-shadow: 0 5px 12px rgba(24,119,242,.16);
        }

        .result-box {
          margin-top: 14px;
          padding: 13px 15px;
          border-radius: 11px;
          color: #4d6480;
          font-size: 12.5px;
          line-height: 1.8;
          background: #f4f8fd;
          border: 1px solid #dce7f2;
        }

        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 5px; }

        .highlight {
          color: #1877f2;
          font-weight: 600;
        }

        .highlight-warning {
          color: #c77b00;
          font-weight: 600;
        }

        /* ---------- FOOD AI ---------- */

        .main-grid > .feature-card:not(.span-2):nth-child(3) {
          min-height: 300px;
          padding: 22px;
          background: linear-gradient(145deg, #ffffff, #f8fbff);
        }

        .main-grid > .feature-card:not(.span-2):nth-child(3) .card-title {
          font-size: 16px;
        }

        .upload-box {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 155px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 14px;
          border: 1.5px dashed #a9c6e7;
          background: #f6f9fd;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease, background .2s ease;
        }

        .upload-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          left: 14px;
          top: 11px;
          color: #8a9bb0;
          font-size: 8px;
          line-height: 1.3;
          font-weight: 600;
          letter-spacing: 1.4px;
        }

        .upload-box:hover {
          transform: translateY(-2px);
          border-color: #1877f2;
          background: #f1f6fd;
          box-shadow: 0 10px 24px rgba(24,119,242,.08);
        }

        .camera-icon {
          width: 50px;
          height: 50px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          color: #ffffff;
          font-size: 23px;
          background: #1877f2;
          box-shadow: 0 8px 18px rgba(24,119,242,.20);
          transition: transform .2s ease, box-shadow .2s ease;
        }

        .upload-box:hover .camera-icon {
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 11px 24px rgba(24,119,242,.26);
        }

        .upload-placeholder {
          position: relative;
          z-index: 1;
          padding: 0 15px;
          color: #506784;
          font-size: 12.5px;
          line-height: 1.7;
          text-align: center;
        }

        .upload-placeholder strong {
          display: block;
          margin-bottom: 2px;
          color: #172b4d;
          font-size: 14px;
          font-weight: 600;
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
          color: #1877f2;
          font-size: 11px;
          line-height: 1.5;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }

        .error-text {
          margin: 7px 0 0 !important;
          color: #d04d4d !important;
          font-size: 11px !important;
        }

        /* ---------- WORKOUT ---------- */

        .main-grid > .main-card {
          padding: 25px;
        }

        .main-grid > .main-card .card-title {
          justify-content: center;
          font-size: 19px;
        }

        .main-grid > .main-card .card-description {
          text-align: center;
          margin-bottom: 19px;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .menu-card {
          position: relative;
          min-height: 172px;
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
          border-radius: 15px;
          cursor: pointer;
          font-family: inherit;
          background: #173b5e;
          border: 1px solid #244f77;
          box-shadow: 0 10px 24px rgba(18,57,91,.15);
          transition: transform .22s ease, box-shadow .22s ease, background .22s ease, border-color .22s ease;
        }

        .menu-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 3px;
          background: #4597ed;
        }

        .menu-card::after {
          position: absolute;
          right: 18px;
          top: 17px;
          font-size: 28px;
          opacity: .14;
          pointer-events: none;
        }

        .exercise-menu::after { content: "✦"; }
        .history-menu::after { content: "◌"; }

        .menu-card:hover {
          transform: translateY(-4px);
          background: #1b456c;
          border-color: #4d96dc;
          box-shadow:
            0 15px 30px rgba(18,57,91,.20),
            0 0 0 3px rgba(24,119,242,.06);
        }

        .menu-card:active {
          transform: translateY(-1px);
        }

        .menu-icon {
          width: 46px;
          height: 46px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          font-size: 20px;
          background: rgba(255,255,255,.11);
          border: 1px solid rgba(255,255,255,.15);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
        }

        .menu-content {
          min-width: 0;
          position: relative;
          z-index: 2;
        }

        .menu-content h2 {
          margin: 0;
          color: #ffffff;
          font-size: 17px;
          line-height: 1.55;
          font-weight: 500;
          letter-spacing: .05px;
        }

        .menu-content p {
          margin: 5px 0 0;
          color: #c5d9ec;
          font-size: 12px;
          line-height: 1.75;
          font-weight: 300;
        }

        /* ลูกศรถูกเอาออกจากหน้าตาแล้ว */

        /* ---------- INFO STRIP ---------- */

        .info-section {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 18px;
          padding-top: 15px;
          border-top: 1px solid #e1e8f0;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          padding: 10px;
          border-radius: 11px;
          background: #f8fafc;
          border: 1px solid #e2e9f1;
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
          background: #eaf3fc;
        }

        .info-item strong {
          display: block;
          color: #425b76;
          font-size: 10.5px;
          line-height: 1.5;
          font-weight: 600;
        }

        .info-item span {
          display: block;
          margin-top: 2px;
          color: #8192a7;
          font-size: 9px;
          line-height: 1.5;
          font-weight: 400;
        }

        /* ---------- DAILY FOOD ---------- */

        .main-grid > .feature-card.span-2 {
          background: #ffffff;
        }

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
          margin-bottom: 14px;
        }

        .meal-item {
          position: relative;
          min-height: 96px;
          padding: 14px 15px 14px 18px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e1e8f0;
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
          border-color: #c7d7e8;
          box-shadow: 0 8px 20px rgba(23,55,91,.07);
        }

        .meal-item strong {
          display: block;
          margin-bottom: 6px;
          color: #285f91;
          font-size: 12px;
          line-height: 1.55;
          font-weight: 600;
        }

        .meal-item p {
          margin: 0;
          color: #708299;
          font-size: 11px;
          line-height: 1.75;
          font-weight: 400;
        }

        .alert-box {
          margin-top: 10px;
          padding: 13px 14px;
          border-radius: 11px;
          font-size: 12px;
          line-height: 1.75;
        }

        .alert-success {
          color: #2d7b45;
          background: #f0f9f3;
          border: 1px solid #d2ebd8;
        }

        .alert-danger {
          color: #b24d4d;
          background: #fff5f4;
          border: 1px solid #f1d4d1;
        }

        .workout-suggestion {
          margin-top: 9px;
          padding-top: 9px;
          border-top: 1px solid #e3e9f0;
        }

        .workout-suggestion ul {
          margin: 7px 0 10px 18px;
          padding: 0;
        }

        .workout-suggestion li + li {
          margin-top: 4px;
        }

        .start-now-btn {
          padding: 9px 14px;
          border: 0;
          border-radius: 9px;
          cursor: pointer;
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 500;
          background: #173b5e;
          box-shadow: 0 7px 16px rgba(23,59,94,.16);
          transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
        }

        .start-now-btn:hover {
          transform: translateY(-2px);
          background: #1b456c;
          box-shadow: 0 10px 22px rgba(23,59,94,.21);
        }

        .dashboard-footer {
          margin-top: 20px;
          padding: 0 4px;
          text-align: center;
        }

        .dashboard-footer p {
          margin: 0;
          color: #93a1b2;
          font-size: 9px;
          line-height: 1.5;
          letter-spacing: .6px;
          font-weight: 400;
        }

        @keyframes pulseText {
          0%, 100% { opacity: .55; }
          50% { opacity: 1; }
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 900px) {
          .dashboard-page {
            padding-left: 20px;
            padding-right: 20px;
          }

          .main-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "health health"
              "food food"
              "workout workout"
              "daily daily";
          }

          .bmi-form {
            grid-template-columns: 1fr 1fr 1fr;
          }
        }

        @media (max-width: 700px) {
          .dashboard-page {
            padding: 22px 13px 30px;
          }

          .dashboard-header {
            min-height: 145px;
            margin-top: 26px;
            padding: 10px 8px;
          }

          .dashboard-header h1 {
            font-size: 26px;
          }

          .dashboard-header p {
            font-size: 13px;
          }

          .main-card,
          .feature-card {
            padding: 19px;
            border-radius: 16px;
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

          .dashboard-header {
            margin-top: 30px;
            min-height: 130px;
          }

          .dashboard-header h1 {
            font-size: 23px;
            line-height: 1.4;
          }

          .dashboard-header p {
            font-size: 12px;
            line-height: 1.75;
          }

          .main-card,
          .feature-card {
            padding: 16px;
          }

          .bmi-form {
            grid-template-columns: 1fr;
          }

          .action-btn {
            grid-column: auto;
          }

          .menu-card {
            min-height: 155px;
          }

          .card-title {
            font-size: 16px;
          }
        }
      `}</style>
    </div>
  );
}
