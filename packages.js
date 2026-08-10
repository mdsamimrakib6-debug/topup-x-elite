const express = require('express');
const router = express.Router();
const db = require('../db');
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY popular DESC, sort_order ASC, diamonds ASC').all();
  res.json({ packages: rows });
});
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ package: row });
});
router.post('/', (req, res) => {
  const { diamonds, price, original_price, discount, label, description, image_url, stock, badge, popular, sort_order } = req.body || {};
  if (!diamonds || !price || !label) return res.status(400).json({ error: 'diamonds, price, label required' });
  const info = db.prepare('INSERT INTO packages (diamonds, price, original_price, discount, label, description, image_url, stock, badge, popular, sort_order, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)')
    .run(diamonds, price, original_price || null, discount || 0, label, description || null, image_url || null, stock ?? -1, badge || null, popular ? 1 : 0, sort_order || 0);
  res.json({ id: info.lastInsertRowid });
});
router.put('/:id', (req, res) => {
  const p = req.body || {};
  db.prepare('UPDATE packages SET diamonds=COALESCE(?,diamonds),price=COALESCE(?,price),original_price=COALESCE(?,original_price),discount=COALESCE(?,discount),label=COALESCE(?,label),description=COALESCE(?,description),image_url=COALESCE(?,image_url),stock=COALESCE(?,stock),badge=COALESCE(?,badge),popular=COALESCE(?,popular),sort_order=COALESCE(?,sort_order),active=COALESCE(?,active) WHERE id = ?')
    .run(p.diamonds ?? null, p.price ?? null, p.original_price ?? null, p.discount ?? null, p.label ?? null, p.description ?? null, p.image_url ?? null, p.stock ?? null, p.badge ?? null, p.popular ?? null, p.sort_order ?? null, p.active ?? null, req.params.id);
  res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE packages SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
module.exports = router;
