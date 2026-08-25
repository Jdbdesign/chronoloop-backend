import type { RequestHandler } from 'express'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'
import type { Role } from '../lib/permissions.js'

declare global {
  namespace Express {
    interface Request {
      workspaceMember?: { id: string; workspaceId: string; role: Role }
    }
  }
}

export const requireWorkspaceMember: RequestHandler = async (req, _res, next) => {
  const workspaceId = req.header('X-Workspace-Id')
  if (!workspaceId) {
    throw new AppError(400, 'MISSING_WORKSPACE_ID', 'X-Workspace-Id header is required.')
  }
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.userId! } },
  })
  if (!member) {
    throw new AppError(403, 'NOT_A_MEMBER', 'You are not a member of this workspace.')
  }
  req.workspaceMember = { id: member.id, workspaceId, role: member.role as Role }
  next()
}
