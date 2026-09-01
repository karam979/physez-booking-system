import { query, getPool } from '../db.js'
import { COMMUNITY_REWARD_TYPES } from './constants.js'
import {
  MAX_REWARD_CREDITS_PER_DAY,
  MAX_REWARD_CREDITS_PER_WEEK,
  MAX_VOTE_CREDITS_PER_ANSWER,
} from '../community/rewards.js'

// Balances are always summed from the ledger — there is no stored total that
// could drift from its history (DESIGN.md §4 keeps the database authoritative).

export async function getBalances(userId, client = null) {
  const run = client ? (text, params) => client.query(text, params) : query
  const { rows } = await run(
    `SELECT
       COALESCE(SUM(amount), 0)::int AS total,
       COALESCE(SUM(amount) FILTER (WHERE credit_kind = 'paid'), 0)::int AS paid,
       COALESCE(SUM(amount) FILTER (WHERE credit_kind = 'reward'), 0)::int AS reward
     FROM credit_transactions WHERE user_id = $1`,
    [userId],
  )
  return rows[0]
}

export function serializeTransaction(row) {
  return {
    id: row.id,
    amount: row.amount,
    creditKind: row.credit_kind,
    transactionType: row.transaction_type,
    description: row.description,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at.toISOString(),
  }
}

export async function listTransactions(userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT * FROM credit_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  const total = await query(
    `SELECT count(*)::int AS n FROM credit_transactions WHERE user_id = $1`,
    [userId],
  )
  return { transactions: rows.map(serializeTransaction), total: total.rows[0].n, limit, offset }
}

// Serializes all credit writes for one user inside the current transaction, so
// two concurrent rewards cannot both read a pre-cap balance and both grant.
async function lockUserCredits(client, userId) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`credits:${userId}`])
}

async function communityRewardsInWindow(client, userId, interval) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total
     FROM credit_transactions
     WHERE user_id = $1
       AND transaction_type = ANY($2)
       AND amount > 0
       AND created_at >= now() - $3::interval`,
    [userId, COMMUNITY_REWARD_TYPES, interval],
  )
  return rows[0].total
}

async function voteCreditsForAnswer(client, answerId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total
     FROM credit_transactions
     WHERE transaction_type = 'community_vote_reward'
       AND reference_type = 'community_answer'
       AND reference_id = $1
       AND amount > 0`,
    [answerId],
  )
  return rows[0].total
}

async function insertTransaction(client, entry) {
  const metadata = { ...(entry.metadata ?? {}) }
  if (entry.idempotencyKey) metadata.idempotencyKey = entry.idempotencyKey

  const { rows } = await client.query(
    `INSERT INTO credit_transactions
       (user_id, amount, credit_kind, transaction_type, description,
        reference_type, reference_id, created_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      entry.userId,
      entry.amount,
      entry.creditKind,
      entry.transactionType,
      entry.description ?? null,
      entry.referenceType ?? null,
      entry.referenceId ?? null,
      entry.createdBy ?? null,
      JSON.stringify(metadata),
    ],
  )
  return rows[0]
}

/**
 * Grants community reward credits inside an existing transaction.
 *
 * Returns { granted, amount, reason }. A refusal is not an error: hitting a
 * cap or replaying a request still leaves the community action itself valid,
 * so the caller commits either way.
 */
export async function grantCommunityReward(client, entry) {
  const { userId, amount, transactionType, idempotencyKey, answerId } = entry

  await lockUserCredits(client, userId)

  // Replay of the same event: the unique index would reject it anyway, but
  // checking first keeps the transaction alive for the caller.
  const existing = await client.query(
    `SELECT 1 FROM credit_transactions WHERE metadata ->> 'idempotencyKey' = $1`,
    [idempotencyKey],
  )
  if (existing.rows.length > 0) {
    return { granted: false, amount: 0, reason: 'ALREADY_GRANTED' }
  }

  if (transactionType === 'community_vote_reward') {
    const already = await voteCreditsForAnswer(client, answerId)
    if (already + amount > MAX_VOTE_CREDITS_PER_ANSWER) {
      return { granted: false, amount: 0, reason: 'ANSWER_VOTE_CAP_REACHED' }
    }
  }

  const daily = await communityRewardsInWindow(client, userId, '1 day')
  if (daily + amount > MAX_REWARD_CREDITS_PER_DAY) {
    return { granted: false, amount: 0, reason: 'DAILY_CAP_REACHED' }
  }

  const weekly = await communityRewardsInWindow(client, userId, '7 days')
  if (weekly + amount > MAX_REWARD_CREDITS_PER_WEEK) {
    return { granted: false, amount: 0, reason: 'WEEKLY_CAP_REACHED' }
  }

  const row = await insertTransaction(client, {
    ...entry,
    creditKind: 'reward',
    referenceType: 'community_answer',
    referenceId: answerId,
  })
  return { granted: true, amount: row.amount, reason: null, transaction: row }
}

/**
 * Admin credit adjustment. Positive adds, negative removes; a removal may not
 * take the matching balance below zero.
 */
export async function adjustCredits({ userId, amount, creditKind, reason, adminId }) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await lockUserCredits(client, userId)

    if (amount < 0) {
      const balances = await getBalances(userId, client)
      const available = creditKind === 'paid' ? balances.paid : balances.reward
      if (available + amount < 0) {
        await client.query('ROLLBACK')
        return { error: 'INSUFFICIENT_CREDITS', available }
      }
    }

    const row = await insertTransaction(client, {
      userId,
      amount,
      creditKind,
      transactionType: 'admin_adjustment',
      description: reason,
      createdBy: adminId,
    })
    await client.query('COMMIT')

    const balances = await getBalances(userId)
    return { transaction: serializeTransaction(row), balances }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
