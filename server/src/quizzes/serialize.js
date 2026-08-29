// The student-facing question shape. correct_answer is deliberately absent —
// this function is the only way questions reach a client (DESIGN.md §4).
export function serializeQuestion(row) {
  return {
    id: row.id,
    questionText: row.question_text,
    options: row.options,
    position: row.position,
  }
}

export function serializeQuiz(quiz, questionRows) {
  return {
    id: quiz.id,
    topicId: quiz.topic_id,
    title: quiz.title,
    questions: questionRows.map(serializeQuestion),
  }
}

export function serializeAttempt(row) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    bookingId: row.booking_id,
    score: Number(row.score),
    submittedAt: row.submitted_at.toISOString(),
  }
}
