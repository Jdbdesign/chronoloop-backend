import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'
import { db } from '../../src/db/client.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('POST /workspaces/:id/projects', () => {
  beforeEach(resetDb)

  it('creates a project with defaults applied', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Alpha', color: '#4A90FF' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Alpha')
    expect(res.body.status).toBe('ACTIVE')
    expect(res.body.priority).toBe('MEDIUM')
    expect(res.body.members).toEqual([])
    expect(res.body.milestones).toEqual([])
    expect(res.body.tasksTotal).toBe(0)
    expect(res.body.progress).toBe(0)
    expect(res.body).not.toHaveProperty('tasks')
  })

  it('seeds members from memberIds at creation time', async () => {
    const { workspace, member, token } = await createWorkspaceWithOwner()
    const { member: member2 } = await addMember(workspace.id)

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Team', color: '#00D4AA', memberIds: [member.id, member2.id] })

    expect(res.status).toBe(201)
    expect(res.body.members).toHaveLength(2)
  })

  it('seeds milestones with auto-assigned order', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({
        name: 'Milestoned',
        color: '#A855F7',
        milestones: [{ label: 'Phase 1', done: false }, { label: 'Phase 2', done: false }],
      })

    expect(res.status).toBe(201)
    expect(res.body.milestones).toHaveLength(2)
    expect(res.body.milestones[0].label).toBe('Phase 1')
    expect(res.body.milestones[0].order).toBe(0)
    expect(res.body.milestones[1].order).toBe(1)
  })

  it('rejects a memberId that is not a workspace member', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Bad', color: '#fff', memberIds: ['not-a-real-member-id'] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_MEMBER')
  })

  it('rejects a VIEWER with 403', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const { token } = await addMember(workspace.id, 'VIEWER')

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'Fail', color: '#fff' })

    expect(res.status).toBe(403)
    expect(await db.project.count()).toBe(0)
  })

  it('rejects missing required field color', async () => {
    const { workspace, token } = await createWorkspaceWithOwner()

    const res = await request(testApp())
      .post(/workspaces//projects)
      .set('Authorization', Bearer )
      .set('X-Workspace-Id', workspace.id)
      .send({ name: 'No color' })

    expect(res.status).toBe(400)
  })
})
