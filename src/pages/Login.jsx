import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert('เข้าสู่ระบบสำเร็จ!');
      navigate('/dashboard'); // ล็อกอินสำเร็จพาไปหน้า Dashboard
    } catch (error) {
      alert('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '400px', margin: '0 auto' }}>
      <h2>เข้าสู่ระบบ (ระบบจริง)</h2>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label>อีเมล:</label><br />
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            style={{ width: '100%', padding: '8px' }} 
            placeholder="กรอกอีเมลของคุณ"
            required 
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label>รหัสผ่าน:</label><br />
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '8px' }} 
            placeholder="กรอกรหัสผ่าน"
            required 
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
          เข้าสู่ระบบ
        </button>
      </form>
      <p style={{ marginTop: '15px', textAlign: 'center' }}>
        ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link>
      </p>
    </div>
  );
}