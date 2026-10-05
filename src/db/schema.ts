/**
 * Drizzle schema for the ajaia document editor.
 *
 * Tables:
 *   - Better Auth tables (user, session, account, verification)
 *   - documents
 *   - document_shares
 */

import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ─── Better Auth tables ───────────────────────────────────────────────────────
// These must match the schema Better Auth generates for the Drizzle adapter.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Application tables ───────────────────────────────────────────────────────

/** Documents owned by a user, with JSONB content from Tiptap. */
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Tiptap JSON document. Schema version is tracked separately. */
    contentJson: jsonb("content_json").notNull().default({}),
    /** Schema version for forward-compatibility. Currently 1. */
    schemaVersion: integer("schema_version").notNull().default(1),
    /** Incremented on every successful save; used for optimistic concurrency. */
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_documents_owner").on(t.ownerId)]
);

/** Sharing grants: a user who can edit a document they don't own. */
export const documentShares = pgTable(
  "document_shares",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("editor"), // "editor" | "viewer"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_document_shares").on(t.documentId, t.userId),
    index("idx_shares_user").on(t.userId),
  ]
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentShare = typeof documentShares.$inferSelect;
