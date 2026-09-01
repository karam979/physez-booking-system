-- Up Migration

-- Credits ledger ------------------------------------------------------------
-- Append-only: a balance is always SUM(amount) over a user's rows, never a
-- mutable column, so no stored total can drift from its history. Reversals are
-- compensating rows, never edits or deletes.
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id),
  -- Whole credits only; negative for spend, refunds and admin removals.
  amount INTEGER NOT NULL CHECK (amount <> 0),
  credit_kind VARCHAR(20) NOT NULL CHECK (credit_kind IN ('paid', 'reward')),
  transaction_type VARCHAR(40) NOT NULL CHECK (
    transaction_type IN (
      'purchase',
      'admin_adjustment',
      'community_answer_reward',
      'community_vote_reward',
      'community_bonus',
      'lesson_payment',
      'course_payment',
      'refund'
    )
  ),
  description TEXT,
  -- What the credit is about (e.g. the answer that was accepted), used for the
  -- per-answer reward cap. Distinct from idempotency_key, which identifies the
  -- single event that may create this row.
  reference_type VARCHAR(40),
  reference_id UUID,
  -- The admin who performed a manual adjustment; NULL for system rewards.
  created_by UUID REFERENCES users (id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The database, not the application, is what makes a reward unrepeatable: a
-- retried request hits this constraint instead of granting twice.
CREATE UNIQUE INDEX credit_transactions_idempotency_key
  ON credit_transactions ((metadata ->> 'idempotencyKey'))
  WHERE metadata ->> 'idempotencyKey' IS NOT NULL;

CREATE INDEX credit_transactions_user_id_idx ON credit_transactions (user_id);
CREATE INDEX credit_transactions_user_created_idx ON credit_transactions (user_id, created_at);
CREATE INDEX credit_transactions_reference_idx
  ON credit_transactions (transaction_type, reference_type, reference_id);

-- Community ------------------------------------------------------------------
CREATE TABLE community_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id),
  topic_id UUID NOT NULL REFERENCES topics (id),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  language VARCHAR(5) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'solved', 'closed')),
  accepted_answer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX community_questions_topic_idx ON community_questions (topic_id);
CREATE INDEX community_questions_status_idx ON community_questions (status);
CREATE INDEX community_questions_language_idx ON community_questions (language);
CREATE INDEX community_questions_created_idx ON community_questions (created_at DESC);

CREATE TABLE community_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES community_questions (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX community_answers_question_idx ON community_answers (question_id);
CREATE INDEX community_answers_user_idx ON community_answers (user_id);

-- Added after both tables exist because the reference is circular.
ALTER TABLE community_questions
  ADD CONSTRAINT community_questions_accepted_answer_fkey
  FOREIGN KEY (accepted_answer_id) REFERENCES community_answers (id) ON DELETE SET NULL;

CREATE TABLE community_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES community_answers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One vote per student per answer, enforced by the database so a double
  -- submit cannot become two votes (and two rewards).
  CONSTRAINT community_votes_answer_user_key UNIQUE (answer_id, user_id)
);

CREATE INDEX community_votes_answer_idx ON community_votes (answer_id);

CREATE TABLE community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES users (id),
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX community_reports_status_idx ON community_reports (status);

-- Down Migration

DROP TABLE community_reports;
DROP TABLE community_votes;
ALTER TABLE community_questions DROP CONSTRAINT community_questions_accepted_answer_fkey;
DROP TABLE community_answers;
DROP TABLE community_questions;
DROP TABLE credit_transactions;
