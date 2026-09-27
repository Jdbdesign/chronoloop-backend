// src/routes/projects.ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireWorkspaceMember } from '../middleware/requireWorkspaceMember.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'
import {
  PROJECT_LIST_SELECT,
  PROJECT_DETAIL_SELECT,
  withRollups,
  assertWorkspaceProject,
} from '../lib/projectAccess.js'

// ── /workspaces/:id/projects ─────────────────────────────────────────────────
// Mounted at /workspaces/:id/projects in app.ts (mergeParams: true so :id is visible).

export const projectsByWorkspaceRouter = Router({ mergeParams: true })

// GET /workspaces/:id/projects
projectsByWorkspaceRouter.get('/', requireAuth, requireWorkspaceMember, async (req, res) => {
  if (req.params.id !== req.workspaceMember!.workspaceId) {
    throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
  }
  const projects = await db.project.findMany({
    where: { workspaceId: req.params.id },
    select: PROJECT_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  res.json(projects.map(withRollups))
})

// ── Shared zod schemas ───────────────────────────────────────────────────────

const milestoneInputSchema = z.object({
  label: z.string().min(1),
  done: z.boolean().optional().default(false),
  dueDate: z.coerce.date().nullable().optional(),
})

const createProjectSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  client: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'ON_HOLD']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  description: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional().default([]),
  milestones: z.array(milestoneInputSchema).optional().default([]),
})

const patchProjectSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  client: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'ON_HOLD']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  description: z.string().nullable().optional(),
  // memberIds and milestones are NOT in this schema — seed-only (plan Decision 1).
  // Zod strips unknown keys by default, so sending them is silently ignored.
})

// ── Helper: validate memberIds belong to the workspace ───────────────────────

async function assertValidMembers(workspaceId: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return
  const found = await db.workspaceMember.findMany({
    where: { id: { in: memberIds }, workspaceId },
    select: { id: true },
  })
  if (found.length !== memberIds.length) {
    throw new AppError(400, 'INVALID_MEMBER', 'One or more memberIds are not members of this workspace.')
  }
}

// POST /workspaces/:id/projects
projectsByWorkspaceRouter.post(
  '/',
  requireAuth,
  requireWorkspaceMember,
  requireRole('MANAGE_PROJECTS'),
  async (req, res) => {
    if (req.params.id !== req.workspaceMember!.workspaceId) {
      throw new AppError(403, 'FORBIDDEN', 'X-Workspace-Id does not match the requested workspace.')
    }
    const input = createProjectSchema.parse(req.body)
    await assertValidMembers(req.params.id, input.memberIds)

    const created = await db.project.create({
      data: {
        workspaceId: req.params.id,
        name: input.name,
        color: input.color,
        client: input.client ?? null,
        category: input.category ?? null,
        status: input.status ?? 'ACTIVE',
        priority: input.priority ?? 'MEDIUM',
        dueDate: input.dueDate ?? null,
        description: input.description ?? null,
        members: { create: input.memberIds.map((memberId) => ({ memberId })) },
        milestones: {
          create: input.milestones.map((m, i) => ({
            label: m.label,
            done: m.done,
            dueDate: m.dueDate ?? null,
            order: i,
          })),
        },
      },
      select: PROJECT_DETAIL_SELECT,
    })

    res.status(201).json(withRollups(created))
  },
)

// ── /projects/:id ─────────────────────────────────────────────────────────────
// Mounted at /projects in app.ts.

export const projectsRouter = Router()

// GET /projects/:id
projectsRouter.get('/:id', requireAuth, requireWorkspaceMember, async (req, res) => {
  await assertWorkspaceProject(req.workspaceMember!.workspaceId, req.params.id)
  const project = await db.project.findUniqueOrThrow({
    where: { id: req.params.id },
    select: PROJECT_DETAIL_SELECT,
  })
  res.json(withRollups(project))
})

// PATCH /projects/:id
projectsRouter.patch(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  requireRole('MANAGE_PROJECTS'),
  async (req, res) => {
    await assertWorkspaceProject(req.workspaceMember!.workspaceId, req.params.id)
    const input = patchProjectSchema.parse(req.body)
    const updated = await db.project.update({
      where: { id: req.params.id },
      data: input,
      select: PROJECT_DETAIL_SELECT,
    })
    res.json(withRollups(updated))
  },
)

// DELETE /projects/:id
// Hard delete — no soft-delete/undo pattern for projects (no deletedAt column).
// Cascades to ProjectMember and Milestone rows via schema relations.
// Task.projectId is SET NULL via the onDelete: SetNull migration (Task 5 Step 1).
projectsRouter.delete(
  '/:id',
  requireAuth,
  requireWorkspaceMember,
  requireRole('MANAGE_PROJECTS'),
  async (req, res) => {
    await assertWorkspaceProject(req.workspaceMember!.workspaceId, req.params.id)
    await db.project.delete({ where: { id: req.params.id } })
    res.status(204).send()
  },
)
