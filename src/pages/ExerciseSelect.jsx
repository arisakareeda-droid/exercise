import React from "react";
import { useNavigate } from "react-router-dom";

export default function ExerciseSelect() {
  const navigate = useNavigate();

  const exercises = [
    {
      id: "jumping_jack",
      icon: "🤸",
      name: "Jumping Jack",
      thaiName: "กระโดดตบ",
      description: "บริหารกล้ามเนื้อขา ไหล่ และแกนกลางลำตัว",
    },
    {
      id: "squat",
      icon: "🏋️",
      name: "Squat",
      thaiName: "สควอท",
      description: "บริหารกล้ามเนื้อขา สะโพก และแกนกลางลำตัว",
    },
  ];

  const handleSelectExercise = (exercise) => {
    navigate("/exercise", {
      state: {
        exerciseType: exercise.id,
        exerciseName: exercise.name,
        thaiName: exercise.thaiName,
      },
    });
  };

  return (
    <div className="exercise-page">
      <div className="exercise-container">
        {/* Header */}
        <div className="header">
          <div className="logo">FITTRACK</div>
          <h1>เลือกท่าออกกำลังกาย</h1>
          <p>เลือกท่าที่คุณต้องการฝึกในวันนี้</p>
        </div>

        {/* Exercise List */}
        <div className="exercise-list">
          {exercises.map((exercise) => (
            <div className="exercise-card" key={exercise.id}>
              <div className="exercise-info">
                <div className="exercise-title">
                  <span className="exercise-icon">{exercise.icon}</span>
                  <div>
                    <h2>{exercise.name}</h2>
                    <h3>({exercise.thaiName})</h3>
                  </div>
                </div>
                <p>{exercise.description}</p>
              </div>

              <button
                className="select-button"
                onClick={() => handleSelectExercise(exercise)}
              >
                เลือกท่านี้
              </button>
            </div>
          ))}
        </div>

        {/* Back Button */}
        <button
          className="back-button"
          onClick={() => navigate("/dashboard")}
        >
          ← กลับหน้าหลัก
        </button>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: "Noto Sans Thai", "Segoe UI", Tahoma, sans-serif;
        }

        .exercise-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #111318 0%, #15171d 50%, #111318 100%);
          color: white;
          padding: 50px 20px;
        }

        .exercise-container {
          width: 100%;
          max-width: 970px;
          margin: 0 auto;
        }

        .header {
          text-align: center;
          margin-bottom: 42px;
        }

        .logo {
          display: inline-block;
          margin-bottom: 22px;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 3px;
          color: #22c55e;
        }

        .header h1 {
          margin: 0;
          font-size: 34px;
          font-weight: 700;
          color: #ffffff;
        }

        .header p {
          margin-top: 12px;
          font-size: 18px;
          color: #a7adb8;
        }

        .exercise-list {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .exercise-card {
          min-height: min-content;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          padding: 25px 26px;
          background: #1d1f1f;
          border: 1px solid #333636;
          border-radius: 12px;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .exercise-card:hover {
          transform: translateY(-2px);
          border-color: #22c55e;
          background: #202322;
        }

        .exercise-info {
          flex: 1;
        }

        .exercise-title {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .exercise-icon {
          font-size: 32px;
          line-height: 1;
        }

        .exercise-title h2 {
          display: inline;
          margin: 0;
          font-size: 26px;
          font-weight: 700;
          color: #ffffff;
        }

        .exercise-title h3 {
          display: inline;
          margin: 0 0 0 8px;
          font-size: 23px;
          font-weight: 600;
          color: #ffffff;
        }

        .exercise-info p {
          margin: 12px 0 0;
          font-size: 16px;
          color: #aeb3bb;
          line-height: 1.5;
        }

        .select-button {
          flex-shrink: 0;
          min-width: 125px;
          height: 48px;
          border: none;
          border-radius: 5px;
          background: #22c55e;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .select-button:hover {
          background: #16a34a;
          transform: translateY(-1px);
        }

        .back-button {
          display: block;
          margin: 38px auto 0;
          padding: 13px 27px;
          border: none;
          border-radius: 5px;
          background: #727982;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .back-button:hover {
          background: #5f6670;
        }

        @media (max-width: 520px) {
          .exercise-card {
            flex-direction: column;
            align-items: stretch;
            gap: 18px;
          }
          .select-button {
            width: 100%;
          }
          .back-button {
            width: 100%;
            max-width: 250px;
          }
        }
      `}</style>
    </div>
  );
}