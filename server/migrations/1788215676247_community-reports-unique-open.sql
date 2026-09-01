-- Up Migration

-- One open report per student per piece of content. Re-sending the same report
-- is refused by the database rather than flooding the moderation queue with
-- duplicates. The index is partial on 'open' on purpose: once an admin has
-- reviewed or dismissed a report, the same student may report the content
-- again if it is still a problem.
CREATE UNIQUE INDEX community_reports_open_target_key
  ON community_reports (reporter_user_id, target_type, target_id)
  WHERE status = 'open';

-- Down Migration

DROP INDEX community_reports_open_target_key;
