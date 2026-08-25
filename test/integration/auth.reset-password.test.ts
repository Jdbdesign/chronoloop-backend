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
import { TestMailer } from '../../src/lib/mailer.js'

function appWithTestMailer() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/auth', createAuthRouter(TestMailer))
  app.use(errorHandler)
  return app
}

async function requestReset(email: string): Promise<string> {
  await request(appWithTestMailer()).post('/auth/forgot-password').send({ email })
  const [, rawToken] = TestMailer.sent[TestMailer.sent.length - 1].body.match(/token=([0-9a-f]+)/)!
  return rawToken
}

describe('POST /auth/reset-password', () => {
  beforeEach(() => {
    TestMailer.reset()
    return resetDb()
  })

  it('resets the password given a valid, unexpired, unused token, and the new password actually works', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })
    const rawToken = await requestReset('jacob@example.com')

    const res = await request(appWithTestMailer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'brand-new-password-1' })
    expect(res.status).toBe(200)

    // Verify by actually logging in with the new password — not just trusting the 200.
    const oldLogin = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'old-password-1' })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'brand-new-password-1' })
    expect(newLogin.status).toBe(200)
    expect(newLogin.body.user.email).toBe('jacob@example.com')
  })

  it('rejects an already-used token with a generic 400 (single-use)', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })
    const rawToken = await requestReset('jacob@example.com')
    await request(appWithTestMailer()).post('/auth/reset-password').send({ token: rawToken, newPassword: 'first-use-pw-1' })

    const res = await request(appWithTestMailer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'second-use-pw-1' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN')

    // The second attempt's password must not have taken effect either.
    const login = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'second-use-pw-1' })
    expect(login.status).toBe(401)
  })

  it('rejects an expired token with the identical generic 400', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })
    const rawToken = await requestReset('jacob@example.com')
    await db.passwordResetToken.updateMany({
      where: { userId: (await db.user.findUniqueOrThrow({ where: { email: 'jacob@example.com' } })).id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await request(appWithTestMailer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'whatever-pw-1' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN')

    const login = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'whatever-pw-1' })
    expect(login.status).toBe(401)
  })

  it('rejects a garbage/nonexistent token with the identical generic 400', async () => {
    const res = await request(appWithTestMailer())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'whatever-pw-1' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN')
  })

  it('revokes every existing session for the user on successful reset', async () => {
    await db.user.create({
      data: { email: 'jacob@example.com', passwordHash: await hashPassword('old-password-1'), firstName: 'J', lastName: 'S' },
    })

    // Two independent logins (e.g. two devices) before the reset.
    const loginA = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'old-password-1' })
    const cookieA = loginA.headers['set-cookie'][0] as string

    const loginB = await request(appWithTestMailer())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'old-password-1' })
    const cookieB = loginB.headers['set-cookie'][0] as string

    const rawToken = await requestReset('jacob@example.com')
    const resetRes = await request(appWithTestMailer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'brand-new-password-1' })
    expect(resetRes.status).toBe(200)

    const refreshA = await request(appWithTestMailer()).post('/auth/refresh').set('Cookie', cookieA)
    expect(refreshA.status).toBe(401)
    expect(refreshA.body.error.code).toBe('INVALID_REFRESH_TOKEN')

    const refreshB = await request(appWithTestMailer()).post('/auth/refresh').set('Cookie', cookieB)
    expect(refreshB.status).toBe(401)
    expect(refreshB.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('rejects a malformed request body with 400', async () => {
    const res = await request(appWithTestMailer()).post('/auth/reset-password').send({ token: '', newPassword: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
