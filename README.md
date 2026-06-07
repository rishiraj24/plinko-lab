# Plinko Lab — Provably-Fair Plinko

An interactive Plinko game with a cryptographic commit-reveal protocol, 
deterministic replay, and a public verifier.

**Live app:** https://plinko-lab-flame.vercel.app/

---

## How to Run Locally

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/rishiraj24/plinko-lab
cd plinko-lab
npm install
```

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The default `.env` uses SQLite (no setup needed):

```env
DATABASE_URL="file:./dev.db"
```

For Postgres (Neon), replace with:

```env
DATABASE_URL="postgresql://neondb_owner:npg_r5LW1NOsMqIY@ep-green-hill-aoqi9d21-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### Initialize the database

```bash
npm run db:push
```

### Start the dev server

```bash
npm run dev
```

Open http://localhost:3000.

### Run tests

```bash
npm test
# or with coverage:
npm run test:coverage
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Browser (Next.js App Router)               │
│                                             │
│  app/page.tsx          ← Game UI            │
│  app/verify/page.tsx   ← Verifier UI        │
│                                             │
│  components/game/                           │
│    PlinkoBoard.tsx      ← Canvas animation  │
│    Controls.tsx         ← Bet, drop, seeds  │
│    Paytable.tsx         ← Multiplier table  │
│  components/ui/                             │
│    Toast.tsx            ← Error/success     │
└───────────────┬─────────────────────────────┘
                │ fetch()
┌───────────────▼─────────────────────────────┐
│  API Routes (Next.js Route Handlers)        │
│                                             │
│  POST /api/rounds/commit                    │
│  POST /api/rounds/[id]/start                │
│  POST /api/rounds/[id]/reveal               │
│  GET  /api/rounds/[id]                      │
│  GET  /api/rounds          (session log)    │
│  GET  /api/verify          (verifier)       │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│  lib/engine/  (pure functions, no I/O)      │
│                                             │
│  prng.ts        xorshift32 PRNG             │
│  combiner.ts    SHA-256 commit/seed logic   │
│  pegmap.ts      Peg map generator           │
│  simulator.ts   Ball path simulator         │
│  index.ts       runRound() public API       │
└───────────────┬─────────────────────────────┘
                │ Prisma ORM
┌───────────────▼─────────────────────────────┐
│  Database                                   │
│  SQLite (local dev) / Postgres (production) │
│  Single table: Round                        │
└─────────────────────────────────────────────┘
```

**Key design decision:** `lib/engine/` is completely pure — no DB calls, no 
HTTP, no side effects. Both the API routes and the verifier page import from 
the same engine. This guarantees the verifier produces identical results to 
the server.

**Round lifecycle:**
```
CREATED  →  STARTED  →  REVEALED
   ↑            ↑            ↑
 /commit      /start       /reveal
(gen seed)  (run engine) (expose seed)
```

---

## Fairness Specification

### Protocol

This game uses a standard **commit-reveal with client contribution**:

1. **Commit phase** (`POST /api/rounds/commit`):  
   Server generates a random `serverSeed` (32 random bytes → 64 hex chars)
   and a random `nonce` (random integer as string).  
   Server computes `commitHex = SHA256(serverSeed + ":" + nonce)` and returns
   it to the player. The server stores the commitHex but does not reveal 
   `serverSeed` yet.  
   *This proves the server has locked in its randomness before the player acts.*

2. **Start phase** (`POST /api/rounds/:id/start`):  
   Player provides a `clientSeed` (any string they choose).  
   Server computes:  
   `combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)`  
   All randomness in the round is derived from `combinedSeed`. The ball path,
   bin outcome, and payout multiplier are computed at this step and stored.
   The `serverSeed` is still not revealed.

3. **Reveal phase** (`POST /api/rounds/:id/reveal`):  
   After the animation plays, the server reveals `serverSeed`.  
   Player can now verify: `SHA256(serverSeed + ":" + nonce)` must equal the
   `commitHex` shown at step 1. If it matches, the server did not change its
   seed after seeing the client's contribution.

### PRNG

**Algorithm:** xorshift32  
**Seeding:** First 4 bytes of `combinedSeed` hex string, interpreted as a
big-endian uint32.  
**Output:** Each call produces a float in [0, 1) via division by 2^32.  
**Shift parameters:** (13, 17, 5)

### Hash Function

**Algorithm:** SHA-256 (Node.js built-in `crypto` module)  
**Format:** Hex string, lowercase, 64 characters  
**Separator:** Colon (`:`) between components in all hash inputs

### Peg Map

- **Rows:** 12. Row `r` (0-indexed) has `r+1` pegs.
- **leftBias formula:** `0.5 + (rand() - 0.5) * 0.2`  
  Range: [0.4, 0.6]. Rounded to **6 decimal places** via `parseFloat(raw.toFixed(6))`.
