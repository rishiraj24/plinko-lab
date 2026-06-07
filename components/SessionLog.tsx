// components/SessionLog.tsx

'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoundRow {
  id:               string
  status:           string
  dropColumn:       number | null
  binIndex:         number | null
  payoutMultiplier: number | null
  payoutCents:      number | null
  betCents:         number | null
  clientSeed:       string | null
  nonce:            string | null
  commitHex:        string | null
  serverSeed:       string | null
  createdAt:        string
}

interface Props {
  /** Bump this value to trigger a refresh (e.g. pass round count or a UUID). */
  refreshKey?: string | number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAYTABLE = [10, 3, 2, 1.5, 1, 0.5, 0.2, 0.5, 1, 1.5, 2, 3, 10]

function statusBadge(status: string): string {
  if (status === 'REVEALED') return '✅ revealed'
  if (status === 'STARTED')  return '⏳ started'
  return '🔒 created'
}

function payoutColor(mult: number | null): string {
  if (!mult) return '#4a4070'
  if (mult >= 10)  return '#ffd700'
  if (mult >= 3)   return '#ff8c00'
  if (mult >= 1.5) return '#c8b8ff'
  if (mult >= 1)   return '#a090d0'
  return '#6b5fa0'
}

function verifyHref(r: RoundRow): string | null {
  if (r.status !== 'REVEALED') return null
  if (!r.serverSeed || !r.clientSeed || !r.nonce || r.dropColumn == null) return null
  const p = new URLSearchParams({
    serverSeed:  r.serverSeed,
    clientSeed:  r.clientSeed,
    nonce:       r.nonce,
    dropColumn:  String(r.dropColumn),
    roundId:     r.id,
  })
  return `/verify?${p.toString()}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionLog({ refreshKey }: Props) {
  const [rounds,    setRounds]    = useState<RoundRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState(true)

  const fetchRounds = useCallback(async () => {
    try {
      const res  = await fetch('/api/rounds?limit=20')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setRounds(data.rounds)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session log')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => { fetchRounds() }, [fetchRounds])

  // Re-fetch whenever parent signals a new round completed
  useEffect(() => {
    if (refreshKey !== undefined) fetchRounds()
  }, [refreshKey, fetchRounds])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="session-log" aria-label="Session history">
      <div className="session-log-header">
        <button
          className="session-log-toggle"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-controls="session-log-body"
        >
          <span className="session-log-title">Session Log</span>
          <span className="session-log-count">
            {rounds.length > 0 ? `${rounds.length} rounds` : ''}
          </span>
          <span className="session-toggle-icon" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </button>
        <button
          className="session-refresh-btn"
          onClick={fetchRounds}
          aria-label="Refresh session log"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {expanded && (
        <div id="session-log-body" className="session-log-body">
          {loading && (
            <div className="session-empty">Loading…</div>
          )}
          {error && (
            <div className="session-error" role="alert">{error}</div>
          )}
          {!loading && !error && rounds.length === 0 && (
            <div className="session-empty">No rounds yet. Drop a ball!</div>
          )}
          {!loading && rounds.length > 0 && (
            <div className="session-table-wrap">
              <table className="session-table" aria-label="Round history">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Status</th>
                    <th>Col</th>
                    <th>Bin</th>
                    <th>Bet</th>
                    <th>Payout</th>
                    <th>When</th>
                    <th>Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r, i) => {
                    const href = verifyHref(r)
                    const mult = r.payoutMultiplier
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                        <td className="session-id mono" title={r.id}>
                          {r.id.slice(-6)}
                        </td>
                        <td>
                          <span className={`status-badge status-${r.status.toLowerCase()}`}>
                            {statusBadge(r.status)}
                          </span>
                        </td>
                        <td className="session-center">
                          {r.dropColumn ?? '—'}
                        </td>
                        <td className="session-center">
                          {r.binIndex ?? '—'}
                        </td>
                        <td className="session-center">
                          {r.betCents != null ? `${r.betCents}¢` : '—'}
                        </td>
                        <td
                          className="session-payout"
                          style={{ color: payoutColor(mult) }}
                        >
                          {mult != null ? `${mult}×` : '—'}
                          {r.payoutCents != null ? (
                            <span className="payout-cents"> {r.payoutCents}¢</span>
                          ) : null}
                        </td>
                        <td className="session-time">
                          {timeAgo(r.createdAt)}
                        </td>
                        <td className="session-verify-cell">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="session-verify-link"
                              aria-label={`Verify round ${r.id.slice(-6)}`}
                            >
                              verify ↗
                            </a>
                          ) : (
                            <span className="session-verify-na">
                              {r.status === 'REVEALED' ? '—' : 'pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
