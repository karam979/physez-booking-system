import pg from 'pg'

// Lazy singleton so tests can point DATABASE_URL at the test database
// before the pool is created.
let pool = null

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export function query(text, params) {
  return getPool().query(text, params)
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
