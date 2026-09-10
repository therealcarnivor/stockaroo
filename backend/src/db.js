const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'stockaroo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode    TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    quantity   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL DEFAULT 1,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_scans_item ON scans(item_id, scanned_at DESC);

  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash        TEXT NOT NULL,
    is_admin             INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'avatar')) {
  db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '\u{1F4E6}'`);
}

const itemColumns = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
for (const column of ['store', 'size']) {
  if (!itemColumns.includes(column)) {
    db.exec(`ALTER TABLE items ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
}
if (!itemColumns.includes('min_stock')) {
  db.exec('ALTER TABLE items ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Adopt store names already typed against items so nothing is orphaned.
db.exec(`
  INSERT OR IGNORE INTO stores (name)
  SELECT DISTINCT store FROM items WHERE store <> ''
`);

// scrypt with a per-password salt; stored as salt:hash so it stays self-describing.
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};

const verifyPassword = (password, stored) => {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
};

// First boot needs a way in; a default-password admin is forced to change it.
const seedAdmin = () => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;

  const username = process.env.INITIAL_ADMIN_USER || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'stockaroo';
  db.prepare(
    `INSERT INTO users (username, password_hash, is_admin, must_change_password)
     VALUES (?, ?, 1, ?)`
  ).run(username, hashPassword(password), process.env.INITIAL_ADMIN_PASSWORD ? 0 : 1);
  console.log(`Seeded admin user "${username}".`);
};

seedAdmin();

module.exports = { db, hashPassword, verifyPassword };
