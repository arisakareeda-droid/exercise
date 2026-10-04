import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { readEnergy, readTdee, subscribeEnergy, writeTarget, writeTdee } from "../calorieSync";

// แคชชื่อผู้ใช้ไว้ เพื่อให้เปลี่ยนหน้าแล้วชื่อขึ้นทันที ไม่กระพริบเป็นชื่ออื่น
const NAME_CACHE_KEY = "fittrack-user-name";
const getCachedName = () => {
  try { return localStorage.getItem(NAME_CACHE_KEY) || ""; } catch { return ""; }
};
const setCachedName = (name) => {
  try { localStorage.setItem(NAME_CACHE_KEY, name); } catch { /* storage optional */ }
};
const clearCachedName = () => {
  try { localStorage.removeItem(NAME_CACHE_KEY); } catch { /* storage optional */ }
};
const getInitialName = () => getCachedName() || auth.currentUser?.displayName || "";

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [bmiResult, setBmiResult] = useState(null);
  const [tdeeResult, setTdeeResult] = useState(readTdee);

  const [itemImage, setItemImage] = useState(null);
  const [itemCalories, setItemCalories] = useState(0);
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemConfidence, setItemConfidence] = useState(null);
  const [itemNote, setItemNote] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [dailyConsumedCalories, setDailyConsumedCalories] = useState(getSavedDailyCalories);
  // ยอดเผาผลาญจากโหมดเกม (หน้าเกมส่งมาเรียลไทม์ผ่าน calorieSync)
  const [energy, setEnergy] = useState(() => readEnergy());
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [goalWeight, setGoalWeight] = useState("");
  const [mealTab, setMealTab] = useState("เช้า");
  const [toast, setToast] = useState(null);
  const showToast = (text, type = "success") => setToast({ text, type, id: Date.now() });
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // ธีม: "dark" (ค่าเริ่มต้น) | "light" — จำค่าที่เลือกไว้ในเบราว์เซอร์
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("fittrack-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("fittrack-theme", theme);
    } catch {
      /* ไม่เป็นไรถ้าเบราว์เซอร์บล็อก storage */
    }
  }, [theme]);

  // ออกจากหน้านี้แล้วคืนค่า ไม่ให้ธีมไปกระทบหน้าอื่น
  useEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  // ใช้ค่า Animation จากหน้าตั้งค่า (ปิดแล้วอนิเมชันการ์ดในหน้านี้จะหยุด)
  useEffect(() => {
    const root = document.documentElement;
    try {
      const saved = JSON.parse(localStorage.getItem("fittrack_user_settings") || "{}");
      root.setAttribute("data-anim", saved?.display?.animation === false ? "off" : "on");
    } catch {
      root.setAttribute("data-anim", "on");
    }
    return () => root.removeAttribute("data-anim");
  }, []);

  // อัปเดตวันที่/เวลาจริง และเริ่มวันใหม่ด้วยยอดแคลอรี่ของวันนั้น
  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDate = new Date();
      setCurrentDateTime(nextDate);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayKey = getLocalDateKey(currentDateTime);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`fittrack-calories-${todayKey}`);
      setDailyConsumedCalories(saved === null ? 0 : Math.max(0, Number(saved) || 0));
    } catch {
      setDailyConsumedCalories(0);
    }
  }, [todayKey]);

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric",
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(currentDateTime);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { clearCachedName(); return; }
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        const data = snap.exists() ? snap.data() : {};
        const name = data.name || currentUser.displayName || currentUser.email?.split("@")[0] || "";
        setCachedName(name);
        setDisplayName(name);
        setUserInitial(name.charAt(0).toUpperCase());
        if (data.weight) setWeight(data.weight);
        if (data.height) setHeight(data.height);
        if (data.age) setAge(data.age);
        if (data.goalWeight || data.targetWeight) setGoalWeight(String(data.goalWeight || data.targetWeight));
      } catch (err) {
        console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  const calculateHealth = (e) => {
    e.preventDefault();
    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);
    if (!w || !h || h <= 0) return;

    const bmi = Number((w / Math.pow(h / 100, 2)).toFixed(2));
    let status = "ผอม";
    if (bmi >= 18.5 && bmi < 23) status = "ปกติ";
    else if (bmi >= 23 && bmi < 25) status = "น้ำหนักเกิน";
    else if (bmi >= 25 && bmi < 30) status = "อ้วนระดับ 1";
    else if (bmi >= 30) status = "อ้วนระดับ 2";

    setBmiResult({ value: bmi, status });
    showToast(`คำนวณ BMI เรียบร้อยแล้ว: ${bmi} (${status})`);

    if (a > 0) {
      const bmr = 10 * w + 6.25 * h - 5 * a + 5;
      setTdeeResult(Math.round(bmr * 1.55));
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAnalysisError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAnalysisError("ขนาดรูปภาพต้องไม่เกิน 10 MB");
      return;
    }

    setAnalysisError("");
    setItemName("กำลังวิเคราะห์ภาพอาหารด้วย AI...");
    setItemCategory("");
    setItemCalories(0);
    setItemConfidence(null);
    setItemNote("");
    setItemImage(URL.createObjectURL(file));
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("bmi", bmiResult?.value ?? "");
      formData.append("weight", String(weight ?? ""));
      formData.append("height", String(height ?? ""));
      formData.append("age", String(age ?? ""));
      formData.append("tdee", String(tdeeResult ?? ""));

      const response = await fetch("/api/analyze-food", {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      let data = null;
      if (raw.trim()) data = JSON.parse(raw);
      if (!response.ok) throw new Error(data?.error || `เซิร์ฟเวอร์ตอบกลับ ${response.status}`);

      const name = data?.name || data?.foodName || data?.food_name;
      const category = data?.category || data?.type || "อาหาร";
      const calories = Number(data?.calories ?? data?.kcal ?? data?.energy);
      const confidence = Number(data?.confidence);
      const note = data?.note || data?.description || "";

      if (!name || !Number.isFinite(calories) || calories < 0) {
        throw new Error("AI วิเคราะห์ภาพได้ไม่ครบ กรุณาถ่ายภาพอาหารให้เห็นชัดขึ้น");
      }

      setItemName(name);
      setItemCategory(category);
      setItemCalories(Math.round(calories));
      setItemConfidence(Number.isFinite(confidence) ? confidence : null);
      setItemNote(note);
      setDailyConsumedCalories((prev) => {
        const nextTotal = prev + Math.round(calories);
        try { localStorage.setItem(`fittrack-calories-${getLocalDateKey()}`, String(nextTotal)); } catch { /* storage optional */ }
        return nextTotal;
      });
      showToast(`วิเคราะห์อาหารเรียบร้อยแล้ว +${Math.round(calories).toLocaleString()} kcal`);
    } catch (error) {
      console.error("Food analysis error:", error);
      setItemName("");
      setItemCalories(0);
      setAnalysisError(error?.message || "ไม่สามารถวิเคราะห์ภาพได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsAnalyzing(false);
      e.target.value = "";
    }
  };

  const handleRecommendedMeal = (meal) => {
    const calories = Math.max(0, Math.round(Number(meal?.kcal) || 0));
    if (!meal?.name || calories <= 0) return;

    setAnalysisError("");
    setIsAnalyzing(false);
    setItemImage(null);
    setItemName(meal.name);
    setItemCategory("เมนูแนะนำ");
    setItemCalories(calories);
    setItemConfidence(null);
    setItemNote("พลังงานโดยประมาณต่อหนึ่งมื้อ ปริมาณจริงอาจแตกต่างตามวัตถุดิบและขนาดเสิร์ฟ");

    setDailyConsumedCalories((prev) => {
      const nextTotal = prev + calories;
      try {
        localStorage.setItem(`fittrack-calories-${getLocalDateKey()}`, String(nextTotal));
      } catch {
        /* storage optional */
      }
      return nextTotal;
    });
    showToast(`เพิ่ม ${meal.name} แล้ว +${calories.toLocaleString()} kcal`);
  };

  const dailyTarget = Number(tdeeResult || 1650);
  // ได้รับสุทธิ = กินเข้าไป − เผาผลาญจากโหมดเกม  |  เหลือ = เป้าหมาย − ได้รับสุทธิ
  const burnedKcal = energy.burned;
  const netCalories = Math.max(0, Math.round(dailyConsumedCalories - burnedKcal));
  const remainingCalories = dailyTarget - netCalories;
  const overCalories = Math.max(0, -remainingCalories);
  const progress = Math.min((netCalories / dailyTarget) * 100, 100);

  // แชร์เป้าหมายพลังงานให้หน้าโหมดเกมดึงไปใช้ และจำค่า TDEE ที่คำนวณไว้ (รีเฟรชแล้วไม่หาย)
  useEffect(() => { writeTarget(dailyTarget); }, [dailyTarget]);
  useEffect(() => { if (tdeeResult) writeTdee(tdeeResult); }, [tdeeResult]);
  // รับยอดเผาผลาญจากหน้าเกมแบบเรียลไทม์ (แท็บอื่น/ตอนกลับมาหน้านี้)
  useEffect(() => subscribeEnergy(setEnergy), []);

  // แจ้งเตือนเมื่อมีการเผาผลาญเพิ่มจากเกม (รวบเป็นก้อนละ ≥ 1 kcal ไม่ให้เด้งถี่ตอนกำลังเล่น)
  const lastBurnToast = useRef(null);
  useEffect(() => {
    if (lastBurnToast.current === null) { lastBurnToast.current = energy.burned; return; }
    const diff = energy.burned - lastBurnToast.current;
    if (diff >= 1) {
      lastBurnToast.current = energy.burned;
      showToast(`เผาผลาญจากโหมดเกม +${diff.toFixed(1)} kcal · วันนี้ลดไปแล้ว ${Math.round(energy.burned).toLocaleString()} kcal`);
    } else if (diff < 0) lastBurnToast.current = energy.burned;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energy.burned]);

  const calorieNotice = dailyConsumedCalories === 0
    ? "วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้"
    : overCalories > 0
      ? `วันนี้ได้รับพลังงานเกินเป้าหมาย ${overCalories.toLocaleString()} kcal`
      : `วันนี้ยังได้รับพลังงานต่ำกว่าเป้าหมาย ${Math.max(0, remainingCalories).toLocaleString()} kcal`;
  const gameLabels = { fruit: "ชกผลไม้", time: "ชกจับเวลา" };
  const burnDetail = Object.entries(energy.games)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${gameLabels[k] || k} ${v.toLocaleString()} kcal`)
    .join(" · ");
  const burnNotice = burnedKcal > 0
    ? `เล่นโหมดเกมเผาผลาญไปแล้ว ${burnedKcal.toLocaleString()} kcal (หักออกจากพลังงานที่ได้รับ)`
    : "วันนี้ยังไม่ได้เล่นโหมดเกม";
  const goalNotice = goalWeight && Number(weight) > 0
    ? `น้ำหนักปัจจุบัน ${Number(weight).toLocaleString()} กก. · เป้าหมาย ${Number(goalWeight).toLocaleString()} กก.`
    : "เพิ่มน้ำหนักปัจจุบันและน้ำหนักเป้าหมายในโปรไฟล์ เพื่อดูความคืบหน้าสู่เป้าหมาย";

  const handleNotifications = async () => {
    setNotificationsOpen((open) => !open);
    // Browser notification permission is requested only after an explicit click.
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === "default") permission = await window.Notification.requestPermission();
        if (permission === "granted") {
          new window.Notification("FitTrack · สรุปสุขภาพวันนี้", {
            body: `${calorieNotice}. ${burnNotice}. ${goalNotice}`,
            tag: `fittrack-daily-${todayKey}`,
          });
        }
      } catch (error) {
        console.warn("ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:", error);
      }
    }
  };

  const bmiPosition = bmiResult
    ? Math.max(0, Math.min(100, ((bmiResult.value - 10) / 30) * 100))
    : 38;

  const meals = {
    เช้า: [
      { name: "ข้าวโอ๊ต + ไข่ต้ม + กล้วย", kcal: 350, img: "/meal-breakfast.png" },
      { name: "ข้าวกล้อง + อกไก่ย่าง + ผักสด", kcal: 400, img: "/meal-chicken.png" },
      { name: "โยเกิร์ต + ผลไม้ + ถั่ว", kcal: 300, img: "/meal-yogurt.png" },
    ],
    กลางวัน: [
      { name: "ข้าวกล้อง + อกไก่ + ผัก", kcal: 500, img: "/meal-chicken.png" },
      { name: "ปลา + ข้าวกล้อง + ผักรวม", kcal: 480, img: "/meal-fish.png" },
      { name: "สลัดไก่ + ไข่ต้ม", kcal: 420, img: "/meal-salad.png" },
    ],
    เย็น: [
      { name: "ปลาแซลมอน + ผักต้ม", kcal: 380, img: "/meal-fish.png" },
      { name: "อกไก่ + ผักย่าง", kcal: 350, img: "/meal-chicken.png" },
      { name: "ซุปผัก + ไข่ต้ม", kcal: 300, img: "/meal-soup.png" },
    ],
    ว่าง: [
      { name: "โยเกิร์ต + ผลไม้", kcal: 180, img: "/meal-yogurt.png" },
      { name: "กล้วย + อัลมอนด์", kcal: 200, img: "/meal-snack.png" },
    ],
  };

  const logout = async () => {
    try {
      await signOut(auth);
      clearCachedName();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className="fittrack-app">
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link active" onClick={() => navigate("/dashboard")}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link" onClick={() => navigate("/exercises")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/gamemode")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 15h18a9 9 0 0 1 8.7 6.7l2.2 8.6a5.2 5.2 0 0 1-8.9 4.8L31 31H17l-4 4.1a5.2 5.2 0 0 1-8.9-4.8l2.2-8.6A9 9 0 0 1 15 15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M16 21v8M12 25h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="32" cy="22.5" r="2" fill="currentColor"/><circle cx="36" cy="27" r="2" fill="currentColor"/></svg></span>โหมดเกม</button>
          <button className="side-link" onClick={() => navigate("/history")}><span className="side-icon">◷</span>ประวัติ</button>
          <button className="side-link" onClick={() => navigate("/profile")}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" title="ออกจากระบบ" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="user-block">
            <div className="avatar-wrap">
              <div className="avatar-fallback">{userInitial}</div>
              <span className="online-dot"></span>
            </div>
            <div>
              <div className="hello">สวัสดีครับ/ค่ะ</div>
              <strong>{displayName || "\u00A0"}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="ai-note">ให้ <em>AI</em> เป็นผู้ช่วยของคุณ<br />ในการดูแลสุขภาพ <span>〽</span></div>
            <div className="notification-wrap">
              <button className="icon-button notification-bell" title="การแจ้งเตือน" aria-label="เปิดการแจ้งเตือน" aria-expanded={notificationsOpen} onClick={handleNotifications}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><i></i></button>
              {notificationsOpen && <div className="notification-panel" role="status">
                <div className="notification-panel-title"><span>การแจ้งเตือน <small>วันนี้</small></span><button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => setNotificationsOpen(false)}>×</button></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· ตอนนี้</small></strong><span>{calorieNotice}</span><small>ได้รับสุทธิ {netCalories.toLocaleString()} / {dailyTarget.toLocaleString()} kcal</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· โหมดเกม</small></strong><span>{burnNotice}</span><small>{burnDetail || "เล่นเกมชกผลไม้เพื่อเผาผลาญแคลอรี่"}</small></div><i className="notification-unread" /></div>
                <div className="notification-item"><span className="notification-avatar dumbbell-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg></span><div className="notification-message"><strong>FitTrack <small>· วันนี้</small></strong><span>{goalNotice}</span><small>ติดตามความคืบหน้าของคุณได้ที่หน้าโปรไฟล์</small></div><i className="notification-unread" /></div>
                <small className="notification-hint">แตะกระดิ่งเพื่อเปิดหรือปิดการแจ้งเตือน</small>
              </div>}
            </div>
            <div className="date-box">{dateLabel}<br /><small>{timeLabel} น.</small></div>
            <button
              className="icon-button sun"
              onClick={toggleTheme}
              title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {theme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </header>

        <div className="content-grid">
          {/* HERO */}
          <section className="hero-card">
            <div className="hero-overlay"></div>
            <img className="hero-image" src="/fittrack-hero.jpg" alt="" />
            <div className="hero-content">
              <img src="/fittrack-hero-logo.png" alt="FitTrack" className="hero-logo" />
              <h1>รู้ตัวเลข&nbsp;&nbsp;วางแผนได้<br />สุขภาพดีขึ้นในทุกวัน</h1>
              <div className="hero-features">
                <span className="hero-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2M8 8c1.2-1.2 2.5-1.8 4-1.8S14.8 7 16 8M8 16c1.2 1.2 2.5 1.8 4 1.8s2.8-.6 4-1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 8.5v7M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> วิเคราะห์อาหาร</span><i></i>
                <span className="hero-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 6v12M9 10v4M9 12h6M15 10v4M18 6v12M21 9v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> ออกกำลังกายด้วย AI</span><i></i>
                <span>♡ ดูแลสุขภาพแบบครบวงจร</span>
              </div>
            </div>
          </section>

          {/* BMI */}
          <section className="bmi-card dark-card">
            <div className="card-title"><span className="title-icon purple" aria-hidden="true"><svg className="bmi-title-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4.7" r="2.5"/><path d="M9.15 8.1c.55-.38 1.55-.6 2.85-.6s2.3.22 2.85.6l1.75 1.25 2.05 4.55-2.05.9-1.55-3.15-.45 4.1 1.25 5.75h-2.6L12 16.7l-1.25 4.8h-2.6l1.25-5.75-.45-4.1L7.4 14.8l-2.05-.9L7.4 9.35 9.15 8.1Z"/></svg></span><h2>คำนวณค่า BMI</h2></div>
            <form onSubmit={calculateHealth}>
              <div className="bmi-inputs">
                <label>น้ำหนัก (กก.)<input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="55" required /></label>
                <label>ส่วนสูง (ซม.)<input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="160" required /></label>
              </div>
              <div className="bmi-extra-row">
                <label>อายุ<input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="20" required /></label>
                <button className="lime-btn" type="submit">คำนวณ</button>
              </div>
            </form>

            <div className="bmi-result">
              <div className="result-label">ค่า BMI <span>{bmiResult?.status || "ปกติ"}</span></div>
              <div className="bmi-number" key={bmiResult?.value ?? "init"}>{bmiResult?.value ?? "21.48"}</div>
              <div className="bmi-bar"><i style={{ left: `${bmiPosition}%` }}></i></div>
              <div className="bmi-scale-labels">
                <span>&lt; 18.5<br />ผอม</span><span>18.5 - 22.9<br /><b>ปกติ</b></span><span>23 - 24.9<br />น้ำหนักเกิน</span><span>25 - 29.9<br />อ้วนระดับ 1</span><span>&gt; 30<br />อ้วนระดับ 2</span>
              </div>
            </div>

            <div className="daily-energy">
              <span className="energy-flame" aria-hidden="true">
                <svg className="fire-mascot" viewBox="0 0 64 76" role="img" aria-label="ตัวละครไฟสไตล์เกม">
                  <defs>
                    <linearGradient id="mascot-fire-shell" x1="0" y1="1" x2=".8" y2="0">
                      <stop offset="0%" stopColor="#ed3213" />
                      <stop offset="48%" stopColor="#ff6712" />
                      <stop offset="100%" stopColor="#ffc52f" />
                    </linearGradient>
                    <linearGradient id="mascot-fire-core" x1="0" y1="1" x2=".7" y2="0">
                      <stop offset="0%" stopColor="#ff8a10" />
                      <stop offset="62%" stopColor="#ffe34b" />
                      <stop offset="100%" stopColor="#fffbd0" />
                    </linearGradient>
                    <radialGradient id="mascot-fire-aura" cx="50%" cy="70%" r="60%">
                      <stop offset="0%" stopColor="#ff8a18" stopOpacity=".55" />
                      <stop offset="100%" stopColor="#ff4a12" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <ellipse className="mascot-aura" cx="32" cy="61" rx="27" ry="14" fill="url(#mascot-fire-aura)" />
                  <g className="mascot-body">
                    <path className="mascot-shell" d="M17 65C11 61 9 54 12 47C6 43 5 35 10 29C14 24 17 21 16 13C23 16 25 21 24 27C29 22 31 14 29 7C39 15 40 24 36 31C42 27 44 21 43 17C52 27 55 37 50 45C55 53 50 62 44 65C36 70 25 70 17 65Z" fill="url(#mascot-fire-shell)" />
                    <path className="mascot-core" d="M23 62C18 57 19 51 23 46C26 42 27 37 26 32C32 37 33 43 31 47C36 44 38 39 37 35C44 44 44 52 40 58C36 64 29 65 23 62Z" fill="url(#mascot-fire-core)" />
                    <path className="mascot-arm mascot-arm-left" d="M14 43C8 41 5 44 6 49C8 53 13 52 17 49Z" fill="#ff6413" />
                    <path className="mascot-arm mascot-arm-right" d="M48 41C55 39 59 43 57 48C55 52 50 51 46 47Z" fill="#ff6413" />
                    <path className="mascot-leg mascot-leg-left" d="M23 63L21 70Q22 73 28 71L31 66Z" fill="#d93417" />
                    <path className="mascot-leg mascot-leg-right" d="M36 65L39 71Q43 73 46 69L42 62Z" fill="#d93417" />
                    <path d="M20 39Q25 35 29 39" fill="none" stroke="#9b2a12" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M36 39Q40 35 44 38" fill="none" stroke="#9b2a12" strokeWidth="2.2" strokeLinecap="round" />
                    <ellipse cx="25" cy="43" rx="3.5" ry="4.6" fill="#fff9df" />
                    <ellipse cx="39" cy="42.5" rx="3.5" ry="4.6" fill="#fff9df" />
                    <ellipse cx="26" cy="44" rx="1.55" ry="2.4" fill="#442015" />
                    <ellipse cx="40" cy="43.5" rx="1.55" ry="2.4" fill="#442015" />
                    <path d="M29 51Q33 55 38 50" fill="none" stroke="#8e2614" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M17 29Q14 35 16 39M47 28Q51 34 49 38" fill="none" stroke="#ffd65a" strokeWidth="2" strokeLinecap="round" opacity=".75" />
                  </g>
                  <path className="mascot-spark mascot-spark-left" d="M6 24L8 20L10 24L14 26L10 28L8 32L6 28L2 26Z" fill="#ffe15a" />
                  <path className="mascot-spark mascot-spark-right" d="M54 18L56 15L58 18L61 20L58 22L56 25L54 22L51 20Z" fill="#ff9b27" />
                </svg>
              </span>
              <small className="energy-heading">พลังงานที่ควรได้รับต่อวัน (โดยประมาณ)</small>
              <strong className="energy-value">{dailyTarget.toLocaleString()} <em>kcal</em></strong>
              <b className="energy-info">ⓘ</b>
            </div>
          </section>

          {/* QUICK ACTIONS */}
          <section className="quick-grid">
            <button className="feature-card exercise" onClick={() => navigate("/exercises")}>
              <div className="feature-art" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></div><div><h3>ออกกำลังกาย</h3><p>เลือกโปรแกรมที่เหมาะกับคุณ<br />พร้อมคำแนะนำจาก AI</p></div><span className="round-arrow">›</span>
            </button>
            <button className="feature-card history" onClick={() => navigate("/history")}>
              <div className="feature-art" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="10" y="8" width="28" height="33" rx="4" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M17 17h14M17 24h14M17 31h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M17 8V5h14v3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></div><div><h3>ประวัติการออกกำลังกาย</h3><p>ดูสรุปผลการออกกำลังกาย<br />และพัฒนาการของคุณ</p></div><span className="round-arrow">›</span>
            </button>
          </section>

          {/* FOOD */}
          <section className="food-card dark-card">
            <div className="section-title"><span className="title-icon green food-analysis-scan-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="11" cy="11" r="4.2"/><path d="M14.2 14.2 19 19M9.6 11h2.8M11 9.6v2.8"/></svg></span><h2>วิเคราะห์อาหาร</h2></div>
            <div className="food-layout">
              <label className="upload-box">
                <input type="file" accept="image/*" onChange={handleImageSelect} />
                {itemImage ? <img src={itemImage} alt="ภาพอาหารที่เลือก" /> : <><span className="upload-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16.5h8l3.2-4.5h11.6l3.2 4.5h8v23H7z"/><circle cx="24" cy="27.5" r="8.2"/><circle cx="24" cy="27.5" r="3.3"/><path d="M36 21h.1" strokeWidth="3.5"/></svg></span><strong>เพิ่มภาพอาหาร</strong><small>ถ่ายภาพหรือเลือกจากแกลเลอรี</small><b>เลือกรูปภาพ</b></>}
              </label>

              <div className="food-result-box">
                {isAnalyzing ? <div className="food-loading">กำลังวิเคราะห์ภาพอาหารด้วย AI...</div> : itemName && itemCalories > 0 ? <>
                  <div className={`food-result-top ${itemImage ? "" : "food-result-text-only"}`}>
                      {itemImage ? (
                        <img src={itemImage} alt="ภาพอาหาร" />
                      ) : (
                        <span className="food-result-no-image" aria-hidden="true">
                          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="24" cy="24" r="17" />
                            <path d="M15 27c2.8-5.5 6.5-8 9-8s6.2 2.5 9 8" />
                            <path d="M17 30h14" />
                            <path d="M24 19v-4M21 15h6" />
                          </svg>
                        </span>
                      )}
                      <div>
                        <h3>{itemName}</h3>
                        <span className="food-chip">{itemCategory || "อาหารหลัก"}</span>
                        {itemConfidence ? (
                          <span className="food-chip muted">{`${Math.round(itemConfidence * 100)}% มั่นใจ`}</span>
                        ) : !itemImage ? (
                          <span className="food-chip muted">เมนูแนะนำ · พลังงานโดยประมาณ</span>
                        ) : (
                          <span className="food-chip muted">โปรตีนสูง</span>
                        )}
                      </div>
                    </div>
                  <div className="food-kcal"><small>พลังงานทั้งหมด</small><strong>{itemCalories}</strong><em> kcal</em></div>
                  {itemNote && <p className="food-note">{itemNote}</p>}
                  <div className="macro-row"><span>โปรตีน<br /><b>35 g</b></span><span>คาร์โบไฮเดรต<br /><b>45 g</b></span><span>ไขมัน<br /><b>8 g</b></span></div>
                </> : <div className="food-placeholder"><strong>เพิ่มภาพอาหารเพื่อเริ่มการวิเคราะห์</strong><span>AI จะช่วยประเมินประเภทอาหาร พลังงาน และข้อมูลโภชนาการ</span></div>}
              </div>
            </div>
            {analysisError && <div className="error-box">⚠️ {analysisError}</div>}

            <div className="calorie-bottom">
              <div className="calorie-progress-card">
                <div className="progress-title">พลังงานที่ได้รับวันนี้</div>
                <div className="progress-track"><span style={{ width: `${progress}%` }}></span></div>
                <div className="calorie-stats" key={`${dailyConsumedCalories}-${Math.round(burnedKcal)}`}><div>ได้รับสุทธิ<strong>{netCalories.toLocaleString()} <small>kcal</small></strong><small>กิน {dailyConsumedCalories.toLocaleString()} − เผาผลาญจากเกม {Math.round(burnedKcal).toLocaleString()} kcal</small></div><div>เหลืออีก<strong>{Math.max(0, remainingCalories).toLocaleString()} <small>kcal</small></strong><small>จากเป้าหมาย {dailyTarget.toLocaleString()} kcal</small></div></div>
              </div>
              <div className={`warning-card ${overCalories ? "danger" : "safe"}`}>
                <strong>{overCalories ? "⚠️ คุณได้รับพลังงานเกินเป้าหมาย!" : "✓ พลังงานวันนี้อยู่ในเป้าหมาย"}</strong>
                <p>{overCalories ? "แนะนำให้ลดอาหารที่มีแคลอรี่สูง และออกกำลังกายเพิ่มประมาณ 30 นาที" : "รักษาสมดุลอาหารและออกกำลังกายอย่างสม่ำเสมอ"}</p>
                {overCalories && <button onClick={() => navigate("/exercises")}>ดูโปรแกรมออกกำลังกายเพิ่มเติม</button>}
              </div>
            </div>
          </section>

          {/* RECOMMENDED MENU */}
          <section className="recommend-card dark-card">
            <div className="section-title"><span className="title-icon yellow recommend-food-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="4.5"/><path d="M3 4v6M1.8 6.5h2.4M5 4v6M20.5 4v7M20.5 11v9M18.8 4v4"/></svg></span><h2>เมนูแนะนำ <small>(ตัวเลือกอาหารสมดุล)</small></h2></div>
            <div className="meal-tabs">{Object.keys(meals).map((tab) => <button key={tab} className={mealTab === tab ? "active" : ""} onClick={() => setMealTab(tab)}>{tab}</button>)}</div>
            <div className="meal-list" key={mealTab}>{meals[mealTab].map((meal, index) => <div className="meal-row" key={meal.name}><span className="meal-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="meal-info"><strong>{meal.name}</strong><span className="meal-kcal">พลังงานโดยประมาณ <b>{meal.kcal} kcal</b></span></div><button type="button" aria-label={`เพิ่มเมนู ${meal.name} ไปยังบันทึกพลังงาน`} onClick={() => handleRecommendedMeal(meal)}>เพิ่ม</button></div>)}</div>
            <div className="tips-box"><h3><span aria-hidden="true">💡</span> เคล็ดลับเพิ่มเติม</h3><div className="tips-copy"><p>ลดอาหารหวาน มัน เค็ม</p><p>ดื่มน้ำให้เพียงพอ อย่างน้อย 2–3 ลิตร/วัน</p><p>ออกกำลังกายสม่ำเสมออย่างน้อย 3–5 วัน/สัปดาห์</p></div></div>
          </section>
        </div>

        <footer className="fittrack-footer">
          <div className="footer-brand"><span className="footer-mark" aria-hidden="true">FT</span><strong>FitTrack</strong></div>
          <span className="footer-description">ระบบดูแลสุขภาพและติดตามโภชนาการด้วย AI</span>
          <span className="footer-copyright">ดูแลสุขภาพของคุณในทุกวัน</span>
        </footer>
      </main>

      {toast && (
        <div key={toast.id} className={`ft-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.type === "error" ? "!" : "✓"}</span>{toast.text}
        </div>
      )}
    </div>
  );
}

