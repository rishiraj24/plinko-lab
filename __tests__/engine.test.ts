// __tests__/engine.test.ts
//
// Core engine unit tests — the spec test vectors are the source of truth.
// 17 tests covering: hashing, PRNG sequence, peg map, simulation,
// determinism, paytable validity, and edge drop columns.

import { PRNG } from '@/lib/engine/prng'
import { computeCommitHex, computeCombinedSeed, computePegMapHash } from '@/lib/engine/combiner'
import { generatePegMap, ROWS } from '@/lib/engine/pegmap'
import { PAYTABLE, getPayoutMultiplier } from '@/lib/engine/simulator'
import { runRound } from '@/lib/engine/index'

// ─── Spec test vector constants ───────────────────────────────────────────────
const SERVER_SEED   = 'b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc'
const NONCE         = '42'
const CLIENT_SEED   = 'candidate-hello'
const COMBINED_SEED = 'e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0'

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — SHA-256 Combiner
// ─────────────────────────────────────────────────────────────────────────────

test('commitHex = SHA256(serverSeed:nonce) matches spec', () => {
  expect(computeCommitHex(SERVER_SEED, NONCE)).toBe(
    'bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34'
  )
})

test('combinedSeed = SHA256(serverSeed:clientSeed:nonce) matches spec', () => {
  expect(computeCombinedSeed(SERVER_SEED, CLIENT_SEED, NONCE)).toBe(COMBINED_SEED)
})

test('commitHex changes when nonce changes (each round is unique)', () => {
  const c1 = computeCommitHex(SERVER_SEED, '1')
  const c2 = computeCommitHex(SERVER_SEED, '2')
  expect(c1).not.toBe(c2)
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — xorshift32 PRNG
// ─────────────────────────────────────────────────────────────────────────────

test('PRNG first 5 values match spec exactly (to 9 decimal places)', () => {
  const prng = new PRNG(COMBINED_SEED)
  const expected = [0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297]
  for (const exp of expected) {
    expect(prng.next()).toBeCloseTo(exp, 9)
  }
})

test('PRNG output is always in [0, 1) across 1000 draws', () => {
  const prng = new PRNG(COMBINED_SEED)
  for (let i = 0; i < 1000; i++) {
    const val = prng.next()
    expect(val).toBeGreaterThanOrEqual(0)
    expect(val).toBeLessThan(1)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Peg Map
// ─────────────────────────────────────────────────────────────────────────────

test('peg map rows 0–2 match spec values', () => {
  const pegMap = generatePegMap(new PRNG(COMBINED_SEED))
  // Spec: Row 0: [0.422123]
  expect(pegMap[0]).toEqual([0.422123])
  // Spec: Row 1: [0.552503, 0.408786]
  expect(pegMap[1]).toEqual([0.552503, 0.408786])
  // Spec: Row 2: [0.491574, 0.468780, 0.436540]
  expect(pegMap[2][0]).toBeCloseTo(0.491574, 5)
  expect(pegMap[2][1]).toBeCloseTo(0.468780, 5)
  expect(pegMap[2][2]).toBeCloseTo(0.436540, 5)
})

test('peg map shape: row r always has exactly r+1 pegs', () => {
  const pegMap = generatePegMap(new PRNG(COMBINED_SEED))
  expect(pegMap).toHaveLength(ROWS) // 12 rows
  for (let r = 0; r < ROWS; r++) {
    expect(pegMap[r]).toHaveLength(r + 1)
  }
})

test('all leftBias values are in [0.4, 0.6]', () => {
  const pegMap = generatePegMap(new PRNG(COMBINED_SEED))
  for (const row of pegMap) {
    for (const bias of row) {
      expect(bias).toBeGreaterThanOrEqual(0.4)
      expect(bias).toBeLessThanOrEqual(0.6)
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Ball Simulation
// ─────────────────────────────────────────────────────────────────────────────

test('center drop (dropColumn=6) → binIndex=6 per spec', () => {
  expect(runRound(COMBINED_SEED, 6).binIndex).toBe(6)
})

test('path is exactly 12 L/R decisions', () => {
  const { path } = runRound(COMBINED_SEED, 6)
  expect(path).toHaveLength(12)
  expect(path.every(d => d === 'L' || d === 'R')).toBe(true)
})

test('binIndex is always in [0, 12] for all 13 drop columns', () => {
  for (let col = 0; col <= 12; col++) {
    const { binIndex } = runRound(COMBINED_SEED, col)
    expect(binIndex).toBeGreaterThanOrEqual(0)
    expect(binIndex).toBeLessThanOrEqual(12)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — Determinism
// ─────────────────────────────────────────────────────────────────────────────

test('identical inputs produce identical outputs (run 3× and compare)', () => {
  const [r1, r2, r3] = [
    runRound(COMBINED_SEED, 6),
    runRound(COMBINED_SEED, 6),
    runRound(COMBINED_SEED, 6),
  ]
  expect(r1.binIndex).toBe(r2.binIndex)
  expect(r2.binIndex).toBe(r3.binIndex)
  expect(r1.path).toEqual(r2.path)
  expect(r2.path).toEqual(r3.path)
  expect(r1.pegMapHash).toBe(r2.pegMapHash)
  expect(r2.pegMapHash).toBe(r3.pegMapHash)
})

test('different clientSeeds produce different peg maps (client contribution is real)', () => {
  const seedA = computeCombinedSeed(SERVER_SEED, 'alice', NONCE)
  const seedB = computeCombinedSeed(SERVER_SEED, 'bob',   NONCE)
  expect(runRound(seedA, 6).pegMapHash).not.toBe(runRound(seedB, 6).pegMapHash)
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 6 — Paytable
// ─────────────────────────────────────────────────────────────────────────────

test('paytable has exactly 13 entries (bins 0–12)', () => {
  expect(PAYTABLE).toHaveLength(13)
})

test('paytable is symmetric (bin i === bin 12-i)', () => {
  for (let i = 0; i <= 6; i++) {
    expect(PAYTABLE[i]).toBe(PAYTABLE[12 - i])
  }
})

test('getPayoutMultiplier returns correct edge and center values', () => {
  expect(getPayoutMultiplier(0)).toBe(10)   // leftmost edge
  expect(getPayoutMultiplier(6)).toBe(0.2)  // center (house edge bin)
  expect(getPayoutMultiplier(12)).toBe(10)  // rightmost edge
})

test('pegMapHash changes when pegMap changes (hash is sensitive to content)', () => {
  const pegMap1 = generatePegMap(new PRNG(COMBINED_SEED))
  const seedB   = computeCombinedSeed(SERVER_SEED, 'other-client', NONCE)
  const pegMap2 = generatePegMap(new PRNG(seedB))
  expect(computePegMapHash(pegMap1)).not.toBe(computePegMapHash(pegMap2))
})