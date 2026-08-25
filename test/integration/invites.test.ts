import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { signAccessToken } from '../../src/lib/jwt.js'

async function createMember(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
  const workspace = await db.workspace.upsert({
    where: { slug: 'acme' },
    create: { name: 'Acme', slug: 'acme' },
    update: {},
  })
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, passwordHash: await hashPassword('x'), firstName: role, lastName: 'U' },
  })
  await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role } })
  return { workspace, user, token: signAccessToken(user.id) }
}

describe('POST /workspaces/:id/invites', () => {
  beforeEach(resetDb)

  it('lets an OWNER create an invite', async () => {
    const { workspace, token } = await createMember('OWNER')

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'newperson@example.com', role: 'MEMBER' })

    expect(res.status).toBe(201)
    expect(res.body.email).toBe('newperson@example.com')
    expect(res.body.tokenHash).toBeUndefined() // never leak the hash either

    const invite = await db.workspaceInvite.findFirst({ where: { email: 'newperson@example.com' } })
    expect(invite).not.toBeNull()
  })

  it('lets an ADMIN create an invite', async () => {
    const { workspace, token } = await createMember('ADMIN')

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'newperson2@example.com', role: 'MEMBER' })

    expect(res.status).toBe(201)
  })

  it('rejects a MEMBER-role user with 403', async () => {
    const { workspace, token } = await createMember('MEMBER')

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'newperson@example.com', role: 'MEMBER' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('rejects a VIEWER-role user with 403', async () => {
    const { workspace, token } = await createMember('VIEWER')

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'newperson@example.com', role: 'MEMBER' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  // Decision (B1 Task 10, unspecified in the plan): re-inviting an email that already
  // has a pending, unexpired invite is allowed rather than rejected as a duplicate or
  // silently refreshed. Rationale: the schema (Task 2) has no unique constraint on
  // (workspaceId, email), and accept-invite's existing-account check already prevents
  // any duplicate User/WorkspaceMember from being created no matter how many pending
  // invites exist for that email — whichever token is redeemed first "wins" and every
  // other pending invite to that email later resolves as if the account already exists.
  // A dedup/refresh UX (revoking the old invite, or returning it unchanged) is deferred
  // to B9's Team & Roles invite CRUD, where resend/revoke already lives.
  it('allows creating a second invite for an email that already has a pending invite', async () => {
    const { workspace, token } = await createMember('OWNER')

    const first = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'dupe@example.com', role: 'MEMBER' })
    expect(first.status).toBe(201)

    const second = await request(testApp())
      .post(`/workspaces/${workspace.id}/invites`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ email: 'dupe@example.com', role: 'MEMBER' })
    expect(second.status).toBe(201)
    expect(second.body.id).not.toBe(first.body.id)

    const invites = await db.workspaceInvite.findMany({ where: { email: 'dupe@example.com' } })
    expect(invites).toHaveLength(2)
  })
})
