const crypto = require('node:crypto');
const { db } = require('./db');

const COOKIE = 'stockaroo_session';
const SESSION_DAYS = 30;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createSession = (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(hashToken(token), userId, `+${SESSION_DAYS} days`);
  return token;
};

const destroySession = (token) => {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
};

const destroyUserSessions = (userId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

const userFromRequest = (req) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;

  db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.is_admin, u.must_change_password, u.avatar
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
      )
      .get(hashToken(token)) || null
  );
};

const setSessionCookie = (res, token) =>
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });

const requireAuth = (req, res, next) => {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = { ...user, is_admin: !!user.is_admin, must_change_password: !!user.must_change_password };

  // A user with an expired password may only read and change their own password.
  if (req.user.must_change_password && req.method !== 'GET' && !req.originalUrl.startsWith('/api/auth/')) {
    return res.status(403).json({ error: 'password_change_required' });
  }
  next();
};

const requireAdmin = (req, res, next) =>
  req.user?.is_admin ? next() : res.status(403).json({ error: 'forbidden' });

module.exports = {
  COOKIE,
  createSession,
  destroySession,
  destroyUserSessions,
  setSessionCookie,
  userFromRequest,
  requireAuth,
  requireAdmin
};
