import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

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

// อ่านยอดแคลอรี่ที่บันทึกไว้ของวันนี้ (ใช้ key เดียวกับหน้า Dashboard)
const getSavedDailyCalories = () => {
  try {
    const saved = localStorage.getItem(`fittrack-calories-${getLocalDateKey()}`);
    return saved === null ? 0 : Math.max(0, Number(saved) || 0);
  } catch {
    return 0;
  }
};

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const exercises = [
    {
      id: "squat",
      icon: "⌁",
      name: "Squat",
      thaiName: "สควอท",
      video: "/squats.mp4",
      description: "บริหารกล้ามเนื้อต้นขา สะโพก และแกนกลางลำตัว",
      muscle: "ขา",
      equipment: "ไม่มีอุปกรณ์",
      sets: "3 เซ็ต",
      reps: "10-15 ครั้ง",
      color: "#b7ff21",
    },
    {
      id: "jumping_jack",
      icon: "✦",
      name: "Jumping Jack",
      thaiName: "กระโดดตบ",
      video: "/jumping_jack.mp4",
      description: "เพิ่มอัตราการเต้นของหัวใจและช่วยเผาผลาญพลังงาน",
      muscle: "คาร์ดิโอ",
      equipment: "ไม่มีอุปกรณ์",
      sets: "3 เซ็ต",
      reps: "30 วินาที",
      color: "#b7ff21",
    },
    {
      id: "high_knees",
      icon: "↟",
      name: "High Knees",
      thaiName: "ยกเข่าสูง",
      video: "/high_knees.mp4",
      description:
        "วิ่งอยู่กับที่พร้อมยกเข่าสูง เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อต้นขา",
      muscle: "ขา",
      equipment: "ไม่มีอุปกรณ์",
      sets: "3 เซ็ต",
      reps: "30 วินาที",
      color: "#b7ff21",
    },
    {
      id: "punches",
      icon: "✧",
      name: "Punches",
      thaiName: "ชกหมัด",
      video: "/punches.mp4",
      description:
        "ชกหมัดสลับซ้าย-ขวา เพิ่มความเร็วหัวใจและฝึกกล้ามเนื้อแขน ไหล่ และแกนกลางลำตัว",
      muscle: "แขน",
      equipment: "ไม่มีอุปกรณ์",
      sets: "3 เซ็ต",
      reps: "30 วินาที",
      color: "#b7ff21",
    },
  ];

  const bodyParts = [
    { id: "all", name: "ทั้งหมด", short: "ALL" },
    { id: "shoulder", name: "ไหล่", short: "SH" },
    { id: "chest", name: "อก", short: "CH" },
    { id: "back", name: "หลัง", short: "BK" },
    { id: "arm", name: "แขน", short: "AR" },
    { id: "core", name: "ท้อง", short: "CR" },
    { id: "leg", name: "สะโพก", short: "HP" },
    { id: "leg2", name: "ต้นขา", short: "LG" },
    { id: "calf", name: "น่อง", short: "CF" },
  ];

  const equipmentTypes = [
    "ทั้งหมด",
    "ดัมเบล",
    "บาร์เบล",
    "เคตเทิล",
    "เครื่องออกกำลังกาย",
    "ยางยืด",
    "Kettlebell",
    "ม้านั่ง",
  ];

  const [selectedPart, setSelectedPart] = useState("all");
  const [selectedEquipment, setSelectedEquipment] = useState("ทั้งหมด");
  const [useEquipment, setUseEquipment] = useState(false);

  // ---------- ชื่อผู้ใช้ (ดึงจาก Firestore เหมือนหน้า Dashboard) ----------
  const [displayName, setDisplayName] = useState(getInitialName);
  const [userInitial, setUserInitial] = useState(() => getInitialName().charAt(0).toUpperCase());

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
      } catch (err) {
        console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------- วันที่/เวลาจริง ----------
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric",
  }).format(currentDateTime);
  const timeLabel = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(currentDateTime);

  // ---------- ธีมมืด/สว่าง (ใช้ key เดียวกับ Dashboard จึงจำค่าร่วมกัน) ----------
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

  // ใช้ layout effect เพื่อให้คืนค่าก่อนหน้าถัดไปตั้งธีมใหม่ (กันธีมหายตอนเปลี่ยนหน้า)
  useLayoutEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  };

  // ---------- การแจ้งเตือน ----------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dailyCalories, setDailyCalories] = useState(getSavedDailyCalories);

  const filteredExercises = useMemo(() => {
    let result = [...exercises];

    if (selectedPart !== "all") {
      const partMap = {
        shoulder: ["ไหล่"],
        chest: ["อก"],
        back: ["หลัง"],
        arm: ["แขน"],
        core: ["ท้อง"],
        leg: ["ขา"],
        leg2: ["ขา"],
        calf: ["ขา"],
      };

      const target = partMap[selectedPart] || [];
      if (target.length) {
        result = result.filter((item) => target.includes(item.muscle));
      }
    }

    if (selectedEquipment !== "ทั้งหมด") {
      result = result.filter(
        (item) => item.equipment === selectedEquipment
      );
    }

    return result;
  }, [selectedPart, selectedEquipment]);

  const selectExercise = (exercise) => {
    navigate(`/settings?exercise=${exercise.id}`);
  };

  const calorieNotice = dailyCalories === 0
    ? "วันนี้ยังไม่มีข้อมูลอาหารที่บันทึกไว้"
    : `วันนี้บันทึกพลังงานจากอาหารแล้ว ${dailyCalories.toLocaleString()} kcal`;
  const exerciseNotice = filteredExercises.length > 0
    ? `มี ${filteredExercises.length} ท่าออกกำลังกายให้เลือกตามเงื่อนไขที่คุณตั้งไว้`
    : "ยังไม่พบท่าที่ตรงกับเงื่อนไข ลองเปลี่ยนส่วนของร่างกายหรืออุปกรณ์";

  const handleNotifications = async () => {
    setDailyCalories(getSavedDailyCalories());
    setNotificationsOpen((open) => !open);
    // ขอสิทธิ์แจ้งเตือนของเบราว์เซอร์เฉพาะหลังผู้ใช้กดเอง
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        let permission = window.Notification.permission;
        if (permission === "default") permission = await window.Notification.requestPermission();
        if (permission === "granted") {
          new window.Notification("FitTrack · เลือกท่าออกกำลังกาย", {
            body: `${calorieNotice}. ${exerciseNotice}`,
            tag: `fittrack-exercise-${getLocalDateKey(currentDateTime)}`,
          });
        }
      } catch (error) {
        console.warn("ไม่สามารถแสดงการแจ้งเตือนของเบราว์เซอร์ได้:", error);
      }
    }
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
    <div className="fittrack-page">
      {/* ================= SIDEBAR (เหมือนหน้า Dashboard) ================= */}
      <aside className="sidebar">
        <div className="sidebar-logo-wrap">
          <img src="/fittrack-logo.png" alt="FitTrack" className="sidebar-logo" />
          <div className="logo-caption">SMART FITNESS SYSTEM</div>
        </div>

        <nav className="side-menu">
          <button className="side-link" type="button" onClick={() => navigate("/dashboard")}><span className="side-icon">⌂</span>หน้าหลัก</button>
          <button className="side-link active" type="button" onClick={() => navigate("/exercises")}><span className="side-icon side-icon-dumbbell" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 18v12M14 14v20M34 14v20M40 18v12M14 24h20M8 24h6M34 24h6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 18v12M11 14v20M37 14v20M43 18v12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></span>ออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/history")}><span className="side-icon">◷</span>ประวัติการออกกำลังกาย</button>
          <button className="side-link" type="button" onClick={() => navigate("/settings")}><span className="side-icon">⚙</span>ตั้งค่า</button>
        </nav>

        <div className="sidebar-quote">
          “สุขภาพที่ดี<br />เริ่มได้จาก<br />การเลือกในทุกๆ วัน”
          <div className="pulse-line"><i></i><b></b><i></i></div>
        </div>

        <button className="logout-link" type="button" onClick={logout}><span>⇥</span>ออกจากระบบ</button>
      </aside>

      {/* ================= MAIN ================= */}
      <main className="fit-main">
        {/* HEADER */}
        <header className="top-header">
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

          <div className="header-tools">
            <div className="notification-wrap">
              <button
                className="header-icon notification-bell"
                type="button"
                title="การแจ้งเตือน"
                aria-label="เปิดการแจ้งเตือน"
                aria-expanded={notificationsOpen}
                onClick={handleNotifications}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                </svg>
                <span className="notification-dot"></span>
              </button>

              {notificationsOpen && (
                <div className="notification-panel" role="status">
                  <div className="notification-panel-title">
                    <span>การแจ้งเตือน <small>วันนี้</small></span>
                    <button
                      type="button"
                      aria-label="ปิดการแจ้งเตือน"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="notification-item">
                    <span className="notification-avatar dumbbell-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg>
                    </span>
                    <div className="notification-message">
                      <strong>FitTrack <small>· ตอนนี้</small></strong>
                      <span>{calorieNotice}</span>
                      <small>ดูเป้าหมายพลังงานรายวันได้ที่หน้าหลัก</small>
                    </div>
                    <i className="notification-unread" />
                  </div>

                  <div className="notification-item">
                    <span className="notification-avatar dumbbell-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M6 9v6M3.5 10v4M8.5 7v10M15.5 7v10M20.5 10v4M18 9v6M8.5 12h7" /></svg>
                    </span>
                    <div className="notification-message">
                      <strong>FitTrack <small>· วันนี้</small></strong>
                      <span>{exerciseNotice}</span>
                      <small>กดปุ่ม “เลือก” ที่ท่าที่ต้องการเพื่อไปตั้งค่าการฝึก</small>
                    </div>
                    <i className="notification-unread" />
                  </div>
                </div>
              )}
            </div>

            <div className="date-box">
              <strong>{dateLabel}</strong>
              <span>{timeLabel} น.</span>
            </div>

            <button
              className="theme-button"
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
              aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {theme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="fit-content">
          {/* PAGE TITLE */}
          <section className="page-title">
            <div className="title-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div>
              <h1>ออกกำลังกาย</h1>
              <p>เลือกส่วนที่ต้องการฝึก และดูท่าออกกำลังกายที่เหมาะสมกับคุณ</p>
            </div>

            <div className="ai-title">
              <span>ให้ <b>AI</b> เป็นผู้ช่วยของคุณ</span>
              <span>ในการดูแลสุขภาพ</span>
              <div className="mini-heartbeat">
                <svg viewBox="0 0 150 30">
                  <polyline
                    points="0,15 30,15 42,14 51,5 59,25 68,11 80,15 150,15"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
          </section>

          {/* MAIN EXERCISE AREA */}
          <section className="exercise-workspace">
            {/* ================= LEFT BODY ================= */}
            <div className="body-panel">
              <div className="body-visual">
                <div className="body-glow"></div>

                <svg
                  className="human-svg"
                  viewBox="0 0 260 520"
                  aria-label="แผนผังกล้ามเนื้อ"
                >
                  {/* head */}
                  <circle
                    cx="130"
                    cy="50"
                    r="28"
                    className="body-outline"
                  />

                  {/* neck */}
                  <path
                    d="M113 73 L113 95 L130 105 L147 95 L147 73"
                    className="body-shape"
                  />

                  {/* torso */}
                  <path
                    d="
                      M113 90
                      C95 94 82 108 77 129
                      L89 205
                      C94 220 105 230 111 238
                      L105 300
                      L130 315
                      L155 300
                      L149 238
                      C155 230 166 220 171 205
                      L183 129
                      C178 108 165 94 147 90
                      L130 104
                      Z
                    "
                    className="body-shape"
                  />

                  {/* left arm */}
                  <path
                    d="
                      M81 113
                      C68 118 61 133 56 151
                      L42 215
                      C40 226 47 234 56 232
                      C63 230 67 223 69 215
                      L82 170
                    "
                    className="body-shape"
                  />

                  {/* right arm */}
                  <path
                    d="
                      M179 113
                      C192 118 199 133 204 151
                      L218 215
                      C220 226 213 234 204 232
                      C197 230 193 223 191 215
                      L178 170
                    "
                    className="body-shape"
                  />

                  {/* left leg */}
                  <path
                    d="
                      M111 238
                      L106 300
                      L99 390
                      L96 466
                      C95 480 103 488 112 488
                      C121 488 126 480 126 468
                      L130 395
                      L134 315
                      Z
                    "
                    className="body-shape"
                  />

                  {/* right leg */}
                  <path
                    d="
                      M149 238
                      L154 300
                      L161 390
                      L164 466
                      C165 480 157 488 148 488
                      C139 488 134 480 134 468
                      L130 395
                      L126 315
                      Z
                    "
                    className="body-shape"
                  />

                  {/* muscle zones */}
                  <ellipse
                    cx="94"
                    cy="122"
                    rx="19"
                    ry="29"
                    className="muscle green"
                  />

                  <ellipse
                    cx="166"
                    cy="122"
                    rx="19"
                    ry="29"
                    className="muscle green"
                  />

                  <ellipse
                    cx="101"
                    cy="160"
                    rx="12"
                    ry="32"
                    className="muscle purple"
                  />

                  <ellipse
                    cx="159"
                    cy="160"
                    rx="12"
                    ry="32"
                    className="muscle purple"
                  />

                  <path
                    d="M107 115 Q130 105 153 115 L150 175 Q130 190 110 175Z"
                    className="muscle blue"
                  />

                  <ellipse
                    cx="107"
                    cy="260"
                    rx="13"
                    ry="38"
                    className="muscle green"
                  />

                  <ellipse
                    cx="153"
                    cy="260"
                    rx="13"
                    ry="38"
                    className="muscle green"
                  />

                  <ellipse
                    cx="108"
                    cy="350"
                    rx="17"
                    ry="46"
                    className="muscle purple"
                  />

                  <ellipse
                    cx="152"
                    cy="350"
                    rx="17"
                    ry="46"
                    className="muscle purple"
                  />

                  <ellipse
                    cx="107"
                    cy="432"
                    rx="12"
                    ry="30"
                    className="muscle blue"
                  />

                  <ellipse
                    cx="153"
                    cy="432"
                    rx="12"
                    ry="30"
                    className="muscle blue"
                  />
                </svg>
              </div>

              {/* body side menu */}
              <div className="body-part-list">
                {bodyParts.slice(1).map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    className={`body-part ${
                      selectedPart === part.id ? "selected" : ""
                    }`}
                    onClick={() => setSelectedPart(part.id)}
                  >
                    <span className="part-mini">
                      <span></span>
                      <span></span>
                    </span>
                    <span>{part.name}</span>
                  </button>
                ))}
              </div>

              {/* body views */}
              <div className="body-views">
                <button
                  type="button"
                  className="body-view active"
                  onClick={() => setSelectedPart("all")}
                >
                  <div className="tiny-person front"></div>
                  <span>ด้านหน้า</span>
                </button>

                <button
                  type="button"
                  className="body-view"
                  onClick={() => setSelectedPart("back")}
                >
                  <div className="tiny-person back"></div>
                  <span>ด้านหลัง</span>
                </button>

                <button
                  type="button"
                  className="body-view"
                  onClick={() => setSelectedPart("leg")}
                >
                  <div className="tiny-person side"></div>
                  <span>ด้านข้าง</span>
                </button>
              </div>
            </div>

            {/* ================= RIGHT EXERCISES ================= */}
            <div className="exercise-panel">
              <div className="exercise-panel-title">
                <div className="title-person-icon">
                  <svg viewBox="0 0 40 40">
                    <circle cx="20" cy="9" r="5"></circle>
                    <path d="M13 18 Q20 14 27 18 L30 29 M10 22 L30 22 M15 18 L12 31 M25 18 L28 31"></path>
                  </svg>
                </div>

                <div>
                  <h2>
                    ท่าออกกำลังกายสำหรับ :{" "}
                    <span>
                      {selectedPart === "all"
                        ? "ทั้งหมด"
                        : bodyParts.find((p) => p.id === selectedPart)
                            ?.name || "ทั้งหมด"}
                    </span>
                  </h2>
                  <p>ประเภทการออกกำลังกาย</p>
                </div>
              </div>

              {/* equipment toggle */}
              <div className="equipment-toggle">
                <button
                  type="button"
                  className={!useEquipment ? "active" : ""}
                  onClick={() => setUseEquipment(false)}
                >
                  <span className="toggle-icon">♙</span>
                  ไม่มีอุปกรณ์
                </button>

                <button
                  type="button"
                  className={useEquipment ? "active" : ""}
                  onClick={() => setUseEquipment(true)}
                >
                  <span className="toggle-icon">↔</span>
                  ใช้อุปกรณ์
                </button>
              </div>

              <div className="equipment-title">
                เลือกประเภทอุปกรณ์{" "}
                <span>(เมื่อเลือก “ใช้อุปกรณ์”)</span>
              </div>

              <div className="equipment-tabs">
                {equipmentTypes.map((type, index) => (
                  <button
                    key={`${type}-${index}`}
                    type="button"
                    disabled={!useEquipment}
                    className={
                      selectedEquipment === type && useEquipment
                        ? "selected"
                        : type === "ทั้งหมด" && !useEquipment
                        ? "selected"
                        : ""
                    }
                    onClick={() => setSelectedEquipment(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* exercise list */}
              <div className="exercise-list">
                {filteredExercises.length > 0 ? (
                  filteredExercises.map((exercise) => (
                    <article className="exercise-row" key={exercise.id}>
                      <div className="exercise-thumb">
                        <video
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="metadata"
                        >
                          <source
                            src={exercise.video}
                            type="video/mp4"
                          />
                        </video>

                        <span className="thumb-play">▶</span>
                      </div>

                      <div className="exercise-row-info">
                        <h3>{exercise.name}</h3>

                        <div className="exercise-tags">
                          <span>{exercise.thaiName}</span>
                          <span>{exercise.equipment}</span>
                        </div>

                        <div className="exercise-meta">
                          <span>
                            <i>◷</i>
                            {exercise.sets}
                          </span>

                          <span>
                            <i>◉</i>
                            {exercise.reps}
                          </span>

                          <span>
                            <i>♙</i>
                            {exercise.equipment}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="play-button"
                        onClick={() => selectExercise(exercise)}
                        aria-label={`เลือก ${exercise.thaiName}`}
                      >
                        ▶
                      </button>

                      <button
                        type="button"
                        className="choose-button"
                        onClick={() => selectExercise(exercise)}
                      >
                        เลือก
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="empty-exercises">
                    <div>ไม่พบรายการท่าออกกำลังกาย</div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPart("all");
                        setSelectedEquipment("ทั้งหมด");
                        setUseEquipment(false);
                      }}
                    >
                      แสดงทั้งหมด
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ================= BOTTOM ================= */}
          <section className="bottom-grid">
            {/* recommendation */}
            <div className="recommendation-panel">
              <div className="bottom-title">
                <span className="star-icon">★</span>
                <div>
                  <h2>โปรแกรมแนะนำ</h2>
                  <span>(สำหรับผู้เริ่มต้น)</span>
                </div>
              </div>

              <div className="program-card">
                <div className="program-image">
                  <div className="program-person"></div>
                </div>

                <div className="program-info">
                  <h3>โปรแกรมฝึกไหล่</h3>
                  <p>(Dumbbell + Bodyweight)</p>

                  <div className="program-meta">
                    <span>▣ 3-4 วัน/สัปดาห์</span>
                    <span>◷ 45-60 นาที</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => selectExercise(exercises[0])}
                  >
                    ดูรายละเอียด
                  </button>
                </div>

                <div className="program-arrow">›</div>
              </div>
            </div>

            {/* AI */}
            <div className="ai-panel">
              <div className="ai-heading">
                <span className="bulb">♧</span>
                <h2>คำแนะนำจาก AI</h2>
              </div>

              <div className="ai-content">
                <div className="ai-item">
                  <span>➜</span>
                  <p>ควรวอร์มอัพ 5-10 นาที ก่อนเริ่มออกกำลังกาย</p>
                </div>

                <div className="ai-item">
                  <span>♧</span>
                  <p>ควรพักกล้ามเนื้ออย่างน้อย 48 ชม. ก่อนฝึกซ้ำ</p>
                </div>

                <div className="ai-item">
                  <span>◷</span>
                  <p>ดื่มน้ำให้เพียงพอระหว่างการออกกำลังกาย</p>
                </div>

                <div className="ai-item">
                  <span>⌁</span>
                  <p>เลือกน้ำหนักที่เหมาะสมกับระดับของตนเอง</p>
                </div>

                <div className="ai-item">
                  <span>⌁</span>
                  <p>หากมีอาการเจ็บผิดปกติให้หยุดออกกำลังกาย</p>
                </div>
              </div>

              <div className="ai-quote">
                <span>“ก้าวเล็ก ๆ</span>
                <span>ในทุกวัน</span>
                <span>คือการเปลี่ยนแปลง</span>
                <span>ที่ยิ่งใหญ่”</span>

                <svg viewBox="0 0 180 30">
                  <polyline
                    points="0,16 30,16 42,15 51,5 60,25 70,11 82,16 180,16"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
          </section>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
        }

        body {
          background: #020708;
          color: #f5f8f7;
          font-family: "Noto Sans Thai", sans-serif;
          overflow-x: hidden;
        }

        button {
          font-family: inherit;
        }

        button:focus-visible {
          outline: 2px solid #b7ff21;
          outline-offset: 2px;
        }

        /* =====================================================
           PAGE
        ===================================================== */

        .fittrack-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(
              circle at 65% 15%,
              rgba(0, 255, 120, .035),
              transparent 30%
            ),
            radial-gradient(
              circle at 95% 80%,
              rgba(0, 150, 255, .035),
              transparent 25%
            ),
            #020708;
        }

        .fittrack-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              90deg,
              transparent 0,
              rgba(182, 255, 40, .015) 50%,
              transparent 100%
            );
        }




























        /* =====================================================
           MAIN
        ===================================================== */

        .fit-main {
          width: calc(100% - 220px);
          margin-left: 220px;
          min-width: 0;
          padding: 0 19px 35px;
        }

        .top-header {
          height: 100px;
          padding: 0 5px 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #18343b;
        }

        .user-block { display: flex; align-items: center; gap: 12px; }
        .avatar-wrap { position: relative; width: 58px; height: 58px; }
        .avatar-fallback {
          width: 58px; height: 58px; border-radius: 50%;
          display: grid; place-items: center;
          background: radial-gradient(circle at 35% 25%, #4c5053, #101719 60%);
          border: 2px solid #8e9698; color: #fff;
          font-weight: 700; font-size: 20px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, .03);
        }
        .online-dot {
          position: absolute; right: 0; bottom: 0;
          width: 17px; height: 17px; border-radius: 50%;
          background: #6eff35; border: 2px solid #06100c;
        }
        .hello { font-size: 13px; color: #ddd; line-height: 1.1; }
        .user-block strong { font-family: "Kanit", sans-serif; font-size: 22px; line-height: 1.15; font-weight: 700; }

        .header-tools {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-icon,
        .theme-button {
          position: relative;
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #e5ece9;
          cursor: pointer;
          font-size: 25px;
        }

        .notification-dot {
          position: absolute;
          right: 3px;
          top: 3px;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ff304f;
          box-shadow: 0 0 8px rgba(255,48,79,.8);
        }

        .date-box {
          min-width: 105px;
          padding-left: 14px;
          border-left: 1px solid rgba(120, 196, 229, .35);
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .date-box strong,
        .date-box span {
          color: #e9efed;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          font-weight: 400;
        }

        .theme-button {
          margin-left: 2px;
          font-size: 27px;
        }

        /* =====================================================
           CONTENT
        ===================================================== */

        .fit-content {
          width: min(1230px, 100%);
          margin: 0 auto;
        }

        .page-title {
          min-height: 104px;
          padding: 21px 5px 12px;
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
        }

        .title-icon {
          width: 50px;
          height: 50px;
          flex: 0 0 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }

        .title-icon span {
          width: 7px;
          height: 31px;
          border: 2px solid #b7ff21;
          border-radius: 7px;
          box-shadow: 0 0 9px rgba(183,255,33,.7);
        }

        .title-icon span:nth-child(2) {
          height: 21px;
        }

        .page-title h1 {
          margin: 0;
          color: #f3f7f5;
          font-family: "Kanit", sans-serif;
          font-size: 29px;
          line-height: 1;
          font-weight: 500;
        }

        .page-title p {
          margin: 8px 0 0;
          color: #a7b3af;
          font-size: 12px;
        }

        .ai-title {
          margin-left: auto;
          padding-right: 3px;
          position: relative;
          color: #d9d3dd;
          font-family: "Kanit", sans-serif;
          font-size: 11px;
          font-style: italic;
          line-height: 1.5;
          text-align: right;
        }

        .ai-title b {
          color: #c7ff25;
          font-weight: 500;
        }

        .mini-heartbeat {
          width: 150px;
          height: 20px;
          margin-left: auto;
        }

        .mini-heartbeat svg {
          width: 100%;
          height: 100%;
        }

        .mini-heartbeat polyline {
          stroke: #c4ff27;
          stroke-width: 1.4;
          filter: drop-shadow(0 0 3px #b7ff21);
        }

        /* =====================================================
           WORKSPACE
        ===================================================== */

        .exercise-workspace {
          display: grid;
          grid-template-columns: minmax(400px, .88fr) minmax(540px, 1.12fr);
          gap: 12px;
          min-width: 0;
        }

        .body-panel,
        .exercise-panel {
          min-width: 0;
          border: 1px solid #0089c4;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              rgba(4, 16, 19, .96),
              rgba(1, 8, 11, .97)
            );
          box-shadow:
            inset 0 0 35px rgba(0, 152, 255, .025),
            0 0 22px rgba(0, 126, 174, .035);
        }

        /* =====================================================
           BODY PANEL
        ===================================================== */

        .body-panel {
          position: relative;
          min-height: 704px;
          padding: 22px 14px 12px;
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 112px;
          grid-template-rows: 1fr 104px;
          gap: 9px;
        }

        .body-visual {
          position: relative;
          min-width: 0;
          min-height: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
        }

        .body-glow {
          position: absolute;
          width: 320px;
          height: 570px;
          border-radius: 50%;
          background:
            radial-gradient(
              ellipse,
              rgba(0, 183, 255, .09) 0%,
              rgba(105, 255, 47, .035) 30%,
              transparent 68%
            );
          filter: blur(10px);
        }

        .human-svg {
          position: relative;
          z-index: 2;
          width: min(90%, 330px);
          height: 590px;
          overflow: visible;
        }

        .body-outline {
          fill: rgba(9, 28, 39, .9);
          stroke: #76a3c1;
          stroke-width: 2;
          filter: drop-shadow(0 0 5px rgba(70, 179, 255, .35));
        }

        .body-shape {
          fill:
            linear-gradient(
              90deg,
              rgba(18, 60, 84, .9),
              rgba(12, 29, 43, .95)
            );
          stroke: #5c94b9;
          stroke-width: 1.8;
          filter: drop-shadow(0 0 4px rgba(30, 150, 255, .25));
        }

        .muscle {
          stroke-width: 1.2;
          opacity: .9;
          filter: drop-shadow(0 0 5px currentColor);
        }

        .muscle.green {
          fill: rgba(164, 255, 30, .6);
          stroke: #b8ff27;
        }

        .muscle.blue {
          fill: rgba(0, 171, 255, .55);
          stroke: #00d4ff;
        }

        .muscle.purple {
          fill: rgba(151, 51, 255, .48);
          stroke: #b65cff;
        }

        .body-part-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-self: center;
        }

        .body-part {
          min-height: 53px;
          padding: 6px 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #006d9f;
          border-radius: 11px;
          background: rgba(3, 17, 22, .72);
          color: #dce7e5;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          text-align: left;
          transition: .2s ease;
        }

        .body-part:hover {
          border-color: #6db6dd;
          transform: translateX(-2px);
        }

        .body-part.selected {
          color: #efffc7;
          border-color: #b7ff21;
          background:
            linear-gradient(
              90deg,
              rgba(135, 255, 15, .19),
              rgba(20, 69, 28, .16)
            );
          box-shadow:
            inset 0 0 15px rgba(168,255,24,.08),
            0 0 10px rgba(183,255,33,.12);
        }

        .part-mini {
          width: 30px;
          height: 35px;
          position: relative;
          flex: 0 0 30px;
        }

        .part-mini::before {
          content: "";
          position: absolute;
          top: 1px;
          left: 10px;
          width: 10px;
          height: 10px;
          border: 1px solid #8eb0c8;
          border-radius: 50%;
        }

        .part-mini::after {
          content: "";
          position: absolute;
          top: 12px;
          left: 7px;
          width: 16px;
          height: 19px;
          border: 1px solid #8eb0c8;
          border-radius: 45% 45% 30% 30%;
        }

        .part-mini span {
          position: absolute;
          top: 15px;
          width: 7px;
          height: 17px;
          border: 1px solid #8eb0c8;
          border-radius: 5px;
        }

        .part-mini span:first-child {
          left: 1px;
        }

        .part-mini span:last-child {
          right: 1px;
        }

        .body-part.selected .part-mini::before,
        .body-part.selected .part-mini::after,
        .body-part.selected .part-mini span {
          border-color: #b7ff21;
          box-shadow: 0 0 5px rgba(183,255,33,.4);
        }

        .body-views {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
        }

        .body-view {
          border: 1px solid #005f89;
          border-radius: 9px;
          background: rgba(3, 15, 20, .72);
          color: #b9c8c5;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          font-family: "Kanit", sans-serif;
          font-size: 9px;
        }

        .body-view.active {
          color: #eaffc1;
          border-color: #b7ff21;
          box-shadow: inset 0 0 15px rgba(183,255,33,.08);
        }

        .tiny-person {
          position: relative;
          width: 26px;
          height: 59px;
        }

        .tiny-person::before {
          content: "";
          position: absolute;
          top: 0;
          left: 8px;
          width: 10px;
          height: 10px;
          border: 1px solid #6b9fc0;
          border-radius: 50%;
        }

        .tiny-person::after {
          content: "";
          position: absolute;
          top: 11px;
          left: 7px;
          width: 12px;
          height: 28px;
          border: 1px solid #6b9fc0;
          border-radius: 6px;
          box-shadow:
            -6px 12px 0 -5px transparent,
            6px 12px 0 -5px transparent;
        }

        .tiny-person.front {
          filter: drop-shadow(0 0 4px rgba(183,255,33,.4));
        }

        .tiny-person.front::before,
        .tiny-person.front::after {
          border-color: #b7ff21;
        }

        /* =====================================================
           EXERCISE PANEL
        ===================================================== */

        .exercise-panel {
          padding: 15px;
          overflow: hidden;
        }

        .exercise-panel-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 11px;
        }

        .title-person-icon {
          width: 45px;
          height: 45px;
          flex: 0 0 45px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(48, 154, 255, .2),
            transparent 70%
          );
        }

        .title-person-icon svg {
          width: 39px;
          height: 39px;
        }

        .title-person-icon circle,
        .title-person-icon path {
          fill: none;
          stroke: #70c8ff;
          stroke-width: 1.6;
        }

        .exercise-panel-title h2 {
          margin: 0;
          color: #f1f7f4;
          font-family: "Kanit", sans-serif;
          font-size: 20px;
          font-weight: 500;
          line-height: 1.2;
        }

        .exercise-panel-title h2 span {
          color: #c9ff2b;
        }

        .exercise-panel-title p {
          margin: 3px 0 0;
          color: #e7eeeb;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
        }

        .equipment-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .equipment-toggle button {
          min-height: 49px;
          border: 1px solid #117eb4;
          border-radius: 11px;
          background: rgba(3, 19, 25, .78);
          color: #dce8e4;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          transition: .2s ease;
        }

        .equipment-toggle button.active {
          color: #efffcf;
          border-color: #a8ff1e;
          background:
            linear-gradient(
              90deg,
              rgba(131, 255, 14, .22),
              rgba(67, 153, 28, .14)
            );
          box-shadow:
            inset 0 0 17px rgba(183,255,33,.07),
            0 0 9px rgba(183,255,33,.08);
        }

        .toggle-icon {
          margin-right: 9px;
          color: #b7ff21;
          font-size: 19px;
        }

        .equipment-title {
          margin: 10px 0 7px;
          color: #e5ece9;
          font-family: "Kanit", sans-serif;
          font-size: 11px;
        }

        .equipment-title span {
          color: #8b9c99;
        }

        .equipment-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 10px;
        }

        .equipment-tabs button {
          min-width: 73px;
          height: 35px;
          padding: 0 12px;
          border: 1px solid #0877a8;
          border-radius: 18px;
          color: #dce5e2;
          background: rgba(3, 16, 21, .7);
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          transition: .2s ease;
        }

        .equipment-tabs button.selected {
          color: #071006;
          border-color: #b7ff21;
          background: linear-gradient(
            135deg,
            #d4ff31,
            #7cff1c
          );
          box-shadow: 0 0 11px rgba(183,255,33,.25);
        }

        .equipment-tabs button:disabled {
          opacity: .42;
          cursor: default;
        }

        .equipment-tabs button.selected:disabled {
          opacity: .9;
        }

        .exercise-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .exercise-row {
          position: relative;
          min-height: 94px;
          padding: 7px;
          display: grid;
          grid-template-columns: 100px minmax(0, 1fr) 37px 58px;
          gap: 9px;
          align-items: center;
          border: 1px solid #007cae;
          border-radius: 12px;
          background:
            linear-gradient(
              100deg,
              rgba(5, 20, 25, .94),
              rgba(1, 11, 15, .92)
            );
          transition: .2s ease;
        }

        .exercise-row:hover {
          border-color: #2ac0ef;
          box-shadow: 0 0 17px rgba(0, 160, 220, .07);
          transform: translateY(-1px);
        }

        .exercise-thumb {
          position: relative;
          width: 100px;
          height: 78px;
          overflow: hidden;
          border-radius: 9px;
          border: 1px solid #315c6d;
          background: #071114;
        }

        .exercise-thumb video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .thumb-play {
          position: absolute;
          right: 6px;
          bottom: 6px;
          width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #051006;
          background: #b7ff21;
          box-shadow: 0 0 10px rgba(183,255,33,.55);
          font-size: 10px;
        }

        .exercise-row-info {
          min-width: 0;
        }

        .exercise-row-info h3 {
          margin: 0 0 5px;
          color: #f4f8f5;
          font-family: "Kanit", sans-serif;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .exercise-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .exercise-tags span {
          padding: 2px 8px;
          border: 1px solid #39835d;
          border-radius: 12px;
          color: #e3f9d2;
          background: rgba(50, 122, 66, .17);
          font-size: 8px;
        }

        .exercise-tags span + span {
          color: #d0dae0;
          border-color: #1b5774;
          background: rgba(20, 70, 95, .17);
        }

        .exercise-meta {
          display: flex;
          gap: 11px;
          flex-wrap: wrap;
          color: #aebbb8;
          font-size: 8px;
        }

        .exercise-meta span {
          white-space: nowrap;
        }

        .exercise-meta i {
          margin-right: 4px;
          color: #e0e9e5;
          font-style: normal;
        }

        .play-button {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid rgba(183,255,33,.65);
          color: #09200a;
          background: rgba(158, 255, 31, .9);
          cursor: pointer;
          box-shadow: 0 0 11px rgba(183,255,33,.35);
          font-size: 12px;
          transition: .2s ease;
        }

        .play-button:hover {
          transform: scale(1.08);
          box-shadow: 0 0 17px rgba(183,255,33,.55);
        }

        .choose-button {
          height: 30px;
          border: 0;
          border-radius: 16px;
          color: #071207;
          background: linear-gradient(
            135deg,
            #d2ff31,
            #83ff1b
          );
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
          font-weight: 600;
          box-shadow: 0 0 9px rgba(183,255,33,.2);
        }

        .choose-button:hover {
          box-shadow: 0 0 14px rgba(183,255,33,.45);
        }

        .empty-exercises {
          min-height: 220px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 14px;
          border: 1px dashed #147aa1;
          border-radius: 12px;
          color: #91a29e;
          font-size: 12px;
        }

        .empty-exercises button {
          padding: 7px 17px;
          border: 1px solid #9eff1e;
          border-radius: 20px;
          color: #0a1706;
          background: #b7ff21;
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 10px;
        }

        /* =====================================================
           BOTTOM
        ===================================================== */

        .bottom-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
        }

        .recommendation-panel,
        .ai-panel {
          position: relative;
          min-height: 153px;
          padding: 13px 15px;
          border: 1px solid #0089c4;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              rgba(3, 16, 19, .96),
              rgba(1, 8, 11, .96)
            );
          overflow: hidden;
        }

        .recommendation-panel::before,
        .ai-panel::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(
            90deg,
            #b7ff21,
            #00b9ff,
            transparent
          );
        }

        .bottom-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 9px;
        }

        .star-icon {
          color: #d7ff26;
          font-size: 27px;
          text-shadow: 0 0 10px rgba(183,255,33,.65);
        }

        .bottom-title h2 {
          margin: 0;
          color: #edf5f1;
          font-family: "Kanit", sans-serif;
          font-size: 16px;
          font-weight: 500;
          line-height: 1;
        }

        .bottom-title span:not(.star-icon) {
          color: #9ba9a5;
          font-size: 8px;
        }

        .program-card {
          position: relative;
          min-height: 88px;
          padding: 7px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #278a52;
          border-radius: 10px;
          background: rgba(11, 29, 21, .55);
        }

        .program-image {
          width: 91px;
          height: 73px;
          flex: 0 0 91px;
          position: relative;
          overflow: hidden;
          border-radius: 7px;
          background:
            radial-gradient(
              circle at 55% 30%,
              rgba(100, 160, 130, .35),
              transparent 25%
            ),
            linear-gradient(
              135deg,
              #263c34,
              #0a1512
            );
        }

        .program-person {
          position: absolute;
          left: 35px;
          top: 8px;
          width: 21px;
          height: 52px;
          border-radius: 45% 45% 30% 30%;
          background: linear-gradient(
            180deg,
            #bfcac5,
            #394c47
          );
          box-shadow:
            0 0 12px rgba(180,255,220,.12);
        }

        .program-person::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 5px;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #cdd8d3;
        }

        .program-info {
          min-width: 0;
          flex: 1;
        }

        .program-info h3 {
          margin: 0;
          color: #eff8f3;
          font-family: "Kanit", sans-serif;
          font-size: 12px;
          font-weight: 500;
        }

        .program-info p {
          margin: 1px 0 7px;
          color: #9ca9a5;
          font-size: 8px;
        }

        .program-meta {
          display: flex;
          gap: 12px;
          color: #b9c6c1;
          font-size: 7px;
        }

        .program-info button {
          margin-top: 7px;
          min-width: 95px;
          height: 26px;
          padding: 0 13px;
          border: 0;
          border-radius: 14px;
          color: #071206;
          background: linear-gradient(
            135deg,
            #caff2c,
            #75ff19
          );
          cursor: pointer;
          font-family: "Kanit", sans-serif;
          font-size: 9px;
          font-weight: 600;
        }

        .program-arrow {
          width: 27px;
          height: 27px;
          display: grid;
          place-items: center;
          margin-right: 4px;
          border-radius: 50%;
          color: #0b1b08;
          background: #82a4b8;
          font-size: 22px;
        }

        .ai-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 165px;
          gap: 12px;
        }

        .ai-heading {
          grid-column: 1 / -1;
          height: 25px;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .bulb {
          color: #d7ff26;
          font-size: 24px;
          text-shadow: 0 0 10px rgba(183,255,33,.5);
        }

        .ai-heading h2 {
          margin: 0;
          color: #f0f6f2;
          font-family: "Kanit", sans-serif;
          font-size: 16px;
          font-weight: 500;
        }

        .ai-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .ai-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .ai-item > span {
          width: 14px;
          color: #c5ff2c;
          font-size: 12px;
          line-height: 1.4;
        }

        .ai-item p {
          margin: 0;
          color: #bec9c5;
          font-size: 8px;
          line-height: 1.45;
        }

        .ai-quote {
          padding-left: 15px;
          border-left: 1px solid rgba(126, 204, 227, .22);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          color: #d7d0df;
          font-family: "Kanit", sans-serif;
          font-size: 13px;
          font-style: italic;
          line-height: 1.4;
        }

        .ai-quote span:nth-child(3),
        .ai-quote span:nth-child(4) {
          color: #c3bacb;
        }

        .ai-quote svg {
          width: 150px;
          height: 23px;
          margin-top: 6px;
        }

        .ai-quote polyline {
          stroke: #b7ff21;
          stroke-width: 1.3;
          filter: drop-shadow(0 0 4px rgba(183,255,33,.6));
        }

        /* =====================================================
           RESPONSIVE
        ===================================================== */

        @media (max-width: 1150px) {


          .exercise-workspace {
            grid-template-columns: minmax(330px, .8fr) minmax(460px, 1.2fr);
          }

          .body-panel {
            grid-template-columns: minmax(190px, 1fr) 95px;
          }

          .body-part {
            font-size: 10px;
          }

          .exercise-row {
            grid-template-columns: 85px minmax(0, 1fr) 33px 52px;
          }

          .exercise-thumb {
            width: 85px;
            height: 70px;
          }
        }

        @media (max-width: 950px) {










          .exercise-workspace {
            grid-template-columns: 1fr;
          }

          .body-panel {
            min-height: 560px;
          }

          .bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 650px) {
          .top-header { min-height: 70px; height: auto; padding: 10px 2px; }
          .user-block { min-width: 0; gap: 8px; }
          .avatar-wrap, .avatar-fallback { width: 42px; height: 42px; }
          .avatar-fallback { font-size: 16px; }
          .online-dot { width: 12px; height: 12px; }
          .hello { font-size: 11px; }
          .user-block strong { display: block; max-width: 32vw; font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

          .header-tools {
            gap: 4px;
          }

          .date-box {
            display: none;
          }

          .theme-button {
            display: none;
          }

          .page-title {
            align-items: flex-start;
            padding-top: 18px;
          }

          .page-title h1 {
            font-size: 25px;
          }

          .page-title p {
            font-size: 10px;
          }

          .ai-title {
            display: none;
          }

          .body-panel {
            grid-template-columns: 1fr;
            grid-template-rows: 480px auto 90px;
          }

          .body-part-list {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 5px;
          }

          .body-part {
            min-height: 39px;
            justify-content: center;
            padding: 4px;
          }

          .part-mini {
            display: none;
          }

          .body-views {
            grid-row: 3;
          }

          .human-svg {
            height: 455px;
          }

          .exercise-panel {
            padding: 11px;
          }

          .equipment-toggle {
            grid-template-columns: 1fr 1fr;
          }

          .exercise-row {
            grid-template-columns: 72px minmax(0, 1fr) 34px;
          }

          .exercise-thumb {
            width: 72px;
            height: 68px;
          }

          .choose-button {
            display: none;
          }

          .exercise-meta {
            gap: 5px;
          }

          .exercise-meta span:nth-child(3) {
            display: none;
          }

          .ai-panel {
            display: block;
          }

          .ai-heading {
            margin-bottom: 10px;
          }

          .ai-quote {
            display: none;
          }

          .program-meta {
            flex-direction: column;
            gap: 2px;
          }
        }

        @media (max-width: 420px) {



          .body-part-list {
            grid-template-columns: repeat(3, 1fr);
          }

          .exercise-panel-title h2 {
            font-size: 17px;
          }

          .exercise-row-info h3 {
            font-size: 13px;
          }

          .exercise-tags span {
            font-size: 7px;
          }
        }


        /* =====================================================
           SIDEBAR — ชุดเดียวกับหน้า Dashboard (สกัดจากไฟล์ Dashboard โดยตรง)
        ===================================================== */

        :root { --bg:#020609;--panel:#050b0e;--panel2:#081116;--line:#17313a;--green:#8cff32;--green2:#c6ff38;--cyan:#18d8ff;--purple:#b44cff;--text:#f4f7f6;--muted:#93a1a5;--red:#ff476d;--yellow:#ffe735 }
        .sidebar { position:fixed;left:0;top:0;bottom:0;width:220px;background:linear-gradient(180deg,#020707 0%,#03090b 100%);border-right:1px solid #18343b;z-index:20;padding:22px 11px 18px;display:flex;flex-direction:column }
        .sidebar:after { display:none }
        .sidebar-logo-wrap { text-align:center;padding:4px 4px 25px }
        .sidebar-logo { display:block;width:190px;height:112px;object-fit:contain;margin:0 auto }
        .logo-caption { font-size:7px;letter-spacing:2px;color:#c4c8c8;margin-top:-7px }
        .side-menu { display:flex;flex-direction:column;gap:9px }
        .side-link { height:57px;border:1px solid transparent;border-radius:12px;background:transparent;color:#d8dddd;display:flex;align-items:center;gap:15px;padding:0 14px;cursor:pointer;font-size:14px;text-align:left;transition:.2s }
        .side-link:hover { border-color:#35534a;background:rgba(103,255,41,.05) }
        .side-link.active { color:#fff;background:linear-gradient(90deg,rgba(90,255,38,.17),rgba(90,255,38,.04));border-color:#7cff31;box-shadow:0 0 18px rgba(110,255,50,.18),inset 0 0 18px rgba(100,255,40,.05) }
        .side-icon { width:27px;font-size:24px;line-height:1;text-align:center;color:#eef4ef }
        .side-link.active .side-icon { color:var(--green) }
        .sidebar-quote { margin-top:auto;margin-bottom:24px;padding:12px 14px;color:#e9e9e9;font-family:'Kanit';font-size:15px;line-height:1.55;font-style:italic }
        .pulse-line { margin-top:12px;height:23px;position:relative;border-bottom:1px solid #9aff39 }
        .pulse-line:before { content:'';position:absolute;left:0;right:0;top:12px;height:1px;background:#78ff33 }
        .pulse-line i:first-child { position:absolute;left:46px;top:4px;width:2px;height:17px;background:#73ff35;transform:rotate(25deg) }
        .pulse-line b { position:absolute;left:50px;top:2px;width:20px;height:18px;border-bottom:2px solid #73ff35;transform:skew(-25deg) rotate(-12deg) }
        .pulse-line i:last-child { position:absolute;right:26px;top:9px;width:38px;height:1px;background:#c13dff }
        .logout-link { height:54px;border:0;border-top:1px solid #1a3239;background:transparent;color:#ddd;text-align:left;padding:0 14px;cursor:pointer;font-size:14px }
        .logout-link span { font-size:24px;margin-right:12px;color:#dce6e6 }
        @media(max-width:1100px) {
          .sidebar { width:190px }
        }
        @media(max-width:760px) {
          .sidebar { position:relative;width:100%;height:auto;min-height:auto;padding:10px }
          .sidebar:after { display:none }
          .sidebar-logo { width:155px;height:88px }
          .side-menu { display:grid;grid-template-columns:repeat(4,1fr) }
          .side-link { height:48px;padding:0 5px;justify-content:center;flex-direction:column;gap:2px;font-size:9px }
          .side-icon { font-size:18px }
          .sidebar-quote,
        .logout-link { display:none }
        }
        .sidebar { border-right:1px solid #18343b !important; }
        html[data-theme="light"] { color-scheme:light;   --bg:#edf3f1;--panel:#ffffff;--panel2:#f4f8f7;--line:#cfdcd8;   --green:#2a9d16;--green2:#3a9d1a;--text:#12201c;--muted:#5d6e6a; }
        html[data-theme="light"] .sidebar { background:linear-gradient(180deg,#ffffff 0%,#f3f8f6 100%);border-right:1px solid #cfdcd8 !important }
        html[data-theme="light"] .sidebar-logo { filter:invert(1) hue-rotate(180deg);mix-blend-mode:multiply }
        html[data-theme="light"] .side-link { color:#2a3a36 }
        html[data-theme="light"] .side-link:hover { border-color:#9bc59a;background:rgba(60,170,40,.08) }
        html[data-theme="light"] .side-link.active { color:#12201c;background:linear-gradient(90deg,rgba(90,215,38,.2),rgba(90,215,38,.05));border-color:#4fb82b;box-shadow:0 0 14px rgba(80,200,40,.16) }
        html[data-theme="light"] .side-icon { color:#33433f }
        html[data-theme="light"] .side-link.active .side-icon { color:#2a9d16 }
        html[data-theme="light"] .sidebar-quote { color:#2a3a36 }
        html[data-theme="light"] .pulse-line { border-bottom-color:#4fb82b }
        html[data-theme="light"] .logout-link { color:#33433f;border-top-color:#d5e1dd }
        html[data-theme="light"] .logout-link span { color:#33433f }
        @keyframes fittrack-logo-glow { 0%, 100% {     filter: drop-shadow(0 0 2px rgba(140,255,50,.16)) brightness(1);   }   50% {     filter: drop-shadow(0 0 5px rgba(160,255,65,.38)) drop-shadow(0 0 10px rgba(140,255,50,.18)) brightness(1.06);   } }
        .sidebar-logo { animation: fittrack-logo-glow 3.4s ease-in-out infinite !important;   will-change: filter; }
        @media (prefers-reduced-motion: reduce) {
          .sidebar-logo { animation-duration: 8s !important; }
        }
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
        html[data-theme="light"] .sidebar { background: linear-gradient(180deg, #ffffff 0%, #f0f7f3 100%) !important;   border-right: 1px solid #c5d9ce !important;   box-shadow: 5px 0 22px rgba(26, 74, 49, .045); }
        html[data-theme="light"] .side-link.active { background:linear-gradient(90deg,#e1f6d9,#f3fbef); border-color:#7fbd65; color:#1b4b1b; box-shadow:inset 3px 0 #55ad32; }
        @media (max-width: 760px) {
          .sidebar { width:100%; min-width:0; padding:8px 7px 9px; }
          .sidebar-logo-wrap { padding:0 2px 8px; }
          .sidebar-logo { width:132px; height:68px; max-width:42vw; }
          .logo-caption { margin-top:-5px; font-size:6px; letter-spacing:1.5px; }
          .side-menu { width:100%; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
          .side-link { width:100%; min-width:0; height:54px; padding:5px 2px; gap:3px; font-size:clamp(8px,2.25vw,10px); line-height:1.15; white-space:normal; overflow-wrap:anywhere; }
          .side-icon { width:auto; min-height:19px; font-size:19px; line-height:1; }
        }
        @media (max-width: 340px) {
          .side-link { font-size:7.5px; }
        }
        @media (max-width: 760px) and (orientation: landscape) {
          .sidebar-logo-wrap { display:none; }
          .sidebar { padding:5px 7px; }
          .side-link { height:44px; flex-direction:row; font-size:9px; }
        }
        .side-icon-dumbbell { display:inline-flex; align-items:center; justify-content:center; flex:0 0 27px; }
        .side-icon-dumbbell svg { display:block; width:25px; height:25px; }
        @media (max-width:760px) {
          .side-icon-dumbbell { flex:0 0 auto; min-height:19px; }
          .side-icon-dumbbell svg { width:19px; height:19px; }
        }

        @media (max-width: 1100px) {
          .fit-main { width: calc(100% - 190px); margin-left: 190px; }
        }

        @media (max-width: 760px) {
          .fittrack-page { display: block; }
          .fit-main { width: 100%; margin-left: 0; padding: 0 12px 25px; }
        }

        /* =====================================================
           NOTIFICATIONS (เหมือนหน้า Dashboard) + THEME
        ===================================================== */

        .notification-wrap {
          position: relative;
        }

        .notification-wrap .notification-bell {
          padding: 5px;
          transition: color .2s ease, transform .2s ease;
        }

        .notification-wrap .notification-bell svg {
          width: 23px;
          height: 23px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .notification-wrap .notification-bell:hover {
          transform: translateY(-2px) scale(1.06);
          color: #b7ff21;
        }

        .notification-wrap .notification-panel {
          position: fixed;
          z-index: 9999;
          top: 88px;
          right: 24px;
          width: min(370px, calc(100vw - 28px));
          max-height: calc(100vh - 110px);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .notification-panel-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2px 4px;
          color: #82918b;
          font-size: 12px;
        }

        .notification-panel-title > span {
          display: flex;
          align-items: baseline;
          gap: 7px;
        }

        .notification-panel-title > span > small {
          font-size: 10px;
          opacity: .75;
        }

        .notification-panel-title button {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: inherit;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }

        .notification-panel-title button:hover {
          background: rgba(130, 150, 140, .18);
        }

        .notification-item {
          position: relative;
          width: 100%;
          min-height: 76px;
          padding: 13px 14px;
          display: flex;
          align-items: flex-start;
          gap: 11px;
          text-align: left;
          border: 1px solid rgba(150, 175, 162, .24);
          border-radius: 14px;
          background: rgba(13, 27, 24, .97);
          color: #f5faf6;
          box-shadow: 0 8px 26px rgba(0, 0, 0, .24), 0 2px 7px rgba(0, 0, 0, .12);
          animation: notif-enter .42s cubic-bezier(.2, .8, .2, 1) both;
          transition: transform .2s ease, background .2s ease;
        }

        .notification-item:nth-of-type(2) { animation-delay: .1s; }
        .notification-item:nth-of-type(3) { animation-delay: .2s; }

        .notification-item:hover {
          transform: translateX(-3px);
        }

        .notification-avatar {
          flex: 0 0 38px;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #9ff05b;
          background: linear-gradient(145deg, #244d37, #142c22);
        }

        .notification-avatar svg {
          width: 21px;
          height: 21px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .notification-message {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }

        .notification-message strong {
          color: #f4faf5;
          font-size: 12px;
        }

        .notification-message strong small {
          color: #a7b8ad;
          font-size: 10px;
          font-weight: 400;
        }

        .notification-message span {
          color: #eef5f0;
          font-size: 12px;
          line-height: 1.5;
        }

        .notification-message > small {
          color: #aab9b0;
          font-size: 10px;
          line-height: 1.45;
        }

        .notification-unread {
          flex: 0 0 7px;
          width: 7px;
          height: 7px;
          margin: 7px 1px 0 0;
          border-radius: 50%;
          background: #4eaeef;
          box-shadow: 0 0 0 3px rgba(78, 174, 239, .12);
        }

        @keyframes notif-enter {
          from { opacity: 0; transform: translateY(-8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 600px) {
          .notification-wrap .notification-panel {
            top: 76px;
            right: 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .notification-item { animation: none; transition: none; }
        }

        html.theme-anim *,
        html.theme-anim *::before,
        html.theme-anim *::after {
          transition: background-color .3s ease, border-color .3s ease, color .3s ease !important;
        }

        html[data-theme="dark"] { color-scheme: dark; }

        /* ===================== LIGHT THEME =====================
           ใช้เมื่อ <html data-theme="light"> (ปุ่มดวงอาทิตย์/พระจันทร์ที่ header)
           โหมดมืดคือสไตล์เดิมทั้งหมด ไม่ถูกแก้ไข */

        html[data-theme="light"] { color-scheme: light; }

        html[data-theme="light"] body {
          background: #edf3f1;
          color: #12201c;
        }

        html[data-theme="light"] .fittrack-page {
          background:
            radial-gradient(circle at 65% 15%, rgba(60, 200, 100, .12), transparent 30%),
            radial-gradient(circle at 95% 80%, rgba(0, 150, 255, .07), transparent 25%),
            #edf3f1;
        }

        html[data-theme="light"] .fittrack-page::before { display: none; }


        /* header */
        html[data-theme="light"] .top-header { background: rgba(255,255,255,.82); border-bottom-color: #d2e2d9; }
        html[data-theme="light"] .online-dot { border-color: #edf3f1; }
        html[data-theme="light"] .hello { color: #4a5b57; }
        html[data-theme="light"] .user-block strong { color: #172923; }
        html[data-theme="light"] .header-icon,
        html[data-theme="light"] .theme-button { color: #1f2d29; }
        html[data-theme="light"] .notification-wrap .notification-bell:hover,
        html[data-theme="light"] .theme-button:hover { color: #278b20; }
        html[data-theme="light"] .date-box { border-left-color: #c9d7d3; }
        html[data-theme="light"] .date-box strong,
        html[data-theme="light"] .date-box span { color: #3a4a46; }

        /* หัวข้อหน้า */
        html[data-theme="light"] .title-icon span { border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .page-title h1 { color: #12201c; }
        html[data-theme="light"] .page-title p { color: #5d6e6a; }
        html[data-theme="light"] .ai-title { color: #4a5b57; }
        html[data-theme="light"] .ai-title b { color: #2a8a14; }
        html[data-theme="light"] .mini-heartbeat polyline { stroke: #4fb82b; }

        /* แผงการ์ด */
        html[data-theme="light"] .body-panel,
        html[data-theme="light"] .exercise-panel,
        html[data-theme="light"] .recommendation-panel,
        html[data-theme="light"] .ai-panel {
          border-color: #8cc7de;
          background: linear-gradient(145deg, #ffffff, #f4f9f8);
          box-shadow: 0 8px 24px rgba(20, 60, 50, .08);
        }

        /* รูปร่างและส่วนของร่างกาย */
        html[data-theme="light"] .body-outline { fill: #e3eef4; stroke: #7a9fb8; }
        html[data-theme="light"] .body-shape { fill: #d5e4ec; stroke: #6d95b0; }
        html[data-theme="light"] .body-part {
          border-color: #9ccbe0;
          background: #ffffff;
          color: #2a3a36;
        }
        html[data-theme="light"] .body-part:hover { border-color: #4aa5cf; }
        html[data-theme="light"] .body-part.selected {
          color: #12341a;
          border-color: #4fb82b;
          background: linear-gradient(90deg, rgba(110, 215, 40, .2), rgba(110, 215, 40, .05));
          box-shadow: none;
        }
        html[data-theme="light"] .part-mini::before,
        html[data-theme="light"] .part-mini::after,
        html[data-theme="light"] .part-mini span { border-color: #6d8ea6; }
        html[data-theme="light"] .body-part.selected .part-mini::before,
        html[data-theme="light"] .body-part.selected .part-mini { border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .body-view { border-color: #9ccbe0; background: #ffffff; color: #4a5b57; }
        html[data-theme="light"] .body-view.active { color: #12341a; border-color: #4fb82b; box-shadow: none; }
        html[data-theme="light"] .tiny-person::before,
        html[data-theme="light"] .tiny-person::after { border-color: #6d8ea6; }
        html[data-theme="light"] .tiny-person.front::before,
        html[data-theme="light"] .tiny-person.front::after { border-color: #4fb82b; }

        /* แผงท่าออกกำลังกาย */
        html[data-theme="light"] .title-person-icon circle,
        html[data-theme="light"] .title-person-icon path { stroke: #2a8fcf; }
        html[data-theme="light"] .exercise-panel-title h2 { color: #12201c; }
        html[data-theme="light"] .exercise-panel-title h2 span { color: #2f8a10; }
        html[data-theme="light"] .exercise-panel-title p { color: #3a4a46; }
        html[data-theme="light"] .equipment-toggle button { border-color: #8cc7de; background: #ffffff; color: #2a3a36; }
        html[data-theme="light"] .equipment-toggle button.active {
          color: #12341a;
          border-color: #4fb82b;
          background: linear-gradient(90deg, rgba(110, 215, 40, .22), rgba(110, 215, 40, .06));
          box-shadow: none;
        }
        html[data-theme="light"] .toggle-icon { color: #2a9d16; }
        html[data-theme="light"] .equipment-title { color: #33433f; }
        html[data-theme="light"] .equipment-title span { color: #667773; }
        html[data-theme="light"] .equipment-tabs button { border-color: #9ccbe0; color: #3a4a46; background: #ffffff; }
        html[data-theme="light"] .equipment-tabs button.selected { color: #071006; border-color: #8bcf58; box-shadow: none; }
        html[data-theme="light"] .exercise-row {
          border-color: #9ccbe0;
          background: linear-gradient(100deg, #ffffff, #f4f9f8);
        }
        html[data-theme="light"] .exercise-row:hover { border-color: #2ac0ef; box-shadow: 0 4px 14px rgba(0, 120, 180, .1); }
        html[data-theme="light"] .exercise-thumb { border-color: #c3d2ce; background: #e8efed; }
        html[data-theme="light"] .exercise-row-info h3 { color: #12201c; }
        html[data-theme="light"] .exercise-tags span { border-color: #9ccb6b; color: #3f7a15; background: #e9f6df; }
        html[data-theme="light"] .exercise-tags span + span { border-color: #a9cfe0; color: #2f5f78; background: #e8f3f9; }
        html[data-theme="light"] .exercise-meta { color: #5d6e6a; }
        html[data-theme="light"] .exercise-meta i { color: #33433f; }
        html[data-theme="light"] .empty-exercises { border-color: #8cc7de; color: #667773; }

        /* โปรแกรมแนะนำ / AI */
        html[data-theme="light"] .star-icon,
        html[data-theme="light"] .bulb { color: #7aa800; }
        html[data-theme="light"] .bottom-title h2 { color: #12201c; }
        html[data-theme="light"] .bottom-title span:not(.star-icon) { color: #667773; }
        html[data-theme="light"] .program-card { border-color: #9ccb6b; background: #f4fbef; }
        html[data-theme="light"] .program-image { background: #e8f1ed; }
        html[data-theme="light"] .program-info h3 { color: #12201c; }
        html[data-theme="light"] .program-info p { color: #5d6e6a; }
        html[data-theme="light"] .program-meta { color: #4a5b57; }
        html[data-theme="light"] .ai-heading h2 { color: #12201c; }
        html[data-theme="light"] .ai-item > span { color: #2f8a10; }
        html[data-theme="light"] .ai-item p { color: #4a5b57; }
        html[data-theme="light"] .ai-quote { color: #4a5b57; border-left-color: rgba(0, 90, 130, .25); }
        html[data-theme="light"] .ai-quote span:nth-child(3),
        html[data-theme="light"] .ai-quote span:nth-child(4) { color: #667773; }
        html[data-theme="light"] .ai-quote polyline { stroke: #4fb82b; }

        /* การ์ดแจ้งเตือนโหมดสว่าง */
        html[data-theme="light"] .notification-panel-title { color: #5c7065; }
        html[data-theme="light"] .notification-item {
          background: rgba(255, 255, 255, .98);
          border-color: #dce9e0;
          color: #24372e;
          box-shadow: 0 8px 26px rgba(30, 65, 45, .14), 0 2px 7px rgba(30, 65, 45, .07);
        }
        html[data-theme="light"] .notification-item:hover { background: #f9fffb; }
        html[data-theme="light"] .notification-avatar {
          color: #278b43;
          background: linear-gradient(145deg, #dff4e5, #c5e9d1);
        }
        html[data-theme="light"] .notification-message strong { color: #263d32; }
        html[data-theme="light"] .notification-message strong small,
        html[data-theme="light"] .notification-message > small { color: #6e8276; }
        html[data-theme="light"] .notification-message span { color: #2e4438; }
      `}</style>
    </div>
  );
}