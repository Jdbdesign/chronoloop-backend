import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('GET /workspaces/:id/tasks', () => {
  beforeEach(resetDb)

  it('lists only non-deleted tasks in the caller\'s workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Visible' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Deleted', deletedAt: new Date() } })
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    await db.task.create({ data: { workspaceId: other.id, title: 'Not mine' } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Visible')
    expect(res.body[0].overdue).toBe(false)
    expect(res.body[0].subtasks).toEqual([])
  })

  it('filters by status', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Todo one' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Done one', status: 'DONE' } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/tasks?status=DONE`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Done one')
  })

  it('marks a past-due, non-done task as overdue', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Late', due: new Date('2000-01-01') } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.body[0].overdue).toBe(true)
  })
})
