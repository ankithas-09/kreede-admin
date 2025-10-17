// lib/dbBookings.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;
if (!MONGODB_URI) throw new Error("MONGODB_URI is not set in .env.local");

type CachedBookings = {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
};

/* eslint-disable no-var */
declare global {
  // eslint-disable-next-line vars-on-top
  var _bookings: CachedBookings | undefined;
}
/* eslint-enable no-var */

const cached: CachedBookings = global._bookings ?? { conn: null, promise: null };
if (!global._bookings) {
  global._bookings = cached;
}

export async function bookingConnection(): Promise<mongoose.Connection> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const conn = mongoose.createConnection(MONGODB_URI, { dbName: "kreede_booking" });
    cached.promise = new Promise<mongoose.Connection>((resolve, reject) => {
      conn
        .asPromise()
        .then(() => resolve(conn))
        .catch(reject);
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
