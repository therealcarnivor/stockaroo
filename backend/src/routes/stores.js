const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../session');

const router = express.Router();

const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM stores ORDER BY name COLLATE NOCASE').all());
});

router.post('/', requireAdmin, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'invalid_store' });
  if (db.prepare('SELECT 1 FROM stores WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'store_exists' });
  }

  const info = db.prepare('INSERT INTO stores (name) VALUES (?)').run(name);
  res.status(201).json(db.prepare('SELECT id, name FROM stores WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = cleanName(req.body?.name);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'not_found' });
  if (!name) return res.status(400).json({ error: 'invalid_store' });
  if (db.prepare('SELECT 1 FROM stores WHERE name = ? AND id <> ?').get(name, id)) {
    return res.status(409).json({ error: 'store_exists' });
  }

  db.transaction(() => {
    db.prepare('UPDATE stores SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE items SET store = ? WHERE store = ?').run(name, store.name);
  })();

  res.json(db.prepare('SELECT id, name FROM stores WHERE id = ?').get(id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'not_found' });

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM items WHERE store = ?').get(store.name);
  if (n > 0 && !req.query.force) return res.status(409).json({ error: 'store_in_use', items: n });

  db.transaction(() => {
    db.prepare(`UPDATE items SET store = '' WHERE store = ?`).run(store.name);
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);
  })();

  res.status(204).end();
});

module.exports = router;
