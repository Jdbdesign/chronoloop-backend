import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('POST /workspaces/:id/tasks', () => {
  beforeEach(resetDb)

  it('creates a task with defaults applied', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'New task' })

    expect(res.status).toBe(201)
    expect(res.body.title).toBe('New task')
    expect(res.body.status).toBe('TODO')
    expect(res.body.priority).toBe('MEDIUM')
    expect(res.body.tags).toEqual([])
    expect(res.body).not.toHaveProperty('sprintId')
    expect(res.body).not.toHaveProperty('points')
    expect(res.body).not.toHaveProperty('completedAt')
  })

  it('validates assigneeId against real workspace membership', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'New task', assigneeId: 'not-a-real-member-id' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE')
  })

  it('accepts a real member as assignee', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { member } = await addMember(workspace.id)

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Assigned task', assigneeId: member.id })

    expect(res.status).toBe(201)
    expect(res.body.assigneeId).toBe(member.id)
  })

  it('rejects a VIEWER with 403', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token } = await addMember(workspace.id, 'VIEWER')

    const res = await request(testApp())
      .post(`/workspaces/${workspace.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ title: 'Should fail' })

    expect(res.status).toBe(403)
    expect(await db.task.count()).toBe(0)
  })
})
