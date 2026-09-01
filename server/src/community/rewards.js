// Every community reward number and input bound lives here. Changing the
// economy or the limits means editing this file, not hunting through handlers.

export const REWARD_ACCEPTED_ANSWER = 5
export const REWARD_HELPFUL_VOTE = 1

// A single popular answer cannot farm unlimited credits.
export const MAX_VOTE_CREDITS_PER_ANSWER = 5

// Per-student ceilings across all community rewards.
export const MAX_REWARD_CREDITS_PER_DAY = 15
export const MAX_REWARD_CREDITS_PER_WEEK = 60

export const QUESTION_STATUSES = ['open', 'solved', 'closed']
export const REPORT_TARGET_TYPES = ['question', 'answer']

// A report is filed as 'open'; an admin then marks it one of the decisions.
// Reviewing or dismissing also frees the reporter to file again later, because
// the duplicate-report index only covers open rows.
export const REPORT_STATUSES = ['open', 'reviewed', 'dismissed']
export const REPORT_DECISIONS = ['reviewed', 'dismissed']

export const TITLE_MAX_LENGTH = 200
export const BODY_MAX_LENGTH = 5000

// A report has to say something an admin can act on, so a few words minimum.
export const REPORT_REASON_MIN_LENGTH = 10
export const REPORT_REASON_MAX_LENGTH = 500
