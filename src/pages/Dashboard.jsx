import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2>หน้าหลัก (Dashboard)</h2>
      <p>ยินดีต้อนรับเข้าสู่ระบบออกกำลังกายอัจฉริยะ!</p>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={() => navigate('/exercises')} style={{ padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>
          เลือกท่าออกกำลังกาย
        </button>
        <button onClick={() => navigate('/history')} style={{ padding: '10px 20px', background: '#17a2b8', color: 'white', border: 'none', cursor: 'pointer' }}>
          ดูประวัติการออกกำลังกาย
        </button>
      </div>
    </div>
  );
}