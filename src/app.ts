import 'express-async-errors'
import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { healthRouter } from './routes/health.js'
import { createAuthRouter } from './routes/auth.js'
import { workspacesRouter } from './routes/workspaces.js'
import { createInvitesRouter } from './routes/invites.js'
import { errorHandler } from './middleware/errorHandler.js'
import { env } from './config/env.js'

export function buildApp(): Express {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  )
  app.use(express.json())
  app.use(cookieParser())

  app.use('/health', healthRouter)
  app.use('/auth', createAuthRouter())
  app.use('/workspaces/:id/invites', createInvitesRouter())
  app.use('/workspaces', workspacesRouter)

  app.use(errorHandler)

  return app
}
