const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../session');

const router = express.Router();

const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT b.id, b.name,
                (SELECT COUNT(*) FROM items i WHERE i.brand = b.name) AS itemCount
         FROM brands b ORDER BY b.name COLLATE NOCASE`
      )
      .all()
  );
});

router.post('/', requireAdmin, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'invalid_brand' });
  if (db.prepare('SELECT 1 FROM brands WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'brand_exists' });
  }

  const info = db.prepare('INSERT INTO brands (name) VALUES (?)').run(name);
  res.status(201).json(db.prepare('SELECT id, name FROM brands WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = cleanName(req.body?.name);
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
  if (!brand) return res.status(404).json({ error: 'not_found' });
  if (!name) return res.status(400).json({ error: 'invalid_brand' });
  if (db.prepare('SELECT 1 FROM brands WHERE name = ? AND id <> ?').get(name, id)) {
    return res.status(409).json({ error: 'brand_exists' });
  }

  db.transaction(() => {
    db.prepare('UPDATE brands SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE items SET brand = ? WHERE brand = ?').run(name, brand.name);
  })();

  res.json(db.prepare('SELECT id, name FROM brands WHERE id = ?').get(id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
  if (!brand) return res.status(404).json({ error: 'not_found' });

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM items WHERE brand = ?').get(brand.name);
  if (n > 0 && !req.query.force) return res.status(409).json({ error: 'brand_in_use', items: n });

  db.transaction(() => {
    db.prepare(`UPDATE items SET brand = '' WHERE brand = ?`).run(brand.name);
    db.prepare('DELETE FROM brands WHERE id = ?').run(id);
  })();

  res.status(204).end();
});

module.exports = router;
