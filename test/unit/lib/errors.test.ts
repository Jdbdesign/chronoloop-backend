import { describe, it, expect } from 'vitest'
import { AppError } from '../../../src/lib/errors.js'

describe('AppError', () => {
  it('carries a status, code, and message', () => {
    const err = new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    expect(err.status).toBe(401)
    expect(err.code).toBe('INVALID_CREDENTIALS')
    expect(err.message).toBe('Invalid email or password.')
  })

  it('serializes to the standard response shape', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Not found.')
    expect(err.toResponseBody()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found.' },
    })
  })
})
