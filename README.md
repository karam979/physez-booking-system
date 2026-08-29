# PhysEZ

A web platform for private physics tutoring, built as a solo full-stack course project.
Students register, book lessons (Zoom or in-person) from real availability, upload preparation
material, take diagnostic quizzes, and follow their progress. A teacher/admin reviews and confirms
booking requests from a separate admin app. The UI supports English, Arabic, and Hebrew (RTL).

The full design (requirements, data model, API, security) lives in [DESIGN.md](DESIGN.md) —
it is the source of truth for all implementation work.

## Stack

- Two React (Vite) frontends: `apps/student-web` and `apps/admin-web`
- Node.js + Express REST API: `server/`
- PostgreSQL 16 (Docker for development), raw-SQL migrations via node-pg-migrate
- n8n handles external automation (Telegram, Google Calendar) — not part of local dev yet

## Running locally

Prerequisites: Node.js 24+, Docker Desktop.

```
# 1. Database (also creates the physez_test DB used by integration tests)
docker compose up -d

# 2. API
cd server
cp .env.example .env        # defaults match docker-compose.yml
npm install
npm run migrate:up
npm run dev                 # http://localhost:3000

# 3. Frontends (each in its own terminal)
cd apps/student-web && npm install && npm run dev    # http://localhost:5173
cd apps/admin-web   && npm install && npm run dev    # http://localhost:5174
```

Both Vite dev servers proxy `/api/*` to the Express server, so the browser always talks
same-origin — the same setup the Netlify deployment uses.

Tests (integration, against the separate `physez_test` database):

```
cd server && npm test
```

## Folder layout

```
apps/
  student-web/        booking wizard, dashboard, files, quiz, progress
  admin-web/          booking review, availability, students, lesson summaries
    src/pages/        route components
    src/components/   reusable UI
    src/context/      Auth + Language providers
    src/api/          fetch wrapper + per-resource API calls
    src/i18n/         translation keys (en / ar / he)
server/
  src/                Express app, organized by feature
    auth/  topics/  availability/  bookings/  admin/
    db.js  errors.js  validate.js
  migrations/         raw SQL migrations (node-pg-migrate)
  tests/              Vitest integration tests
docker/               Postgres first-run init (creates physez_test)
```

## Conventions

- One API error shape everywhere: `{ "error": { "code", "message", "details" } }`
- JWT auth in a Secure HttpOnly cookie; roles enforced server-side
- Prettier + ESLint: `npm run format` (root), `npm run lint` (each package)

## Copyright

© 2026 Karam Shekh Yusuf. All rights reserved.

This project, including its source code, system design, documentation, user interface, learning
content, course structure, quizzes, and future platform concepts, is the intellectual property of
Karam Shekh Yusuf.

No permission is granted to copy, modify, distribute, sublicense, sell, publish, reuse, or use this
project or any part of it for commercial, educational, or public purposes without prior written
permission from the owner.

This repository is shared for project presentation and portfolio review purposes only.
