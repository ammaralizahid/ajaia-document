import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Better Auth catch-all handler.
 * Handles /api/auth/* routes (sign-in, sign-out, session, etc.)
 */
export async function GET(request: NextRequest) {
  return auth.handler(request);
}

export async function POST(request: NextRequest) {
  return auth.handler(request);
}
