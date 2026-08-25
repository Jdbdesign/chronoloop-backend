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
// console log — hit exactly this P1001 on its very first query. The DB was reachable
// again within ~10s. This schedule (1s, 2s, 4s, 8s — 15s of waiting across 4 retries) is
// sized with margin above that observed recovery time, not pinned to it — cold-start
// duration isn't a guaranteed constant, hence backoff instead of one fixed sleep.
const RETRYABLE_CODES = new Set(['P1001'])
const MAX_RETRIES = 4
const BASE_DELAY_MS = 1000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(err.code)
}

// Exported standalone (not just inlined into the $extends call below) so it can be unit
// tested without a real database connection — see test/unit/db/client.test.ts.
export async function withDbReconnectRetry<T>(run: () => Promise<T>): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await run()
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_RETRIES) {
        throw err
      }
      const delay = BASE_DELAY_MS * 2 ** attempt
      attempt += 1
      console.warn(`[db] ${err.code} reaching database — retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`)
      await wait(delay)
    }
  }
}

const basePrisma = new PrismaClient()

export const db = basePrisma.$extends({
  query: {
    $allOperations({ args, query }) {
      return withDbReconnectRetry(() => query(args))
    },
  },
})
