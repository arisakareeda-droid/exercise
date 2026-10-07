/**
 * Cloud Functions สำหรับ "ลืมรหัสผ่านด้วย OTP" ของ FITTRACK
 *
 * ติดตั้ง:   cd functions && npm i firebase-functions firebase-admin nodemailer
 * ตั้งค่าลับ: firebase functions:secrets:set SMTP_USER      (อีเมลผู้ส่ง เช่น Gmail)
 *            firebase functions:secrets:set SMTP_PASS      (Gmail App Password 16 หลัก ไม่ใช่รหัสล็อกอินปกติ)
 *            firebase functions:secrets:set OTP_PEPPER     (สตริงสุ่มยาวๆ ใช้ผสมตอนแฮช OTP)
 * Deploy:    firebase deploy --only functions
 *
 * หมายเหตุ: Cloud Functions ต้องใช้แพ็กเกจ Blaze, และคอลเลกชัน passwordResets ต้องไม่เปิดสิทธิ์ให้ client
 * (Firestore rules ค่าเริ่มต้นแบบ deny ก็พอ เพราะ Admin SDK ข้าม rules ได้)
 *
 * ถ้าจะเปลี่ยน region ให้ตั้ง setGlobalOptions({ region: 'asia-southeast1' }) และแก้ getFunctions(...) ใน Login.jsx ให้ตรงกัน
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const OTP_PEPPER = defineSecret('OTP_PEPPER');
const SECRETS = [SMTP_USER, SMTP_PASS, OTP_PEPPER];

const OTP_TTL_MS = 10 * 60 * 1000; // OTP อายุ 10 นาที
const RESEND_MS = 60 * 1000; // ขอใหม่ได้ทุก 60 วินาที
const MAX_ATTEMPTS = 5; // กรอกผิดได้ 5 ครั้งต่อ 1 รหัส
const TOKEN_TTL_MS = 10 * 60 * 1000; // หลังยืนยัน OTP มีเวลาตั้งรหัสใหม่ 10 นาที

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (v) => String(v || '').trim().toLowerCase();
const hmac = (v) => crypto.createHmac('sha256', OTP_PEPPER.value()).update(v).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const resetDoc = (email) =>
  db.collection('passwordResets').doc(crypto.createHash('sha256').update(email).digest('hex'));

async function sendOtpMail(to, otp) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  await transporter.sendMail({
    from: `"FITTRACK" <${SMTP_USER.value()}>`,
    to,
    subject: 'รหัส OTP สำหรับรีเซ็ตรหัสผ่าน FITTRACK',
    text: `รหัส OTP ของคุณคือ ${otp} (หมดอายุใน 10 นาที) หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน โปรดเพิกเฉยอีเมลนี้`,
    html: `
      <div style="max-width:420px;margin:0 auto;padding:28px;border:1px solid #2a5360;border-radius:14px;background:#050b0e;color:#f4f7f6;font-family:Kanit,Arial,sans-serif">
        <h2 style="margin:0 0 6px;font-size:20px;font-weight:600">รีเซ็ตรหัสผ่าน FITTRACK</h2>
        <p style="margin:0 0 20px;color:#93a1a5;font-size:14px;line-height:1.7">ใช้รหัสด้านล่างเพื่อยืนยันตัวตน รหัสนี้หมดอายุใน 10 นาที</p>
        <div style="padding:16px;border-radius:10px;background:#061015;border:1px solid #304951;text-align:center;font-size:34px;font-weight:700;letter-spacing:12px;color:#8cff32">${otp}</div>
        <p style="margin:20px 0 0;color:#6f7f83;font-size:12px;line-height:1.7">หากคุณไม่ได้เป็นผู้ขอ โปรดเพิกเฉยอีเมลนี้ รหัสผ่านของคุณจะไม่ถูกเปลี่ยนแปลง และห้ามบอกรหัสนี้กับใคร</p>
      </div>`,
  });
}

/** 1) ขอ OTP — ตอบ ok เสมอแม้ไม่มีอีเมลนี้ในระบบ เพื่อไม่ให้คนนอกเดาได้ว่าอีเมลไหนสมัครไว้ */
exports.requestPasswordResetOtp = onCall({ secrets: SECRETS }, async (req) => {
  const email = normEmail(req.data?.email);
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'invalid-email');

  const ref = resetDoc(email);
  const snap = await ref.get();
  const now = Date.now();
  if (snap.exists && now - snap.data().sentAt < RESEND_MS) {
    throw new HttpsError('resource-exhausted', 'too-soon');
  }

  let user = null;
  try {
    user = await admin.auth().getUserByEmail(email);
    if (user.disabled) user = null;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw new HttpsError('internal', 'lookup-failed');
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await ref.set({
    uid: user ? user.uid : null,
    otpHash: user ? hmac(`${email}:${otp}`) : null,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    sentAt: now,
    tokenHash: null,
    tokenExpiresAt: 0,
  });

  if (user) {
    try {
      await sendOtpMail(email, otp);
    } catch (e) {
      console.error('send mail failed', e);
      await ref.delete();
      throw new HttpsError('internal', 'mail-failed');
    }
  }
  return { ok: true };
});

