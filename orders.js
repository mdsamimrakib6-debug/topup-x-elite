const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

function genOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return 'TXE-' + ts + '-' + r;
}

function publicOrder(o) {
  return { id: o.order_id, diamonds: o.diamonds, amount: o.amount, player_uid: o.player_uid, server_id: o.server_id,
    payment_method: o.payment_method, transaction_id: o.transaction_id, customer_phone: o.customer_phone,
    status: o.status, created_at: o.created_at, updated_at: o.updated_at, note: o.note,
    package_label: o.label };
}

router.post('/', authRequired, createLimiter, (req, res) => {
  try {
    const { package_id, custom_diamonds, player_uid, server_id, payment_method, transaction_id, customer_phone, note } = req.body || {};
    if (!player_uid || !payment_method || !customer_phone) return res.status(400).json({ error: 'player_uid, payment_method, customer_phone are required' });
    if (!/^\d{5,20}$/.test(String(player_uid))) return res.status(400).json({ error: 'Player UID must be 5-20 digits' });
    if (!/^\d{8,15}$/.test(String(customer_phone).replace(/\D/g, ''))) return res.status(400).json({ error: 'Invalid phone number' });

    let pkg = null;
    if (package_id) {
      pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(package_id);
      if (!pkg) return res.status(400).json({ error: 'Invalid package' });
    } else if (custom_diamonds && Number(custom_diamonds) > 0) {
      pkg = { diamonds: Number(custom_diamonds), label: 'Custom Package', price: Number(custom_diamonds) * 0.78 };
    } else {
      return res.status(400).json({ error: 'Choose a package or set custom_diamonds' });
    }

    const order_id = genOrderId();
    db.prepare(`INSERT INTO orders (order_id, user_id, package_id, diamonds, amount, player_uid, server_id, payment_method, transaction_id, customer_phone, note, status, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(order_id, req.user.id, pkg.id || null, pkg.diamonds, pkg.price, player_uid, server_id || null, payment_method, transaction_id || null, customer_phone, note || null, 'pending', Date.now(), Date.now());

    const row = db.prepare(`SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.order_id = ?`).get(order_id);
    res.json({ order: publicOrder(row) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/mine', authRequired, (req, res) => {
  const rows = db.prepare(`SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.user_id = ? ORDER BY o.created_at DESC`).all(req.user.id);
  res.json({ orders: rows.map(publicOrder) });
});

router.get('/track/:order_id', (req, res) => {
  const row = db.prepare(`SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.order_id = ?`).get(req.params.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: publicOrder(row) });
});

router.get('/', adminRequired, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare(`SELECT o.*, p.label, u.username, u.email FROM orders o LEFT JOIN packages p ON o.package_id = p.id LEFT JOIN users u ON o.user_id = u.id WHERE o.status = ? ORDER BY o.created_at DESC`).all(status);
  } else {
    rows = db.prepare(`SELECT o.*, p.label, u.username, u.email FROM orders o LEFT JOIN packages p ON o.package_id = p.id LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`).all();
  }
  res.json({ orders: rows.map(o => ({ ...publicOrder(o), username: o.username, email: o.email })) });
});

router.put('/:order_id/status', adminRequired, (req, res) => {
  const { status, note } = req.body || {};
  const allowed = ['pending', 'processing', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const row = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status = ?, note = COALESCE(?, note), updated_at = ? WHERE order_id = ?').run(status, note ?? null, Date.now(), req.params.order_id);
  res.json({ ok: true });
});

module.exports = router;
