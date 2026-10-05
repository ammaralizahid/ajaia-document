import "dotenv/config";
import { getDb } from "../src/db";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";

async function runMigrate() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL or DATABASE_MIGRATION_URL is required.");
    process.exit(1);
  }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const db = getDb();

  console.log(`Applying migrations from ./drizzle/migrations against ${isLocal ? "local PostgreSQL" : "remote Neon"}...`);
  if (isLocal) {
    await migratePg(db, { migrationsFolder: "./drizzle/migrations" });
  } else {
    await migrateNeon(db, { migrationsFolder: "./drizzle/migrations" });
  }
  console.log("✓ Migrations applied successfully.");
  process.exit(0);
}

runMigrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
