import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('POST /tasks/:id/subtasks', () => {
  beforeEach(resetDb)

  it('adds a subtask and returns the updated task', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .post(`/tasks/${task.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: 'Do the thing' })

    expect(res.status).toBe(201)
    expect(res.body.subtasks).toHaveLength(1)
    expect(res.body.subtasks[0]).toMatchObject({ text: 'Do the thing', done: false })
  })

  it('assigns increasing order values to successive subtasks', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    await request(testApp())
      .post(`/tasks/${task.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: 'First' })
    const res = await request(testApp())
      .post(`/tasks/${task.id}/subtasks`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: 'Second' })

    expect(res.body.subtasks.map((s: { text: string }) => s.text)).toEqual(['First', 'Second'])
  })
})

describe('PATCH /subtasks/:id', () => {
  beforeEach(resetDb)

  it('toggles done', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({
      data: { workspaceId: workspace.id, title: 'T', subtasks: { create: [{ text: 'Sub', order: 0 }] } },
      include: { subtasks: true },
    })
    const subtaskId = task.subtasks[0].id

    const res = await request(testApp())
      .patch(`/subtasks/${subtaskId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ done: true })

    expect(res.status).toBe(200)
    expect(res.body.subtasks[0].done).toBe(true)
  })

  it('returns 404 for a subtask belonging to another workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    const task = await db.task.create({
      data: { workspaceId: other.id, title: 'T', subtasks: { create: [{ text: 'Sub', order: 0 }] } },
      include: { subtasks: true },
    })

    const res = await request(testApp())
      .patch(`/subtasks/${task.subtasks[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ done: true })

    expect(res.status).toBe(404)
  })
})
