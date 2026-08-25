import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('POST /tasks/:id/comments', () => {
  beforeEach(resetDb)

  it('adds a comment authored by the caller', async () => {
    const { workspace, token, owner } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: 'Looks good to me' })

    expect(res.status).toBe(201)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0].text).toBe('Looks good to me')
    expect(res.body.comments[0].author.id).toBe(owner.id)
    expect(res.body.comments[0].author).not.toHaveProperty('passwordHash')
  })

  it('rejects an empty comment', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T' } })

    const res = await request(testApp())
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: '' })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a soft-deleted task', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const task = await db.task.create({
      data: { workspaceId: workspace.id, title: 'T', deletedAt: new Date() },
    })

    const res = await request(testApp())
      .post(`/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)
      .send({ text: 'Too late' })

    expect(res.status).toBe(404)
  })
})
