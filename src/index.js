import 'dotenv/config';
import app from './app.js';
import { connectDB, redactUri } from './db.js';

/**
 * Local development entry point: a plain long-running Express server.
 * In production on Vercel this file is never executed - `api/index.js` exports
 * the same app as a serverless function instead.
 */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => console.log('[api] listening on http://localhost:' + PORT));

/*
 * Connect eagerly so the first request is fast, but do NOT exit if it fails.
 * A dead database should not take the whole server down: `/api/health` still
 * answers and reports the problem, data routes return a 503 explaining it, and
 * each new request retries the connection - so fixing the database (or an IP
 * allowlist) recovers the server without restarting it.
 */
connectDB()
  .then(() => console.log('[db] ' + redactUri()))
  .catch(() => {
    console.error('[db] starting anyway - /api/health will report the failure');
    console.error('[db] data routes will return 503 until the database is reachable');
  });
