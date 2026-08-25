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
import { sendMail as realSendMail, type Mail } from './lib/mailer.js'

export interface BuildAppOptions {
  // Lets tests inject TestMailer instead of the real stub — see
  // test/helpers/testApp.ts. Routing this through buildApp() (rather than
  // tests hand-assembling their own express() instance) means every test
  // that needs a custom mailer still gets the real middleware stack —
  // 'express-async-errors' included — instead of each test file having to
  // remember to wire it up itself.
  mailer?: { sendMail: (mail: Mail) => Promise<void> }
}

export function buildApp(options: BuildAppOptions = {}): Express {
  const mailer = options.mailer ?? { sendMail: realSendMail }
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
  app.use('/auth', createAuthRouter(mailer))
  app.use('/workspaces/:id/invites', createInvitesRouter(mailer))
  app.use('/workspaces', workspacesRouter)

  app.use(errorHandler)

  return app
}
