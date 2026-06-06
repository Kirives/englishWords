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
  context_options_count integer NOT NULL DEFAULT 4,
  training_direction_mode text NOT NULL DEFAULT 'mixed',
  hide_options_until_reveal boolean NOT NULL DEFAULT false,
  auto_start_word_on_training boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_training_direction_mode CHECK (training_direction_mode IN ('mixed', 'ru_to_en_only', 'en_to_ru_only')),
  CONSTRAINT chk_ru_to_en_options_count CHECK (ru_to_en_options_count BETWEEN 2 AND 8),
  CONSTRAINT chk_en_to_ru_options_count CHECK (en_to_ru_options_count BETWEEN 2 AND 8),
  CONSTRAINT chk_context_options_count CHECK (context_options_count BETWEEN 2 AND 8)
);

ALTER TABLE user_training_settings
  ADD COLUMN IF NOT EXISTS hide_options_until_reveal boolean NOT NULL DEFAULT false;

ALTER TABLE user_training_settings
  ADD COLUMN IF NOT EXISTS context_options_count integer NOT NULL DEFAULT 4;

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

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  base_url text NOT NULL DEFAULT 'https://api.openai.com/v1',
  api_key_encrypted text,
  model_name text NOT NULL DEFAULT 'gpt-4o-mini',
  temperature numeric(3,2) NOT NULL DEFAULT 0.4,
  max_output_tokens integer NOT NULL DEFAULT 8000,
  words_per_batch integer NOT NULL DEFAULT 5,
  request_timeout_sec integer NOT NULL DEFAULT 60,
  last_check_status text NOT NULL DEFAULT 'not_checked',
  last_check_at timestamptz,
  last_check_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ai_words_per_batch CHECK (words_per_batch BETWEEN 1 AND 10),
  CONSTRAINT chk_ai_request_timeout CHECK (request_timeout_sec BETWEEN 5 AND 300),
  CONSTRAINT chk_ai_temperature CHECK (temperature >= 0 AND temperature <= 1)
);

CREATE TABLE IF NOT EXISTS context_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  mode text NOT NULL,
  target_words_count integer NOT NULL DEFAULT 0,
  processed_words_count integer NOT NULL DEFAULT 0,
  generated_examples_count integer NOT NULL DEFAULT 0,
  valid_examples_count integer NOT NULL DEFAULT 0,
  invalid_examples_count integer NOT NULL DEFAULT 0,
  failed_words_count integer NOT NULL DEFAULT 0,
  settings_snapshot jsonb NOT NULL,
  prompt_version text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_context_job_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS word_context_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  generation_job_id uuid REFERENCES context_generation_jobs(id) ON DELETE SET NULL,
  source text NOT NULL,
  difficulty text NOT NULL,
  cefr text,
  full_sentence text NOT NULL,
  full_sentence_marked text NOT NULL,
  full_sentence_normalized text NOT NULL,
  masked_sentence text NOT NULL,
  answer_text text NOT NULL,
  answer_normalized text NOT NULL,
  ru_translation text,
  part_of_speech text NOT NULL,
  grammar_form text NOT NULL,
  ai_model text,
  prompt_version text,
  is_active boolean NOT NULL DEFAULT true,
  quality_status text NOT NULL DEFAULT 'valid',
  reject_reason text,
  shown_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  hint_shown_count integer NOT NULL DEFAULT 0,
  last_shown_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_context_source CHECK (source IN ('imported', 'ai', 'manual')),
  CONSTRAINT chk_context_difficulty CHECK (difficulty IN ('simple', 'medium', 'hard')),
  CONSTRAINT chk_context_quality_status CHECK (quality_status IN ('valid', 'invalid', 'needs_review')),
  UNIQUE (user_id, word_id, full_sentence_normalized)
);

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
  context_example_id uuid REFERENCES word_context_examples(id) ON DELETE SET NULL,
  hint_translation_shown boolean NOT NULL DEFAULT false,
  selected_option_word_id uuid,
  selected_option_text text,
  correct_answer_text text,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_attempt_scope CHECK (scope IN ('in_progress', 'not_started', 'all')),
  CONSTRAINT chk_question_type CHECK (question_type IN ('RU_TO_EN', 'EN_TO_RU', 'CONTEXT_CLOZE'))
);

ALTER TABLE training_attempts
  ADD COLUMN IF NOT EXISTS context_example_id uuid REFERENCES word_context_examples(id) ON DELETE SET NULL;

ALTER TABLE training_attempts
  ADD COLUMN IF NOT EXISTS hint_translation_shown boolean NOT NULL DEFAULT false;

ALTER TABLE training_attempts
  ADD COLUMN IF NOT EXISTS selected_option_word_id uuid;

ALTER TABLE training_attempts
  ADD COLUMN IF NOT EXISTS selected_option_text text;

ALTER TABLE training_attempts
  ADD COLUMN IF NOT EXISTS correct_answer_text text;

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
CREATE INDEX IF NOT EXISTS idx_ai_provider_settings_user ON ai_provider_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_context_generation_jobs_user_status ON context_generation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_word_context_examples_word_active ON word_context_examples(word_id, is_active);
CREATE INDEX IF NOT EXISTS idx_word_context_examples_user_word ON word_context_examples(user_id, word_id);
