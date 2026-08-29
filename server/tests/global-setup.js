import { execSync } from 'node:child_process'
import 'dotenv/config'

// Runs once before all test files: apply migrations to the TEST database.
export default function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set — refusing to run integration tests.')
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL equals DATABASE_URL — tests must never touch dev data.')
  }
  execSync('npx node-pg-migrate up', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  })
}
