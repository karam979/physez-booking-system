-- Up Migration

-- DESIGN.md §4 — full v1 schema.
-- btree_gist is required by the bookings exclusion constraint and lets it later
-- be scoped per teacher (teacher_id WITH =) without changing index type.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  preferred_language VARCHAR(5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en VARCHAR(120) NOT NULL,
  name_ar VARCHAR(120) NOT NULL,
  name_he VARCHAR(120) NOT NULL,
  education_level VARCHAR(80),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX availability_slots_start_end_idx ON availability_slots (start_at, end_at);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users (id),
  topic_id UUID NOT NULL REFERENCES topics (id),
  lesson_type VARCHAR(20) NOT NULL CHECK (lesson_type IN ('zoom', 'in_person')),
  language VARCHAR(5) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  notes TEXT,
  calendar_event_id VARCHAR(255),
  calendar_sync_status VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX bookings_student_id_idx ON bookings (student_id);
CREATE INDEX bookings_status_idx ON bookings (status);
CREATE INDEX bookings_start_at_idx ON bookings (start_at);
CREATE INDEX bookings_topic_id_idx ON bookings (topic_id);

-- The critical invariant: two confirmed bookings can never overlap in time.
-- The API re-check is the fast fail; this constraint is the guarantee under
-- concurrency (single-teacher v1 deployment).
ALTER TABLE bookings
  ADD CONSTRAINT no_overlapping_confirmed_bookings
  EXCLUDE USING gist (
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'confirmed');

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings (id),
  attendance VARCHAR(20),
  summary TEXT,
  homework TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings (id),
  student_id UUID NOT NULL REFERENCES users (id),
  lesson_id UUID REFERENCES lessons (id),
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX files_booking_id_idx ON files (booking_id);
CREATE INDEX files_student_id_idx ON files (student_id);

CREATE TABLE diagnostic_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics (id),
  title VARCHAR(200) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES diagnostic_quizzes (id),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  -- correct_answer is never serialized to the student client (DESIGN.md §4).
  correct_answer VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES diagnostic_quizzes (id),
  student_id UUID NOT NULL REFERENCES users (id),
  booking_id UUID REFERENCES bookings (id),
  score NUMERIC(5, 2) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quiz_attempts_student_id_idx ON quiz_attempts (student_id);
CREATE INDEX quiz_attempts_quiz_id_idx ON quiz_attempts (quiz_id);

CREATE TABLE reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings (id),
  requested_start_at TIMESTAMPTZ NOT NULL,
  requested_end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requested_end_at > requested_start_at)
);

-- Down Migration

DROP TABLE reschedule_requests;
DROP TABLE quiz_attempts;
DROP TABLE quiz_questions;
DROP TABLE diagnostic_quizzes;
DROP TABLE files;
DROP TABLE lessons;
DROP TABLE bookings;
DROP TABLE availability_slots;
DROP TABLE topics;
DROP TABLE users;
DROP EXTENSION IF EXISTS btree_gist;
