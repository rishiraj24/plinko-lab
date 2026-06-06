// app/api/rounds/[id]/reveal/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const round = await prisma.round.findUnique({ where: { id } })

        if (!round) {
            return NextResponse.json({ error: 'Round not found' }, { status: 404 })
        }
        if (round.status === 'CREATED') {
            return NextResponse.json({ error: 'Round has not been started yet' }, { status: 409 })
        }
        if (round.status === 'REVEALED') {
            // Idempotent — safe to call twice
            return NextResponse.json({ serverSeed: round.serverSeed })
        }

        await prisma.round.update({
            where: { id },
            data: {
                status: 'REVEALED',
                revealedAt: new Date(),
            },
        })

        return NextResponse.json({ serverSeed: round.serverSeed })
    } catch (err) {
        console.error('[reveal] error:', err)
        return NextResponse.json({ error: 'Failed to reveal round' }, { status: 500 })
    }
}