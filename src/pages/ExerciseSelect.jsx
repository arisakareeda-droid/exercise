import { useNavigate } from 'react-router-dom';

export default function ExerciseSelect() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center', color: '#fff', backgroundColor: '#121212', minHeight: '100vh' }}>
      <h2 style={{ marginBottom: '30px' }}>เลือกท่าออกกำลังกาย</h2>
      
      {/* ท่า Squat */}
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #444', borderRadius: '12px', backgroundColor: '#1e1e1e' }}>
        <h3>Squat (ลุกนั่ง)</h3>
        
        {/* วิดีโอแสดงใต้ชื่อท่า */}
        <div style={{ margin: '15px 0' }}>
          <video 
            src="/videos/squats.mp4" 
            autoPlay 
            loop 
            muted 
            playsInline
            style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', objectFit: 'cover' }}
          />
        </div>
        
        <p style={{ color: '#aaa', fontSize: '14px' }}>บริหารกล้ามเนื้อต้นขาและสะโพกด้วยระบบตรวจจับท่าทาง AI</p>
        <button 
          onClick={() => navigate('/settings?exercise=squat')} 
          style={{ marginTop: '10px', padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}
        >
          เลือกท่านี้
        </button>
      </div>

      {/* ท่า Jumping Jack */}
      <div style={{ marginTop: '30px', padding: '20px', border: '1px solid #444', borderRadius: '12px', backgroundColor: '#1e1e1e' }}>
        <h3>Jumping Jack (กระโดดตบ)</h3>
        
        {/* วิดีโอแสดงใต้ชื่อท่า */}
        <div style={{ margin: '15px 0' }}>
          <video 
            src="/videos/jumping_jack.mp4" 
            autoPlay 
            loop 
            muted 
            playsInline
            style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', objectFit: 'cover' }}
          />
        </div>

        <p style={{ color: '#aaa', fontSize: '14px' }}>เพิ่มอัตราการเต้นของหัวใจและเผาผลาญไขมันด้วยระบบตรวจจับท่าทาง AI</p>
        <button 
          onClick={() => navigate('/settings?exercise=jumping_jack')} 
          style={{ marginTop: '10px', padding: '10px 20px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold' }}
        >
          เลือกท่านี้
        </button>
      </div>
    </div>
  );
}