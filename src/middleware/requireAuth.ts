import type { RequestHandler } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'
import { AppError } from '../lib/errors.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header.')
  }
  try {
    const { userId } = verifyAccessToken(header.slice('Bearer '.length))
    req.userId = userId
    next()
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired access token.')
  }
}
