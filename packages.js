const express = require('express');
const router = express.Router();
const db = require('../db');
const { adminRequired } = require('../middleware/auth');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY sort_order ASC, diamonds ASC').all();
  res.json({ packages: rows });
});

router.post('/', adminRequired, (req, res) => {
  const { diamonds, price, label, bonus, badge, sort_order, active } = req.body || {};
  const d = Number(diamonds), p = Number(price);
  if (!Number.isInteger(d) || d <= 0 || !Number.isFinite(p) || p < 0 || !label) return res.status(400).json({ error: 'Valid diamonds, price and label required' });
  const info = db.prepare(`INSERT INTO packages (diamonds, price, label, bonus, badge, sort_order, active) VALUES (?,?,?,?,?,?,?)`)
    .run(d, p, String(label).trim(), Number(bonus) || 0, badge || null, Number(sort_order) || 0, active === 0 ? 0 : 1);
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', adminRequired, (req, res) => {
  const { diamonds, price, label, bonus, badge, sort_order, active } = req.body || {};
  if (diamonds != null && (!Number.isInteger(Number(diamonds)) || Number(diamonds) <= 0)) return res.status(400).json({ error: 'Invalid diamonds' });
  if (price != null && (!Number.isFinite(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'Invalid price' });
  db.prepare(`UPDATE packages SET diamonds = COALESCE(?, diamonds), price = COALESCE(?, price), label = COALESCE(?, label),
              bonus = COALESCE(?, bonus), badge = COALESCE(?, badge), sort_order = COALESCE(?, sort_order), active = COALESCE(?, active) WHERE id = ?`)
    .run(diamonds ?? null, price ?? null, label ?? null, bonus ?? null, badge ?? null, sort_order ?? null, active ?? null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', adminRequired, (req, res) => {
  db.prepare('UPDATE packages SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
