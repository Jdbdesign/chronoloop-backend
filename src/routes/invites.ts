import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireWorkspaceMember } from '../middleware/requireWorkspaceMember.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { generateToken, INVITE_TOKEN_TTL_MS } from '../lib/tokens.js'
import { sendMail as realSendMail, type Mail } from '../lib/mailer.js'
import { env } from '../config/env.js'

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
})

export function createInvitesRouter(mailer: { sendMail: (mail: Mail) => Promise<void> } = { sendMail: realSendMail }) {
  const invitesRouter = Router({ mergeParams: true })

  invitesRouter.post(
    '/',
    requireAuth,
    requireWorkspaceMember,
    requireRole('INVITE_MEMBERS'),
    async (req, res) => {
      const input = createInviteSchema.parse(req.body)
      const { token, hash } = generateToken()

      // Deliberately no dedup/refresh against an existing pending invite for the same
      // email (see test/integration/invites.test.ts for the rationale) — accept-invite's
      // existing-account check already makes this safe regardless of how many pending
      // invites exist for an email.
      const invite = await db.workspaceInvite.create({
        data: {
          workspaceId: req.workspaceMember!.workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: hash,
          invitedById: req.userId!,
          expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
        },
      })

      await mailer.sendMail({
        to: input.email,
        subject: "You've been invited to join a Chronoloop workspace",
        body: `Accept your invite: ${env.FRONTEND_URL}/accept-invite?token=${token}`,
      })

      const { tokenHash: _tokenHash, ...safeInvite } = invite
      res.status(201).json(safeInvite)
    },
  )

  return invitesRouter
}
