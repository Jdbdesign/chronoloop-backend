import { describe, it, expect } from 'vitest'
import { parseEnv } from '../../../src/config/env.js'

describe('parseEnv', () => {
  it('parses a complete, valid env object', () => {
    const result = parseEnv({
      PORT: '4000',
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://u:p@h/db',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      COOKIE_DOMAIN: 'localhost',
    })
    expect(result.PORT).toBe(4000)
    expect(result.NODE_ENV).toBe('development')
  })

  it('throws when a required var is missing', () => {
    expect(() => parseEnv({})).toThrow()
  })

  it('throws when a JWT secret is under 32 characters', () => {
    expect(() =>
      parseEnv({
        PORT: '4000',
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:5173',
        DATABASE_URL: 'postgresql://u:p@h/db',
        JWT_ACCESS_SECRET: 'too-short',
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        COOKIE_DOMAIN: 'localhost',
      }),
    ).toThrow()
  })
})
