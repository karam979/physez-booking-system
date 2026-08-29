import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { query, closePool } from '../src/db.js'

const student = {
  name: 'Test Student',
  email: 'student@example.com',
  password: 'correct-horse-battery',
}

beforeEach(async () => {
  await query('TRUNCATE users CASCADE')
})

afterAll(async () => {
  await closePool()
})

describe('POST /api/auth/register', () => {
  it('creates a student account and sets the auth cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(student)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: student.name,
      email: student.email,
      role: 'student',
    })
    expect(res.body.id).toBeDefined()
    expect(res.body).not.toHaveProperty('password_hash')
    const cookies = res.headers['set-cookie']?.join(';') ?? ''
    expect(cookies).toContain('physez_token=')
    expect(cookies).toContain('HttpOnly')
  })

  it('rejects invalid input with the canonical error shape', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'not-an-email', password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details).toMatchObject({
      name: 'INVALID',
      email: 'INVALID',
      password: 'TOO_SHORT',
    })
  })

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await request(app).post('/api/auth/register').send(student)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...student, name: 'Someone Else' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })

  it('stores the password as a bcrypt hash, never plaintext', async () => {
    await request(app).post('/api/auth/register').send(student)
    const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', [
      student.email,
    ])
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/)
    expect(rows[0].password_hash).not.toContain(student.password)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(student)
  })

  it('logs in with correct credentials and sets the cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: student.email, password: student.password })
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(student.email)
    expect(res.headers['set-cookie'].join(';')).toContain('physez_token=')
  })

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: student.email, password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('uses the same error for an unknown email (no account enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-long' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  it('returns the current user with a valid cookie, 401 after logout', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send(student)

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({ email: student.email, role: 'student' })

    const logout = await agent.post('/api/auth/logout')
    expect(logout.status).toBe(200)

    const meAfter = await agent.get('/api/auth/me')
    expect(meAfter.status).toBe(401)
    expect(meAfter.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects an unauthenticated /me with 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})
