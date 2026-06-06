// lib/engine/index.ts

import { PRNG } from './prng'
import {
  computeCommitHex,
  computeCombinedSeed,
  computePegMapHash,
  generateNonce,
  generateServerSeed,
} from './combiner'
import { generatePegMap, ROWS } from './pegmap'
import { simulatePath, getPayoutMultiplier, PAYTABLE } from './simulator'

// Re-export everything that callers might need
export { ROWS, PAYTABLE }
export {
  generateServerSeed,
  generateNonce,
  computeCommitHex,
  computeCombinedSeed,
  computePegMapHash,
}
export type { Decision, SimulationResult } from './simulator'

export interface RoundResult {
  pegMap: number[][]
  pegMapHash: string
  path: string[]
  binIndex: number
  payoutMultiplier: number
}

/**
 * Runs the complete deterministic engine for one round.
 *
 * Usage in API routes:
 *   const combinedSeed = computeCombinedSeed(serverSeed, clientSeed, nonce)
 *   const result = runRound(combinedSeed, dropColumn)
 *   // store result.path, result.binIndex, result.pegMapHash, result.payoutMultiplier
 *
 * Usage in verifier:
 *   Same call — produces identical output for identical inputs.
 */
export function runRound(combinedSeedHex: string, dropColumn: number): RoundResult {
  const prng = new PRNG(combinedSeedHex)
  const pegMap = generatePegMap(prng)                // consumes 78 PRNG values
  const pegMapHash = computePegMapHash(pegMap)
  const { path, binIndex } = simulatePath(prng, pegMap, dropColumn) // consumes 12 more
  const payoutMultiplier = getPayoutMultiplier(binIndex)

  return { pegMap, pegMapHash, path, binIndex, payoutMultiplier }
}