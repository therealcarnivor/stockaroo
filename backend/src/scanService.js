const { db } = require('./db');

const BARCODE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SCAN_SOURCES = new Set(['hand', 'mqtt', 'manual']);

const cleanBarcode = (v) => (typeof v === 'string' ? v.trim() : '');
const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
const cleanField = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

const knownStore = (name) =>
  name === '' || !!db.prepare('SELECT 1 FROM stores WHERE name = ?').get(name);

const knownBrand = (name) =>
  name === '' || !!db.prepare('SELECT 1 FROM brands WHERE name = ?').get(name);

const knownCategory = (name) =>
  name === '' || !!db.prepare('SELECT 1 FROM categories WHERE name = ?').get(name);

const cleanSource = (v) => (SCAN_SOURCES.has(v) ? v : 'hand');

const scanBarcode = ({ barcode: rawBarcode, name: rawName, store: rawStore, brand: rawBrand, category: rawCategory, size: rawSize, frozen: rawFrozen, delta: rawDelta, source: rawSource }) => {
  const barcode = cleanBarcode(rawBarcode);
  const name = cleanName(rawName);
  const store = cleanField(rawStore);
  const brand = cleanField(rawBrand);
  const category = cleanField(rawCategory);
  const size = cleanField(rawSize);
  const frozen = rawFrozen ? 1 : 0;
  const delta = Number.isInteger(rawDelta) ? rawDelta : 1;
  const source = cleanSource(rawSource);

  if (!BARCODE_RE.test(barcode)) return { status: 400, error: 'invalid_barcode' };
  if (Math.abs(delta) > 1000) return { status: 400, error: 'invalid_delta' };
  if (!knownStore(store)) return { status: 400, error: 'unknown_store' };
  if (!knownBrand(brand)) return { status: 400, error: 'unknown_brand' };
  if (!knownCategory(category)) return { status: 400, error: 'unknown_category' };

  return db.transaction(() => {
    let item = db
      .prepare('SELECT i.* FROM items i JOIN item_barcodes b ON b.item_id = i.id WHERE b.barcode = ?')
      .get(barcode);
    let created = false;

    if (!item) {
      if (!name) return { status: 404, error: 'unknown_barcode', barcode };
      const info = db
        .prepare(
          'INSERT INTO items (barcode, name, store, brand, category, size, frozen, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
        )
        .run(barcode, name, store, brand, category, size, frozen);
      item = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
      db.prepare('INSERT INTO item_barcodes (item_id, barcode) VALUES (?, ?)').run(item.id, barcode);
      created = true;
    }

    db.prepare('INSERT INTO scans (item_id, delta, created, source) VALUES (?, ?, ?, ?)').run(
      item.id,
      delta,
      created ? 1 : 0,
      source
    );
    db.prepare(
      `UPDATE items SET quantity = MAX(quantity + ?, 0), updated_at = datetime('now') WHERE id = ?`
    ).run(delta, item.id);

    return {
      status: created ? 201 : 200,
      created,
      item: db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)
    };
  })();
};

module.exports = { BARCODE_RE, cleanBarcode, cleanName, cleanField, knownStore, knownBrand, knownCategory, cleanSource, scanBarcode };
