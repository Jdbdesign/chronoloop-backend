import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('PATCH /tasks/:id', () => {
  beforeEach(resetDb)

  it('updates editable fields', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'Original' } })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Renamed', priority: 'HIGH', tags: ['urgent'] })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Renamed')
    expect(res.body.priority).toBe('HIGH')
    expect(res.body.tags).toEqual(['urgent'])
  })

  it('ignores sprintId/points/completedAt even if sent', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'Original' } })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Still fine', sprintId: 'sprint_1', points: 5, completedAt: new Date().toISOString() })

    expect(res.status).toBe(200)
    const stored = await db.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.sprintId).toBeNull()
    expect(stored.points).toBeNull()
    expect(stored.completedAt).toBeNull()
  })

  it('returns 404 for a task in a different workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    const task = await db.task.create({ data: { workspaceId: other.id, title: 'Not yours' } })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Hijack attempt' })

    expect(res.status).toBe(404)
  })

  it('returns 400 (not 500) for an out-of-range task id', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .patch('/tasks/99999999999')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Does not matter' })

    expect(res.status).toBe(400)
  })

  it('returns 404 when attempting to update an already soft-deleted task', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({
      data: { workspaceId: workspace.id, title: 'Deleted task', deletedAt: new Date() },
    })

    const res = await request(testApp())
      .patch(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Try to update' })

    expect(res.status).toBe(404)
  })
})
