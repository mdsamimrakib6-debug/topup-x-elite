const express = require('express');
const router = express.Router();
const db = require('../db');
const { adminRequired } = require('../middleware/auth');

router.get('/stats', adminRequired, (req, res) => {
  const totals = db.prepare(`SELECT
    COUNT(*) as total_orders,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
    COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END), 0) as revenue
    FROM orders`).get();
  const user_count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const recent_orders = db.prepare(`SELECT o.order_id, o.diamonds, o.amount, o.status, o.created_at, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 10`).all();
  res.json({ totals, user_count, recent_orders });
});

router.get('/users', adminRequired, (req, res) => {
  const rows = db.prepare('SELECT id, username, email, phone, role, wallet_balance, referral_code, created_at, last_login_at FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows });
});

router.put('/users/:id', adminRequired, (req, res) => {
  const { wallet_balance, role, phone } = req.body || {};
  const user = db.prepare('SELECT id, wallet_balance, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (role && !['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const balance = wallet_balance == null ? user.wallet_balance : Number(wallet_balance);
  if (!Number.isFinite(balance) || balance < 0) return res.status(400).json({ error: 'Invalid wallet balance' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET wallet_balance = COALESCE(?, wallet_balance), role = COALESCE(?, role), phone = COALESCE(?, phone) WHERE id = ?')
      .run(wallet_balance == null ? null : balance, role ?? null, phone ?? null, req.params.id);
    if (wallet_balance != null && balance !== Number(user.wallet_balance)) {
      db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)')
        .run(req.params.id, balance > Number(user.wallet_balance) ? 'admin_credit' : 'admin_debit', balance - Number(user.wallet_balance), balance, 'Admin balance adjustment', Date.now());
    }
  });
  tx();
  res.json({ ok: true });
});

router.get('/wallet-transactions', adminRequired, (req, res) => {
  const rows = db.prepare(`SELECT w.*, u.username, u.email FROM wallet_transactions w JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 300`).all();
  res.json({ transactions: rows });
});

router.get('/payment-settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM payment_settings ORDER BY id ASC').all();
  res.json({ methods: rows });
});

router.post('/payment-settings', adminRequired, (req, res) => {
  const { method, display_name, account_number, instructions, active } = req.body || {};
  if (!method || !display_name) return res.status(400).json({ error: 'method and display_name required' });
  const existing = db.prepare('SELECT id FROM payment_settings WHERE method = ?').get(method);
  if (existing) {
    db.prepare(`UPDATE payment_settings SET display_name = ?, account_number = ?, instructions = ?, active = ? WHERE method = ?`)
      .run(display_name, account_number || null, instructions || null, active ?? 1, method);
    return res.json({ ok: true, id: existing.id });
  }
  const info = db.prepare(`INSERT INTO payment_settings (method, display_name, account_number, instructions, active) VALUES (?,?,?,?,?)`)
    .run(method, display_name, account_number || null, instructions || null, active ?? 1);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/payment-settings/:id', adminRequired, (req, res) => {
  const { display_name, account_number, instructions, active } = req.body || {};
  db.prepare(`UPDATE payment_settings SET display_name = COALESCE(?, display_name), account_number = COALESCE(?, account_number),
              instructions = COALESCE(?, instructions), active = COALESCE(?, active) WHERE id = ?`)
    .run(display_name ?? null, account_number ?? null, instructions ?? null, active ?? null, req.params.id);
  res.json({ ok: true });
});

router.get('/site-settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM site_settings').all();
  const map = {};
  rows.forEach(r => map[r.key] = r.value);
  res.json({ settings: map });
});

router.put('/site-settings', adminRequired, (req, res) => {
  const entries = req.body?.settings || {};
  const upsert = db.prepare(`INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const tx = db.transaction((obj) => { for (const [k, v] of Object.entries(obj)) upsert.run(String(k), String(v)); });
  tx(entries);
  res.json({ ok: true });
});

router.get('/banners', (req, res) => {
  const rows = db.prepare('SELECT * FROM banners WHERE active = 1 ORDER BY sort_order ASC').all();
  res.json({ banners: rows });
});
router.get('/banners/all', adminRequired, (req, res) => res.json({ banners: db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id ASC').all() }));

router.post('/banners', adminRequired, (req, res) => {
  const { title, subtitle, image_url, cta_text, cta_link, sort_order, active } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare(`INSERT INTO banners (title, subtitle, image_url, cta_text, cta_link, active, sort_order) VALUES (?,?,?,?,?,?,?)`)
    .run(title, subtitle || null, image_url || null, cta_text || null, cta_link || null, active === 0 ? 0 : 1, Number(sort_order) || 0);
  res.json({ id: info.lastInsertRowid });
});
router.put('/banners/:id', adminRequired, (req, res) => {
  const { title, subtitle, image_url, cta_text, cta_link, active, sort_order } = req.body || {};
  db.prepare(`UPDATE banners SET title = COALESCE(?, title), subtitle = COALESCE(?, subtitle), image_url = COALESCE(?, image_url),
              cta_text = COALESCE(?, cta_text), cta_link = COALESCE(?, cta_link), active = COALESCE(?, active), sort_order = COALESCE(?, sort_order) WHERE id = ?`)
    .run(title ?? null, subtitle ?? null, image_url ?? null, cta_text ?? null, cta_link ?? null, active ?? null, sort_order ?? null, req.params.id);
  res.json({ ok: true });
});
router.delete('/banners/:id', adminRequired, (req, res) => { db.prepare('UPDATE banners SET active = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

router.get('/reviews', (req, res) => res.json({ reviews: db.prepare('SELECT * FROM reviews WHERE active = 1 ORDER BY sort_order ASC, id DESC').all() }));
router.get('/reviews/all', adminRequired, (req, res) => res.json({ reviews: db.prepare('SELECT * FROM reviews ORDER BY sort_order ASC, id DESC').all() }));
router.post('/reviews', adminRequired, (req, res) => {
  const { name, location, rating, quote, verified, active, sort_order } = req.body || {};
  const r = Number(rating);
  if (!name || !quote || !Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'name, quote and rating 1-5 required' });
  const info = db.prepare('INSERT INTO reviews (name, location, rating, quote, verified, active, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(name, location || null, r, quote, verified === 0 ? 0 : 1, active === 0 ? 0 : 1, Number(sort_order) || 0, Date.now());
  res.json({ id: info.lastInsertRowid });
});
router.put('/reviews/:id', adminRequired, (req, res) => {
  const { name, location, rating, quote, verified, active, sort_order } = req.body || {};
  const r = rating == null ? null : Number(rating);
  if (r != null && (!Number.isInteger(r) || r < 1 || r > 5)) return res.status(400).json({ error: 'Rating must be 1-5' });
  db.prepare(`UPDATE reviews SET name=COALESCE(?,name), location=COALESCE(?,location), rating=COALESCE(?,rating), quote=COALESCE(?,quote), verified=COALESCE(?,verified), active=COALESCE(?,active), sort_order=COALESCE(?,sort_order) WHERE id=?`)
    .run(name ?? null, location ?? null, r, quote ?? null, verified ?? null, active ?? null, sort_order ?? null, req.params.id);
  res.json({ ok: true });
});
router.delete('/reviews/:id', adminRequired, (req, res) => { db.prepare('UPDATE reviews SET active = 0 WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

module.exports = router;
