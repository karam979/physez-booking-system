const STEP_MINUTES = 30

// Selectable start times inside one free window: every 30 minutes, as long
// as the whole lesson still fits before the window closes.
export function startTimesInWindow(window, durationMinutes) {
  const times = []
  const windowEnd = new Date(window.endAt).getTime()
  let start = new Date(window.startAt).getTime()
  while (start + durationMinutes * 60000 <= windowEnd) {
    times.push(new Date(start).toISOString())
    start += STEP_MINUTES * 60000
  }
  return times
}

// Every start time across all free windows of a day, in order.
export function startTimesInWindows(windows, durationMinutes) {
  return (windows ?? []).flatMap((window) => startTimesInWindow(window, durationMinutes))
}
