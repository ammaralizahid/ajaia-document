import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  listDocumentShares,
  createShare,
  requireUserId,
  AuthError,
} from "@/lib/access";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/documents/[id]/shares — list shares (owner only) */
export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);
    const shares = await listDocumentShares(id, userId);
    return NextResponse.json({ shares });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/documents/[id]/shares — grant access to a seeded user (owner only) */
export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = requireUserId(session);

    const body = await request.json().catch(() => ({}));
    const recipientEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!recipientEmail) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Look up recipient — only existing seeded users. No email invitation.
    const db = getDb();
    const recipients = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.email, recipientEmail))
      .limit(1);

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No account found with that email. Only seeded demo users can be added." },
        { status: 404 }
      );
    }

    const recipient = recipients[0];
    await createShare(id, userId, recipient.id);

    return NextResponse.json({ ok: true, recipient: { id: recipient.id, name: recipient.name, email: recipient.email } });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
