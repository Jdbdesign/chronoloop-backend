import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
// This file builds its own bare `express()` app (instead of going through
// `buildApp()`) so it can inject TestMailer — buildApp()'s import of
// 'express-async-errors' never runs for it, and Vitest's default file
// isolation means that patch doesn't leak in from another test file either.
// Without this import, an AppError thrown inside an async handler becomes an
// unhandled promise rejection instead of reaching `errorHandler`, and the
// request hangs until the test times out.
import 'express-async-errors'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createAuthRouter } from '../../src/routes/auth.js'
import { createInvitesRouter } from '../../src/routes/invites.js'
import { errorHandler } from '../../src/middleware/errorHandler.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { signAccessToken } from '../../src/lib/jwt.js'
import { TestMailer } from '../../src/lib/mailer.js'

function appWithTestMailer() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/auth', createAuthRouter(TestMailer))
  app.use('/workspaces/:id/invites', createInvitesRouter(TestMailer))
  app.use(errorHandler)
  return app
}

async function inviteMember(email: string) {
  const owner = await db.user.create({
    data: { email: 'owner@example.com', passwordHash: await hashPassword('x'), firstName: 'O', lastName: 'W' },
  })
  const workspace = await db.workspace.create({ data: { name: 'Acme', slug: 'acme' } })
  await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER' } })

  await request(appWithTestMailer())
    .post(`/workspaces/${workspace.id}/invites`)
    .set('Authorization', `Bearer ${signAccessToken(owner.id)}`)
    .set('X-Workspace-Id', workspace.id)
    .send({ email, role: 'MEMBER' })

  const [, rawToken] = TestMailer.sent.at(-1)!.body.match(/token=([0-9a-f]+)/)!
  return { workspace, rawToken }
}

describe('POST /auth/accept-invite', () => {
  beforeEach(() => {
    TestMailer.reset()
    return resetDb()
  })

  it('creates a new User and WorkspaceMember for a fresh email', async () => {
    const { workspace, rawToken } = await inviteMember('newperson@example.com')

    const res = await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: rawToken, password: 'a-new-password-1', firstName: 'New', lastName: 'Person' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('newperson@example.com')
    expect(res.body.user.passwordHash).toBeUndefined()
    expect(res.body.accessToken).toEqual(expect.any(String))

    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    const refreshCookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c: string) =>
      c.startsWith('refreshToken='),
    )
    expect(refreshCookie).toBeDefined()
    expect(refreshCookie).toMatch(/HttpOnly/i)

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, user: { email: 'newperson@example.com' } },
    })
    expect(member?.role).toBe('MEMBER')

    const invite = await db.workspaceInvite.findFirst({ where: { email: 'newperson@example.com' } })
    expect(invite?.acceptedAt).not.toBeNull()

    const users = await db.user.findMany({ where: { email: 'newperson@example.com' } })
    expect(users).toHaveLength(1)
  })

  it('rejects an already-accepted invite with a generic 400', async () => {
    const { rawToken } = await inviteMember('newperson@example.com')
    await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: rawToken, password: 'a-new-password-1', firstName: 'New', lastName: 'Person' })

    const res = await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: rawToken, password: 'another-password-1', firstName: 'New', lastName: 'Person' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_INVITE_TOKEN')
  })

  it('rejects an expired invite with the identical generic 400', async () => {
    const { rawToken, workspace } = await inviteMember('expired@example.com')
    await db.workspaceInvite.updateMany({
      where: { workspaceId: workspace.id, email: 'expired@example.com' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: rawToken, password: 'whatever-1', firstName: 'E', lastName: 'X' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_INVITE_TOKEN')
  })

  it('rejects a garbage token with the identical generic 400', async () => {
    const res = await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: 'not-real', password: 'whatever-1', firstName: 'N', lastName: 'P' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_INVITE_TOKEN')
  })

  it('returns 409 EMAIL_HAS_EXISTING_ACCOUNT when the invited email already has a User row, without creating a duplicate or auto-linking', async () => {
    await db.user.create({
      data: { email: 'existing@example.com', passwordHash: await hashPassword('x'), firstName: 'E', lastName: 'X' },
    })
    const { workspace, rawToken } = await inviteMember('existing@example.com')

    const res = await request(appWithTestMailer())
      .post('/auth/accept-invite')
      .send({ token: rawToken, password: 'irrelevant-1', firstName: 'E', lastName: 'X' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_HAS_EXISTING_ACCOUNT')

    const users = await db.user.findMany({ where: { email: 'existing@example.com' } })
    expect(users).toHaveLength(1) // no duplicate created

    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, user: { email: 'existing@example.com' } },
    })
    expect(member).toBeNull() // no auto-link either

    const invite = await db.workspaceInvite.findFirst({ where: { email: 'existing@example.com' } })
    expect(invite?.acceptedAt).toBeNull() // invite not consumed by the 409 path
  })
})
