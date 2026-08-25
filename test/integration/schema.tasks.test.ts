import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/client.js'
import { resetDb } from '../helpers/resetDb.js'
import { createWorkspaceWithOwner } from '../helpers/fixtures.js'

describe('Tasks domain schema', () => {
  beforeEach(resetDb)

  it('creates a Task with nested Subtask, Comment, and Attachment rows', async () => {
    const { owner, workspace } = await createWorkspaceWithOwner()

    const task = await db.task.create({
      data: {
        workspaceId: workspace.id,
        title: 'Design the schema',
        subtasks: { create: [{ text: 'Draft models', order: 0 }] },
        comments: { create: [{ text: 'Looks good', authorId: owner.id }] },
        attachments: {
          create: [{ name: 'spec.pdf', sizeBytes: 1024, mimeType: 'application/pdf', uploadedById: owner.id }],
        },
      },
      include: { subtasks: true, comments: true, attachments: true },
    })

    expect(task.status).toBe('TODO')
    expect(task.priority).toBe('MEDIUM')
    expect(task.deletedAt).toBeNull()
    expect(task.subtasks).toHaveLength(1)
    expect(task.comments).toHaveLength(1)
    expect(task.attachments).toHaveLength(1)
    expect(task.subtasks[0].done).toBe(false)
  })
})
