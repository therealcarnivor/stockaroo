const crypto = require('node:crypto');

const ADMIN_KEY = process.env.ADMIN_KEY || '';
const COOKIE = 'stockaroo_auth';

const authRequired = () => ADMIN_KEY.length > 0;

const tokenFor = (key) => crypto.createHash('sha256').update(`stockaroo:${key}`).digest('hex');

// Constant-time compare so an attacker cannot narrow the key byte-by-byte.
const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const readCookie = (req, name) =>
  (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1] ?? '';

const isAuthed = (req) => !authRequired() || safeEqual(readCookie(req, COOKIE), tokenFor(ADMIN_KEY));

const requireAuth = (req, res, next) =>
  isAuthed(req) ? next() : res.status(401).json({ error: 'unauthorized' });

const login = (req, res) => {
  if (!authRequired()) return res.json({ required: false, authed: true });
  if (!safeEqual(req.body?.key ?? '', ADMIN_KEY)) return res.status(401).json({ error: 'invalid_key' });

  res.cookie(COOKIE, tokenFor(ADMIN_KEY), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.json({ required: true, authed: true });
};

const logout = (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ required: authRequired(), authed: false });
};

const status = (req, res) => res.json({ required: authRequired(), authed: isAuthed(req) });

module.exports = { requireAuth, login, logout, status, authRequired };
