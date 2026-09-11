const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const itemsRouter = require('./routes/items');
const dataRouter = require('./routes/data');
const usersRouter = require('./routes/users');
const storesRouter = require('./routes/stores');
const brandsRouter = require('./routes/brands');
const { router: authRouter } = require('./routes/auth');
const { requireAuth, requireAdmin } = require('./session');

const app = express();

// Only trust the configured number of proxy hops so client IPs (used by the
// rate limiter) cannot be spoofed via a forged X-Forwarded-For header.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
// Tight limit on the credential endpoint to slow password brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use('/api', apiLimiter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, requireAdmin, usersRouter);
app.use('/api/stores', requireAuth, storesRouter);
app.use('/api/brands', requireAuth, brandsRouter);
app.use('/api', requireAuth, dataRouter);
app.use('/api', requireAuth, itemsRouter);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

module.exports = app;
