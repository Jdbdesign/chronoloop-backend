import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'

export const authRouter = Router()

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.userId } })
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.')
  }
  const { passwordHash: _passwordHash, ...safeUser } = user
  res.json(safeUser)
})
