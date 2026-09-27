import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('DELETE /projects/:id', () => {
  beforeEach(resetDb)

  it('deletes a project and returns 204', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'To Delete', color: '#fff' } })

    const res = await request(testApp())
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(204)
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull()
  })

  it('cascades to ProjectMember and Milestone rows', async () => {
    const { workspace, member, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'P',
        color: '#fff',
        members: { create: [{ memberId: member.id }] },
        milestones: { create: [{ label: 'M', done: false, order: 0 }] },
      },
    })

    await request(testApp())
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(await db.projectMember.count({ where: { projectId: project.id } })).toBe(0)
    expect(await db.milestone.count({ where: { projectId: project.id } })).toBe(0)
  })

  it('nullifies Task.projectId on associated tasks (SET NULL)', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })
    const task = await db.task.create({ data: { workspaceId: workspace.id, title: 'T', projectId: project.id } })

    await request(testApp())
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    const updated = await db.task.findUnique({ where: { id: task.id } })
    expect(updated?.projectId).toBeNull()
  })

  it('returns 404 for a project in a different workspace', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()
    const { workspace: other } = await createWorkspaceWithOwner('Other')
    const project = await db.project.create({ data: { workspaceId: other.id, name: 'Not yours', color: '#fff' } })

    const res = await request(testApp())
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(404)
  })

  it('rejects a VIEWER with 403', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token } = await addMember(workspace.id, 'VIEWER')
    const project = await db.project.create({ data: { workspaceId: workspace.id, name: 'P', color: '#fff' } })

    const res = await request(testApp())
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace-Id', workspace.id)

    expect(res.status).toBe(403)
  })
})
