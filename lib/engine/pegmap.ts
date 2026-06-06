// lib/engine/pegmap.ts

import type { PRNG } from './prng'

export const ROWS = 12

/**
 * Generates the peg map — a 2D array of leftBias values.
 *
 * pegMap[r] has r+1 pegs (triangular layout):
 *   Row 0: [b]
 *   Row 1: [b, b]
 *   Row 2: [b, b, b]
 *   ...
 *   Row 11: [b, b, b, b, b, b, b, b, b, b, b, b]  ← 12 pegs
 *
 * Formula per peg: leftBias = 0.5 + (rand() - 0.5) * 0.2
 *   → range: [0.4, 0.6]
 *   → rounded to 6 decimal places for a stable, hashable value
 *
 * CRITICAL: This function consumes ROWS*(ROWS+1)/2 = 78 PRNG values.
 * The simulator must use the SAME prng instance, after this function returns.
 */
export function generatePegMap(prng: PRNG): number[][] {
  const pegMap: number[][] = []

  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let p = 0; p <= r; p++) {
      const raw = 0.5 + (prng.next() - 0.5) * 0.2
      // toFixed(6) then parseFloat strips trailing zeros but keeps precision
      const bias = parseFloat(raw.toFixed(6))
      row.push(bias)
    }
    pegMap.push(row)
  }

  return pegMap
}