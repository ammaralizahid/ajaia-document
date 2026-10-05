import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  getAccessibleDocument,
  getOwnedDocument,
  requireUserId,
  AuthError,
} from "@/lib/access";
import {
  validateTitle,
  validateTiptapContent,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/content-validation";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/documents/[id] — read document if access permitted */
export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const doc = await getAccessibleDocument(id, userId);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...doc,
      isOwner: doc.ownerId === userId,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/documents/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/documents/[id] — update document.
 *
 * Supports partial updates:
 *   { title }               — owner only rename
 *   { contentJson, revision } — owner or recipient content edit (optimistic lock)
 *   { title, contentJson, revision } — owner only (combined)
 *
 * Returns 409 on stale revision. Revision is incremented atomically.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Only accept known fields — no mass assignment
    const { title, contentJson, revision } = body as {
      title?: unknown;
      contentJson?: unknown;
      revision?: unknown;
    };

    const db = getDb();

    // ── Rename (title only, owner only) ────────────────────────────────────
    if (title !== undefined && contentJson === undefined) {
      const doc = await getOwnedDocument(id, userId);
      if (!doc) return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });

      const validTitle = validateTitle(title);
      await db
        .update(documents)
        .set({ title: validTitle, updatedAt: new Date() })
        .where(and(eq(documents.id, id), eq(documents.ownerId, userId)));

      return NextResponse.json({ ok: true });
    }

    // ── Content save (owner or shared, with revision lock) ─────────────────
    if (contentJson !== undefined) {
      const doc = await getAccessibleDocument(id, userId);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // If also renaming, must be owner
      if (title !== undefined && doc.ownerId !== userId) {
        return NextResponse.json({ error: "Only the owner can rename" }, { status: 403 });
      }

      const expectedRevision = typeof revision === "number" ? revision : -1;

      // Validate content before touching DB
      let validContent: Record<string, unknown>;
      try {
        validContent = validateTiptapContent(contentJson);
      } catch (ve) {
        return NextResponse.json(
          { error: `Invalid content: ${ve instanceof Error ? ve.message : "unknown"}` },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {
        contentJson: validContent,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        revision: sql`revision + 1`,
        updatedAt: new Date(),
      };
      if (title !== undefined && doc.ownerId === userId) {
        updateData.title = validateTitle(title);
      }

      // Atomic compare-and-swap on revision
      const accessFilter =
        doc.ownerId === userId
          ? and(eq(documents.id, id), eq(documents.ownerId, userId), eq(documents.revision, expectedRevision))
          : and(
              eq(documents.id, id),
              eq(documents.revision, expectedRevision),
              sql`EXISTS (
                SELECT 1 FROM document_shares ds
                WHERE ds.document_id = ${id} AND ds.user_id = ${userId}
              )`
            );

      const result = await db
        .update(documents)
        .set(updateData)
        .where(accessFilter)
        .returning({ newRevision: documents.revision });

      if (result.length === 0) {
        // Could be stale revision or lost access. Return 409 — client must reload.
        return NextResponse.json(
          { error: "conflict", message: "Document was modified by another session. Reload to resolve." },
          { status: 409 }
        );
      }

      return NextResponse.json({ ok: true, revision: result[0].newRevision });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("PATCH /api/documents/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE /api/documents/[id] — owner only */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const doc = await getOwnedDocument(id, userId);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const db = getDb();
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.ownerId, userId)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/documents/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
