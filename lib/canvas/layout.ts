// lib/canvas/layout.ts

import { ROWS } from '@/lib/engine'

export interface Point {
  x: number
  y: number
}

export interface PegPosition extends Point {
  row: number
  peg: number
}

export interface BinPosition {
  index: number
  x: number      // center x
  y: number      // top y
  width: number
  label: string  // multiplier label, e.g. "10×"
}

// ── Layout constants ──────────────────────────────────────────────────────────

export const H_SPACING   = 40   // px between peg centers horizontally
export const V_SPACING   = 48   // px between rows
export const TOP_OFFSET  = 80   // y of row 0 peg centers
export const PEG_RADIUS  = 6    // px
export const BALL_RADIUS = 10   // px
export const BIN_HEIGHT  = 56   // px

// Paytable — mirrors simulator.ts PAYTABLE
export const PAYTABLE = [10, 3, 2, 1.5, 1, 0.5, 0.2, 0.5, 1, 1.5, 2, 3, 10]

// ── Peg layout ────────────────────────────────────────────────────────────────

/**
 * Returns center (x, y) of peg p in row r.
 *
 * Row r has r+1 pegs (engine internal).
 * Visually we render r+2 pegs per row (the outer boundary pegs) but the engine
 * only tracks r+1 decision points. For rendering, we add one extra peg at each
 * end of every row to give the ball walls to bounce off.
 *
 * We use r+1 engine pegs + gap boundaries for ball path math,
 * and r+2 for visual drawing.
 */
export function pegCenter(
  r: number,
  p: number,           // 0-indexed; for visual rows use 0..r+1
  canvasWidth: number,
): Point {
  // Row r has r+2 visual pegs spanning (r+1) * H_SPACING total
  const rowSpan = (r + 1) * H_SPACING
  const startX  = (canvasWidth - rowSpan) / 2
  return {
    x: startX + p * H_SPACING,
    y: TOP_OFFSET + r * V_SPACING,
  }
}

/**
 * Returns all peg centers for the board — used for drawing.
 * Each row r renders r+2 pegs at positions p = 0..r+1.
 */
export function allPegPositions(canvasWidth: number): PegPosition[] {
  const positions: PegPosition[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let p = 0; p <= r + 1; p++) {
      positions.push({ ...pegCenter(r, p, canvasWidth), row: r, peg: p })
    }
  }
  return positions
}

// ── Ball waypoints ────────────────────────────────────────────────────────────

/**
 * Pre-computes the ball's (x, y) center at each step of the path.
 *
 * Returns ROWS+1 points:
 *   [0]   → initial position above the board (before row 0)
 *   [1]   → after bouncing off row 0
 *   ...
 *   [ROWS] → final position in the bin
 *
 * `pos` tracks the horizontal column index (0..ROWS), same as in simulatePath.
 * The ball's x at step i = midpoint between peg[pos-1] and peg[pos] in row i.
 */
export function computeWaypoints(
  path: string[],          // 'L' | 'R' array, length = ROWS
  dropColumn: number,
  canvasWidth: number,
): Point[] {
  const waypoints: Point[] = []
  let pos = dropColumn   // horizontal index before any bounce

  // Initial position — above row 0, centered on dropColumn gap
  const row0Span = H_SPACING   // row 0 has 1 visual span
  const row0StartX = (canvasWidth - row0Span) / 2
  waypoints.push({
    x: row0StartX + dropColumn * H_SPACING,
    y: TOP_OFFSET - V_SPACING,
  })

  for (let r = 0; r < ROWS; r++) {
    // After the bounce at row r, pos is updated
    if (path[r] === 'R') pos++

    // Ball rests at the gap below row r (between peg[pos-1] and peg[pos])
    const rowSpan = (r + 1) * H_SPACING
    const startX  = (canvasWidth - rowSpan) / 2
    const ballX   = startX + pos * H_SPACING   // center of gap

    const isLast  = r === ROWS - 1
    waypoints.push({
      x: ballX,
      y: isLast
        ? TOP_OFFSET + r * V_SPACING + V_SPACING + BIN_HEIGHT / 2  // inside bin
        : TOP_OFFSET + r * V_SPACING + V_SPACING / 2,              // between rows
    })
  }

  return waypoints
}

// ── Bin layout ────────────────────────────────────────────────────────────────

/**
 * Returns position + metadata for each of the 13 bins.
 */
export function binPositions(canvasWidth: number): BinPosition[] {
  const totalBins = ROWS + 1   // 13
  const totalWidth = ROWS * H_SPACING   // same span as the widest row
  const startX = (canvasWidth - totalWidth) / 2
  const binWidth = totalWidth / totalBins
  const binY = TOP_OFFSET + ROWS * V_SPACING

  return PAYTABLE.map((mult, i) => ({
    index: i,
    x: startX + i * binWidth + binWidth / 2,
    y: binY,
    width: binWidth,
    label: mult >= 1 ? `${mult}×` : `${mult}×`,
  }))
}

// ── Color helpers ─────────────────────────────────────────────────────────────

/** Color-codes bins by multiplier — edges bright, center muted. */
export function binColor(multiplier: number, alpha = 1): string {
  if (multiplier >= 10) return `rgba(255, 200,  50, ${alpha})`  // gold
  if (multiplier >=  3) return `rgba(255, 140,  50, ${alpha})`  // orange
  if (multiplier >=  2) return `rgba(255, 100,  80, ${alpha})`  // red-orange
  if (multiplier >= 1.5) return `rgba(220,  80, 120, ${alpha})` // pink
  if (multiplier >=  1) return `rgba(160,  80, 200, ${alpha})`  // purple
  if (multiplier >= 0.5) return `rgba( 80, 120, 220, ${alpha})` // blue
  return `rgba( 60,  80, 160, ${alpha})`                         // deep blue (0.2×)
}