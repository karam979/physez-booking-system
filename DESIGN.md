# PhysEZ — Full-Stack Design Document

Multilingual Physics Tutoring, Booking and Student Management Platform.
Pre-development design plan. Version 1.0 · August 2026 · Karam Shekh Yusuf (208252817).

> This markdown file is the text copy of `PhysEZ_Design_Document.pdf`.
> If the two ever disagree, the PDF is the submitted document; this file is the build reference.

---

## 1. Overview, Goals & Scope

**Summary.** PhysEZ is a multilingual web platform for private physics tutoring. Students create
accounts, select a lesson type (Zoom or in-person), duration, language, physics topic, date and
available time, submit a booking request, upload supporting material, complete an optional diagnostic
quiz, and later view lesson summaries and progress. A teacher/admin reviews requests from a separate
admin interface. Confirmed lessons are synchronized to Google Calendar, availability is updated, and
n8n handles automation workflows (Telegram notifications, scheduled reminders).

**Problem.** Private tutoring is scattered across messaging, calendars, files and manual tracking —
causing double-booking, lost material, inconsistent follow-up and repeated admin work. PhysEZ
centralizes the workflow while keeping Google Calendar and Telegram synchronized.

**Goals**
- Students register, log in, and manage their own tutoring activity.
- Students request Zoom or in-person lessons by duration, language, topic, date and available time.
- Teacher/admin dashboard for reviewing, confirming, rejecting, cancelling and rescheduling requests.
- Prevent double-booking at the backend; public availability stays consistent with confirmed lessons.
- Self-hosted n8n for automation and external integrations (Telegram, Google Calendar).
- Students upload preparation material; optional topic-based diagnostic quiz.
- Teacher publishes post-lesson summaries, homework and feedback; student progress over time.
- Arabic, Hebrew and English, including RTL layout for Arabic and Hebrew.
- Frontends on Netlify; API, database, n8n and files on a VPS.

**Non-goals for v1:** online payments/invoices; multi-teacher marketplace; native mobile apps;
built-in video calling (Zoom is a lesson type/link); AI tutoring or non-deterministic grading;
recurring packages, waiting lists, advanced financial analytics.

**Success metrics**

| ID | Success condition |
|----|-------------------|
| SM1 | A new student can register, choose an available slot and submit a valid booking without admin help. |
| SM2 | Admin confirms a pending booking → it becomes unavailable to others and a calendar event is created. |
| SM3 | Cancelling a confirmed booking removes/updates the calendar event and reopens the time when appropriate. |
| SM4 | Two overlapping confirmed bookings cannot be created, even if requests arrive close together. |
| SM5 | A student can upload a supported file, complete a quiz, and later view a lesson summary from the dashboard. |
| SM6 | The student flow works in Arabic, Hebrew and English with correct RTL/LTR direction. |

---

## 2. Requirements

### Functional requirements

| ID | Requirement |
|----|-------------|
| FR1 | A visitor can register a student account with name, email and password. |
| FR2 | A registered user can log in and log out; the API exposes the current authenticated user. |
| FR3 | Student and admin roles; role permissions enforced on the backend. |
| FR4 | A student can view available lesson times for a selected date. |
| FR5 | A student can create a booking request with Zoom/in-person type, duration, language, topic, date/time and notes. |
| FR6 | A new booking is stored with status PENDING and triggers an n8n workflow that sends a Telegram notification to the admin. |
| FR7 | The admin can list and filter bookings by status, date and student. |
| FR8 | The admin can confirm or reject a pending booking. |
| FR9 | Before confirmation, the backend re-checks time overlap; a conflicting confirmed booking blocks confirmation. |
| FR10 | Confirmation triggers n8n to create a Google Calendar event; the returned event identifier/sync status is stored. |
| FR11 | A confirmed booking is removed from student-visible availability. |
| FR12 | A student can cancel an allowed booking; cancellation updates the database and triggers calendar cleanup. |
| FR13 | A student can request rescheduling; the admin can accept or reject the new time. |
| FR14 | A student dashboard shows pending, confirmed, completed and cancelled lesson history. |
| FR15 | A student can select a physics level/topic and upload PDF/JPG/PNG files up to the configured size limit. |
| FR16 | The teacher can view files belonging to a booking; students can only access their own files. |
| FR17 | A student can take a diagnostic quiz for a selected topic and receive an automatically calculated score. |
| FR18 | The teacher can create a post-lesson summary with topics covered, homework, feedback and attendance. |
| FR19 | The student can view lesson summaries and a simple progress history (completed lessons + quiz scores). |
| FR20 | Interfaces support English, Arabic and Hebrew and switch between LTR and RTL appropriately. |
| FR21 | The admin can create and remove availability slots. |
| FR22 | n8n can send scheduled Telegram reminders to the teacher for upcoming confirmed lessons without exposing its editor publicly. |

### Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR1 | Performance | 95% of non-file API requests respond in under 500 ms (excluding third-party latency). |
| NFR2 | Security | Passwords stored only as strong hashes (bcrypt or argon2id); all protected routes require valid auth + server-side authorization. |
| NFR3 | Transport | HTTPS in production; tokens/secrets never in URLs or committed to Git. |
| NFR4 | Availability | 99% monthly API availability target; failed external integrations do not corrupt booking state. |
| NFR5 | Accessibility | Labelled forms, keyboard navigation for core flows, colour never the only status cue. |
| NFR6 | Localization | Arabic/Hebrew render RTL; English LTR; dates/times shown in the configured locale/time zone. |
| NFR7 | File safety | Uploads limited to approved MIME types and a max size (default 10 MB); served only after authorization. |
| NFR8 | Data integrity | The database prevents overlapping confirmed lesson times; valid foreign-key relationships. |
| NFR9 | Recovery | Scheduled backups for PostgreSQL and uploads; documented restore procedure before final deployment. |
| NFR10 | Scalability | ≥1,000 students and 50,000 booking/history rows without schema redesign; pagination where needed. |

---

## 3. System Architecture & Stack

Two React applications deployed independently on Netlify. Both call the same Express REST API on the
VPS. **Express owns authentication, business rules and database state. n8n is the
automation/integration layer, not the primary backend.**

```
Student Web (React+Vite, Netlify)     Admin Web (React+Vite, Netlify)
        \                                   /
         HTTPS · JSON · /api proxy
                    |
            Nginx (VPS edge, TLS)
                    |
        REST API — Node.js + Express (VPS)
        auth · validation · business rules
         |            |                \
        SQL         files       authenticated internal call
         |            |                  \
    PostgreSQL   VPS file storage    n8n automation server (same VPS)
    (private)    (PDF/JPG/PNG)        |          |            |
                              Google Calendar  Telegram   Scheduled
                                   API          Bot API   reminders
```

### Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| Student React SPA | Booking flow, account/dashboard, file upload, diagnostic quiz, lesson history, multilingual UI. |
| Admin React SPA | Booking review, availability management, student context, lesson summaries, quiz results, operational status. |
| Express REST API | Business logic, validation, auth/authorization, booking state transitions, DB access, secure file endpoints. |
| PostgreSQL | System of record: users, bookings, availability, lessons, quiz data, file metadata. |
| n8n | External integrations + scheduled automation: Telegram, Google Calendar, reminders, retries. |
| VPS file storage | Uploaded PDFs/images (v1); PostgreSQL stores metadata/paths, not binaries. |
| Nginx | Terminates/forwards HTTPS to Express and n8n on private internal ports. |
| Netlify | Hosts and deploys the two Vite frontends. |

### Stack and rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Frontends | React + Vite | Component UI; simple dev/build toolchain. |
| Routing | React Router | Public / student / admin route separation. |
| Backend | Node.js + Express | REST + JS across the stack; middleware fits auth/validation/roles. |
| Database | PostgreSQL | Strong keys, constraints, ranges, transactions for booking integrity. |
| Auth | JWT in Secure HttpOnly cookie | Token out of JS-accessible storage; middleware enforces access. |
| Automation | Self-hosted n8n | Isolates integrations; scheduled workflows. |
| Calendar | Google Calendar API via n8n | Confirmed lessons become events; update/delete keeps sync. |
| Notifications | Telegram Bot API via n8n | Immediate admin alerts without Telegram logic in the core. |
| Files | VPS filesystem (v1) | Sufficient for course scope; S3-compatible later. |
| Frontend hosting | Netlify | Vite deploys, public URLs, Git-based delivery. |
| VPS edge | Nginx + HTTPS tooling | Only HTTPS exposed; Express/Postgres/n8n stay internal. |

