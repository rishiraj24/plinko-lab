// app/api/rounds/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limitRaw = searchParams.get('limit')
  const limit    = Math.min(parseInt(limitRaw ?? '20', 10) || 20, 50)

  try {
    const rounds = await prisma.round.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id:              true,
        status:          true,
        dropColumn:      true,
        binIndex:        true,
        payoutMultiplier: true,
        payoutCents:     true,
        betCents:        true,
        clientSeed:      true,
        nonce:           true,
        commitHex:       true,
        // serverSeed intentionally omitted for CREATED/STARTED rounds
        // We include it only if REVEALED so the verify link can deep-link
        serverSeed:      true,   // filtered below
        createdAt:       true,
      },
    })

    const sanitised = rounds.map((r) => ({
      id:              r.id,
      status:          r.status,
      dropColumn:      r.dropColumn,
      binIndex:        r.binIndex,
      payoutMultiplier: r.payoutMultiplier,
      payoutCents:     r.payoutCents,
      betCents:        r.betCents,
      clientSeed:      r.clientSeed,
      nonce:           r.nonce,
      commitHex:       r.commitHex,
      // Only expose serverSeed after reveal — needed for the verify deep-link
      serverSeed:      r.status === 'REVEALED' ? r.serverSeed : null,
      createdAt:       r.createdAt,
    }))

    return NextResponse.json({ rounds: sanitised })
  } catch (err) {
    console.error('[GET /api/rounds] error:', err)
    return NextResponse.json({ error: 'Failed to fetch rounds' }, { status: 500 })
  }
}
