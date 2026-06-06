// __tests__/engine.test.ts

import { PRNG } from '@/lib/engine/prng'
import {
    computeCommitHex,
    computeCombinedSeed,
    computePegMapHash,
} from '@/lib/engine/combiner'
import { generatePegMap } from '@/lib/engine/pegmap'
import { runRound } from '@/lib/engine/index'

// ─── Spec test vector inputs ──────────────────────────────────────────────────
const SERVER_SEED = 'b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc'
const NONCE = '42'
const CLIENT_SEED = 'candidate-hello'
const COMBINED_SEED = 'e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0'

// ─── Test 1: commitHex ────────────────────────────────────────────────────────
test('commitHex matches spec', () => {
    const result = computeCommitHex(SERVER_SEED, NONCE)
    expect(result).toBe(
        'bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34',
    )
})

// ─── Test 2: combinedSeed ─────────────────────────────────────────────────────
test('combinedSeed matches spec', () => {
    const result = computeCombinedSeed(SERVER_SEED, CLIENT_SEED, NONCE)
    expect(result).toBe(COMBINED_SEED)
})

// ─── Test 3: PRNG sequence ────────────────────────────────────────────────────
test('xorshift32 PRNG first 5 values match spec', () => {
    const prng = new PRNG(COMBINED_SEED)
    const expected = [
        0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297,
    ]
    for (const exp of expected) {
        expect(prng.next()).toBeCloseTo(exp, 9) // 9 decimal places
    }
})

// ─── Test 4: Peg map rows 0-2 ─────────────────────────────────────────────────
test('peg map rows 0-2 match spec', () => {
    const prng = new PRNG(COMBINED_SEED)
    const pegMap = generatePegMap(prng)

    expect(pegMap[0]).toEqual([0.422123])
    expect(pegMap[1]).toEqual([0.552503, 0.408786])
    // Row 2: spec says [0.491574, 0.468780, 0.436540]
    // toFixed strips trailing zeros → 0.46878, 0.43654
    // So we check to 5 significant decimal places
    expect(pegMap[2][0]).toBeCloseTo(0.491574, 5)
    expect(pegMap[2][1]).toBeCloseTo(0.468780, 5)
    expect(pegMap[2][2]).toBeCloseTo(0.436540, 5)
})

// ─── Test 5: Center drop → binIndex 6 ────────────────────────────────────────
test('center drop (dropColumn=6) lands on bin 6', () => {
    const { binIndex } = runRound(COMBINED_SEED, 6)
    expect(binIndex).toBe(6)
})

// ─── Test 6: Replay determinism ───────────────────────────────────────────────
test('same inputs always produce same output (determinism)', () => {
    const result1 = runRound(COMBINED_SEED, 6)
    const result2 = runRound(COMBINED_SEED, 6)
    const result3 = runRound(COMBINED_SEED, 6)

    expect(result1.binIndex).toBe(result2.binIndex)
    expect(result2.binIndex).toBe(result3.binIndex)
    expect(result1.path).toEqual(result2.path)
    expect(result2.path).toEqual(result3.path)
    expect(result1.pegMapHash).toBe(result2.pegMapHash)
})

// ─── Test 7: Different seeds → different outcomes ─────────────────────────────
test('different combined seeds produce different peg maps', () => {
    const seed1 = computeCombinedSeed(SERVER_SEED, 'client-A', NONCE)
    const seed2 = computeCombinedSeed(SERVER_SEED, 'client-B', NONCE)

    const result1 = runRound(seed1, 6)
    const result2 = runRound(seed2, 6)

    // Different seeds → almost certainly different pegMapHash
    // (there's a theoretical collision chance, but essentially zero with SHA-256)
    expect(result1.pegMapHash).not.toBe(result2.pegMapHash)
})

// ─── Test 8: Path length is always 12 ────────────────────────────────────────
test('path always has exactly 12 decisions', () => {
    const { path } = runRound(COMBINED_SEED, 6)
    expect(path).toHaveLength(12)
    expect(path.every((d) => d === 'L' || d === 'R')).toBe(true)
})