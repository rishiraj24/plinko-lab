// lib/engine/combiner.ts

import crypto from 'crypto'

/**
 * Generates a cryptographically random serverSeed.
 * 32 bytes = 64 hex chars. Never shown to the player until reveal.
 */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Generates a random nonce — a simple integer as a string.
 * Included in the commit so the player can verify serverSeed wasn't reused.
 */
export function generateNonce(): string {
  return Math.floor(Math.random() * 1_000_000).toString()
}

/**
 * commitHex = SHA256(serverSeed + ":" + nonce)
 *
 * Shown to the player BEFORE they provide clientSeed.
 * Proves the serverSeed was fixed before the player had any influence.
 */
export function computeCommitHex(serverSeed: string, nonce: string): string {
  return crypto
    .createHash('sha256')
    .update(`${serverSeed}:${nonce}`)
    .digest('hex')
}

/**
 * combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
 *
 * The actual RNG seed used for the round.
 * Player can verify: after reveal, recompute this and check the outcome.
 */
export function computeCombinedSeed(
  serverSeed: string,
  clientSeed: string,
  nonce: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${serverSeed}:${clientSeed}:${nonce}`)
    .digest('hex')
}

/**
 * pegMapHash = SHA256(JSON.stringify(pegMap))
 *
 * Stored alongside the round. Proves the peg layout wasn't swapped
 * between the start and reveal of a round.
 */
export function computePegMapHash(pegMap: number[][]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(pegMap))
    .digest('hex')
}