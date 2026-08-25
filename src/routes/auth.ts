import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, REFRESH_TOKEN_TTL_MS } from '../lib/jwt.js'
import { env } from '../config/env.js'

export const authRouter = Router()

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.userId } })
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found.')
  }
  const { passwordHash: _passwordHash, ...safeUser } = user
  res.json(safeUser)
})

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  workspaceName: z.string().min(1),
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  let suffix = 1
  while (await db.workspace.findUnique({ where: { slug } })) {
    suffix += 1
    slug = `${base}-${suffix}`
  }
  return slug
}

function isUniqueConstraintViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes(field)
  )
}

authRouter.post('/signup-workspace', async (req, res) => {
  const input = signupSchema.parse(req.body)

  // Fast-path rejection for the common case. This alone is race-prone (TOCTOU) — the
  // tx.user.create's `email` unique constraint below is the real, authoritative guard.
  const existing = await db.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.')
  }

  const slug = await uniqueSlug(input.workspaceName)
  const passwordHash = await hashPassword(input.password)

  let user: Prisma.UserGetPayload<object>
  let workspace: Prisma.WorkspaceGetPayload<object>
  try {
    ;({ user, workspace } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName },
      })
      const workspace = await tx.workspace.create({ data: { name: input.workspaceName, slug } })
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' } })
      return { user, workspace }
    }))
  } catch (err) {
    if (isUniqueConstraintViolation(err, 'email')) {
      throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.')
    }
    // A `slug` collision here means two concurrent signups picked the same derived slug —
    // an unrelated, separate race from the email one. Not silently mislabeled as an email
    // conflict; surfaces as a 500 (extremely rare, no dedicated test, flagged for Task 8+
    // if it proves to matter in practice).
    throw err
  }

  const accessToken = signAccessToken(user.id)
  const { token: refreshToken, hash: refreshTokenHash } = signRefreshToken()
  await db.session.create({
    data: { userId: user.id, refreshTokenHash, userAgent: req.headers['user-agent'], ipAddress: req.ip },
  })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: env.COOKIE_DOMAIN,
    maxAge: REFRESH_TOKEN_TTL_MS,
  })

  const { passwordHash: _passwordHash, ...safeUser } = user
  res.status(201).json({ user: safeUser, workspace, accessToken })
})
