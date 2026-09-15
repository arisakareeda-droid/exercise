import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ExerciseSetting() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // ดึงค่าท่าจาก URL เช่น squat หรือ jumping_jack
  const exerciseType = searchParams.get('exercise') || 'squat';
  
  // state สำหรับตั้งค่าเป้าหมายจำนวนครั้ง
  const [targetCount, setTargetCount] = useState(10);

    const handleStartSession = () => {
    navigate(`/exercise?exercise=${exerciseType}&target=${targetCount}`);
    };

  return (
    <div style={{ padding: '40px', maxWidth: '500px', margin: '0 auto', textAlign: 'center', color: '#fff', backgroundColor: '#121212', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '20px', fontSize: '26px' }}>ตั้งค่าการออกกำลังกาย</h2>
      
      <div style={{ padding: '25px', border: '1px solid #444', borderRadius: '12px', backgroundColor: '#1e1e1e', textAlign: 'left' }}>
        <p style={{ margin: '0 0 10px', color: '#aaa' }}>ท่าที่เลือก:</p>
        <h3 style={{ margin: '0 0 20px', textTransform: 'uppercase', color: '#4ade80', fontSize: '22px' }}>
          {exerciseType === 'squat' ? '🏋️‍♂️ Squat (ลุกนั่ง)' : '⭐ Jumping Jack (กระโดดตบ)'}
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
            เป้าหมายจำนวนครั้ง (Reps):
          </label>
          <input 
            type="number" 
            value={targetCount} 
            onChange={(e) => setTargetCount(e.target.value)}
            min="1"
            max="100"
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #555', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '16px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
          <button 
            onClick={() => navigate('/exercises')} 
            style={{ flex: 1, padding: '12px', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ย้อนกลับ
          </button>
          
          <button 
            onClick={handleStartSession} 
            style={{ flex: 1, padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            เริ่มออกกำลังกาย
          </button>
        </div>
      </div>
    </div>
  );
}