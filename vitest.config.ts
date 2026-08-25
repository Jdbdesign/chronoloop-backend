import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    // Integration tests hit a real remote Neon branch (network latency) plus
    // bcrypt cost-12 hashing; multi-round-trip tests can exceed the 5s default.
    testTimeout: 15000,
    hookTimeout: 15000,
    // .worktrees (gitignored, used for isolated per-task branches) isn't in
    // vitest's default excludes, so a worktree left in place while `pnpm test`
    // runs from the main checkout gets its own test/ picked up as a second
    // copy of the suite — doubling load on the shared Neon test branch and
    // risking connection exhaustion. Found 2026-08-25 when a stale task-8
    // worktree caused exactly that.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
