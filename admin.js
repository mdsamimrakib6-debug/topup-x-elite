const express = require('express');
const router = express.Router();
const db = require('../db');
const { adminRequired } = require('../middleware/auth');

function todayKey(d = new Date()) { return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2,'0') + String(d.getUTCDate()).padStart(2,'0'); }

router.get('/stats', adminRequired, (req, res) => {
  const t = db.prepare("SELECT COUNT(*) as total_orders, SUM(CASE WHEN status='pending_payment' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='payment_verification' THEN 1 ELSE 0 END) as pv, SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed, COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END),0) as revenue FROM orders").get();
  res.json({ totals: t, user_count: db.prepare('SELECT COUNT(*) as c FROM users').get().c, wallet_total: db.prepare('SELECT COALESCE(SUM(wallet_balance),0) as w FROM users').get().w, todays_orders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE order_id LIKE ?").get('TXE-' + todayKey() + '-%').c });
});
router.get('/users', adminRequired, (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT id, username, email, phone, role, status, wallet_balance, referral_code, created_at FROM users';
  const p = [];
  if (q) { sql += ' WHERE username LIKE ? OR email LIKE ?'; p.push('%'+q+'%','%'+q+'%'); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ users: db.prepare(sql).all(...p) });
});
router.put('/users/:id', adminRequired, (req, res) => {
  const { wallet_balance, role, phone, status } = req.body || {};
  db.prepare('UPDATE users SET wallet_balance=COALESCE(?,wallet_balance), role=COALESCE(?,role), phone=COALESCE(?,phone), status=COALESCE(?,status) WHERE id = ?').run(wallet_balance ?? null, role ?? null, phone ?? null, status ?? null, req.params.id);
  res.json({ ok: true });
});
router.get('/payment-settings', (req, res) => res.json({ methods: db.prepare('SELECT * FROM payment_settings ORDER BY id ASC').all() }));
router.post('/payment-settings', adminRequired, (req, res) => {
  const { method, display_name, account_number, instructions, active, icon } = req.body || {};
  if (!method || !display_name) return res.status(400).json({ error: 'method and display_name required' });
  const ex = db.prepare('SELECT id FROM payment_settings WHERE method = ?').get(method);
  if (ex) { db.prepare('UPDATE payment_settings SET display_name=?, account_number=?, instructions=?, active=?, icon=? WHERE method=?').run(display_name, account_number||null, instructions||null, active??1, icon||null, method); return res.json({ ok:true, id: ex.id }); }
  const info = db.prepare('INSERT INTO payment_settings (method, display_name, account_number, instructions, active, icon) VALUES (?,?,?,?,?,?)').run(method, display_name, account_number||null, instructions||null, active??1, icon||null);
  res.json({ ok:true, id: info.lastInsertRowid });
});
router.put('/payment-settings/:id', adminRequired, (req, res) => {
  const { display_name, account_number, instructions, active, icon } = req.body || {};
  db.prepare('UPDATE payment_settings SET display_name=COALESCE(?,display_name), account_number=COALESCE(?,account_number), instructions=COALESCE(?,instructions), active=COALESCE(?,active), icon=COALESCE(?,icon) WHERE id = ?').run(display_name ?? null, account_number ?? null, instructions ?? null, active ?? null, icon ?? null, req.params.id);
  res.json({ ok: true });
});
router.get('/site-settings', (req, res) => {
  const map = {};
  db.prepare('SELECT * FROM site_settings').all().forEach(r => map[r.key] = r.value);
  res.json({ settings: map });
});
router.put('/site-settings', adminRequired, (req, res) => {
  const upsert = db.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');
  const tx = db.transaction((obj) => { for (const [k,v] of Object.entries(obj)) upsert.run(k, String(v), Date.now()); });
  tx(req.body?.settings || {});
  res.json({ ok:true });
});
router.get('/banners', (req, res) => res.json({ banners: db.prepare('SELECT * FROM banners WHERE active = 1 ORDER BY sort_order ASC').all() }));
router.post('/banners', adminRequired, (req, res) => {
  const { title, subtitle, image_url, cta_text, cta_link, sort_order } = req.body || {};
  const info = db.prepare('INSERT INTO banners (title, subtitle, image_url, cta_text, cta_link, sort_order, active) VALUES (?,?,?,?,?,?,1)').run(title, subtitle||null, image_url||null, cta_text||null, cta_link||null, sort_order||0);
  res.json({ id: info.lastInsertRowid });
});
router.delete('/banners/:id', adminRequired, (req, res) => { db.prepare('UPDATE banners SET active=0 WHERE id = ?').run(req.params.id); res.json({ ok:true }); });
module.exports = router;
