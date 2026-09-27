import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('GET /workspaces/:id/projects', () => {
  beforeEach(resetDb)

  it("lists only projects in the caller's workspace", async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    await db.project.create({ data: { workspaceId: workspace.id, name: 'Mine', color: '#fff' } })
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    await db.project.create({ data: { workspaceId: other.id, name: 'Not mine', color: '#000' } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Mine')
  })

  it('returns rollup fields computed from tasks', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({
      data: { workspaceId: workspace.id, name: 'P', color: '#fff' },
    })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T1', projectId: project.id, status: 'DONE' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T2', projectId: project.id, status: 'TODO' } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    const p = res.body[0]
    expect(p.tasksTotal).toBe(2)
    expect(p.tasksDone).toBe(1)
    expect(p.progress).toBe(50)
    expect(p).not.toHaveProperty('tasks')
  })

  it('excludes soft-deleted tasks from rollup counts', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'T1', projectId: project.id, status: 'DONE' } })
    await db.task.create({ data: { workspaceId: workspace.id, title: 'Del', projectId: project.id, status: 'DONE', deletedAt: new Date() } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.body[0].tasksTotal).toBe(1)
  })

  it('returns dueDays as null when dueDate is null', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff', dueDate: null } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.body[0].dueDays).toBeNull()
  })

  it('returns members on list but NOT milestones', async () => {
    const { workspace, member, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })
    await db.projectMember.create({ data: { projectId: project.id, memberId: member.id } })

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.body[0].members).toHaveLength(1)
    expect(res.body[0]).not.toHaveProperty('milestones')
  })

  it('rejects a non-member with 403', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token: outsider } = await createWorkspaceWithOwner('Other')

    const res = await request(testApp())
      .get(`/workspaces/${workspace.id}/projects`)
      .set('Authorization', `Bearer ${outsider}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(403)
  })
})
