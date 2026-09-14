import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import ExerciseSelect from './pages/ExerciseSelect';
import ExerciseSetting from './pages/ExerciseSetting';
import Exercise from './pages/Exercise';
import Result from './pages/Result';
import History from './pages/History';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exercises" element={<ExerciseSelect />} />
        <Route path="/settings" element={<ExerciseSetting />} />
        <Route path="/exercise" element={<Exercise />} />
        <Route path="/result" element={<Result />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;