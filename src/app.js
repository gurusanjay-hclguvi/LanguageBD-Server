import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { connectDB, dbState } from './db.js';
import bdsRouter from './routes/bds.js';
import leadsRouter from './routes/leads.js';
import importRouter from './routes/importCsv.js';
import assignmentsRouter from './routes/assignments.js';
import callsRouter from './routes/calls.js';
import queueRouter from './routes/queue.js';
import analyticsRouter from './routes/analytics.js';
import { LANGUAGES } from './data/languages.js';
import { STATE_LANGUAGES } from './data/regionLanguages.js';

/**
 * The Express app, with no server attached.
 *
 * Keeping `listen()` out of this file is what lets the same app run two ways:
 * `index.js` starts a real server for local development, and `api/index.js`
 * hands the app straight to Vercel as a serverless function.
 */
const app = express();

/**
 * The client is deployed separately, so every browser request to this API is
 * cross-origin. CORS_ORIGIN is a comma-separated allowlist - set it to the
 * deployed client URL (and any preview domains) in production. Left unset it
 * allows any origin, which is what local development uses and is acceptable
 * here only because the API carries no cookies or credentials.
 */
/**
 * An origin is scheme + host + port and nothing else, but a trailing slash in
 * the environment variable is by far the most common way this gets misconfigured
 * ("https://app.example.com/" never matches "https://app.example.com"). Normalise
 * both sides so that mistake cannot cost an afternoon.
 */
const normalizeOrigin = (value) => value.trim().replace(/\/+$/, '').toLowerCase();

export const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length
      ? (origin, callback) =>
          // No Origin header at all (curl, server-to-server) is not a browser
          // request, so there is nothing to protect against here.
          callback(null, !origin || allowedOrigins.includes(normalizeOrigin(origin)))
      : true,
    // The demo role switcher sends these, so the browser preflights them.
    allowedHeaders: ['Content-Type', 'x-role', 'x-bd-id'],
  }),
);
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

/**
 * Demo role context, NOT authentication. The client sends who it is pretending
 * to be; a real deployment would replace this with a session or JWT.
 */
app.use((req, res, next) => {
  req.actor = {
    role: req.header('x-role') === 'bd' ? 'bd' : 'admin',
    bdId: req.header('x-bd-id') || null,
  };
  next();
});

/**
 * Health and meta deliberately sit ABOVE the database gate below: a health
 * check that goes down with the database cannot tell you the database is down,
 * and it is the endpoint you reach for when diagnosing exactly that.
 *
 * Health also reports the CORS allowlist the process actually loaded. These are
 * public URLs, and seeing them turns "the browser says NetworkError" from a
 * guessing game into a one-line diff against your client's origin.
 */
app.get('/api/health', async (req, res) => {
  // Actually attempt the connection rather than reporting whatever state a
  // cold container happens to be in - otherwise a fresh function reports
  // "disconnected" when the database is perfectly reachable. Never throws, so
  // health stays answerable precisely when the database is not.
  let dbError = null;
  try {
    await connectDB();
  } catch (err) {
    dbError = err.message;
  }

  res.json({
    ok: dbState() === 'connected',
    db: dbState(),
    dbError,
    uptime: Math.round(process.uptime()),
    cors: allowedOrigins.length ? allowedOrigins : 'any origin (CORS_ORIGIN not set)',
    yourOrigin: req.header('origin') ?? null,
  });
});

/** Reference data the UI needs for dropdowns and chips. */
app.get('/api/meta', (req, res) => {
  res.json({
    languages: LANGUAGES,
    states: Object.keys(STATE_LANGUAGES).sort(),
    proficiencies: ['native', 'fluent', 'basic'],
    outcomes: ['connected', 'converted', 'not_interested', 'no_answer', 'language_barrier'],
  });
});

/**
 * Every request makes sure the database is connected before it is handled.
 * On a warm container this resolves instantly from the cache; on a cold start
 * it is the one place that pays for the connection.
 */
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable: ' + err.message });
  }
});

app.use('/api/bds', bdsRouter);
app.use('/api/leads', importRouter); // POST /api/leads/import + GET template
app.use('/api/leads', leadsRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/analytics', analyticsRouter);

app.use((req, res) =>
  res.status(404).json({ error: 'No such endpoint: ' + req.method + ' ' + req.path }),
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
