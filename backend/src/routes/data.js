const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../session');

const router = express.Router();

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const BACKUP_VERSION = 3;

const NEEDED_SQL = '(min_stock > 0 AND quantity <= min_stock)';

router.get('/stats', (req, res) => {
  const items = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(frozen), 0) AS frozen,
         COALESCE(SUM(${NEEDED_SQL}), 0) AS needed,
         COALESCE(SUM(quantity = 0), 0) AS outOfStock
       FROM items`
    )
    .get();
  const stores = db.prepare('SELECT COUNT(*) AS total FROM stores').get();
  const users = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  res.json({
    items: items.total,
    frozenItems: items.frozen,
    neededItems: items.needed,
    outOfStockItems: items.outOfStock,
    stores: stores.total,
    users: users.total
  });
});

// Bulk reset: keeps every item's identity/details but drops all quantities to 0.
router.post('/zero-stock', requireAdmin, (req, res) => {
  const result = db.prepare(`UPDATE items SET quantity = 0, updated_at = datetime('now')`).run();
  res.json({ items: result.changes });
});

// Full-database snapshot. Includes password hashes, so treat the file as a secret.
router.get('/backup', requireAdmin, (req, res) => {  res.setHeader('Content-Disposition', 'attachment; filename="stockaroo-backup.json"');
  res.json({
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    stores: db.prepare('SELECT id, name, created_at FROM stores ORDER BY id').all(),
    items: db
      .prepare(
        `SELECT id, barcode, name, store, size, quantity, min_stock, frozen, created_at, updated_at
         FROM items ORDER BY id`
      )
      .all(),
    item_barcodes: db
      .prepare('SELECT id, item_id, barcode, created_at FROM item_barcodes ORDER BY id')
      .all(),
    scans: db.prepare('SELECT id, item_id, delta, scanned_at FROM scans ORDER BY id').all(),
    users: db
      .prepare(
        `SELECT id, username, password_hash, is_admin, must_change_password, avatar, created_at
         FROM users ORDER BY id`
      )
      .all()
  });
});

router.post('/restore', requireAdmin, (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid_payload' });
  if (![2, 3].includes(Number(data.version))) {
    return res.status(400).json({ error: 'unsupported_version' });
  }

  const stores = Array.isArray(data.stores) ? data.stores : [];
  const items = Array.isArray(data.items) ? data.items : [];
  const itemBarcodes = Array.isArray(data.item_barcodes) ? data.item_barcodes : [];
  const scans = Array.isArray(data.scans) ? data.scans : [];
  const users = Array.isArray(data.users) ? data.users : [];

  if (items.length > 50000 || scans.length > 500000) {
    return res.status(413).json({ error: 'backup_too_large' });
  }
  for (const item of items) {
    if (!BARCODE_RE.test(String(item?.barcode ?? ''))) {
      return res.status(400).json({ error: 'invalid_item', barcode: item?.barcode });
    }
  }
  // Refuse a restore that would leave nobody able to administer the instance.
  if (!users.some((u) => u?.is_admin && u?.username && u?.password_hash)) {
    return res.status(400).json({ error: 'no_admin_in_backup' });
  }

  const result = db.transaction(() => {
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM scans').run();
    db.prepare('DELETE FROM item_barcodes').run();
    db.prepare('DELETE FROM items').run();
    db.prepare('DELETE FROM stores').run();
    db.prepare('DELETE FROM users').run();

    const addStore = db.prepare(
      `INSERT INTO stores (id, name, created_at) VALUES (?, ?, COALESCE(?, datetime('now')))`
    );
    for (const s of stores) addStore.run(s.id ?? null, String(s.name).slice(0, 60), s.created_at ?? null);

    const addItem = db.prepare(
      `INSERT INTO items (id, barcode, name, store, size, quantity, min_stock, frozen, created_at, updated_at)
       VALUES (@id, @barcode, @name, @store, @size, @quantity, @min_stock, @frozen,
               COALESCE(@created_at, datetime('now')), COALESCE(@updated_at, datetime('now')))`
    );
    for (const i of items) {
      addItem.run({
        id: i.id ?? null,
        barcode: String(i.barcode),
        name: String(i.name ?? '').slice(0, 200) || String(i.barcode),
        store: String(i.store ?? '').slice(0, 60),
        size: String(i.size ?? '').slice(0, 60),
        quantity: Number.isInteger(i.quantity) && i.quantity >= 0 ? i.quantity : 0,
        min_stock: Number.isInteger(i.min_stock) && i.min_stock >= 0 ? i.min_stock : 0,
        frozen: i.frozen ? 1 : 0,
        created_at: i.created_at ?? null,
        updated_at: i.updated_at ?? null
      });
    }

    const itemIds = new Set(db.prepare('SELECT id FROM items').all().map((r) => r.id));

    const addItemBarcode = db.prepare(
      `INSERT INTO item_barcodes (id, item_id, barcode, created_at)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')))`
    );
    // v2 backups predate aliasing, so fall back to each item's own barcode.
    const barcodeRows =
      Number(data.version) >= 3 ? itemBarcodes : items.map((i) => ({ item_id: i.id, barcode: i.barcode }));
    for (const b of barcodeRows) {
      if (!itemIds.has(b.item_id)) continue;
      addItemBarcode.run(b.id ?? null, b.item_id, String(b.barcode), b.created_at ?? null);
    }

    const addScan = db.prepare(
      `INSERT INTO scans (id, item_id, delta, scanned_at)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')))`
    );
    let restoredScans = 0;
    for (const s of scans) {
      if (!itemIds.has(s.item_id)) continue;
      addScan.run(s.id ?? null, s.item_id, Number.isInteger(s.delta) ? s.delta : 1, s.scanned_at ?? null);
      restoredScans += 1;
    }

    const addUser = db.prepare(
      `INSERT INTO users (id, username, password_hash, is_admin, must_change_password, avatar, created_at)
       VALUES (@id, @username, @password_hash, @is_admin, @must_change_password,
               COALESCE(@avatar, '📦'), COALESCE(@created_at, datetime('now')))`
    );
    for (const u of users) {
      addUser.run({
        id: u.id ?? null,
        username: String(u.username).slice(0, 32),
        password_hash: String(u.password_hash),
        is_admin: u.is_admin ? 1 : 0,
        must_change_password: u.must_change_password ? 1 : 0,
        avatar: u.avatar ?? null,
        created_at: u.created_at ?? null
      });
    }

    return { stores: stores.length, items: items.length, scans: restoredScans, users: users.length };
  })();

  res.json(result);
});

module.exports = router;
