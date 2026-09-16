import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

const EXERCISE_LABELS = {
  squat: { name: 'Squat (ลุกนั่ง)', icon: '🏋️', calPerRep: 0.32 },
  jumping_jack: { name: 'Jumping Jack (กระโดดตบ)', icon: '⭐', calPerRep: 0.20 },
};

export default function History() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }

      try {
        const q = query(
          collection(db, 'workouts'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        setWorkouts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('โหลดประวัติไม่สำเร็จ:', err);
        setError('ไม่สามารถโหลดประวัติได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const totalReps = workouts.reduce((sum, w) => sum + (w.count || 0), 0);
  
  // คำนวณแคลอรีรวมทั้งหมดจากทุกรายการในประวัติ (รองรับทั้งแบบที่เคยบันทึก field calories ไว้แล้ว หรือคำนวณเผื่อจาก count * ค่ากลางของท่า)
  const totalCalories = workouts.reduce((sum, w) => {
    if (w.calories !== undefined) return sum + w.calories;
    const calPerRep = EXERCISE_LABELS[w.exercise]?.calPerRep || 0.32;
    return sum + (w.count || 0) * calPerRep;
  }, 0).toFixed(2);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.backButton}>← กลับหน้าหลัก</button>
        <h2 style={styles.title}>ประวัติการออกกำลังกาย</h2>
      </div>

      {!loading && workouts.length > 0 && (
        <div style={styles.summaryRow}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryNumber}>{workouts.length}</span>
            <span style={styles.summaryLabel}>ครั้งที่ออกกำลังกาย</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryNumber}>{totalReps}</span>
            <span style={styles.summaryLabel}>รวม Reps ทั้งหมด</span>
          </div>
          <div style={styles.summaryCard}>
            <span style={{ ...styles.summaryNumber, color: '#ffc107' }}>{totalCalories}</span>
            <span style={styles.summaryLabel}>รวมแคลอรี (kcal)</span>
          </div>
        </div>
      )}

      {loading && <p style={styles.message}>กำลังโหลดข้อมูล...</p>}
      {!loading && error && <p style={{ ...styles.message, color: '#f87171' }}>{error}</p>}
      {!loading && !error && workouts.length === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
          <p style={styles.message}>ยังไม่มีประวัติการออกกำลังกาย</p>
          <button onClick={() => navigate('/exercises')} style={styles.ctaButton}>เริ่มออกกำลังกายเลย</button>
        </div>
      )}

      {!loading && workouts.length > 0 && (
        <div style={styles.list}>
          {workouts.map((w) => {
            const info = EXERCISE_LABELS[w.exercise] || { name: w.exercise, icon: '💪', calPerRep: 0.32 };
            // ถ้าในฐานข้อมูลมีค่า w.calories บันทึกอยู่แล้วให้ใช้ค่านั้นได้เลย ถ้าไม่มีให้คำนวณจาก count คูณเรทของท่า
            const sessionCalories = w.calories !== undefined 
              ? w.calories 
              : Number(((w.count || 0) * info.calPerRep).toFixed(2));

            return (
              <div key={w.id} style={styles.item}>
                <div style={styles.itemIcon}>{info.icon}</div>
                <div style={styles.itemInfo}>
                  <div style={styles.itemName}>{info.name}</div>
                  <div style={styles.itemDate}>{formatDate(w.completedAt)}</div>
                </div>
                <div style={styles.itemStats}>
                  <div style={styles.itemCount}>{w.count} ครั้ง</div>
                  <div style={styles.itemCal}>-{sessionCalories} kcal</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#121212', color: '#fff', padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '750px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '25px' },
  backButton: { padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  title: { margin: 0, fontSize: '22px' },
  summaryRow: { display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' },
  summaryCard: { flex: 1, minWidth: '120px', background: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  summaryNumber: { fontSize: '24px', fontWeight: 'bold', color: '#4ade80' },
  summaryLabel: { fontSize: '12px', color: '#aaa', marginTop: '4px', textAlign: 'center' },
  message: { textAlign: 'center', color: '#aaa', margin: '40px 0' },
  emptyState: { textAlign: 'center', padding: '40px 0' },
  ctaButton: { marginTop: '10px', padding: '12px 24px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  item: { display: 'flex', alignItems: 'center', gap: '14px', background: '#1e1e1e', border: '1px solid #444', borderRadius: '10px', padding: '14px 16px' },
  itemIcon: { fontSize: '28px' },
  itemInfo: { flex: 1, textAlign: 'left' },
  itemName: { fontWeight: 'bold', fontSize: '15px' },
  itemDate: { fontSize: '13px', color: '#aaa', marginTop: '2px' },
  itemStats: { textAlign: 'right', whiteSpace: 'nowrap' },
  itemCount: { fontWeight: 'bold', color: '#007bff', fontSize: '15px' },
  itemCal: { fontSize: '13px', color: '#ffc107', marginTop: '2px' },
};