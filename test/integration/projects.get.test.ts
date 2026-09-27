import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('GET /projects/:id', () => {
  beforeEach(resetDb)

  it('returns full detail shape including milestones and members', async () => {
    const { workspace, member, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Detail Project',
        color: '#fff',
        milestones: { create: [{ label: 'M1', done: false, order: 0 }] },
        members: { create: [{ memberId: member.id }] },
      },
    })

    const res = await request(testApp())
      .get(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(project.id)
    expect(res.body.milestones).toHaveLength(1)
    expect(res.body.milestones[0].label).toBe('M1')
    expect(res.body.members).toHaveLength(1)
    expect(res.body.tasksTotal).toBe(0)
    expect(res.body).not.toHaveProperty('tasks')
  })

  it('returns correct rollups when project has tasks', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T1', projectId: project.id, status: 'DONE' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T2', projectId: project.id, status: 'TODO' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T3', projectId: project.id, status: 'DONE' } })

    const res = await request(testApp())
      .get(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.body.tasksTotal).toBe(3)
    expect(res.body.tasksDone).toBe(2)
    expect(res.body.progress).toBe(67)
  })

  it('returns 404 for a project in a different workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    const project = await db.project.create({ data: { workspaceId: other.id, name: 'Not yours', color: '#fff' } })

    const res = await request(testApp())
      .get(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(404)
  })

  it('returns 404 for a non-existent project', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .get('/projects/non_existent_id')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(404)
  })
})
