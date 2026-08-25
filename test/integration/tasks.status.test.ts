import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('PATCH /tasks/:id/status', () => {
  beforeEach(resetDb)

  it('changes status', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ status: 'DONE' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('DONE')
  })

  it('does not set completedAt when moving to DONE (plan Decision 1)', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    await request(testApp())
      .patch(`/tasks/${task.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ status: 'DONE' })

    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.completedAt).toBeNull()
  })

  it('rejects an invalid status value', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ status: 'OVERDUE' })

    expect(res.status).toBe(400)
  })

  it('returns 404 when attempting to change status of an already soft-deleted task', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({
      data: { workspaceId: workspace.id, title: 'Deleted task', deletedAt: new Date() },
    })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ status: 'DONE' })

    expect(res.status).toBe(404)
  })
})
