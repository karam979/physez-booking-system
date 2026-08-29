import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Migrates the test database once before any suite runs.
    globalSetup: './tests/global-setup.js',
    // Points DATABASE_URL at the test DB before app code is imported.
    setupFiles: ['./tests/setup-env.js'],
    // Suites share one database — run files sequentially to avoid
    // truncation races.
    fileParallelism: false,
  },
})
