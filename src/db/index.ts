/**
 * Lazy-initialized database client.
 *
 * Supports:
 *   - Remote Neon PostgreSQL (serverless HTTP driver) when connecting to Neon / cloud
 *   - Standard PostgreSQL (via 'pg' pool) when connecting to local postgres (localhost)
 *
 * During `next build` this module does not connect, so the build succeeds
 * without runtime credentials.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return url.includes("localhost") || url.includes("127.0.0.1");
  }
}

function resolveDbUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  // Match Neon variables created with project prefixes like ajaia_document_POSTGRES_URL
  const entry = Object.entries(process.env).find(([k, v]) => Boolean(v) && (k.endsWith("POSTGRES_URL") || k.endsWith("DATABASE_URL")));
  return entry?.[1];
}

function getDb() {
  if (_db) return _db;
  const url = resolveDbUrl();
  if (!url) {
    throw new Error(
      "Database URL is not set. Add DATABASE_URL (or POSTGRES_URL) to your Environment Variables."
    );
  }

  if (isLocalhost(url)) {
    const pool = new Pool({ connectionString: url });
    _db = drizzlePg(pool, { schema });
  } else {
    const sql = neon(url);
    _db = drizzleNeon(sql, { schema });
  }
  return _db;
}

export { getDb };
export type Db = ReturnType<typeof getDb>;