/* ===================== FITTRACK VISUAL SYSTEM ===================== */
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

/* หัวข้อใช้สีตามธีม (กัน h1/h2 จาก template Vite ที่เป็นสีเข้มทับ) และ alt ของรูปที่โหลดไม่ขึ้นก็อ่านออก */
.fittrack-app h1,.fittrack-app h2,.fittrack-app h3{color:var(--text)}
.fittrack-app img{color:var(--muted)}
:root{--bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735}
*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;background:var(--bg)}body{font-family:'Anuphan',sans-serif;color:var(--text);overflow-x:hidden}button,input{font:inherit}.fittrack-app{min-height:100vh;background:radial-gradient(circle at 75% 8%,rgba(50,255,100,.06),transparent 22%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.045),transparent 22%),#020609}.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column}.sidebar:after{display:none}.sidebar-logo-wrap{text-align:center;padding:4px 4px 25px}.sidebar-logo{display:block;width:190px;height:112px;object-fit:contain;margin:0 auto}.logo-caption{font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px}.side-menu{display:flex;flex-direction:column;gap:9px}.side-link{height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s}.side-link:hover{border-color:#35534a;background:rgba(103,255,41,.05)}.side-link.active{color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05)}.side-icon{width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef}.side-link.active .side-icon{color:var(--green)}.sidebar-quote{margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:'Kanit';font-size:15px;line-height:1.55;font-style:italic}.pulse-line{margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39}.pulse-line:before{content:'';position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33}.pulse-line i:first-child{position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg)}.pulse-line b{position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg)}.pulse-line i:last-child{position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff}.logout-link{height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px}.logout-link span{font-size:24px;margin-right:12px;color:#dce6e6}.main-area{margin-left:220px;min-height:100vh;padding:0 10px 40px;width:calc(100% - 220px)}.topbar{height:100px;border-bottom:1px solid #18343b;display:flex;align-items:center;justify-content:space-between;padding:0 5px 0 18px}.user-block{display:flex;align-items:center;gap:12px}.avatar-wrap{position:relative;width:58px;height:58px}.avatar-fallback{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 25%,#4c5053,#101719 60%);border:2px solid #8e9698;color:#fff;font-weight:700;font-size:20px;box-shadow:0 0 0 3px rgba(255,255,255,.03)}.online-dot{position:absolute;right:0;bottom:0;width:17px;height:17px;border-radius:50%;background:#6eff35;border:2px solid #06100c}.hello{font-size:13px;color:#ddd;line-height:1.1}.user-block strong{font-family:'Kanit';font-size:22px;line-height:1.15}.topbar-right{display:flex;align-items:center;gap:15px}.ai-note{text-align:right;font-size:12px;line-height:1.35;color:#e4e4e4;font-style:italic}.ai-note em{color:var(--green);font-style:normal;font-weight:700}.ai-note span{color:#a24aff;font-size:20px}.icon-button{position:relative;width:42px;height:42px;background:transparent;border:0;color:#f2f2f2;font-size:25px;cursor:pointer}.icon-button i{position:absolute;right:6px;top:6px;width:7px;height:7px;background:#ff4667;border-radius:50%}.icon-button.sun{font-size:28px}.date-box{border-right:1px solid #30434a;padding:3px 15px;color:#ddd;font-size:11px;line-height:1.4}.date-box small{font-size:10px}.content-grid{width:100%;max-width:none;margin:0;padding-top:26px;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(350px,.78fr);grid-template-areas:'hero bmi' 'quick recommend' 'food recommend';gap:18px}.hero-card,.bmi-card,.quick-grid,.food-card,.recommend-card{min-width:0}.hero-card{grid-area:hero;position:relative;height:316px;border:1px solid #2a5a66;border-radius:15px;overflow:hidden;background:#050b0c;box-shadow:0 0 22px rgba(17,204,255,.03)}.hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;display:block;z-index:0}.hero-overlay{position:absolute;z-index:1;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.42) 38%,rgba(0,0,0,.12) 72%,rgba(0,0,0,.18) 100%),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.22));}.hero-card:after{content:'';position:absolute;z-index:2;right:-20px;top:0;width:2px;height:100%;background:linear-gradient(180deg,transparent,var(--green),transparent)}.hero-content{position:relative;z-index:3;height:100%;padding:13px 31px;display:flex;flex-direction:column;align-items:flex-start}/* HERO LOGO — separate asset/style from sidebar logo */
.hero-logo{width:400px;height:125px;object-fit:contain;transform:scale(1.18);transform-origin:left top;
  object-position:left center;
  display:block;
  filter:drop-shadow(0 0 10px rgba(140,255,50,.18));
}.hero-content h1{font-family:'Kanit';font-size:27px;line-height:1.4;font-weight:500;margin:10px 0 45px;letter-spacing:.2px}.hero-features{display:flex;align-items:center;gap:15px;color:#d7dada;font-size:11px}.hero-features span:first-letter{color:var(--green)}.hero-features i{height:23px;width:1px;background:#526169}.dark-card{background:linear-gradient(145deg,#050b0e,#071116);border:1px solid #2a5360;border-radius:15px;box-shadow:inset 0 0 25px rgba(0,0,0,.25)}.bmi-card{grid-area:bmi;padding:16px 17px 15px}.card-title,.section-title{display:flex;align-items:center;gap:10px}.card-title h2,.section-title h2{font-family:'Kanit';font-size:18px;margin:0;font-weight:500}.title-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;font-size:20px}.title-icon.purple{color:#df78ff;border:1px solid #9442ba;background:rgba(174,58,255,.1)}.title-icon.green{color:#91ff3e;border:1px solid #5ea02c;background:rgba(110,255,45,.07)}.title-icon.yellow{color:#e7ef36;border:1px solid #9b9f27;background:rgba(232,240,48,.05)}.bmi-inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px}.bmi-inputs label,.bmi-extra-row label{font-size:10px;color:#b8c1c3}.bmi-inputs input,.bmi-extra-row input{width:100%;margin-top:5px;height:38px;border-radius:8px;border:1px solid #304951;background:#061015;color:#fff;padding:0 10px;font-size:14px;outline:none}.bmi-inputs input:focus,.bmi-extra-row input:focus{border-color:#8bff39;box-shadow:0 0 0 2px rgba(139,255,57,.08)}.bmi-extra-row{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;align-items:end;margin-top:9px}.lime-btn,.meal-row button,.warning-card button{height:37px;border:0;border-radius:8px;background:linear-gradient(90deg,#72ed2e,#baff3e);color:#071005;font-weight:700;cursor:pointer;box-shadow:0 0 16px rgba(125,255,45,.15)}.bmi-result{margin-top:12px;border:1px solid #2d4952;border-radius:12px;padding:11px 12px;background:rgba(2,8,10,.45)}.result-label{font-size:11px;color:#ddd}.result-label span{float:right;border:1px solid #65ff37;color:#aaff5d;border-radius:20px;padding:2px 13px;font-size:9px}.bmi-number{font-size:29px;font-family:'Kanit';margin-top:2px}.bmi-bar{height:13px;border-radius:10px;background:linear-gradient(90deg,#238fff 0 20%,#49dff1 20% 35%,#75f43c 35% 55%,#ffdf36 55% 72%,#ff7546 72% 88%,#ff3c78 88%);position:relative;margin-top:4px}.bmi-bar i{position:absolute;top:-4px;width:4px;height:21px;background:#fff;border-radius:4px;box-shadow:0 0 8px #fff;transform:translateX(-50%)}.bmi-scale-labels{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;text-align:center;font-size:7px;color:#99a5a9;line-height:1.25;margin-top:6px}.bmi-scale-labels b{color:#8fff3a}.daily-energy{display:flex;align-items:center;gap:10px;margin-top:12px;border:1px solid #2d4952;border-radius:11px;padding:9px 11px}.daily-energy>span{font-size:25px}.daily-energy div{flex:1}.daily-energy small{display:block;color:#c1c8c9;font-size:9px}.daily-energy strong{font-family:'Kanit';font-size:23px;color:#cfff3a;line-height:1.1}.daily-energy em{font-size:13px;font-style:normal}.daily-energy>b{color:#a5adb0}.quick-grid{grid-area:quick;display:grid;grid-template-columns:1fr 1fr;gap:14px}.feature-card{position:relative;min-height:190px;overflow:hidden;border-radius:13px;border:1px solid #79f832;background:linear-gradient(135deg,#07120c,#06130e 55%,#0d1a10);color:#fff;text-align:left;padding:20px;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer}.feature-card.history{border-color:#b145ff;background:linear-gradient(135deg,#0c0715,#10091a 60%,#180d22)}.feature-card:after{content:'';position:absolute;inset:auto -30px -80px auto;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,rgba(131,255,45,.16),transparent 68%)}.history:after{background:radial-gradient(circle,rgba(183,55,255,.15),transparent 68%)}.feature-art{position:absolute;top:18px;left:21px;width:70px;height:70px;border:1px solid #82ff36;border-radius:50%;display:grid;place-items:center;color:#9eff43;font-size:35px;background:rgba(3,18,8,.6)}.history .feature-art{border-color:#b455ff;color:#cb75ff}.feature-card h3{position:relative;margin:0;font-family:'Kanit';font-size:21px;font-weight:500}.feature-card p{position:relative;color:#b8c1c0;font-size:10px;line-height:1.55;margin:4px 0 0}.round-arrow{position:absolute;right:17px;bottom:16px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#9eff39;color:#061008;font-size:22px}.history .round-arrow{background:#a74eff;color:#fff}.food-card{grid-area:food;padding:17px}.food-layout{display:grid;grid-template-columns:185px minmax(0,1fr);gap:14px;margin-top:10px}.upload-box{min-height:230px;border:1px dashed #31515b;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;background:rgba(2,10,13,.4);overflow:hidden}.upload-box input{display:none}.upload-box img{width:100%;height:100%;object-fit:cover}.upload-icon{font-size:40px;color:#bbc3c5;margin-bottom:7px}.upload-box strong{font-size:13px}.upload-box small{font-size:9px;color:#8f9a9d;margin-top:4px}.upload-box>b{margin-top:14px;padding:9px 23px;border-radius:22px;background:linear-gradient(90deg,#76f22e,#b6ff3c);color:#071008;font-size:10px}.food-result-box{min-height:230px;border:1px solid #263f47;border-radius:12px;padding:12px 14px;background:rgba(1,7,9,.55)}.food-result-top{display:flex;gap:12px;align-items:center}.food-result-top.food-result-text-only{min-height:96px;padding:10px 8px;border:1px solid #213b42;border-radius:11px;background:linear-gradient(135deg,rgba(10,25,29,.78),rgba(5,14,17,.5));gap:13px}.food-result-top.food-result-text-only h3{margin:0 0 7px}.food-result-top img{width:115px;height:94px;object-fit:cover;border-radius:10px;border:1px solid #6a8a35}.food-result-no-image{width:82px;height:82px;flex:0 0 82px;border-radius:14px;display:grid;place-items:center;color:#a9e96b;border:1px solid #496c45;background:radial-gradient(circle at 50% 35%,rgba(140,255,50,.12),rgba(7,18,21,.75) 68%);box-shadow:inset 0 0 18px rgba(116,255,53,.04)}.food-result-no-image svg{width:44px;height:44px;display:block}.food-result-top h3{margin:3px 0 8px;font-family:'Kanit';font-size:18px;font-weight:500}.food-chip{display:inline-block;border:1px solid #64843b;color:#b2dc60;background:#132014;border-radius:12px;padding:3px 8px;font-size:8px;margin-right:5px}.food-chip.muted{border-color:#37464d;color:#c2cbce;background:#111b20}.food-kcal{margin-top:9px}.food-kcal small{display:block;color:#b9c0c1;font-size:9px}.food-kcal strong{font-family:'Kanit';font-size:29px}.food-kcal em{color:#c6ff39;font-style:normal;font-size:13px}.food-note{font-size:9px;color:#9da8aa}.macro-row{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #263d44;margin-top:8px;padding-top:8px;text-align:center}.macro-row span{font-size:9px;color:#aab4b6;border-right:1px solid #283d43}.macro-row span:last-child{border-right:0}.macro-row b{font-size:13px;color:#f0f2f2}.food-placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#a9b4b6}.food-placeholder strong{font-family:'Kanit';font-size:16px}.food-placeholder span{font-size:9px;margin-top:5px}.food-loading{height:100%;display:grid;place-items:center;color:#aaff45;font-family:'Kanit'}.error-box{margin-top:8px;padding:8px 11px;border:1px solid #a62c4d;color:#ff7691;background:rgba(140,10,45,.12);border-radius:8px;font-size:10px}.calorie-bottom{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px}.calorie-progress-card,.warning-card{border:1px solid #263f47;border-radius:11px;padding:11px;background:rgba(1,8,10,.4)}.progress-title{font-size:10px;color:#c7cecf}.progress-track{height:13px;border-radius:20px;background:#26313b;overflow:hidden;margin:7px 0 9px}.progress-track span{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#75f02e,#b9ff3c)}.calorie-stats{display:grid;grid-template-columns:1fr 1fr;gap:15px}.calorie-stats>div{font-size:9px;color:#bbc4c5;border-right:1px solid #263e45}.calorie-stats>div:last-child{border:0}.calorie-stats strong{display:block;color:#d4ff3d;font-family:'Kanit';font-size:20px}.calorie-stats small{font-size:7px;color:#98a3a5}.warning-card.danger{border-color:#713142;background:rgba(111,16,43,.15)}.warning-card.danger strong{color:#ff587a;font-size:12px}.warning-card p{font-size:8px;color:#b7bfc1;line-height:1.45;margin:6px 0}.warning-card button{height:30px;padding:0 13px;font-size:8px;background:transparent;border:1px solid #b73858;color:#ff7590}.warning-card.safe{border-color:#365e27}.warning-card.safe strong{color:#9cff43;font-size:12px}.warning-card.safe p{font-size:9px;color:#aeb9b9}.recommend-card{grid-area:recommend;padding:16px;height:max-content;align-self:start}.section-title h2 small{font-size:9px;color:#c2c9ca;font-family:'Anuphan';font-weight:400}.meal-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:10px 0}.meal-tabs button{height:35px;border:1px solid #2d4850;border-radius:15px;background:transparent;color:#c9d0d1;font-size:9px;cursor:pointer}.meal-tabs button.active{background:linear-gradient(90deg,#76ef30,#b5ff3b);color:#061005;border-color:#a0ff45;font-weight:700}.meal-list{display:flex;flex-direction:column;gap:7px}.meal-row{min-height:73px;display:grid;grid-template-columns:59px minmax(0,1fr) 51px;align-items:center;gap:8px;border:1px solid #203a42;border-radius:11px;background:#071014;padding:6px}.meal-row img{width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid #45606a;background:#101a1e}.meal-row div{min-width:0}.meal-row strong{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meal-row span{display:inline-block;margin-top:4px;border-radius:12px;background:#14232a;color:#aebec2;border:1px solid #314b55;padding:2px 7px;font-size:7px}.meal-row button{height:27px;font-size:8px;padding:0 9px}.tips-box{border:1px solid #31434a;border-radius:11px;margin-top:10px;padding:10px 12px;background:rgba(4,12,15,.65)}.tips-box h3{margin:0 0 5px;font-family:'Kanit';font-size:12px;color:#dce334}.tips-box ul{margin:0;padding-left:16px;color:#bbc3c5;font-size:8px;line-height:1.75}.tips-box li::marker{color:#fff}.food-card,.recommend-card,.bmi-card,.feature-card,.hero-card{box-shadow:0 0 0 1px rgba(255,255,255,.005),0 12px 30px rgba(0,0,0,.28)}
@media(max-width:1100px){.sidebar{width:190px}.main-area{margin-left:190px;width:calc(100% - 190px)}.content-grid{grid-template-columns:1fr;grid-template-areas:'hero' 'bmi' 'quick' 'food' 'recommend'}.recommend-card{height:auto}.hero-card{height:300px}.quick-grid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.sidebar{position:relative;width:100%;height:auto;min-height:auto;padding:10px}.sidebar:after{display:none}.sidebar-logo{width:155px;height:88px}.side-menu{display:grid;grid-template-columns:repeat(5,1fr)}.side-link{height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px}.side-icon{font-size:18px}.sidebar-quote,.logout-link{display:none}.main-area{margin-left:0;width:100%;padding:0 10px 25px}.topbar{height:auto;padding:13px 2px;gap:10px}.topbar-right{gap:5px}.ai-note,.date-box{display:none}.content-grid{padding-top:12px}.hero-card{height:275px}.hero-content{padding:12px 20px}.hero-logo{width:300px;height:92px;transform:scale(1.12);transform-origin:left top}.hero-content h1{font-size:23px;margin-bottom:35px}.hero-features{font-size:8px;gap:7px}.quick-grid,.calorie-bottom,.food-layout{grid-template-columns:1fr}.feature-card{min-height:155px}.bmi-inputs{grid-template-columns:1fr 1fr}.recommend-card{padding:12px}.meal-row{grid-template-columns:52px minmax(0,1fr) 45px}.meal-row img{width:49px;height:49px}}
/* FINAL LAYOUT FIX:
   Keep the sidebar divider, remove the unwanted divider on the right side
   of the dashboard, and let the right-side content use the available width. */
.sidebar{
  border-right:1px solid #18343b !important;
}
.main-area,
.content-grid{
  border-right:0 !important;
  outline-right:0 !important;
}
.main-area{
  width:calc(100% - 220px) !important;
  padding-right:0 !important;
}
.content-grid{
  width:100% !important;
  max-width:none !important;
  margin-right:0 !important;
}

/* เส้นขาวด้านขวามาจาก #root ของ template Vite (App.css: width:1126px + border-inline)
   ปลดล็อกให้ #root เต็มจอและไม่มีเส้นขอบ */
html,body{
  width:100% !important;
  max-width:none !important;
  margin:0 !important;
}
#root{
  width:100% !important;
  max-width:none !important;
  margin:0 !important;
  padding:0 !important;
  border:0 !important;
  border-inline:0 !important;
  box-shadow:none !important;
}
.fittrack-app{
  width:100%;
}

