// components/Controls.tsx

'use client'

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoundPhase = 'idle' | 'committed' | 'animating' | 'revealed'

export interface RoundState {
    roundId: string
    commitHex: string
    nonce: string
    phase: RoundPhase
    serverSeed?: string
    binIndex?: number
    payoutMultiplier?: number
    payoutCents?: number
    path?: string[]
    dropColumn?: number
}

interface Props {
    betCents: number
    dropColumn: number
    clientSeed: string
    round: RoundState | null
    isLoading: boolean
    onBetChange: (cents: number) => void
    onDropColumnChange: (col: number) => void
    onClientSeedChange: (seed: string) => void
    onCommit: () => void
    onDrop: () => void
    onReset: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(hex: string, chars = 16) {
    return hex ? `${hex.slice(0, chars)}…` : '—'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Controls({
    betCents,
    dropColumn,
    clientSeed,
    round,
    isLoading,
    onBetChange,
    onDropColumnChange,
    onClientSeedChange,
    onCommit,
    onDrop,
    onReset,
}: Props) {
    const phase = round?.phase ?? 'idle'

    const canCommit = phase === 'idle' && !isLoading
    const canDrop = phase === 'committed' && !isLoading
    const canReveal = phase === 'animating' && !isLoading
    const canReset = (phase === 'revealed') && !isLoading

    return (
        <div className="controls-panel">
            {/* ── Drop column ────────────────────────────────────────────────── */}
            <div className="control-group">
                <label className="control-label">Drop Column</label>
                <div className="col-selector">
                    <button
                        className="arrow-btn"
                        onClick={() => onDropColumnChange(Math.max(0, dropColumn - 1))}
                        disabled={dropColumn === 0 || phase !== 'idle'}
                        aria-label="Move left"
                    >
                        ←
                    </button>
                    <span className="col-value">{dropColumn}</span>
                    <button
                        className="arrow-btn"
                        onClick={() => onDropColumnChange(Math.min(12, dropColumn + 1))}
                        disabled={dropColumn === 12 || phase !== 'idle'}
                        aria-label="Move right"
                    >
                        →
                    </button>
                </div>
            </div>

            {/* ── Bet ────────────────────────────────────────────────────────── */}
            <div className="control-group">
                <label className="control-label">Bet (cents)</label>
                <input
                    type="number"
                    min={1}
                    value={betCents}
                    onChange={(e) => onBetChange(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={phase !== 'idle'}
                    className="text-input"
                    aria-label="Bet amount in cents"
                />
            </div>

            {/* ── Client seed ────────────────────────────────────────────────── */}
            <div className="control-group">
                <label className="control-label">Client Seed</label>
                <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => onClientSeedChange(e.target.value)}
                    disabled={phase !== 'idle'}
                    placeholder="anything you like"
                    className="text-input"
                    aria-label="Client seed"
                />
            </div>

            {/* ── Commit info ────────────────────────────────────────────────── */}
            {round && (
                <div className="info-box">
                    <div className="info-row">
                        <span className="info-key">Commit</span>
                        <span className="info-val mono">{truncate(round.commitHex)}</span>
                    </div>
                    <div className="info-row">
                        <span className="info-key">Nonce</span>
                        <span className="info-val mono">{round.nonce}</span>
                    </div>
                    {round.serverSeed && (
                        <div className="info-row">
                            <span className="info-key">Server seed</span>
                            <span className="info-val mono">{truncate(round.serverSeed)}</span>
                        </div>
                    )}
                    {round.binIndex !== undefined && (
                        <div className="info-row result">
                            <span className="info-key">Payout</span>
                            <span className="info-val">
                                {round.payoutMultiplier}× → {round.payoutCents}¢
                            </span>
                        </div>
                    )}
                    {round.phase === 'revealed' && (
                        <a
                            href={`/verify?serverSeed=${round.serverSeed}&clientSeed=${clientSeed}&nonce=${round.nonce}&dropColumn=${round.dropColumn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="verify-link"
                        >
                            Verify this round ↗
                        </a>
                    )}
                </div>
            )}

            {/* ── Action buttons ─────────────────────────────────────────────── */}
            <div className="action-buttons">
                {canCommit && (
                    <button className="btn btn-primary" onClick={onCommit} disabled={isLoading}>
                        {isLoading ? 'Getting commitment…' : '1. Get Commitment'}
                    </button>
                )}
                {canDrop && (
                    <button className="btn btn-drop" onClick={onDrop} disabled={isLoading}>
                        {isLoading ? 'Dropping…' : '2. Drop Ball'}
                    </button>
                )}
                {canReset && (
                    <button className="btn btn-reset" onClick={onReset}>
                        Play Again
                    </button>
                )}
            </div>

            {/* ── Phase status ───────────────────────────────────────────────── */}
            <div className="phase-indicator" aria-live="polite">
                {phase === 'idle' && 'Step 1: Get a commitment to lock in the server seed.'}
                {phase === 'committed' && 'Step 2: Drop the ball. Your client seed mixes in.'}
                {phase === 'animating' && 'Ball is dropping... verifying fairness...'}
                {phase === 'revealed' && '✓ Round complete. Server seed revealed and verifiable.'}
            </div>
        </div>
    )
}