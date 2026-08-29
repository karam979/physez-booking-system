import 'dotenv/config'

// Runs before each test file is imported: repoint the app at the test DB.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set — refusing to run integration tests.')
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
// Deterministic day boundaries for availability tests regardless of dev .env.
process.env.APP_TIMEZONE = 'UTC'
// The n8n module is mocked in tests; this only feeds the internal-callback
// shared-secret check, so no webhook is ever reachable from the suite.
process.env.N8N_SHARED_SECRET = 'test-internal-secret'
process.env.N8N_WEBHOOK_BASE_URL = 'http://n8n.invalid'
// Uploads land in a throwaway directory, never the dev one.
process.env.UPLOAD_DIR = './tests/.uploads'
process.env.MAX_UPLOAD_MB = '1'
