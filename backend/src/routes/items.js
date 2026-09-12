const express = require('express');
const { db } = require('../db');
const {
  BARCODE_RE,
  cleanBarcode,
  cleanName,
  cleanField,
  knownStore,
  knownBrand,
  knownCategory,
  scanBarcode
} = require('../scanService');

const router = express.Router();

// An item only joins the shopping list once a minimum is set and stock reaches it.
const NEEDED_SQL = '(min_stock > 0 AND quantity <= min_stock)';

router.get('/items', (req, res) => {
  const q = cleanName(req.query.q);
  const neededOnly = req.query.needed === '1';
  const category = cleanField(req.query.category);
  // Absent means "either"; '1'/'0' narrow to frozen or ambient.
  const frozen = req.query.frozen === '1' ? 1 : req.query.frozen === '0' ? 0 : null;
  const rows = db
    .prepare(
      `SELECT DISTINCT i.*, ${NEEDED_SQL} AS needed FROM items i
       LEFT JOIN item_barcodes b ON b.item_id = i.id
       WHERE (@like IS NULL OR i.name LIKE @like OR b.barcode LIKE @like OR i.store LIKE @like OR i.brand LIKE @like OR i.category LIKE @like OR i.size LIKE @like)
         AND (@neededOnly = 0 OR ${NEEDED_SQL})
         AND (@category = '' OR i.category = @category)
         AND (@frozen IS NULL OR i.frozen = @frozen)
       ORDER BY i.name COLLATE NOCASE LIMIT 500`
    )
    .all({ like: q ? `%${q}%` : null, neededOnly: neededOnly ? 1 : 0, category, frozen });
  res.json(rows);
});

router.get('/items/:id/history', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare(`SELECT *, ${NEEDED_SQL} AS needed FROM items WHERE id = ?`).get(id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  item.barcodes = db
    .prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY id')
    .all(id)
    .map((r) => r.barcode);

  const scans = db
    .prepare('SELECT id, delta, scanned_at, source FROM scans WHERE item_id = ? ORDER BY id DESC LIMIT 200')
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
  const item = db
    .prepare('SELECT i.* FROM items i JOIN item_barcodes b ON b.item_id = i.id WHERE b.barcode = ?')
    .get(barcode);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// Scan endpoint: creates the item on first sight, otherwise bumps its count.
router.post('/scans', (req, res) => {
  const result = scanBarcode(req.body ?? {});
  if (result.error) return res.status(result.status).json({ error: result.error, barcode: result.barcode });
  res.status(result.status).json(result.item);
});

router.patch('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const quantity = req.body?.quantity;

  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });

  const name = cleanName(req.body?.name);
  if (name) db.prepare(`UPDATE items SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(name, id);

  for (const field of ['store', 'size', 'brand', 'category']) {
    if (typeof req.body?.[field] === 'string') {
      const value = cleanField(req.body[field]);
      if (field === 'store' && !knownStore(value)) {
        return res.status(400).json({ error: 'unknown_store' });
      }
      if (field === 'brand' && !knownBrand(value)) {
        return res.status(400).json({ error: 'unknown_brand' });
      }
      if (field === 'category' && !knownCategory(value)) {
        return res.status(400).json({ error: 'unknown_category' });
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

  if (typeof req.body?.frozen === 'boolean') {
    db.prepare(`UPDATE items SET frozen = ?, updated_at = datetime('now') WHERE id = ?`).run(
      req.body.frozen ? 1 : 0,
      id
    );
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

// Extra barcodes let the same product's differently-printed codes share one item.
router.post('/items/:id/barcodes', (req, res) => {
  const id = Number(req.params.id);
  const barcode = cleanBarcode(req.body?.barcode);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  if (!BARCODE_RE.test(barcode)) return res.status(400).json({ error: 'invalid_barcode' });

  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const existing = db.prepare('SELECT item_id FROM item_barcodes WHERE barcode = ?').get(barcode);
  if (existing) return res.status(409).json({ error: 'barcode_in_use' });

  db.prepare('INSERT INTO item_barcodes (item_id, barcode) VALUES (?, ?)').run(id, barcode);
  const barcodes = db
    .prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY id')
    .all(id)
    .map((r) => r.barcode);
  res.status(201).json({ barcodes });
});

router.delete('/items/:id/barcodes/:barcode', (req, res) => {
  const id = Number(req.params.id);
  const barcode = cleanBarcode(req.params.barcode);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM item_barcodes WHERE item_id = ?').get(id).n;
  if (count <= 1) return res.status(400).json({ error: 'last_barcode' });

  db.transaction(() => {
    db.prepare('DELETE FROM item_barcodes WHERE item_id = ? AND barcode = ?').run(id, barcode);
    // Keep the display barcode valid if the one it pointed at was just removed.
    const item = db.prepare('SELECT barcode FROM items WHERE id = ?').get(id);
    if (item.barcode === barcode) {
      const next = db.prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY id LIMIT 1').get(id);
      if (next) db.prepare('UPDATE items SET barcode = ? WHERE id = ?').run(next.barcode, id);
    }
  })();

  const barcodes = db
    .prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY id')
    .all(id)
    .map((r) => r.barcode);
  res.json({ barcodes });
});

// Folds a duplicate item's barcodes, scans and stock into another item.
router.post('/items/:id/merge', (req, res) => {
  const id = Number(req.params.id);
  const intoId = Number(req.body?.intoId);
  if (!Number.isInteger(id) || !Number.isInteger(intoId) || id === intoId) {
    return res.status(400).json({ error: 'invalid_merge' });
  }

  const result = db.transaction(() => {
    const source = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    const target = db.prepare('SELECT * FROM items WHERE id = ?').get(intoId);
    if (!source || !target) return null;

    db.prepare('UPDATE item_barcodes SET item_id = ? WHERE item_id = ?').run(intoId, id);
    db.prepare('UPDATE scans SET item_id = ? WHERE item_id = ?').run(intoId, id);
    db.prepare(`UPDATE items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(
      source.quantity,
      intoId
    );
    db.prepare('DELETE FROM items WHERE id = ?').run(id);

    return db.prepare(`SELECT *, ${NEEDED_SQL} AS needed FROM items WHERE id = ?`).get(intoId);
  })();

  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json(result);
});

router.get('/scans', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id, s.delta, s.scanned_at, s.created, s.source, i.barcode, i.name, i.store, i.category, i.size, i.frozen
       FROM scans s JOIN items i ON i.id = s.item_id
       ORDER BY s.id DESC LIMIT 100`
    )
    .all();
  res.json(rows);
});

module.exports = router;
