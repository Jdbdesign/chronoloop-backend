import 'express-async-errors'
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createAuthRouter } from '../../src/routes/auth.js'
import { errorHandler } from '../../src/middleware/errorHandler.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { hashToken } from '../../src/lib/jwt.js'
import { TestMailer } from '../../src/lib/mailer.js'
import { env } from '../../src/config/env.js'

function appWithTestMailer() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/auth', createAuthRouter(TestMailer))
  app.use(errorHandler)
  return app
}

describe('POST /auth/forgot-password', () => {
  beforeEach(() => {
    TestMailer.reset()
    return resetDb()
  })

  it('returns a generic 200 and sends a reset email for a known email', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })

    const res = await request(appWithTestMailer()).post('/auth/forgot-password').send({ email: 'jacob@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/if an account exists/i)
    expect(TestMailer.sent).toHaveLength(1)
    expect(TestMailer.sent[0].to).toBe('jacob@example.com')

    const tokenRow = await db.passwordResetToken.findFirst()
    expect(tokenRow).not.toBeNull()
  })

  it('returns the identical generic 200 for an unknown email, with no email sent (no enumeration)', async () => {
    const known = await request(appWithTestMailer()).post('/auth/forgot-password').send({ email: 'nobody@example.com' })
    expect(known.status).toBe(200)
    expect(known.body.message).toMatch(/if an account exists/i)
    expect(TestMailer.sent).toHaveLength(0)

    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })
    TestMailer.reset()
    const existing = await request(appWithTestMailer()).post('/auth/forgot-password').send({ email: 'jacob@example.com' })

    // Same status and same response body shape for the existing-account case —
    // the only externally observable difference (whether mail was sent) is not
    // observable to the caller.
    expect(existing.status).toBe(known.status)
    expect(existing.body).toEqual(known.body)
  })

  it('sends a mail body constructed from the real FRONTEND_URL env var, not a hardcoded origin', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })

    await request(appWithTestMailer()).post('/auth/forgot-password').send({ email: 'jacob@example.com' })

    expect(TestMailer.sent[0].body).toContain(`${env.FRONTEND_URL}/reset-password?token=`)
    const [, rawToken] = TestMailer.sent[0].body.match(/token=([0-9a-f]+)/)!
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/)

    const tokenRow = await db.passwordResetToken.findFirst()
    expect(tokenRow?.tokenHash).toBe(hashToken(rawToken))
  })

  it('rejects a malformed request body with 400', async () => {
    const res = await request(appWithTestMailer()).post('/auth/forgot-password').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(TestMailer.sent).toHaveLength(0)
  })
})
