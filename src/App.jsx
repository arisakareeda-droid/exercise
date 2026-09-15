import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ExerciseSelect from "./pages/ExerciseSelect";
import Exercise from "./pages/Exercise";
import ExerciseSetting from "./pages/ExerciseSetting";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Result from "./pages/Result";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* =========================
            Authentication
        ========================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />


        {/* =========================
            Main
        ========================= */}
        <Route path="/dashboard" element={<Dashboard />} />


        {/* =========================
            Exercise
        ========================= */}
        <Route path="/exercises" element={<ExerciseSelect />} />

        <Route path="/exercise" element={<Exercise />} />

        <Route path="/exercise-setting" element={<ExerciseSetting />} />


        {/* =========================
            Other pages
        ========================= */}
        <Route path="/history" element={<History />} />

        <Route path="/profile" element={<Profile />} />

        <Route path="/result" element={<Result />} />


        {/* =========================
            ถ้าไม่พบหน้า
        ========================= */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;