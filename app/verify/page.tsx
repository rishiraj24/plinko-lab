// app/verify/page.tsx

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { sha256Async } from '@/lib/engine'
import './page.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerifyResult {
  commitHex:    string
  combinedSeed: string
  pegMapHash:   string
  binIndex:     number
  path:         string[]
  payoutMultiplier: number
}

interface StoredRound {
  commitHex:    string
  pegMapHash:   string
  binIndex:     number
  serverSeed:   string
  status:       string
}

interface MatchResult {
  commitHex:  boolean
  pegMapHash: boolean
  binIndex:   boolean
}

// ── Spec test vectors ─────────────────────────────────────────────────────────
// Pre-fill these to let reviewers verify your engine in one click.

const TEST_VECTORS = {
  serverSeed:  'b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc',
  clientSeed:  'candidate-hello',
  nonce:       '42',
  dropColumn:  '6',
  // Expected outputs (from spec):
  // binIndex = 6
  // Verify these match after clicking Verify
}

// ── Paytable ──────────────────────────────────────────────────────────────────

const PAYTABLE = [10, 3, 2, 1.5, 1, 0.5, 0.2, 0.5, 1, 1.5, 2, 3, 10]

// ── Engine re-implementation (browser-side) ───────────────────────────────────
//
// These mirror the exact logic in lib/engine exactly.
// We import sha256Async but re-implement xorshift32 and the path simulator
// here inline so this file is self-contained and reviewers can read it
// without hunting through the codebase.

function xorshift32(seed: number): () => number {
  let state = seed >>> 0
  if (state === 0) state = 1
  return function rand(): number {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0
    return state / 0x100000000
  }
}

function seedFromHex(hex: string): number {
  // Take first 8 hex chars (4 bytes), parse as big-endian uint32
  const slice = hex.slice(0, 8)
  return parseInt(slice, 16) >>> 0
}

function buildPegMap(rand: () => number, rows: number): number[][] {
  const pegMap: number[][] = []
  for (let r = 0; r < rows; r++) {
    const rowPegs: number[] = []
    for (let p = 0; p <= r; p++) {
      const raw  = 0.5 + (rand() - 0.5) * 0.2
      rowPegs.push(parseFloat(raw.toFixed(6)))
    }
    pegMap.push(rowPegs)
  }
  return pegMap
}

function simulatePath(
  rand: () => number,
  pegMap: number[][],
  dropColumn: number,
): { path: string[]; binIndex: number } {
  const ROWS = 12
  const path: string[] = []
  let pos = dropColumn

  for (let r = 0; r < ROWS; r++) {
    const pegIdx = Math.min(pos, r)
    const bias   = pegMap[r][pegIdx]
    const adj    = (dropColumn - 6) * 0.01
    const biasAdj = Math.max(0, Math.min(1, bias + adj))
    const roll   = rand()
    if (roll < biasAdj) {
      path.push('L')
    } else {
      path.push('R')
      pos++
    }
  }

  return { path, binIndex: pos }
}

async function runVerification(
  serverSeed: string,
  clientSeed: string,
  nonce: string,
  dropColumn: number,
): Promise<VerifyResult> {
  const ROWS = 12

  // Step 1: commitHex = SHA256(serverSeed + ':' + nonce)
  const commitHex = await sha256Async(`${serverSeed}:${nonce}`)

  // Step 2: combinedSeed = SHA256(serverSeed + ':' + clientSeed + ':' + nonce)
  const combinedSeed = await sha256Async(`${serverSeed}:${clientSeed}:${nonce}`)

  // Step 3: Seed xorshift32 from first 4 bytes of combinedSeed
  const seed = seedFromHex(combinedSeed)
  const rand = xorshift32(seed)

  // Step 4: Build peg map
  const pegMap = buildPegMap(rand, ROWS)

  // Step 5: pegMapHash = SHA256(JSON.stringify(pegMap))
  const pegMapHash = await sha256Async(JSON.stringify(pegMap))

  // Step 6: Simulate path
  const { path, binIndex } = simulatePath(rand, pegMap, dropColumn)

  const payoutMultiplier = PAYTABLE[binIndex] ?? 0

  return { commitHex, combinedSeed, pegMapHash, binIndex, path, payoutMultiplier }
}

