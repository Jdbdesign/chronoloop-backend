import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth } from '../../../src/middleware/requireAuth.js'
import { signAccessToken } from '../../../src/lib/jwt.js'
import { AppError } from '../../../src/lib/errors.js'
import { env } from '../../../src/config/env.js'

function fakeReq(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request
}

function runAndCaptureError(req: Request, next: NextFunction): AppError {
  try {
    requireAuth(req, {} as Response, next)
  } catch (err) {
    return err as AppError
  }
  throw new Error('expected requireAuth to throw')
}

describe('requireAuth', () => {
  it('rejects a missing Authorization header', () => {
    const next = vi.fn()
    const err = runAndCaptureError(fakeReq(undefined), next)
    expect(err).toBeInstanceOf(AppError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a header with the wrong auth scheme (not "Bearer ")', () => {
    const next = vi.fn()
    const err = runAndCaptureError(fakeReq('Basic dXNlcjpwYXNz'), next)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a syntactically invalid token', () => {
    const next = vi.fn()
    const err = runAndCaptureError(fakeReq('Bearer not-a-real-jwt'), next)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects an expired token', () => {
    const expired = jwt.sign({ userId: 'user-1' }, env.JWT_ACCESS_SECRET, { expiresIn: -10 })
    const next = vi.fn()
    const err = runAndCaptureError(fakeReq(`Bearer ${expired}`), next)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a token signed with the wrong secret (tampered/invalid signature)', () => {
    const tampered = jwt.sign({ userId: 'user-1' }, 'a-completely-different-secret-value', { expiresIn: '15m' })
    const next = vi.fn()
    const err = runAndCaptureError(fakeReq(`Bearer ${tampered}`), next)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHENTICATED')
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a valid token, attaches req.userId, and calls next with no error', () => {
    const token = signAccessToken('user-42')
    const req = fakeReq(`Bearer ${token}`)
    const next = vi.fn()

    requireAuth(req, {} as Response, next)

    expect(req.userId).toBe('user-42')
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
  })
})
