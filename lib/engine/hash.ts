// lib/engine/hash.ts

/**
 * SHA-256 hex digest. Works in Node.js (via crypto module) and in the browser
 * (via SubtleCrypto). The browser path is async; Node path is sync.
 *
 * For the verifier page we need the browser path. Export both:
 * - `sha256Sync`  — Node-only, used by API routes
 * - `sha256Async` — browser-compatible, used by verifier page
 */

// Node sync version (used by API routes and engine internally)
export function sha256Sync(input: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto')
  return crypto.createHash('sha256').update(input).digest('hex')
}

// Browser async version (used by verifier page)
export async function sha256Async(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data    = encoder.encode(input)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
