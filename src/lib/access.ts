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
import { and, eq, sql } from "drizzle-orm";
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
  const owned = await getOwnedDocument(documentId, userId);
  if (owned) {
    return {
      ...owned,
      role: "owner" as const,
      canEdit: true,
    };
  }

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
      role: documentShares.role,
    })
    .from(documents)
    .innerJoin(documentShares, eq(documentShares.documentId, documents.id))
    .where(and(eq(documents.id, documentId), eq(documentShares.userId, userId)))
    .limit(1);

  if (!rows[0]) return null;
  const role = rows[0].role === "viewer" ? ("viewer" as const) : ("editor" as const);
  return {
    ...rows[0],
    role,
    canEdit: role === "editor",
  };
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
      role: sql<"owner">`'owner'`,
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
      role: documentShares.role,
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
      role: documentShares.role,
      createdAt: documentShares.createdAt,
    })
    .from(documentShares)
    .innerJoin(user, eq(user.id, documentShares.userId))
    .where(eq(documentShares.documentId, documentId));
}

/** Grants or updates access. Idempotent; rejects self-share. */
export async function createShare(
  documentId: string,
  ownerId: string,
  recipientId: string,
  role: "editor" | "viewer" = "editor"
) {
  if (ownerId === recipientId) {
    throw new AuthError("Cannot share with yourself", 400);
  }
  const doc = await getOwnedDocument(documentId, ownerId);
  if (!doc) throw new AuthError("Not found", 404);

  const db = getDb();
  await db
    .insert(documentShares)
    .values({ documentId, userId: recipientId, role })
    .onConflictDoUpdate({
      target: [documentShares.documentId, documentShares.userId],
      set: { role },
    });
}

/** Revokes access to a document (owner only). */
export async function removeShare(
  documentId: string,
  ownerId: string,
  recipientId: string
) {
  const doc = await getOwnedDocument(documentId, ownerId);
  if (!doc) throw new AuthError("Not found", 404);

  const db = getDb();
  await db
    .delete(documentShares)
    .where(and(eq(documentShares.documentId, documentId), eq(documentShares.userId, recipientId)));
}
