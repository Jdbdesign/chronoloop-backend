import type { RequestHandler } from 'express'
import { PERMISSIONS, type Permission } from '../lib/permissions.js'
import { AppError } from '../lib/errors.js'

export function requireRole(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const role = req.workspaceMember!.role
    if (!PERMISSIONS[permission][role]) {
      throw new AppError(403, 'FORBIDDEN', `Your role does not permit this action.`)
    }
    next()
  }
}
