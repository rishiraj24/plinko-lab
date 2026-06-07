// components/GameCanvas.tsx

'use client'

import { useRef, useEffect, useCallback } from 'react'
import {
    allPegPositions,
    binPositions,
    computeWaypoints,
    binColor,
    PEG_RADIUS,
    BALL_RADIUS,
    BIN_HEIGHT,
    TOP_OFFSET,
    V_SPACING,
} from '@/lib/canvas/layout'
import { ROWS } from '@/lib/engine'
import { audioService } from '@/lib/audio/AudioService'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnimationState {
    path: string[]         // L/R decisions
    dropColumn: number
    binIndex: number
    onComplete?: (binIndex: number) => void
}

interface Props {
    width?: number
    height?: number
    animation?: AnimationState | null   // null = idle, truthy = start animating
    winningBin?: number | null          // highlights this bin when set (post-reveal)
    debugGrid?: boolean                 // easter egg — overlay peg indices
    reducedMotion?: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MS_PER_ROW = 260   // ms per row of animation

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameCanvas({
    width = 600,
    height = 700,
    animation = null,
    winningBin = null,
    debugGrid = false,
    reducedMotion,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rafRef = useRef<number>(0)
    const startRef = useRef<number>(0)

    // ── Drawing helpers ─────────────────────────────────────────────────────────

    const drawBoard = useCallback(
        (ctx: CanvasRenderingContext2D, highlightBin?: number | null) => {
            ctx.clearRect(0, 0, width, height)

            // Background
            ctx.fillStyle = '#0d0d14'
            ctx.fillRect(0, 0, width, height)

            // Subtle grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.03)'
            ctx.lineWidth = 1
            for (let y = 0; y < height; y += 24) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
            }

            // ── Bins ──────────────────────────────────────────────────────────────
            const bins = binPositions(width)
            bins.forEach((bin) => {
                const isWinner = highlightBin === bin.index
                const color = binColor(bin.width > 0 ? parseFloat(bin.label) : 0, isWinner ? 1 : 0.7)

                // Bin rectangle
                ctx.fillStyle = isWinner ? color : binColor(parseFloat(bin.label), 0.25)
                ctx.strokeStyle = color
                ctx.lineWidth = isWinner ? 2 : 1
                const bx = bin.x - bin.width / 2
                const by = bin.y
                ctx.beginPath()
                ctx.roundRect(bx + 2, by, bin.width - 4, BIN_HEIGHT - 4, 4)
                ctx.fill()
                ctx.stroke()

                // Multiplier label
                ctx.fillStyle = isWinner ? '#fff' : color
                ctx.font = isWinner ? 'bold 11px monospace' : '10px monospace'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(bin.label, bin.x, by + BIN_HEIGHT / 2 - 2)
            })

            // ── Pegs ──────────────────────────────────────────────────────────────
            const pegs = allPegPositions(width)
            pegs.forEach(({ x, y }) => {
                // Glow
                const grad = ctx.createRadialGradient(x, y, 0, x, y, PEG_RADIUS * 3)
                grad.addColorStop(0, 'rgba(180,160,255,0.15)')
                grad.addColorStop(1, 'rgba(180,160,255,0)')
                ctx.fillStyle = grad
                ctx.beginPath()
                ctx.arc(x, y, PEG_RADIUS * 3, 0, Math.PI * 2)
                ctx.fill()

                // Peg body
                ctx.fillStyle = '#c8b8ff'
                ctx.beginPath()
                ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2)
                ctx.fill()

                // Highlight
                ctx.fillStyle = 'rgba(255,255,255,0.4)'
                ctx.beginPath()
                ctx.arc(x - 1.5, y - 1.5, PEG_RADIUS * 0.4, 0, Math.PI * 2)
                ctx.fill()
            })

            // ── Debug grid overlay ─────────────────────────────────────────────────
            if (debugGrid) {
                ctx.fillStyle = 'rgba(255,255,100,0.85)'
                ctx.font = '9px monospace'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                pegs.forEach(({ x, y, row, peg }) => {
                    ctx.fillText(`${row},${peg}`, x, y + PEG_RADIUS + 2)
                })
            }
        },
        [width, height, debugGrid],
    )

