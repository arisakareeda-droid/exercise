// exerciseConfig.js

// ค่าการเผาผลาญเฉลี่ยต่อ 1 ครั้ง (Calories per Rep) 
// อิงจากน้ำหนักตัวมาตรฐาน (ประมาณ 60 กก.) สามารถปรับเปลี่ยนได้ตามความเหมาะสม
export const EXERCISE_CALORIES = {
    jumpingJacks: 0.2,  // กระโดดตบ 1 ครั้ง ~ 0.2 กิโลแคลอรี
    squats: 0.32,       // สควอท 1 ครั้ง ~ 0.32 กิโลแคลอรี
    pushups: 0.29,      // ดันพื้น 1 ครั้ง ~ 0.29 กิโลแคลอรี
    lunges: 0.30        // ลันจ์ 1 ครั้ง ~ 0.30 กิโลแคลอรี
};

/**
 * คำนวณแคลอรีรวมจากจำนวนครั้งที่ทำ
 * @param {string} exerciseName - ชื่อท่าออกกำลังกาย
 * @param {number} repCount - จำนวนครั้งที่ทำได้
 * @returns {number} - จำนวนแคลอรีที่เผาผลาญ (ทศนิยม 2 ตำแหน่ง)
 */
export function calculateCalories(exerciseName, repCount) {
    const caloriesPerRep = EXERCISE_CALORIES[exerciseName] || 0.2; // ค่าเริ่มต้นถ้าไม่พบชื่อท่า
    return parseFloat((caloriesPerRep * repCount).toFixed(2));
}