CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_training_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  max_frequency_rank integer NOT NULL DEFAULT 10000,
  include_unknown_frequency boolean NOT NULL DEFAULT false,
  ru_to_en_options_count integer NOT NULL DEFAULT 4,
  en_to_ru_options_count integer NOT NULL DEFAULT 4,
  training_direction_mode text NOT NULL DEFAULT 'mixed',
  hide_options_until_reveal boolean NOT NULL DEFAULT false,
  auto_start_word_on_training boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_training_direction_mode CHECK (training_direction_mode IN ('mixed', 'ru_to_en_only', 'en_to_ru_only')),
  CONSTRAINT chk_ru_to_en_options_count CHECK (ru_to_en_options_count BETWEEN 2 AND 8),
  CONSTRAINT chk_en_to_ru_options_count CHECK (en_to_ru_options_count BETWEEN 2 AND 8)
);

ALTER TABLE user_training_settings
  ADD COLUMN IF NOT EXISTS hide_options_until_reveal boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_original text NOT NULL,
  word_normalized text NOT NULL,
  translations_raw text NOT NULL,
  comment text,
  source_author text,
  source_title text,
  sentence text,
  frequency_raw text,
  frequency_rank integer,
  frequency_is_open_end boolean NOT NULL DEFAULT false,
  progress integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started',
  repeated_imported integer,
  last_trained_at_imported timestamptz,
  next_train_at_imported timestamptz,
  learned_at timestamptz,
  added_at_imported timestamptz,
  first_imported_at timestamptz NOT NULL DEFAULT now(),
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_word_status CHECK (status IN ('not_started', 'in_progress', 'learned')),
  UNIQUE (user_id, word_normalized)
);

CREATE TABLE IF NOT EXISTS word_training_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  scope text NOT NULL,
  shown_count integer NOT NULL DEFAULT 0,
  answered_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  shown_ru_to_en_count integer NOT NULL DEFAULT 0,
  shown_en_to_ru_count integer NOT NULL DEFAULT 0,
  last_shown_at timestamptz,
  last_answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_training_scope CHECK (scope IN ('in_progress', 'not_started', 'all')),
  UNIQUE (user_id, word_id, scope)
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  settings_snapshot jsonb NOT NULL,
  current_question_snapshot jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_training_session_mode CHECK (mode IN ('in_progress', 'not_started', 'all')),
  CONSTRAINT chk_training_session_status CHECK (status IN ('active', 'finished', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  scope text NOT NULL,
  question_type text NOT NULL,
  prompt text NOT NULL,
  options_snapshot jsonb NOT NULL,
  correct_option_id uuid NOT NULL,
  selected_option_id uuid,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_attempt_scope CHECK (scope IN ('in_progress', 'not_started', 'all')),
  CONSTRAINT chk_question_type CHECK (question_type IN ('RU_TO_EN', 'EN_TO_RU'))
);

CREATE INDEX IF NOT EXISTS idx_words_user_status ON words(user_id, status);
CREATE INDEX IF NOT EXISTS idx_words_user_frequency_rank ON words(user_id, frequency_rank);
CREATE INDEX IF NOT EXISTS idx_words_user_is_active ON words(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_word_training_stats_user_scope_shown ON word_training_stats(user_id, scope, shown_count);
CREATE INDEX IF NOT EXISTS idx_word_training_stats_user_scope_last_answered ON word_training_stats(user_id, scope, last_answered_at);
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_status ON training_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_mode ON training_sessions(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_training_attempts_session ON training_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_training_attempts_user_word ON training_attempts(user_id, word_id);
CREATE INDEX IF NOT EXISTS idx_training_attempts_user_scope ON training_attempts(user_id, scope);
