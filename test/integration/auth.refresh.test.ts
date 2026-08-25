import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { hashToken } from '../../src/lib/jwt.js'

async function loginAndGetCookie() {
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
  return res.headers['set-cookie'][0] as string
}

describe('POST /auth/refresh', () => {
  beforeEach(resetDb)

  it('issues a new access token and rotates the refresh cookie given a valid refresh cookie', async () => {
    const cookie = await loginAndGetCookie()

    const res = await request(testApp()).post('/auth/refresh').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toEqual(expect.any(String))
    const newCookie = res.headers['set-cookie'][0]
    expect(newCookie).toMatch(/^refreshToken=/)
    expect(newCookie).not.toBe(cookie)
  })

  it('revokes the old session row on rotation (not just issuing a new one)', async () => {
    const cookie = await loginAndGetCookie()
    const rawOldToken = cookie.split('refreshToken=')[1].split(';')[0]

    await request(testApp()).post('/auth/refresh').set('Cookie', cookie)

    const oldSession = await db.session.findUnique({ where: { refreshTokenHash: hashToken(rawOldToken) } })
    expect(oldSession?.revokedAt).not.toBeNull()
  })

  it('rejects reuse of an already-rotated (revoked) refresh token', async () => {
    const cookie = await loginAndGetCookie()
    await request(testApp()).post('/auth/refresh').set('Cookie', cookie) // first use rotates it

    const res = await request(testApp()).post('/auth/refresh').set('Cookie', cookie) // reuse of the now-revoked token

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('treats reuse of a revoked token as theft and revokes every other active session for that user', async () => {
    await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('correct-pw-1'),
        firstName: 'J',
        lastName: 'S',
      },
    })

    // Two independent logins (e.g. two devices) for the same user.
    const loginA = await request(testApp())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'correct-pw-1' })
    const cookieA = loginA.headers['set-cookie'][0] as string

    const loginB = await request(testApp())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'correct-pw-1' })
    const cookieB = loginB.headers['set-cookie'][0] as string
    const rawTokenB = cookieB.split('refreshToken=')[1].split(';')[0]

    // Device A rotates normally.
    await request(testApp()).post('/auth/refresh').set('Cookie', cookieA)
    // Device A's old (now-revoked) token is replayed — the theft signal.
    const reuseRes = await request(testApp()).post('/auth/refresh').set('Cookie', cookieA)
    expect(reuseRes.status).toBe(401)

    // Device B's still-otherwise-valid session must now be revoked too.
    const sessionB = await db.session.findUnique({ where: { refreshTokenHash: hashToken(rawTokenB) } })
    expect(sessionB?.revokedAt).not.toBeNull()

    const refreshB = await request(testApp()).post('/auth/refresh').set('Cookie', cookieB)
    expect(refreshB.status).toBe(401)
    expect(refreshB.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('rejects an expired refresh token', async () => {
    const cookie = await loginAndGetCookie()
    const rawToken = cookie.split('refreshToken=')[1].split(';')[0]

    await db.session.update({
      where: { refreshTokenHash: hashToken(rawToken) },
      data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    })

    const res = await request(testApp()).post('/auth/refresh').set('Cookie', cookie)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('rejects a missing refresh cookie', async () => {
    const res = await request(testApp()).post('/auth/refresh')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })

  it('rejects a well-formed but nonexistent refresh token', async () => {
    const res = await request(testApp()).post('/auth/refresh').set('Cookie', 'refreshToken=' + 'a'.repeat(64))
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN')
  })
})
