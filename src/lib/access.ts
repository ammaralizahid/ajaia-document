/**
 * Server-side document access helpers.
 *
 * Every helper enforces the permission contract:
 *   - Owner: list/read, edit content, rename, manage sharing.
 *   - Shared recipient: list/read, edit content. Cannot rename/share.
 *   - Unrelated user: denied. Returns null / throws.
 *   - Signed-out: denied upstream by requireSession().
 *
 * Access predicates are placed INSIDE database queries; not just in
 * application-level if-statements. This prevents direct-ID enumeration.
 */

import { getDb } from "@/db";
import { documents, documentShares, user } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import type { Session } from "@/lib/auth";

/** Returns the session's user ID or throws a 401-style error. */
export function requireUserId(session: Session | null): string {
  if (!session?.user?.id) throw new AuthError("Unauthorized", 401);
  return session.user.id;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 403
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** User can access the document (owner or shared). Returns null if denied. */
export async function getAccessibleDocument(
  documentId: string,
  userId: string
) {
  const db = getDb();
  const rows = await db
    .select({
      id: documents.id,
      ownerId: documents.ownerId,
      title: documents.title,
      contentJson: documents.contentJson,
      schemaVersion: documents.schemaVersion,
      revision: documents.revision,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        or(
          eq(documents.ownerId, userId),
          sql`EXISTS (
            SELECT 1 FROM document_shares ds
            WHERE ds.document_id = ${documentId}
              AND ds.user_id = ${userId}
          )`
        )
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Returns the document only if the user is the owner. */
export async function getOwnedDocument(documentId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.ownerId, userId))
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Lists documents the user owns + documents shared with them. */
export async function listDocumentsForUser(userId: string) {
  const db = getDb();

  // Owned documents
  const owned = await db
    .select({
      id: documents.id,
      ownerId: documents.ownerId,
      ownerName: user.name,
      ownerEmail: user.email,
      title: documents.title,
      revision: documents.revision,
      updatedAt: documents.updatedAt,
      relationship: sql<"owned">`'owned'`,
    })
    .from(documents)
    .innerJoin(user, eq(user.id, documents.ownerId))
    .where(eq(documents.ownerId, userId));

  // Shared documents
  const shared = await db
    .select({
      id: documents.id,
      ownerId: documents.ownerId,
      ownerName: user.name,
      ownerEmail: user.email,
      title: documents.title,
      revision: documents.revision,
      updatedAt: documents.updatedAt,
      relationship: sql<"shared">`'shared'`,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documents.id, documentShares.documentId))
    .innerJoin(user, eq(user.id, documents.ownerId))
    .where(eq(documentShares.userId, userId));

  return { owned, shared };
}

/** Lists shares for a document (owner only). */
export async function listDocumentShares(documentId: string, ownerId: string) {
  const doc = await getOwnedDocument(documentId, ownerId);
  if (!doc) throw new AuthError("Not found", 404);

  const db = getDb();
  return db
    .select({
      userId: documentShares.userId,
      userName: user.name,
      userEmail: user.email,
      createdAt: documentShares.createdAt,
    })
    .from(documentShares)
    .innerJoin(user, eq(user.id, documentShares.userId))
    .where(eq(documentShares.documentId, documentId));
}

/** Grants edit access. Idempotent; rejects self-share. */
export async function createShare(
  documentId: string,
  ownerId: string,
  recipientId: string
) {
  if (ownerId === recipientId) {
    throw new AuthError("Cannot share with yourself", 400);
  }
  const doc = await getOwnedDocument(documentId, ownerId);
  if (!doc) throw new AuthError("Not found", 404);

  const db = getDb();
  // Upsert — do nothing on conflict (idempotent).
  await db
    .insert(documentShares)
    .values({ documentId, userId: recipientId })
    .onConflictDoNothing();
}
