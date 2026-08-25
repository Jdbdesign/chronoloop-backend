import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'

describe('POST /auth/login', () => {
  beforeEach(resetDb)

  it('logs in with correct credentials and records a successful LoginAttempt', async () => {
    await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('correct-pw-1'),
        firstName: 'J',
        lastName: 'S',
      },
    })

    const res = await request(testApp())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'correct-pw-1' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toEqual(expect.any(String))
    expect(res.body.user.email).toBe('jacob@example.com')
    expect(res.body.user.passwordHash).toBeUndefined()
    expect(res.headers['set-cookie'][0]).toMatch(/^refreshToken=/)

    const attempts = await db.loginAttempt.findMany({ where: { emailTried: 'jacob@example.com' } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].success).toBe(true)
  })

  it('returns an identical generic error for wrong password vs. unknown email (no enumeration)', async () => {
    await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('correct-pw-1'),
        firstName: 'J',
        lastName: 'S',
      },
    })

    const wrongPw = await request(testApp())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'nope' })
    const unknownEmail = await request(testApp())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'nope' })

    expect(wrongPw.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPw.body).toEqual(unknownEmail.body)
    expect(wrongPw.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('records a failed LoginAttempt for a wrong password', async () => {
    await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('correct-pw-1'),
        firstName: 'J',
        lastName: 'S',
      },
    })
    await request(testApp()).post('/auth/login').send({ email: 'jacob@example.com', password: 'nope' })

    const attempts = await db.loginAttempt.findMany({ where: { emailTried: 'jacob@example.com' } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].success).toBe(false)
  })

  it('records a failed LoginAttempt (with no userId) for an unknown email', async () => {
    await request(testApp()).post('/auth/login').send({ email: 'nobody@example.com', password: 'nope' })

    const attempts = await db.loginAttempt.findMany({ where: { emailTried: 'nobody@example.com' } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].success).toBe(false)
    expect(attempts[0].userId).toBeNull()
  })

  it('rejects a malformed request body with 400', async () => {
    const res = await request(testApp()).post('/auth/login').send({ email: 'not-an-email', password: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