**Trade-off (n8n vs direct calls):** calling Google/Telegram directly from Express would remove one
component but mix integration code with core logic. n8n adds operational complexity but isolates
external workflows and makes scheduled reminders maintainable.

### Booking confirmation flow

1. Student selects lesson details
2. Express validates and checks the slot
3. Booking saved as PENDING
4. n8n sends the Telegram alert
5. Admin reviews the request
6. Express re-checks conflict, confirms
7. n8n creates the Calendar event
8. Event ID saved, time blocked

**Failure handling:** if calendar creation fails after confirmation, the booking stays blocked (no
double-booking), `calendar_sync_status = 'failed'`, the admin sees a retry state, and n8n can retry.

---

## 4. Data Model

### Core entities

| Entity | Fields, keys, constraints |
|--------|---------------------------|
| users | id UUID PK; name VARCHAR(120) NOT NULL; email VARCHAR(255) UNIQUE NOT NULL; password_hash VARCHAR(255) NOT NULL; role VARCHAR(20) CHECK (student/admin); preferred_language VARCHAR(5); created_at TIMESTAMPTZ. |
| topics | id UUID PK; name_en/name_ar/name_he VARCHAR(120); education_level VARCHAR(80); active BOOLEAN. |
| availability_slots | id UUID PK; start_at TIMESTAMPTZ; end_at TIMESTAMPTZ; is_active BOOLEAN; created_at TIMESTAMPTZ; CHECK (end_at > start_at); index on start_at/end_at. |
| bookings | id UUID PK; student_id UUID FK→users; topic_id UUID FK→topics; lesson_type VARCHAR(20); language VARCHAR(5); start_at/end_at TIMESTAMPTZ NOT NULL; status VARCHAR(30) CHECK; notes TEXT; calendar_event_id VARCHAR(255); calendar_sync_status VARCHAR(30); created_at TIMESTAMPTZ. Indexes: student_id, status, start_at, topic_id. Exclusion constraint prevents overlapping confirmed lessons. |
| lessons | id UUID PK; booking_id UUID UNIQUE FK→bookings; attendance VARCHAR(20); summary TEXT; homework TEXT; feedback TEXT; created_at TIMESTAMPTZ. One lesson per booking. |
| files | id UUID PK; booking_id UUID FK→bookings; student_id UUID FK→users; lesson_id UUID NULL FK→lessons (set when the teacher attaches material to a summary); original_name/stored_name VARCHAR(255); file_path TEXT; mime_type VARCHAR(100); size_bytes BIGINT; created_at TIMESTAMPTZ. Indexes: booking_id, student_id. Metadata only — bytes stay on disk. |
| diagnostic_quizzes | id UUID PK; topic_id UUID FK→topics; title VARCHAR(200); active BOOLEAN; created_at TIMESTAMPTZ. Multiple versions per topic; only active offered. |
| quiz_questions | id UUID PK; quiz_id UUID FK→diagnostic_quizzes; question_text TEXT; options JSONB; correct_answer VARCHAR(255); position INTEGER. **correct_answer is never serialized to the student client.** |
| quiz_attempts | id UUID PK; quiz_id UUID FK→diagnostic_quizzes; student_id UUID FK→users; booking_id UUID NULL FK→bookings; score NUMERIC(5,2); submitted_at TIMESTAMPTZ. Indexes: student_id, quiz_id. |
| reschedule_requests | id UUID PK; booking_id UUID FK→bookings; requested_start_at TIMESTAMPTZ; requested_end_at TIMESTAMPTZ; status VARCHAR(20); created_at TIMESTAMPTZ. |

### Key schema decisions

