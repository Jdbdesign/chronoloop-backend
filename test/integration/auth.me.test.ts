import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { signAccessToken } from '../../src/lib/jwt.js'

describe('GET /auth/me', () => {
  beforeEach(resetDb)

  it('returns the authenticated user without a passwordHash field', async () => {
    const user = await db.user.create({
      data: {
        email: 'jacob@example.com',
        passwordHash: await hashPassword('irrelevant'),
        firstName: 'Jacob',
        lastName: 'Solayinka',
      },
    })
    const token = signAccessToken(user.id)

    const res = await request(testApp()).get('/auth/me').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('jacob@example.com')
    expect(res.body.passwordHash).toBeUndefined()
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await request(testApp()).get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})
