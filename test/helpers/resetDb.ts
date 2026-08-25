import { rawPrisma, withDbReconnectRetry } from '../../src/db/client.js'

// Order matters: children before parents (FK constraints).
const TABLES = [
  'Attachment',
  'Comment',
  'Subtask',
  'Task',
  'WorkspaceInvite',
  'PasswordResetToken',
  'LoginAttempt',
  'Session',
  'WorkspaceMember',
  'Workspace',
  'User',
]

// Independent of (and shorter than) vitest's hookTimeout — this is what actually stops
// an orphaned retry loop from continuing to run if a cold-start recovery takes unusually
// long, rather than relying on vitest's hookTimeout, which does not cancel the underlying
// work (see vitest.config.ts's testTimeout/hookTimeout comment for the incident this
// closes). Set below hookTimeout so this is the one that fires and rejects cleanly, with
// margin for the rejection to propagate before vitest's own timeout would also trip.
const RESET_DB_ABORT_MS = 80_000

export async function resetDb(): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESET_DB_ABORT_MS)
  try {
    for (const table of TABLES) {
      await withDbReconnectRetry(
        () => rawPrisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`),
        controller.signal,
      )
    }
  } finally {
    clearTimeout(timer)
  }
}
