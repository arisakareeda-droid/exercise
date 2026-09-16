import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const EXERCISE_LABELS = {
  squat: { name: 'Squat (ลุกนั่ง)', icon: '🏋️' },
  jumping_jack: { name: 'Jumping Jack (กระโดดตบ)', icon: '⭐' },
};

export default function Result() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const exerciseType = searchParams.get('exercise') || 'squat';
  const count = parseInt(searchParams.get('count') || '0', 10);
  const exerciseInfo = EXERCISE_LABELS[exerciseType] || { name: exerciseType, icon: '💪' };

  const [saveStatus, setSaveStatus] = useState('saving'); // saving | saved | error | guest
  const savedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (savedRef.current) return;

      if (!user) {
        setSaveStatus('guest');
        return;
      }

      savedRef.current = true;

      try {
        await addDoc(collection(db, 'workouts'), {
          userId: user.uid,
          exercise: exerciseType,
          count: count,
          completedAt: serverTimestamp(),
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('บันทึกผลไม่สำเร็จ:', err);
        setSaveStatus('error');
      }
    });

    return () => unsubscribe();
  }, [exerciseType, count]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.trophy}>🏆</div>
        <h2 style={styles.title}>เยี่ยมมาก! ออกกำลังกายสำเร็จ</h2>

        <div style={styles.exerciseBadge}>
          <span style={{ fontSize: '22px', marginRight: '8px' }}>{exerciseInfo.icon}</span>
          {exerciseInfo.name}
        </div>

        <div style={styles.countBox}>
          <span style={styles.countNumber}>{count}</span>
          <span style={styles.countLabel}>ครั้ง</span>
        </div>

        <p style={styles.statusText}>
          {saveStatus === 'saving' && 'กำลังบันทึกผล...'}
          {saveStatus === 'saved' && '✅ บันทึกผลลงประวัติเรียบร้อยแล้ว'}
          {saveStatus === 'error' && '⚠️ บันทึกผลไม่สำเร็จ กรุณาลองใหม่ภายหลัง'}
          {saveStatus === 'guest' && 'เข้าสู่ระบบเพื่อบันทึกผลการออกกำลังกาย'}
        </p>

        <div style={styles.buttonRow}>
          <button onClick={() => navigate('/exercises')} style={{ ...styles.button, background: '#333' }}>
            ออกกำลังกายอีกครั้ง
          </button>
          <button onClick={() => navigate('/history')} style={{ ...styles.button, background: '#28a745' }}>
            ดูประวัติ
          </button>
          <button onClick={() => navigate('/dashboard')} style={{ ...styles.button, background: '#007bff' }}>
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', background: '#121212', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px', fontFamily: 'sans-serif',
  },
  card: {
    width: '100%', maxWidth: '480px', background: '#1e1e1e',
    border: '1px solid #444', borderRadius: '16px', padding: '40px 30px', textAlign: 'center',
  },
  trophy: { fontSize: '64px', marginBottom: '10px' },
  title: { margin: '0 0 20px', fontSize: '24px' },
  exerciseBadge: {
    display: 'inline-flex', alignItems: 'center', background: '#2a2a2a',
    border: '1px solid #444', borderRadius: '999px', padding: '8px 20px',
    fontSize: '16px', color: '#4ade80', marginBottom: '25px',
  },
  countBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' },
  countNumber: { fontSize: '64px', fontWeight: 'bold', color: '#007bff', lineHeight: 1 },
  countLabel: { fontSize: '16px', color: '#aaa', marginTop: '5px' },
  statusText: { fontSize: '14px', color: '#aaa', marginBottom: '30px', minHeight: '20px' },
  buttonRow: { display: 'flex', flexDirection: 'column', gap: '10px' },
  button: {
    padding: '14px', color: 'white', border: 'none', borderRadius: '8px',
    cursor: 'pointer', fontWeight: 'bold', fontSize: '15px',
  },
};