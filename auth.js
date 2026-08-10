const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db');
const { signToken, authRequired, hashPassword, comparePassword } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, phone: u.phone, role: u.role, wallet_balance: u.wallet_balance, referral_code: u.referral_code, status: u.status };
}
function genRef(username) { return 'TXE' + (username || 'USR').slice(0, 3).toUpperCase() + '-' + uuid().slice(0, 4).toUpperCase(); }
function issueSession(res, user) {
  const token = signToken(user);
  res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 24 * 3600 * 1000, path: '/' });
  return token;
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, phone, password, referral } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: 'username, email and password required' });
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3-24 letters/numbers/_' });
    if (!/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    if (db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username)) return res.status(409).json({ error: 'User already exists' });
    const hash = await hashPassword(password);
    const referral_code = genRef(username);
    let referred_by = null, referrer_id = null;
    if (referral) {
      const ref = db.prepare('SELECT id, referral_code FROM users WHERE referral_code = ?').get(String(referral).toUpperCase());
      if (ref) { referred_by = ref.referral_code; referrer_id = ref.id; }
    }
    const info = db.prepare('INSERT INTO users (username, email, phone, password_hash, role, wallet_balance, referral_code, referred_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(username, email.toLowerCase(), phone || null, hash, 'user', 0, referral_code, referred_by, Date.now());
    const userId = info.lastInsertRowid;
    if (referrer_id) {
      const refSettings = db.prepare("SELECT value FROM site_settings WHERE key='referral_bonus'").get();
      const bonus = refSettings ? Number(refSettings.value) || 0 : 0;
      db.prepare('INSERT INTO referrals (referrer_id, referee_id, bonus, created_at) VALUES (?,?,?,?)').run(referrer_id, userId, bonus, Date.now());
      if (bonus > 0) {
        const refUser = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(referrer_id);
        const newBal = (refUser.wallet_balance || 0) + bonus;
        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBal, referrer_id);
        db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)')
          .run(referrer_id, 'referral', bonus, newBal, `Referral bonus for ${username}`, String(referral).toUpperCase(), Date.now());
      }
    }
    const user = db.prepare('SELECT id, username, email, phone, role, status, wallet_balance, referral_code FROM users WHERE id = ?').get(userId);
    const token = issueSession(res, user);
    res.json({ token, user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return res.status(400).json({ error: 'identifier and password required' });
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier.toLowerCase(), identifier);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'disabled') return res.status(403).json({ error: 'Account disabled' });
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
    const safe = publicUser(user);
    const token = issueSession(res, safe);
    res.json({ token, user: safe });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/logout', (req, res) => { res.clearCookie('auth_token', { path: '/' }); res.json({ ok: true }); });
router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authRequired, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'Both old and new required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'New password min 6 chars' });
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!await comparePassword(old_password, u.password_hash)) return res.status(401).json({ error: 'Old password incorrect' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(new_password), req.user.id);
  res.json({ ok: true });
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ error: 'Email or username required' });
  const user = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(identifier.toLowerCase(), identifier);
  const token = uuid().replace(/-/g, '').slice(0, 24);
  if (user) db.prepare('INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?,?,?,?)').run(user.id, token, Date.now() + 30 * 60 * 1000, Date.now());
  res.json({ ok: true, demo_token: user ? token : null });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) return res.status(400).json({ error: 'token and new_password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!row || Date.now() > row.expires_at) return res.status(400).json({ error: 'Invalid/expired token' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(new_password), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
});
module.exports = router;
