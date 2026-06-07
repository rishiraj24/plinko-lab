// __tests__/integration.test.ts
//
// Integration tests — proves the full provably-fair protocol works end-to-end.
// No HTTP server, no DB mocks. We call the same engine functions
// the API routes call, in the same order.
//
// Simulates: POST /commit → POST /start → POST /reveal → GET /verify

import {
  generateServerSeed,
  generateNonce,
  computeCommitHex,
  computeCombinedSeed,
  runRound,
} from '@/lib/engine/index'

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION 1 — Full commit → start → reveal → verify lifecycle
// ─────────────────────────────────────────────────────────────────────────────

test('full round lifecycle: verifier independently reproduces server outcome', () => {
  // ── POST /api/rounds/commit ───────────────────────────────────────────────
  const serverSeed = generateServerSeed() // secret until reveal
  const nonce      = generateNonce()
  const commitHex  = computeCommitHex(serverSeed, nonce)
  // → commitHex is returned to client. serverSeed stays hidden.

  // ── POST /api/rounds/:id/start ────────────────────────────────────────────
  const clientSeed = 'player-provided-seed-12345'
  const dropColumn = 4
  const betCents   = 500 // $5.00

  const combinedSeed = computeCombinedSeed(serverSeed, clientSeed, nonce)
  const serverResult = runRound(combinedSeed, dropColumn)
  const winnings     = Math.floor(betCents * serverResult.payoutMultiplier)
  // → pegMapHash, binIndex, path, payoutMultiplier stored in DB.
  // → serverSeed still hidden.

  // ── POST /api/rounds/:id/reveal ───────────────────────────────────────────
  // → serverSeed is now exposed. Round status = REVEALED.

  // ── GET /api/verify (or /verify page recomputing client-side) ────────────
  // Player uses: serverSeed, clientSeed, nonce, dropColumn

  // Step 1: Recompute commitHex — proves serverSeed was fixed before clientSeed
  const recomputedCommit = computeCommitHex(serverSeed, nonce)
  expect(recomputedCommit).toBe(commitHex) // ✅ commitment holds

  // Step 2: Recompute combinedSeed
  const recomputedCombined = computeCombinedSeed(serverSeed, clientSeed, nonce)
  expect(recomputedCombined).toBe(combinedSeed) // ✅ seed matches

  // Step 3: Re-run engine — must produce the same outcome
  const verifiedResult = runRound(recomputedCombined, dropColumn)
  expect(verifiedResult.binIndex).toBe(serverResult.binIndex)       // ✅ same bin
  expect(verifiedResult.pegMapHash).toBe(serverResult.pegMapHash)   // ✅ same pegs
  expect(verifiedResult.path).toEqual(serverResult.path)             // ✅ same path
  expect(verifiedResult.payoutMultiplier).toBe(serverResult.payoutMultiplier)

  // Step 4: Payout math is consistent
  const verifiedWinnings = Math.floor(betCents * verifiedResult.payoutMultiplier)
  expect(verifiedWinnings).toBe(winnings) // ✅ same payout
})

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION 2 — Server cannot cheat: tampering is detectable
// ─────────────────────────────────────────────────────────────────────────────

test('tampered serverSeed after commit is always detectable', () => {
  const serverSeed   = generateServerSeed()
  const nonce        = generateNonce()
  const commitHex    = computeCommitHex(serverSeed, nonce) // sent to player upfront

  // Server tries to use a different serverSeed after seeing the clientSeed
  const cheaterSeed  = generateServerSeed() // different seed

  // Player checks: does computeCommitHex(cheaterSeed, nonce) === commitHex?
  const cheaterCommit = computeCommitHex(cheaterSeed, nonce)
  expect(cheaterCommit).not.toBe(commitHex) // ❌ mismatch → cheat detected
})

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION 3 — Spec test vectors pass the full pipeline
// ─────────────────────────────────────────────────────────────────────────────

test('spec test vectors: full pipeline produces expected outcome', () => {
  const SERVER_SEED  = 'b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc'
  const NONCE        = '42'
  const CLIENT_SEED  = 'candidate-hello'
  const DROP_COLUMN  = 6

  // Commit
  expect(computeCommitHex(SERVER_SEED, NONCE)).toBe(
    'bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34'
  )

  // CombinedSeed
  const combinedSeed = computeCombinedSeed(SERVER_SEED, CLIENT_SEED, NONCE)
  expect(combinedSeed).toBe(
    'e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0'
  )

  // Outcome
  const { binIndex, path, pegMapHash } = runRound(combinedSeed, DROP_COLUMN)
  expect(binIndex).toBe(6)           // spec says center drop → bin 6
  expect(path).toHaveLength(12)      // 12 decisions, one per row
  expect(pegMapHash).toHaveLength(64) // SHA-256 = 64 hex chars

  // Verifier re-run must match
  const verify = runRound(combinedSeed, DROP_COLUMN)
  expect(verify.binIndex).toBe(binIndex)
  expect(verify.pegMapHash).toBe(pegMapHash)
  expect(verify.path).toEqual(path)
})

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION 4 — Each round (different nonce) is independent
// ─────────────────────────────────────────────────────────────────────────────

test('rounds with different nonces are fully independent (no correlation)', () => {
  const serverSeed = generateServerSeed()
  const clientSeed = 'same-client-seed'
  const dropColumn = 6

  // Three rounds, same server + client seed but different nonces
  const results = ['100', '200', '300'].map(nonce => {
    const combined = computeCombinedSeed(serverSeed, clientSeed, nonce)
    return runRound(combined, dropColumn)
  })

  // Every round must have a distinct peg map (different nonce → different combined → different RNG)
  const hashes = results.map(r => r.pegMapHash)
  expect(hashes[0]).not.toBe(hashes[1])
  expect(hashes[1]).not.toBe(hashes[2])
  expect(new Set(hashes).size).toBe(3) // all 3 are distinct
})
