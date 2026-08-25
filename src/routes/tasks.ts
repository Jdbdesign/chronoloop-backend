import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireWorkspaceMember } from '../middleware/requireWorkspaceMember.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'
import { TASK_SELECT, withOverdue } from '../lib/taskAccess.js'

export const tasksByWorkspaceRouter = Router({ mergeParams: true })

const listQuerySchema = z.object({
  project: z.string().optional(),
  assignee: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
})

tasksByWorkspaceRouter.get('/', requireAuth, requireWorkspaceMember, async (req, res) => {
  if (req.params.id !== req.workspaceMember!.workspaceId) {
    throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
  }
  const query = listQuerySchema.parse(req.query)

  const tasks = await db.task.findMany({
    where: {
      workspaceId: req.params.id,
      deletedAt: null,
      ...(query.project && { projectId: query.project }),
      ...(query.assignee && { assigneeId: query.assignee }),
      ...(query.status && { status: query.status }),
    },
    select: TASK_SELECT,
    orderBy: { createdAt: 'desc' },
  })

  res.json(tasks.map(withOverdue))
})

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  due: z.coerce.date().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

async function assertValidAssignee(workspaceId: string, assigneeId: string): Promise<void> {
  const assignee = await db.workspaceMember.findFirst({ where: { id: assigneeId, workspaceId } })
  if (!assignee) {
    throw new AppError(400, 'INVALID_ASSIGNEE', 'assigneeId is not a member of this workspace.')
  }
}

tasksByWorkspaceRouter.post(
  '/',
  requireAuth,
  requireWorkspaceMember,
  requireRole('CREATE_TASKS'),
  async (req, res) => {
    if (req.params.id !== req.workspaceMember!.workspaceId) {
      throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
    }
    const input = createTaskSchema.parse(req.body)
    if (input.assigneeId) {
      await assertValidAssignee(req.params.id, input.assigneeId)
    }

    const created = await db.task.create({
      data: {
        workspaceId: req.params.id,
        title: input.title,
        description: input.description ?? null,
        projectId: input.projectId ?? null,
        assigneeId: input.assigneeId ?? null,
        priority: input.priority ?? 'MEDIUM',
        due: input.due ?? null,
        tags: input.tags ?? [],
      },
      select: TASK_SELECT,
    })

    res.status(201).json(withOverdue(created))
  },
)

// Tasks 3-5 append PATCH /:id, PATCH /:id/status, DELETE /:id, POST /:id/restore,
// POST /:id/subtasks, and POST /:id/comments to this router.
export const tasksRouter = Router()
