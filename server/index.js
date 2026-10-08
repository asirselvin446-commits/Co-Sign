import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { config } from './config.js';
import connectPgSimple from 'connect-pg-simple';
import { read, init, pool, flush } from './db.js';
import { subscribe } from './sse.js';
import { counters } from './audit.js';
import { tick } from './requests.js';
import { route, HttpError } from './http.js';
import userRoutes from './routes/user.js';
import actionRoutes from './routes/actions.js';
import guardianRoutes from './routes/guardian.js';
import recoveryRoutes from './routes/recovery.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}

app.set('trust proxy', true); // honour x-forwarded-proto from ngrok / the host's proxy
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Health check for the hosting platform (before sessions: no cookie churn).
app.get('/healthz', (req, res) => res.json({ ok: true }));

// With Postgres, sessions survive restarts and redeploys; otherwise memory.
const PgStore = connectPgSimple(session);
app.use(session({
  name: 'saathi.sid',
  store: pool ? new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }) : undefined,
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 12 * 3600 * 1000 },
}));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
  });
  next();
});

app.use('/api', userRoutes);
app.use('/api', actionRoutes);
app.use('/api/guardian', guardianRoutes);
app.use('/api/recovery', recoveryRoutes);

// One SSE stream per page; the role decides which channels it hears.
app.get('/api/stream', (req, res) => {
  const role = req.query.role;
  const names = [];
  if (role === 'user') {
    if (req.session.userId) names.push(`user:${req.session.userId}`);
    if (req.session.recoveryId) names.push(`recovery:${req.session.recoveryId}`);
  } else if (role === 'guardian' && req.session.guardianId) {
    names.push(`guardian:${req.session.guardianId}`);
  } else if (role === 'dashboard' && dashboardAllowed(req)) {
    names.push('dashboard');
  }
  if (names.length === 0) return res.status(401).json({ error: 'not_signed_in' });
  subscribe(req, res, names);
});

// Optional shared key for the security dashboard (DASHBOARD_KEY env).
function dashboardAllowed(req) {
  const key = process.env.DASHBOARD_KEY;
  return !key || req.query.key === key;
}

app.get('/api/dashboard', route(async (req) => {
  if (!dashboardAllowed(req)) throw new HttpError(401, 'not_signed_in');
  const db = read();
  return {
    counters: counters(),
    events: db.events.slice(-150).reverse(),
    totals: { users: db.users.length, guardians: db.guardians.length },
  };
}));

app.get('/vendor/simplewebauthn-browser.js', (req, res) => {
  res.sendFile(path.join(root, 'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js'));
});
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));

await init();
setInterval(tick, 1000).unref();

const server = app.listen(config.port, () => {
  console.log(`SaathiAuth running on http://localhost:${config.port}`);
  console.log(`  user app   http://localhost:${config.port}/`);
  console.log(`  guardian   http://localhost:${config.port}/guardian.html`);
  console.log(`  dashboard  http://localhost:${config.port}/dashboard.html`);
});

// Graceful shutdown on redeploy: finish the last state write first.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    server.close();
    await flush();
    await pool?.end();
    process.exit(0);
  });
}