- **Identifiers:** UUIDs for externally visible records.
- **Time:** store UTC (TIMESTAMPTZ); display in configured time zone.
- **Booking interval:** start_at/end_at NOT NULL, CHECK (end_at > start_at); the API derives end_at from start_at + durationMinutes.
- **Booking status values:** `pending`, `confirmed`, `rejected`, `cancelled`, `completed`.
- **Rescheduling:** via the `reschedule_requests` table. The original confirmed booking stays confirmed and keeps its slot until the admin approves the new time.
- **Calendar sync:** store calendar_event_id + calendar_sync_status so failures are visible/retryable.
- **Files:** bytes on storage; Postgres keeps path, original name, MIME, size, ownership.
- **Referential integrity:** FKs plus NOT NULL / UNIQUE / CHECK constraints.

### Conflict prevention (the critical invariant)

```sql
-- Single-teacher v1 deployment
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_confirmed_bookings
  EXCLUDE USING gist (
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'confirmed');
```

The API re-check is a fast fail; the constraint is the guarantee under concurrency. btree_gist is
included so the constraint can later be scoped per teacher (`teacher_id WITH =`).

---

## 5. API Design

One error shape everywhere:

```json
{ "error": { "code": "BOOKING_CONFLICT", "message": "The selected lesson time is no longer available.", "details": {} } }
```

Status codes: 200, 201, 400 invalid input, 401 unauthenticated, 403 forbidden, 404, 409 conflict,
413 upload too large, 422 semantically invalid, 500. Frontends translate the stable `code`, not the message.

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | /api/auth/register | Create student account | No |
| POST | /api/auth/login | Authenticate, set secure cookie | No |
| POST | /api/auth/logout | Clear authentication | Yes |
| GET | /api/auth/me | Current user and role | Yes |
| GET | /api/topics | List active topics/levels | No |
| GET | /api/availability?date=YYYY-MM-DD | List selectable lesson slots | No |
| POST | /api/bookings | Create pending booking | Student |
| GET | /api/bookings/me | Current student's bookings | Student |
| GET | /api/bookings/:id | Read owned booking details | Owner/Admin |
| PATCH | /api/bookings/:id/cancel | Cancel an allowed booking | Owner/Admin |
| POST | /api/bookings/:id/reschedule | Request a new time | Student |
| POST | /api/bookings/:id/files | Upload preparation file | Owner |
| GET | /api/bookings/:id/files | List file metadata for booking | Owner/Admin |
| GET | /api/files/:fileId | Download one authorized file | Owner/Admin |
| DELETE | /api/files/:fileId | Remove an uploaded file pre-lesson | Owner/Admin |
| GET | /api/quizzes/topic/:topicId | Active quiz WITHOUT answers | Student |
| POST | /api/quizzes/:id/attempts | Submit answers, score server-side | Student |
| GET | /api/progress/me | Lesson/quiz progress summary | Student |
| GET | /api/admin/bookings | Filter/list all bookings | Admin |
| PATCH | /api/admin/bookings/:id/confirm | Confirm after conflict re-check | Admin |
| PATCH | /api/admin/bookings/:id/reject | Reject pending booking | Admin |
| PATCH | /api/admin/bookings/:id/reschedule | Approve/change booked time | Admin |
| POST | /api/admin/availability | Create availability slots | Admin |
| DELETE | /api/admin/availability/:id | Remove an unused slot | Admin |
| POST | /api/admin/bookings/:id/lesson | Create/update lesson summary | Admin |
| POST | /api/internal/n8n/calendar-result | Authenticated integration result | Internal (shared secret) |
| GET | /api/internal/reminders/tomorrow | Tomorrow's confirmed lessons for the scheduled reminder | Internal (shared secret) |

Example — `POST /api/bookings`:

```json
{ "lessonType": "zoom", "durationMinutes": 90, "language": "ar",
  "topicId": "<uuid>", "startAt": "2026-08-18T14:00:00Z",
  "notes": "Exam preparation - Kirchhoff laws" }
```

→ `201 Created`
```json
{ "id": "<uuid>", "status": "pending", "lessonType": "zoom",
  "durationMinutes": 90, "startAt": "2026-08-18T14:00:00Z" }
```

---

## 6. Frontend Design

### Student web routes

