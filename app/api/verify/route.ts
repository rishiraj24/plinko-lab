// app/api/verify/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
    computeCommitHex,
    computeCombinedSeed,
    runRound,
} from '@/lib/engine'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)

    const serverSeed = searchParams.get('serverSeed')
    const clientSeed = searchParams.get('clientSeed')
    const nonce = searchParams.get('nonce')
    const dropColRaw = searchParams.get('dropColumn')

    // ── Validate all params present ─────────────────────────────────────────
    if (!serverSeed || !clientSeed || !nonce || !dropColRaw) {
        return NextResponse.json(
            { error: 'Required: serverSeed, clientSeed, nonce, dropColumn' },
            { status: 400 },
        )
    }

    const dropColumn = parseInt(dropColRaw, 10)

    if (isNaN(dropColumn) || dropColumn < 0 || dropColumn > 12) {
        return NextResponse.json(
            { error: 'dropColumn must be an integer 0–12' },
            { status: 400 },
        )
    }

    try {
        // Recompute everything from scratch — identical to what the server did
        const commitHex = computeCommitHex(serverSeed, nonce)
        const combinedSeed = computeCombinedSeed(serverSeed, clientSeed, nonce)
        const result = runRound(combinedSeed, dropColumn)

        return NextResponse.json({
            commitHex,
            combinedSeed,
            pegMapHash: result.pegMapHash,
            binIndex: result.binIndex,
            payoutMultiplier: result.payoutMultiplier,
            path: result.path,
            pegMap: result.pegMap,
        })
    } catch (err) {
        console.error('[verify] error:', err)
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
    }
}