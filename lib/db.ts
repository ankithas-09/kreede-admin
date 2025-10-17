// lib/db.ts
import mongoose, { type Connection } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env.local");

/**
 * Cache separate connections per DB name so dev hot-reloads don't open new sockets.
 */
type ConnCache = {
  conns: Record<string, Connection | null>;
  promises: Record<string, Promise<Connection> | null>;
};

const g = globalThis as unknown as { __dbConnCache?: ConnCache };
if (!g.__dbConnCache) {
  g.__dbConnCache = { conns: {}, promises: {} };
}
const cache = g.__dbConnCache;

/**
 * Get a dedicated connection to a DB (default "kreede").
 * Uses mongoose.createConnection so models are scoped per-DB.
 */
export async function getDb(dbName = "kreede"): Promise<Connection> {
  const cachedConn = cache.conns[dbName];
  if (cachedConn) return cachedConn;

  if (!cache.promises[dbName]) {
    const conn = mongoose.createConnection(MONGODB_URI, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15_000,
      connectTimeoutMS: 15_000,
      socketTimeoutMS: 45_000,
      maxConnecting: 3,
      bufferCommands: false, // ← fail fast instead of buffering ops
    });

    // Optional: lightweight logging (safe to keep, remove if noisy)
    conn.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error(`[mongo:${dbName}] connection error:`, err);
    });
    conn.on("connected", () => {
      // eslint-disable-next-line no-console
      console.log(`[mongo:${dbName}] connected`);
    });

    cache.promises[dbName] = conn.asPromise().then(() => conn);
  }

  const resolved = await cache.promises[dbName]!;
  cache.conns[dbName] = resolved;
  return resolved;
}

/**
 * Legacy helper returning the "kreede" connection.
 */
export async function dbConnect(): Promise<Connection> {
  return getDb("kreede");
}
