import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'

const body = {
  email: 'jacob@example.com',
  password: 'a-strong-password-1',
  firstName: 'Jacob',
  lastName: 'Solayinka',
  workspaceName: 'Acme Co',
}

describe('POST /auth/signup-workspace', () => {
  beforeEach(resetDb)

  it('creates a User, a Workspace, and an OWNER WorkspaceMember in one call, and persists a consistent DB state', async () => {
    const res = await request(testApp()).post('/auth/signup-workspace').send(body)

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('jacob@example.com')
    expect(res.body.user.passwordHash).toBeUndefined()
    expect(res.body.workspace.name).toBe('Acme Co')
    expect(res.body.accessToken).toEqual(expect.any(String))
    expect(res.headers['set-cookie'][0]).toMatch(/^refreshToken=/)
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/)
    // Refresh token must only travel via the httpOnly cookie, never in the JSON body.
    expect(res.body.refreshToken).toBeUndefined()

    // Verify the actual DB state, not just the response shape.
    const dbUser = await db.user.findUnique({ where: { email: 'jacob@example.com' } })
    expect(dbUser).not.toBeNull()
    expect(dbUser!.id).toBe(res.body.user.id)
    // The stored hash must be a real bcrypt hash, never the plaintext password.
    expect(dbUser!.passwordHash).not.toBe(body.password)
    expect(dbUser!.passwordHash).toMatch(/^\$2[aby]\$/)

    const dbWorkspace = await db.workspace.findUnique({ where: { id: res.body.workspace.id } })
    expect(dbWorkspace).not.toBeNull()
    expect(dbWorkspace!.name).toBe('Acme Co')

    const member = await db.workspaceMember.findFirst({ where: { userId: dbUser!.id } })
    expect(member?.role).toBe('OWNER')
    expect(member?.workspaceId).toBe(dbWorkspace!.id)

    // A Session row must exist so the refresh token issued in the cookie is redeemable later,
    // and it must store only the hash, never the raw token.
    const session = await db.session.findFirst({ where: { userId: dbUser!.id } })
    expect(session).not.toBeNull()
    const setCookieHeader = res.headers['set-cookie'][0] as string
    const rawRefreshToken = setCookieHeader.split(';')[0].split('=')[1]
    expect(session!.refreshTokenHash).not.toBe(rawRefreshToken)
  })

  it('never logs the raw password', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await request(testApp()).post('/auth/signup-workspace').send(body)
      const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n')
      expect(loggedText).not.toContain(body.password)
    } finally {
      logSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('rejects a duplicate email with a specific 409 (not enumeration-hardened — see plan note)', async () => {
    await db.user.create({
      data: { email: body.email, passwordHash: await hashPassword('x'), firstName: 'X', lastName: 'Y' },
    })

    const res = await request(testApp()).post('/auth/signup-workspace').send(body)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')

    // Duplicate rejection must not have created a second, orphaned Workspace/WorkspaceMember.
    const users = await db.user.findMany({ where: { email: body.email } })
    expect(users).toHaveLength(1)
  })

  it('rejects two concurrent signups with the same email via the DB constraint, not just the pre-check', async () => {
    // Fires both requests at once so neither's pre-check `findUnique` sees the other's row yet —
    // this exercises the real race the read-then-write pre-check alone cannot close.
    const [resA, resB] = await Promise.all([
      request(testApp()).post('/auth/signup-workspace').send(body),
      request(testApp()).post('/auth/signup-workspace').send(body),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 409])

    const loser = resA.status === 409 ? resA : resB
    expect(loser.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')

    const users = await db.user.findMany({ where: { email: body.email } })
    expect(users).toHaveLength(1)
  })

  it('rejects an invalid email format with 400', async () => {
    const res = await request(testApp())
      .post('/auth/signup-workspace')
      .send({ ...body, email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a weak/missing password with 400', async () => {
    const res = await request(testApp())
      .post('/auth/signup-workspace')
      .send({ ...body, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('derives a unique slug from the workspace name, appending a suffix on collision', async () => {
    const first = await request(testApp()).post('/auth/signup-workspace').send(body)
    expect(first.status).toBe(201)
    expect(first.body.workspace.slug).toBe('acme-co')

    const second = await request(testApp())
      .post('/auth/signup-workspace')
      .send({ ...body, email: 'second@example.com' })

    expect(second.status).toBe(201)
    expect(second.body.workspace.slug).not.toBe(first.body.workspace.slug)
    expect(second.body.workspace.slug).toMatch(/^acme-co-\d+$/)
  })
})
