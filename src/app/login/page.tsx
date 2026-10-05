"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Check your credentials.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Ajaia Docs</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="cursor-pointer w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Demo accounts (click to fill)</p>
          <div className="space-y-1.5 text-xs text-gray-600">
            <button
              type="button"
              onClick={() => { setEmail("alice@ajaia.demo"); setPassword("Demo1234!"); }}
              className="cursor-pointer w-full flex justify-between items-center px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 text-left transition-colors"
            >
              <span className="font-medium">User A (owner):</span>
              <span className="font-mono text-gray-500">alice@ajaia.demo</span>
            </button>
            <button
              type="button"
              onClick={() => { setEmail("bob@ajaia.demo"); setPassword("Demo1234!"); }}
              className="cursor-pointer w-full flex justify-between items-center px-2 py-1.5 rounded hover:bg-purple-50 hover:text-purple-700 text-left transition-colors"
            >
              <span className="font-medium">User B (shared):</span>
              <span className="font-mono text-gray-500">bob@ajaia.demo</span>
            </button>
            <button
              type="button"
              onClick={() => { setEmail("carol@ajaia.demo"); setPassword("Demo1234!"); }}
              className="cursor-pointer w-full flex justify-between items-center px-2 py-1.5 rounded hover:bg-amber-50 hover:text-amber-700 text-left transition-colors"
            >
              <span className="font-medium">User C (no access):</span>
              <span className="font-mono text-gray-500">carol@ajaia.demo</span>
            </button>
          </div>
          <p className="mt-2.5 text-[11px] text-gray-400 text-center">Click any account to fill, then Sign in. Password is Demo1234!</p>
        </div>
      </div>
    </div>
  );
}