- **Rounding rationale:** `JSON.stringify` of raw floats can vary across 
  platforms. Rounding to 6dp makes `pegMapHash` stable and reproducible.
- **PRNG stream order:** Peg map consumes the first 78 PRNG values 
  (ROWS*(ROWS+1)/2 = 78). Ball simulation then consumes the next 12.
  This order is fixed and must match for the verifier to reproduce results.

### dropColumn Influence

Player picks `dropColumn` ∈ [0..12].  
Bias adjustment: `adj = (dropColumn - 6) * 0.01`  
Per-row: `bias' = clamp(leftBias + adj, 0, 1)`

### Test Vectors

These exact values can be used to verify any independent implementation:

```
serverSeed   = b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc
nonce        = 42
clientSeed   = candidate-hello

commitHex    = bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34
combinedSeed = e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0

PRNG first 5 values: 0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297

Peg map:
  Row 0: [0.422123]
  Row 1: [0.552503, 0.408786]
  Row 2: [0.491574, 0.46878, 0.43654]

dropColumn=6, adj=0 → binIndex=6
```

---

## AI Usage

*Fill this in honestly. Here's a template to adapt:*

I used Claude (Anthropic) and/or ChatGPT throughout the project. Here's a
breakdown by phase:

**Where AI helped most:**

- **Phase 1 (Engine):** Used AI to double-check the xorshift32 bit-shift
  implementation and the `>>> 0` unsigned coercion pattern in JavaScript.
  I verified the output against the spec test vectors manually before
  accepting it.

- **Phase 2 (API routes):** Asked AI to scaffold the route handler boilerplate
  (error handling, status codes, Prisma calls). Reviewed and edited every
  route for correctness — particularly the STARTED→REVEALED status guard and
  the order of DB writes.

- **Phase 3 (Canvas animation):** Used AI to suggest the requestAnimationFrame
  loop structure and bezier curve interpolation between peg positions. The
  actual physics math (mapping L/R decisions to x positions) I wrote myself
  to match the spec exactly.

- **Phase 5 (Verifier):** Prompted AI for the form layout and the diff display
  (✅/❌ per field). Kept the recomputation logic entirely in my own code to
  ensure it calls `runRound()` identically to the server.

**What I changed or rejected:**

- AI suggested using `crypto.subtle.digest` (Web Crypto) for hashing on the
  client side. I rejected this and kept all hash computation in `lib/engine/`
  using Node's `crypto`, then exposed it via the API and verifier imports.
  This keeps one canonical implementation.

- AI generated a more complex peg physics simulation using Matter.js. I
  implemented the discrete model from the spec instead (the stretch goal was
  optional and discrete is the authoritative fairness path).

**Key prompts used:**

1. *"Implement xorshift32 in TypeScript that produces the same output as this
   reference: [spec test vectors]. Explain each bit operation."*

2. *"Write a Next.js App Router route handler for POST /api/rounds/commit that
   generates a serverSeed and nonce, computes SHA256(serverSeed:nonce), and
   stores the round in Prisma."*

3. *"Given a path array of L/R decisions and a 12-row triangular peg layout,
   write a Canvas animation that draws the ball moving through each row with
   a 300ms pause at each peg."*

---

## Time Log

| Phase | Time spent |
|---|---|
| Phase 0 — Scaffolding | ~30 min |
| Phase 1 — Engine + tests | ~60 min |
| Phase 2 — API routes | ~60 min |
| Phase 3 — Canvas UI | ~90 min |
| Phase 4 — Sound + accessibility | ~45 min |
| Phase 5 — Verifier page | ~45 min |
| Phase 6 — Easter eggs + polish | ~45 min |
| Phase 7 — Tests expansion | ~30 min |
| Phase 8 — Deploy + README | ~30 min |
| **Total** | **~7.5 hours** |

### What I'd do with more time

1. **True fixed-timestep physics (Matter.js):** The spec offers this as a
   stretch goal. I'd make the visual ball follow real gravity/bounce physics
   while keeping the discrete L/R decisions authoritative for the fairness
   proof. The key constraint is that the landing bin must always equal
   `binIndex` from the engine — physics is purely cosmetic.

2. **WebSocket live session feed:** Replace the polling session log with a
   `Server-Sent Events` or WebSocket feed so new rounds appear in real time
   for all viewers.

3. **CSV export:** A button to download all round hashes as CSV — the spec
   mentions this as a bonus. One `prisma.round.findMany()` + `csv-stringify`
   call.

4. **Mobile haptic feedback:** Use the Vibration API on mobile for peg
   collisions — a 10ms pulse per peg row.

5. **Rate limiting:** Add `@upstash/ratelimit` on the `/api/rounds/commit`
   route to prevent abuse on the live deployment.

---

## Links

| | |
|---|---|
| **Live app** | https://plinko-lab-flame.vercel.app/ |
| **GitHub repo** | https://github.com/rishiraj24/plinko-lab |
