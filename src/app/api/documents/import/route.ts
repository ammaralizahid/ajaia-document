import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { nanoid } from "@/lib/id";
import { requireUserId, AuthError } from "@/lib/access";
import {
  textToTiptapDocument,
  validateTitle,
  CURRENT_SCHEMA_VERSION,
} from "@/lib/content-validation";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MiB

/** POST /api/documents/import — upload a .txt file and create a new document */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum is 1 MiB (got ${(file.size / 1024).toFixed(1)} KiB).` },
        { status: 413 }
      );
    }

    // Extension check
    const fileName = file.name ?? "";
    if (!fileName.toLowerCase().endsWith(".txt")) {
      return NextResponse.json(
        { error: "Only UTF-8 .txt files are supported." },
        { status: 415 }
      );
    }

    // Read and decode as UTF-8
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text: string;
    try {
      text = decoder.decode(buffer);
    } catch {
      return NextResponse.json(
        { error: "File is not valid UTF-8. Only UTF-8 encoded text files are supported." },
        { status: 422 }
      );
    }

    // Reject clearly binary content (null bytes)
    if (text.includes("\0")) {
      return NextResponse.json(
        { error: "File appears to be binary, not plain text." },
        { status: 422 }
      );
    }

    // Derive title from filename
    const baseName = fileName.replace(/\.txt$/i, "").trim();
    const title = validateTitle(baseName || "Imported document");

    // Convert to Tiptap JSON
    const contentJson = textToTiptapDocument(text);

    // Save as new document
    const db = getDb();
    const id = nanoid();
    await db.insert(documents).values({
      id,
      ownerId: userId,
      title,
      contentJson,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 0,
    });

    return NextResponse.json({ id, title }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("POST /api/documents/import error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
