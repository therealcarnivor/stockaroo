const express = require('express');
const { db, hashPassword } = require('../db');
const { destroyUserSessions } = require('../session');
const { publicUser } = require('./auth');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

const adminCount = () => db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, username, is_admin, must_change_password, avatar, created_at FROM users ORDER BY username'
    )
    .all();
  res.json(rows.map((u) => ({ ...publicUser(u), created_at: u.created_at })));
});

router.post('/', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const isAdmin = req.body?.is_admin ? 1 : 0;

  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'username_taken' });
  }

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, is_admin, must_change_password)
       VALUES (?, ?, ?, 1)`
    )
    .run(username, hashPassword(password), isAdmin);

  res
    .status(201)
    .json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'not_found' });

  if (typeof req.body?.is_admin === 'boolean') {
    // Never let the last admin (or yourself) drop admin rights and lock everyone out.
    if (!req.body.is_admin && user.is_admin && adminCount() <= 1) {
      return res.status(409).json({ error: 'last_admin' });
    }
    if (!req.body.is_admin && user.id === req.user.id) {
      return res.status(409).json({ error: 'cannot_demote_self' });
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(req.body.is_admin ? 1 : 0, id);
  }

  if (typeof req.body?.password === 'string') {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'password_too_short' });
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
      hashPassword(req.body.password),
      id
    );
    destroyUserSessions(id);
  }

  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  if (user.id === req.user.id) return res.status(409).json({ error: 'cannot_delete_self' });
  if (user.is_admin && adminCount() <= 1) return res.status(409).json({ error: 'last_admin' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
