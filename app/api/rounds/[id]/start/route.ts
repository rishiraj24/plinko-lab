// app/api/rounds/[id]/start/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { computeCombinedSeed, runRound } from '@/lib/engine'
import { prisma } from '@/lib/db/prisma'

interface StartBody {
  clientSeed: string
  betCents: number
  dropColumn: number
}

export async function POST(
  req: NextRequest,
  { params }: any,
) {
  try {
    const body: StartBody = await req.json()
    const { clientSeed, betCents, dropColumn } = body

    // ── Input validation ────────────────────────────────────────────────────
    if (!clientSeed || typeof clientSeed !== 'string' || clientSeed.trim() === '') {
      return NextResponse.json({ error: 'clientSeed is required' }, { status: 400 })
    }
    if (!Number.isInteger(betCents) || betCents <= 0) {
      return NextResponse.json({ error: 'betCents must be a positive integer' }, { status: 400 })
    }
    if (!Number.isInteger(dropColumn) || dropColumn < 0 || dropColumn > 12) {
      return NextResponse.json({ error: 'dropColumn must be 0–12' }, { status: 400 })
    }

    // ── Load round ──────────────────────────────────────────────────────────
    const { id } = await params;
    const round = await prisma.round.findUnique({ where: { id } })

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 })
    }
    if (round.status !== 'CREATED') {
      return NextResponse.json({ error: 'Round already started' }, { status: 409 })
    }

    if (!round.serverSeed) {
      return NextResponse.json({ error: 'Round is missing serverSeed' }, { status: 500 })
    }

    // ── Run engine ──────────────────────────────────────────────────────────
    const combinedSeed = computeCombinedSeed(round.serverSeed, clientSeed, round.nonce)
    const result = runRound(combinedSeed, dropColumn)

    const payoutCents = Math.round(betCents * result.payoutMultiplier)

    // ── Persist everything ──────────────────────────────────────────────────
    await prisma.round.update({
      where: { id },
      data: {
        status: 'STARTED',
        clientSeed,
        betCents,
        dropColumn,
        combinedSeed,
        pegMap: JSON.stringify(result.pegMap),
        pegMapHash: result.pegMapHash,
        pathJson: JSON.stringify(result.path),
        binIndex: result.binIndex,
        payoutMultiplier: result.payoutMultiplier,
        payoutCents,
        startedAt: new Date(),
      },
    })

    // ── Return (no serverSeed!) ─────────────────────────────────────────────
    return NextResponse.json({
      roundId: id,
      pegMapHash: result.pegMapHash,
      rows: result.pegMap.length,       // always 12
      binIndex: result.binIndex,
      path: result.path,
      payoutMultiplier: result.payoutMultiplier,
      payoutCents,
    })
  } catch (err) {
    console.error('[start] error:', err)
    return NextResponse.json({ error: 'Failed to start round' }, { status: 500 })
  }
}