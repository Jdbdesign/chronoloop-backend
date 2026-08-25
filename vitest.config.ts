import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    // Integration tests hit a real remote Neon branch (network latency) plus
    // bcrypt cost-12 hashing; multi-round-trip tests can exceed the 5s default.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
