import { describe, it, expect } from 'vitest'
import express from 'express'
import 'express-async-errors'
import request from 'supertest'
import { z } from 'zod'
import { AppError } from '../../../src/lib/errors.js'
import { errorHandler } from '../../../src/middleware/errorHandler.js'

function buildTestApp() {
  const app = express()
  app.use(express.json())

  app.get('/validation-error', (_req, _res) => {
    z.object({ name: z.string() }).parse({})
  })

  app.get('/not-found', (_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'Resource not found.')
  })

  app.get('/unhandled-error', (_req, _res) => {
    throw new Error('something exploded internally')
  })

  app.get('/async-rejected-error', async (_req, _res) => {
    await Promise.resolve()
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired access token.')
  })

  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  it('maps a ZodError to a 400 VALIDATION_ERROR response', async () => {
    const res = await request(buildTestApp()).get('/validation-error')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(typeof res.body.error.message).toBe('string')
  })

  it('maps a thrown AppError to its declared status and code', async () => {
    const res = await request(buildTestApp()).get('/not-found')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } })
  })

  it('maps an unrecognized thrown error to a generic 500 without leaking internal details', async () => {
    const res = await request(buildTestApp()).get('/unhandled-error')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    })
    expect(res.body.error.message).not.toContain('something exploded internally')
  })

  it('catches an AppError thrown from a rejected async handler, not just synchronous throws', async () => {
    const res = await request(buildTestApp()).get('/async-rejected-error')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired access token.' },
    })
  })
})
