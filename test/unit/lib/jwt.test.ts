import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
} from '../../../src/lib/jwt.js'
import { env } from '../../../src/config/env.js'

describe('access tokens', () => {
  it('round-trips a userId through sign and verify', () => {
    const token = signAccessToken('user_123')
    expect(verifyAccessToken(token)).toEqual({ userId: 'user_123' })
  })

  it('throws on a tampered token', () => {
    const token = signAccessToken('user_123')
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })

  it('throws on a malformed token', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow()
  })

  it('throws on an expired token', () => {
    const expired = jwt.sign({ userId: 'user_123' }, env.JWT_ACCESS_SECRET, { expiresIn: -10 })
    expect(() => verifyAccessToken(expired)).toThrow()
  })

  it('throws on a token signed with a different secret', () => {
    const wrongSecret = jwt.sign({ userId: 'user_123' }, 'a-completely-different-secret-value', {
      expiresIn: '15m',
    })
    expect(() => verifyAccessToken(wrongSecret)).toThrow()
  })
})

describe('refresh tokens', () => {
  it('generates a token and its hash, and the hash is derivable from the token', () => {
    const { token, hash } = signRefreshToken()
    expect(hashToken(token)).toBe(hash)
  })

  it('generates a different token each call', () => {
    const a = signRefreshToken()
    const b = signRefreshToken()
    expect(a.token).not.toBe(b.token)
  })

  it('generates a 64-character hex token (32 bytes)', () => {
    const { token } = signRefreshToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('REFRESH_TOKEN_TTL_MS', () => {
  it('is 30 days', () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })
})
