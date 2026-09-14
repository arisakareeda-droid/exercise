import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      // 1. สร้างบัญชีผู้ใช้ใน Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. บันทึกข้อมูลโปรไฟล์เพิ่มเติมลงใน Firestore Database
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        createdAt: new Date()
      });

      alert('สมัครสมาชิกสำเร็จ!');
      navigate('/dashboard'); // สมัครเสร็จพาไปหน้า Dashboard
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '400px', margin: '0 auto' }}>
      <h2>สมัครสมาชิก (ระบบจริง)</h2>
      <form onSubmit={handleRegister}>
        <div style={{ marginBottom: '15px' }}>
          <label>ชื่อ:</label><br />
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            style={{ width: '100%', padding: '8px' }} 
            placeholder="กรอกชื่อของคุณ"
            required 
          />
        </div>
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
            placeholder="กำหนดรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
            required 
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>
          สมัครสมาชิก
        </button>
      </form>
      <p style={{ marginTop: '15px', textAlign: 'center' }}>
        มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
      </p>
    </div>
  );
}