export const CREDIT_KINDS = ['paid', 'reward']

export const TRANSACTION_TYPES = [
  'purchase',
  'admin_adjustment',
  'community_answer_reward',
  'community_vote_reward',
  'community_bonus',
  'lesson_payment',
  'course_payment',
  'refund',
]

// Types the community grants automatically; they share the daily/weekly caps.
export const COMMUNITY_REWARD_TYPES = [
  'community_answer_reward',
  'community_vote_reward',
  'community_bonus',
]

export const ADJUSTMENT_REASON_MAX_LENGTH = 500
