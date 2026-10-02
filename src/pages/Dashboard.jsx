import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export default function Dashboard() {
  const navigate = useNavigate();
  const [userInitial, setUserInitial] = useState("?");

  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
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
  const [exerciseBurned, setExerciseBurned] = useState(0);

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
    setExerciseBurned(0);

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
        headers: {
          Accept: "application/json",
        },
      });

      // อ่านเป็น text ก่อน แล้วค่อย JSON.parse เพื่อป้องกัน
      // `Unexpected end of JSON input` เมื่อ API ส่ง body ว่างหรือส่ง HTML/error กลับมา
      const rawText = await response.text();
      let data = null;

      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText);
        } catch (parseError) {
          console.error("API returned non-JSON response:", rawText);
          throw new Error(
            response.ok
              ? "เซิร์ฟเวอร์วิเคราะห์อาหารส่งข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ API /api/analyze-food"
              : `เซิร์ฟเวอร์วิเคราะห์อาหารตอบกลับ ${response.status} แต่ไม่ใช่ JSON`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            (rawText.trim()
              ? `ไม่สามารถวิเคราะห์ภาพได้ (HTTP ${response.status})`
              : `ไม่สามารถวิเคราะห์ภาพได้ เพราะเซิร์ฟเวอร์ไม่ส่งข้อมูลกลับมา (HTTP ${response.status})`)
        );
      }

      if (!data || typeof data !== "object") {
        throw new Error(
          "เซิร์ฟเวอร์วิเคราะห์อาหารไม่ได้ส่งผลลัพธ์กลับมา กรุณาตรวจสอบ API /api/analyze-food"
        );
      }

      setItemName(data.name || data.foodName || "ไม่สามารถระบุได้ชัดเจน");
      setItemCategory(data.category || data.type || "ไม่สามารถระบุได้");
      setItemCalories(
        Number.isFinite(Number(data.calories ?? data.kcal))
          ? Number(data.calories ?? data.kcal)
          : 0
      );
      setItemConfidence(
        Number.isFinite(Number(data.confidence))
          ? Number(data.confidence)
          : null
      );
      setItemNote(data.note || data.description || "");
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

  const bmiScalePosition = bmiResult ? (() => {
    const bmi = Number(bmiResult.value);
    if (bmi < 18.5) return Math.max(0, (bmi / 18.5) * 25);
    if (bmi < 25) return 25 + ((bmi - 18.5) / 6.5) * 30;
    if (bmi < 30) return 55 + ((bmi - 25) / 5) * 23;
    return Math.min(100, 78 + ((bmi - 30) / 10) * 22);
  })() : 0;

  const dailyCalorieTarget = tdeeResult || 0;
  const consumedCalories = itemCalories || 0;
  const remainingCalories = dailyCalorieTarget
    ? dailyCalorieTarget - consumedCalories + exerciseBurned
    : 0;
  const calorieSurplus = dailyCalorieTarget
    ? Math.max(0, consumedCalories - dailyCalorieTarget - exerciseBurned)
    : 0;
  const exerciseNeeded = calorieSurplus > 0 ? calorieSurplus : 0;
  const exerciseMinutes = exerciseNeeded > 0 ? Math.ceil(exerciseNeeded / 6) : 0;

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
            <span className="brand-spark spark-one" aria-hidden="true">✦</span>
            <span className="brand-spark spark-two" aria-hidden="true">✦</span>
            <svg className="brand-exercise-logo" viewBox="0 0 48 48" width="29" height="29" aria-hidden="true" focusable="false">
              <path d="M10 18v12M14 15v18M18 20h12M30 15v18M34 18v12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"/>
              <path d="M18 24h12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
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

        <button
          className="side-logout"
          type="button"
          onClick={async () => {
            try {
              await signOut(auth);
              navigate("/login", { replace: true });
            } catch (err) {
              console.error("ออกจากระบบไม่สำเร็จ:", err);
            }
          }}
        >
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-copy">
            <div className="logo">FITTRACK</div>
            <h1>ระบบออกกำลังกายอัจฉริยะ</h1>
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
              <div>
                <h2 className="health-section-title">สุขภาพของคุณ</h2>
              </div>
            </div>

            <div className="health-grid">
              <div className="metric-card">
                <div className="metric-top">
                  <span>BMI</span>
                </div>

                {bmiResult ? (
                  <div className="health-result bmi-result">
                    <div className="result-main">
                      <div className="metric-value">{bmiResult.value}</div>
                      <span className={`result-status ${bmiResult.status.includes("ปกติ") ? "normal" : "attention"}`}>
                        {bmiResult.status.includes("ปกติ") ? "ปกติ" : "ดูแลเพิ่มเติม"}
                      </span>
                    </div>
                    <div className="result-description">{bmiResult.status}</div>
                    <div className="bmi-scale compact-scale">
                      <span className="scale-line"></span>
                      <span className="scale-dot" style={{ left: `${bmiScalePosition}%` }}></span>
                    </div>
                    <div className="scale-labels">
                      <span>&lt;18.5</span>
                      <span>18.5–25</span>
                      <span>25–30</span>
                      <span>&gt;30</span>
                    </div>
                  </div>
                ) : (
                  <div className="health-empty-state">
                    <div className="health-empty-copy">
                      <strong>พร้อมดูแลสุขภาพของคุณ · กรอกข้อมูลด้านล่างเพื่อดู BMI</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="metric-card">
                <div className="metric-top">
                  <span>TDEE</span>
                </div>

                {tdeeResult ? (
                  <div className="health-result tdee-result">
                    <div className="result-main">
                      <div className="metric-value tdee-value">
                        {tdeeResult}<small>kcal/วัน</small>
                      </div>
                    </div>
                    <div className="energy-pill">พลังงานที่แนะนำต่อวัน</div>
                    <div className="result-description">คำนวณจากข้อมูลร่างกายและกิจกรรมของคุณ</div>
                  </div>
                ) : (
                  <div className="health-empty-state tdee-empty">
                    <div className="health-empty-copy">
                      <strong>พลังงานของคุณจะอยู่ตรงนี้ · ระบบจะคำนวณ TDEE พร้อมกับ BMI</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={calculateHealth} className="health-form">
              <div className="health-form-head">
                <div className="health-form-title">
                  <div>
                    <strong>ข้อมูลร่างกายของคุณ</strong>
                    <span>กรอกข้อมูลด้านล่าง แล้วให้ FitTrack คำนวณ BMI และพลังงานที่เหมาะสมให้คุณ</span>
                  </div>
                </div>
              </div>

              <div className="health-input-row">
                <div className="modern-field">
                  <div className="modern-field-copy">
                    <label htmlFor="weight">น้ำหนัก</label>
                    <div className="modern-input-wrap">
                      <input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0" required />
                      <small>kg</small>
                    </div>
                  </div>
                </div>

                <div className="modern-field">
                  <div className="modern-field-copy">
                    <label htmlFor="height">ส่วนสูง</label>
                    <div className="modern-input-wrap">
                      <input id="height" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="0" required />
                      <small>cm</small>
                    </div>
                  </div>
                </div>

                <div className="modern-field age-modern-field">
                  <div className="modern-field-copy">
                    <label htmlFor="age">อายุ</label>
                    <div className="modern-input-wrap">
                      <input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="0" required />
                      <small>ปี</small>
                    </div>
                  </div>
                </div>

                <button type="submit" className="health-calculate-btn">
                  <span>ดูผลสุขภาพ</span>
                  <small>คำนวณ BMI + TDEE</small>
                </button>
              </div>
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
              <div className="food-result-dashboard">
                <div className="food-result-top">
                  <div>
                    <span className="food-result-category">{itemCategory || "อาหาร / เครื่องดื่ม / ของกินเล่น"}</span>
                    <strong>{itemName}</strong>
                  </div>
                  <div className="food-kcal-badge">
                    <b>{itemCalories}</b>
                    <small>kcal</small>
                  </div>
                </div>

                {tdeeResult ? (
                  <div className="calorie-tracker">
                    <div className="calorie-tracker-head">
                      <span>แคลอรี่วันนี้</span>
                      <b>เป้าหมาย {dailyCalorieTarget.toLocaleString()} kcal</b>
                    </div>
                    <div className="calorie-progress">
                      <span style={{ width: `${Math.min(100, Math.round((consumedCalories / dailyCalorieTarget) * 100))}%` }}></span>
                    </div>
                    <div className="calorie-summary">
                      <div><small>กินไป</small><strong>{consumedCalories.toLocaleString()} kcal</strong></div>
                      <div className={remainingCalories < 0 ? "remaining-danger" : "remaining-ok"}>
                        <small>{remainingCalories < 0 ? "เกินเป้าหมาย" : "กินได้อีก"}</small>
                        <strong>{Math.abs(remainingCalories).toLocaleString()} kcal</strong>
                      </div>
                    </div>

                    {calorieSurplus > 0 ? (
                      <div className="calorie-warning">
                        <div>
                          <strong>⚠️ เกินแคลอรี่ {calorieSurplus.toLocaleString()} kcal</strong>
                          <span>แนะนำออกกำลังกายเพิ่มประมาณ {exerciseMinutes} นาที เพื่อช่วยชดเชยพลังงานส่วนเกิน</span>
                        </div>
                        <button type="button" onClick={() => navigate("/exercises")} className="food-exercise-btn">ไปออกกำลังกาย</button>
                      </div>
                    ) : (
                      <div className="calorie-good">✓ หลังมื้อนี้ยังอยู่ในกรอบพลังงานที่ตั้งไว้</div>
                    )}

                    <div className="exercise-adjust">
                      <span>ออกกำลังกายเพิ่มแล้ว</span>
                      <div>
                        {[0, 100, 200, 300].map((value) => (
                          <button key={value} type="button" className={exerciseBurned === value ? "active" : ""} onClick={() => setExerciseBurned(value)}>
                            {value === 0 ? "0" : `-${value}`}
                          </button>
                        ))}
                        <small>kcal</small>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="calorie-no-target">กรอกข้อมูลสุขภาพก่อน เพื่อดูว่าเมนูนี้ใช้พลังงานไปเท่าไรจากเป้าหมายต่อวัน</div>
                )}
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
            className={`meal-modal ${selectedMeal}`}
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

            <div className="meal-modal-section time-section">
              <strong>🕐 ช่วงเวลาที่แนะนำ</strong>
              <p>{mealDetails[selectedMeal].time}</p>
            </div>

            <div className="meal-modal-section ingredients-section">
              <strong>🥗 ส่วนประกอบ</strong>
              <div className="meal-ingredient-list">
                {mealDetails[selectedMeal].ingredients.map((ingredient) => (
                  <span key={ingredient}>{ingredient}</span>
                ))}
              </div>
            </div>

            <div className="meal-modal-section benefits-section">
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
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        html {
          scroll-behavior: smooth;
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow-x: hidden;
        }

        body {
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow-x: hidden;
          border: 0;
          background: #eef4fb;
          color: #173b73;
          font-family: "IBM Plex Sans Thai", sans-serif;
        }

        button, input { font-family: inherit; }

        #root {
          width: 100%;
          min-height: 100vh;
          margin: 0;
          border: 0;
        }

        .dashboard-page {
          width: 100%;
          max-width: 100%;
          min-height: 100vh;
          margin: 0;
          border: 0;
          overflow-x: hidden;
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
          position: relative;
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: #fff;
          background: linear-gradient(145deg, #5b9cf6 0%, #2b82ec 48%, #1769dc 100%);
          box-shadow: 0 10px 24px rgba(24,119,242,.25);
          overflow: visible;
          isolation: isolate;
          transition: transform .22s ease, box-shadow .22s ease;
        }

        .brand-exercise-logo {
          position: relative;
          z-index: 3;
          filter: drop-shadow(0 2px 5px rgba(0,0,0,.12));
          transition: transform .22s ease;
        }

        .brand-spark {
          position: absolute;
          z-index: 4;
          color: #fff;
          line-height: 1;
          pointer-events: none;
          opacity: 0;
          text-shadow: 0 0 8px rgba(255,255,255,.95), 0 0 14px rgba(126,202,255,.8);
          animation: brandSparkle 2.4s ease-in-out infinite;
        }

        .spark-one {
          top: -7px;
          right: -6px;
          font-size: 12px;
        }

        .spark-two {
          bottom: -5px;
          left: -5px;
          font-size: 8px;
          animation-delay: 1.1s;
        }

        @keyframes brandSparkle {
          0%, 100% { opacity: 0; transform: scale(.45) rotate(0deg); }
          35% { opacity: 1; transform: scale(1.08) rotate(12deg); }
          58% { opacity: .35; transform: scale(.78) rotate(28deg); }
          75% { opacity: 0; transform: scale(.45) rotate(42deg); }
        }

        .brand-mark img {
          width: 27px;
          height: 30px;
          display: block;
          object-fit: contain;
        }

        .brand-name {
          color: #123c78;
          font-family: "IBM Plex Sans Thai", sans-serif;
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
          cursor: default;
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
          flex: 1 1 auto;
          width: auto;
          max-width: 100%;
          margin-left: 232px;
          min-width: 0;
          padding: 0 31px 36px;
          border: 0;
          outline: 0;
        }

        .dashboard-main,
        .dashboard-content,
        .dashboard-footer {
          border-right: 0 !important;
          outline: 0;
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
          font-family: "IBM Plex Sans Thai", sans-serif;
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
          padding: 24px 0 10px;
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas:
            "workout"
            "health"
            "food"
            "meals";
          gap: 24px;
          align-items: start;
        }

        /* ---------- PANELS ---------- */

        .panel {
          position: relative;
          min-width: 0;
          padding: 24px;
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
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
          white-space: nowrap;
        }

        .health-panel .health-section-title {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -.2px;
          background: linear-gradient(100deg, #1558a9 0%, #2d82ed 48%, #7a5af8 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
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
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 34px;
          font-weight: 600;
          line-height: 1.1;
        }

        .metric-value em {
          padding: 4px 9px;
          border-radius: 999px;
          color: #27a36a;
          background: #dcf7ea;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 9px;
          font-style: normal;
          font-weight: 700;
        }

        .placeholder-value {
          color: #a8b7c7;
        }

        .tdee-value small {
          color: #66809e;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 10px;
          font-weight: 500;
        }

        .metric-helper {
          margin-top: 11px;
          color: #8295aa;
          font-size: 9.5px;
        }

        .health-result {
          min-height: 92px;
          margin-top: 10px;
          padding: 11px 12px 9px;
          border: 1px solid #dce9f6;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(255,255,255,.94), rgba(239,247,255,.92));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
        }

        .result-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .result-status {
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 8.5px;
          font-weight: 700;
          white-space: nowrap;
        }

        .result-status.normal {
          color: #21865a;
          background: #ddf7ea;
          border: 1px solid #c5ecd9;
        }

        .result-status.attention {
          color: #b87518;
          background: #fff1d9;
          border: 1px solid #f4dfb7;
        }

        .result-description {
          margin-top: 4px;
          color: #7b91aa;
          font-size: 8.5px;
          line-height: 1.45;
        }

        .health-empty-state {
          min-height: 111px;
          margin-top: 9px;
          padding: 13px;
          display: flex;
          align-items: center;
          gap: 11px;
          border: 1px dashed #cbdff2;
          border-radius: 14px;
          background: linear-gradient(135deg, #f8fbff, #f1f7fd);
        }

        .empty-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #2c80ed;
          background: #e7f2ff;
          font-size: 18px;
          box-shadow: 0 5px 12px rgba(24,119,242,.09);
        }

        .fire-empty {
          color: #f39a31;
          background: #fff1dd;
        }

        .health-empty-state strong {
          display: block;
          color: #a8b1bd;
          font-size: 11px;
          font-weight: 600;
        }

        .health-empty-state p {
          margin: 4px 0 0;
          color: #8ba0b7;
          font-size: 8.5px;
          line-height: 1.5;
        }

        .compact-scale {
          margin-top: 9px;
        }

        .tdee-result {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .tdee-result .result-main {
          justify-content: flex-start;
        }

        .tdee-result .energy-pill {
          margin-top: 7px;
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
          left: 0%;
          transform: translateX(-50%);
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
          position: relative;
          margin-top: 22px;
          padding: 22px;
          border: 1px solid #dbe8f5;
          border-radius: 24px;
          background:
            radial-gradient(circle at 8% 0%, rgba(76,153,255,.12), transparent 24%),
            radial-gradient(circle at 100% 100%, rgba(75,204,165,.07), transparent 26%),
            #ffffff;
          box-shadow: 0 14px 32px rgba(35,82,137,.065);
          overflow: hidden;
        }

        .health-form::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #62adff, #247ff0 50%, #69d2ad);
        }

        .health-form-head {
          display: flex;
          justify-content: center;
          margin-bottom: 18px;
        }

        .health-form-title {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .health-form-orb {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #58a7ff, #176cdd);
          box-shadow: 0 8px 18px rgba(24,119,242,.18);
          font-size: 17px;
        }

        .health-form-title strong {
          display: block;
          color: #153f79;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.2;
        }

        .health-form-title span:not(.health-form-orb) {
          display: block;
          margin-top: 4px;
          color: #8197af;
          font-size: 9.5px;
          line-height: 1.4;
        }

        .health-form-badge { display: none; }

        /* Desktop: 4 ช่องขนาดเท่ากันจริง และไม่มี element ซ้อนกัน */
        .health-input-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          align-items: stretch;
        }

        .modern-field {
          min-width: 0;
          height: 118px;
          padding: 14px 15px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: space-between;
          gap: 9px;
          border: 1px solid #dce8f4;
          border-radius: 18px;
          background: linear-gradient(145deg, #ffffff, #f9fcff);
          box-shadow: 0 6px 17px rgba(40,91,145,.045);
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }

        .modern-field:hover {
          border-color: #c5dbef;
          box-shadow: 0 10px 22px rgba(40,91,145,.07);
          transform: translateY(-1px);
        }

        .modern-field:focus-within {
          border-color: #69a9ed;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(24,119,242,.065), 0 12px 24px rgba(24,119,242,.08);
          transform: translateY(-2px);
        }

        .modern-field-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #2d82ed;
          background: #eaf4ff;
          font-size: 17px;
          font-weight: 700;
        }

        .height-icon {
          color: #687be5;
          background: #eef0ff;
        }

        .age-icon {
          color: #24a377;
          background: #e8f9f2;
        }

        .modern-field-copy {
          min-width: 0;
          width: 100%;
        }

        .modern-field label {
          display: block;
          margin: 0 0 4px;
          color: #647e9c;
          font-size: 10px;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
        }

        .modern-input-wrap {
          width: 100%;
          min-width: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e5edf5;
        }

        .modern-input-wrap input {
          width: 100%;
          min-width: 0;
          height: 27px;
          padding: 0;
          outline: none;
          border: 0 !important;
          color: #143e79;
          background: transparent;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 23px;
          font-weight: 600;
          line-height: 1;
        }

        .modern-input-wrap input::placeholder {
          color: #c3cfdb;
          opacity: 1;
        }

        .modern-input-wrap input::-webkit-outer-spin-button,
        .modern-input-wrap input::-webkit-inner-spin-button {
          margin: 0;
          -webkit-appearance: none;
        }

        .modern-input-wrap input[type=number] { -moz-appearance: textfield; }

        .modern-input-wrap small {
          flex: 0 0 auto;
          padding: 5px 7px;
          border-radius: 7px;
          color: #7891ab;
          background: #f0f6fc;
          font-size: 8px;
          font-weight: 700;
          line-height: 1;
        }

        .health-calculate-btn {
          position: relative;
          min-width: 0;
          height: 118px;
          padding: 15px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 12px;
          color: #fff;
          background:
            radial-gradient(circle at 86% 12%, rgba(255,255,255,.22), transparent 29%),
            radial-gradient(circle at 100% 100%, rgba(75,184,255,.2), transparent 38%),
            linear-gradient(135deg, #318cf7 0%, #1769d8 72%, #1558bf 100%);
          box-shadow: 0 12px 25px rgba(24,119,242,.22);
          cursor: default;
          overflow: hidden;
          transition: transform .22s ease, box-shadow .22s ease;
        }

        .health-calculate-btn::before,
        .health-calculate-btn::after {
          content: none !important;
          display: none !important;
        }

        .health-calculate-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 30px rgba(24,119,242,.28);
        }

        .health-calculate-btn:active { transform: translateY(0) scale(.985); }

        .health-calculate-btn > span {
          position: relative;
          z-index: 1;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 15px;
          font-weight: 600;
          line-height: 1.1;
          white-space: nowrap;
        }

        .health-calculate-btn small {
          position: relative;
          z-index: 1;
          color: rgba(255,255,255,.78);
          font-size: 8px;
          white-space: nowrap;
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
          font-family: "IBM Plex Sans Thai", sans-serif;
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

        /* ---------- FOOD RESULT / CALORIE TRACKER ---------- */
        .food-scan-box {
          aspect-ratio: 4 / 3;
          min-height: 0;
          height: auto;
        }

        .food-preview {
          width: 100%;
          height: 100%;
          min-height: 0;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          display: block;
          border-radius: 16px;
        }

        .food-result-dashboard {
          margin-top: 12px;
          padding: 15px;
          border: 1px solid #d9e8f7;
          border-radius: 18px;
          background: linear-gradient(145deg, #ffffff 0%, #f5f9ff 100%);
          box-shadow: 0 10px 26px rgba(35,82,137,.07);
        }

        .food-result-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .food-result-top > div:first-child { min-width: 0; }
        .food-result-category {
          display: block;
          color: #7190b1;
          font-size: 10px;
          font-weight: 600;
        }
        .food-result-top strong {
          display: block;
          margin-top: 3px;
          color: #183f78;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 18px;
          font-weight: 600;
        }
        .food-kcal-badge {
          flex: 0 0 auto;
          min-width: 78px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          border: 1px solid #ffdcae;
          border-radius: 14px;
          color: #e98218;
          background: #fff7e9;
        }
        .food-kcal-badge b {
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 22px;
          line-height: 1;
        }
        .food-kcal-badge small { font-size: 9px; font-weight: 700; }

        .calorie-tracker {
          margin-top: 13px;
          padding-top: 13px;
          border-top: 1px solid #e4edf6;
        }
        .calorie-tracker-head, .calorie-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .calorie-tracker-head { color: #547392; font-size: 10px; }
        .calorie-tracker-head b { color: #2e5d8f; font-size: 10px; }
        .calorie-progress {
          height: 9px;
          margin: 8px 0 10px;
          overflow: hidden;
          border-radius: 999px;
          background: #e9f0f7;
        }
        .calorie-progress span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #42a5ff, #42c49a);
          transition: width .35s ease;
        }
        .calorie-summary > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .calorie-summary small { color: #8aa0b7; font-size: 9px; }
        .calorie-summary strong { color: #315a8f; font-family: "IBM Plex Sans Thai", sans-serif; font-size: 17px; }
        .calorie-summary > div:last-child { text-align: right; }
        .remaining-ok strong { color: #1d9a68; }
        .remaining-danger strong { color: #dc4b4b; }

        .calorie-warning, .calorie-good {
          margin-top: 11px;
          padding: 10px 11px;
          border-radius: 13px;
        }
        .calorie-warning {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid #f3cccc;
          background: #fff5f5;
        }
        .calorie-warning strong { display: block; color: #c83f3f; font-size: 10px; }
        .calorie-warning span { display: block; margin-top: 3px; color: #9b6a6a; font-size: 8.5px; line-height: 1.5; }
        .food-exercise-btn {
          flex: 0 0 auto;
          padding: 8px 11px;
          border: 0;
          border-radius: 9px;
          color: #fff;
          background: #dc5252;
          cursor: pointer;
          font-size: 9px;
          font-weight: 700;
        }
        .calorie-good {
          color: #237a58;
          background: #effaf5;
          border: 1px solid #d0eddf;
          font-size: 9px;
          font-weight: 600;
        }
        .calorie-no-target {
          margin-top: 10px;
          padding: 10px 11px;
          border-radius: 11px;
          color: #7890a9;
          background: #f4f8fc;
          font-size: 9px;
          line-height: 1.5;
        }
        .exercise-adjust {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: #7890a9;
          font-size: 8.5px;
        }
        .exercise-adjust > div { display: flex; align-items: center; gap: 4px; }
        .exercise-adjust button {
          min-width: 34px;
          padding: 4px 6px;
          border: 1px solid #d8e6f4;
          border-radius: 7px;
          color: #5e7c9d;
          background: #fff;
          cursor: pointer;
          font-size: 8px;
          font-weight: 700;
        }
        .exercise-adjust button.active {
          color: #fff;
          border-color: #2e86ee;
          background: #2e86ee;
        }
        .exercise-adjust small { font-size: 8px; }

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
          font-family: "IBM Plex Sans Thai", sans-serif;
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

        /* ---------- MEAL DETAIL POPUP ---------- */

        .meal-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px;
          background:
            radial-gradient(circle at 50% 25%, rgba(67,151,255,.12), transparent 35%),
            rgba(6, 24, 48, .66);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          animation: mealModalFade .22s ease;
        }

        .meal-modal {
          --meal-accent: #5aa8ff;
          --meal-accent-soft: rgba(76,155,244,.15);
          --meal-accent-border: rgba(116,181,255,.25);

          position: relative;
          width: min(760px, 100%);
          max-height: min(820px, calc(100vh - 56px));
          overflow-y: auto;
          padding: 25px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          border: 1px solid rgba(151,196,255,.28);
          border-radius: 28px;
          color: #e8f2ff;
          background:
            radial-gradient(circle at 10% 0%, rgba(82,157,255,.16), transparent 28%),
            radial-gradient(circle at 95% 100%, rgba(56,122,222,.12), transparent 30%),
            linear-gradient(150deg, #102f59 0%, #0b2243 55%, #0d294f 100%);
          box-shadow:
            0 32px 90px rgba(2,14,33,.62),
            0 0 0 1px rgba(255,255,255,.025),
            inset 0 1px 0 rgba(255,255,255,.08);
          animation: mealModalPop .28s cubic-bezier(.2,.8,.2,1);
          scrollbar-width: thin;
          scrollbar-color: rgba(117,181,255,.45) transparent;
        }

        .meal-modal::-webkit-scrollbar {
          width: 6px;
        }

        .meal-modal::-webkit-scrollbar-track {
          background: transparent;
        }

        .meal-modal::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(117,181,255,.4);
        }

        .meal-modal.breakfast {
          --meal-accent: #ffbf55;
          --meal-accent-soft: rgba(255,191,85,.14);
          --meal-accent-border: rgba(255,191,85,.28);
        }

        .meal-modal.lunch {
          --meal-accent: #58d5a8;
          --meal-accent-soft: rgba(88,213,168,.14);
          --meal-accent-border: rgba(88,213,168,.27);
        }

        .meal-modal.dinner {
          --meal-accent: #69aaff;
          --meal-accent-soft: rgba(105,170,255,.15);
          --meal-accent-border: rgba(105,170,255,.28);
        }

        .meal-modal-top {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 15px;
          min-width: 0;
          padding: 1px 48px 17px 1px;
          margin-bottom: 1px;
          border-bottom: 1px solid rgba(174,207,247,.14);
          position: relative;
        }

        .meal-modal-top::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -1px;
          width: 86px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--meal-accent), transparent);
        }

        .meal-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(198,222,255,.18);
          border-radius: 50%;
          color: #dceaff;
          background: rgba(220,237,255,.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
          cursor: pointer;
          font-size: 25px;
          line-height: 1;
          transition: .22s ease;
          z-index: 5;
        }

        .meal-modal-close:hover {
          color: #fff;
          background: var(--meal-accent);
          border-color: var(--meal-accent);
          box-shadow: 0 8px 22px rgba(55,135,235,.28);
          transform: rotate(8deg) scale(1.04);
        }

        .meal-modal-icon {
          width: 72px;
          height: 72px;
          flex: 0 0 72px;
          display: grid;
          place-items: center;
          margin: 0;
          border: 1px solid var(--meal-accent-border);
          border-radius: 21px;
          background:
            linear-gradient(145deg, rgba(255,255,255,.08), transparent),
            var(--meal-accent-soft);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.035),
            0 12px 28px rgba(0,0,0,.18);
          font-size: 35px;
          position: relative;
        }

        .meal-modal-icon::after {
          content: "";
          position: absolute;
          inset: -5px;
          border-radius: 25px;
          border: 1px solid var(--meal-accent-border);
          opacity: .45;
        }

        .meal-modal-heading {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 0;
          margin: 0;
        }

        .meal-modal-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 5px;
          color: #9ebde3;
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .meal-modal-label::before {
          content: "✦";
          color: var(--meal-accent);
          font-size: 10px;
        }

        .meal-modal-heading h2 {
          margin: 0;
          color: #f7fbff;
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 27px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -.3px;
        }

        .meal-modal-kcal {
          flex: 0 0 auto;
          padding: 8px 13px;
          border: 1px solid var(--meal-accent-border);
          border-radius: 999px;
          color: #f1f7ff;
          background: var(--meal-accent-soft);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .meal-modal-section {
          min-width: 0;
          margin: 0;
          padding: 15px 16px;
          border: 1px solid rgba(159,195,239,.14);
          border-radius: 17px;
          background: rgba(222,237,255,.055);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
          transition: .2s ease;
        }

        .meal-modal-section:hover {
          border-color: rgba(139,196,255,.24);
          background: rgba(222,237,255,.07);
          transform: translateY(-1px);
        }

        .meal-modal-section.time-section,
        .meal-modal-section.ingredients-section {
          min-height: 126px;
        }

        .meal-modal-section.benefits-section,
        .meal-modal-tip {
          grid-column: 1 / -1;
        }

        .meal-modal-section > strong {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 10px;
          color: #d8eaff;
          font-size: 11px;
          font-weight: 700;
        }

        .meal-modal-section > strong::after {
          content: "";
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(136,192,255,.2), transparent);
        }

        .meal-modal-section p {
          margin: 0;
          color: #c0d2e8;
          font-size: 11px;
          line-height: 1.7;
        }

        .time-section p {
          min-height: 58px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 10px;
          border: 1px solid rgba(128,184,248,.11);
          border-radius: 12px;
          color: #e8f3ff;
          background: rgba(44,112,188,.13);
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 16px;
          font-weight: 500;
          letter-spacing: .1px;
        }

        .meal-ingredient-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .meal-ingredient-list span {
          min-width: 0;
          min-height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 7px 9px;
          border: 1px solid var(--meal-accent-border);
          border-radius: 11px;
          color: #e4f1ff;
          background: var(--meal-accent-soft);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
          font-size: 9.5px;
          font-weight: 600;
          text-align: center;
          transition: .2s ease;
        }

        .meal-ingredient-list span:hover {
          transform: translateY(-2px);
          border-color: var(--meal-accent);
        }

        .meal-modal-section ul {
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 9px;
          list-style: none;
          color: #bfd1e6;
          font-size: 10px;
          line-height: 1.65;
        }

        .meal-modal-section li {
          position: relative;
          min-height: 82px;
          padding: 11px 11px 11px 29px;
          display: flex;
          align-items: center;
          border: 1px solid rgba(143,193,244,.11);
          border-radius: 13px;
          background: rgba(255,255,255,.035);
        }

        .meal-modal-section li::before {
          content: "✓";
          position: absolute;
          left: 10px;
          top: 12px;
          width: 17px;
          height: 17px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #0d294d;
          background: var(--meal-accent);
          font-size: 9px;
          font-weight: 800;
        }

        .meal-modal-section li::marker {
          color: transparent;
        }

        .meal-modal-tip {
          margin: 0;
          padding: 14px 16px;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 13px;
          border: 1px solid var(--meal-accent-border);
          border-left: 3px solid var(--meal-accent);
          border-radius: 15px;
          background:
            linear-gradient(100deg, var(--meal-accent-soft), rgba(39,112,190,.07));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
        }

        .meal-modal-tip b {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #f0f7ff;
          font-size: 10.5px;
        }

        .meal-modal-tip span {
          color: #c2d5e9;
          font-size: 9.5px;
          line-height: 1.65;
        }

        @keyframes mealModalFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes mealModalPop {
          from {
            opacity: 0;
            transform: translateY(14px) scale(.965);
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
          font-family: "IBM Plex Sans Thai", sans-serif;
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
        .panel-icon {
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

        .brand-block:hover .brand-mark {
          transform: translateY(-2px) rotate(-1deg);
          box-shadow: 0 14px 28px rgba(24,119,242,.3);
        }

        .brand-block:hover .brand-exercise-logo {
          transform: scale(1.06);
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
            padding: 18px;
            border-radius: 22px;
            max-height: calc(100vh - 24px);
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .meal-modal-top {
            gap: 11px;
            padding-right: 35px;
          }

          .meal-modal-icon {
            width: 56px;
            height: 56px;
            flex-basis: 56px;
            font-size: 29px;
            border-radius: 16px;
          }

          .meal-modal-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 7px;
          }

          .meal-modal-heading h2 {
            font-size: 22px;
          }

          .meal-modal-section.time-section,
          .meal-modal-section.ingredients-section,
          .meal-modal-section.benefits-section,
          .meal-modal-tip {
            grid-column: 1;
          }

          .meal-modal-section.time-section,
          .meal-modal-section.ingredients-section {
            min-height: auto;
          }

          .meal-modal-section ul {
            grid-template-columns: 1fr;
          }

          .meal-modal-section li {
            min-height: 0;
          }

          .meal-modal-tip {
            align-items: flex-start;
            flex-direction: column;
            gap: 5px;
          }

          .dashboard-header h1 {
            font-size: 28px;
          }

          .panel-heading h2,
          .section-heading h2 {
            font-size: 18px;
          }
        }

        /* ---------- MODERN READABILITY PASS ---------- */
        .dashboard-page {
          font-family: "IBM Plex Sans Thai", sans-serif;
          font-size: 15px;
        }

        .dashboard-page button,
        .dashboard-page input,
        .dashboard-page textarea,
        .dashboard-page select {
          font-family: "IBM Plex Sans Thai", sans-serif;
        }

        .brand-name { font-size: 24px; }
        .side-nav { font-size: 15px; }
        .side-logout { font-size: 13px; }
        .side-logout span { font-size: 19px; }
        .dashboard-header h1 { font-size: clamp(32px, 3.5vw, 43px); }
        .dashboard-header p { font-size: 15px; }
        .panel-heading h2, .section-heading h2 { font-size: 22px; }
        .panel-heading span:not(.heading-badge),
        .section-heading span:not(.text-btn) { font-size: 12px; }
        .metric-top { font-size: 15px; }
        .metric-icon { width: 31px; height: 31px; font-size: 16px; }
        .metric-value { font-size: 40px; }
        .metric-value em, .result-status { font-size: 11px; }
        .metric-helper, .result-description { font-size: 11px; }
        .health-empty-state strong { font-size: 14px; }
        .health-empty-state p { font-size: 11px; }
        .health-form { padding: 22px; }
        .health-form-title strong { font-size: 17px; }
        .health-form-title span:not(.health-form-orb) { font-size: 10.5px; }
        .health-form-badge { font-size: 10px; padding: 8px 12px; }
        .modern-field { min-height: 82px; padding: 13px 15px; gap: 13px; border-radius: 18px; }
        .modern-field-icon { width: 42px; height: 42px; flex-basis: 42px; font-size: 18px; }
        .modern-field label { font-size: 10px; margin-bottom: 3px; }
        .modern-input-wrap input { height: 31px; font-size: 24px; }
        .modern-input-wrap small { font-size: 9px; }
        .health-calculate-btn { min-height: 82px; padding-left: 56px; border-radius: 12px; }
        .health-calculate-btn > span { font-size: 15px; }
        .health-calculate-btn small { font-size: 9px; }
        .scale-labels { font-size: 9px; }
        .energy-pill { font-size: 11px; }

        /* ---------- COMPACT HEALTH COPY ---------- */
        .health-empty-copy {
          min-width: 0;
          flex: 1;
        }
        .health-empty-state strong {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .health-empty-state {
          min-height: 78px;
          padding: 12px 14px;
          gap: 10px;
        }
        .empty-icon { width: 38px; height: 38px; flex-basis: 38px; font-size: 18px; }
        .health-form { padding: 22px; margin-top: 22px; border-radius: 24px; }
        .health-form-head { margin-bottom: 18px; }
        .health-form-title { gap: 13px; }
        .health-form-orb { width: 44px; height: 44px; flex-basis: 44px; border-radius: 14px; font-size: 18px; }
        .health-form-title strong { font-size: 17px; }
        .health-form-title span:not(.health-form-orb) { font-size: 10.5px; }
        .modern-field { min-height: 82px; padding: 13px 15px; gap: 13px; border-radius: 18px; }
        .modern-field-icon { width: 42px; height: 42px; flex-basis: 42px; border-radius: 13px; font-size: 18px; }
        .modern-field label { font-size: 10px; margin-bottom: 3px; }
        .modern-input-wrap input { height: 31px; font-size: 24px; }
        .modern-input-wrap small { font-size: 9px; }
        .health-calculate-btn { min-height: 82px; border-radius: 12px; padding-left: 56px; }
        .health-calculate-btn > span { font-size: 15px; }
        .health-calculate-btn small { font-size: 9px; }

        /* Result cards: cleaner, larger, no downward arrows */
        .health-empty-state {
          min-height: 122px;
          padding: 17px;
          gap: 14px;
          border: 1px solid #d7e7f7;
          border-radius: 17px;
          background: linear-gradient(135deg, #ffffff 0%, #f4f9ff 100%);
          box-shadow: 0 8px 22px rgba(45,93,145,.06);
        }
        .empty-icon {
          width: 46px; height: 46px; flex-basis: 46px;
          border-radius: 14px; font-size: 21px;
        }

        .health-result {
          min-height: 108px;
          margin-top: 10px;
          padding: 14px 15px 12px;
          border-radius: 17px;
        }
        .result-main { gap: 12px; }
        .bmi-result .metric-value { font-size: 42px; }
        .tdee-value { font-size: 38px; }

        .food-tags i, .card-action, .info-strip b, .meal-item strong { font-size: 11px; }
        .workout-copy h3 { font-size: 23px; }
        .workout-copy p { font-size: 12px; }
        .meal-item p { font-size: 10.5px; }
        .primary-btn, .start-now-btn { font-size: 12px; }
        .text-btn { font-size: 12px; }
        .profile-name { font-size: 13px; }
        .profile-chevron { font-size: 21px; }

        @media (max-width: 1050px) {
          .health-input-row {
            grid-template-columns: 1fr 1fr;
          }

          .health-calculate-btn {
            grid-column: 1 / -1;
          }


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
              "workout"
              "health"
              "food"
              "meals";
          }
        }

        @media (max-width: 760px) {
          .food-scan-box { aspect-ratio: 4 / 3; }
          .food-result-top strong { font-size: 16px; }
          .calorie-warning { align-items: flex-start; flex-direction: column; }
          .food-exercise-btn { width: 100%; }

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

          .health-input-row {
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
          .health-empty-state strong { white-space: normal; }
          .food-scan-box { aspect-ratio: 1 / 1; }
          .food-preview { aspect-ratio: 1 / 1; }
          .food-result-top { align-items: flex-start; }
          .food-kcal-badge { min-width: 68px; }

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

          .health-input-row {
            grid-template-columns: 1fr;
          }

          .health-form-head {
            align-items: flex-start;
          }

          .health-form-badge {
            display: none;
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

          .meal-modal {
            padding: 15px;
          }

          .meal-modal-top {
            padding-bottom: 14px;
          }

          .meal-modal-heading h2 {
            font-size: 20px;
          }

          .meal-modal-kcal {
            font-size: 9px;
            padding: 7px 10px;
          }

          .meal-ingredient-list {
            grid-template-columns: 1fr;
          }

          .time-section p {
            font-size: 14px;
          }
        }
      /* ---------- HEALTH FORM FINAL BALANCE ---------- */
      .health-form {
        padding: 24px;
        border-radius: 24px;
      }

      .health-form-head {
        margin-bottom: 20px;
      }

      .health-form-title {
        max-width: 620px;
      }

      .health-form-title strong {
        font-size: 18px;
      }

      .health-form-title span:not(.health-form-orb) {
        font-size: 10px;
      }

      .health-input-row {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .modern-field,
      .health-calculate-btn {
        width: 100%;
        min-width: 0;
        height: 124px;
        min-height: 124px;
        box-sizing: border-box;
      }

      .modern-field {
        padding: 15px;
        gap: 8px;
        border-radius: 18px;
      }

      .modern-field-icon {
        width: 40px;
        height: 40px;
        flex-basis: 40px;
        border-radius: 12px;
      }

      .modern-field-copy {
        width: 100%;
        min-width: 0;
      }

      .modern-field label {
        font-size: 10px;
        margin-bottom: 5px;
      }

      .modern-input-wrap {
        width: 100%;
        padding-bottom: 5px;
      }

      .modern-input-wrap input {
        height: 28px;
        font-size: 24px;
      }

      .modern-input-wrap small {
        padding: 5px 7px;
        font-size: 8px;
      }

      .health-calculate-btn {
        padding: 14px;
        border-radius: 12px;
        gap: 6px;
      }

      .health-calculate-btn::before {
        width: 40px;
        height: 40px;
        border-radius: 12px;
      }

      .health-calculate-btn > span {
        font-size: 15px;
      }

      .health-calculate-btn small {
        font-size: 8px;
      }

      @media (max-width: 1050px) {
        .health-input-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 520px) {
        .health-form {
          padding: 17px;
        }

        .health-form-title {
          width: 100%;
        }

        .health-form-title strong {
          font-size: 16px;
        }

        .health-form-title span:not(.health-form-orb) {
          font-size: 9px;
        }

        .health-input-row {
          grid-template-columns: 1fr;
        }
      }


        /* ---------- CLEAN HEALTH ICON-FREE LAYOUT ---------- */
        .health-panel > .panel-heading { justify-content: flex-start; }
        .health-panel .metric-top { justify-content: flex-start; padding-left: 2px; }
        .health-panel .health-form-title { gap: 0; width: 100%; }
        .health-panel .health-form-title strong,
        .health-panel .health-form-title span { text-align: center; }
        .health-panel .health-form-title > div { width: 100%; }
        .health-panel .modern-field { justify-content: center; }
        .health-panel .health-calculate-btn::before { display: none; }
        .health-panel .health-calculate-btn { padding: 14px 18px; }
        .health-panel .health-calculate-btn > span,
        .health-panel .health-calculate-btn small { text-align: center; }
        .health-panel .energy-pill { padding-left: 0; background: transparent; color: #5f7fa3; border-radius: 0; }
        .health-panel .health-empty-state { justify-content: center; text-align: center; }
        .health-panel .health-empty-copy { width: 100%; }
        .health-panel .health-empty-state strong { white-space: normal; overflow: visible; text-overflow: clip; }


        @media (max-width: 560px) {
          .health-panel .health-section-title {
            font-size: 20px;
          }
        }

        /* =========================================================
           PREMIUM DASHBOARD REDESIGN
           One font system + depth + motion + balanced spacing
           ========================================================= */
        :root {
          --ui-blue-1: #2f8cff;
          --ui-blue-2: #1769d8;
          --ui-blue-3: #0e4fae;
          --ui-ink: #123765;
          --ui-muted: #7187a3;
          --ui-line: rgba(125, 164, 207, .24);
          --ui-surface: rgba(255,255,255,.86);
          --ui-shadow: 0 18px 50px rgba(26, 79, 137, .11);
          --ui-radius: 24px;
        }

        html, body, button, input, textarea, select,
        .dashboard-page, .dashboard-page * {
          font-family: "IBM Plex Sans Thai" !important;
        }

        body {
          color: var(--ui-ink);
          background: #edf5ff;
        }

        .dashboard-page {
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          background:
            radial-gradient(circle at 8% 8%, rgba(83,164,255,.22), transparent 25%),
            radial-gradient(circle at 92% 18%, rgba(116,214,255,.17), transparent 24%),
            radial-gradient(circle at 52% 92%, rgba(55,132,255,.10), transparent 30%),
            linear-gradient(135deg, #f7fbff 0%, #edf5ff 48%, #f8fbff 100%);
        }

        .dashboard-page::before,
        .dashboard-page::after {
          content: "";
          position: fixed;
          z-index: -1;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          filter: blur(55px);
          pointer-events: none;
          opacity: .38;
          animation: uiFloat 10s ease-in-out infinite alternate;
        }

        .dashboard-page::before {
          top: 8%; left: 24%;
          background: rgba(55, 143, 255, .18);
        }
        .dashboard-page::after {
          right: 4%; bottom: 8%;
          background: rgba(67, 195, 255, .14);
          animation-delay: -4s;
        }

        @keyframes uiFloat {
          from { transform: translate3d(0, 0, 0) scale(1); }
          to { transform: translate3d(18px, -14px, 0) scale(1.08); }
        }

        .dashboard-sidebar {
          background: rgba(255,255,255,.84) !important;
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          border-right: 1px solid rgba(137, 177, 220, .22) !important;
          box-shadow: 12px 0 45px rgba(32, 84, 140, .07) !important;
        }

        .side-nav {
          border: 1px solid transparent;
          transition: transform .25s ease, background .25s ease, box-shadow .25s ease, color .25s ease;
        }
        .side-nav:hover {
          transform: translateX(4px);
          background: rgba(231,241,255,.82) !important;
          box-shadow: 0 8px 22px rgba(40, 113, 197, .08);
        }
        .side-nav.active {
          transform: translateX(3px);
          background: linear-gradient(135deg, rgba(225,240,255,.95), rgba(242,248,255,.95)) !important;
          border-color: rgba(73, 143, 221, .18);
          box-shadow: 0 10px 25px rgba(36, 113, 196, .10);
        }

        .dashboard-main {
          position: relative;
        }

        .dashboard-header {
          min-height: 148px;
          margin: 0 -31px;
          padding: 30px 31px 24px;
          border-bottom: 1px solid rgba(139, 177, 216, .18) !important;
          background: linear-gradient(180deg, rgba(255,255,255,.48), rgba(255,255,255,.04));
        }

        .header-copy {
          position: relative;
          padding: 17px 34px;
          border: 1px solid rgba(145, 183, 220, .18);
          border-radius: 26px;
          background: rgba(255,255,255,.42);
          box-shadow: 0 12px 35px rgba(35, 89, 146, .06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .header-copy::after {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(120deg, rgba(68,151,255,.45), transparent 42%, rgba(108,206,255,.35));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        .logo {
          color: #2b7eea !important;
          letter-spacing: 2.8px;
        }
        .dashboard-header h1 {
          font-family: "IBM Plex Sans Thai" !important;
          font-weight: 700;
          letter-spacing: -.5px;
          background: linear-gradient(90deg, #123e7b, #1f73d4, #123e7b);
          background-size: 180% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: titleFlow 7s ease-in-out infinite;
        }
        @keyframes titleFlow {
          0%,100% { background-position: 0% center; }
          50% { background-position: 100% center; }
        }

        .dashboard-content {
          max-width: 1240px;
          padding-top: 28px;
          gap: 24px;
          grid-template-columns: 1fr;
          grid-template-areas:
            "workout"
            "health"
            "food"
            "meals";
        }

        .panel {
          position: relative;
          padding: 27px;
          border: 1px solid var(--ui-line) !important;
          border-radius: var(--ui-radius) !important;
          background: linear-gradient(145deg, rgba(255,255,255,.94), rgba(248,252,255,.82)) !important;
          box-shadow: var(--ui-shadow) !important;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          transition: transform .3s cubic-bezier(.2,.75,.25,1), box-shadow .3s ease, border-color .3s ease;
        }

        .panel::before {
          height: 4px !important;
          background: linear-gradient(90deg, #2d8cff, #63c4ff 55%, transparent) !important;
          opacity: .95;
        }
        .panel::after {
          content: "";
          position: absolute;
          width: 150px;
          height: 150px;
          right: -75px;
          top: -75px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(70,157,255,.12), transparent 68%);
          pointer-events: none;
          transition: transform .45s ease;
        }
        .panel:hover {
          transform: translateY(-5px);
          border-color: rgba(70, 143, 220, .34) !important;
          box-shadow: 0 24px 60px rgba(27, 85, 145, .14) !important;
        }
        .panel:hover::after { transform: scale(1.25); }

        .panel-heading, .section-heading {
          margin-bottom: 20px;
          gap: 13px;
        }
        .panel-heading h2, .section-heading h2 {
          font-family: "IBM Plex Sans Thai" !important;
          font-weight: 700 !important;
          color: #143d76 !important;
          letter-spacing: -.2px;
        }
        .panel-heading p, .section-heading p { color: #7890ab; }

        .panel-icon {
          width: 46px !important;
          height: 46px !important;
          flex-basis: 46px !important;
          border-radius: 15px !important;
          background: linear-gradient(145deg, #58aaff, #1769d8) !important;
          box-shadow: 0 10px 24px rgba(24,119,242,.23) !important;
          transition: transform .3s ease, box-shadow .3s ease;
        }
        .panel:hover .panel-icon {
          transform: rotate(-4deg) scale(1.06);
          box-shadow: 0 14px 28px rgba(24,119,242,.28) !important;
        }

        .workout-grid { gap: 16px; }
        .workout-card {
          min-height: 205px;
          padding: 24px;
          border: 1px solid rgba(255,255,255,.16) !important;
          border-radius: 21px !important;
          background: linear-gradient(135deg, #2d78cf 0%, #123f78 72%, #0c2c58 100%) !important;
          box-shadow: 0 16px 32px rgba(18,61,115,.18) !important;
          transition: transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease, filter .3s ease;
        }
        .workout-card::before {
          opacity: .22;
          background: radial-gradient(circle at 85% 15%, #fff, transparent 30%);
        }
        .workout-card:hover {
          transform: translateY(-7px) scale(1.01);
          filter: saturate(1.08);
          box-shadow: 0 24px 45px rgba(18,61,115,.27) !important;
        }

        .health-input-row { gap: 14px !important; }
        .modern-input-wrap {
          border-radius: 15px !important;
          border-color: rgba(130,166,204,.28) !important;
          background: rgba(249,252,255,.9) !important;
          transition: border-color .25s ease, box-shadow .25s ease, transform .25s ease;
        }
        .modern-input-wrap:focus-within {
          border-color: rgba(47,140,255,.55) !important;
          box-shadow: 0 0 0 4px rgba(47,140,255,.09), 0 10px 24px rgba(47,140,255,.08) !important;
          transform: translateY(-2px);
        }
        .modern-input-wrap input {
          font-family: "IBM Plex Sans Thai" !important;
        }

        .health-calculate-btn {
          border-radius: 17px !important;
          box-shadow: 0 16px 30px rgba(24,119,242,.23) !important;
          transition: transform .28s ease, box-shadow .28s ease, filter .28s ease !important;
        }
        .health-calculate-btn:hover {
          transform: translateY(-4px);
          filter: brightness(1.04);
          box-shadow: 0 22px 38px rgba(24,119,242,.29) !important;
        }

        .food-panel, .meals-panel { overflow: hidden; }
        .food-panel .food-upload,
        .food-panel .analysis-card,
        .meal-item {
          border-radius: 17px !important;
        }
        .meal-grid { gap: 15px; }
        .meal-item {
          border-color: rgba(130,166,204,.22) !important;
          background: rgba(255,255,255,.78) !important;
          box-shadow: 0 7px 20px rgba(35,82,137,.045);
          transition: transform .28s ease, box-shadow .28s ease, border-color .28s ease;
        }
        .meal-item:hover {
          transform: translateY(-5px) !important;
          border-color: rgba(47,140,255,.30) !important;
          box-shadow: 0 16px 30px rgba(35,82,137,.10) !important;
        }

        .dashboard-footer {
          padding-top: 12px !important;
          color: #8196af !important;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }

        @media (max-width: 1050px) {
          .dashboard-header {
            margin: 0 -20px;
            padding-left: 20px;
            padding-right: 20px;
          }
          .dashboard-content {
            gap: 18px;
          }
        }

        @media (max-width: 680px) {
          .dashboard-header {
            min-height: 125px;
          }
          .header-copy {
            width: 100%;
            padding: 15px 18px;
            border-radius: 20px;
          }
          .dashboard-content { padding-top: 20px; gap: 16px; }
          .panel { padding: 20px; border-radius: 20px !important; }
          .workout-grid, .meal-grid { grid-template-columns: 1fr; }
          .workout-card { min-height: 160px; }
        }
      `}</style>
    </div>
  );
}
