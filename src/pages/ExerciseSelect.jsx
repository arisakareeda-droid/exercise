import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const exercises = [
    {
      id: 'squat',
      icon: '🏋️',
      name: 'Squat',
      thaiName: 'สควอท',
      video: '/squats.mp4',
      description: 'บริหารกล้ามเนื้อต้นขา สะโพก และแกนกลางลำตัว',
      color: '#22c55e',
      shadow: 'rgba(34, 197, 94, 0.25)',
    },
    {
      id: 'jumping_jack',
      icon: '🤸',
      name: 'Jumping Jack',
      thaiName: 'กระโดดตบ',
      video: '/jumping_jack.mp4',
      description: 'เพิ่มอัตราการเต้นของหัวใจและช่วยเผาผลาญพลังงาน',
      color: '#3b82f6',
      shadow: 'rgba(59, 130, 246, 0.25)',
    },
  ];

  return (
    <div style={styles.page}>
      {/* Background Decoration */}
      <div style={styles.bgCircle1}></div>
      <div style={styles.bgCircle2}></div>

      {/* Header */}
      <header style={styles.header}>
        <div
          style={styles.logo}
          onClick={() => navigate('/dashboard')}
        >
          FIT<span>TRACK</span>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          style={styles.backButton}
        >
          ← กลับหน้าหลัก
        </button>
      </header>

      {/* Main Content */}
      <main style={styles.container}>
        <div style={styles.titleSection}>
          <div style={styles.titleIcon}>💪</div>

          <h1 style={styles.title}>
            เลือกท่าออกกำลังกาย
          </h1>

          <p style={styles.subtitle}>
            เลือกท่าที่ต้องการเพื่อเริ่มการออกกำลังกาย
            <br />
            ระบบจะใช้ AI ตรวจจับท่าทางและนับจำนวนครั้งให้คุณ
          </p>
        </div>

        {/* Exercise Cards */}
        <div style={styles.grid}>
          {exercises.map((exercise) => (
            <div
              key={exercise.id}
              style={{
                ...styles.card,
                '--card-color': exercise.color,
              }}
            >
              {/* Card Header */}
              <div style={styles.cardHeader}>
                <div
                  style={{
                    ...styles.exerciseIcon,
                    background: `${exercise.color}18`,
                    borderColor: `${exercise.color}45`,
                  }}
                >
                  {exercise.icon}
                </div>

                <div style={styles.exerciseTitle}>
                  <h2 style={styles.exerciseName}>
                    {exercise.name}
                  </h2>
                  <span
                    style={{
                      ...styles.thaiName,
                      color: exercise.color,
                    }}
                  >
                    {exercise.thaiName}
                  </span>
                </div>
              </div>

              {/* Video */}
              <div
                style={{
                  ...styles.videoWrapper,
                  boxShadow: `0 15px 35px ${exercise.shadow}`,
                }}
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={styles.video}
                >
                  <source
                    src={exercise.video}
                    type="video/mp4"
                  />
                  Your browser does not support the video tag.
                </video>

                <div style={styles.videoOverlay}>
                  <span>AI Exercise</span>
                </div>
              </div>

              {/* Description */}
              <p style={styles.description}>
                {exercise.description}
              </p>

              {/* AI Status */}
              <div style={styles.aiStatus}>
                <span
                  style={{
                    ...styles.statusDot,
                    background: exercise.color,
                    boxShadow: `0 0 8px ${exercise.color}`,
                  }}
                ></span>

                <span>รองรับการตรวจจับท่าทางด้วย AI</span>
              </div>

              {/* Button */}
              <button
                onClick={() =>
                  navigate(
                    `/settings?exercise=${exercise.id}`
                  )
                }
                style={{
                  ...styles.selectButton,
                  background: exercise.color,
                  boxShadow: `0 8px 20px ${exercise.shadow}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(-2px)';
                  e.currentTarget.style.boxShadow =
                    `0 12px 25px ${exercise.shadow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform =
                    'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    `0 8px 20px ${exercise.shadow}`;
                }}
              >
                <span>เลือกท่านี้</span>
                <span style={styles.arrow}>→</span>
              </button>
            </div>
          ))}
        </div>

        {/* Bottom Information */}
        <div style={styles.infoBox}>
          <div style={styles.infoIcon}>🤖</div>

          <div>
            <h3 style={styles.infoTitle}>
              ระบบตรวจจับการออกกำลังกายด้วย AI
            </h3>

            <p style={styles.infoText}>
              FitTrack ใช้เทคโนโลยี AI
              ในการตรวจจับท่าทางผ่านกล้อง
              พร้อมนับจำนวนครั้งของการออกกำลังกายโดยอัตโนมัติ
            </p>
          </div>
        </div>
      </main>

      {/* CSS */}
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #080b0f;
        }

        button {
          font-family: inherit;
        }

        @media (max-width: 700px) {
          .fittrack-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at top left, #14251d 0%, #080b0f 40%, #080b0f 100%)',
    color: '#fff',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },

  bgCircle1: {
    position: 'fixed',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background:
      'radial-gradient(circle, rgba(34,197,94,0.08), transparent 70%)',
    top: '-180px',
    left: '-150px',
    pointerEvents: 'none',
  },

  bgCircle2: {
    position: 'fixed',
    width: '450px',
    height: '450px',
    borderRadius: '50%',
    background:
      'radial-gradient(circle, rgba(59,130,246,0.06), transparent 70%)',
    bottom: '-200px',
    right: '-180px',
    pointerEvents: 'none',
  },

  header: {
    height: '76px',
    padding: '0 6%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(8,11,15,0.75)',
    backdropFilter: 'blur(15px)',
    position: 'relative',
    zIndex: 10,
  },

  logo: {
    fontSize: '25px',
    fontWeight: '900',
    letterSpacing: '2px',
    cursor: 'pointer',
  },

  backButton: {
    background: 'rgba(255,255,255,0.06)',
    color: '#d1d5db',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: '0.2s',
  },

  container: {
    width: '100%',
    maxWidth: '1050px',
    margin: '0 auto',
    padding: '55px 25px 60px',
    position: 'relative',
    zIndex: 2,
  },

  titleSection: {
    textAlign: 'center',
    marginBottom: '45px',
  },

  titleIcon: {
    width: '58px',
    height: '58px',
    margin: '0 auto 18px',
    borderRadius: '18px',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
  },

  title: {
    margin: '0',
    fontSize: 'clamp(28px, 4vw, 38px)',
    fontWeight: '800',
    letterSpacing: '-0.5px',
  },

  subtitle: {
    marginTop: '14px',
    color: '#9ca3af',
    fontSize: '15px',
    lineHeight: 1.8,
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '25px',
  },

  card: {
    background:
      'linear-gradient(145deg, rgba(30,35,40,0.95), rgba(18,22,26,0.95))',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '22px',
    padding: '22px',
    transition: '0.25s ease',
    boxShadow: '0 15px 45px rgba(0,0,0,0.25)',
  },

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '18px',
  },

  exerciseIcon: {
    width: '58px',
    height: '58px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '29px',
    border: '1px solid',
    flexShrink: 0,
  },

  exerciseTitle: {
    minWidth: 0,
  },

  exerciseName: {
    margin: 0,
    fontSize: '21px',
    fontWeight: '750',
  },

  thaiName: {
    display: 'block',
    marginTop: '3px',
    fontSize: '14px',
    fontWeight: '600',
  },

  videoWrapper: {
    position: 'relative',
    width: '100%',
    height: '245px',
    borderRadius: '15px',
    overflow: 'hidden',
    background: '#050505',
    marginBottom: '18px',
  },

  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },

  videoOverlay: {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(8px)',
    padding: '5px 10px',
    borderRadius: '7px',
    fontSize: '11px',
    color: '#d1d5db',
  },

  description: {
    color: '#b0b6bf',
    fontSize: '14px',
    lineHeight: 1.7,
    minHeight: '47px',
    margin: '0 0 13px',
  },

  aiStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#9ca3af',
    fontSize: '12px',
    marginBottom: '18px',
  },

  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    display: 'inline-block',
  },

  selectButton: {
    width: '100%',
    border: 'none',
    borderRadius: '11px',
    color: '#fff',
    padding: '13px 18px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: '0.2s ease',
  },

  arrow: {
    fontSize: '20px',
    lineHeight: 1,
  },

  infoBox: {
    marginTop: '30px',
    padding: '20px 22px',
    borderRadius: '17px',
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.025)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
  },

  infoIcon: {
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    background: 'rgba(139,92,246,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    flexShrink: 0,
  },

  infoTitle: {
    margin: '0 0 5px',
    fontSize: '14px',
    fontWeight: '700',
  },

  infoText: {
    margin: 0,
    color: '#8f969f',
    fontSize: '12px',
    lineHeight: 1.7,
  },
};