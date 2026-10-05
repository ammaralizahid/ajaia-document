import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client.
 * Only exposes hooks like `useSession`, `signIn`, `signOut` — no DB access.
 */
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"),
});

export const { useSession, signIn, signOut } = authClient;
