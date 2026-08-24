import jwt from 'jsonwebtoken'
import { randomBytes, createHash } from 'node:crypto'
import { env } from '../config/env.js'

const ACCESS_TOKEN_TTL = '15m'

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload
  return { userId: payload.userId as string }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function signRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, hash: hashToken(token) }
}
