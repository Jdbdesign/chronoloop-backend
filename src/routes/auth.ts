import { Router, type Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth.js'
import { db } from '../db/client.js'
import { AppError } from '../lib/errors.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, hashToken, REFRESH_TOKEN_TTL_MS } from '../lib/jwt.js'
import { generateToken, RESET_TOKEN_TTL_MS } from '../lib/tokens.js'
import type { Mail } from '../lib/mailer.js'
import { sendMail as realSendMail } from '../lib/mailer.js'
import { env } from '../config/env.js'

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: env.COOKIE_DOMAIN,
    maxAge: REFRESH_TOKEN_TTL_MS,
  })
}

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

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

// A fixed, cost-12 hash of a string nobody will ever type. verifyPassword always runs
// against *some* bcrypt hash — real or this one — so an unknown email takes the same
// bcrypt.compare time as a known email with a wrong password. Without this, a request
// timing difference (DB lookup only, vs. DB lookup + ~cost-12 bcrypt compare) would let
// an attacker distinguish "no such account" from "wrong password" without ever seeing
// the response body, defeating the point of the identical-error-body enumeration guard
// below. Threat model note: this app has no rate-limiting yet (flagged in this same
// task's login route below), so an attacker can already send unlimited attempts — closing
// the timing side-channel too costs one extra bcrypt call and has no downside, so it's
// included rather than judged not worth it.
const DUMMY_PASSWORD_HASH = '$2b$12$FDazVLFxZhWx7u3J7pTkFe0TuoUojoq0nzAQ3154IP/xcjt1MCqm2'

const forgotPasswordSchema = z.object({ email: z.string().email() })
const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) })

export function createAuthRouter(mailer: { sendMail: (mail: Mail) => Promise<void> } = { sendMail: realSendMail }) {
  const authRouter = Router()

  authRouter.get('/me', requireAuth, async (req, res) => {
    const user = await db.user.findUnique({ where: { id: req.userId } })
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.')
    }
    const { passwordHash: _passwordHash, ...safeUser } = user
    res.json(safeUser)
  })

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

    setRefreshCookie(res, refreshToken)

    const { passwordHash: _passwordHash, ...safeUser } = user
    res.status(201).json({ user: safeUser, workspace, accessToken })
  })

  authRouter.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body)
    const user = await db.user.findUnique({ where: { email: input.email } })

    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)

    await db.loginAttempt.create({
      data: {
        userId: user?.id,
        emailTried: input.email,
        success: user != null && valid,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    })

    if (!user || !valid) {
      // Identical status, code, and message whether the email doesn't exist or the
      // password was wrong — combined with the constant-time compare above, the two
      // cases are indistinguishable from outside the process.
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    }

    const accessToken = signAccessToken(user.id)
    const { token: refreshToken, hash: refreshTokenHash } = signRefreshToken()
    await db.session.create({
      data: { userId: user.id, refreshTokenHash, userAgent: req.headers['user-agent'], ipAddress: req.ip },
    })

    setRefreshCookie(res, refreshToken)

    const { passwordHash: _passwordHash, ...safeUser } = user
    res.json({ user: safeUser, accessToken })
  })

  // No rate-limiting or lockout reads LoginAttempt yet — every attempt (success and
  // failure) is genuinely recorded as an audit trail, but nothing throttles or locks an
  // account after repeated failures. Named gap, not an oversight: the design doc commits
  // to the audit log, not to brute-force protection, and rate-limit policy isn't specified
  // anywhere in it.

  authRouter.post('/refresh', async (req, res) => {
    const rawToken = req.cookies?.refreshToken as string | undefined
    if (!rawToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'No refresh token provided.')
    }

    const session = await db.session.findUnique({ where: { refreshTokenHash: hashToken(rawToken) } })
    if (!session) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or has been revoked.')
    }

    if (session.revokedAt) {
      // Reuse of a token that was already rotated (or already logged-out) away is a
      // theft signal, not an ordinary auth failure: a legitimate client only ever holds
      // the *current* cookie, so presenting an old one means either the client is stale
      // (harmless — resolved by the user logging in again) or a stolen copy of an old
      // token is being replayed by someone else. There's no way to tell those apart from
      // here, so the safe response is to treat it as theft: revoke every active session
      // for this user, forcing a fresh login everywhere. The single request still just
      // gets a generic 401, so this stays invisible to whoever is replaying the token.
      await db.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or has been revoked.')
    }

    const revokeCutoff = new Date(session.createdAt.getTime() + REFRESH_TOKEN_TTL_MS)
    if (revokeCutoff < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired.')
    }

    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })

    const { token: newRefreshToken, hash: newHash } = signRefreshToken()
    await db.session.create({
      data: { userId: session.userId, refreshTokenHash: newHash, userAgent: req.headers['user-agent'], ipAddress: req.ip },
    })

    const accessToken = signAccessToken(session.userId)
    setRefreshCookie(res, newRefreshToken)
    res.json({ accessToken })
  })

  authRouter.post('/logout', async (req, res) => {
    const rawToken = req.cookies?.refreshToken as string | undefined
    if (rawToken) {
      await db.session.updateMany({
        where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    res.clearCookie('refreshToken', { domain: env.COOKIE_DOMAIN })
    res.status(204).send()
  })

  authRouter.post('/forgot-password', async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body)
    const user = await db.user.findUnique({ where: { email } })

    if (user) {
      const { token, hash } = generateToken()
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      })
      await mailer.sendMail({
        to: user.email,
        subject: 'Reset your Chronoloop password',
        body: `Reset your password: ${env.FRONTEND_URL}/reset-password?token=${token}`,
      })
    }

    // Identical response whether or not the email exists — no enumeration.
    res.json({ message: 'If an account exists for that email, a reset link has been sent.' })
  })

  authRouter.post('/reset-password', async (req, res) => {
    const input = resetPasswordSchema.parse(req.body)
    const tokenHash = hashToken(input.token)
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })

    const isValid = record && !record.usedAt && record.expiresAt > new Date()
    if (!isValid) {
      // Doesn't distinguish "never existed" vs "expired" vs "already used" — all look identical to the caller.
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.')
    }

    const newPasswordHash = await hashPassword(input.newPassword)
    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash: newPasswordHash } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // A password reset should force re-login everywhere, same reasoning as the
      // refresh-token-reuse theft cascade above: if the password was compromised,
      // every existing refresh token should stop working, not just get a new password
      // to sit alongside still-valid old sessions. Addition beyond the design doc's
      // literal text — see plan Decision list / Task 9 note.
      db.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])

    res.json({ message: 'Password has been reset.' })
  })

  return authRouter
}

export const authRouter = createAuthRouter()
