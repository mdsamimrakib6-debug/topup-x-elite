const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { requestTopUp } = require('../topupProvider');

const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const STATUSES = ['pending_payment', 'payment_verification', 'processing', 'completed', 'cancelled', 'failed'];

function todayKey(d = new Date()) {
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
}
function genOrderId() {
  const dateKey = todayKey();
  const row = db.prepare("SELECT COUNT(*) as n FROM orders WHERE order_id LIKE ?").get('TXE-' + dateKey + '-%');
  return 'TXE-' + dateKey + '-' + String((row?.n || 0) + 1).padStart(4, '0');
}
function publicOrder(o) {
  return { id: o.order_id, diamonds: o.diamonds, amount: o.amount, discount: o.discount, player_uid: o.player_uid, server_id: o.server_id,
    payment_method: o.payment_method, transaction_id: o.transaction_id, customer_phone: o.customer_phone, status: o.status,
    delivery_status: o.delivery_status, created_at: o.created_at, updated_at: o.updated_at, note: o.note, package_label: o.label };
}

router.post('/', authRequired, createLimiter, (req, res) => {
  try {
    const { package_id, custom_diamonds, player_uid, server_id, payment_method, transaction_id, customer_phone, note } = req.body || {};
    if (!player_uid || !payment_method || !customer_phone) return res.status(400).json({ error: 'player_uid, payment_method, customer_phone required' });
    if (!/^\d{6,15}$/.test(String(player_uid))) return res.status(400).json({ error: 'UID must be 6-15 digits' });
    if (!/^\d{8,15}$/.test(String(customer_phone).replace(/\D/g, ''))) return res.status(400).json({ error: 'Invalid phone' });
    let pkg = null, diamonds = 0, amount = 0, discount = 0;
    if (package_id) {
      pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(package_id);
      if (!pkg) return res.status(400).json({ error: 'Invalid package' });
      if (pkg.stock === 0) return res.status(400).json({ error: 'Package out of stock' });
      diamonds = pkg.diamonds; amount = pkg.price; discount = pkg.discount || 0;
    } else if (Number(custom_diamonds) > 0) {
      diamonds = Number(custom_diamonds); amount = Math.round(diamonds * 0.78 * 100) / 100;
    } else return res.status(400).json({ error: 'Choose package or custom_diamonds' });

    const order_id = genOrderId();
    db.prepare('INSERT INTO orders (order_id, user_id, package_id, diamonds, amount, discount, player_uid, server_id, payment_method, transaction_id, customer_phone, note, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(order_id, req.user.id, pkg?.id || null, diamonds, amount, discount, player_uid, server_id || null, payment_method, transaction_id || null, customer_phone, note || null, 'pending_payment', Date.now(), Date.now());
    const row = db.prepare('SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.order_id = ?').get(order_id);
    res.json({ order: publicOrder(row) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/mine', authRequired, (req, res) => {
  const rows = db.prepare('SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 200').all(req.user.id);
  res.json({ orders: rows.map(publicOrder) });
});
router.get('/track/:order_id', (req, res) => {
  const row = db.prepare('SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.order_id = ?').get(req.params.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: publicOrder(row) });
});
router.get('/', adminRequired, (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT o.*, p.label, u.username, u.email FROM orders o LEFT JOIN packages p ON o.package_id = p.id LEFT JOIN users u ON o.user_id = u.id';
  const conds = [], params = [];
  if (status) { conds.push('o.status = ?'); params.push(status); }
  if (q) { conds.push('(o.order_id LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR o.player_uid LIKE ?)'); params.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY o.created_at DESC LIMIT 500';
  res.json({ orders: db.prepare(sql).all(...params).map(o => ({ ...publicOrder(o), username: o.username, email: o.email })) });
});

router.put('/:order_id/status', adminRequired, async (req, res) => {
  const { status, note, delivery_status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status', allowed: STATUSES });
  const row = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.order_id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  db.prepare('UPDATE orders SET status=?, note=COALESCE(?, note), delivery_status=COALESCE(?, delivery_status), updated_at=? WHERE order_id=?')
    .run(status, note ?? null, delivery_status ?? null, Date.now(), req.params.order_id);

  if (status === 'processing') {
    const provider = await requestTopUp({ order_id: row.order_id, diamonds: row.diamonds, player_uid: row.player_uid, server_id: row.server_id });
    db.prepare('UPDATE orders SET delivery_status = ? WHERE order_id = ?').run(provider.message, row.order_id);
  }

  if (status === 'completed' && row.status !== 'completed') {
    const cb = db.prepare("SELECT value FROM site_settings WHERE key='cashback_percent'").get();
    const pct = cb ? Number(cb.value) || 0 : 0;
    if (pct > 0 && row.user_id) {
      const amt = Math.round((row.amount * (pct / 100)) * 100) / 100;
      const u = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(row.user_id);
      const newBal = (u.wallet_balance || 0) + amt;
      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBal, row.user_id);
      db.prepare('INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note, reference, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(row.user_id, 'cashback', amt, newBal, `Cashback ${pct}% for ${row.order_id}`, row.order_id, Date.now());
      db.prepare('INSERT INTO rewards (user_id, reward_type, amount, description, reference, created_at) VALUES (?,?,?,?,?,?)')
        .run(row.user_id, 'cashback', amt, `${pct}% cashback for ${row.order_id}`, row.order_id, Date.now());
    }
  }
  const updated = db.prepare('SELECT o.*, p.label FROM orders o LEFT JOIN packages p ON o.package_id = p.id WHERE o.order_id = ?').get(req.params.order_id);
  res.json({ ok: true, order: publicOrder(updated) });
});
module.exports = router;