/** 2) ตรวจ OTP — ถูกต้องแล้วจะได้ resetToken ใช้ครั้งเดียวสำหรับตั้งรหัสผ่านใหม่ */
exports.verifyPasswordResetOtp = onCall({ secrets: SECRETS }, async (req) => {
  const email = normEmail(req.data?.email);
  const otp = String(req.data?.otp || '');
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(otp)) throw new HttpsError('invalid-argument', 'bad-input');

  const ref = resetDoc(email);
  // ห้าม throw ใน transaction (จะ rollback ตัวนับครั้งที่ผิด) จึงคืนสถานะแล้วค่อย throw ข้างนอก
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || !d.otpHash) return { status: 'invalid' };
    if (Date.now() > d.expiresAt) return { status: 'expired' };
    if (d.attempts >= MAX_ATTEMPTS) return { status: 'locked' };

    if (!safeEqual(hmac(`${email}:${otp}`), d.otpHash)) {
      const attempts = d.attempts + 1;
      tx.update(ref, { attempts });
      return { status: attempts >= MAX_ATTEMPTS ? 'locked' : 'invalid' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    tx.update(ref, {
      otpHash: null, // OTP ใช้ได้ครั้งเดียว
      tokenHash: hmac(`token:${token}`),
      tokenExpiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return { status: 'ok', token };
  });

  if (result.status === 'expired') throw new HttpsError('deadline-exceeded', 'otp-expired');
  if (result.status === 'locked') throw new HttpsError('resource-exhausted', 'too-many-attempts');
  if (result.status !== 'ok') throw new HttpsError('invalid-argument', 'otp-invalid');
  return { resetToken: result.token };
});

/** 3) ตั้งรหัสผ่านใหม่ — ต้องมี resetToken ที่ได้จากขั้น 2 */
exports.resetPasswordWithOtp = onCall({ secrets: SECRETS }, async (req) => {
  const email = normEmail(req.data?.email);
  const token = String(req.data?.resetToken || '');
  const newPassword = req.data?.newPassword;
  if (!EMAIL_RE.test(email) || !token) throw new HttpsError('invalid-argument', 'bad-input');
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
    throw new HttpsError('invalid-argument', 'weak-password');
  }

  const ref = resetDoc(email);
  const snap = await ref.get();
  const d = snap.data();
  if (!d || !d.tokenHash || !d.uid || Date.now() > d.tokenExpiresAt) {
    throw new HttpsError('deadline-exceeded', 'session-expired');
  }
  if (!safeEqual(hmac(`token:${token}`), d.tokenHash)) {
    throw new HttpsError('permission-denied', 'bad-token');
  }

  try {
    await admin.auth().updateUser(d.uid, { password: newPassword });
  } catch (e) {
    if (e.code === 'auth/invalid-password') throw new HttpsError('invalid-argument', 'weak-password');
    console.error('update password failed', e);
    throw new HttpsError('internal', 'update-failed');
  }
  await admin.auth().revokeRefreshTokens(d.uid); // ออกจากระบบทุกอุปกรณ์เดิม
  await ref.delete();
  return { ok: true };
});
