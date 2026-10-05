#!/usr/bin/env tsx
/**
 * Idempotent seed script for demo accounts.
 *
 * Creates three demo users via Better Auth's API (using ALLOW_SEED_SIGNUP=true).
 * Existing users are detected by email and skipped — no password reset.
 * A sample document owned by User A is created if A has none yet.
 *
 * Usage:
 *   ALLOW_SEED_SIGNUP=true npx tsx scripts/seed.ts
 *
 * Environment:
 *   DATABASE_URL       — Connection string (local postgres or remote Neon)
 *   BETTER_AUTH_SECRET — Secret key for auth hashing
 *
 * This script is idempotent and never deletes existing data.
 */

import "dotenv/config";
import { getDb } from "../src/db";
import { getAuth } from "../src/lib/auth";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";

const DEMO_USERS = [
  {
    name: "Alice Demo",
    email: "alice@ajaia.demo",
    password: "Demo1234!",
    role: "A (owner)",
  },
  {
    name: "Bob Demo",
    email: "bob@ajaia.demo",
    password: "Demo1234!",
    role: "B (shared recipient)",
  },
  {
    name: "Carol Demo",
    email: "carol@ajaia.demo",
    password: "Demo1234!",
    role: "C (no access)",
  },
];

async function signUpUser(auth: ReturnType<typeof getAuth>, email: string, password: string, name: string): Promise<string | null> {
  try {
    const res = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    return res?.user?.id ?? null;
  } catch (e) {
    const err = e as { message?: string; body?: { message?: string } };
    const msg = err.body?.message || err.message || String(e);
    console.log(`  → Sign-up error: ${msg}`);
    return null;
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  if (process.env.ALLOW_SEED_SIGNUP !== "true") {
    console.error("ALLOW_SEED_SIGNUP must be 'true' to run this script.");
    console.error("Run: ALLOW_SEED_SIGNUP=true npx tsx scripts/seed.ts");
    process.exit(1);
  }

  const db = getDb();
  const auth = getAuth();

  console.log(`\nSeeding demo users into database...\n`);

  const userIds: Record<string, string> = {};

  for (const demo of DEMO_USERS) {
    process.stdout.write(`Creating ${demo.role} — ${demo.email}... `);

    // Check if already exists
    const existing = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, demo.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`already exists (id: ${existing[0].id})`);
      userIds[demo.email] = existing[0].id;
      continue;
    }

    const uid = await signUpUser(auth, demo.email, demo.password, demo.name);
    if (uid) {
      console.log(`created (id: ${uid})`);
      userIds[demo.email] = uid;
    } else {
      console.log(`FAILED.`);
    }
  }

  // Create a sample document for Alice if she has none
  const aliceId = userIds["alice@ajaia.demo"];
  if (aliceId) {
    const existing = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(eq(schema.documents.ownerId, aliceId))
      .limit(1);

    if (existing.length === 0) {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 21);
      await db.insert(schema.documents).values({
        id,
        ownerId: aliceId,
        title: "Welcome to Ajaia Docs",
        contentJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome to Ajaia Docs" }] },
            { type: "paragraph", content: [{ type: "text", text: "This is a sample document created for the assessment demo." }] },
            { type: "paragraph", content: [
              { type: "text", text: "Try: " },
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: ", " },
              { type: "text", text: "italic", marks: [{ type: "italic" }] },
              { type: "text", text: ", " },
              { type: "text", text: "underline", marks: [{ type: "underline" }] },
              { type: "text", text: "." },
            ] },
            { type: "bulletList", content: [
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Heading styles (H1–H4)" }] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Font family and size controls" }] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Text color and highlighting" }] }] },
              { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Undo/redo with Ctrl+Z / Ctrl+Shift+Z" }] }] },
            ] },
          ],
        },
        schemaVersion: 1,
        revision: 0,
      });
      console.log(`\nCreated sample document for Alice (id: ${id})`);
    } else {
      console.log(`\nAlice already has documents — skipping sample creation.`);
    }
  }

  console.log("\n✓ Seeding complete.\n");
  console.log("Demo credentials:");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role}: ${u.email} / ${u.password}`);
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
