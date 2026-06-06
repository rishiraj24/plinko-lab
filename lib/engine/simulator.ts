// lib/engine/simulator.ts

import type { PRNG } from './prng'
import { ROWS } from './pegmap'

export type Decision = 'L' | 'R'

export interface SimulationResult {
  path: Decision[]  // one entry per row, length always = ROWS
  binIndex: number  // 0..12 — final bin the ball lands in
}

/**
 * Paytable — symmetric, edges pay more than center.
 * Index = binIndex (0..12).
 */
export const PAYTABLE: number[] = [
  10, 3, 2, 1.5, 1, 0.5, 0.2, 0.5, 1, 1.5, 2, 3, 10,
]

/**
 * Simulates the ball path through the peg map.
 *
 * dropColumn 0..12 converts to a small bias adjustment:
 *   adj = (dropColumn - 6) * 0.01
 *   e.g. col 0 → adj = -0.06 (pushes left)
 *        col 6 → adj =  0    (neutral)
 *        col 12 → adj = +0.06 (pushes right... but leftBias + adj means
 *                               higher leftBias = goes left more)
 *
 * Wait — re-read spec: adj is added to leftBias. Higher leftBias = more likely
 * to go left. So dropColumn 12 (rightmost) adds +0.06 to leftBias, meaning
 * the ball actually goes LEFT more. That's counterintuitive — the spec says
 * "bias adjustment" and the exact effect is small (±6% max). Keep it as spec.
 *
 * Per row r:
 *   1. pegIdx = min(pos, r)   — which peg is the ball above?
 *   2. bias' = clamp(leftBias[r][pegIdx] + adj, 0, 1)
 *   3. rnd = prng.next()
 *   4. rnd < bias' → Left | else → Right (pos++)
 *
 * IMPORTANT: Pass the same PRNG instance used in generatePegMap,
 * AFTER generating the peg map. Do not create a new PRNG here.
 */
export function simulatePath(
  prng: PRNG,
  pegMap: number[][],
  dropColumn: number,
): SimulationResult {
  const adj = (dropColumn - Math.floor(ROWS / 2)) * 0.01
  let pos = 0
  const path: Decision[] = []

  for (let r = 0; r < ROWS; r++) {
    const pegIdx = Math.min(pos, r)
    const leftBias = pegMap[r][pegIdx]
    const biasPrime = Math.max(0, Math.min(1, leftBias + adj))
    const rnd = prng.next()

    if (rnd < biasPrime) {
      path.push('L')
    } else {
      path.push('R')
      pos++
    }
  }

  return { path, binIndex: pos }
}

/**
 * Looks up the payout multiplier for a given bin index.
 */
export function getPayoutMultiplier(binIndex: number): number {
  return PAYTABLE[binIndex] ?? 0
}