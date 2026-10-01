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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
          margin: 0;
          font-family: "Kanit", sans-serif;
          background: #090d0b;
        }
        button, input { font-family: inherit; }

        .dashboard-page {
          min-height: 100vh;
          padding: 34px 22px 28px;
          display: flex;
          justify-content: center;
          position: relative;
          overflow: hidden;
          color: #f8fafc;
          background:
            radial-gradient(circle at 8% 5%, rgba(34,197,94,.13), transparent 28%),
            radial-gradient(circle at 94% 12%, rgba(56,189,248,.07), transparent 25%),
            radial-gradient(circle at 50% 100%, rgba(34,197,94,.055), transparent 38%),
            linear-gradient(145deg, #0a0e0c 0%, #101512 48%, #0b0f0d 100%);
        }
        .dashboard-page::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .42;
          background-image:
            linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(to bottom, #000, transparent 82%);
        }

        .top-profile-btn {
          position: fixed;
          top: 20px;
          right: 22px;
          z-index: 20;
          display: flex;
          align-items: center;
          padding: 5px;
          border-radius: 999px;
          cursor: pointer;
          background: rgba(18,25,21,.78);
          border: 1px solid rgba(255,255,255,.11);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 12px 32px rgba(0,0,0,.28);
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
        }
        .top-profile-btn:hover {
          transform: translateY(-2px) scale(1.02);
          border-color: rgba(74,222,128,.4);
          box-shadow: 0 16px 38px rgba(0,0,0,.36), 0 0 0 4px rgba(34,197,94,.055);
        }
        .profile-avatar {
          width: 43px;
          height: 43px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #052e16;
          font-size: 17px;
          font-weight: 800;
          background: linear-gradient(135deg, #4ade80, #16a34a);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
        }
        .profile-status-dot {
          position: absolute;
          right: 4px;
          bottom: 4px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #101512;
          box-shadow: 0 0 0 3px rgba(34,197,94,.12);
        }

        .dashboard-container {
          width: 100%;
          max-width: 1080px;
          position: relative;
          z-index: 1;
        }
        .dashboard-header {
          text-align: center;
          margin: 18px auto 30px;
          padding: 6px 12px;
        }
        .logo {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 13px;
          color: #4ade80;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 4px;
          text-shadow: 0 0 24px rgba(74,222,128,.18);
        }
        .logo::before, .logo::after {
          content: "";
          width: 25px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(74,222,128,.55));
        }
        .logo::after { transform: rotate(180deg); }
        .welcome-icon {
          width: 68px;
          height: 68px;
          margin: 0 auto 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 22px;
          font-size: 30px;
          background: linear-gradient(145deg, rgba(34,197,94,.16), rgba(34,197,94,.035));
          border: 1px solid rgba(74,222,128,.25);
          box-shadow: 0 14px 35px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.06);
          transform: rotate(-3deg);
        }
        .dashboard-header h1 {
          margin: 0;
          font-size: clamp(25px, 4vw, 32px);
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -.25px;
        }
        .dashboard-header p {
          max-width: 680px;
          margin: 10px auto 0;
          color: #98a39c;
          font-size: 14px;
          line-height: 1.7;
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
          padding: 23px;
          border-radius: 21px;
          background: linear-gradient(145deg, rgba(27,34,30,.95), rgba(16,21,18,.97));
          border: 1px solid rgba(255,255,255,.075);
          box-shadow: 0 18px 55px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.035);
          transition: border-color .22s ease, transform .22s ease, box-shadow .22s ease;
        }
        .main-card::before, .feature-card::before {
          content: "";
          position: absolute;
          width: 190px;
          height: 190px;
          right: -110px;
          top: -110px;
          border-radius: 50%;
          background: rgba(34,197,94,.055);
          pointer-events: none;
        }
        .main-card:hover, .feature-card:hover {
          border-color: rgba(255,255,255,.105);
          box-shadow: 0 20px 58px rgba(0,0,0,.27), inset 0 1px 0 rgba(255,255,255,.04);
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: #f7faf8;
          font-size: 17px;
          line-height: 1.45;
          font-weight: 700;
        }
        .card-description, .card-desc {
          margin: 0 0 18px;
          color: #8f9b94;
          font-size: 13px;
          line-height: 1.65;
          font-weight: 300;
        }

        .menu-grid { display: flex; flex-direction: column; gap: 11px; }
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
          border-radius: 15px;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease, background .2s ease;
        }
        .menu-card::after {
          content: "";
          position: absolute;
          width: 125px;
          height: 125px;
          right: -62px;
          top: -62px;
          border-radius: 50%;
          background: rgba(255,255,255,.035);
          transition: transform .3s ease;
        }
        .exercise-menu {
          background: linear-gradient(135deg, rgba(34,197,94,.13), rgba(20,27,23,.92));
          border: 1px solid rgba(34,197,94,.24);
        }
        .history-menu {
          background: linear-gradient(135deg, rgba(59,130,246,.11), rgba(20,25,24,.94));
          border: 1px solid rgba(96,165,250,.20);
        }
        .menu-card:hover {
          transform: translateY(-3px);
          border-color: rgba(255,255,255,.18);
          box-shadow: 0 12px 28px rgba(0,0,0,.24);
        }
        .menu-card:hover::after { transform: scale(1.25); }
        .menu-icon {
          flex: 0 0 auto;
          width: 49px;
          height: 49px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          font-size: 23px;
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .menu-content { min-width: 0; }
        .menu-content h2 {
          margin: 0;
          font-size: 15px;
          line-height: 1.45;
          font-weight: 600;
        }
        .menu-content p {
          margin: 4px 0 0;
          color: #98a39c;
          font-size: 12px;
          line-height: 1.55;
          font-weight: 300;
        }
        .arrow {
          margin-left: auto;
          padding-left: 7px;
          color: #738078;
          font-size: 21px;
          transition: transform .2s ease, color .2s ease;
        }
        .menu-card:hover .arrow { transform: translateX(4px); color: #4ade80; }

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
          border-radius: 12px;
          background: rgba(10,14,12,.52);
          border: 1px solid rgba(255,255,255,.045);
        }
        .info-icon {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
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
          line-height: 1.4;
          font-weight: 600;
        }
        .info-item span {
          display: block;
          margin-top: 2px;
          color: #727e76;
          font-size: 9.5px;
          line-height: 1.4;
          font-weight: 300;
        }

        .bmi-form { display: flex; flex-direction: column; gap: 11px; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { color: #aeb8b2; font-size: 12px; font-weight: 400; }
        .input-group input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          outline: none;
          color: #fff;
          font-size: 13px;
          background: rgba(8,11,10,.76);
          border: 1px solid rgba(255,255,255,.10);
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
        }
        .input-group input::placeholder { color: #59635d; }
        .input-group input:focus {
          background: rgba(8,13,10,.94);
          border-color: rgba(74,222,128,.55);
          box-shadow: 0 0 0 4px rgba(34,197,94,.08);
        }
        .action-btn {
          width: 100%;
          margin-top: 1px;
          padding: 10px 13px;
          border: 0;
          border-radius: 10px;
          cursor: pointer;
          color: #052e16;
          font-size: 13px;
          font-weight: 700;
          background: linear-gradient(135deg, #4ade80, #22c55e);
          box-shadow: 0 8px 20px rgba(34,197,94,.16);
          transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
        }
        .action-btn:hover { transform: translateY(-2px); filter: brightness(1.04); box-shadow: 0 11px 26px rgba(34,197,94,.23); }
        .action-btn:active { transform: translateY(0); }
        .result-box {
          margin-top: 12px;
          padding: 12px 13px;
          border-radius: 12px;
          color: #dbe4de;
          font-size: 12.5px;
          line-height: 1.65;
          background: rgba(9,13,11,.68);
          border: 1px solid rgba(255,255,255,.07);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
        }
        .result-box p { margin: 0; }
        .result-box p + p { margin-top: 6px; }
        .highlight { color: #4ade80; font-weight: 700; }
        .highlight-warning { color: #facc15; font-weight: 700; }

        .upload-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 170px;
          overflow: hidden;
          cursor: pointer;
          border-radius: 14px;
          border: 1.5px dashed rgba(148,163,184,.28);
          background: linear-gradient(145deg, rgba(255,255,255,.025), rgba(255,255,255,.012)), rgba(9,13,11,.48);
          transition: border-color .2s ease, background .2s ease, transform .2s ease;
        }
        .upload-box::before {
          content: "";
          position: absolute;
          inset: 9px;
          border: 1px solid rgba(255,255,255,.025);
          border-radius: 10px;
          pointer-events: none;
        }
        .upload-box:hover {
          transform: translateY(-1px);
          border-color: rgba(56,189,248,.48);
          background: rgba(56,189,248,.035);
        }
        .upload-placeholder {
          position: relative;
          z-index: 1;
          padding: 0 18px;
          color: #9ba69f;
          font-size: 12.5px;
          line-height: 1.6;
          text-align: center;
        }
        .food-preview { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: cover; }
        .scanning-text {
          margin: 8px 0 0;
          color: #38bdf8;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
          animation: pulseText 1.4s ease-in-out infinite;
        }
        .error-text {
          margin: 8px 0 0 !important;
          color: #fca5a5 !important;
          font-size: 12px !important;
          line-height: 1.5;
        }

        .meal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
        .meal-item {
          padding: 13px;
          border-radius: 13px;
          font-size: 11.5px;
          line-height: 1.6;
          background: linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.012));
          border: 1px solid rgba(255,255,255,.065);
          transition: transform .2s ease, border-color .2s ease, background .2s ease;
        }
        .meal-item:hover {
          transform: translateY(-2px);
          border-color: rgba(56,189,248,.22);
          background: rgba(56,189,248,.035);
        }
        .meal-item strong { display: block; margin-bottom: 6px; color: #67d4f8; font-size: 11.5px; font-weight: 600; }
        .meal-item p { margin: 0; color: #aeb8b2; font-weight: 300; }

        .alert-box { margin-top: 10px; padding: 13px 14px; border-radius: 12px; font-size: 12.5px; line-height: 1.65; }
        .alert-success { color: #86efac; background: rgba(34,197,94,.075); border: 1px solid rgba(34,197,94,.24); }
        .alert-danger { color: #fca5a5; background: rgba(239,68,68,.075); border: 1px solid rgba(239,68,68,.23); }
        .workout-suggestion { margin-top: 9px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.09); }
        .workout-suggestion ul { margin: 7px 0 10px 18px; padding: 0; }
        .workout-suggestion li + li { margin-top: 4px; }
        .start-now-btn {
          padding: 7px 12px;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 7px 18px rgba(239,68,68,.14);
          transition: transform .2s ease, box-shadow .2s ease;
        }
        .start-now-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 23px rgba(239,68,68,.22); }

        .dashboard-footer { text-align: center; margin-top: 25px; padding: 2px 0; }
        .dashboard-footer p { margin: 0; color: #59635d; font-size: 10.5px; letter-spacing: 1.1px; font-weight: 300; }

        @keyframes pulseText { 0%,100% { opacity: .55; } 50% { opacity: 1; } }

        @media (max-width: 900px) {
          .dashboard-page { padding-left: 16px; padding-right: 16px; }
          .main-card, .feature-card { padding: 20px; }
        }
        @media (max-width: 768px) {
          .dashboard-page { padding-top: 25px; }
          .top-profile-btn { top: 14px; right: 14px; }
          .dashboard-header { margin-top: 24px; margin-bottom: 23px; }
          .dashboard-header h1 { font-size: 25px; }
          .dashboard-header p { font-size: 13px; }
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
