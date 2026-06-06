// app/api/rounds/commit/route.ts

import { NextResponse } from 'next/server'
import {
    generateServerSeed,
    generateNonce,
    computeCommitHex,
} from '@/lib/engine'
import { prisma } from '@/lib/db/prisma'

export async function POST() {
    try {
        const serverSeed = generateServerSeed()
        const nonce = generateNonce()
        const commitHex = computeCommitHex(serverSeed, nonce)

        const round = await prisma.round.create({
            data: {
                serverSeed,
                nonce,
                commitHex,
                status: 'CREATED',
            },
        })

        // NEVER return serverSeed here — it must stay hidden until reveal
        return NextResponse.json({
            roundId: round.id,
            commitHex: round.commitHex,
            nonce: round.nonce,
        })
    } catch (err) {
        console.error('[commit] error:', err)
        return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
    }
}