// app/api/rounds/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const round = await prisma.round.findUnique({ where: { id } })

        if (!round) {
            return NextResponse.json({ error: 'Round not found' }, { status: 404 })
        }

        const isRevealed = round.status === 'REVEALED'

        return NextResponse.json({
            roundId: round.id,
            status: round.status,
            commitHex: round.commitHex,
            nonce: round.nonce,

            // Only after reveal
            serverSeed: isRevealed ? round.serverSeed : undefined,

            // Only after start
            clientSeed: round.clientSeed ?? undefined,
            betCents: round.betCents ?? undefined,
            dropColumn: round.dropColumn ?? undefined,
            combinedSeed: round.combinedSeed ?? undefined,
            pegMap: round.pegMap ? JSON.parse(round.pegMap) : undefined,
            pegMapHash: round.pegMapHash ?? undefined,
            path: round.pathJson ? JSON.parse(round.pathJson) : undefined,
            binIndex: round.binIndex ?? undefined,
            payoutMultiplier: round.payoutMultiplier ?? undefined,
            payoutCents: round.payoutCents ?? undefined,

            // Timestamps
            createdAt: round.createdAt,
            startedAt: round.startedAt ?? undefined,
            revealedAt: round.revealedAt ?? undefined,
        })
    } catch (err) {
        console.error('[GET round] error:', err)
        return NextResponse.json({ error: 'Failed to fetch round' }, { status: 500 })
    }
}