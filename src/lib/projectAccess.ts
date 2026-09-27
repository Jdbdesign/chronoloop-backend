// src/lib/projectAccess.ts
import { db } from '../db/client.js'
import { AppError } from './errors.js'

// ── Rollup computation ───────────────────────────────────────────────────────
// design doc §1: computed fields never stored — always derived from Task rows.
// "progress" = Math.round(tasksDone / tasksTotal * 100), 0 when tasksTotal = 0.
// "dueDays"  = Math.ceil((dueDate - now) / msPerDay), signed; null when dueDate null.
//   Negative = overdue, 0 = due today, positive = days remaining.

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function computeRollups(
  tasks: { status: string }[],
  dueDate: Date | null,
): { tasksTotal: number; tasksDone: number; progress: number; dueDays: number | null } {
  const tasksTotal = tasks.length
  const tasksDone = tasks.filter((t) => t.status === 'DONE').length
  const progress = tasksTotal === 0 ? 0 : Math.round((tasksDone / tasksTotal) * 100)
  const dueDays =
    dueDate == null ? null : Math.ceil((dueDate.getTime() - Date.now()) / MS_PER_DAY)
  return { tasksTotal, tasksDone, progress, dueDays }
}

// ── Select shapes ────────────────────────────────────────────────────────────
// List: members included (avatar rendering on cards), milestones excluded (detail only).
// Detail: members + milestones both included.
// Both include tasks for rollup computation — the tasks array is stripped from the
// final response; only the computed scalars are returned.

const TASK_STATUS_SELECT = {
  tasks: { select: { status: true }, where: { deletedAt: null } },
} as const

const MEMBERS_SELECT = {
  members: {
    select: {
      id: true,
      memberId: true,
      member: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true, firstName: true, lastName: true, avatarColor: true } },
        },
      },
    },
  },
} as const

const MILESTONES_SELECT = {
  milestones: {
    select: { id: true, label: true, done: true, dueDate: true, order: true },
    orderBy: { order: 'asc' as const },
  },
} as const

const PROJECT_BASE_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  client: true,
  category: true,
  status: true,
  priority: true,
  color: true,
  dueDate: true,
  description: true,
  createdAt: true,
} as const

export const PROJECT_LIST_SELECT = {
  ...PROJECT_BASE_SELECT,
  ...TASK_STATUS_SELECT,
  ...MEMBERS_SELECT,
} as const

export const PROJECT_DETAIL_SELECT = {
  ...PROJECT_BASE_SELECT,
  ...TASK_STATUS_SELECT,
  ...MEMBERS_SELECT,
  ...MILESTONES_SELECT,
} as const

// ── DTO shaping ──────────────────────────────────────────────────────────────
// Strips the raw tasks array and injects computed scalar rollup fields.
// Works for both list and detail shapes (both include tasks for computation).

type WithTasks<T> = T & { tasks: { status: string }[] }

export function withRollups<T extends { dueDate: Date | null }>(
  project: WithTasks<T>,
): Omit<WithTasks<T>, 'tasks'> & {
  tasksTotal: number
  tasksDone: number
  progress: number
  dueDays: number | null
} {
  const { tasks, ...rest } = project
  return { ...rest, ...computeRollups(tasks, project.dueDate) }
}

// ── Workspace guard ──────────────────────────────────────────────────────────

export async function assertWorkspaceProject(
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  })
  if (!project || project.workspaceId !== workspaceId) {
    throw new AppError(404, 'NOT_FOUND', 'Project not found.')
  }
}
