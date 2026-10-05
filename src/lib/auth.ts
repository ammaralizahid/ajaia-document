import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Add it to your .env.local file (see .env.example)."
    );
  }

  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),

    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
    },

    secret: secret || "fallback-temporary-secret-for-build-at-least-32-chars",
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",

    databaseHooks: {
      user: {
        create: {
          before: async (userData) => {
            if (process.env.ALLOW_SEED_SIGNUP !== "true") {
              throw new Error("Public registration is disabled.");
            }
            return { data: userData };
          },
        },
      },
    },
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let _authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (!_authInstance) {
    _authInstance = createAuth();
  }
  return _authInstance;
}

/**
 * Lazy-initialized Better Auth Proxy.
 * Does not instantiate Better Auth or connect to the database at module evaluation / build time.
 */
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    const instance = getAuth();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export type Session = {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    emailVerified?: boolean | Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt?: Date;
    updatedAt?: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};
