// Scoring happens here and nowhere else: correct answers never leave the
// server, so the client cannot compute or verify its own score (DESIGN.md §7).

// Answers arrive as [{ questionId, answer }]; anything unanswered counts wrong.
export function scoreAttempt(questions, answers) {
  const submitted = new Map(answers.map((entry) => [entry.questionId, entry.answer]))

  const correctCount = questions.reduce((total, question) => {
    const given = submitted.get(question.id)
    return typeof given === 'string' && given === question.correct_answer ? total + 1 : total
  }, 0)

  // NUMERIC(5,2) in the database — two decimals is the storable precision.
  const score = questions.length === 0 ? 0 : (correctCount / questions.length) * 100

  return { correctCount, totalQuestions: questions.length, score: Number(score.toFixed(2)) }
}
