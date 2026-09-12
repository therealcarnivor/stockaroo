const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../session');

const router = express.Router();

const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT c.id, c.name,
                (SELECT COUNT(*) FROM items i WHERE i.category = c.name) AS itemCount
         FROM categories c ORDER BY c.name COLLATE NOCASE`
      )
      .all()
  );
});

router.post('/', requireAdmin, (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'invalid_category' });
  if (db.prepare('SELECT 1 FROM categories WHERE name = ?').get(name)) {
    return res.status(409).json({ error: 'category_exists' });
  }

  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.status(201).json(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = cleanName(req.body?.name);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) return res.status(404).json({ error: 'not_found' });
  if (!name) return res.status(400).json({ error: 'invalid_category' });
  if (db.prepare('SELECT 1 FROM categories WHERE name = ? AND id <> ?').get(name, id)) {
    return res.status(409).json({ error: 'category_exists' });
  }

  db.transaction(() => {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE items SET category = ? WHERE category = ?').run(name, category.name);
  })();

  res.json(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(id));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) return res.status(404).json({ error: 'not_found' });

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM items WHERE category = ?').get(category.name);
  if (n > 0 && !req.query.force) return res.status(409).json({ error: 'category_in_use', items: n });

  db.transaction(() => {
    db.prepare(`UPDATE items SET category = '' WHERE category = ?`).run(category.name);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  })();

  res.status(204).end();
});

module.exports = router;
