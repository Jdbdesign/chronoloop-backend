import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { hashToken } from '../../src/lib/jwt.js'

describe('POST /auth/logout', () => {
  beforeEach(resetDb)

  it('revokes the session so the refresh token can no longer be used', async () => {
    await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('correct-pw-1'),
        firstName: 'J',
        lastName: 'S',
      },
    })
    const loginRes = await request(testApp())
      .post('/auth/login')
      .send({ email: 'jacob@example.com', password: 'correct-pw-1' })
    const cookie = loginRes.headers['set-cookie'][0] as string

    const logoutRes = await request(testApp()).post('/auth/logout').set('Cookie', cookie)
    expect(logoutRes.status).toBe(204)

    const refreshRes = await request(testApp()).post('/auth/refresh').set('Cookie', cookie)
    expect(refreshRes.status).toBe(401)

    const rawToken = cookie.split('refreshToken=')[1].split(';')[0]
    const session = await db.session.findUnique({ where: { refreshTokenHash: hashToken(rawToken) } })
    expect(session?.revokedAt).not.toBeNull()
  })

  it('returns 204 even with no refresh cookie present (idempotent logout)', async () => {
    const res = await request(testApp()).post('/auth/logout')
    expect(res.status).toBe(204)
  })
})
