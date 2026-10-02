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
  const [selectedMeal, setSelectedMeal] = useState(null);

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

  const mealDetails = {
    breakfast: {
      title: "มื้อเช้า",
      kcal: "~400 kcal",
      emoji: "🍓",
      time: "06:30–09:00 น.",
      ingredients: ["ข้าวโอ๊ต", "ไข่ต้ม", "ผลไม้สด"],
      benefits: [
        "ให้พลังงานสำหรับเริ่มต้นวัน",
        "โปรตีนจากไข่ช่วยเสริมสร้างและซ่อมแซมกล้ามเนื้อ",
        "ใยอาหารจากข้าวโอ๊ตและผลไม้ช่วยให้อิ่มนานและช่วยการขับถ่าย"
      ],
      recommendation: "เหมาะสำหรับรับประทานก่อนเริ่มเรียนหรือทำกิจกรรมในช่วงเช้า"
    },
    lunch: {
      title: "มื้อกลางวัน",
      kcal: "~550 kcal",
      emoji: "🥗",
      time: "11:30–13:30 น.",
      ingredients: ["อกไก่", "ข้าวกล้อง", "ผักหลากสี"],
      benefits: [
        "โปรตีนจากอกไก่ช่วยเสริมสร้างกล้ามเนื้อ",
        "คาร์โบไฮเดรตเชิงซ้อนจากข้าวกล้องช่วยให้พลังงานต่อเนื่อง",
        "วิตามิน แร่ธาตุ และใยอาหารจากผักช่วยสนับสนุนสุขภาพโดยรวม"
      ],
      recommendation: "เหมาะสำหรับเติมพลังงานระหว่างวัน โดยควรรับประทานให้ครบทั้งโปรตีน คาร์โบไฮเดรต และผัก"
    },
    dinner: {
      title: "มื้อเย็น",
      kcal: "~350 kcal",
      emoji: "🐟",
      time: "17:30–19:30 น.",
      ingredients: ["ปลาแซลมอน", "ผักต้ม", "คีนัว"],
      benefits: [
        "โปรตีนและไขมันดีจากปลาแซลมอนช่วยสนับสนุนการทำงานของร่างกาย",
        "ผักต้มให้วิตามิน แร่ธาตุ และใยอาหาร",
        "คีนัวช่วยเติมพลังงานและมีโปรตีนจากพืช"
      ],
      recommendation: "เหมาะสำหรับมื้อเย็นที่ต้องการสารอาหารครบถ้วนและไม่หนักเกินไป"
    }
  };

  return (
    <div className="dashboard-page">
      <aside className="dashboard-sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-label="FitTrack">
            <svg viewBox="0 0 32 32" width="27" height="30" aria-hidden="true" focusable="false">
              <path d="M8 3.5h17l-4.5 7H29L13 28v-11H4l4-13.5Z" fill="#a855f7" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">FitTrack</div>
            <div className="brand-tagline">Healthy Today</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="side-nav active" onClick={() => navigate("/")}>
            <span>⌂</span><b>หน้าหลัก</b>
          </button>
          <button className="side-nav" onClick={() => navigate("/exercises")}>
            <span>✦</span><b>ออกกำลังกาย</b>
          </button>
          <button className="side-nav" onClick={() => navigate("/history")}>
            <span>◷</span><b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="side-logout" type="button">
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-copy">
            <div className="logo">FITTRACK</div>
            <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
            <p>ดูแลสุขภาพ · โภชนาการ · AI ตรวจจับท่าทาง</p>
          </div>

          <div className="header-actions">
            <button
              className="profile-pill"
              onClick={() => navigate("/profile")}
              title="โปรไฟล์ของฉัน"
            >
              <div className="profile-avatar">
                <span>{userInitial}</span>
              </div>
              <span className="profile-name">โปรไฟล์</span>
              <span className="profile-chevron">›</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          {/* สุขภาพ */}
          <section className="panel health-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">♡</div>
              <div>
                <h2>สุขภาพของคุณ</h2>
                <span>ข้อมูลล่าสุด</span>
              </div>
            </div>

            <div className="health-grid">
              <div className="metric-card">
                <div className="metric-top">
                  <span className="metric-icon">▣</span>
                  <span>BMI</span>
                </div>

                {bmiResult ? (
                  <>
                    <div className="metric-value">
                      {bmiResult.value}
                      <em>{bmiResult.status.includes("ปกติ") ? "ปกติ" : "ดูผล"}</em>
                    </div>
                    <div className="bmi-scale">
                      <span className="scale-line"></span>
                      <span className="scale-dot"></span>
                    </div>
                    <div className="scale-labels">
                      <span>&lt;18.5 ผอม</span>
                      <span>18.5–25 ปกติ</span>
                      <span>25–30 เกิน</span>
                      <span>&gt;30 อ้วน</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="metric-value placeholder-value">—<em>รอข้อมูล</em></div>
                    <div className="metric-helper">กรอกน้ำหนักและส่วนสูงเพื่อดู BMI</div>
                  </>
                )}
              </div>

              <div className="metric-card">
                <div className="metric-top">
                  <span className="metric-icon fire">♨</span>
                  <span>TDEE</span>
                </div>

                {tdeeResult ? (
                  <>
                    <div className="metric-value tdee-value">
                      {tdeeResult}<small> kcal/วัน</small>
                    </div>
                    <div className="energy-pill">◉ พลังงานที่ควรได้รับ</div>
                  </>
                ) : (
                  <>
                    <div className="metric-value placeholder-value">—<em>รอข้อมูล</em></div>
                    <div className="metric-helper">คำนวณพลังงานต่อวันพร้อม BMI</div>
                  </>
                )}
              </div>
            </div>

            <form onSubmit={calculateHealth} className="health-form">
              <div className="compact-field">
                <label>น้ำหนัก</label>
                <div><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="60" required /><small>kg</small></div>
              </div>
              <div className="compact-field">
                <label>ส่วนสูง</label>
                <div><input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" required /><small>cm</small></div>
              </div>
              <div className="compact-field age-field">
                <label>อายุ</label>
                <div><input type="number" value={age} onChange={(e) => setAge(e.target.value)} /><small>ปี</small></div>
              </div>
              <button type="submit" className="primary-btn">คำนวณสุขภาพ</button>
            </form>
          </section>

          {/* AI อาหาร */}
          <section className="panel food-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">♜</div>
              <div>
                <h2>AI วิเคราะห์อาหาร</h2>
                <span>สแกนเมนูได้ทันที</span>
              </div>
            </div>

            <label className="food-scan-box">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: "none" }}
              />

              {itemImage ? (
                <img src={itemImage} alt="Selected Item" className="food-preview" />
              ) : (
                <div className="food-empty">
                  <div className="camera-orb">●</div>
                  <strong>คลิกอัปโหลดรูป</strong>
                  <span>สแกนแคล · ไขมัน · สารอาหาร</span>
                  <div className="food-tags">
                    <i>อาหาร</i><i>เครื่องดื่ม</i><i>ขนม</i>
                  </div>
                </div>
              )}
            </label>

            {isAnalyzing && <p className="scanning-text">AI กำลังวิเคราะห์...</p>}
            {analysisError && <p className="error-text">⚠️ {analysisError}</p>}

            {itemName && !isAnalyzing && (
              <div className="result-box food-result">
                <span>{itemCategory || "อาหาร"}</span>
                <strong>{itemName}</strong>
                <b>{itemCalories} kcal</b>
              </div>
            )}
          </section>

          {/* ออกกำลังกาย */}
          <section className="panel workout-panel">
            <div className="section-heading">
              <div className="panel-icon blue">✚</div>
              <div>
                <h2>เลือกออกกำลังกาย</h2>
                <span>ฟิตได้ทุกวัน</span>
              </div>
              <button className="text-btn" type="button" onClick={() => navigate("/exercises")}>ดูทั้งหมด</button>
            </div>

            <div className="workout-grid">
              <button className="workout-card" onClick={() => navigate("/exercises")}>
                <div className="workout-art person-art">🏃</div>
                <div className="workout-copy">
                  <span className="mini-label">SMART AI</span>
                  <h3>ออกกำลังกาย</h3>
                  <p>สร้างหุ่น · เผาผลาญ · แข็งแรง</p>
                  <span className="card-action">เริ่มเลย</span>
                </div>
                <div className="workout-glow"></div>
              </button>

              <button className="workout-card history-card" onClick={() => navigate("/history")}>
                <div className="workout-art chart-art">◴</div>
                <div className="workout-copy">
                  <span className="mini-label">TRACKER</span>
                  <h3>ประวัติการใช้งาน</h3>
                  <p>ดูสถิติ · ความคืบหน้า · เป้าหมาย</p>
                  <span className="card-action">เริ่มเลย</span>
                </div>
                <div className="workout-glow"></div>
              </button>
            </div>

            <div className="info-strip">
              <div><span>🤖</span><b>AI Detection</b><small>ตรวจจับท่าทาง</small></div>
              <div><span>123</span><b>นับอัตโนมัติ</b><small>แม่นยำและปลอดภัย</small></div>
              <div><span>↗</span><b>วิเคราะห์สุขภาพ</b><small>BMI · Calories</small></div>
            </div>
          </section>

          {/* อาหาร */}
          <section className="panel meals-panel">
            <div className="section-heading">
              <div className="panel-icon blue">♨</div>
              <div>
                <h2>เมนูอาหารแนะนำ</h2>
                <span>อร่อย · มีประโยชน์</span>
              </div>
            </div>

            <div className="meal-grid">
              <button
                type="button"
                className="meal-item breakfast"
                onClick={() => setSelectedMeal("breakfast")}
                aria-label="ดูรายละเอียดมื้อเช้า"
              >
                <div className="meal-emoji">🍓</div>
                <div><strong>มื้อเช้า</strong><span>~400 kcal</span><p>ข้าวโอ๊ต · ไข่ต้ม · ผลไม้</p></div>
                <b>›</b>
              </button>

              <button
                type="button"
                className="meal-item lunch"
                onClick={() => setSelectedMeal("lunch")}
                aria-label="ดูรายละเอียดมื้อกลางวัน"
              >
                <div className="meal-emoji">🥗</div>
                <div><strong>มื้อกลางวัน</strong><span>~550 kcal</span><p>อกไก่ · ข้าวกล้อง · ผัก</p></div>
                <b>›</b>
              </button>

              <button
                type="button"
                className="meal-item dinner"
                onClick={() => setSelectedMeal("dinner")}
                aria-label="ดูรายละเอียดมื้อเย็น"
              >
                <div className="meal-emoji">🐟</div>
                <div><strong>มื้อเย็น</strong><span>~350 kcal</span><p>ปลาแซลมอน · ผักต้ม · คีนัว</p></div>
                <b>›</b>
              </button>
            </div>

            {itemCalories > 0 && tdeeResult && (
              <div className={`alert-box ${calorieSurplus > 0 ? "alert-danger" : "alert-success"}`}>
                {calorieSurplus > 0 ? (
                  <>
                    <strong>⚠️ เกินประมาณ {calorieSurplus} kcal</strong>
                    <span>แนะนำ Squat {requiredSquatReps} ครั้ง หรือ Jumping Jack {requiredJumpingJackReps} ครั้ง</span>
                    <button onClick={() => navigate("/exercises")} className="start-now-btn">ไปออกกำลังกาย</button>
                  </>
                ) : (
                  <p>✅ พลังงานอยู่ในเกณฑ์เหมาะสม</p>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="dashboard-footer">Small Steps · Big Changes · FITTRACK</footer>
      </main>

      {selectedMeal && (
        <div
          className="meal-modal-backdrop"
          onClick={() => setSelectedMeal(null)}
          role="presentation"
        >
          <div
            className="meal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="meal-modal-close"
              onClick={() => setSelectedMeal(null)}
              aria-label="ปิดรายละเอียดเมนู"
            >
              ×
            </button>

            <div className="meal-modal-top">
              <div className="meal-modal-icon">
                {mealDetails[selectedMeal].emoji}
              </div>

              <div className="meal-modal-heading">
                <div>
                  <span className="meal-modal-label">รายละเอียดเมนู</span>
                  <h2 id="meal-modal-title">{mealDetails[selectedMeal].title}</h2>
                </div>
                <span className="meal-modal-kcal">{mealDetails[selectedMeal].kcal}</span>
              </div>
            </div>

            <div className="meal-modal-section">
              <strong>🕐 ช่วงเวลาที่แนะนำ</strong>
              <p>{mealDetails[selectedMeal].time}</p>
            </div>

            <div className="meal-modal-section">
              <strong>🥗 ส่วนประกอบ</strong>
              <div className="meal-ingredient-list">
                {mealDetails[selectedMeal].ingredients.map((ingredient) => (
                  <span key={ingredient}>{ingredient}</span>
                ))}
              </div>
            </div>

            <div className="meal-modal-section">
              <strong>💪 ประโยชน์ที่ได้รับ</strong>
              <ul>
                {mealDetails[selectedMeal].benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </div>

            <div className="meal-modal-tip">
              <b>💡 แนะนำ</b>
              <span>{mealDetails[selectedMeal].recommendation}</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
          margin: 0;
          background: #eef4fb;
          color: #173b73;
          font-family: "Anuphan", sans-serif;
        }

        button, input { font-family: inherit; }

        .dashboard-page {
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(circle at 70% 10%, rgba(87,153,255,.12), transparent 27%),
            linear-gradient(135deg, #f9fcff 0%, #eef5ff 48%, #f7fbff 100%);
        }

        /* ---------- SIDEBAR ---------- */

        .dashboard-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: 232px;
          padding: 31px 18px 24px;
          display: flex;
          flex-direction: column;
          z-index: 20;
          background: rgba(255,255,255,.93);
          border-right: 1px solid #dbe7f4;
          box-shadow: 8px 0 30px rgba(35,82,137,.045);
          backdrop-filter: blur(18px);
        }

        .brand-block {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 10px 30px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #5b9cf6, #1769dc);
          box-shadow: 0 9px 20px rgba(24,119,242,.22);
        }

        .brand-mark img {
          width: 27px;
          height: 30px;
          display: block;
          object-fit: contain;
        }

        .brand-name {
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 21px;
          font-weight: 600;
          line-height: 1.1;
        }

        .brand-tagline {
          margin-top: 3px;
          color: #8aa0b9;
          font-size: 9px;
          letter-spacing: .5px;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .side-nav {
          width: 100%;
          min-height: 51px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 0;
          border-radius: 15px;
          cursor: pointer;
          color: #5c7594;
          background: transparent;
          font-size: 13px;
          text-align: left;
          transition: .22s ease;
        }

        .side-nav span {
          width: 31px;
          height: 31px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          color: #4376b8;
          background: #edf5ff;
          font-size: 16px;
        }

        .side-nav:hover,
        .side-nav.active {
          color: #1558a9;
          background: #e7f1ff;
          transform: translateX(2px);
        }

        .side-nav.active span {
          color: #fff;
          background: linear-gradient(145deg, #4d97f5, #1769dc);
          box-shadow: 0 5px 12px rgba(24,119,242,.2);
        }

        .side-logout {
          margin-top: auto;
          padding: 12px 14px;
          border: 0;
          color: #69809a;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 11px;
        }

        .side-logout span {
          margin-right: 9px;
          color: #3b79c5;
          font-size: 17px;
        }

        /* ---------- MAIN ---------- */

        .dashboard-main {
          width: calc(100% - 232px);
          margin-left: 232px;
          min-width: 0;
          padding: 0 31px 36px;
            border-right: none !important;
  box-shadow: none;
        }

        .dashboard-header {
          min-height: 122px;
          padding: 25px 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #dfe9f4;
        }

        .header-copy {
          text-align: center;
        }

        .logo {
          margin-bottom: 2px;
          color: #2b7eea;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .dashboard-header h1 {
          margin: 0;
          color: #11396f;
          font-family: "Kanit", sans-serif;
          font-size: clamp(27px, 3.2vw, 39px);
          font-weight: 600;
          line-height: 1.25;
        }

        .dashboard-header p {
          margin: 5px 0 0;
          color: #68809f;
          font-size: 13px;
          line-height: 1.5;
        }

        .header-actions {
          position: absolute;
          right: 0;
          top: 33px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .notify-btn {
          position: relative;
          width: 43px;
          height: 43px;
          border: 0;
          border-radius: 50%;
          color: #55749a;
          background: #fff;
          box-shadow: 0 8px 20px rgba(28,75,125,.08);
          cursor: pointer;
          font-size: 18px;
        }

        .notify-btn i {
          position: absolute;
          top: 8px;
          right: 9px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ff5b5b;
        }

        .profile-pill {
          min-height: 43px;
          padding: 4px 12px 4px 4px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #dce8f5;
          border-radius: 24px;
          color: #315b8f;
          background: #fff;
          box-shadow: 0 8px 20px rgba(28,75,125,.07);
          cursor: pointer;
          transition: .2s ease;
        }

        .profile-pill:hover {
          transform: translateY(-2px);
          border-color: #a9c9ee;
          box-shadow: 0 11px 24px rgba(24,119,242,.13);
        }

        .profile-avatar {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: linear-gradient(145deg, #4f99f6, #1769dc);
          font-weight: 700;
        }

        .profile-name {
          font-size: 11px;
          font-weight: 600;
        }

        .profile-chevron {
          color: #6d8aab;
          font-size: 19px;
        }

        .dashboard-content {
          max-width: 1230px;
          margin: 0 auto;
          padding-top: 20px;
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(330px, .9fr);
          grid-template-areas:
            "health food"
            "workout workout"
            "meals meals";
          gap: 18px;
        }

        /* ---------- PANELS ---------- */

        .panel {
          position: relative;
          min-width: 0;
          padding: 20px;
          overflow: hidden;
          border: 1px solid #dbe8f5;
          border-radius: 19px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 10px 28px rgba(35,82,137,.065);
          transition: transform .22s ease, box-shadow .22s ease;
        }

        .panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, #1877f2, #74b3ff, transparent);
        }

        .panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 35px rgba(35,82,137,.09);
        }

        .health-panel { grid-area: health; }
        .food-panel { grid-area: food; }
        .workout-panel { grid-area: workout; }
        .meals-panel { grid-area: meals; }

        .panel-heading,
        .section-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          margin-bottom: 16px;
        }

        .panel-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          font-size: 18px;
          background: linear-gradient(145deg, #4e98f6, #1769dc);
          box-shadow: 0 8px 17px rgba(24,119,242,.19);
        }

        .panel-heading h2,
        .section-heading h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
          white-space: nowrap;
        }

        .panel-heading span:not(.heading-badge),
        .section-heading span:not(.text-btn) {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 9.5px;
          line-height: 1.4;
        }

        .heading-badge {
          margin-left: auto;
          padding: 6px 10px;
          border-radius: 999px;
          color: #3175c5;
          background: #eaf3ff;
          border: 1px solid #d8e9fb;
          font-size: 9px;
          font-weight: 600;
          white-space: nowrap;
        }

        /* ---------- HEALTH ---------- */

        .health-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 11px;
        }

        .metric-card {
          position: relative;
          min-height: 151px;
          padding: 15px;
          border: 1px solid #e2ebf5;
          border-radius: 15px;
          background: linear-gradient(145deg, #f9fcff, #f3f8fd);
          overflow: hidden;
          transition: .2s ease;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          border-color: #c9ddef;
          box-shadow: 0 8px 20px rgba(24,119,242,.07);
        }

        .metric-top {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #315a8f;
          font-size: 12px;
          font-weight: 700;
        }

        .metric-icon {
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: #2f7ee8;
          background: #e6f1ff;
        }

        .metric-icon.fire {
          color: #ff9d31;
          background: #fff0db;
        }

        .metric-value {
          display: flex;
          align-items: baseline;
          gap: 9px;
          margin-top: 7px;
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 34px;
          font-weight: 600;
          line-height: 1.1;
        }

        .metric-value em {
          padding: 4px 9px;
          border-radius: 999px;
          color: #27a36a;
          background: #dcf7ea;
          font-family: "Anuphan", sans-serif;
          font-size: 9px;
          font-style: normal;
          font-weight: 700;
        }

        .placeholder-value {
          color: #a8b7c7;
        }

        .tdee-value small {
          color: #66809e;
          font-family: "Anuphan", sans-serif;
          font-size: 10px;
          font-weight: 500;
        }

        .metric-helper {
          margin-top: 11px;
          color: #8295aa;
          font-size: 9.5px;
        }

        .bmi-scale {
          position: relative;
          height: 10px;
          margin-top: 12px;
        }

        .scale-line {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #74b9ff 0 25%, #63d3a1 25% 55%, #ffc45e 55% 78%, #ff6e6e 78%);
        }

        .scale-dot {
          position: absolute;
          left: 47%;
          top: -3px;
          width: 16px;
          height: 16px;
          border: 3px solid #fff;
          border-radius: 50%;
          background: #45bb87;
          box-shadow: 0 3px 7px rgba(34,100,72,.2);
        }

        .scale-labels {
          display: flex;
          justify-content: space-between;
          gap: 5px;
          margin-top: 6px;
          color: #8799ad;
          font-size: 7.5px;
        }

        .energy-pill {
          width: fit-content;
          margin-top: 13px;
          padding: 6px 10px;
          border-radius: 999px;
          color: #3174bf;
          background: #e8f2ff;
          font-size: 9px;
        }

        .health-form {
          margin-top: 12px;
          padding-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr .75fr 1.2fr;
          gap: 8px;
          border-top: 1px solid #e4ecf5;
        }

        .compact-field label {
          display: block;
          margin-bottom: 4px;
          color: #6d8199;
          font-size: 8.5px;
          font-weight: 600;
        }

        .compact-field > div {
          position: relative;
        }

        .compact-field input {
          width: 100%;
          height: 35px;
          padding: 7px 30px 7px 10px;
          outline: none;
          border: 1px solid #d6e2ee;
          border-radius: 9px;
          color: #173b73;
          background: #fff;
          font-size: 10px;
        }

        .compact-field input:focus {
          border-color: #1877f2;
          box-shadow: 0 0 0 3px rgba(24,119,242,.08);
        }

        .compact-field small {
          position: absolute;
          right: 8px;
          top: 10px;
          color: #91a2b5;
          font-size: 8px;
        }

        .primary-btn,
        .start-now-btn {
          height: 35px;
          align-self: end;
          border: 0;
          border-radius: 9px;
          color: #fff;
          background: linear-gradient(135deg, #1877f2, #0d5dcc);
          box-shadow: 0 7px 15px rgba(24,119,242,.18);
          cursor: pointer;
          font-size: 10px;
          font-weight: 700;
          transition: .2s ease;
        }

        .primary-btn:hover,
        .start-now-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(24,119,242,.25);
        }

        /* ---------- FOOD ---------- */

        .food-panel {
          padding-bottom: 18px;
        }

        .food-scan-box {
          position: relative;
          min-height: 222px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          border: 1.5px dashed #a9c8ed;
          border-radius: 18px;
          background:
            radial-gradient(circle at 50% 42%, rgba(24,119,242,.11), transparent 28%),
            #f7faff;
          transition: .22s ease;
        }

        .food-scan-box::before {
          content: "AI FOOD SCAN";
          position: absolute;
          top: 14px;
          left: 15px;
          color: #7c91aa;
          font-size: 7.5px;
          font-weight: 700;
          letter-spacing: 1.7px;
        }

        .food-scan-box:hover {
          transform: translateY(-2px);
          border-color: #1877f2;
          box-shadow: inset 0 0 35px rgba(24,119,242,.05), 0 8px 20px rgba(24,119,242,.07);
        }

        .food-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 5px;
        }

        .camera-orb {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border: 8px solid #e7f1ff;
          border-radius: 17px;
          color: #fff;
          background: #3d8ef2;
          box-shadow: 0 9px 20px rgba(24,119,242,.2);
          font-size: 0;
          transition: .2s ease;
        }

        .camera-orb::after {
          content: "●";
          width: 22px;
          height: 15px;
          display: grid;
          place-items: center;
          border: 3px solid #fff;
          border-radius: 5px;
          color: transparent;
          box-shadow: inset 0 0 0 4px #fff;
        }

        .food-scan-box:hover .camera-orb {
          transform: translateY(-3px) scale(1.05);
        }

        .food-empty strong {
          margin-top: 3px;
          color: #163e78;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 600;
        }

        .food-empty > span {
          color: #758ba4;
          font-size: 9.5px;
        }

        .food-tags {
          display: flex;
          gap: 7px;
          margin-top: 6px;
        }

        .food-tags i {
          padding: 5px 10px;
          border-radius: 999px;
          color: #3174bf;
          background: #e6f1ff;
          border: 1px solid #d5e7fb;
          font-size: 8px;
          font-style: normal;
          font-weight: 600;
        }

        .food-preview {
          width: 100%;
          height: 100%;
          min-height: 222px;
          object-fit: cover;
          border-radius: 16px;
        }

        .scanning-text,
        .error-text {
          margin: 8px 0 0;
          text-align: center;
          font-size: 10px;
        }

        .scanning-text { color: #1877f2; }
        .error-text { color: #d44747; }

        .food-result {
          margin-top: 9px;
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          align-items: center;
        }

        .food-result span {
          color: #6e839d;
          font-size: 9px;
        }

        .food-result strong {
          color: #173b73;
          font-size: 10px;
        }

        .food-result b {
          color: #f08b26;
          font-size: 10px;
        }

        /* ---------- WORKOUT ---------- */

        .section-heading .text-btn {
          margin-left: auto;
        }

        .text-btn {
          padding: 7px 13px;
          border: 1px solid #d8e7f8;
          border-radius: 999px;
          color: #3775ba;
          background: #f3f8ff;
          cursor: pointer;
          font-size: 9px;
          transition: .2s ease;
        }

        .text-btn:hover {
          color: #fff;
          background: #1877f2;
          border-color: #1877f2;
        }

        .workout-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .workout-card {
          position: relative;
          min-height: 190px;
          padding: 22px;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 18px;
          border: 1px solid #1b4b88;
          border-radius: 17px;
          color: #fff;
          background: linear-gradient(135deg, #245da4, #102f5c);
          box-shadow: 0 11px 25px rgba(18,61,115,.18);
          cursor: pointer;
          text-align: left;
          transition: .24s ease;
        }

        .workout-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 17px 34px rgba(18,61,115,.25);
          background: linear-gradient(135deg, #2d6fc1, #0d2b54);
        }

        .workout-card::before {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          right: -75px;
          bottom: -95px;
          border-radius: 50%;
          background: rgba(85,159,250,.22);
        }

        .workout-card::after {
          content: "";
          position: absolute;
          width: 90px;
          height: 90px;
          right: 30px;
          top: -45px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.12);
        }

        .workout-art {
          position: relative;
          z-index: 2;
          width: 74px;
          height: 74px;
          flex: 0 0 74px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          background: rgba(116,178,255,.24);
          border: 1px solid rgba(255,255,255,.15);
          font-size: 35px;
          box-shadow: inset 0 0 20px rgba(255,255,255,.05);
        }

        .chart-art {
          font-size: 42px;
        }

        .workout-copy {
          position: relative;
          z-index: 3;
          min-width: 0;
        }

        .mini-label {
          color: #9bc8ff;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 1.4px;
        }

        .workout-copy h3 {
          margin: 4px 0 4px;
          color: #fff;
          font-family: "Kanit", sans-serif;
          font-size: 19px;
          font-weight: 600;
          line-height: 1.35;
        }

        .workout-copy p {
          margin: 0 0 12px;
          color: #cbdcf2;
          font-size: 10px;
        }

        .card-action {
          display: inline-flex;
          padding: 7px 20px;
          border: 1px solid rgba(123,187,255,.75);
          border-radius: 999px;
          color: #fff;
          background: rgba(255,255,255,.08);
          font-size: 9px;
          font-weight: 700;
          transition: .2s ease;
        }

        .workout-card:hover .card-action {
          background: #1877f2;
          border-color: #1877f2;
        }

        .info-strip {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 12px;
        }

        .info-strip > div {
          min-width: 0;
          padding: 10px 11px;
          display: grid;
          grid-template-columns: 30px 1fr;
          grid-template-rows: auto auto;
          column-gap: 8px;
          border: 1px solid #dfe9f3;
          border-radius: 11px;
          background: #f9fbfd;
          transition: .2s ease;
        }

        .info-strip > div:hover {
          border-color: #bdd7f3;
          background: #f3f8ff;
          transform: translateY(-2px);
        }

        .info-strip span {
          grid-row: 1 / span 2;
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 9px;
          color: #2877d5;
          background: #e7f1ff;
          font-size: 12px;
        }

        .info-strip b {
          align-self: end;
          color: #36597e;
          font-size: 9px;
        }

        .info-strip small {
          align-self: start;
          color: #899bb0;
          font-size: 7.5px;
        }

        /* ---------- MEALS ---------- */

        .meal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
        }

        .meal-item {
          position: relative;
          min-width: 0;
          min-height: 103px;
          width: 100%;
          padding: 13px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #dfe8f2;
          border-radius: 13px;
          background: #fff;
          overflow: hidden;
          cursor: pointer;
          text-align: left;
          font: inherit;
          color: inherit;
          transition: .2s ease;
        }

        .meal-item:focus-visible {
          outline: 3px solid rgba(24,119,242,.18);
          outline-offset: 2px;
        }

        .meal-item:hover {
          transform: translateY(-3px);
          box-shadow: 0 9px 21px rgba(35,82,137,.08);
        }

        .meal-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
        }

        .breakfast::before { background: #ffb83f; }
        .lunch::before { background: #42c49a; }
        .dinner::before { background: #367ff1; }

        .meal-emoji {
          width: 62px;
          height: 62px;
          flex: 0 0 62px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #f2f7fc;
          font-size: 28px;
        }

        .meal-item > div:nth-child(2) {
          min-width: 0;
        }

        .meal-item strong {
          color: #214c83;
          font-size: 11px;
          font-weight: 700;
        }

        .meal-item span {
          margin-left: 7px;
          padding: 4px 7px;
          border-radius: 999px;
          color: #3977ba;
          background: #eaf3ff;
          font-size: 7.5px;
          font-weight: 700;
        }

        .meal-item p {
          margin: 6px 0 0;
          color: #778ca3;
          font-size: 8.5px;
          white-space: nowrap;
        }

        .meal-item > b {
          margin-left: auto;
          width: 27px;
          height: 27px;
          flex: 0 0 27px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #2777d8;
          background: #eaf3ff;
          font-size: 17px;
        }

        .meal-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 22px;
          background: rgba(13,42,78,.48);
          backdrop-filter: blur(7px);
          animation: mealModalFade .2s ease;
        }

        .meal-modal {
          position: relative;
          width: min(600px, 100%);
          max-height: min(780px, calc(100vh - 44px));
          overflow-y: auto;
          padding: 27px;
          border: 1px solid rgba(151,196,255,.24);
          border-radius: 24px;
          color: #e8f2ff;
          background: linear-gradient(150deg, #102b50 0%, #0b2040 58%, #102b50 100%);
          box-shadow: 0 26px 80px rgba(3,16,37,.55), inset 0 1px 0 rgba(255,255,255,.06);
          animation: mealModalPop .24s ease;
        }

        .meal-modal-top {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 3px 42px 19px 0;
          margin-bottom: 5px;
          border-bottom: 1px solid rgba(174,207,247,.15);
        }

        .meal-modal-close {
          position: absolute;
          top: 15px;
          right: 15px;
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(198,222,255,.16);
          border-radius: 50%;
          color: #dceaff;
          background: rgba(220,237,255,.09);
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
          transition: .2s ease;
        }

        .meal-modal-close:hover {
          color: #fff;
          background: #287ee8;
          transform: rotate(6deg);
        }

        .meal-modal-icon {
          width: 70px;
          height: 70px;
          flex: 0 0 70px;
          display: grid;
          place-items: center;
          margin: 0;
          border: 1px solid rgba(148,197,255,.3);
          border-radius: 20px;
          background: linear-gradient(145deg, #214e83, #17375f);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.04), 0 9px 24px rgba(0,0,0,.18);
          font-size: 35px;
        }

        .meal-modal-heading {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0;
          margin: 0;
        }

        .meal-modal-label {
          display: block;
          margin-bottom: 4px;
          color: #9ebde3;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
        }

        .meal-modal-heading h2 {
          margin: 0;
          color: #f4f8ff;
          font-family: "Kanit", sans-serif;
          font-size: 25px;
          font-weight: 600;
          line-height: 1.3;
        }

        .meal-modal-kcal {
          flex: 0 0 auto;
          padding: 7px 11px;
          border: 1px solid rgba(132,190,255,.28);
          border-radius: 999px;
          color: #d9ebff;
          background: rgba(49,124,211,.22);
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .meal-modal-section {
          margin-top: 13px;
          padding: 14px 16px;
          border: 1px solid rgba(159,195,239,.16);
          border-radius: 15px;
          background: rgba(222,237,255,.055);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
        }

        .meal-modal-section > strong {
          display: block;
          margin-bottom: 8px;
          color: #cfe4ff;
          font-size: 11px;
          font-weight: 700;
        }

        .meal-modal-section p {
          margin: 0;
          color: #b5c9e2;
          font-size: 10.5px;
          line-height: 1.7;
        }

        .meal-ingredient-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .meal-ingredient-list span {
          padding: 7px 11px;
          border: 1px solid rgba(116,177,246,.25);
          border-radius: 9px;
          color: #dcecff;
          background: rgba(42,112,190,.24);
          font-size: 9.5px;
          font-weight: 600;
        }

        .meal-modal-section ul {
          margin: 0;
          padding-left: 19px;
          color: #b5c9e2;
          font-size: 10.5px;
          line-height: 1.85;
        }

        .meal-modal-section li { padding-left: 2px; }
        .meal-modal-section li::marker { color: #75b5ff; }

        .meal-modal-tip {
          margin-top: 14px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          border: 1px solid rgba(104,184,255,.25);
          border-left: 3px solid #58a8ff;
          border-radius: 12px;
          background: linear-gradient(100deg, rgba(39,112,190,.24), rgba(39,112,190,.1));
        }

        .meal-modal-tip b {
          color: #d4e9ff;
          font-size: 10px;
        }

        .meal-modal-tip span {
          color: #b7cce5;
          font-size: 9.5px;
          line-height: 1.7;
        }

        @keyframes mealModalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes mealModalPop {
          from {
            opacity: 0;
            transform: translateY(12px) scale(.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .alert-box {
          margin-top: 11px;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 11px;
          font-size: 9px;
        }

        .alert-danger {
          color: #a84444;
          background: #fff5f5;
          border: 1px solid #f0d2d2;
        }

        .alert-success {
          color: #26704a;
          background: #f0faf5;
          border: 1px solid #cfeadb;
        }

        .alert-box > span {
          color: #71859b;
        }

        .start-now-btn {
          margin-left: auto;
          padding: 7px 12px;
        }

        .dashboard-footer {
          padding: 19px 0 0;
          color: #9aacbf;
          text-align: center;
          font-size: 8px;
          letter-spacing: .8px;
        }


        /* ---------- TYPOGRAPHY / MICRO EFFECTS ---------- */

        .dashboard-page {
          font-family: "Anuphan", sans-serif;
        }

        .dashboard-header h1 {
          font-size: clamp(31px, 3.5vw, 43px);
          letter-spacing: -.35px;
          background: linear-gradient(90deg, #123c78 0%, #1877f2 48%, #2f68bd 100%);
          background-size: 200% 100%;
          background-position: 0% 50%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 8px 24px rgba(24,119,242,.08);
          animation: titleWink 3.6s ease-in-out infinite;
        }

        @keyframes titleWink {
          0%, 65%, 100% {
            background-position: 0% 50%;
          }
          78% {
            background-position: 100% 50%;
          }
        }

        .dashboard-header p {
          font-size: 14px;
          letter-spacing: .15px;
        }

        .brand-name {
          font-size: 22px;
          letter-spacing: -.15px;
        }

        .side-nav {
          font-size: 13.5px;
          letter-spacing: .05px;
        }

        .panel-heading h2,
        .section-heading h2 {
          font-size: 20px;
          letter-spacing: -.15px;
        }

        .panel-heading span:not(.heading-badge),
        .section-heading span:not(.text-btn) {
          font-size: 10.5px;
        }

        .heading-badge {
          font-size: 9.5px;
          box-shadow: 0 4px 12px rgba(24,119,242,.06);
        }

        .metric-top {
          font-size: 13px;
        }

        .metric-value {
          font-size: 38px;
          letter-spacing: -.5px;
        }

        .metric-helper {
          font-size: 10px;
        }

        .compact-field label {
          font-size: 9.5px;
        }

        .compact-field input {
          font-size: 11px;
        }

        .primary-btn,
        .start-now-btn {
          font-size: 10.5px;
        }

        .food-empty strong {
          font-size: 17px;
          letter-spacing: -.15px;
        }

        .food-empty > span {
          font-size: 10px;
        }

        .food-tags i {
          font-size: 8.5px;
        }

        .workout-copy h3 {
          font-size: 21px;
          letter-spacing: -.2px;
        }

        .workout-copy p {
          font-size: 10.5px;
        }

        .card-action {
          font-size: 9.5px;
        }

        .info-strip b {
          font-size: 9.5px;
        }

        .meal-item strong {
          font-size: 12px;
        }

        .meal-item p {
          font-size: 9px;
        }

        /* Glow / lift ที่นุ่มขึ้น */
        .panel-icon,
        .brand-mark {
          position: relative;
        }

        .panel-icon::after,
        .brand-mark::after {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: inherit;
          border: 1px solid rgba(82,159,249,.14);
          opacity: 0;
          transform: scale(.82);
          transition: .28s ease;
        }

        .panel:hover .panel-icon::after,
        .brand-block:hover .brand-mark::after {
          opacity: 1;
          transform: scale(1.08);
        }

        .metric-value,
        .workout-copy h3,
        .meal-item strong {
          transition: transform .22s ease, text-shadow .22s ease;
        }

        .metric-card:hover .metric-value {
          transform: translateX(2px);
          text-shadow: 0 5px 16px rgba(24,119,242,.12);
        }

        .workout-card:hover .workout-copy h3 {
          transform: translateX(3px);
          text-shadow: 0 4px 15px rgba(105,184,255,.25);
        }

        .meal-item:hover strong {
          text-shadow: 0 3px 10px rgba(24,119,242,.12);
        }

        .primary-btn,
        .start-now-btn,
        .text-btn,
        .profile-pill,
        .notify-btn {
          will-change: transform;
        }

        .primary-btn:active,
        .start-now-btn:active,
        .text-btn:active,
        .profile-pill:active {
          transform: translateY(1px) scale(.98);
        }

        @media (max-width: 760px) {
          .meal-modal-backdrop {
            padding: 12px;
          }

          .meal-modal {
            padding: 20px;
            border-radius: 20px;
            max-height: calc(100vh - 24px);
          }

          .meal-modal-top { gap: 11px; padding-right: 35px; }
          .meal-modal-icon { width: 56px; height: 56px; flex-basis: 56px; font-size: 29px; border-radius: 16px; }
          .meal-modal-heading { align-items: flex-start; flex-direction: column; gap: 7px; }

          .meal-modal-heading h2 {
            font-size: 22px;
          }

          .dashboard-header h1 {
            font-size: 28px;
          }

          .panel-heading h2,
          .section-heading h2 {
            font-size: 18px;
          }
        }

        @media (max-width: 1050px) {
          .dashboard-sidebar {
            width: 200px;
          }

          .dashboard-main {
            width: calc(100% - 200px);
            margin-left: 200px;
            padding: 0 20px 30px;
          }

          .dashboard-content {
            grid-template-columns: 1fr;
            grid-template-areas:
              "health"
              "food"
              "workout"
              "meals";
          }
        }

        @media (max-width: 760px) {
          .dashboard-page {
            display: block;
          }

          .dashboard-sidebar {
            position: static;
            width: 100%;
            height: auto;
            padding: 12px;
            display: block;
          }

          .brand-block {
            padding: 4px 8px 12px;
          }

          .sidebar-nav {
            flex-direction: row;
          }

          .side-nav {
            justify-content: center;
            min-height: 43px;
            padding: 0 8px;
          }

          .side-nav span {
            display: none;
          }

          .side-logout {
            display: none;
          }

          .dashboard-main {
            width: 100%;
            margin-left: 0;
            padding: 0 12px 25px;
          }

          .dashboard-header {
            min-height: 125px;
            padding: 17px 65px 17px 8px;
          }

          .header-actions {
            right: 0;
            top: 21px;
          }

          .profile-name,
          .profile-chevron {
            display: none;
          }

          .profile-pill {
            padding: 4px;
          }

          .notify-btn {
            display: none;
          }

          .health-grid,
          .workout-grid,
          .meal-grid {
            grid-template-columns: 1fr;
          }

          .health-form {
            grid-template-columns: 1fr 1fr;
          }

          .primary-btn {
            grid-column: 1 / -1;
          }

          .info-strip {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 460px) {
          .dashboard-header h1 {
            font-size: 24px;
          }

          .dashboard-header p {
            font-size: 10px;
          }

          .panel {
            padding: 16px;
            border-radius: 15px;
          }

          .panel-heading h2,
          .section-heading h2 {
            font-size: 16px;
          }

          .heading-badge {
            display: none;
          }

          .health-form {
            grid-template-columns: 1fr;
          }

          .primary-btn {
            grid-column: auto;
          }

          .workout-card {
            min-height: 165px;
            padding: 17px;
          }

          .meal-item p {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
