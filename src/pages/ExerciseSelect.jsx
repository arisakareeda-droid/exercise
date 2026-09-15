import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const handleSelectExercise = (type, name, thaiName) => {
    navigate('/exercise', {
      state: {
        exerciseType: type,
        exerciseName: name,
        thaiName: thaiName,
      },
    });
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-2">เลือกท่าออกกำลังกาย</h1>
      <p className="text-gray-400 mb-8">เลือกท่าที่คุณต้องการฝึกในวันนี้</p>

      <div className="grid grid-cols-1 gap-6 w-full max-w-md">
        {/* Squat */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-blue-400">🏋️‍♂️ Squat (ลุกนั่ง)</h2>
            <p className="text-gray-400 text-sm mt-1">บริหารกล้ามเนื้อขา สะโพก และแกนกลาง</p>
          </div>
          <button 
            onClick={() => handleSelectExercise('squat', 'Squat', 'สควอท')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer"
          >
            เลือกท่านี้
          </button>
        </div>

        {/* Jumping Jack */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-purple-400">⭐ Jumping Jack (กระโดดตบ)</h2>
            <p className="text-gray-400 text-sm mt-1">เพิ่มการเผาผลาญและคาร์ดิโอ</p>
          </div>
          <button 
            onClick={() => handleSelectExercise('jumping_jack', 'Jumping Jack', 'กระโดดตบ')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition cursor-pointer"
          >
            เลือกท่านี้
          </button>
        </div>
      </div>

      <button 
        onClick={() => navigate('/dashboard')} 
        className="mt-8 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition cursor-pointer"
      >
        ← กลับหน้าหลัก
      </button>
    </div>
  );
}