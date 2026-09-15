import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import ExerciseSelect from "./pages/ExerciseSelect";
import ExerciseSetting from "./pages/ExerciseSetting";
import Exercise from "./pages/Exercise";
import Result from "./pages/Result";
import History from "./pages/History";

function App() {
  return (
    <Router>
      <Routes>

        {/* =========================
            Authentication
        ========================= */}

        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />


        {/* =========================
            Main Dashboard
        ========================= */}

        <Route path="/dashboard" element={<Dashboard />} />


        {/* =========================
            Exercise
        ========================= */}

        {/* หน้าเลือกท่า */}
        <Route
          path="/exercises"
          element={<ExerciseSelect />}
        />

        {/* หน้าตั้งค่าการออกกำลังกาย */}
        <Route
          path="/settings"
          element={<ExerciseSetting />}
        />

        {/* หน้ากล้อง AI ตรวจจับท่า */}
        <Route
          path="/exercise"
          element={<Exercise />}
        />

        {/* =========================
            Result & History
        ========================= */}

        <Route
          path="/result"
          element={<Result />}
        />

        <Route
          path="/history"
          element={<History />}
        />


        {/* =========================
            Profile
        ========================= */}

        <Route
          path="/profile"
          element={<Profile />}
        />


        {/* =========================
            ไม่พบหน้า
        ========================= */}

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />

      </Routes>
    </Router>
  );
}

export default App;