    const drawBall = useCallback(
        (ctx: CanvasRenderingContext2D, x: number, y: number) => {
            // Glow
            const grad = ctx.createRadialGradient(x, y, 0, x, y, BALL_RADIUS * 2.5)
            grad.addColorStop(0, 'rgba(255,230,100,0.9)')
            grad.addColorStop(0.4, 'rgba(255,180,0,0.5)')
            grad.addColorStop(1, 'rgba(255,120,0,0)')
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(x, y, BALL_RADIUS * 2.5, 0, Math.PI * 2)
            ctx.fill()

            // Ball
            const ballGrad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, BALL_RADIUS)
            ballGrad.addColorStop(0, '#fff9e0')
            ballGrad.addColorStop(0.5, '#ffd700')
            ballGrad.addColorStop(1, '#c47f00')
            ctx.fillStyle = ballGrad
            ctx.beginPath()
            ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2)
            ctx.fill()
        },
        [],
    )

    const prefersReducedMotion =
        reducedMotion ??
        (typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches)

    // ── Static board draw ───────────────────────────────────────────────────────

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        drawBoard(ctx, winningBin)
    }, [drawBoard, winningBin, debugGrid])

    // ── Animation ───────────────────────────────────────────────────────────────

    useEffect(() => {
        const currentAnim = animation
        if (!currentAnim) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // ── Reduced motion: skip animation, show result instantly ──────────────
        if (prefersReducedMotion) {
            drawBoard(ctx, currentAnim.binIndex)
            currentAnim.onComplete?.(currentAnim.binIndex)
            return
        }

        // ── Full animation ──────────────────────────────────────────────────────
        const waypoints = computeWaypoints(currentAnim.path, currentAnim.dropColumn, width)
        const totalDuration = ROWS * MS_PER_ROW

        cancelAnimationFrame(rafRef.current)
        startRef.current = performance.now()

        // Track which row the ball last passed — for tick sounds
        let lastRow = -1

        const tick = (now: number) => {
            const elapsed = now - startRef.current
            
            // Global gravity: ball falls faster over time
            const linearProgress = Math.min(elapsed / totalDuration, 1)
            const progress = Math.pow(linearProgress, 1.5)

            const segCount = waypoints.length - 1
            const rawSeg = progress * segCount
            const segIndex = Math.min(Math.floor(rawSeg), segCount - 1)
            const segT = rawSeg - segIndex

            const from = waypoints[segIndex]
            const to = waypoints[segIndex + 1]
            
            if (!from || !to) return

            // Smooth horizontal curve
            const xEase = (1 - Math.cos(segT * Math.PI)) / 2
            const x = from.x + (to.x - from.x) * xEase

            // Vertical fall with a parabolic bounce off pegs
            const isFirst = segIndex === 0
            const isLast = segIndex === segCount - 1
            const bounceHeight = isFirst || isLast ? 0 : 12
            
            const y = from.y + (to.y - from.y) * segT - Math.sin(segT * Math.PI) * bounceHeight

            drawBoard(ctx, null)
            drawBall(ctx, x, y)

            // Fire a tick sound each time the ball enters a new row segment
            if (segIndex !== lastRow && segIndex < ROWS) {
                lastRow = segIndex
                audioService.playTick()
            }

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(tick)
            } else {
                drawBoard(ctx, currentAnim.binIndex)
                currentAnim.onComplete?.(currentAnim.binIndex)
            }
        }

        rafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafRef.current)
    }, [animation, width, drawBoard, drawBall, prefersReducedMotion])

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ borderRadius: '12px', display: 'block' }}
            aria-label="Plinko game board"
            role="img"
            tabIndex={0}
        />
    )
}