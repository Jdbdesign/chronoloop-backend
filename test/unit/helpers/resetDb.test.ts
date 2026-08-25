import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

function p1001(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code: 'P1001',
    clientVersion: '6.19.3',
  })
}

const executeRawUnsafe = vi.fn()

// Mocks only rawPrisma — withDbReconnectRetry runs for real, so this exercises resetDb's
// actual retry/cancellation wiring end to end, not a stand-in for it.
vi.mock('../../../src/db/client.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/db/client.js')>('../../../src/db/client.js')
  return {
    ...actual,
    rawPrisma: { $executeRawUnsafe: (...args: unknown[]) => executeRawUnsafe(...args) },
  }
})

describe('resetDb', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    executeRawUnsafe.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('truncates every table, in child-before-parent order, when each call succeeds', async () => {
    executeRawUnsafe.mockResolvedValue(undefined)
    const { resetDb } = await import('../../../test/helpers/resetDb.js')

    await resetDb()

    // TABLES isn't exported (deliberately — resetDb's job is truncation order, not a
    // public table registry), so this asserts against its actual current shape rather
    // than a derived count. Update this alongside any future TABLES change (B3+ will add
    // more) — that's this test doing its job, not test debt: it exists specifically to
    // catch a table landing in the wrong child/parent position.
    expect(executeRawUnsafe).toHaveBeenCalledTimes(11)
    expect(executeRawUnsafe.mock.calls[0][0]).toContain('"Attachment"')
    expect(executeRawUnsafe.mock.calls[10][0]).toContain('"User"')
  })

  // Demonstrates the actual bug this closes: a table that keeps failing long enough to
  // push resetDb's total elapsed time past its own 80s abort budget gets cut off there —
  // not left to run for however much longer an unbounded retry sequence would otherwise
  // take. Table 1 fails 6 times then succeeds right on its last allowed attempt (63s
  // elapsed, its own natural per-call retry budget) so no per-call exhaustion trips first;
  // table 2 then fails forever, so the ONLY thing that can stop it is resetDb's own 80s
  // abort — 17s into table 2's retry sequence, well before that table's own 63s exhaustion
  // point (which would be t=126s) — cleanly proving the abort is what actually fired.
  it('gives up at its own 80s abort budget rather than running unboundedly across tables', async () => {
    const outcomes: Array<'fail' | 'ok'> = [
      'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'ok', // table 1: exhausts naturally, succeeds on the 7th call
      ...Array(20).fill('fail'), // table 2: never succeeds
    ]
    let i = 0
    executeRawUnsafe.mockImplementation(async () => {
      const outcome = outcomes[i] ?? 'fail'
      i += 1
      if (outcome === 'fail') throw p1001()
    })

    const { resetDb } = await import('../../../test/helpers/resetDb.js')
    const resultPromise = resetDb()
    const assertion = expect(resultPromise).rejects.toBeTruthy()

    // t=63s: table 1 finishes (7 calls, succeeding right at its own retry-budget boundary).
    // The for-loop then immediately starts table 2's first (synchronous, no-delay) call in
    // the same tick — so by the time this resolves, table 2 is already one call in.
    // t=80s: resetDb's own abort fires mid-wait, partway through table 2's retry sequence —
    // table 2's own natural exhaustion wouldn't land until t=63s+63s=126s, so reaching the
    // abort well before that confirms the abort — not per-call exhaustion — is what stopped it.
    await vi.advanceTimersByTimeAsync(80000)

    await assertion
    const callsAtAbort = executeRawUnsafe.mock.calls.length
    expect(callsAtAbort).toBeGreaterThan(7) // table 1's 7 calls, plus some progress into table 2
    expect(callsAtAbort).toBeLessThan(7 + 6) // ...but nowhere near table 2's own 63s/6-retry exhaustion

    // Advance well past where table 2's own natural exhaustion (t=126s) would have been —
    // nothing more should happen; the abort, not the per-call budget, is what stopped this.
    await vi.advanceTimersByTimeAsync(60000)
    expect(executeRawUnsafe.mock.calls.length).toBe(callsAtAbort)
  })
})
