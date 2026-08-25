import { Prisma, PrismaClient } from '@prisma/client'

// Neon's serverless Postgres suspends its compute after a period with no active queries.
// The next query after that isn't transparently reconnected — it fails immediately with
// P1001 ("Can't reach database server"), and Neon then takes several seconds to wake the
// compute back up once a new connection attempt arrives. P1001 specifically means the
// query never reached the server at all (see Prisma's error reference — contrast with
// P1017 "Server has closed the connection", where a query may already have been sent), so
// retrying it is safe even for writes: nothing partially executed.
//
// Reproduced empirically (see the connection resilience test + BACKLOG-adjacent incident
// notes): a real accept-invite request issued a few minutes after its invite was created
// — the ordinary gap while a person copies the invite token out of the mailer stub's
// console log — hit exactly this P1001 on its very first query. That gap was ~48s, which
// is routine usage (anyone who pauses to think, gets interrupted, or reads something
// before their next click), not a rare edge case. An earlier 4-retry/15s-budget version of
// this schedule recovered against a live 8-minute cold-start gap, but only on its last
// retry attempt — not enough margin for comfort. This schedule (1s, 2s, 4s, 8s, 16s, 32s —
// ~63s of waiting across 6 retries) is sized to recover with retries to spare rather than
// on the last one — cold-start duration isn't a guaranteed constant, hence backoff instead
// of one fixed sleep.
//
// A freshly created PrismaClient's very first query — before any connection has ever been
// established — hits the same cold-start condition but Prisma throws a different class for
// it: PrismaClientInitializationError, not PrismaClientKnownRequestError. Reproduced live
// against a genuinely-idle Neon test-branch: `errorCode` was undefined even though the
// message was Prisma's standard fixed P1001 text ("Can't reach database server..."), so
// checking `errorCode === 'P1001'` alone misses it. We deliberately do NOT retry every
// PrismaClientInitializationError — most other causes (bad credentials, missing engine
// binary, invalid schema) are permanent misconfiguration, not a transient connectivity gap,
// and retrying those would just delay a real error by ~60s for nothing. Matching Prisma's
// own fixed P1001 message text keeps this scoped to the same "never reached the server"
// condition as the known-request-error case above.
const RETRYABLE_CODES = new Set(['P1001'])
const P1001_MESSAGE = "Can't reach database server"
const MAX_RETRIES = 6
const BASE_DELAY_MS = 1000

// Resolves early (not rejects) if aborted mid-wait — the retry loop itself checks
// `signal.aborted` right after this returns to decide whether to actually retry.
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_CODES.has(err.code)
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return err.errorCode === 'P1001' || err.message.includes(P1001_MESSAGE)
  }
  return false
}

function describe(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code
  if (err instanceof Prisma.PrismaClientInitializationError) return err.errorCode ?? 'P1001 (init)'
  return 'unknown'
}

// Exported standalone (not just inlined into the $extends call below) so it can be unit
// tested without a real database connection — see test/unit/db/client.test.ts.
//
// `signal` is optional and unused by the global `db` client below (Prisma's `$extends`
// `$allOperations` hook has no per-call context to thread a signal through). It exists so
// a caller that bypasses the global wrapper — see `rawPrisma` below and
// test/helpers/resetDb.ts — can bound how long an in-flight retry sequence is allowed to
// keep running. Note this cannot cancel a single query attempt already in flight over the
// wire (Prisma has no per-query cancellation API); what it *does* do is stop the loop from
// scheduling any further retry once aborted, which is what actually matters here — the
// corruption risk this closes is an abandoned retry *loop* continuing to fire for up to 48
// more seconds and eventually writing after a caller has stopped waiting on it, not a
// single slow query.
export async function withDbReconnectRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await run()
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_RETRIES || signal?.aborted) {
        throw err
      }
      const delay = BASE_DELAY_MS * 2 ** attempt
      attempt += 1
      console.warn(`[db] ${describe(err)} reaching database — retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`)
      await wait(delay, signal)
      if (signal?.aborted) {
        throw err
      }
    }
  }
}

const basePrisma = new PrismaClient()

// The un-extended client, for callers that need to pass their own AbortSignal into
// withDbReconnectRetry directly (bypassing $allOperations, which can't carry one) — see
// test/helpers/resetDb.ts. Not for general route/handler use; prefer `db` below, which
// gets the same P1001 retry behavior automatically on every call with no extra wiring.
export const rawPrisma = basePrisma

export const db = basePrisma.$extends({
  query: {
    $allOperations({ args, query }) {
      return withDbReconnectRetry(() => query(args))
    },
  },
})
