// app/page.tsx

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Controls, { RoundState } from '@/components/Controls'
import type { AnimationState } from '@/components/GameCanvas'

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
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/rounds/commit', { method: 'POST' })
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
      const res = await fetch(`/api/rounds/${r.roundId}/start`, {
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
          setIsLoading(false)
        },
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Drop failed')
      setIsLoading(false)
    }
  }, [clientSeed, betCents, dropColumn])

  async function handleReveal() {
    const r = round
    if (!r) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/rounds/${r.roundId}/reveal`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRound(prev => prev ? { ...prev, phase: 'revealed', serverSeed: data.serverSeed } : prev)
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
      <h1 className="game-title">Plinko Lab</h1>
      <p className="game-subtitle">Provably fair · commit-reveal · open verifier</p>

      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className={`game-layout ${tiltMode ? 'tilt-mode' : ''}`}>
        <div className="canvas-wrap">
          <GameCanvas
            animation={animation}
            winningBin={winningBin}
            debugGrid={debugGrid}
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
          onReveal={handleReveal}
          onReset={handleReset}
        />
      </div>

      <p className="keyboard-hint">
        Keyboard: ← → to move column · Space to drop · T for tilt · G for debug grid
      </p>
    </main>
  )
}