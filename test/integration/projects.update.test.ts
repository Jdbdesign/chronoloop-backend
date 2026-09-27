import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('PATCH /projects/:id', () => {
  beforeEach(resetDb)

  it('updates editable scalar fields', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'Original', color: '#fff' } })

    const res = await request(testApp())
      .patch(/projects/)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Renamed', status: 'IN_PROGRESS', priority: 'HIGH', color: '#4A90FF' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Renamed')
    expect(res.body.status).toBe('IN_PROGRESS')
    expect(res.body.priority).toBe('HIGH')
  })

  it('returns full detail shape after update (rollups + milestones + members)', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'P',
        color: '#fff',
        milestones: { create: [{ label: 'M1', done: false, order: 0 }] },
      },
    })

    const res = await request(testApp())
      .patch(/projects/)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Updated P' })

    expect(res.body.milestones).toHaveLength(1)
    expect(res.body.tasksTotal).toBe(0)
    expect(res.body).not.toHaveProperty('tasks')
  })

  it('silently ignores memberIds and milestones in patch body (seed-only, Decision 1)', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })

    const res = await request(testApp())
      .patch(/projects/)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Updated', memberIds: ['ignored'], milestones: [{ label: 'ignored' }] })

    expect(res.status).toBe(200)
    expect(res.body.members).toHaveLength(0)
    expect(res.body.milestones).toHaveLength(0)
  })

  it('returns 404 for a project in a different workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    const project = await db.project.create({ data: { workspaceId: other.id, name: 'Not yours', color: '#fff' } })

    const res = await request(testApp())
      .patch(/projects/)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Hijack' })

    expect(res.status).toBe(404)
  })

  it('rejects a VIEWER with 403', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token } = await addMember(workspace.id, 'VIEWER')
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })

    const res = await request(testApp())
      .patch(/projects/)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Should fail' })

    expect(res.status).toBe(403)
  })
})
