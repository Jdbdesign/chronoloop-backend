import { randomBytes } from 'node:crypto'
import { hashToken } from './jwt.js'

export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, hash: hashToken(token) }
}

// WorkspaceInvite and PasswordResetToken store expiresAt directly (unlike
// Session, which has no expiresAt column and computes a cutoff from
// createdAt + TTL) — so expiry here is a plain instant comparison.
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime()
}
