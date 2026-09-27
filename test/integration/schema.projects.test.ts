import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/client.js'
import { resetDb } from '../helpers/resetDb.js'
import { createWorkspaceWithOwner, addMember } from '../helpers/fixtures.js'

describe('Projects domain schema', () => {
  beforeEach(resetDb)

  it('creates a Project with nested Milestone and ProjectMember rows', async () => {
    const { workspace, member } = await createWorkspaceWithOwner()
    const { member: member2 } = await addMember(workspace.id)

    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Test Project',
        color: '#4A90FF',
        milestones: {
          create: [
            { label: 'Phase 1', done: false, order: 0 },
            { label: 'Phase 2', done: true, order: 1 },
          ],
        },
        members: {
          create: [{ memberId: member.id }, { memberId: member2.id }],
        },
      },
      include: { milestones: true, members: true, tasks: true },
    })

    expect(project.status).toBe('ACTIVE')
    expect(project.priority).toBe('MEDIUM')
    expect(project.milestones).toHaveLength(2)
    expect(project.members).toHaveLength(2)
    expect(project.tasks).toHaveLength(0)
  })

  it('Task.projectId FK is now a real relation — rejects a non-existent projectId', async () => {
    const { workspace } = await createWorkspaceWithOwner()

    await expect(
      db.task.create({
        data: { workspaceId: workspace.id, title: 'Orphaned', projectId: 'no_such_project' },
      }),
    ).rejects.toThrow()
  })

  it('Task with a real projectId links correctly', async () => {
    const { workspace } = await createWorkspaceWithOwner()
    const project = await db.project.create({
      data: { workspaceId: workspace.id, name: 'P', color: '#fff' },
    })
    const task = await db.task.create({
      data: { workspaceId: workspace.id, title: 'T', projectId: project.id },
      include: { project: true },
    })

    expect(task.project?.id).toBe(project.id)
  })
})
