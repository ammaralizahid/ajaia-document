/**
 * Simple cryptographically-random ID generator (URL-safe, 21 chars).
 * Uses Web Crypto API available in both Node.js 18+ and Edge runtime.
 */
export function nanoid(size = 21): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b & 63]).join("");
}
