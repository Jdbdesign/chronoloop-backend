import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireWorkspaceMember } from '../middleware/requireWorkspaceMember.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'

export const workspacesRouter = Router()

workspacesRouter.get('/:id', requireAuth, requireWorkspaceMember, async (req, res) => {
  if (req.params.id !== req.workspaceMember!.workspaceId) {
    throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
  }
  const workspace = await db.workspace.findUnique({ where: { id: req.params.id } })
  if (!workspace) {
    throw new AppError(404, 'NOT_FOUND', 'Workspace not found.')
  }
  res.json(workspace)
})

const patchWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  currency: z.string().optional(),
  fiscalYearStart: z.number().int().min(1).max(12).optional(),
  weekStart: z.string().optional(),
  sprintDurationDays: z.number().int().positive().optional(),
  workHoursStart: z.string().optional(),
  workHoursEnd: z.string().optional(),
})

workspacesRouter.patch(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  requireRole('MANAGE_WORKSPACE_SETTINGS'),
  async (req, res) => {
    if (req.params.id !== req.workspaceMember!.workspaceId) {
      throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
    }
    const updates = patchWorkspaceSchema.parse(req.body)
    const workspace = await db.workspace.update({ where: { id: req.params.id }, data: updates })
    res.json(workspace)
  },
)
