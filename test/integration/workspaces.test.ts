import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { signAccessToken } from '../../src/lib/jwt.js'

async function createOwnerAndWorkspace() {
  const user = await db.user.create({
    data: { email: 'owner@example.com', passwordHash: await hashPassword('x'), firstName: 'O', lastName: 'W' },
  })
  const workspace = await db.workspace.create({ data: { name: 'Acme', slug: 'acme' } })
  await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' } })
  return { user, workspace, token: signAccessToken(user.id) }
}

describe('GET /workspaces/:id', () => {
  beforeEach(resetDb)

  it('returns the workspace for a member', async () => {
    const { workspace, token } = await createOwnerAndWorkspace()
    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Acme')
  })

  it('rejects a non-member with 403', async () => {
    const { workspace } = await createOwnerAndWorkspace()
    const outsider = await db.user.create({
      data: { email: 'outsider@example.com', passwordHash: await hashPassword('x'), firstName: 'O', lastName: 'S' },
    })
    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}`)
      .set('Authorization', `Bearer ${signAccessToken(outsider.id)}`)
      .set('X-Workspace-Id', workspace.id)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('NOT_A_MEMBER')
  })
})

describe('PATCH /workspaces/:id', () => {
  beforeEach(resetDb)

  it('allows the OWNER to update the workspace name', async () => {
    const { workspace, token } = await createOwnerAndWorkspace()
    const res = await request(testApp())
      .patch(`/workspaces/${workspace.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Acme Renamed' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Acme Renamed')
  })

  it('rejects a MEMBER-role user with 403', async () => {
    const { workspace } = await createOwnerAndWorkspace()
    const member = await db.user.create({
      data: { email: 'member@example.com', passwordHash: await hashPassword('x'), firstName: 'M', lastName: 'E' },
    })
    await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: member.id, role: 'MEMBER' } })

    const res = await request(testApp())
      .patch(`/workspaces/${workspace.id}`)
      .set('Authorization', `Bearer ${signAccessToken(member.id)}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Should not apply' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})
