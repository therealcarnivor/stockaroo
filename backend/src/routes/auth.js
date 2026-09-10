const express = require('express');
const { db, hashPassword, verifyPassword } = require('../db');
const AVATARS = require('../avatars');
const {
  COOKIE,
  createSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
  userFromRequest,
  requireAuth
} = require('../session');

const router = express.Router();

const publicUser = (u) =>
  u && {
    id: u.id,
    username: u.username,
    is_admin: !!u.is_admin,
    must_change_password: !!u.must_change_password,
    avatar: u.avatar || AVATARS[0]
  };

router.get('/me', (req, res) => {
  const user = userFromRequest(req);
  res.json({ authed: !!user, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  // Same response for unknown user and bad password so usernames are not enumerable.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  setSessionCookie(res, createSession(user.id));
  res.json({ authed: true, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE);
  res.json({ authed: false, user: null });
});

router.get('/avatars', (req, res) => res.json(AVATARS));

router.patch('/profile', requireAuth, (req, res) => {
  const avatar = String(req.body?.avatar ?? '');
  if (!AVATARS.includes(avatar)) return res.status(400).json({ error: 'invalid_avatar' });

  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword ?? '');
  const next = String(req.body?.newPassword ?? '');
  if (next.length < 8) return res.status(400).json({ error: 'password_too_short' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hashPassword(next),
    user.id
  );
  // Invalidate other devices, then re-issue a session for this one.
  destroyUserSessions(user.id);
  setSessionCookie(res, createSession(user.id));
  res.json({ ok: true });
});

module.exports = { router, publicUser };