| Route | Page | Auth |
|-------|------|------|
| / | Landing / lesson information | No |
| /login | Student login | No |
| /register | Student registration | No |
| /book | Booking wizard (type, duration, language, topic, date/time, notes) | Student |
| /dashboard | Upcoming and historical lessons | Student |
| /bookings/:id | Details, cancel/reschedule, files | Owner |
| /bookings/:id/diagnostic | Diagnostic quiz | Owner |
| /progress | Summaries and progress history | Student |
| * | Not found | — |

### Admin web routes

| Route | Page | Auth |
|-------|------|------|
| /login | Admin login | No |
| / | Dashboard: today / pending counts | Admin |
| /bookings | List + filters | Admin |
| /bookings/:id | Review: files, quiz, confirm/reject/reschedule | Admin |
| /students | Student list + lesson history | Admin |
| /availability | Create/remove slots | Admin |
| /lessons/:bookingId | Lesson summary editor | Admin |
| /automation | Calendar sync / reminder status + retry | Admin |
| * | Not found | — |

### Component trees

```
StudentApp                          AdminApp
├─ AppRouter                        ├─ AppRouter
├─ AuthProvider                     ├─ AuthProvider
├─ LanguageProvider                 ├─ AdminDashboard
├─ BookingWizard                    ├─ BookingTable
│   ├─ LessonTypeStep               ├─ BookingDetail
│   ├─ TopicStep                    ├─ AvailabilityManager
│   ├─ AvailabilityPicker           ├─ StudentProfile
│   └─ BookingReview                └─ LessonEditor
├─ StudentDashboard
│   ├─ BookingCard
│   ├─ FileUploader
│   └─ LessonSummaryCard
└─ DiagnosticQuiz
```

### State strategy

| State | Location | Reason |
|-------|----------|--------|
| Authenticated user/role | Auth context | Needed across protected routes; token stays in HttpOnly cookie. |
| Language/direction | Language context | Switches translations and RTL/LTR everywhere. |
| Bookings/availability/quiz | Fetched per page | Server data is authoritative; refetch after mutations. |
| Wizard inputs | Local state | Temporary until submission. |
| Filters/dialogs/menus | Local state | Pure UI. |

### Multilingual / RTL rules

- All labels via translation keys (en/ar/he), no hard-coded strings.
- Document `dir` = `rtl` for ar/he, `ltr` for en.
- Locale-formatted dates; API keeps UTC.
- Logical start/end alignment, not left/right.
- Errors translated in the frontend from stable API error codes.

---

## 7. Security & Non-Functionals

### Authentication flow

1. `POST /api/auth/login` over HTTPS with email + password.
2. Express verifies against bcrypt/argon2id hash.
3. Short-lived JWT set in a Secure, HttpOnly cookie.
4. Auth middleware verifies the token and loads identity/role.
5. Authorization middleware checks role + resource ownership before controllers run.
6. Logout clears the cookie; expiry requires re-login (refresh tokens possible later).

**Netlify/API note:** proxy `/api/*` from each Netlify site to the VPS API (same-origin for the
browser; minimal CORS/cookie complexity). If a direct API hostname is used instead, test credentialed
CORS + SameSite/Secure carefully.

### Authorization matrix

| Actor | Permissions |
|-------|-------------|
| Student | Create bookings; read/cancel/reschedule own; upload/read own files; take quizzes; view own progress. |
| Admin | Manage all bookings/students/availability; confirm/reject/reschedule; lesson summaries; automation status. |
| Internal n8n | Only dedicated internal callback endpoints with a shared secret; never general admin privileges. |
| Public | Landing content, active topics, public availability only. |

### Validation and secrets

| Concern | Decision |
|---------|----------|
| Server validation | Validate every body/query/path param; frontend validation is UX only. |
| Passwords | bcrypt/argon2id hashes only; never log passwords or tokens. |
| Cookies | Secure + HttpOnly; suitable SameSite; CSRF strategy reviewed if cross-site. |
| Quiz answers | correct_answer never leaves the server; scoring happens in the API. |
| Files | Allow-list MIME/extensions; size limit; server-side filenames; path-traversal prevention; authorized downloads only. |
| n8n webhooks | No unauthenticated privileged webhooks; header/JWT/shared-secret auth; restricted editor. |
| Database | Postgres port not public; internal network only. |
| Secrets | Env vars / protected credential stores only. |
| Logging | Request IDs, status, errors — never secrets; enough context for integration retries. |
| Rate limits | On login, registration, booking creation, uploads. |

