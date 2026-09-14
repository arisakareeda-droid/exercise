import { useNavigate } from 'react-router-dom';

export default function ExerciseSelect() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2>เลือกท่าออกกำลังกาย</h2>
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h3>Squat (ลุกนั่ง)</h3>
        <p>บริหารกล้ามเนื้อต้นขาและสะโพกด้วยระบบตรวจจับท่าทาง AI</p>
        <button onClick={() => navigate('/settings')} style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
          เลือกท่านี้
        </button>
      </div>
    </div>
  );
}