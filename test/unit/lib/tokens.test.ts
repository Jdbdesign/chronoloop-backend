import { describe, it, expect } from 'vitest'
import {
  generateToken,
  isExpired,
  INVITE_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
} from '../../../src/lib/tokens.js'
import { hashToken } from '../../../src/lib/jwt.js'

describe('generateToken', () => {
  it('produces a token whose hash matches the shared hashToken function', () => {
    const { token, hash } = generateToken()
    expect(hashToken(token)).toBe(hash)
  })

  it('produces a different token each call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.token).not.toBe(b.token)
  })

  it('produces a 64-character hex token (32 bytes)', () => {
    const { token } = generateToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('TTL constants', () => {
  it('sets invite TTL to 7 days', () => {
    expect(INVITE_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('sets reset TTL to 1 hour', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000)
  })
})

describe('isExpired', () => {
  it('is false just before the expiry instant', () => {
    const expiresAt = new Date(Date.now() + 1000)
    expect(isExpired(expiresAt)).toBe(false)
  })

  it('is true just after the expiry instant', () => {
    const expiresAt = new Date(Date.now() - 1000)
    expect(isExpired(expiresAt)).toBe(true)
  })

  it('is true exactly at the expiry instant', () => {
    const now = new Date()
    expect(isExpired(now, now)).toBe(true)
  })
})
