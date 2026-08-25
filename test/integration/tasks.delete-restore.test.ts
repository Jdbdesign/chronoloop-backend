import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('DELETE /tasks/:id and POST /tasks/:id/restore', () => {
  beforeEach(resetDb)

  it('soft-deletes then restores a task', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const del = await request(testApp())
      .delete(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
    expect(del.status).toBe(200)
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).deletedAt).not.toBeNull()

    const listAfterDelete = await request(testApp())
      .get(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
    expect(listAfterDelete.body).toHaveLength(0)

    const restore = await request(testApp())
      .post(`/tasks/${task.id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
    expect(restore.status).toBe(200)
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).deletedAt).toBeNull()
  })

  it('rejects a MEMBER with 403 on delete (requires DELETE_TASKS)', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token } = await addMember(workspace.id, 'MEMBER')
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .delete(`/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(403)
  })
})
