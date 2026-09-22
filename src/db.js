import mongoose from 'mongoose';

export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linguaroute';

/**
 * A connection string safe to print. Never log MONGODB_URI directly: on a
 * hosted database it carries a username and password, and anything written to
 * stdout ends up in the platform's log store.
 */
export function redactUri(uri = MONGODB_URI) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable connection string)';
  }
}

/**
 * Connection cache.
 *
 * On a long-running server this is just a guard against connecting twice. On a
 * serverless platform it matters a great deal: every warm invocation reuses the
 * same container, so without a cache each request would open a new connection
 * and exhaust the database's connection pool within minutes. The cache is
 * parked on `globalThis` because module state is not guaranteed to survive
 * between invocations, while the global object in a warm container does.
 */
const globalCache = globalThis;
globalCache.__linguaroute ??= { conn: null, promise: null };
const cache = globalCache.__linguaroute;

export async function connectDB(uri = MONGODB_URI) {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    mongoose.set('strictQuery', true);
    cache.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
        // Serverless containers are short-lived; a big idle pool is wasted.
        maxPoolSize: 10,
      })
      .then((m) => {
        console.log('[db] connected');
        return m.connection;
      })
      .catch((err) => {
        // Clear the cached promise so the next request can retry rather than
        // resolving the same rejection forever.
        cache.promise = null;
        console.error('[db] could not connect: ' + err.message);
        if (uri.includes('127.0.0.1') || uri.includes('localhost')) {
          console.error('[db] Is mongod running? On Windows: net start MongoDB');
        } else {
          console.error('[db] Check MONGODB_URI and that this host is allowed in Atlas network access');
        }
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export function dbState() {
  return (
    ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ??
    'unknown'
  );
}

export default connectDB;
