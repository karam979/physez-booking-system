// n8n is the automation layer, never the source of truth (DESIGN.md §3).
// Every trigger here is best-effort: a failed webhook is logged and reported
// to the caller, but it must never break or roll back a booking transaction.

export const WORKFLOWS = {
  bookingCreated: 'booking-created',
  calendarCreate: 'calendar-create',
  calendarDelete: 'calendar-delete',
}

const REQUEST_TIMEOUT_MS = 5000

export function isConfigured() {
  return Boolean(process.env.N8N_WEBHOOK_BASE_URL && process.env.N8N_SHARED_SECRET)
}

// Returns true when n8n accepted the call. Never throws.
export async function trigger(workflow, payload) {
  if (!isConfigured()) {
    // Local dev without n8n running: skip quietly rather than failing bookings.
    return false
  }
  const base = process.env.N8N_WEBHOOK_BASE_URL.replace(/\/$/, '')
  try {
    const response = await fetch(`${base}/webhook/${workflow}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PhysEZ-Secret': process.env.N8N_SHARED_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`n8n ${workflow} responded ${response.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`n8n ${workflow} trigger failed:`, err.message)
    return false
  }
}
