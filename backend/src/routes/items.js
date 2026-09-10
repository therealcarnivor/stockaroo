const express = require('express');
const { db } = require('../db');

const router = express.Router();

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;

const cleanBarcode = (v) => (typeof v === 'string' ? v.trim() : '');
const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
const cleanField = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

// Stores are curated by admins; items may only reference an existing one (or none).
const knownStore = (name) =>
  name === '' || !!db.prepare('SELECT 1 FROM stores WHERE name = ?').get(name);

// An item only joins the shopping list once a minimum is set and stock reaches it.
const NEEDED_SQL = '(min_stock > 0 AND quantity <= min_stock)';

router.get('/items', (req, res) => {
  const q = cleanName(req.query.q);
  const neededOnly = req.query.needed === '1';
  const rows = db
    .prepare(
      `SELECT *, ${NEEDED_SQL} AS needed FROM items
       WHERE (@like IS NULL OR name LIKE @like OR barcode LIKE @like OR store LIKE @like OR size LIKE @like)
         AND (@neededOnly = 0 OR ${NEEDED_SQL})
       ORDER BY name COLLATE NOCASE LIMIT 500`
    )
    .all({ like: q ? `%${q}%` : null, neededOnly: neededOnly ? 1 : 0 });
  res.json(rows);
});

router.get('/items/:id/history', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare(`SELECT *, ${NEEDED_SQL} AS needed FROM items WHERE id = ?`).get(id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const scans = db
    .prepare('SELECT id, delta, scanned_at FROM scans WHERE item_id = ? ORDER BY id DESC LIMIT 200')
    .all(id);
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN delta > 0 THEN delta END), 0) AS added,
         COALESCE(SUM(CASE WHEN delta < 0 THEN -delta END), 0) AS removed,
         COUNT(*) AS events
       FROM scans WHERE item_id = ?`
    )
    .get(id);

  res.json({ item, scans, totals });
});

router.get('/items/:barcode', (req, res) => {
  const barcode = cleanBarcode(req.params.barcode);
  const item = db.prepare('SELECT * FROM items WHERE barcode = ?').get(barcode);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// Scan endpoint: creates the item on first sight, otherwise bumps its count.
router.post('/scans', (req, res) => {
  const barcode = cleanBarcode(req.body?.barcode);
  const name = cleanName(req.body?.name);
  const store = cleanField(req.body?.store);
  const size = cleanField(req.body?.size);
  const delta = Number.isInteger(req.body?.delta) ? req.body.delta : 1;

  if (!BARCODE_RE.test(barcode)) return res.status(400).json({ error: 'invalid_barcode' });
  if (Math.abs(delta) > 1000) return res.status(400).json({ error: 'invalid_delta' });
  if (!knownStore(store)) return res.status(400).json({ error: 'unknown_store' });

  const result = db.transaction(() => {
    let item = db.prepare('SELECT * FROM items WHERE barcode = ?').get(barcode);
    let created = false;

    if (!item) {
      if (!name) return { needsName: true, barcode };
      const info = db
        .prepare('INSERT INTO items (barcode, name, store, size, quantity) VALUES (?, ?, ?, ?, 0)')
        .run(barcode, name, store, size);
      item = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
      created = true;
    }

    db.prepare('INSERT INTO scans (item_id, delta) VALUES (?, ?)').run(item.id, delta);
    db.prepare(
      `UPDATE items SET quantity = MAX(quantity + ?, 0), updated_at = datetime('now') WHERE id = ?`
    ).run(delta, item.id);

    return { created, item: db.prepare('SELECT * FROM items WHERE id = ?').get(item.id) };
  })();

  if (result.needsName) return res.status(404).json({ error: 'unknown_barcode', barcode });
  res.status(result.created ? 201 : 200).json(result.item);
});

router.patch('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const quantity = req.body?.quantity;

  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });

  const name = cleanName(req.body?.name);
  if (name) db.prepare(`UPDATE items SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);

  for (const field of ['store', 'size']) {
    if (typeof req.body?.[field] === 'string') {
      const value = cleanField(req.body[field]);
      if (field === 'store' && !knownStore(value)) {
        return res.status(400).json({ error: 'unknown_store' });
      }
      db.prepare(`UPDATE items SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`).run(
        value,
        id
      );
    }
  }

  if (Number.isInteger(quantity) && quantity >= 0) {
    db.prepare(`UPDATE items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(quantity, id);
  }

  if (typeof req.body?.min_stock !== 'undefined') {
    const min = Number(req.body.min_stock);
    if (!Number.isInteger(min) || min < 0 || min > 10000) {
      return res.status(400).json({ error: 'invalid_min_stock' });
    }
    db.prepare('UPDATE items SET min_stock = ? WHERE id = ?').run(min, id);
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

router.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  res.status(204).end();
});

router.get('/scans', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id, s.delta, s.scanned_at, i.barcode, i.name, i.store, i.size
       FROM scans s JOIN items i ON i.id = s.item_id
       ORDER BY s.id DESC LIMIT 100`
    )
    .all();
  res.json(rows);
});

module.exports = router;
