import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireWorkspaceMember } from '../middleware/requireWorkspaceMember.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { assertWorkspaceSubtask, fetchTaskDTO } from '../lib/taskAccess.js'

export const subtasksRouter = Router()

const patchSubtaskSchema = z.object({ done: z.boolean() })

subtasksRouter.patch(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  requireRole('CREATE_TASKS'),
  async (req, res) => {
    const { taskId } = await assertWorkspaceSubtask(req.workspaceMember!.workspaceId, req.params.id)
    const { done } = patchSubtaskSchema.parse(req.body)
    await db.subtask.update({ where: { id: req.params.id }, data: { done } })
    res.json(await fetchTaskDTO(taskId))
  },
)
