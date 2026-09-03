-- Up Migration

-- Admin removal of a community question is a soft delete. The row stays so its
-- answers, votes, reports and the credit rows they generated keep their
-- meaning: the economy is append-only, and removing a question must never
-- rewrite what students already earned. deleted_at IS NULL is what every
-- student-facing query filters on.
ALTER TABLE community_questions
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES users (id),
  ADD COLUMN deletion_reason TEXT;

-- Every student read is "live questions, newest first", so the index carries
-- the filter rather than making Postgres discard removed rows afterwards.
CREATE INDEX community_questions_live_created_idx
  ON community_questions (created_at DESC)
  WHERE deleted_at IS NULL;

-- Down Migration

DROP INDEX community_questions_live_created_idx;

ALTER TABLE community_questions
  DROP COLUMN deletion_reason,
  DROP COLUMN deleted_by,
  DROP COLUMN deleted_at;
