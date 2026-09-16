import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate('/login');
        return;
      }

      setUser(currentUser);
      setEmail(currentUser.email || '');

      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || '');
          setCreatedAt(data.createdAt);
        }
      } catch (err) {
        console.error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleSave = async () => {
    if (!name.trim()) {
      setMessage('กรุณากรอกชื่อ');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { name: name.trim() });
      setEditing(false);
      setMessage('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (err) {
      console.error('บันทึกข้อมูลไม่สำเร็จ:', err);
      setMessage('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.toDate) return '-';
    return timestamp.toDate().toLocaleDateString('th-TH', { dateStyle: 'long' });
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: '#aaa' }}>กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button onClick={() => navigate('/dashboard')} style={styles.backButton}>← กลับหน้าหลัก</button>
        <h2 style={styles.title}>โปรไฟล์ของฉัน</h2>
      </div>

      <div style={styles.card}>
        <div style={styles.avatar}>{(name || email || '?').charAt(0).toUpperCase()}</div>

        <div style={styles.field}>
          <label style={styles.label}>ชื่อ</label>
          {editing ? (
            <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
          ) : (
            <p style={styles.value}>{name || '-'}</p>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.label}>อีเมล</label>
          <p style={styles.value}>{email}</p>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>สมัครสมาชิกเมื่อ</label>
          <p style={styles.value}>{formatDate(createdAt)}</p>
        </div>

        {message && <p style={styles.message}>{message}</p>}

        <div style={styles.buttonRow}>
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setMessage(''); }} style={{ ...styles.button, background: '#333' }} disabled={saving}>
                ยกเลิก
              </button>
              <button onClick={handleSave} style={{ ...styles.button, background: '#007bff' }} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{ ...styles.button, background: '#007bff' }}>
              แก้ไขชื่อ
            </button>
          )}
        </div>

        <button onClick={handleLogout} style={styles.logoutButton}>ออกจากระบบ</button>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#121212', color: '#fff', padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '25px' },
  backButton: { padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  title: { margin: 0, fontSize: '22px' },
  card: { background: '#1e1e1e', border: '1px solid #444', borderRadius: '16px', padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  avatar: { width: '80px', height: '80px', borderRadius: '50%', background: '#007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold', marginBottom: '25px' },
  field: { width: '100%', marginBottom: '18px', textAlign: 'left' },
  label: { display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '6px' },
  value: { margin: 0, fontSize: '16px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #555', background: '#2a2a2a', color: '#fff', fontSize: '15px' },
  message: { color: '#4ade80', fontSize: '14px', margin: '0 0 15px' },
  buttonRow: { display: 'flex', gap: '10px', width: '100%', marginBottom: '20px' },
  button: { flex: 1, padding: '12px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
  logoutButton: { width: '100%', padding: '12px', background: 'transparent', color: '#f87171', border: '1px solid #f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
};