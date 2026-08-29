# n8n workflows

Four importable workflows for the PhysEZ automation layer. In n8n:
**Workflows → Import from File**, then set credentials and activate.

| File | Trigger | What it does |
|------|---------|--------------|
| `telegram-alert.workflow.json` | `POST /webhook/booking-created` | Sends the teacher a Telegram message when a student submits a booking request. |
| `calendar-create.workflow.json` | `POST /webhook/calendar-create` | Creates the Google Calendar event after an admin confirms, then reports the event id (or a failure) back to the API. |
| `calendar-delete.workflow.json` | `POST /webhook/calendar-delete` | Removes the event when a lesson is cancelled, then reports the result back. |
| `daily-reminder.workflow.json` | Schedule, 18:00 daily | Telegram summary of tomorrow's confirmed lessons, read from the API. |

## Environment variables (n8n side)

| Variable | Purpose |
|----------|---------|
| `PHYSEZ_SHARED_SECRET` | Must equal the API's `N8N_SHARED_SECRET`. Every webhook verifies it, and callbacks send it back as `X-PhysEZ-Secret`. |
| `PHYSEZ_API_BASE` | Base URL of the Express API, e.g. `http://localhost:3000` on the VPS private network. |
| `GOOGLE_CALENDAR_ID` | Target calendar. |
| `TELEGRAM_CHAT_ID` | Admin chat that receives alerts and reminders. |
| `APP_TIMEZONE` | Display time zone for message formatting (matches the API). |

Credentials marked `REPLACE_ME` in the JSON must be re-selected after import:
a Telegram Bot credential and a Google Calendar OAuth2 credential. No database
credential is needed — n8n never talks to Postgres directly.

## Contract with the API

Express calls `POST {N8N_WEBHOOK_BASE_URL}/webhook/<name>` with the
`X-PhysEZ-Secret` header. Each workflow drops the request if the secret does
not match, so an unauthenticated caller cannot drive the automation.

Calendar workflows report back to `POST /api/internal/n8n/calendar-result`
with the same secret:

```json
{ "bookingId": "<uuid>", "status": "synced", "calendarEventId": "<google id>" }
{ "bookingId": "<uuid>", "status": "failed" }
{ "bookingId": "<uuid>", "status": "deleted" }
```

A failure never changes the booking's status — the lesson stays confirmed and
its slot stays blocked, and the admin sees a retry state.

The reminder workflow reads from `GET /api/internal/reminders/tomorrow` with
the same `X-PhysEZ-Secret` header. "Tomorrow" is a calendar day in the API's
`APP_TIMEZONE`, so the workflow needs no timezone logic of its own:

```json
{
  "date": "2026-08-19",
  "timezone": "Asia/Jerusalem",
  "count": 2,
  "lessons": [
    {
      "id": "<uuid>",
      "startAt": "2026-08-19T06:00:00.000Z",
      "endAt": "2026-08-19T07:00:00.000Z",
      "lessonType": "zoom",
      "language": "ar",
      "notes": "Exam preparation",
      "student": { "name": "…", "email": "…" },
      "topic": { "nameEn": "…", "nameAr": "…", "nameHe": "…" }
    }
  ]
}
```

## Live wiring status — deferred to deployment

The API-side integration code and these four workflows are complete and
covered by tests (the n8n module is mocked, so no test ever calls a real
webhook). What remains is connecting them to the live n8n instance on the VPS
at `auto-flows-979.duckdns.org` (root path).

**Open blocker.** n8n v2.21.7 denies `$env` access inside expressions when
running under `NODE_ENV=production`, and the Variables feature is not
available on this plan. The likely fix is the `N8N_EXPRESSIONS_ALLOWED_ENV_VARS`
allow-list — untested so far. As a stopgap, the Telegram chat ID and the
calendar ID are hard-coded directly in the nodes on the live instance instead
of being read from `$env`.

**To resume, in order:**

1. Fix env access on the n8n instance (try `N8N_EXPRESSIONS_ALLOWED_ENV_VARS`).
2. Revert the hard-coded chat ID and calendar ID back to `$env` expressions so
   the live workflows match the JSON in this folder.
3. Set `PHYSEZ_SHARED_SECRET` in n8n to the same value as `N8N_SHARED_SECRET`
   in `server/.env`.
4. Test the outbound direction first: create a booking and confirm the
   Telegram alert arrives.
5. Test the calendar callback last — it needs the API reachable from n8n, so
   it only works once the API is deployed and `PHYSEZ_API_BASE` points at it.
