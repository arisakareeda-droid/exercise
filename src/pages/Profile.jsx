import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/login");
        return;
      }

      setUser(currentUser);
      setEmail(currentUser.email || "");

      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || "");
          setCreatedAt(data.createdAt);
        }
      } catch (err) {
        console.error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      setIsError(true);
      setMessage("กรุณากรอกชื่อ");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await updateDoc(doc(db, "users", user.uid), { name: name.trim() });
      setEditing(false);
      setIsError(false);
      setMessage("บันทึกข้อมูลเรียบร้อยแล้ว");
    } catch (err) {
      console.error("บันทึกข้อมูลไม่สำเร็จ:", err);
      setIsError(true);
      setMessage("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return "-";
    return timestamp.toDate().toLocaleDateString("th-TH", { dateStyle: "long" });
  };

  const initial = (name || email || "?").charAt(0).toUpperCase();

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
          <button className="side-nav" onClick={() => navigate("/dashboard")}>
            <span>⌂</span><b>หน้าหลัก</b>
          </button>
          <button className="side-nav" onClick={() => navigate("/exercises")}>
            <span>✦</span><b>ออกกำลังกาย</b>
          </button>
          <button className="side-nav" onClick={() => navigate("/history")}>
            <span>◷</span><b>ประวัติการใช้งาน</b>
          </button>
        </nav>

        <button className="side-logout" type="button" onClick={handleLogout}>
          <span>↪</span> ออกจากระบบ
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-copy">
            <div className="logo">FITTRACK</div>
            <h1>โปรไฟล์ของฉัน</h1>
            <p>จัดการข้อมูลบัญชีและข้อมูลส่วนตัวของคุณ</p>
          </div>

          <div className="header-actions">
            <button
              className="profile-pill active"
              onClick={() => navigate("/dashboard")}
              title="กลับหน้าหลัก"
            >
              <span className="profile-chevron back">‹</span>
              <span className="profile-name">กลับหน้าหลัก</span>
            </button>
          </div>
        </header>

        <div className="profile-content">
          <section className="panel profile-panel">
            <div className="panel-heading">
              <div className="panel-icon blue">♡</div>
              <div>
                <h2>ข้อมูลบัญชี</h2>
                <span>ข้อมูลส่วนตัวของคุณ</span>
              </div>
            </div>

            {loading ? (
              <p className="profile-loading">กำลังโหลดข้อมูล...</p>
            ) : (
              <>
                <div className="profile-hero">
                  <div className="profile-big-avatar">{initial}</div>
                  <div>
                    <strong>{name || "ยังไม่ได้ตั้งชื่อ"}</strong>
                    <span>{email}</span>
                  </div>
                </div>

                <div className="profile-fields">
                  <div className="compact-field">
                    <label>ชื่อ</label>
                    {editing ? (
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="กรอกชื่อของคุณ"
                        autoFocus
                      />
                    ) : (
                      <p className="field-value">{name || "-"}</p>
                    )}
                  </div>

                  <div className="compact-field">
                    <label>อีเมล</label>
                    <p className="field-value">{email || "-"}</p>
                  </div>

                  <div className="compact-field">
                    <label>สมัครสมาชิกเมื่อ</label>
                    <p className="field-value">{formatDate(createdAt)}</p>
                  </div>
                </div>

                {message && (
                  <p className={`profile-message ${isError ? "error" : "success"}`}>
                    {message}
                  </p>
                )}

                <div className="profile-actions">
                  {editing ? (
                    <>
                      <button
                        className="ghost-btn"
                        onClick={() => {
                          setEditing(false);
                          setMessage("");
                        }}
                        disabled={saving}
                      >
                        ยกเลิก
                      </button>
                      <button className="primary-btn" onClick={handleSave} disabled={saving}>
                        {saving ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary-btn"
                      onClick={() => {
                        setEditing(true);
                        setMessage("");
                      }}
                    >
                      แก้ไขชื่อ
                    </button>
                  )}
                </div>

                <button className="danger-btn" onClick={handleLogout}>
                  ออกจากระบบ
                </button>
              </>
            )}
          </section>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Anuphan:wght@400;500;600;700&display=swap');

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
          font-family: "Anuphan", sans-serif;
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
          font-family: "Anuphan", sans-serif;
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
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: #fff;
          background: linear-gradient(145deg, #5b9cf6, #1769dc);
          box-shadow: 0 9px 20px rgba(24,119,242,.22);
        }

        .brand-name {
          color: #123c78;
          font-family: "Kanit", sans-serif;
          font-size: 22px;
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: -.15px;
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
          font-size: 13.5px;
          letter-spacing: .05px;
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

        .side-nav:hover {
          color: #1558a9;
          background: #e7f1ff;
          transform: translateX(2px);
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

        .side-logout:hover { color: #1558a9; }

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

        .dashboard-header {
          min-height: 122px;
          padding: 25px 10px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #dfe9f4;
        }

        .header-copy { text-align: center; }

        .logo {
          margin-bottom: 2px;
          color: #2b7eea;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .dashboard-header h1 {
          margin: 0;
          font-family: "Kanit", sans-serif;
          font-size: clamp(31px, 3.5vw, 43px);
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -.35px;
          color: #11396f;
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
          0%, 65%, 100% { background-position: 0% 50%; }
          78% { background-position: 100% 50%; }
        }

        .dashboard-header p {
          margin: 5px 0 0;
          color: #68809f;
          font-size: 14px;
          line-height: 1.5;
          letter-spacing: .15px;
        }

        .header-actions {
          position: absolute;
          right: 0;
          top: 33px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .profile-pill {
          min-height: 43px;
          padding: 4px 16px 4px 12px;
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
          will-change: transform;
        }

        .profile-pill:hover {
          transform: translateY(-2px);
          border-color: #a9c9ee;
          box-shadow: 0 11px 24px rgba(24,119,242,.13);
        }

        .profile-pill:active { transform: translateY(1px) scale(.98); }

        .profile-name {
          font-size: 11px;
          font-weight: 600;
        }

        .profile-chevron {
          color: #6d8aab;
          font-size: 19px;
          line-height: 1;
        }

        /* ---------- CONTENT ---------- */

        .profile-content {
          max-width: 620px;
          margin: 0 auto;
          padding-top: 20px;
        }

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

        .panel-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          margin-bottom: 16px;
        }

        .panel-icon {
          position: relative;
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

        .panel-heading h2 {
          margin: 0;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: -.15px;
          white-space: nowrap;
        }

        .panel-heading span {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 10.5px;
          line-height: 1.4;
        }

        .profile-loading {
          margin: 30px 0;
          text-align: center;
          color: #8095ad;
          font-size: 13px;
        }

        .profile-hero {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 0 20px;
          border-top: 1px solid #e4ecf5;
        }

        .profile-big-avatar {
          width: 72px;
          height: 72px;
          flex: 0 0 72px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: #fff;
          font-family: "Kanit", sans-serif;
          font-size: 30px;
          font-weight: 600;
          background: linear-gradient(145deg, #4f99f6, #1769dc);
          box-shadow: 0 10px 22px rgba(24,119,242,.22);
        }

        .profile-hero strong {
          display: block;
          color: #153d78;
          font-family: "Kanit", sans-serif;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          word-break: break-word;
        }

        .profile-hero span {
          display: block;
          margin-top: 2px;
          color: #8095ad;
          font-size: 12px;
          word-break: break-all;
        }

        .profile-fields {
          display: grid;
          gap: 14px;
          padding: 18px 0;
          border-top: 1px solid #e4ecf5;
        }

        .compact-field label {
          display: block;
          margin-bottom: 4px;
          color: #6d8199;
          font-size: 11px;
          font-weight: 600;
        }

        .compact-field input {
          width: 100%;
          height: 40px;
          padding: 7px 12px;
          outline: none;
          border: 1px solid #d6e2ee;
          border-radius: 9px;
          color: #173b73;
          background: #fff;
          font-size: 13px;
          transition: .2s ease;
        }

        .compact-field input:focus {
          border-color: #1877f2;
          box-shadow: 0 0 0 3px rgba(24,119,242,.08);
        }

        .field-value {
          min-height: 40px;
          margin: 0;
          padding: 0 12px;
          display: flex;
          align-items: center;
          border: 1px solid #e4ecf5;
          border-radius: 9px;
          color: #173b73;
          background: #f6faff;
          font-size: 13px;
          word-break: break-all;
        }

        .profile-message {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: 9px;
          font-size: 12px;
        }

        .profile-message.success {
          color: #0f7a4a;
          background: #e8f8f0;
          border: 1px solid #c4ecd8;
        }

        .profile-message.error {
          color: #b42323;
          background: #fff0f0;
          border: 1px solid #ffd0d0;
        }

        .profile-actions {
          display: flex;
          gap: 10px;
          margin-bottom: 12px;
        }

        .primary-btn,
        .ghost-btn,
        .danger-btn {
          height: 40px;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          transition: .2s ease;
          will-change: transform;
        }

        .primary-btn {
          flex: 1;
          border: 0;
          color: #fff;
          background: linear-gradient(135deg, #1877f2, #0d5dcc);
          box-shadow: 0 7px 15px rgba(24,119,242,.18);
        }

        .primary-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(24,119,242,.25);
        }

        .ghost-btn {
          flex: 1;
          border: 1px solid #d8e7f8;
          color: #3775ba;
          background: #f3f8ff;
        }

        .ghost-btn:hover:not(:disabled) {
          color: #fff;
          background: #1877f2;
          border-color: #1877f2;
        }

        .danger-btn {
          width: 100%;
          border: 1px solid #f5c2c2;
          color: #d64545;
          background: #fff;
        }

        .danger-btn:hover {
          color: #fff;
          background: #e25555;
          border-color: #e25555;
        }

        .primary-btn:active,
        .ghost-btn:active,
        .danger-btn:active { transform: translateY(1px) scale(.98); }

        .primary-btn:disabled,
        .ghost-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        /* ---------- RESPONSIVE ---------- */

        @media (max-width: 1050px) {
          .dashboard-sidebar { width: 200px; }
          .dashboard-main {
            width: calc(100% - 200px);
            margin-left: 200px;
            padding: 0 20px 30px;
          }
        }

        @media (max-width: 760px) {
          .dashboard-page { display: block; }

          .dashboard-sidebar {
            position: static;
            width: 100%;
            height: auto;
            padding: 12px;
            display: block;
          }

          .brand-block { padding: 4px 8px 12px; }
          .sidebar-nav { flex-direction: row; }

          .side-nav {
            justify-content: center;
            min-height: 43px;
            padding: 0 8px;
          }

          .side-nav span { display: none; }
          .side-logout { display: none; }

          .dashboard-main {
            width: 100%;
            margin-left: 0;
            padding: 0 12px 25px;
          }

          .dashboard-header {
            min-height: 125px;
            padding: 17px 65px 17px 8px;
          }

          .dashboard-header h1 { font-size: 28px; }

          .header-actions {
            right: 0;
            top: 21px;
          }

          .profile-name { display: none; }
          .profile-pill { padding: 4px 14px; }
        }

        @media (max-width: 460px) {
          .dashboard-header h1 { font-size: 24px; }
          .dashboard-header p { font-size: 10px; }

          .panel {
            padding: 16px;
            border-radius: 15px;
          }

          .panel-heading h2 { font-size: 16px; }
        }
      `}</style>
    </div>
  );
}
