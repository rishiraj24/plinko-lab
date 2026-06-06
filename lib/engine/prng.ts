// lib/engine/prng.ts

/**
 * xorshift32 PRNG — deterministic, reproducible, zero-dependency.
 *
 * Seeded from the first 4 bytes of combinedSeedHex (big-endian uint32).
 * Produces floats in [0, 1) via division by 2^32.
 *
 * Verified against spec test vectors:
 *   combinedSeed starting with "e1dddf77..." → first 5 values:
 *   0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297
 */
export class PRNG {
  private state: number

  constructor(combinedSeedHex: string) {
    // First 8 hex chars = first 4 bytes = big-endian uint32
    this.state = parseInt(combinedSeedHex.slice(0, 8), 16) >>> 0

    // xorshift32 with state=0 is degenerate (produces only zeros).
    // SHA-256 output will never be all-zeros, but guard anyway.
    if (this.state === 0) this.state = 1
  }

  /**
   * Returns the next float in [0, 1).
   * Mutates internal state — calling order matters.
   */
  next(): number {
    // xorshift32 with shift parameters (13, 17, 5) — period 2^32 - 1
    this.state ^= this.state << 13
    this.state ^= this.state >>> 17 // unsigned right shift keeps it 32-bit
    this.state ^= this.state << 5
    this.state = this.state >>> 0   // force to unsigned 32-bit after each step
    return this.state / 4294967296  // 2^32
  }

  /**
   * Exposes current state — used by the Debug Grid easter egg (Phase 6).
   */
  getState(): number {
    return this.state
  }
}