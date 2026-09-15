import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ExerciseSelect() {
  const navigate = useNavigate();

  // รายการท่าออกกำลังกาย
  const exercises = [
    { id: 'squat', name: '🏋️‍♂️ Squat (ลุกนั่ง)', desc: 'บริหารกล้ามเนื้อขา สะโพก และแกนกลาง' },
    { id: 'pushup', name: '💪 Push-up (วิดพื้น)', desc: 'เสริมสร้างกล้ามเนื้ออก ไหล่ และแขน' },
    { id: 'plank', name: '🧘‍♂️ Plank (แพลงก์)', desc: 'เสริมสร้างความแข็งแรงกล้ามเนื้อหน้าท้อง' },
  ];

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <h2>เลือกท่าออกกำลังกาย</h2>
      <p>เลือกท่าที่คุณต้องการฝึกในวันนี้</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
        {exercises.map((item) => (
          <div 
            key={item.id} 
            style={{ 
              padding: '20px', 
              background: '#1e1e1e', 
              borderRadius: '8px', 
              border: '1px solid #333',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#fff' }}>{item.name}</h3>
              <p style={{ margin: '0', color: '#aaa', fontSize: '14px' }}>{item.desc}</p>
            </div>
            <button 
              onClick={() => navigate('/settings')} 
              style={{ 
                padding: '8px 15px', 
                background: '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              เลือกท่านี้
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '30px' }}>
        <button 
          onClick={() => navigate('/dashboard')} 
          style={{ padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          ← กลับหน้าหลัก
        </button>
      </div>
    </div>
  );
}