// Only the display name is exposed for other students — never email or role.
function author(row) {
  return { id: row.author_id, name: row.author_name }
}

// Removal audit data is admin-only: student routes never pass includeRemoval,
// so deletion_reason and the admin who acted cannot leak into the feed.
function removal(row) {
  if (!row.deleted_at) return null
  return {
    removedAt: row.deleted_at.toISOString(),
    removedBy: row.deleted_by ? { id: row.deleted_by, name: row.deleted_by_name ?? null } : null,
    reason: row.deletion_reason,
  }
}

export function serializeQuestionSummary(row, { viewerId, includeRemoval } = {}) {
  const summary = {
    id: row.id,
    title: row.title,
    language: row.language,
    status: row.status,
    answerCount: Number(row.answer_count),
    isSolved: row.status === 'solved',
    // Lets the client show the accept control without guessing at ownership;
    // the server still re-checks it on every accept.
    isOwn: viewerId != null && row.author_id === viewerId,
    topic: { id: row.topic_id, nameEn: row.name_en, nameAr: row.name_ar, nameHe: row.name_he },
    author: author(row),
    createdAt: row.created_at.toISOString(),
  }
  if (includeRemoval) {
    summary.isRemoved = Boolean(row.deleted_at)
    summary.removal = removal(row)
  }
  return summary
}

export function serializeQuestionDetail(row, answers, { viewerId, includeRemoval } = {}) {
  return {
    ...serializeQuestionSummary(row, { viewerId, includeRemoval }),
    body: row.body,
    acceptedAnswerId: row.accepted_answer_id,
    updatedAt: row.updated_at.toISOString(),
    answers,
  }
}

export function serializeAnswer(row, { viewerId, acceptedAnswerId } = {}) {
  return {
    id: row.id,
    questionId: row.question_id,
    body: row.body,
    author: author(row),
    voteCount: Number(row.vote_count ?? 0),
    // Lets the UI render the vote control without a second request.
    viewerHasVoted: Boolean(row.viewer_has_voted),
    isAccepted: acceptedAnswerId != null && acceptedAnswerId === row.id,
    isOwn: viewerId != null && row.author_id === viewerId,
    createdAt: row.created_at.toISOString(),
  }
}
