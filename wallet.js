const express = require('express');
const router = express.Router();
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

function todayKey() { return new Date().toISOString().slice(0, 10); }

router.get('/me', authRequired, (req, res) => {
  const tx = db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ balance: req.user.wallet_balance, transactions: tx });
});
router.post('/topup', authRequired, (req, res) => {
  const { amount, payment_method, transaction_id } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt < 10) return res.status(400).json({ error: 'Minimum top-up 10' });
  if (!payment_method || !transaction_id) return res.status(400).json({ error: 'payment_method and transaction_id required' });
  const nb = (req.user.wallet_balance || 0) + amt;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nb, req.user.id);
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, 'topup', amt, nb, `[DEMO] ${payment_method.toUpperCase()} • ${transaction_id}`, transaction_id, Date.now());
  res.json({ ok: true, balance: nb, demo: true });
});
router.post('/reward/daily', authRequired, (req, res) => {
  const en = db.prepare("SELECT value FROM site_settings WHERE key='daily_reward_enabled'").get();
  if (en && Number(en.value) === 0) return res.status(400).json({ error: 'Daily reward disabled' });
  const last = db.prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id);
  const today = todayKey();
  if (last && new Date(last.created_at).toISOString().slice(0,10) === today) return res.status(400).json({ error: 'Already claimed today' });
  const s = db.prepare("SELECT value FROM site_settings WHERE key='daily_reward'").get();
  const amt = s ? Number(s.value) || 0 : 0;
  if (amt <= 0) return res.status(400).json({ error: 'Daily reward not configured' });
  const nb = (req.user.wallet_balance || 0) + amt;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nb, req.user.id);
  db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, created_at) VALUES (?,?,?,?,?)').run(req.user.id, 'daily', amt, `Daily reward (${today})`, Date.now());
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)').run(req.user.id, 'daily_reward', amt, nb, 'Daily login reward', 'daily-'+today, Date.now());
  res.json({ ok: true, balance: nb, claimed: amt });
});
router.post('/reward/spin', authRequired, (req, res) => {
  const en = db.prepare("SELECT value FROM site_settings WHERE key='spin_enabled'").get();
  if (en && Number(en.value) === 0) return res.status(400).json({ error: 'Spin disabled' });
  const today = todayKey();
  const lastSpin = db.prepare("SELECT id FROM rewards WHERE user_id = ? AND reward_type = 'spin' AND date(created_at/1000,'unixepoch') = date('now','unixepoch')").get(req.user.id);
  if (lastSpin) return res.status(400).json({ error: 'Already spun today' });
  const prizes = [0, 1, 2, 5, 10, 0, 3, 25];
  const weights = [20, 25, 22, 18, 6, 14, 9, 1];
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total, chosen = prizes[0];
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { chosen = prizes[i]; break; } }
  const nb = (req.user.wallet_balance || 0) + chosen;
  if (chosen > 0) {
    db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nb, req.user.id);
    db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)').run(req.user.id, 'spin', chosen, nb, 'Lucky spin prize', 'spin-'+Date.now(), Date.now());
  }
  db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, created_at) VALUES (?,?,?,?,?)').run(req.user.id, 'spin', chosen, `Lucky spin prize ৳${chosen}`, Date.now());
  res.json({ ok: true, prize: chosen, balance: nb });
});
router.get('/rewards/history', authRequired, (req, res) => {
  res.json({ rewards: db.prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id) });
});
router.get('/referrals', authRequired, (req, res) => {
  const rows = db.prepare("SELECT u.username, u.email, r.created_at, r.bonus FROM referrals r JOIN users u ON u.id = r.referee_id WHERE r.referrer_id = ? ORDER BY r.created_at DESC").all(req.user.id);
  res.json({ referrals: rows });
});
router.post('/admin/adjust', adminRequired, (req, res) => {
  const { user_id, amount, operation, note } = req.body || {};
  if (!user_id || !amount || !operation) return res.status(400).json({ error: 'user_id, amount, operation required' });
  if (!['add','remove'].includes(operation)) return res.status(400).json({ error: 'operation must be add/remove' });
  const u = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(user_id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const delta = operation === 'add' ? Number(amount) : -Number(amount);
  const nb = (u.wallet_balance || 0) + delta;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nb, user_id);
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)').run(user_id, operation === 'add' ? 'admin_add' : 'admin_remove', delta, nb, note || `Admin ${operation} ৳${Math.abs(delta)}`, null, Date.now());
  res.json({ ok: true, new_balance: nb });
});
module.exports = router;