/* ===================== LIGHT THEME =====================
   ใช้งานเมื่อ <html data-theme="light"> (สลับด้วยปุ่มดวงอาทิตย์/พระจันทร์ที่ topbar)
   โหมดมืดคือสไตล์เดิมทั้งหมด ไม่ถูกแก้ไข */
html.theme-anim *{
  transition:background-color .3s ease,border-color .3s ease,color .3s ease !important;
}
html[data-theme="dark"]{color-scheme:dark}
html[data-theme="light"]{
  color-scheme:light;
  --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;
  --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a;
}
html[data-theme="light"] .fittrack-app{
  background:radial-gradient(circle at 75% 8%,rgba(60,200,100,.14),transparent 24%),radial-gradient(circle at 92% 65%,rgba(177,52,255,.08),transparent 24%),#edf3f1;
}

/* sidebar */
html[data-theme="light"] .sidebar{background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important}
/* โลโก้ PNG พื้นดำ-ตัวอักษรขาว: กลับสีให้เป็นพื้นขาว-ตัวอักษรดำ แล้วใช้ multiply กลืนกับพื้นหลัง */
html[data-theme="light"] .sidebar-logo,
html[data-theme="light"] .hero-logo{filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply}
html[data-theme="light"] .side-link{color:#2a3a36}
html[data-theme="light"] .side-link:hover{border-color:#9bc59a;background:rgba(60,170,40,.08)}
html[data-theme="light"] .side-link.active{color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16)}
html[data-theme="light"] .side-icon{color:#33433f}
html[data-theme="light"] .side-link.active .side-icon{color:#2a9d16}
html[data-theme="light"] .sidebar-quote{color:#2a3a36}
html[data-theme="light"] .pulse-line{border-bottom-color:#4fb82b}
html[data-theme="light"] .logout-link{color:#33433f;border-top-color:#d5e1dd}
html[data-theme="light"] .logout-link span{color:#33433f}

/* topbar */
html[data-theme="light"] .topbar{border-bottom-color:#d3dfdb}
html[data-theme="light"] .online-dot{border-color:#edf3f1}
html[data-theme="light"] .hello{color:#4a5b57}
html[data-theme="light"] .ai-note{color:#3a4a46}
html[data-theme="light"] .icon-button{color:#1f2d29}
html[data-theme="light"] .date-box{color:#3a4a46;border-right-color:#c9d7d3}

/* การ์ดทั่วไป */
html[data-theme="light"] .dark-card{background:linear-gradient(145deg,#ffffff,#f5f9f8);border-color:#cddbd7;box-shadow:none}
html[data-theme="light"] .food-card,
html[data-theme="light"] .recommend-card,
html[data-theme="light"] .bmi-card,
html[data-theme="light"] .feature-card,
html[data-theme="light"] .hero-card{box-shadow:0 8px 24px rgba(20,60,50,.08)}
html[data-theme="light"] .title-icon.purple{color:#9a2fd0;border-color:#c48be4;background:rgba(174,58,255,.08)}
html[data-theme="light"] .title-icon.green{color:#2a8a14;border-color:#8fcf63;background:rgba(110,255,45,.12)}
html[data-theme="light"] .title-icon.yellow{color:#8a7d00;border-color:#d4c94a;background:rgba(232,240,48,.15)}
html[data-theme="light"] .section-title h2 small{color:#667773}

/* BMI */
html[data-theme="light"] .bmi-inputs label,
html[data-theme="light"] .bmi-extra-row label{color:#5a6a66}
html[data-theme="light"] .bmi-inputs input,
html[data-theme="light"] .bmi-extra-row input{background:#ffffff;border-color:#c3d2ce;color:#12201c}
html[data-theme="light"] .bmi-result{background:#f6faf9;border-color:#d0ddd9}
html[data-theme="light"] .result-label{color:#33433f}
html[data-theme="light"] .result-label span{color:#2a8a14;border-color:#4fb82b}
html[data-theme="light"] .bmi-bar i{background:#12201c;box-shadow:0 0 6px rgba(0,0,0,.3)}
html[data-theme="light"] .bmi-scale-labels{color:#667773}
html[data-theme="light"] .bmi-scale-labels b{color:#2a9d16}
html[data-theme="light"] .daily-energy{border-color:#d0ddd9;background:#f6faf9}
html[data-theme="light"] .daily-energy small{color:#5d6e6a}
html[data-theme="light"] .daily-energy strong{color:#2f8a10}
html[data-theme="light"] .daily-energy>b{color:#7b8a86}

/* การ์ดทางลัด */
html[data-theme="light"] .feature-card{background:linear-gradient(135deg,#f4fcef,#ffffff 60%,#eefae6);border-color:#6cd62b;color:#12201c}
html[data-theme="light"] .feature-card.history{background:linear-gradient(135deg,#f8f1ff,#ffffff 60%,#f3e8fd);border-color:#b145ff}
html[data-theme="light"] .feature-card p{color:#5a6a66}
html[data-theme="light"] .feature-art{background:rgba(255,255,255,.85);color:#2a9d16;border-color:#6cd62b}
html[data-theme="light"] .history .feature-art{color:#9a3bd6;border-color:#b455ff}

/* วิเคราะห์อาหาร */
html[data-theme="light"] .upload-box{border-color:#b8cbc6;background:#f4f8f7}
html[data-theme="light"] .upload-icon{color:#8a9a96}
html[data-theme="light"] .upload-box small{color:#6f7f7b}
html[data-theme="light"] .food-result-box{border-color:#d0ddd9;background:#f8fbfa}
html[data-theme="light"] .food-chip{border-color:#9ccb6b;color:#3f7a15;background:#e9f6df}
html[data-theme="light"] .food-chip.muted{border-color:#c6d3cf;color:#4f605c;background:#eef2f1}
html[data-theme="light"] .food-kcal small{color:#5d6e6a}
html[data-theme="light"] .food-kcal em{color:#2f8a10}
html[data-theme="light"] .food-note{color:#667773}
html[data-theme="light"] .macro-row{border-top-color:#d5e1dd}
html[data-theme="light"] .macro-row span{color:#5d6e6a;border-right-color:#d5e1dd}
html[data-theme="light"] .macro-row b{color:#12201c}
html[data-theme="light"] .food-placeholder{color:#667773}
html[data-theme="light"] .food-loading{color:#2f8a10}
html[data-theme="light"] .calorie-progress-card,
html[data-theme="light"] .warning-card{border-color:#d0ddd9;background:#f8fbfa}
html[data-theme="light"] .progress-title{color:#4a5b57}
html[data-theme="light"] .progress-track{background:#dfe8e5}
html[data-theme="light"] .calorie-stats>div{color:#4a5b57;border-right-color:#d5e1dd}
html[data-theme="light"] .calorie-stats strong{color:#2f8a10}
html[data-theme="light"] .calorie-stats small{color:#667773}
html[data-theme="light"] .warning-card p{color:#5d6e6a}
html[data-theme="light"] .warning-card.danger{border-color:#e0a0b0;background:#fff0f3}
html[data-theme="light"] .warning-card.danger strong{color:#d02a52}
html[data-theme="light"] .warning-card button{color:#d02a52;border-color:#d97a92}
html[data-theme="light"] .warning-card.safe{border-color:#9ccb6b}
html[data-theme="light"] .warning-card.safe strong{color:#2f8a10}

/* เมนูแนะนำ */
html[data-theme="light"] .food-result-top.food-result-text-only{border-color:#d5e1dd;background:linear-gradient(135deg,#f8fbfa,#f1f6f4)}
html[data-theme="light"] .food-result-no-image{border-color:#b9d1bf;background:radial-gradient(circle at 50% 35%,rgba(96,190,80,.10),#eef4f1 70%);color:#4d9b43}
html[data-theme="light"] .meal-tabs button{border-color:#c3d2ce;color:#3a4a46}
html[data-theme="light"] .meal-tabs button.active{color:#061005;border-color:#a0ff45}
html[data-theme="light"] .meal-row{border-color:#d5e1dd;background:#ffffff}
html[data-theme="light"] .meal-row img{border-color:#c3d2ce;background:#e8efed}
html[data-theme="light"] .meal-row span{background:#eef3f2;color:#4f605c;border-color:#c6d3cf}
html[data-theme="light"] .tips-box{border-color:#d0ddd9;background:#f8fbfa}
html[data-theme="light"] .tips-box h3{color:#8a7d00}
html[data-theme="light"] .tips-box ul{color:#4f605c}
html[data-theme="light"] .tips-box li::marker{color:#12201c}

/* แบนเนอร์ hero */
html[data-theme="light"] .hero-card{background:#f4faf8;border-color:#cddbd7}
html[data-theme="light"] .hero-image{opacity:1}
html[data-theme="light"] .hero-overlay{background:linear-gradient(90deg,rgba(255,255,255,.97) 0%,rgba(255,255,255,.82) 42%,rgba(255,255,255,.12) 78%,rgba(255,255,255,.35) 100%),linear-gradient(180deg,rgba(255,255,255,.05),rgba(237,243,241,.5))}
html[data-theme="light"] .hero-content h1{color:#12201c}
html[data-theme="light"] .hero-features{color:#33433f}
html[data-theme="light"] .hero-features i{background:#b9c7c3}

/* HERO IMAGE FIX */
.hero-card{position:relative;overflow:hidden;background:#050b0d url("/fittrack-hero.jpg") center/cover no-repeat;}
.hero-card .hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;display:block;z-index:1;}
.hero-card .hero-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.38),rgba(0,0,0,.10));z-index:2;pointer-events:none;}
.hero-card .hero-content{position:relative;z-index:3;}
html[data-theme="light"] .hero-card{background:#f4faf8 url("/fittrack-hero.jpg") center/cover no-repeat;}
html[data-theme="light"] .hero-image{opacity:1;}
html[data-theme="light"] .hero-overlay{background:linear-gradient(90deg,rgba(255,255,255,.35),rgba(255,255,255,.08));}


/* SHIMMER EFFECT: visible glow on logos and a bright sweep across the banner */
@keyframes fittrack-logo-glow {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);
  }
}
@keyframes fittrack-banner-shine {
  0% { transform: translateX(-180%) skewX(-22deg); opacity: 0; }
  8% { opacity: .95; }
  38% { opacity: .8; }
  58%, 100% { transform: translateX(380%) skewX(-22deg); opacity: 0; }
}
.sidebar-logo {
  animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;
  will-change: filter;
}
/* Move the exercise/history cards closer to the main banner */
.content-grid {
  row-gap: 7px;
}

/* Keep the large hero logo static: no shimmer or glow animation */
.hero-logo {
  animation: none !important;
  will-change: auto;
}
.hero-card::before {
  content: '';
  position: absolute;
  z-index: 3;
  top: -35%;
  left: 0;
  width: 42%;
  height: 170%;
  pointer-events: none;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255,255,255,.12) 25%,
    rgba(220,255,190,.72) 48%,
    rgba(255,255,255,.28) 62%,
    transparent 100%);
  filter: blur(2px);
  animation: fittrack-banner-shine 3.8s ease-in-out infinite;
}
.hero-card .hero-content { z-index: 4; }
@media (prefers-reduced-motion: reduce) {
  .sidebar-logo, .hero-card::before { animation-duration: 8s !important; }
}


/* Desktop layout fix: place quick-action cards directly below the hero.
   The BMI card spans the hero and quick-action rows so its height no longer
   pushes the quick-action cards downward. */
@media (min-width: 1101px) {
  .content-grid {
    grid-template-areas:
      "hero bmi"
      "quick bmi"
      "food recommend";
    row-gap: 7px;
  }

  .bmi-card {
    grid-area: bmi;
    align-self: stretch;
    height: auto;
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .bmi-card form,
  .bmi-card .bmi-result {
    flex: 0 0 auto;
  }

  /* Expand daily energy panel to fill the available blank space below BMI result */
  .bmi-card .daily-energy {
    flex: 1 1 auto;
    min-height: 145px;
    margin-top: 12px;
    align-items: center;
  }

  .quick-grid {
    grid-area: quick;
    align-self: start;
  }

  .recommend-card {
    grid-area: recommend;
    align-self: start;
  }
}

/* Energy panel: heading anchored at the top, calorie value centered */
.bmi-card .daily-energy {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 145px;
  padding: 42px 54px 16px;
  text-align: center;
}
.bmi-card .daily-energy .energy-heading {
  position: absolute;
  top: 15px;
  left: 48px;
  right: 48px;
  display: block;
  color: #c1c8c9;
  font-size: 13px;
  line-height: 1.35;
  text-align: center;
}
.bmi-card .daily-energy .energy-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 7px;
  width: 100%;
  margin: 0;
  color: #cfff3a;
  font-family: 'Kanit';
  font-size: 37px;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
}
.bmi-card .daily-energy .energy-value em {
  font-size: 16px;
}
.bmi-card .daily-energy .energy-flame {
  position: absolute;
  left: 22px;
  top: 50%;
  display: block;
  width: 30px;
  height: 39px;
  transform: translateY(-50%);
  filter: drop-shadow(0 0 5px rgba(255,111,25,.18));
}
.bmi-card .daily-energy .energy-flame svg {
  display: block;
  width: 100%;
  height: 100%;
}
/* Grounded, turbulent flame: irregular edges, ember bed and warm light bloom */
.bmi-card .daily-energy .energy-flame {
  filter: drop-shadow(0 0 5px rgba(255,112,16,.55)) drop-shadow(0 0 13px rgba(255,83,12,.28));
  transform-origin: 50% 92%;
  animation: fire-breathe .82s ease-in-out infinite alternate;
}
.bmi-card .daily-energy .fire-ember { transform-origin: 24px 55px; animation: ember-pulse .48s ease-in-out infinite alternate; }
.bmi-card .daily-energy .fire-tongue-left { transform-origin: 20px 55px; animation: fire-left .72s ease-in-out infinite alternate; }
.bmi-card .daily-energy .fire-tongue-right { transform-origin: 28px 55px; animation: fire-right .86s ease-in-out infinite alternate; }
.bmi-card .daily-energy .fire-core { transform-origin: 24px 54px; animation: fire-core-flicker .58s ease-in-out infinite alternate; }
.bmi-card .daily-energy .fire-heart { transform-origin: 24px 51px; animation: fire-heart-flicker .48s ease-in-out infinite alternate; }
.bmi-card .daily-energy .fire-glow { transform-origin: 24px 43px; animation: fire-glow-pulse 1s ease-in-out infinite alternate; }
@keyframes fire-breathe { from { transform: translateY(-50%) scale(.96,.98) rotate(-2deg); } to { transform: translateY(-50%) scale(1.04,1.03) rotate(2deg); } }
@keyframes fire-left { from { transform: skewX(-3deg) scaleY(.94); } to { transform: skewX(4deg) scaleY(1.08); } }
@keyframes fire-right { from { transform: skewX(4deg) scaleY(1.06); } to { transform: skewX(-4deg) scaleY(.92); } }
@keyframes fire-core-flicker { from { transform: scale(.94, .94); opacity:.86; } to { transform: scale(1.06, 1.08); opacity:1; } }
@keyframes fire-heart-flicker { from { opacity:.58; transform: scale(.86); } to { opacity:1; transform: scale(1.12); } }
@keyframes fire-glow-pulse { from { opacity:.48; transform: scale(.86); } to { opacity:1; transform: scale(1.16); } }
@keyframes ember-pulse { from { opacity:.58; transform: scaleX(.82); } to { opacity:1; transform: scaleX(1.12); } }
@media (prefers-reduced-motion: reduce) { .bmi-card .daily-energy .energy-flame, .bmi-card .daily-energy .fire-tongue-left, .bmi-card .daily-energy .fire-tongue-right, .bmi-card .daily-energy .fire-core, .bmi-card .daily-energy .fire-heart, .bmi-card .daily-energy .fire-glow, .bmi-card .daily-energy .fire-ember { animation: none; } }
.bmi-card .daily-energy .energy-info {
  position: absolute;
  right: 19px;
  top: 50%;
  transform: translateY(-50%);
  color: #a5adb0;
}
/* Make the daily energy figure larger and lift it slightly within the panel */
.bmi-card .daily-energy .energy-value {
  font-size: 46px;
  transform: translateY(-5px);
  letter-spacing: .2px;
}
.bmi-card .daily-energy .energy-value em {
  font-size: 18px;
}
@media (max-width: 760px) {
  .bmi-card .daily-energy { min-height: 125px; padding-left: 43px; padding-right: 43px; }
  .bmi-card .daily-energy .energy-heading { left: 40px; right: 40px; font-size: 11px; }
  .bmi-card .daily-energy .energy-value { font-size: 38px; transform: translateY(-4px); }
  .bmi-card .daily-energy .energy-value em { font-size: 14px; }
  .bmi-card .daily-energy .energy-flame { left: 13px; width: 25px; height: 33px; }
  .bmi-card .daily-energy .energy-info { right: 12px; }
}


/* In-app + browser notifications and live date display */
.notification-wrap { position: relative; }
.notification-wrap .icon-button { display: grid; place-items: center; }
.notification-panel {
  position: absolute; z-index: 100; top: calc(100% + 12px); right: -62px;
  width: min(320px, calc(100vw - 28px)); padding: 14px;
  border: 1px solid #2d535d; border-radius: 13px;
  background: #071116; color: #f4f7f6; box-shadow: 0 14px 40px rgba(0,0,0,.55);
}
.notification-panel-title { display:flex; align-items:center; justify-content:space-between; gap:12px; font: 600 15px 'Kanit',sans-serif; margin-bottom: 9px; }
.notification-panel-title button { border:0; background:transparent; color:#b9c5c7; font-size:22px; cursor:pointer; }
.notification-item { display:flex; flex-direction:column; gap:4px; padding:10px 0; border-top:1px solid #203941; }
.notification-item strong { color:#a8f34a; font-size:12px; }
.notification-item span { font-size:11px; line-height:1.5; }
.notification-item small,.notification-hint { color:#93a1a5; font-size:9px; line-height:1.5; }
.notification-hint { display:block; padding-top:8px; border-top:1px solid #203941; }
html[data-theme="light"] .notification-panel { background:#fff; color:#1d302b; border-color:#c8d8d2; box-shadow:0 14px 40px rgba(20,45,35,.18); }
html[data-theme="light"] .notification-item { border-color:#e0e9e5; }
html[data-theme="light"] .notification-hint { border-color:#e0e9e5; }
@media(max-width:760px) { .notification-panel { right:-42px; top:calc(100% + 8px); } }


/* ===================== LIGHT THEME CONTRAST REFINEMENT =====================
   Soft mint surfaces with clear green / violet accents and readable text. */
html[data-theme="light"] body,
html[data-theme="light"] #root { background:#edf4f1; color:#172923; }
html[data-theme="light"] .fittrack-app {
  background:radial-gradient(circle at 74% 7%,rgba(111,210,80,.13),transparent 25%),
             radial-gradient(circle at 92% 62%,rgba(170,91,225,.09),transparent 24%),#edf4f1;
  color:#172923;
}
html[data-theme="light"] .main-area { color:#172923; }
html[data-theme="light"] .topbar { background:rgba(249,252,250,.76); border-bottom-color:#c8d8d1; }
html[data-theme="light"] .hello,
html[data-theme="light"] .ai-note,
html[data-theme="light"] .date-box { color:#40554d; }
html[data-theme="light"] .user-block strong { color:#172923; }
html[data-theme="light"] .icon-button { color:#263c33; }
html[data-theme="light"] .icon-button:hover { color:#278b20; background:#e3f3df; border-radius:10px; }
html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#fbfefc 0%,#edf5f1 100%); border-right-color:#c8d8d1 !important; }
html[data-theme="light"] .logo-caption { color:#53675f; }
html[data-theme="light"] .side-link { color:#31473e; }
html[data-theme="light"] .side-link:hover { background:#e8f4e5; border-color:#b7d7ae; }
html[data-theme="light"] .side-link.active { color:#17351b; background:linear-gradient(100deg,#dff5d7,#f1faed); border-color:#65b947; box-shadow:0 5px 15px rgba(66,145,48,.12),inset 0 0 0 1px rgba(255,255,255,.65); }
html[data-theme="light"] .side-icon { color:#40584e; }
html[data-theme="light"] .side-link.active .side-icon { color:#258d20; }
html[data-theme="light"] .sidebar-quote { color:#40564c; }
html[data-theme="light"] .logout-link { color:#40564c; border-top-color:#cfddd7; }
html[data-theme="light"] .logout-link span { color:#40564c; }

/* Cards: separate related sections subtly while retaining the FitTrack palette. */
html[data-theme="light"] .dark-card,
html[data-theme="light"] .bmi-card,
html[data-theme="light"] .food-card,
html[data-theme="light"] .recommend-card {
  color:#172923; border-color:#c5d8d0;
  background:linear-gradient(145deg,#ffffff 0%,#f6fbf8 100%);
  box-shadow:0 8px 24px rgba(29,76,56,.075),inset 0 1px 0 rgba(255,255,255,.9);
}
html[data-theme="light"] .bmi-card { background:linear-gradient(145deg,#f8fcff 0%,#eef8f8 100%); border-color:#b8d7d9; }
html[data-theme="light"] .food-card { background:linear-gradient(145deg,#ffffff 0%,#f2faf4 100%); }
html[data-theme="light"] .recommend-card { background:linear-gradient(145deg,#fff 0%,#f8f4ff 100%); border-color:#d5c7e7; }
html[data-theme="light"] .card-title h2,
html[data-theme="light"] .section-title h2 { color:#172923; }
html[data-theme="light"] .section-title h2 small { color:#61746b; }
html[data-theme="light"] .title-icon.green { color:#278b20; border-color:#a5d38f; background:#e8f7df; }
html[data-theme="light"] .title-icon.purple { color:#8734b7; border-color:#d3a7e8; background:#f5e9fc; }
html[data-theme="light"] .title-icon.yellow { color:#887500; border-color:#dfd17b; background:#fff9d9; }
html[data-theme="light"] .bmi-inputs label,
html[data-theme="light"] .bmi-extra-row label { color:#435a50; }
html[data-theme="light"] .bmi-inputs input,
html[data-theme="light"] .bmi-extra-row input { background:#fff; color:#172923; border-color:#b7ccc3; box-shadow:inset 0 1px 2px rgba(28,65,49,.035); }
html[data-theme="light"] .bmi-inputs input::placeholder,
html[data-theme="light"] .bmi-extra-row input::placeholder { color:#7a8d84; opacity:1; }
html[data-theme="light"] .bmi-inputs input:focus,
html[data-theme="light"] .bmi-extra-row input:focus { border-color:#55aa35; box-shadow:0 0 0 3px rgba(87,174,53,.13); }
html[data-theme="light"] .bmi-result { background:linear-gradient(135deg,#f9fdfc,#edf7f5); border-color:#bdd5d0; }
html[data-theme="light"] .result-label { color:#40554d; }
html[data-theme="light"] .result-label span { background:#e7f7df; color:#287d1b; border-color:#81c75d; }
html[data-theme="light"] .bmi-number { color:#1b3028; }
html[data-theme="light"] .bmi-scale-labels { color:#52675e; }
html[data-theme="light"] .bmi-scale-labels b { color:#278b20; }
html[data-theme="light"] .daily-energy { background:linear-gradient(135deg,#f1faed,#fff); border-color:#c2dcb9; }
html[data-theme="light"] .daily-energy small { color:#4a6055; }
html[data-theme="light"] .daily-energy strong { color:#278b20; }
html[data-theme="light"] .daily-energy .energy-value { color:#278b20; }
html[data-theme="light"] .daily-energy .energy-info { color:#64766d; }

/* Quick action cards keep green and purple identities with stronger contrast. */
html[data-theme="light"] .feature-card { color:#18321e; background:linear-gradient(135deg,#e9f8e3 0%,#ffffff 62%,#eff9e9 100%); border-color:#77c84e; box-shadow:0 8px 22px rgba(54,125,36,.10); }
html[data-theme="light"] .feature-card.history { color:#352044; background:linear-gradient(135deg,#f3e8fc 0%,#fff 62%,#f5edfc 100%); border-color:#b47ad9; box-shadow:0 8px 22px rgba(122,63,161,.09); }
html[data-theme="light"] .feature-card h2,
html[data-theme="light"] .feature-card strong { color:inherit; }
html[data-theme="light"] .feature-card p { color:#52675b; }
html[data-theme="light"] .feature-card.history p { color:#665472; }
html[data-theme="light"] .feature-art { color:#278b20; background:#fff; border-color:#83c95f; box-shadow:0 3px 12px rgba(53,118,39,.08); }
html[data-theme="light"] .feature-card.history .feature-art { color:#8d3db9; border-color:#c18be0; background:#fff; }
html[data-theme="light"] .round-arrow { color:#fff; box-shadow:0 3px 10px rgba(36,95,24,.2); }
html[data-theme="light"] .feature-card.history .round-arrow { background:#a044d1; }
html[data-theme="light"] .lime-btn,
html[data-theme="light"] .meal-row button { background:linear-gradient(100deg,#66d92e,#a4ed39); color:#15300e; box-shadow:0 4px 12px rgba(74,166,39,.16); }
html[data-theme="light"] .lime-btn:hover,
html[data-theme="light"] .meal-row button:hover { filter:saturate(1.08) brightness(.98); }

/* Food analysis, meal recommendations and progress information. */
html[data-theme="light"] .upload-box { background:#f4faf7; border-color:#b9cec5; color:#40564c; }
html[data-theme="light"] .upload-box small,
html[data-theme="light"] .upload-icon { color:#657970; }
html[data-theme="light"] .food-result-box { background:#f7fcf9; border-color:#c3d9ce; color:#1b3028; }
html[data-theme="light"] .food-chip { color:#34751c; background:#e7f5dd; border-color:#a8cf8e; }
html[data-theme="light"] .food-chip.muted { color:#4e6258; background:#edf3f0; border-color:#c9d7d1; }
html[data-theme="light"] .food-kcal small,
html[data-theme="light"] .food-note { color:#60736a; }
html[data-theme="light"] .food-kcal strong,
html[data-theme="light"] .macro-row b { color:#1b3028; }
html[data-theme="light"] .food-kcal em { color:#287f1b; }
html[data-theme="light"] .macro-row { border-top-color:#d2dfd9; }
html[data-theme="light"] .macro-row span { color:#586d63; border-right-color:#d2dfd9; }
html[data-theme="light"] .food-placeholder { color:#657970; }
html[data-theme="light"] .food-loading { color:#278b20; }
html[data-theme="light"] .calorie-progress-card,
html[data-theme="light"] .warning-card { background:#f8fcfa; border-color:#c7d9d1; color:#263d33; }
html[data-theme="light"] .progress-title { color:#43594f; }
html[data-theme="light"] .progress-track { background:#dce8e2; }
html[data-theme="light"] .calorie-stats>div { color:#4d6258; border-right-color:#d0ded7; }
html[data-theme="light"] .calorie-stats strong { color:#287f1b; }
html[data-theme="light"] .calorie-stats small { color:#6a7d74; }
html[data-theme="light"] .warning-card p { color:#596e64; }
html[data-theme="light"] .warning-card.danger { background:#fff0f2; border-color:#e3a5b1; }
html[data-theme="light"] .warning-card.danger strong,
html[data-theme="light"] .warning-card button { color:#b52e4b; }
html[data-theme="light"] .warning-card button { border-color:#d88b9a; background:#fff8f9; }
html[data-theme="light"] .warning-card.safe { background:#f1fae9; border-color:#b6d99b; }
html[data-theme="light"] .warning-card.safe strong { color:#287f1b; }
html[data-theme="light"] .meal-tabs button { color:#40564c; background:#f7fbf9; border-color:#c2d3cb; }
html[data-theme="light"] .meal-tabs button.active { color:#17300f; background:linear-gradient(100deg,#70dd39,#b1ed58); border-color:#8bcf58; }
html[data-theme="light"] .meal-row { background:#fff; border-color:#d0ded7; color:#21372d; }
html[data-theme="light"] .meal-row span { background:#eef5f0; color:#4b6256; border-color:#d0ded7; }
html[data-theme="light"] .tips-box { background:#f8fcfa; border-color:#cbdad4; }
html[data-theme="light"] .tips-box h3 { color:#806d00; }
html[data-theme="light"] .tips-box ul { color:#4c6157; }
html[data-theme="light"] .tips-box li::marker { color:#29851f; }
html[data-theme="light"] .error-box { background:#fff0f2; color:#b52e4b; border-color:#e2a0ad; }
html[data-theme="light"] .notification-panel { background:#fff; color:#20372d; border-color:#c8d9d1; box-shadow:0 14px 38px rgba(29,67,49,.17); }
html[data-theme="light"] .notification-panel-title button { color:#52685e; }
html[data-theme="light"] .notification-item { border-color:#dce7e1; }
html[data-theme="light"] .notification-item strong { color:#287f1b; }
html[data-theme="light"] .notification-item span { color:#2e4439; }
html[data-theme="light"] .notification-item small,
html[data-theme="light"] .notification-hint { color:#657970; }
html[data-theme="light"] .notification-hint { border-color:#dce7e1; }

/* Maintain clear hero copy over the banner image in light mode. */
html[data-theme="light"] .hero-card { border-color:#bcd5cb; box-shadow:0 8px 24px rgba(29,76,56,.09); }
html[data-theme="light"] .hero-overlay { background:linear-gradient(90deg,rgba(248,253,250,.93) 0%,rgba(248,253,250,.82) 42%,rgba(248,253,250,.24) 78%,rgba(248,253,250,.10) 100%),linear-gradient(180deg,rgba(248,253,250,.02),rgba(237,246,241,.25)); }
html[data-theme="light"] .hero-content h1 { color:#172923; text-shadow:0 1px 0 rgba(255,255,255,.6); }
html[data-theme="light"] .hero-features { color:#344b40; }
html[data-theme="light"] .hero-features i { background:#b6c9bf; }
html[data-theme="light"] .hero-features span:first-letter { color:#298b20; }


/* Refined light theme: clearer hierarchy with a soft mint palette. */
html[data-theme="light"] .fittrack-app {
  background: radial-gradient(ellipse at 78% 0%, #e8f6ee 0%, #f4f8f5 38%, #f2f6f4 100%);
  color: #182b24;
}
html[data-theme="light"] .sidebar {
  background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;
  border-right: 1px solid #c5d9ce !important;
  box-shadow: 5px 0 22px rgba(26, 74, 49, .045);
}
html[data-theme="light"] .topbar {
  background: rgba(255,255,255,.82);
  border-bottom: 1px solid #d2e2d9;
}
html[data-theme="light"] .bmi-card,
html[data-theme="light"] .food-card,
html[data-theme="light"] .recommend-card,
html[data-theme="light"] .calorie-progress-card,
html[data-theme="light"] .warning-card {
  border: 1px solid #c6dcd0;
  box-shadow: 0 10px 28px rgba(30, 75, 51, .085), 0 2px 5px rgba(30,75,51,.035);
}
html[data-theme="light"] .bmi-card { background: linear-gradient(145deg,#f0fbfa 0%,#ffffff 78%); }
html[data-theme="light"] .food-card { background: linear-gradient(145deg,#f1faef 0%,#ffffff 76%); }
html[data-theme="light"] .recommend-card { background: linear-gradient(145deg,#f7f0ff 0%,#ffffff 78%); border-color:#d9c9ed; }
html[data-theme="light"] .daily-energy { background: linear-gradient(135deg,#e5f7dc 0%,#f8fff4 100%); border:1px solid #a9d28e; box-shadow:inset 0 1px 0 #fff, 0 5px 14px rgba(54,120,37,.08); }
html[data-theme="light"] .daily-energy small,
html[data-theme="light"] .daily-energy .energy-info { color:#49634f; }
html[data-theme="light"] .daily-energy strong,
html[data-theme="light"] .daily-energy .energy-value { color:#237b1b; }
html[data-theme="light"] .feature-card { background:linear-gradient(135deg,#e2f7d8 0%,#f7fff4 100%); border:1px solid #8ac96d; box-shadow:0 9px 24px rgba(57,135,37,.11); }
html[data-theme="light"] .feature-card.history { background:linear-gradient(135deg,#efe2fb 0%,#fcf8ff 100%); border:1px solid #c29be1; box-shadow:0 9px 24px rgba(117,64,159,.10); }
html[data-theme="light"] .card-title h2,
html[data-theme="light"] .section-title h2,
html[data-theme="light"] .feature-card h2 { color:#183128; }
html[data-theme="light"] .card-title p,
html[data-theme="light"] .section-title h2 small,
html[data-theme="light"] .feature-card p { color:#50665b; }
html[data-theme="light"] input,
html[data-theme="light"] textarea,
html[data-theme="light"] select { background:#fff; color:#1a3026; border-color:#afcbbd; }
html[data-theme="light"] .lime-btn,
html[data-theme="light"] .meal-row button { background:linear-gradient(105deg,#4bbd2a,#8bdc43); color:#12320d; box-shadow:0 5px 14px rgba(55,145,29,.2); }
html[data-theme="light"] .side-link.active { background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32; }
html[data-theme="light"] .progress-track { background:#d5e5dc; }
html[data-theme="light"] .hero-card { box-shadow:0 12px 30px rgba(26,75,49,.12); border-color:#b7d4c5; }
html[data-theme="light"] .hero-overlay { background:linear-gradient(90deg,rgba(249,255,251,.96) 0%,rgba(249,255,251,.86) 43%,rgba(249,255,251,.3) 80%,rgba(249,255,251,.12) 100%); }
html[data-theme="light"] .hero-content h1 { color:#172d23; }
html[data-theme="light"] .hero-features { color:#304d3d; }
html[data-theme="light"] .icon-button { background:#f0f8f3; border:1px solid #c8ded1; color:#244b35; }
html[data-theme="light"] .icon-button:hover { background:#e3f4e9; }

/* Messenger-like notification feed and tactile quick-action hover states */
.notification-wrap .notification-bell { border-radius: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 5px; transition: color .2s ease, transform .2s ease; }
.notification-wrap .notification-bell svg { width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.notification-wrap .notification-bell:hover { transform: translateY(-2px) scale(1.06); background: transparent !important; box-shadow: none !important; color: var(--green); }
.notification-panel { width:min(360px,calc(100vw - 28px)); padding:0; overflow:hidden; border-radius:16px; animation: notif-pop .2s ease-out; }
.notification-panel-title { padding:15px 16px 12px; margin:0; border-bottom:1px solid rgba(130,160,150,.2); }
.notification-panel-title>span { display:flex; align-items:baseline; gap:8px; }
.notification-panel-title>span>small { font:400 10px 'Anuphan',sans-serif; opacity:.65; }
.notification-panel-title button { width:27px;height:27px;border-radius:50%;line-height:1; }
.notification-panel-title button:hover { background:rgba(130,150,140,.15); }
.notification-item { position:relative; flex-direction:row; align-items:flex-start; gap:10px; padding:12px 15px; border-top:0; transition:background .18s ease; }
.notification-item:hover { background:rgba(120,160,140,.10); }
.notification-avatar { flex:0 0 38px; width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:17px;background:linear-gradient(145deg,#244d37,#142c22);box-shadow:0 2px 8px rgba(0,0,0,.14); }
.notification-avatar.goal-avatar { background:linear-gradient(145deg,#56317b,#322047); }
.notification-message { min-width:0; flex:1; display:flex; flex-direction:column; gap:3px; }
.notification-message strong { color:inherit; font-size:11px; }
.notification-message strong small { font-size:9px;font-weight:400;color:#94a39d; }
.notification-message span { font-size:11px;line-height:1.5; }
.notification-message>small { font-size:9px;line-height:1.4;color:#9aa9a3; }
.notification-unread { flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#4eaeef;margin:7px 1px 0 0;box-shadow:0 0 0 3px rgba(78,174,239,.12); }
.notification-hint { display:block;padding:10px 15px 12px;border-top:1px solid rgba(130,160,150,.2); }
.feature-card { transform:translateY(0) scale(1); transition:transform .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s ease, filter .24s ease; }
.feature-card:before { content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(110deg,transparent 25%,rgba(255,255,255,.17) 48%,transparent 70%);transform:translateX(-130%);transition:transform .55s ease; }
.feature-card:hover { transform:translateY(-5px) scale(1.015);filter:saturate(1.12);box-shadow:0 15px 32px rgba(90,220,55,.2),0 0 0 1px rgba(140,255,90,.16); }
.feature-card.history:hover { box-shadow:0 15px 32px rgba(165,75,230,.2),0 0 0 1px rgba(200,140,255,.18); }
.feature-card:hover:before { transform:translateX(130%); }
.feature-card:active { transform:translateY(-1px) scale(.985); }
.feature-card .feature-art { transition:transform .25s ease, box-shadow .25s ease; }
.feature-card:hover .feature-art { transform:rotate(-7deg) scale(1.09);box-shadow:0 0 22px rgba(130,255,70,.2); }
.feature-card.history:hover .feature-art { box-shadow:0 0 22px rgba(190,100,255,.22); }
.feature-card .round-arrow { transition:transform .22s ease, box-shadow .22s ease; }
.feature-card:hover .round-arrow { transform:translateX(4px);box-shadow:0 0 16px rgba(150,255,80,.32); }
.feature-card.history:hover .round-arrow { box-shadow:0 0 16px rgba(190,100,255,.32); }
@keyframes notif-pop { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
html[data-theme="light"] .notification-panel { background:#fff; color:#24372e; border-color:#c9ddd2; }
html[data-theme="light"] .notification-panel-title { border-color:#e2ebe5; }
html[data-theme="light"] .notification-item:hover { background:#f3f9f5; }
html[data-theme="light"] .notification-avatar { background:linear-gradient(145deg,#dff4e5,#c5e9d1); }
html[data-theme="light"] .notification-avatar.goal-avatar { background:linear-gradient(145deg,#f0e1ff,#dfc7f7); }
html[data-theme="light"] .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-message strong small, html[data-theme="light"] .notification-message>small { color:#6e8276; }
html[data-theme="light"] .notification-hint { border-color:#e2ebe5; }
@media (prefers-reduced-motion: reduce) { .feature-card,.feature-card:before,.feature-card .feature-art,.feature-card .round-arrow,.notification-panel { animation:none!important;transition:none!important; } }
/* Clear, semantic action icons and a bare notification bell */
.feature-art svg { width:42px; height:42px; display:block; }
.feature-card.exercise .feature-art { color:#9eff43; }
.feature-card.history .feature-art { color:#cb75ff; }
.notification-wrap .notification-bell { appearance:none; -webkit-appearance:none; background:transparent!important; border:0!important; outline-offset:3px; box-shadow:none!important; border-radius:0!important; }
.notification-wrap .notification-bell:hover, .notification-wrap .notification-bell:focus-visible { background:transparent!important; box-shadow:none!important; color:var(--green); }
html[data-theme="light"] .notification-wrap .notification-bell { background:transparent!important; border:0!important; box-shadow:none!important; color:#244b35; }
html[data-theme="light"] .notification-wrap .notification-bell:hover { background:transparent!important; color:#278b20; }


/* BMI icon: person/measurement symbol */
.title-icon .bmi-title-svg{width:23px;height:23px;display:block;flex:none}

/* Notification redesign: separate email / social-style toast cards */
.notification-wrap .notification-panel {
  position: fixed; z-index: 9999; top: 88px; right: 24px;
  width: min(370px, calc(100vw - 28px)); max-height: calc(100vh - 110px);
  overflow: visible; padding: 0; border: 0; border-radius: 0;
  background: transparent; color: inherit; box-shadow: none;
  display: flex; flex-direction: column; gap: 10px;
  animation: none;
}
.notification-panel-title {
  order: -1; display:flex; align-items:center; justify-content:space-between;
  margin:0 0 2px; padding:0 2px 4px; border:0; font-size:12px;
  color:var(--muted,#82918b); text-shadow:0 1px 5px rgba(0,0,0,.12);
}
.notification-panel-title>span { display:flex; align-items:baseline; gap:7px; }
.notification-panel-title>span>small { font-size:10px; }
.notification-panel-title button { color:inherit; width:24px; height:24px; font-size:20px; }
.notification-panel .notification-item {
  box-sizing:border-box; width:100%; min-height:76px; padding:13px 14px;
  display:flex; flex-direction:row; align-items:flex-start; gap:11px;
  border:1px solid rgba(150,175,162,.24); border-radius:14px;
  background:rgba(13,27,24,.97); color:#f5faf6;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12);
  animation:toast-enter .42s cubic-bezier(.2,.8,.2,1) both;
}
.notification-panel .notification-item:nth-of-type(3) { animation-delay:.22s; }
.notification-panel .notification-item:hover { transform:translateX(-3px); background:rgba(20,39,32,.99); }
.notification-panel .notification-avatar { flex:0 0 38px; width:38px; height:38px; }
.notification-panel .notification-message { flex:1; min-width:0; gap:4px; }
.notification-panel .notification-message strong { font-size:12px; color:#f4faf5; }
.notification-panel .notification-message strong small { font-size:10px; color:#a7b8ad; }
.notification-panel .notification-message span { font-size:12px; line-height:1.5; color:#eef5f0; }
.notification-panel .notification-message>small { font-size:10px; line-height:1.45; color:#aab9b0; }
.notification-panel .notification-unread { margin-top:6px; }
.notification-panel .notification-hint { display:none; }
html[data-theme="light"] .notification-panel-title { color:#5c7065; text-shadow:none; }
html[data-theme="light"] .notification-panel .notification-item {
  background:rgba(255,255,255,.98); color:#24372e;
  border-color:#dce9e0; box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07);
}
html[data-theme="light"] .notification-panel .notification-item:hover { background:#f9fffb; }
html[data-theme="light"] .notification-panel .notification-message strong { color:#263d32; }
html[data-theme="light"] .notification-panel .notification-message strong small,
html[data-theme="light"] .notification-panel .notification-message>small { color:#718378; }
html[data-theme="light"] .notification-panel .notification-message span { color:#2e4438; }
@keyframes toast-enter { from { opacity:0; transform:translate3d(28px,-8px,0) scale(.97); } to { opacity:1; transform:translate3d(0,0,0) scale(1); } }
@media(max-width:600px) { .notification-wrap .notification-panel { top:76px; right:12px; width:min(360px,calc(100vw - 24px)); } }
@media(prefers-reduced-motion:reduce) { .notification-panel .notification-item { animation:none!important; transition:none!important; } }


/* Consistent, minimal dumbbell mark and clean left-aligned notification typography */
.notification-panel .notification-item { text-align:left; justify-content:flex-start; }
.notification-panel .notification-message { text-align:left; align-items:flex-start; }
.notification-panel .notification-message strong,
.notification-panel .notification-message span,
.notification-panel .notification-message>small { display:block; width:100%; text-align:left; }
.notification-panel .notification-avatar.dumbbell-avatar {
  flex:0 0 36px; width:36px; height:36px; border-radius:10px;
  display:grid; place-items:center; background:transparent!important;
  box-shadow:none!important; color:#83dc78; margin-top:1px;
}
.notification-panel .notification-avatar.dumbbell-avatar svg {
  display:block; width:25px; height:25px; fill:none; stroke:currentColor;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;
}
html[data-theme="light"] .notification-panel .notification-avatar.dumbbell-avatar { color:#278b43; }

/* Keep notification toast cards; remove only any surface behind the message text */
.notification-wrap .notification-panel {
  background:transparent!important; border:0!important; box-shadow:none!important;
}
.notification-wrap .notification-panel .notification-item {
  background:rgba(13,27,24,.97)!important;
  border:1px solid rgba(150,175,162,.24)!important;
  border-radius:14px!important;
  box-shadow:0 8px 26px rgba(0,0,0,.24),0 2px 7px rgba(0,0,0,.12)!important;
  color:#f5faf6;
}
html[data-theme="light"] .notification-wrap .notification-panel .notification-item {
  background:rgba(255,255,255,.98)!important;
  border-color:#dce9e0!important;
  box-shadow:0 8px 26px rgba(30,65,45,.14),0 2px 7px rgba(30,65,45,.07)!important;
  color:#24372e;
}
.notification-wrap .notification-panel .notification-message,
.notification-wrap .notification-panel .notification-message strong,
.notification-wrap .notification-panel .notification-message span,
.notification-wrap .notification-panel .notification-message>small {
  background:transparent!important; box-shadow:none!important;
}
.notification-wrap .notification-panel .notification-item:hover { transform:translateX(-3px); }
html[data-theme="light"] .notification-wrap .notification-panel .notification-item:hover { background:#f9fffb!important; }


/* Medium hero logo size; preserve its reserved height so banner content does not shift. */
.hero-logo {
  width: 380px !important;
  height: 125px !important;
  object-fit: cover !important;
  object-position: center center !important;
  transform: scale(1.06) !important;
  transform-origin: left top !important;
}
@media (max-width: 760px) {
  .hero-logo {
    width: 260px !important;
    height: 92px !important;
    object-fit: cover !important;
    object-position: center center !important;
    transform: scale(1.04) !important;
    transform-origin: left top !important;
  }
}


/* Mobile-first refinements: keep the dashboard readable and prevent overflow on phones. */
@media (max-width: 760px) {
  html, body, #root, .fittrack-app { width:100%; min-width:0; max-width:100%; }
  body { overflow-x:hidden; }
  .sidebar { width:100%; min-width:0; padding:8px 7px 9px; }
  .sidebar-logo-wrap { padding:0 2px 8px; }
  .sidebar-logo { width:132px; height:68px; max-width:42vw; }
  .logo-caption { margin-top:-5px; font-size:6px; letter-spacing:1.5px; }
  .side-menu { width:100%; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; }
  .side-link { width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere; }
  .side-icon { width:auto; min-height:19px; font-size:19px; line-height:1; }
  .main-area { margin:0!important; width:100%!important; min-width:0; padding:0 10px 22px!important; }
  .topbar { width:100%; min-width:0; min-height:70px; height:auto; padding:10px 2px; gap:8px; }
  .user-block { min-width:0; gap:8px; }
  .avatar-wrap,.avatar-fallback { width:42px; height:42px; }
  .avatar-fallback { font-size:16px; }
  .online-dot { width:12px; height:12px; }
  .hello { font-size:11px; }
  .user-block strong { display:block; max-width:32vw; font-size:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .topbar-right { min-width:0; gap:4px; }
  .icon-button { width:36px; height:38px; flex:0 0 36px; font-size:22px; }
  .icon-button.sun { font-size:24px; }
  .notification-wrap { position:relative; }
  .notification-wrap .notification-panel { position:absolute; top:calc(100% + 8px); right:-4px; left:auto; width:min(340px,calc(100vw - 24px)); max-height:min(65vh,440px); overflow-y:auto; z-index:1000; }
  .content-grid { width:100%!important; min-width:0; padding-top:12px; gap:12px; grid-template-columns:minmax(0,1fr)!important; }
  .hero-card { width:100%; min-width:0; height:clamp(225px,64vw,275px); }
  .hero-content { width:100%; min-width:0; padding:12px 15px; }
  /* Keep the logo's reserved height so the headline and banner details do not jump. */
  .hero-logo { width:min(230px,65vw)!important; height:92px!important; max-width:100%; object-fit:cover!important; object-position:center!important; transform:none!important; }
  .hero-content h1 { max-width:100%; font-size:clamp(19px,5.6vw,23px); line-height:1.2; overflow-wrap:break-word; margin-top:0; }
  .hero-features { max-width:100%; display:flex; flex-wrap:wrap; align-items:center; gap:5px 7px; font-size:clamp(7px,2.15vw,9px); line-height:1.3; }
  .hero-features i { flex:0 0 2px; }
  .bmi-card,.food-card,.recommend-card,.dark-card { width:100%; min-width:0; }
  .bmi-inputs { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .bmi-inputs label,.bmi-extra-row label { min-width:0; }
  .bmi-inputs input,.bmi-extra-row input { width:100%; min-width:0; }
  .bmi-scale-labels { gap:2px; }
  .bmi-scale-labels span { min-width:0; font-size:clamp(6px,1.8vw,8px); overflow-wrap:anywhere; }
  .quick-grid { width:100%; min-width:0; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
  .feature-card { min-width:0; min-height:150px; padding:13px 11px; }
  .feature-card h3 { max-width:100%; font-size:clamp(14px,4vw,19px); line-height:1.25; overflow-wrap:anywhere; }
  .feature-card p { max-width:100%; font-size:9px; }
  .feature-art { top:12px; left:12px; width:54px; height:54px; font-size:28px; }
  .round-arrow { right:10px; bottom:10px; width:26px; height:26px; }
  .food-layout { width:100%; min-width:0; grid-template-columns:minmax(0,1fr)!important; gap:10px; }
  .upload-box,.food-result-box { width:100%; min-width:0; }
  .food-result-top { min-width:0; }
  .food-result-top img { width:88px; height:82px; flex:0 0 88px; }
  .food-result-top.food-result-text-only { min-height:88px; padding:9px 7px; }
  .food-result-no-image { width:66px; height:66px; flex-basis:66px; border-radius:12px; }
  .food-result-no-image svg { width:36px; height:36px; }
  .food-result-top>div { min-width:0; }
  .calorie-bottom { grid-template-columns:minmax(0,1fr)!important; }
  .meal-row { min-width:0; grid-template-columns:48px minmax(0,1fr) 48px; gap:7px; }
  .meal-row img { width:44px; height:44px; }
  .meal-row strong { white-space:normal; overflow-wrap:anywhere; line-height:1.3; }
  .meal-row button { min-width:0; padding:0 6px; }
}
@media (max-width: 390px) {
  .main-area { padding-left:8px!important; padding-right:8px!important; }
  .topbar { gap:4px; }
  .user-block { gap:6px; }
  .avatar-wrap,.avatar-fallback { width:38px; height:38px; }
  .user-block strong { font-size:16px; max-width:29vw; }
  .topbar-right { gap:1px; }
  .icon-button { width:32px; flex-basis:32px; }
  .hero-content { padding-left:12px; padding-right:12px; }
  .hero-logo { width:min(205px,64vw)!important; height:92px!important; }
  .hero-content h1 { font-size:19px; }
  .hero-features { column-gap:5px; font-size:7px; }
  .quick-grid { gap:7px; }
  .feature-card { min-height:142px; padding:11px 9px; }
  .feature-card h3 { font-size:14px; }
  .bmi-card,.food-card,.recommend-card { padding:12px!important; }
}
@media (max-width: 340px) {
  .side-link { font-size:7.5px; }
  .hero-card { height:220px; }
  .hero-logo { width:185px!important; height:92px!important; }
  .hero-content h1 { font-size:18px; }
  .quick-grid { grid-template-columns:minmax(0,1fr)!important; }
  .feature-card { min-height:130px; }
}
@media (max-width: 760px) and (orientation: landscape) {
  .sidebar-logo-wrap { display:none; }
  .sidebar { padding:5px 7px; }
  .side-link { height:44px; flex-direction:row; font-size:9px; }
  .hero-card { height:235px; }
}


/* Game-inspired animated fire mascot and matching sidebar exercise icon */
.bmi-card .daily-energy .energy-flame {
  left: 16px !important;
  width: 39px !important;
  height: 47px !important;
  filter: drop-shadow(0 0 5px rgba(255,112,16,.52)) drop-shadow(0 0 12px rgba(255,83,12,.25));
}
.bmi-card .daily-energy .energy-flame .fire-mascot { overflow: visible; }
.bmi-card .daily-energy .mascot-body {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: mascot-fire-bounce .72s ease-in-out infinite alternate;
}
.bmi-card .daily-energy .mascot-shell {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: mascot-shell-flicker .48s ease-in-out infinite alternate;
}
.bmi-card .daily-energy .mascot-core {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: mascot-core-flicker .38s ease-in-out infinite alternate;
}
.bmi-card .daily-energy .mascot-arm-left { transform-origin: 14px 45px; animation: mascot-arm-left .65s ease-in-out infinite alternate; }
.bmi-card .daily-energy .mascot-arm-right { transform-origin: 49px 44px; animation: mascot-arm-right .58s ease-in-out infinite alternate; }
.bmi-card .daily-energy .mascot-leg-left,.bmi-card .daily-energy .mascot-leg-right { transform-box: fill-box; transform-origin: 50% 0; animation: mascot-legs .5s ease-in-out infinite alternate; }
.bmi-card .daily-energy .mascot-leg-right { animation-delay: -.25s; }
.bmi-card .daily-energy .mascot-aura { transform-box: fill-box; transform-origin: 50% 50%; animation: mascot-aura 1s ease-in-out infinite alternate; }
.bmi-card .daily-energy .mascot-spark { transform-box: fill-box; transform-origin: center; animation: mascot-spark 1s ease-in-out infinite alternate; }
.bmi-card .daily-energy .mascot-spark-right { animation-delay: -.45s; }
@keyframes mascot-fire-bounce { from { transform: translateY(1px) scale(.98,1); } to { transform: translateY(-1.5px) scale(1.02,1.025); } }
@keyframes mascot-shell-flicker { from { transform: skewX(-2deg) scaleY(.97); } to { transform: skewX(2deg) scaleY(1.04); } }
@keyframes mascot-core-flicker { from { opacity:.82; transform: scale(.94,.96); } to { opacity:1; transform: scale(1.05,1.04); } }
@keyframes mascot-arm-left { from { transform: rotate(-8deg); } to { transform: rotate(8deg); } }
@keyframes mascot-arm-right { from { transform: rotate(8deg); } to { transform: rotate(-9deg); } }
@keyframes mascot-legs { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@keyframes mascot-aura { from { opacity:.42; transform: scale(.85); } to { opacity:.9; transform: scale(1.12); } }
@keyframes mascot-spark { from { opacity:.35; transform: scale(.72) rotate(-12deg); } to { opacity:1; transform: scale(1.12) rotate(12deg); } }
.side-icon-dumbbell { display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px; }
.side-icon-dumbbell svg { display:block; width:25px; height:25px; }
@media (max-width:760px) {
  .bmi-card .daily-energy .energy-flame { left:10px !important; width:32px !important; height:40px !important; }
  .side-icon-dumbbell { flex:0 0 auto; min-height:19px; }
  .side-icon-dumbbell svg { width:19px; height:19px; }
}
@media (prefers-reduced-motion: reduce) {
  .bmi-card .daily-energy .mascot-body,.bmi-card .daily-energy .mascot-shell,.bmi-card .daily-energy .mascot-core,
  .bmi-card .daily-energy .mascot-arm-left,.bmi-card .daily-energy .mascot-arm-right,
  .bmi-card .daily-energy .mascot-leg-left,.bmi-card .daily-energy .mascot-leg-right,
  .bmi-card .daily-energy .mascot-aura,.bmi-card .daily-energy .mascot-spark { animation:none !important; }
}


/* Clear, consistent line icons for hero features and food analysis */
.hero-feature-icon{display:inline-flex;align-items:center;gap:6px;color:inherit;white-space:nowrap}
.hero-feature-icon svg{width:17px;height:17px;flex:0 0 17px;color:var(--green);display:block}
.food-plate-icon svg{width:22px;height:22px;display:block}
@media(max-width:760px){.hero-feature-icon{gap:4px}.hero-feature-icon svg{width:14px;height:14px;flex-basis:14px}.food-plate-icon svg{width:20px;height:20px}}


/* Keep recommended-meals panel a consistent height regardless of menu count. */
.recommend-card {
  height: 510px;
  min-height: 510px;
  max-height: 510px;
  display: flex;
  flex-direction: column;
  align-self: start;
  overflow: hidden;
}
.recommend-card .section-title,
.recommend-card .meal-tabs,
.recommend-card .tips-box { flex: 0 0 auto; }
.recommend-card .meal-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 3px;
  scrollbar-width: thin;
  scrollbar-color: #54735d transparent;
}
.recommend-card .meal-list::-webkit-scrollbar { width: 5px; }
.recommend-card .meal-list::-webkit-scrollbar-thumb { background: #54735d; border-radius: 8px; }
@media (max-width: 1100px) {
  .recommend-card { height: 510px !important; min-height: 510px !important; max-height: 510px !important; }
}
@media (max-width: 760px) {
  .recommend-card { height: 480px !important; min-height: 480px !important; max-height: 480px !important; }
  .recommend-card .meal-list { gap: 6px; }
}

/* Recommended meal list: text-first, consistent and easy to scan */
.recommend-card .section-title { align-items: center; gap: 10px; }
.recommend-card .section-title h2 { line-height: 1.3; }
.recommend-card .section-title h2 small { display:block; margin-top:2px; font-size:10px; }
.recommend-card .meal-tabs { gap:6px; margin:12px 0; }
.recommend-card .meal-tabs button { min-width:0; height:36px; font-size:11px; transition:background .18s ease,border-color .18s ease,transform .18s ease; }
.recommend-card .meal-tabs button:hover { transform:translateY(-1px); }
.recommend-card .meal-row { grid-template-columns:38px minmax(0,1fr) 48px; min-height:72px; gap:10px; padding:10px; border-radius:12px; background:rgba(10,22,25,.72); }
.recommend-card .meal-index { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:rgba(140,255,50,.09); border:1px solid rgba(140,255,50,.28); color:var(--green); font:600 12px 'Kanit',sans-serif; }
.recommend-card .meal-info { min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:5px; }
.recommend-card .meal-row strong { white-space:normal; overflow-wrap:anywhere; font-size:12px; line-height:1.45; font-weight:600; }
.recommend-card .meal-row .meal-kcal { display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin:0; padding:0; border:0; border-radius:0; background:transparent; color:var(--muted); font-size:10px; }
.recommend-card .meal-row .meal-kcal b { color:var(--green2); font-weight:600; }
.recommend-card .meal-row button { width:48px; height:30px; padding:0 6px; border-radius:8px; font-size:10px; }
html[data-theme="light"] .recommend-card .meal-row { background:#fff; border-color:#d9e4dc; }
html[data-theme="light"] .recommend-card .meal-index { background:#eff9e9; border-color:#c6e6b6; color:#39831f; }
html[data-theme="light"] .recommend-card .meal-row .meal-kcal { color:#687970; }
html[data-theme="light"] .recommend-card .meal-row .meal-kcal b { color:#347f20; }
@media(max-width:760px) {
  .recommend-card .meal-row { grid-template-columns:34px minmax(0,1fr) 46px; gap:8px; padding:8px; }
  .recommend-card .meal-index { width:30px; height:30px; }
  .recommend-card .meal-row strong { font-size:11px; }
  .recommend-card .meal-row .meal-kcal { font-size:9px; }
  .recommend-card .meal-row button { width:46px; font-size:9px; }
}

/* Recommended food icon and balanced tips layout */
.recommend-food-icon svg { width:22px; height:22px; display:block; }
.tips-box { padding:12px; }
.tips-box h3 { display:flex; align-items:center; gap:7px; margin:0 0 10px; }
.tips-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.tip-item { min-width:0; min-height:82px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:4px; padding:9px 10px; border:1px solid rgba(145,170,160,.2); border-radius:9px; background:rgba(255,255,255,.035); color:var(--muted); font-size:10px; line-height:1.4; }
.tip-item strong { color:var(--text); font-size:10px; line-height:1.45; font-weight:600; }
.tip-number { color:var(--green); font:600 10px 'Kanit',sans-serif; letter-spacing:.5px; }
html[data-theme="light"] .tip-item { background:#fff; border-color:#dce7df; color:#61736a; }
html[data-theme="light"] .tip-item strong { color:#263c30; }
@media(max-width:760px) { .tips-grid { grid-template-columns:1fr; gap:7px; } .tip-item { min-height:0; display:grid; grid-template-columns:27px minmax(0,1fr); align-items:center; column-gap:8px; padding:9px 10px; } .tip-number { grid-row:span 2; } .tip-item strong { grid-column:2; } }


/* Tips: restore the original centered text layout without numbered tiles or bullets */
.tips-box h3 { justify-content:center; text-align:center; margin-bottom:8px; }
.tips-copy { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; text-align:center; padding:2px 6px 4px; }
.tips-copy p { margin:0; color:var(--muted); font-size:10px; line-height:1.65; text-align:center; }
html[data-theme="light"] .tips-copy p { color:#4c6157; }
@media(max-width:760px) { .tips-copy { gap:5px; } .tips-copy p { font-size:10px; } }

/* Premium centered tips panel: subtle depth, raised typography and soft ambient glow */
.tips-box {
  position:relative;
  isolation:isolate;
  overflow:hidden;
  border:1px solid rgba(111,211,156,.34);
  border-radius:14px;
  padding:14px 13px 15px;
  background:linear-gradient(145deg,rgba(9,25,27,.98),rgba(4,13,17,.96) 62%,rgba(9,24,22,.98));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.055),inset 0 -10px 22px rgba(0,0,0,.18),0 8px 22px rgba(0,0,0,.2),0 0 18px rgba(91,255,139,.045);
  transition:border-color .25s ease,box-shadow .25s ease,transform .25s ease;
}
.tips-box:before {
  content:"";position:absolute;z-index:-1;left:18%;right:18%;top:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(174,255,84,.8),rgba(64,224,174,.7),transparent);
  filter:drop-shadow(0 0 5px rgba(153,255,76,.55));
}
.tips-box:after {
  content:"";position:absolute;z-index:-1;right:-42px;top:-55px;width:130px;height:110px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(123,255,67,.095),transparent 70%);pointer-events:none;
}
.tips-box:hover {border-color:rgba(143,255,94,.52);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 10px 25px rgba(0,0,0,.24),0 0 23px rgba(113,255,76,.09);transform:translateY(-1px)}
.tips-box h3 {
  position:relative;z-index:1;justify-content:center;text-align:center;gap:7px;margin:0 0 10px;
  color:#caff49;font-family:'Kanit',sans-serif;font-size:14px;font-weight:700;letter-spacing:.25px;
  text-shadow:0 1px 0 #536d1d,0 2px 0 rgba(34,61,14,.72),0 4px 10px rgba(151,255,43,.2);
}
.tips-box h3 span {display:inline-grid;place-items:center;filter:drop-shadow(0 0 5px rgba(255,224,64,.3));transform:translateY(-1px)}
.tips-copy {position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;padding:2px 6px 1px}
.tips-copy p {
  position:relative;margin:0;color:#b8cbd0;font-size:11px;font-weight:500;line-height:1.7;text-align:center;
  letter-spacing:.08px;text-shadow:0 1px 0 rgba(0,0,0,.7),0 0 8px rgba(104,213,217,.08);
  transition:color .2s ease,text-shadow .2s ease,transform .2s ease;
}
.tips-copy p:hover {color:#e5f5ec;text-shadow:0 1px 0 rgba(0,0,0,.6),0 0 10px rgba(137,255,114,.2);transform:translateY(-1px)}
html[data-theme="light"] .tips-box {
  border-color:rgba(71,151,104,.3);
  background:linear-gradient(145deg,#fbfffc,#f0f8f2 62%,#f8fcf8);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -8px 18px rgba(64,128,86,.035),0 8px 22px rgba(33,83,54,.08),0 0 16px rgba(84,183,107,.045);
}
html[data-theme="light"] .tips-box:before {background:linear-gradient(90deg,transparent,rgba(123,193,54,.72),rgba(66,174,135,.58),transparent)}
html[data-theme="light"] .tips-box h3 {color:#548d16;text-shadow:0 1px 0 #fff,0 2px 0 rgba(96,145,49,.16),0 4px 10px rgba(91,157,43,.16)}
html[data-theme="light"] .tips-copy p {color:#536b61;text-shadow:0 1px 0 rgba(255,255,255,.9),0 0 7px rgba(53,139,99,.06)}
html[data-theme="light"] .tips-copy p:hover {color:#2e573f;text-shadow:0 1px 0 #fff,0 0 9px rgba(69,158,90,.13)}
@media(max-width:760px) {
  .tips-box {padding:12px 10px 13px;border-radius:12px}
  .tips-box h3 {font-size:13px;margin-bottom:8px}
  .tips-copy {gap:4px;padding-inline:3px}
  .tips-copy p {font-size:10px;line-height:1.65}
}
/* Pyramid composition: short, medium, then long line, all centered. */
.tips-copy {width:100%;align-items:center;gap:5px}
.tips-copy p {width:max-content;max-width:100%;text-align:center}
.tips-copy p:nth-child(1) {max-width:62%}
.tips-copy p:nth-child(2) {max-width:82%}
.tips-copy p:nth-child(3) {max-width:100%}
@media(max-width:760px) {
  .tips-copy {gap:4px}
  .tips-copy p:nth-child(1) {max-width:72%}
  .tips-copy p:nth-child(2) {max-width:88%}
  .tips-copy p:nth-child(3) {max-width:100%}
}
@media(prefers-reduced-motion:reduce) {.tips-box,.tips-copy p {transition:none}.tips-box:hover,.tips-copy p:hover {transform:none}}

/* Refined food-analysis icons and upload affordance */
.food-plate-icon svg { width:22px; height:22px; display:block; }
.upload-icon { width:48px; height:48px; display:grid; place-items:center; margin-bottom:9px; color:#9aff45; filter:drop-shadow(0 3px 8px rgba(112,255,55,.2)); transition:transform .22s ease,filter .22s ease; }
.upload-icon svg { width:42px; height:42px; display:block; }
.upload-box:hover .upload-icon { transform:translateY(-3px) scale(1.06); filter:drop-shadow(0 5px 12px rgba(112,255,55,.32)); }
.upload-box strong { font-family:'Kanit',sans-serif; font-size:14px; letter-spacing:.1px; }
.upload-box small { font-size:10px; line-height:1.5; }
.upload-box>b { font-size:10px; letter-spacing:.15px; box-shadow:0 5px 14px rgba(118,242,46,.12); transition:transform .2s ease,box-shadow .2s ease; }
.upload-box:hover>b { transform:translateY(-1px); box-shadow:0 7px 17px rgba(118,242,46,.22); }
.food-placeholder strong { font-size:17px; line-height:1.45; }
.food-placeholder span { max-width:340px; font-size:10px; line-height:1.65; }
html[data-theme="light"] .upload-icon { color:#399c24; filter:drop-shadow(0 3px 8px rgba(57,156,36,.12)); }
@media(max-width:760px) { .food-plate-icon svg { width:20px;height:20px; } .upload-icon { width:43px;height:43px; } .upload-icon svg { width:38px;height:38px; } .upload-box strong { font-size:13px; } .food-placeholder strong { font-size:15px; } }

/* Distinct icon for food analysis: scan/inspect motif, separate from the recommendation plate icon. */
.food-analysis-scan-icon svg{width:22px;height:22px;display:block}
@media(max-width:760px){.food-analysis-scan-icon svg{width:20px;height:20px}}

/* FitTrack branded footer */
.fittrack-footer{
  width:100%; min-width:0; margin:28px 0 0; padding:16px 8px 10px;
  border-top:1px solid rgba(91,145,139,.24);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  color:var(--muted); font-family:'Anuphan',sans-serif;
}
.footer-brand{display:flex; align-items:center; gap:9px; color:var(--text); white-space:nowrap}
.footer-mark{width:27px;height:27px;display:grid;place-items:center;border-radius:8px;
  color:#071006;background:linear-gradient(135deg,#9cff37,#36d98a);
  font:700 10px 'Kanit',sans-serif;letter-spacing:-.5px;
  box-shadow:0 3px 12px rgba(125,255,54,.16)}
.footer-brand strong{font:600 15px 'Kanit',sans-serif;letter-spacing:.25px;
  background:linear-gradient(90deg,#baff52,#42dca0);-webkit-background-clip:text;background-clip:text;color:transparent}
.footer-description{font-size:11px;text-align:center;line-height:1.5}
.footer-copyright{font-size:10px;white-space:nowrap;opacity:.78}
html[data-theme="light"] .fittrack-footer{border-top-color:rgba(57,120,99,.2);color:#64766d}
html[data-theme="light"] .footer-brand{color:#20382d}
@media(max-width:760px){
  .fittrack-footer{margin-top:18px;padding:13px 4px 8px;flex-wrap:wrap;justify-content:center;gap:6px 12px}
  .footer-brand{width:100%;justify-content:center}
  .footer-description{font-size:10px;width:100%}
  .footer-copyright{font-size:9px;width:100%;text-align:center}
}


/* Keep food upload and analysis panels stable when an image is selected. */
.food-layout {
  align-items: stretch;
  min-width: 0;
}
.upload-box {
  position: relative;
  height: 230px;
  min-height: 230px;
  max-height: 230px;
  flex: 0 0 230px;
  min-width: 0;
}
.upload-box > img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.food-result-box {
  height: 230px;
  min-height: 230px;
  max-height: 230px;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(145,255,62,.35) transparent;
}
.food-placeholder,
.food-loading {
  min-height: 100%;
  height: 100%;
}
@media (max-width: 760px) {
  .upload-box {
    height: 210px;
    min-height: 210px;
    max-height: 210px;
    flex-basis: 210px;
  }
  .food-result-box {
    height: 210px;
    min-height: 210px;
    max-height: 210px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .upload-box, .upload-box * { transition-duration: .01ms !important; }
}


/* โหมดสว่าง: แอนิเมชันเรืองแสงของโลโก้ต้องคงการกลับสี (invert) ไว้ ไม่งั้น filter ของ animation จะทับ
   จนตัวอักษรสีขาวของโลโก้หายไปบนพื้นขาว */
@keyframes fittrack-logo-glow-light {
  0%, 100% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 2px rgba(60,170,40,.10)); }
  50% { filter: invert(1) hue-rotate(180deg) drop-shadow(0 0 5px rgba(60,170,40,.28)); }
}
html[data-theme="light"] .sidebar-logo {
  filter: invert(1) hue-rotate(180deg);
  mix-blend-mode: multiply;
  animation-name: fittrack-logo-glow-light !important;
}
/* ===================== MOTION (เหมือนหน้าตั้งค่า) ===================== */
@keyframes ft-rise { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
@keyframes ft-pop { 0% { opacity:0; transform:scale(.85); } 60% { transform:scale(1.06); } 100% { opacity:1; transform:none; } }
@keyframes ft-slide { from { opacity:0; transform:translateX(-14px); } to { opacity:1; transform:none; } }
@keyframes ft-grow { from { transform:scaleX(0); } to { transform:scaleX(1); } }

/* การ์ดหลักไหลขึ้นทีละใบ */
.content-grid > .hero-card { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) both; }
.content-grid > .bmi-card { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .08s both; }
.content-grid > .quick-grid { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .16s both; }
.content-grid > .food-card { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .24s both; }
.content-grid > .recommend-card { animation:ft-rise .55s cubic-bezier(.2,.8,.2,1) .32s both; }

/* ชี้แล้วเรืองแสง/ยกขึ้นเล็กน้อย */
.content-grid > .dark-card { transition:border-color .25s ease, box-shadow .25s ease, transform .25s ease; }
.content-grid > .dark-card:hover { border-color:#2f7a52; box-shadow:inset 0 0 25px rgba(0,0,0,.25), 0 8px 28px rgba(80,255,120,.10); transform:translateY(-2px); }
.hero-card { transition:box-shadow .3s ease, border-color .3s ease; }
.hero-card:hover { border-color:#3fbf8f; box-shadow:0 0 30px rgba(80,255,120,.14); }
.hero-feature-icon { transition:color .2s ease, transform .2s ease; }
.hero-feature-icon:hover { color:var(--green); transform:translateY(-2px); }

/* BMI / พลังงาน */
.bmi-bar i { transition:left .6s cubic-bezier(.2,.8,.2,1); }
.bmi-number { animation:ft-pop .45s cubic-bezier(.2,.8,.2,1) both; }
.progress-track span { transform-origin:left center; animation:ft-grow .9s cubic-bezier(.2,.8,.2,1) .4s both; transition:width .6s cubic-bezier(.2,.8,.2,1); }
.calorie-stats strong { animation:ft-pop .45s cubic-bezier(.2,.8,.2,1) both; }
.warning-card { animation:ft-rise .5s ease .55s both; }

/* เมนูแนะนำ: แถวเลื่อนเข้าทีละแถวเมื่อเปลี่ยนแท็บ */
.meal-tabs button { transition:background .2s ease, border-color .2s ease, color .2s ease, transform .15s ease; }
.meal-tabs button:hover:not(.active) { border-color:#7cff31; color:var(--green); }
.meal-tabs button:active { transform:scale(.96); }
.meal-row { animation:ft-slide .4s cubic-bezier(.2,.8,.2,1) both; transition:border-color .2s ease, background .2s ease, transform .2s ease; }
.meal-row:nth-child(2) { animation-delay:.06s; }
.meal-row:nth-child(3) { animation-delay:.12s; }
.meal-row:nth-child(4) { animation-delay:.18s; }
.meal-row:nth-child(5) { animation-delay:.24s; }
.meal-row:hover { border-color:#3fbf8f; transform:translateX(3px); }
.meal-row button { transition:transform .15s ease, box-shadow .2s ease; }
.meal-row button:hover { box-shadow:0 0 18px rgba(125,255,45,.4); }
.meal-row button:active { transform:scale(.94); }
.tips-box { animation:ft-rise .5s ease .3s both; }

html[data-theme="light"] .content-grid > .dark-card:hover { border-color:#6cc943; box-shadow:0 8px 22px rgba(29,76,56,.10); }
html[data-theme="light"] .hero-card:hover { box-shadow:0 6px 22px rgba(29,76,56,.14); }

/* ปิดอนิเมชันตามค่าที่ตั้งไว้ หรือตามระบบ */
html[data-anim="off"] .content-grid > *, html[data-anim="off"] .bmi-number, html[data-anim="off"] .progress-track span,
html[data-anim="off"] .calorie-stats strong, html[data-anim="off"] .warning-card, html[data-anim="off"] .meal-row, html[data-anim="off"] .tips-box { animation:none !important; }
html[data-anim="off"] .content-grid > .dark-card:hover, html[data-anim="off"] .meal-row:hover { transform:none; }
@media (prefers-reduced-motion: reduce) {
  .content-grid > *, .bmi-number, .progress-track span, .calorie-stats strong, .warning-card, .meal-row, .tips-box { animation:none !important; }
  .content-grid > .dark-card:hover, .meal-row:hover { transform:none; }
}

/* ===== Toast เด้งขึ้นมาเมื่อกดปุ่ม (เหมือนหน้าตั้งค่า) ===== */
.ft-toast { position:fixed; left:50%; bottom:26px; z-index:400; transform:translateX(-50%); display:flex; align-items:center; gap:10px; max-width:calc(100vw - 28px); padding:12px 20px; border:1px solid #7cff31; border-radius:12px; background:#071a10; color:#e9ffe0; font-size:14px; box-shadow:0 0 22px rgba(110,255,50,.3); animation:ft-toast-in .5s cubic-bezier(.2,.8,.2,1) both; }
.ft-toast span { width:22px; height:22px; flex:none; display:grid; place-items:center; border-radius:50%; background:#7cff31; color:#071005; font-weight:700; font-size:13px; }
.ft-toast.error { border-color:#ff476d; background:#1f0a10; color:#ffd5db; box-shadow:0 0 22px rgba(255,71,109,.3); }
.ft-toast.error span { background:#ff476d; color:#fff; }
@keyframes ft-toast-in { 0% { opacity:0; transform:translate(-50%,28px) scale(.9); } 60% { opacity:1; transform:translate(-50%,-8px) scale(1.04); } 100% { opacity:1; transform:translate(-50%,0) scale(1); } }
html[data-theme="light"] .ft-toast { background:#f1faec; color:#12201c; box-shadow:0 4px 14px rgba(0,0,0,.12); }
html[data-theme="light"] .ft-toast.error { background:#fff0f3; color:#8a2438; }
html[data-anim="off"] .ft-toast { animation:none !important; }
@media (prefers-reduced-motion: reduce) { .ft-toast { animation:none !important; } }

/* sidebar 5 เมนู: ปรับระยะตามความสูงจอ ให้ข้อความ "สุขภาพที่ดี…" และปุ่มออกจากระบบอยู่ในจอเสมอ */
.sidebar { overflow-y:auto; overflow-x:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.sidebar::-webkit-scrollbar { display:none; }
.sidebar-logo-wrap, .side-menu, .logout-link { flex-shrink:0; }
@media (min-width:761px) {
  .sidebar { padding-top:clamp(10px,2.2vh,22px); padding-bottom:clamp(8px,1.8vh,18px); }
  .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5vh,25px); }
  .sidebar-logo { height:clamp(64px,11vh,112px); }
  .side-menu { gap:clamp(3px,.9vh,9px); }
  .side-link { height:clamp(40px,7.2vh,57px); }
  .sidebar-quote { margin-bottom:clamp(4px,2vh,24px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(11px,1.7vh,15px); line-height:1.45; }
  .pulse-line { margin-top:clamp(4px,1.2vh,12px); }
  .logout-link { height:clamp(40px,6vh,54px); }
}
@supports (height:1dvh) {
  @media (min-width:761px) {
    .sidebar { padding-top:clamp(10px,2.2dvh,22px); padding-bottom:clamp(8px,1.8dvh,18px); }
    .sidebar-logo-wrap { padding-bottom:clamp(6px,2.5dvh,25px); }
    .sidebar-logo { height:clamp(64px,11dvh,112px); }
    .side-menu { gap:clamp(3px,.9dvh,9px); }
    .side-link { height:clamp(40px,7.2dvh,57px); }
    .sidebar-quote { margin-bottom:clamp(4px,2dvh,24px); padding:clamp(4px,1dvh,12px) 14px; font-size:clamp(11px,1.7dvh,15px); line-height:1.45; }
    .pulse-line { margin-top:clamp(4px,1.2dvh,12px); }
    .logout-link { height:clamp(40px,6dvh,54px); }
  }
}
/* sidebar สมส่วน: ทุกส่วนโตตามความสูงจอ และเมนูกระจายตัวกินพื้นที่ที่เหลือ ไม่เกิดช่องว่างใหญ่ใต้เมนู */
@media (min-width:761px) {
  .sidebar-logo-wrap { padding-bottom:clamp(8px,2.6vh,28px); }
  .sidebar-logo { width:100%; height:clamp(78px,15vh,170px); transform:scale(1.18); transform-origin:center top; }
  .logo-caption { font-size:clamp(8px,1.15vh,11px); letter-spacing:2.4px; margin-top:clamp(4px,1.2vh,14px); }
  .side-menu { flex:1 0 auto; justify-content:space-evenly; gap:clamp(3px,.9vh,10px); }
  .side-link { height:clamp(44px,8vh,66px); font-size:clamp(14px,1.9vh,17px); }
  .side-icon { font-size:clamp(22px,2.9vh,28px); }
  .sidebar-quote { margin-top:clamp(6px,2vh,22px); margin-bottom:clamp(6px,2vh,22px); padding:clamp(4px,1vh,12px) 14px; font-size:clamp(14px,2.3vh,20px); line-height:1.5; text-align:center; }
  .pulse-line { margin-top:clamp(8px,1.8vh,18px); }
  .logout-link { height:clamp(44px,6.4vh,60px); font-size:clamp(14px,1.9vh,17px); }
}
/* มือถือ: แสดงปุ่มออกจากระบบเป็นไอคอนมุมขวาบนของแถบเมนู */
@media (max-width:760px) {
  .sidebar { overflow:visible; }
  .logout-link { display:flex !important; align-items:center; justify-content:center; position:absolute; top:10px; right:10px; z-index:2; width:42px; height:42px; padding:0; border:1px solid rgba(120,160,150,.45); border-radius:12px; font-size:0; }
  .logout-link span { margin:0; font-size:22px; }
}
`;

if (typeof document !== "undefined" && !document.getElementById("fittrack-final-styles")) {
  const style = document.createElement("style");
  style.id = "fittrack-final-styles";
  style.textContent = styles;
  document.head.appendChild(style);
}