// ── Component ─────────────────────────────────────────────────────────────────

function VerifyPageContent() {
  const searchParams = useSearchParams()

  // ── Form state ─────────────────────────────────────────────────────────────
  const [serverSeed,  setServerSeed]  = useState('')
  const [clientSeed,  setClientSeed]  = useState('')
  const [nonce,       setNonce]       = useState('')
  const [dropColumn,  setDropColumn]  = useState('6')
  const [roundId,     setRoundId]     = useState('')

  // ── Result state ────────────────────────────────────────────────────────────
  const [result,      setResult]      = useState<VerifyResult | null>(null)
  const [storedRound, setStoredRound] = useState<StoredRound | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isFetching,  setIsFetching]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // ── Auto-fill from URL params ───────────────────────────────────────────────
  useEffect(() => {
    const sv = searchParams.get('serverSeed')
    const cl = searchParams.get('clientSeed')
    const nc = searchParams.get('nonce')
    const dc = searchParams.get('dropColumn')
    const ri = searchParams.get('roundId')

    if (sv) setServerSeed(sv)
    if (cl) setClientSeed(cl)
    if (nc) setNonce(nc)
    if (dc) setDropColumn(dc)
    if (ri) setRoundId(ri)
  }, [searchParams])

  // ── Verify ──────────────────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    setError(null)
    setResult(null)
    setStoredRound(null)
    setMatchResult(null)

    const col = parseInt(dropColumn, 10)

    if (!serverSeed.trim())  return setError('serverSeed is required')
    if (!clientSeed.trim())  return setError('clientSeed is required')
    if (!nonce.trim())       return setError('nonce is required')
    if (isNaN(col) || col < 0 || col > 12) return setError('dropColumn must be 0–12')

    setIsVerifying(true)
    try {
      const res = await runVerification(serverSeed.trim(), clientSeed.trim(), nonce.trim(), col)
      setResult(res)

      // If roundId provided, fetch stored round and compare
      if (roundId.trim()) {
        setIsFetching(true)
        try {
          const resp  = await fetch(`/api/rounds/${roundId.trim()}`)
          const stored: StoredRound = await resp.json()
          if (!resp.ok) throw new Error((stored as any).error ?? 'Round not found')

          setStoredRound(stored)
          setMatchResult({
            commitHex:  stored.commitHex  === res.commitHex,
            pegMapHash: stored.pegMapHash === res.pegMapHash,
            binIndex:   stored.binIndex   === res.binIndex,
          })
        } catch (fetchErr: unknown) {
          setError(fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch stored round')
        } finally {
          setIsFetching(false)
        }
      }
    } catch (verifyErr: unknown) {
      setError(verifyErr instanceof Error ? verifyErr.message : 'Verification failed')
    } finally {
      setIsVerifying(false)
    }
  }, [serverSeed, clientSeed, nonce, dropColumn, roundId])

  // Auto-verify when URL params are fully populated
  useEffect(() => {
    const sv = searchParams.get('serverSeed')
    const cl = searchParams.get('clientSeed')
    const nc = searchParams.get('nonce')
    const dc = searchParams.get('dropColumn')
    if (sv && cl && nc && dc) {
      // Small delay to let state settle after the first useEffect
      setTimeout(() => handleVerify(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount

  // ── Load test vectors ───────────────────────────────────────────────────────
  function loadTestVectors() {
    setServerSeed(TEST_VECTORS.serverSeed)
    setClientSeed(TEST_VECTORS.clientSeed)
    setNonce(TEST_VECTORS.nonce)
    setDropColumn(TEST_VECTORS.dropColumn)
    setRoundId('')
    setResult(null)
    setStoredRound(null)
    setMatchResult(null)
    setError(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const col = parseInt(dropColumn, 10)
  const canVerify = serverSeed && clientSeed && nonce && !isNaN(col) && !isVerifying

  return (
    <main className="verify-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="verify-header">
        <a href="/" className="back-link">← Back to game</a>
        <h1 className="verify-title">Round Verifier</h1>
        <p className="verify-subtitle">
          Recomputes all values client-side using the same engine as the server.
          No trust required.
        </p>
      </div>

      <div className="verify-layout">
        {/* ── Left: Input form ──────────────────────────────────────────────── */}
        <section className="verify-form-panel" aria-label="Verification inputs">
          <div className="verify-form-header">
            <h2 className="panel-title">Inputs</h2>
            <button
              className="btn-test-vectors"
              onClick={loadTestVectors}
              title="Pre-fill with spec test vectors"
            >
              Load test vectors
            </button>
          </div>

          <div className="verify-fields">
            <label className="vf-label">
              Server Seed
              <span className="vf-hint">(revealed after round completes)</span>
            </label>
            <input
              type="text"
              className="vf-input mono"
              value={serverSeed}
              onChange={e => setServerSeed(e.target.value)}
              placeholder="64-char hex string"
              aria-label="Server seed"
              spellCheck={false}
            />

            <label className="vf-label">Client Seed</label>
            <input
              type="text"
              className="vf-input"
              value={clientSeed}
              onChange={e => setClientSeed(e.target.value)}
              placeholder="your chosen seed"
              aria-label="Client seed"
            />

            <label className="vf-label">Nonce</label>
            <input
              type="text"
              className="vf-input mono"
              value={nonce}
              onChange={e => setNonce(e.target.value)}
              placeholder="random number from server"
              aria-label="Nonce"
            />

            <label className="vf-label">Drop Column <span className="vf-hint">(0–12)</span></label>
            <input
              type="number"
              className="vf-input"
              min={0}
              max={12}
              value={dropColumn}
              onChange={e => setDropColumn(e.target.value)}
              aria-label="Drop column"
            />

            <label className="vf-label">
              Round ID <span className="vf-hint">(optional — enables match check)</span>
            </label>
            <input
              type="text"
              className="vf-input mono"
              value={roundId}
              onChange={e => setRoundId(e.target.value)}
              placeholder="cuid from game (optional)"
              aria-label="Round ID"
            />
          </div>

          {error && (
            <div className="verify-error" role="alert">{error}</div>
          )}

          <button
            className="btn-verify"
            onClick={handleVerify}
            disabled={!canVerify}
            aria-busy={isVerifying}
          >
            {isVerifying ? 'Verifying…' : 'Verify Round'}
          </button>
        </section>

        {/* ── Right: Results ────────────────────────────────────────────────── */}
        <section className="verify-results-panel" aria-label="Verification results" aria-live="polite">
          {!result && !isVerifying && (
            <div className="verify-empty">
              <p>Fill in the inputs and click <strong>Verify Round</strong>.</p>
              <p>If you came from a completed game, all fields are already filled.</p>
            </div>
          )}

          {isVerifying && (
            <div className="verify-loading">
              <div className="spinner" aria-hidden="true" />
              <span>Running engine client-side…</span>
            </div>
          )}

          {result && (
            <>
              {/* ── Step breakdown ─────────────────────────────────────────── */}
              <div className="result-section">
                <h2 className="panel-title">Step-by-step recompute</h2>
                <div className="steps">
                  <Step
                    num={1}
                    label="commitHex"
                    formula={`SHA256("${truncate(serverSeed, 8)}…" + ":" + "${nonce}")`}
                    value={result.commitHex}
                  />
                  <Step
                    num={2}
                    label="combinedSeed"
                    formula={`SHA256("${truncate(serverSeed, 8)}…" + ":" + "${clientSeed}" + ":" + "${nonce}")`}
                    value={result.combinedSeed}
                  />
                  <Step
                    num={3}
                    label="pegMapHash"
                    formula={`SHA256(JSON.stringify(buildPegMap(xorshift32(combinedSeed))))`}
                    value={result.pegMapHash}
                  />
                  <Step
                    num={4}
                    label="binIndex"
                    formula={`simulatePath(rand, pegMap, dropColumn=${dropColumn})`}
                    value={String(result.binIndex)}
                    highlight
                  />
                  <Step
                    num={5}
                    label="payoutMultiplier"
                    formula={`PAYTABLE[${result.binIndex}]`}
                    value={`${result.payoutMultiplier}×`}
                    highlight
                  />
                </div>
              </div>

              {/* ── Match check ────────────────────────────────────────────── */}
              {(storedRound || isFetching) && (
                <div className="result-section">
                  <h2 className="panel-title">
                    Match check
                    <span className="panel-subtitle"> vs stored round {roundId}</span>
                  </h2>
                  {isFetching && <div className="verify-loading"><span>Fetching stored round…</span></div>}
                  {matchResult && storedRound && (
                    <>
                      <div className="match-status-banner" data-ok={Object.values(matchResult).every(Boolean)}>
                        {Object.values(matchResult).every(Boolean)
                          ? '✅ All fields match — this round is provably fair'
                          : '❌ Mismatch detected — something doesn\'t add up'}
                      </div>
                      <div className="match-table">
                        <MatchRow field="commitHex"  ok={matchResult.commitHex}  computed={result.commitHex}  stored={storedRound.commitHex} />
                        <MatchRow field="pegMapHash" ok={matchResult.pegMapHash} computed={result.pegMapHash} stored={storedRound.pegMapHash} />
                        <MatchRow field="binIndex"   ok={matchResult.binIndex}   computed={String(result.binIndex)} stored={String(storedRound.binIndex)} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Path replay ────────────────────────────────────────────── */}
              <div className="result-section">
                <h2 className="panel-title">Path replay</h2>
                <p className="panel-subtitle-text">
                  Ball started at column {dropColumn}. Final bin: {result.binIndex}.
                </p>
                <div className="path-table-wrap">
                  <table className="path-table" aria-label="Ball path through peg rows">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Decision</th>
                        <th>Column after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.path.map((decision, r) => {
                        // Cumulative position after this row
                        const pos = result.path.slice(0, r + 1).reduce(
                          (acc, d) => acc + (d === 'R' ? 1 : 0),
                          parseInt(dropColumn, 10),
                        )
                        return (
                          <tr key={r} className={decision === 'L' ? 'path-left' : 'path-right'}>
                            <td>{r + 1}</td>
                            <td>
                              <span className={`decision-badge decision-${decision.toLowerCase()}`}>
                                {decision === 'L' ? '← L' : 'R →'}
                              </span>
                            </td>
                            <td>{pos}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="verify-page verify-loading">Loading verifier...</div>}>
      <VerifyPageContent />
    </Suspense>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Step({
  num, label, formula, value, highlight = false,
}: {
  num: number
  label: string
  formula: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={`step ${highlight ? 'step-highlight' : ''}`}>
      <div className="step-num">{num}</div>
      <div className="step-body">
        <div className="step-label">{label}</div>
        <div className="step-formula">{formula}</div>
        <div className="step-value mono">{value}</div>
      </div>
    </div>
  )
}

function MatchRow({
  field, ok, computed, stored,
}: {
  field: string
  ok: boolean
  computed: string
  stored: string
}) {
  return (
    <div className={`match-row ${ok ? 'match-ok' : 'match-fail'}`}>
      <div className="match-icon" aria-label={ok ? 'Match' : 'Mismatch'}>
        {ok ? '✅' : '❌'}
      </div>
      <div className="match-field-name">{field}</div>
      <div className="match-values">
        <div className="match-value-row">
          <span className="match-source">computed</span>
          <span className="mono match-hex">{truncate(computed, 20)}</span>
        </div>
        <div className="match-value-row">
          <span className="match-source">stored</span>
          <span className="mono match-hex">{truncate(stored, 20)}</span>
        </div>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}