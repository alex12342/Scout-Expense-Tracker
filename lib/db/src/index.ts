// Server-only: imports drizzle-orm/node-postgres — do NOT import this module
// from browser bundles. For the browser, call the HTTP API instead.

import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

let _db: Db | null = null;
let _pool: pg.Pool | null = null;

function makePool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    maxUses: 1000,
    allowExitOnIdle: false,
  });
  pool.on("error", (err: Error) => {
    console.error("[db] Unexpected error on idle client:", err);
  });
  return pool;
}

function getDb(): Db {
  if (!_db) {
    if (!_pool) _pool = makePool();
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

/**
 * Lazily-initialized drizzle instance. The proxy defers pool/db creation until
 * the first query, so importing this module has no side effects and won't crash
 * if DATABASE_URL is unset at import time.
 */
const dbProxy: Db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
  set(_t, prop, value, receiver) {
    return Reflect.set(getDb(), prop, value, receiver);
  },
  has(_t, prop) {
    return Reflect.has(getDb(), prop);
  },
  ownKeys() {
    return Reflect.ownKeys(getDb());
  },
  getOwnPropertyDescriptor(_t, prop) {
    return Reflect.getOwnPropertyDescriptor(getDb(), prop);
  },
});

export const db: Db = dbProxy;

export function getPool(): pg.Pool {
  if (!_pool) _pool = makePool();
  return _pool;
}

export * from "./schema";
