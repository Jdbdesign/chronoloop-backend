import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { withDbReconnectRetry } from '../../../src/db/client.js'

function p1001(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code: 'P1001',
    clientVersion: '6.19.3',
  })
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  })
}

function initErrorP1001WithCode(): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server at `host:5432`\n\nPlease make sure your database server is running",
    '6.19.3',
    'P1001',
  )
}

// Reproduces the live failure mode: same fixed P1001 message, but errorCode left unset —
// observed against a real Neon test-branch cold start (see src/db/client.ts comment).
function initErrorP1001WithoutCode(): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server at `host:5432`\n\nPlease make sure your database server is running",
    '6.19.3',
  )
}

function initErrorUnrelated(): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError('The provided database credentials are not valid', '6.19.3', 'P1000')
}

describe('withDbReconnectRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result immediately when the query succeeds on the first try', async () => {
    const run = vi.fn().mockResolvedValue('ok')
    await expect(withDbReconnectRetry(run)).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries on P1001 and succeeds once the connection recovers', async () => {
    const run = vi.fn().mockRejectedValueOnce(p1001()).mockRejectedValueOnce(p1001()).mockResolvedValue('ok')

    const resultPromise = withDbReconnectRetry(run)
    await vi.advanceTimersByTimeAsync(1000) // first retry delay
    await vi.advanceTimersByTimeAsync(2000) // second retry delay

    await expect(resultPromise).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('waits with exponential backoff (1s, 2s, 4s, 8s, 16s, 32s) between retries, not a fixed delay', async () => {
    const run = vi.fn().mockRejectedValue(p1001())
    const resultPromise = withDbReconnectRetry(run).catch((e: unknown) => e)

    expect(run).toHaveBeenCalledTimes(1) // initial attempt, synchronous

    await vi.advanceTimersByTimeAsync(999)
    expect(run).toHaveBeenCalledTimes(1) // still under the 1s first-retry delay

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2) // 1s elapsed — first retry fires

    await vi.advanceTimersByTimeAsync(1999)
    expect(run).toHaveBeenCalledTimes(2) // still under the 2s second-retry delay

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(3) // 2s elapsed — second retry fires

    await vi.advanceTimersByTimeAsync(4000)
    expect(run).toHaveBeenCalledTimes(4) // 4s elapsed — third retry fires

    await vi.advanceTimersByTimeAsync(8000)
    expect(run).toHaveBeenCalledTimes(5) // 8s elapsed — fourth retry fires

    await vi.advanceTimersByTimeAsync(16000)
    expect(run).toHaveBeenCalledTimes(6) // 16s elapsed — fifth retry fires

    await vi.advanceTimersByTimeAsync(32000)
    expect(run).toHaveBeenCalledTimes(7) // 32s elapsed — sixth (final) retry fires

    await resultPromise
  })

  it('gives up and rethrows the original error after exhausting all retries', async () => {
    const run = vi.fn().mockRejectedValue(p1001())
    const resultPromise = withDbReconnectRetry(run)
    const assertion = expect(resultPromise).rejects.toMatchObject({ code: 'P1001' })

    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000 + 32000)

    await assertion
    expect(run).toHaveBeenCalledTimes(7) // 1 initial attempt + 6 retries, then give up
  })

  it('does not retry a different Prisma error code (e.g. a unique constraint violation)', async () => {
    const run = vi.fn().mockRejectedValue(p2002())
    await expect(withDbReconnectRetry(run)).rejects.toMatchObject({ code: 'P2002' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-Prisma error', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withDbReconnectRetry(run)).rejects.toThrow('boom')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries a PrismaClientInitializationError carrying errorCode P1001 (e.g. a bad connection URL)', async () => {
    const run = vi.fn().mockRejectedValueOnce(initErrorP1001WithCode()).mockResolvedValue('ok')
    const resultPromise = withDbReconnectRetry(run)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(resultPromise).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('retries a PrismaClientInitializationError with the fixed P1001 message but no errorCode (a fresh client'
    + "'s first query hitting a suspended Neon compute, reproduced live)", async () => {
    const run = vi.fn().mockRejectedValueOnce(initErrorP1001WithoutCode()).mockResolvedValue('ok')
    const resultPromise = withDbReconnectRetry(run)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(resultPromise).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('does not retry an unrelated PrismaClientInitializationError (e.g. bad credentials)', async () => {
    const run = vi.fn().mockRejectedValue(initErrorUnrelated())
    await expect(withDbReconnectRetry(run)).rejects.toMatchObject({ errorCode: 'P1000' })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
