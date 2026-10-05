import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { nanoid } from "@/lib/id";
import {
  listDocumentsForUser,
  requireUserId,
  AuthError,
} from "@/lib/access";
import {
  validateTitle,
  emptyDocument,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/content-validation";

/** GET /api/documents — list owned + shared documents */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);
    const data = await listDocumentsForUser(userId);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/documents error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/documents — create a new document */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const body = await request.json().catch(() => ({}));
    const title = validateTitle(body.title ?? "Untitled document");

    const db = getDb();
    const id = nanoid();
    await db.insert(documents).values({
      id,
      ownerId: userId,
      title,
      contentJson: emptyDocument(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 0,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("POST /api/documents error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
