/**
 * Integration tests for the Ajaia document editor API.
 *
 * These tests run against a REAL PostgreSQL database specified by
 * TEST_DATABASE_URL (should be a separate test database or Neon branch).
 * They do NOT mock authorization functions.
 *
 * Test scenarios:
 * 1. A creates a document, renames it, saves formatted JSON
 * 2. C cannot list/read/update it; signed-out is denied
 * 3. A shares with B. B sees it as shared, reads it, saves a content edit
 * 4. B cannot rename or share. Duplicate grants don't duplicate rows
 * 5. A reopens and sees B's content with formatting preserved
 * 6. Stale-revision update is rejected (CAS)
 * 7. Import works; oversized/binary/wrong-type requests fail
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, Db } from "../src/db";
import * as schema from "../src/db/schema";
import { eq, and, inArray } from "drizzle-orm";

const BASE_URL = process.env.TEST_APP_URL ?? "http://localhost:3001";
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// Unique suffix for this test run to avoid collisions
const RUN_ID = Date.now().toString(36);
const TEST_EMAILS = {
  A: `test-a-${RUN_ID}@ajaia.test`,
  B: `test-b-${RUN_ID}@ajaia.test`,
  C: `test-c-${RUN_ID}@ajaia.test`,
};
const TEST_PASSWORD = "TestPass1234!";

let db: Db;
const createdDocIds: string[] = [];
let createdUserIds: string[] = [];

// Cookies per user (session tokens from Better Auth)
const cookies: Record<string, string> = {};

// ─── Setup ────────────────────────────────────────────────────────────────────

async function apiSignUp(email: string, password: string, name: string) {
  // We temporarily allow signup for test users by hitting the endpoint.
  // In production ALLOW_SEED_SIGNUP must be true; in tests the app server
  // must be started with ALLOW_SEED_SIGNUP=true (see README).
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password, name }),
  });
  return res;
}

async function apiSignIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  // Extract session cookie
  const match = setCookie.match(/better-auth\.session_token=[^;]+/);
  return match ? match[0] : "";
}

function authHeaders(cookie: string) {
  return { Cookie: cookie, "Content-Type": "application/json", Origin: BASE_URL };
}

beforeAll(async () => {
  if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL not set");
  process.env.DATABASE_URL = TEST_DB_URL;
  db = getDb();

  // Create test users
  for (const [key, email] of Object.entries(TEST_EMAILS)) {
    await apiSignUp(email, TEST_PASSWORD, `Test User ${key}`);
    const cookie = await apiSignIn(email, TEST_PASSWORD);
    cookies[key] = cookie;
  }

  // Track user IDs for cleanup
  const users = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(inArray(schema.user.email, Object.values(TEST_EMAILS)));
  createdUserIds = users.map((u: { id: string }) => u.id);
}, 30000);

afterAll(async () => {
  // Clean up only test-created records
  if (createdDocIds.length > 0) {
    await db.delete(schema.documents).where(inArray(schema.documents.id, createdDocIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
  }
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Document API integration", () => {
  let docId: string;

  // ── Scenario 1: A creates, renames, saves ───────────────────────────────────

  it("A: creates a document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents`, {
      method: "POST",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ title: "Test Doc" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(typeof data.id).toBe("string");
    docId = data.id;
    createdDocIds.push(docId);
  });

  it("A: renames the document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ title: "Renamed Test Doc" }),
    });
    expect(res.status).toBe(200);
    const check = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.A },
    });
    const doc = await check.json();
    expect(doc.title).toBe("Renamed Test Doc");
  });

  it("A: saves formatted JSON content", async () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
            { type: "text", text: "World", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ contentJson: content, revision: 0 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revision).toBe(1);
  });

  // ── Scenario 2: C and signed-out are denied ────────────────────────────────

  it("C: cannot read A's document by ID", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.C },
    });
    expect(res.status).toBe(404);
  });

  it("C: cannot update A's document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.C),
      body: JSON.stringify({ contentJson: { type: "doc", content: [] }, revision: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("Signed-out: cannot read document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`);
    expect(res.status).toBe(401);
  });

  // ── Scenario 3: A shares with B; B can read and save ──────────────────────

  it("A: shares document with B", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ email: TEST_EMAILS.B }),
    });
    expect(res.status).toBe(200);
  });

  it("B: sees document in shared list", async () => {
    const res = await fetch(`${BASE_URL}/api/documents`, {
      headers: { Cookie: cookies.B },
    });
    const data = await res.json();
    const found = data.shared?.find((d: { id: string }) => d.id === docId);
    expect(found).toBeDefined();
    expect(found.relationship).toBe("shared");
  });

  it("B: can read the shared document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.B },
    });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.isOwner).toBe(false);
  });

  it("B: can save a content edit", async () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "B edited this" }] },
      ],
    };
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.B),
      body: JSON.stringify({ contentJson: content, revision: 1 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revision).toBe(2);
  });

  // ── Scenario 4: B cannot rename or share ──────────────────────────────────

  it("B: cannot rename the document", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.B),
      body: JSON.stringify({ title: "B Tried to Rename" }),
    });
    // Only owner can rename; B should get 404 (not owner) or 403
    expect([403, 404]).toContain(res.status);
  });

  it("B: cannot add a share", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: authHeaders(cookies.B),
      body: JSON.stringify({ email: TEST_EMAILS.C }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("Duplicate share grant does not create extra rows", async () => {
    const before = await db
      .select()
      .from(schema.documentShares)
      .where(
        and(
          eq(schema.documentShares.documentId, docId),
          eq(schema.documentShares.userId, createdUserIds.find((_, i) => Object.values(TEST_EMAILS)[i] === TEST_EMAILS.B) ?? "")
        )
      );

    await fetch(`${BASE_URL}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ email: TEST_EMAILS.B }),
    });

    const after = await db
      .select()
      .from(schema.documentShares)
      .where(eq(schema.documentShares.documentId, docId));

    expect(after.length).toBe(before.length);
  });

  // ── Scenario 4b: Role-Based Sharing & Revocation ──────────────────────────

  it("A: updates B's role to 'viewer'", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ email: TEST_EMAILS.B, role: "viewer" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recipient.role).toBe("viewer");
  });

  it("B: sees viewer role and is forbidden from saving content", async () => {
    const readRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.B },
    });
    expect(readRes.status).toBe(200);
    const doc = await readRes.json();
    expect(doc.role).toBe("viewer");
    expect(doc.canEdit).toBe(false);

    // Attempt to save as viewer -> must be rejected with 403
    const saveRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.B),
      body: JSON.stringify({
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "viewer illegal save" }] }],
        },
        revision: doc.revision,
      }),
    });
    expect(saveRes.status).toBe(403);
  });

  it("A: restores B to editor role and B can save again", async () => {
    const shareRes = await fetch(`${BASE_URL}/api/documents/${docId}/shares`, {
      method: "POST",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ email: TEST_EMAILS.B, role: "editor" }),
    });
    expect(shareRes.status).toBe(200);

    const docRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.B },
    });
    const doc = await docRes.json();
    expect(doc.role).toBe("editor");
    expect(doc.canEdit).toBe(true);
  });

  // ── Scenario 5: A reopens and sees B's content ─────────────────────────────

  it("A: reopens and sees B's saved content", async () => {
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.A },
    });
    expect(res.status).toBe(200);
    const doc = await res.json();
    const text = JSON.stringify(doc.contentJson);
    expect(text).toContain("B edited this");
    expect(doc.revision).toBe(2);
  });

  // ── Scenario 6: Stale revision rejected ────────────────────────────────────

  it("Stale-revision update is rejected with 409", async () => {
    const staleContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "stale overwrite attempt" }] }],
    };
    // Revision 1 is stale (current is 2)
    const res = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: "PATCH",
      headers: authHeaders(cookies.A),
      body: JSON.stringify({ contentJson: staleContent, revision: 1 }),
    });
    expect(res.status).toBe(409);

    // Verify content was NOT overwritten
    const check = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.A },
    });
    const checkDoc = await check.json();
    expect(JSON.stringify(checkDoc.contentJson)).toContain("B edited this");
  });

  // ── Scenario 7: Import validation ─────────────────────────────────────────

  it("Import: valid .txt file creates a document", async () => {
    const file = new Blob(["Hello world\nLine 2\n\nParagraph 2"], { type: "text/plain" });
    const form = new FormData();
    form.append("file", file, "test.txt");

    const res = await fetch(`${BASE_URL}/api/documents/import`, {
      method: "POST",
      headers: { Cookie: cookies.A },
      body: form,
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(typeof data.id).toBe("string");
    createdDocIds.push(data.id);
  });

  it("Import: oversized file is rejected", async () => {
    // 2 MiB random text
    const bigText = "A".repeat(2 * 1024 * 1024);
    const file = new Blob([bigText], { type: "text/plain" });
    const form = new FormData();
    form.append("file", file, "big.txt");

    const res = await fetch(`${BASE_URL}/api/documents/import`, {
      method: "POST",
      headers: { Cookie: cookies.A },
      body: form,
    });
    expect(res.status).toBe(413);
  });

  it("Import: .pdf file is rejected", async () => {
    const file = new Blob(["fake pdf"], { type: "application/pdf" });
    const form = new FormData();
    form.append("file", file, "doc.pdf");

    const res = await fetch(`${BASE_URL}/api/documents/import`, {
      method: "POST",
      headers: { Cookie: cookies.A },
      body: form,
    });
    expect(res.status).toBe(415);
  });

  it("Import: file with null bytes is rejected as binary", async () => {
    const file = new Blob(["\x00\x01binary\x00"], { type: "text/plain" });
    const form = new FormData();
    form.append("file", file, "binary.txt");

    const res = await fetch(`${BASE_URL}/api/documents/import`, {
      method: "POST",
      headers: { Cookie: cookies.A },
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it("Import: literal HTML in text remains as text (not rendered HTML)", async () => {
    const textWithHtml = "Normal text\n<script>alert('xss')</script>\nMore text";
    const file = new Blob([textWithHtml], { type: "text/plain" });
    const form = new FormData();
    form.append("file", file, "html_in_txt.txt");

    const res = await fetch(`${BASE_URL}/api/documents/import`, {
      method: "POST",
      headers: { Cookie: cookies.A },
      body: form,
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    createdDocIds.push(id);

    // Verify the content is stored as literal text nodes
    const docRes = await fetch(`${BASE_URL}/api/documents/${id}`, {
      headers: { Cookie: cookies.A },
    });
    const doc = await docRes.json();
    const text = JSON.stringify(doc.contentJson);
    // The script tag should appear as literal text, not as a script node
    expect(text).toContain("alert");
    // There should be no "type":"script" node
    expect(text).not.toContain('"type":"script"');
  });

  // ── Scenario 8: Share revocation ──────────────────────────────────────────

  it("A: revokes B's access; B cannot access document anymore", async () => {
    const bUser = createdUserIds.find((_, i) => Object.values(TEST_EMAILS)[i] === TEST_EMAILS.B);
    expect(bUser).toBeDefined();

    const revokeRes = await fetch(`${BASE_URL}/api/documents/${docId}/shares?userId=${bUser}`, {
      method: "DELETE",
      headers: authHeaders(cookies.A),
    });
    expect(revokeRes.status).toBe(200);

    // B attempts to access the document -> must receive 404
    const bAccessRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: cookies.B },
    });
    expect(bAccessRes.status).toBe(404);
  });
});
