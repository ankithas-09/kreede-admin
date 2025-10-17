// lib/db.ts
import mongoose, { Connection } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env.local");

/**
 * Cache separate connections per DB name so dev hot-reloads don't open new sockets.
 */
type ConnCache = {
  conns: Record<string, Connection | null>;
  promises: Record<string, Promise<Connection> | null>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = global as any;
if (!g.__dbConnCache) {
  g.__dbConnCache = { conns: {}, promises: {} } as ConnCache;
}
const cache: ConnCache = g.__dbConnCache;

/**
 * Get a dedicated connection to a DB (default "kreede").
 * Uses mongoose.createConnection so models are scoped per-DB.
 */
export async function getDb(dbName = "kreede"): Promise<Connection> {
  if (cache.conns[dbName]) return cache.conns[dbName]!;
  if (!cache.promises[dbName]) {
    cache.promises[dbName] = mongoose
      .createConnection(MONGODB_URI, {
        dbName,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      })
      .asPromise();
  }
  const conn = await cache.promises[dbName]!;
  cache.conns[dbName] = conn;
  return conn;
}

/**
 * For legacy places where you used `dbConnect()` as a single default connection.
 * This simply returns the "kreede" connection.
 */
export async function dbConnect(): Promise<Connection> {
  return getDb("kreede");
}
