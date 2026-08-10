const express = require('express');
const router = express.Router();
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

function todayKey() { return new Date().toISOString().slice(0, 10); }
function settingNumber(key, fallback) { const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key); const n = Number(row?.value); return Number.isFinite(n) ? n : fallback; }

router.get('/me', authRequired, (req, res) => {
  const tx = db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ balance: req.user.wallet_balance, transactions: tx });
});

router.post('/topup', authRequired, (req, res) => {
  const { amount, payment_method, transaction_id } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt < 10) return res.status(400).json({ error: 'Minimum top-up is 10' });
  if (!payment_method || !transaction_id) return res.status(400).json({ error: 'payment_method and transaction_id required' });
  // DEMO / MOCK — clearly labeled. Replace with real gateway webhook for production.
  const new_balance = (req.user.wallet_balance || 0) + amt;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(new_balance, req.user.id);
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, 'topup', amt, new_balance, `[DEMO] ${payment_method.toUpperCase()} • ${transaction_id}`, Date.now());
  res.json({ ok: true, balance: new_balance, demo: true });
});

router.post('/reward/daily', authRequired, (req, res) => {
  const today = todayKey();
  const last = db.prepare(`SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).get(req.user.id);
  if (last && new Date(last.created_at).toISOString().slice(0,10) === today) {
    return res.status(400).json({ error: 'Already claimed today' });
  }
  const amt = settingNumber('daily_reward', 5);
  const new_balance = (req.user.wallet_balance || 0) + amt;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(new_balance, req.user.id);
  db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, 'daily', amt, `Daily reward (${today})`, Date.now());
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, 'reward', amt, new_balance, 'Daily login reward', Date.now());
  res.json({ ok: true, balance: new_balance, claimed: amt });
});

router.post('/reward/cashback', authRequired, (req, res) => {
  const { order_id } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ? AND user_id = ?').get(order_id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'completed') return res.status(400).json({ error: 'Only completed orders earn cashback' });
  if (db.prepare('SELECT id FROM rewards WHERE user_id = ? AND reward_type = ? AND description LIKE ?').get(req.user.id, 'cashback', `%${order_id}%`)) {
    return res.status(400).json({ error: 'Cashback already claimed' });
  }
  const percent = settingNumber('cashback_percent', 5);
  const amt = Math.round(order.amount * (percent / 100) * 100) / 100;
  const new_balance = (req.user.wallet_balance || 0) + amt;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(new_balance, req.user.id);
  db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, 'cashback', amt, `${percent}% cashback for ${order_id}`, Date.now());
  db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, 'cashback', amt, new_balance, `Cashback ${order_id}`, Date.now());
  res.json({ ok: true, balance: new_balance, claimed: amt });
});

router.post('/reward/spin', authRequired, (req, res) => {
  const today = todayKey();
  const playedToday = db.prepare(`SELECT id FROM rewards WHERE user_id = ? AND reward_type = 'spin' AND created_at >= ?`).get(req.user.id, Date.now() - 24*3600*1000);
  if (playedToday) return res.status(400).json({ error: 'You already spun today. Try again tomorrow.' });
  const prizes = [1, 2, 5, 10, 0, 3, 0.5, 25];
  // Weighted slightly toward small wins — clearly demo odds, editable from admin later.
  const weights = [25, 22, 18, 10, 15, 14, 5, 1];
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total, chosen = prizes[0];
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { chosen = prizes[i]; break; } }
  const new_balance = (req.user.wallet_balance || 0) + chosen;
  db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(new_balance, req.user.id);
  db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, 'spin', chosen, `Lucky spin prize ৳${chosen}`, Date.now());
  if (chosen > 0) {
    db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, 'spin', chosen, new_balance, 'Lucky spin', Date.now());
  }
  res.json({ ok: true, prize: chosen, balance: new_balance });
});

router.get('/rewards/history', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM rewards WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ rewards: rows });
});

router.get('/admin/all', adminRequired, (req, res) => {
  const rows = db.prepare(`SELECT w.*, u.username, u.email FROM wallet_transactions w JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 200`).all();
  res.json({ transactions: rows });
});

module.exports = router;
