import 'dotenv/config';
import app from './app.js';
import { connectDB, redactUri } from './db.js';

/**
 * Local development entry point: a plain long-running Express server.
 * In production on Vercel this file is never executed - `api/index.js` exports
 * the same app as a serverless function instead.
 */
const PORT = process.env.PORT || 4000;

connectDB()
  .then(() => {
    console.log('[db] ' + redactUri());
    app.listen(PORT, () => console.log('[api] listening on http://localhost:' + PORT));
  })
  .catch(() => process.exit(1));