**Privacy/retention:** uploads private by default; admin-defined retention; account deletion removes
or anonymizes personal data (exact policy = OQ4).

---

## 8. Testing & Deployment

### Testing strategy

| Level | Coverage | Example |
|-------|----------|---------|
| Unit | Pure business rules | Duration validation; cancellation window; quiz scoring; status transitions. |
| Integration | Express + PostgreSQL | Register/login; create/confirm booking; conflict constraint; authorization; file metadata. |
| Integration | Express + mocked n8n | Webhook requests; failure/retry state. |
| End-to-end | Browser flow | Register → book → admin confirm → student sees confirmed; cancel/reschedule; RTL flow. |
| Security | Protected routes/uploads | Cross-student file access blocked; bad type/size rejected. |
| Smoke | Production | Pages load; API health; DB reachable; n8n webhook succeeds. |

### Deployment

- Student + admin frontends → Netlify (URLs assigned at deploy).
- API → Node/Express on VPS behind Nginx + HTTPS.
- PostgreSQL → VPS private network; 5432 not public.
- n8n → self-hosted on VPS behind protected reverse-proxy route.
- Files → dedicated private VPS directory (never a public static dir).
- Google Calendar + Telegram accessed by n8n with server-stored credentials.

### Environment variables

| Variable | Purpose | Location |
|----------|---------|----------|
| DATABASE_URL | Postgres connection | VPS backend |
| JWT_SECRET | JWT signing | VPS backend |
| APP_TIMEZONE | Display time zone | VPS backend |
| FRONTEND_ORIGINS | Allowed origins if CORS used | VPS backend |
| UPLOAD_DIR | Private upload directory | VPS backend |
| MAX_UPLOAD_MB | Upload size limit | VPS backend |
| N8N_WEBHOOK_BASE_URL | Protected n8n base URL | VPS backend |
| N8N_SHARED_SECRET | Express ↔ n8n auth | VPS backend + n8n |
| GOOGLE_CALENDAR_ID | Target calendar | n8n |
| Google OAuth credentials | Calendar authorization | n8n credential store |
| TELEGRAM_BOT_TOKEN | Bot token | n8n credential store |
| TELEGRAM_CHAT_ID | Admin chat | n8n credential/config |
| VITE_API_BASE | Usually /api (Netlify proxy) | Netlify build env |

**Backups:** daily Postgres dump; regular upload-dir snapshot; n8n workflow exports; at least one
restore test before final submission.

---

## 9. Timeline, Risks & Open Questions

### Milestones

| Milestone | Includes | Target |
|-----------|----------|--------|
| M1 — Foundation | Repos, React shells, Express API, Postgres schema, local envs | Week 1 |
| M2 — Auth + booking | Registration/login, topics, availability, create/list bookings | Week 2 |
| M3 — Admin + automation | Admin dashboard, confirm/reject/cancel, n8n Telegram + Calendar | Week 3 |
| M4 — Student tools | Dashboard, file uploads, rescheduling, authorization tests | Week 4 |
| M5 — Learning layer | Quiz, lesson summary, progress, ar/he/en RTL | Week 5 |
| M6 — Quality + deploy | Conflict tests, security review, backups, deployment, docs, demo | Week 6 |

### Risks (with mitigations)

Scope creep → non-goals fixed, core first. Double-booking → re-check + DB constraint.
Calendar failure → sync status, blocked slot, retry. n8n exposure → authenticated webhooks,
restricted editor. Cookie/CORS → Netlify /api proxy. File abuse → allow-list, limits, private
storage. VPS single point of failure → accepted for course scope + backups. Credential leaks →
env/credential stores only.

### Open questions

| ID | Question |
|----|----------|
| OQ1 | Custom domain/subdomain for the API, or VPS-hosted hostname only? |
| OQ2 | Cancel anytime, or a configurable cancellation window? |
| OQ3 | One reusable Zoom link, manual link per booking, or future Zoom API? |
| OQ4 | File-retention period for old uploads? |
| OQ5 | Quizzes required for selected topics, or always optional? |
