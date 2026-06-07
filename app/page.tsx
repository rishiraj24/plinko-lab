// app/page.tsx

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Controls, { RoundState } from '@/components/Controls'
import type { AnimationState } from '@/components/GameCanvas'
import { audioService } from '@/lib/audio/AudioService'
import MuteButton from '@/components/MuteButton'
import { retryFetch } from '@/lib/utils/retryFetch'
import SessionLog from '@/components/SessionLog'

// Canvas must be client-only (uses window/document)
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false })

// ── Confetti (optional — install canvas-confetti) ─────────────────────────────
async function fireConfetti(multiplier: number) {
  try {
    const confetti = (await import('canvas-confetti')).default
    if (multiplier >= 10) {
      // Golden burst for jackpot bins
      confetti({ particleCount: 200, spread: 90, colors: ['#ffd700', '#fff', '#ffa500'] })
    } else if (multiplier >= 2) {
      confetti({ particleCount: 80, spread: 60 })
    }
  } catch {
    // canvas-confetti not installed — silently skip
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GamePage() {
  // ── Game state ─────────────────────────────────────────────────────────────
  const [betCents, setBetCents] = useState(100)
  const [dropColumn, setDropColumn] = useState(6)
  const [clientSeed, setClientSeed] = useState('my-lucky-seed')
  const [round, setRound] = useState<RoundState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [animation, setAnimation] = useState<AnimationState | null>(null)
  const [winningBin, setWinningBin] = useState<number | null>(null)
  const [debugGrid, setDebugGrid] = useState(false)
  const [tiltMode, setTiltMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logRefreshKey, setLogRefreshKey] = useState(0)

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const roundRef = useRef(round)
  roundRef.current = round

  // ── Keyboard controls ──────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const phase = roundRef.current?.phase ?? 'idle'

      if (e.key === 'ArrowLeft' && phase === 'idle') setDropColumn(c => Math.max(0, c - 1))
      if (e.key === 'ArrowRight' && phase === 'idle') setDropColumn(c => Math.min(12, c + 1))
      if (e.key === ' ' && phase === 'committed') { e.preventDefault(); handleDrop() }
      if (e.key === 't' || e.key === 'T') setTiltMode(t => !t)
      if (e.key === 'g' || e.key === 'G') setDebugGrid(d => !d)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, []) // handleDrop added below via ref

  // ── API helpers ────────────────────────────────────────────────────────────

  async function handleCommit() {
    audioService.init()
    setIsLoading(true)
    setError(null)
    try {
      const res = await retryFetch('/api/rounds/commit', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRound({ roundId: data.roundId, commitHex: data.commitHex, nonce: data.nonce, phase: 'committed' })
      setWinningBin(null)
      setAnimation(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDrop = useCallback(async () => {
    const r = roundRef.current
    if (!r || r.phase !== 'committed') return
    setIsLoading(true)
    setError(null)
    try {
      const res = await retryFetch(`/api/rounds/${r.roundId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSeed, betCents, dropColumn }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setRound(prev => prev ? {
        ...prev, phase: 'animating', binIndex: data.binIndex,
        payoutMultiplier: data.payoutMultiplier, payoutCents: data.payoutCents,
        path: data.path, dropColumn
      } : prev)

      setAnimation({
        path: data.path,
        dropColumn,
        binIndex: data.binIndex,
        onComplete: (binIndex) => {
          setWinningBin(binIndex)
          fireConfetti(data.payoutMultiplier)
          // ── Audio on landing ─────────────────────────────────────
          if (data.payoutMultiplier >= 10) {
            audioService.playGolden()
          } else {
            audioService.playLand(data.payoutMultiplier)
          }
          handleReveal(r.roundId)
        },
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Drop failed')
      setIsLoading(false)
    }
  }, [clientSeed, betCents, dropColumn])

  async function handleReveal(roundId: string) {
    setIsLoading(true)
    setError(null)
    try {
      const res = await retryFetch(`/api/rounds/${roundId}/reveal`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRound(prev => prev ? { ...prev, phase: 'revealed', serverSeed: data.serverSeed } : prev)
      setLogRefreshKey(k => k + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reveal failed')
    } finally {
      setIsLoading(false)
    }
  }

  function handleReset() {
    setRound(null)
    setAnimation(null)
    setWinningBin(null)
    setError(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="game-page">
      <div className="game-header">

        <div>
          <h1 className="game-title">Plinko Lab</h1>
          <p className="game-subtitle">Provably fair · commit-reveal · open verifier</p>
        </div>
        <MuteButton />
      </div>

      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <div className="error-toast-actions">
            {round?.phase === 'committed' && (
              <button className="btn-retry" onClick={handleDrop}>
                Retry
              </button>
            )}
            {round?.phase === 'animating' && (
              <button className="btn-retry" onClick={() => round.roundId && handleReveal(round.roundId)}>
                Retry reveal
              </button>
            )}
            <button className="btn-dismiss" onClick={() => setError(null)}>✕</button>
          </div>
        </div>
      )}

      <div className={`game-layout ${tiltMode ? 'tilt-mode' : ''}`}>
        <div className="canvas-wrap">
          <GameCanvas
            animation={animation}
            winningBin={winningBin}
            debugGrid={debugGrid}
            reducedMotion={prefersReducedMotion}
          />
          {/* ARIA live region for screen reader announcements */}
          <div aria-live="assertive" className="sr-only">
            {winningBin !== null
              ? `Ball landed in bin ${winningBin}. Payout: ${round?.payoutMultiplier}× — ${round?.payoutCents} cents.`
              : ''}
          </div>
        </div>

        <Controls
          betCents={betCents}
          dropColumn={dropColumn}
          clientSeed={clientSeed}
          round={round}
          isLoading={isLoading}
          onBetChange={setBetCents}
          onDropColumnChange={setDropColumn}
          onClientSeedChange={setClientSeed}
          onCommit={handleCommit}
          onDrop={handleDrop}
          onReset={handleReset}
        />
      </div>

      <SessionLog refreshKey={logRefreshKey} />

      <p className="keyboard-hint">
        Keyboard: ← → to move column · Space to drop · T for tilt · G for debug grid
      </p>
    </main>
  )
}