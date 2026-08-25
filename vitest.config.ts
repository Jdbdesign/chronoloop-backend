import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    // Must comfortably exceed src/db/client.ts's own retry budget (6 retries,
    // exponential backoff 1s+2s+4s+8s+16s+32s = 63s worst case) plus real query
    // time once reconnected. A shorter timeout doesn't make a cold-start fail
    // faster — it makes vitest kill the hook mid-retry while the retry loop
    // keeps running unsupervised in the background, where a write (e.g.
    // resetDb's TRUNCATE) can land after a later test has already started,
    // corrupting that test's data. Found 2026-08-25: exactly this — a killed
    // `beforeEach(resetDb)` hook immediately followed by an unrelated FK
    // violation in the next test — during a full-suite run. Reproduced
    // deterministically with fake timers: at the old 15s timeout, the retry
    // loop had already fired 5 times and went on to fire 7 times total, 2 more
    // calls spanning 48 more seconds of real time, entirely unsupervised.
    //
    // 90s: 63s worst-case backoff + real margin, not a value cut close to the
    // wire — the same lesson already learned once for the *production* retry
    // budget itself (an earlier 15s production budget was replaced because it
    // "recovered ... but only on its last retry attempt — not enough margin
    // for comfort", per the retry budget's own history). Shrinking the retry
    // budget to fit inside a short test timeout was considered and rejected:
    // that budget is empirically tuned against a real production incident
    // (see src/db/client.ts), and test infrastructure should accommodate real
    // Neon cold-start behavior rather than force production reliability to
    // bend to test convenience. See also test/helpers/resetDb.ts, which adds
    // its own independent, cancellable timeout as defense-in-depth for the
    // rare case where even this margin isn't enough.
    testTimeout: 90000,
    hookTimeout: 90000,
    // .worktrees (gitignored, used for isolated per-task branches) isn't in
    // vitest's default excludes, so a worktree left in place while `pnpm test`
    // runs from the main checkout gets its own test/ picked up as a second
    // copy of the suite — doubling load on the shared Neon test branch and
    // risking connection exhaustion. Found 2026-08-25 when a stale task-8
    // worktree caused exactly that.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
