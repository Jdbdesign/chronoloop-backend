import { db } from '../db/client.js'
import { AppError } from './errors.js'

export function parseTaskId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    throw new AppError(400, 'INVALID_TASK_ID', 'Task id must be an integer.')
  }
  return id
}

export async function assertWorkspaceTask(
  workspaceId: string,
  taskId: number,
  opts: { includeDeleted?: boolean } = {},
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { workspaceId: true, deletedAt: true },
  })
  if (!task || task.workspaceId !== workspaceId || (!opts.includeDeleted && task.deletedAt)) {
    throw new AppError(404, 'NOT_FOUND', 'Task not found.')
  }
}

export const TASK_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  description: true,
  projectId: true,
  assigneeId: true,
  priority: true,
  status: true,
  due: true,
  tags: true,
  createdAt: true,
  deletedAt: true,
  subtasks: {
    select: { id: true, text: true, done: true, order: true },
    orderBy: { order: 'asc' as const },
  },
  comments: {
    select: {
      id: true,
      text: true,
      createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true, avatarColor: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: {
    select: { id: true, name: true, sizeBytes: true, mimeType: true, uploadedById: true, createdAt: true },
  },
} as const

export function withOverdue<T extends { status: string; due: Date | null }>(task: T) {
  return { ...task, overdue: task.status !== 'DONE' && task.due != null && task.due < new Date() }
}
