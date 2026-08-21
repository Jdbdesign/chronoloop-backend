import { db } from '../../src/db/client.js'

// Order matters: children before parents (FK constraints).
const TABLES = [
  'WorkspaceInvite',
  'PasswordResetToken',
  'LoginAttempt',
  'Session',
  'WorkspaceMember',
  'Workspace',
  'User',
]

export async function resetDb(): Promise<void> {
  for (const table of TABLES) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
  }
}
