require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("./db");
const { requireAuth } = require("./auth");
const { initDb } = require("./initDb");

const app = express();
const PORT = Number(process.env.PORT || 3020);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const MODES = new Set(["in_progress", "not_started", "all"]);
const QUESTION_TYPES = new Set(["RU_TO_EN", "EN_TO_RU"]);
const DIRECTION_MODES = new Set(["mixed", "ru_to_en_only", "en_to_ru_only"]);

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((value) => value.trim())
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "25mb" }));

function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toTextOrNull(value) {
  const text = toTrimmed(value);
  return text ? text : null;
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toOptionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function clamp(value, min, max, fallback) {
  const parsed = toInt(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function parseImportedDate(value) {
  const text = toTrimmed(value);
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeWord(value) {
  let text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  text = text.replace(/^[\s'"‘’“”.,!?:;]+/u, "");
  text = text.replace(/[\s'"‘’“”.,!?:;]+$/u, "");
  return text;
}

function parseFrequency(value) {
  if (value === null || value === undefined) {
    return { frequencyRaw: null, frequencyRank: null, frequencyIsOpenEnd: false };
  }
  const frequencyRaw = String(value).trim();
  if (!frequencyRaw) {
    return { frequencyRaw: "", frequencyRank: null, frequencyIsOpenEnd: false };
  }
  const match = frequencyRaw.match(/^(\d+)\s*(\+)?$/);
  if (!match) {
    return { frequencyRaw, frequencyRank: null, frequencyIsOpenEnd: false };
  }
  return {
    frequencyRaw,
    frequencyRank: Number(match[1]),
    frequencyIsOpenEnd: Boolean(match[2]),
  };
}

function computeStatus(progress, learnedAt) {
  if (learnedAt) return "learned";
  return Number(progress || 0) > 0 ? "in_progress" : "not_started";
}

function normalizeSettingsPayload(payload = {}, includeAutoStart = true) {
  const settings = {
    maxFrequencyRank: Math.max(1, toInt(payload.maxFrequencyRank, 10000)),
    includeUnknownFrequency: toBoolean(payload.includeUnknownFrequency),
    ruToEnOptionsCount: clamp(payload.ruToEnOptionsCount, 2, 8, 4),
    enToRuOptionsCount: clamp(payload.enToRuOptionsCount, 2, 8, 4),
    trainingDirectionMode: DIRECTION_MODES.has(payload.trainingDirectionMode) ? payload.trainingDirectionMode : "mixed",
    hideOptionsUntilReveal: toBoolean(payload.hideOptionsUntilReveal),
  };
  if (includeAutoStart) {
    settings.autoStartWordOnTraining = toBoolean(payload.autoStartWordOnTraining);
  }
  return settings;
}

function settingsFromRow(row) {
  return {
    maxFrequencyRank: Number(row.max_frequency_rank),
    includeUnknownFrequency: Boolean(row.include_unknown_frequency),
    ruToEnOptionsCount: Number(row.ru_to_en_options_count),
    enToRuOptionsCount: Number(row.en_to_ru_options_count),
    trainingDirectionMode: row.training_direction_mode,
    hideOptionsUntilReveal: Boolean(row.hide_options_until_reveal),
    autoStartWordOnTraining: Boolean(row.auto_start_word_on_training),
  };
}

function settingsSnapshotFromRow(row) {
  return settingsFromRow(row);
}

function modeStatuses(mode) {
  if (mode === "in_progress") return ["in_progress"];
  if (mode === "not_started") return ["not_started"];
  return ["not_started", "in_progress"];
}

function handleServerError(res, error) {
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
}

async function ensureTrainingSettings(userId, client = db) {
  await client.query(
    "INSERT INTO user_training_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId]
  );
}

async function getTrainingSettings(userId, client = db) {
  await ensureTrainingSettings(userId, client);
  const result = await client.query("SELECT * FROM user_training_settings WHERE user_id = $1", [userId]);
  return result.rows[0];
}

async function ensureStatForWord(client, userId, wordId, scope, initialShownCount = null) {
  let shownCount = initialShownCount;
  if (shownCount === null) {
    const maxResult = await client.query(
      "SELECT COALESCE(MAX(s.shown_count), 0)::int AS max_count FROM word_training_stats s JOIN words w ON w.id = s.word_id WHERE s.user_id = $1 AND s.scope = $2 AND w.is_active = true",
      [userId, scope]
    );
    shownCount = Number(maxResult.rows[0]?.max_count || 0);
  }
  await client.query(
    "INSERT INTO word_training_stats (user_id, word_id, scope, shown_count) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, word_id, scope) DO NOTHING",
    [userId, wordId, scope, shownCount]
  );
}

async function ensureStatsForWord(client, userId, wordId, status, isNew) {
  await ensureStatForWord(client, userId, wordId, "all", null);
  if (status === "in_progress" || status === "not_started") {
    await ensureStatForWord(client, userId, wordId, status, null);
  }
}

function extractWordsPayload(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.exampleWords)) return body.exampleWords;
  if (Array.isArray(body?.words)) return body.words;
  return null;
}

async function getModeStats(userId, mode, settings) {
  const statuses = modeStatuses(mode);
  const result = await db.query(
    `SELECT COUNT(*)::int AS total, MIN(COALESCE(s.shown_count, 0))::int AS min_shown
     FROM words w
     LEFT JOIN word_training_stats s ON s.user_id = w.user_id AND s.word_id = w.id AND s.scope = $2
     WHERE w.user_id = $1
       AND w.is_active = true
       AND w.status = ANY($3::text[])
       AND ((w.frequency_rank IS NOT NULL AND w.frequency_rank <= $4) OR (w.frequency_rank IS NULL AND $5::boolean = true))`,
    [userId, mode, statuses, settings.maxFrequencyRank, settings.includeUnknownFrequency]
  );
  const total = Number(result.rows[0]?.total || 0);
  const minShown = result.rows[0]?.min_shown;
  if (!total || minShown === null || minShown === undefined) {
    return { total: 0, currentCycle: 0, remainingInCycle: 0 };
  }
  const remainingResult = await db.query(
    `SELECT COUNT(*)::int AS remaining
     FROM words w
     LEFT JOIN word_training_stats s ON s.user_id = w.user_id AND s.word_id = w.id AND s.scope = $2
     WHERE w.user_id = $1
       AND w.is_active = true
       AND w.status = ANY($3::text[])
       AND ((w.frequency_rank IS NOT NULL AND w.frequency_rank <= $4) OR (w.frequency_rank IS NULL AND $5::boolean = true))
       AND COALESCE(s.shown_count, 0) = $6`,
    [userId, mode, statuses, settings.maxFrequencyRank, settings.includeUnknownFrequency, Number(minShown)]
  );
  return {
    total,
    currentCycle: Number(minShown) + 1,
    remainingInCycle: Number(remainingResult.rows[0]?.remaining || 0),
  };
}

async function selectNextWord(userId, session) {
  const settings = session.settings_snapshot;
  const statuses = modeStatuses(session.mode);
  const baseParams = [userId, session.mode, statuses, settings.maxFrequencyRank, settings.includeUnknownFrequency, session.id];
  const unansweredQuery = `
    SELECT w.*, COALESCE(s.shown_count, 0) AS shown_count, s.last_answered_at
    FROM words w
    LEFT JOIN word_training_stats s ON s.user_id = w.user_id AND s.word_id = w.id AND s.scope = $2
    WHERE w.user_id = $1
      AND w.is_active = true
      AND w.status = ANY($3::text[])
      AND ((w.frequency_rank IS NOT NULL AND w.frequency_rank <= $4) OR (w.frequency_rank IS NULL AND $5::boolean = true))
      AND NOT EXISTS (
        SELECT 1 FROM training_attempts a
        WHERE a.session_id = $6 AND a.user_id = $1 AND a.word_id = w.id
      )
    ORDER BY COALESCE(s.shown_count, 0) ASC, s.last_answered_at ASC NULLS FIRST, random()
    LIMIT 1`;
  let result = await db.query(unansweredQuery, baseParams);
  if (result.rows[0]) return result.rows[0];

  result = await db.query(
    `SELECT w.*, COALESCE(s.shown_count, 0) AS shown_count, s.last_answered_at
     FROM words w
     LEFT JOIN word_training_stats s ON s.user_id = w.user_id AND s.word_id = w.id AND s.scope = $2
     WHERE w.user_id = $1
       AND w.is_active = true
       AND w.status = ANY($3::text[])
       AND ((w.frequency_rank IS NOT NULL AND w.frequency_rank <= $4) OR (w.frequency_rank IS NULL AND $5::boolean = true))
     ORDER BY COALESCE(s.shown_count, 0) ASC, s.last_answered_at ASC NULLS FIRST, random()
     LIMIT 1`,
    baseParams.slice(0, 5)
  );
  return result.rows[0] || null;
}

async function getDistractors(userId, mode, settings, currentWordId, limit) {
  const statuses = modeStatuses(mode);
  const primary = await db.query(
    `SELECT id, word_original, translations_raw FROM words
     WHERE user_id = $1 AND id <> $2 AND is_active = true AND status = ANY($3::text[])
       AND ((frequency_rank IS NOT NULL AND frequency_rank <= $4) OR (frequency_rank IS NULL AND $5::boolean = true))
     ORDER BY random() LIMIT $6`,
    [userId, currentWordId, statuses, settings.maxFrequencyRank, settings.includeUnknownFrequency, limit]
  );
  const rows = [...primary.rows];
  if (rows.length < limit) {
    const existingIds = rows.map((row) => row.id);
    const fallback = await db.query(
      `SELECT id, word_original, translations_raw FROM words
       WHERE user_id = $1 AND id <> $2 AND is_active = true AND id <> ALL($3::uuid[])
       ORDER BY random() LIMIT $4`,
      [userId, currentWordId, existingIds, limit - rows.length]
    );
    rows.push(...fallback.rows);
  }
  return rows;
}

function pickQuestionType(settings) {
  if (settings.trainingDirectionMode === "ru_to_en_only") return "RU_TO_EN";
  if (settings.trainingDirectionMode === "en_to_ru_only") return "EN_TO_RU";
  return Math.random() < 0.5 ? "RU_TO_EN" : "EN_TO_RU";
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, passwordHash]);
    const user = result.rows[0];
    await ensureTrainingSettings(user.id);
    return res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "User already exists" });
    return handleServerError(res, error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const result = await db.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    await ensureTrainingSettings(user.id);
    return res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = $1", [req.user.id]);
    if (!result.rows[0]) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.post("/api/english-words/import", requireAuth, async (req, res) => {
  const rows = extractWordsPayload(req.body);
  if (!rows) return res.status(400).json({ error: "INVALID_JSON", message: "Файл должен быть валидным JSON со списком слов." });

  const report = { created: 0, updated: 0, skipped: 0, duplicatesInFile: 0, statusChanged: 0, errors: [] };
  const seen = new Set();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 1;
      const item = rows[index] || {};
      const wordOriginal = toTrimmed(item.word);
      const translationsRaw = toTrimmed(item.translations);
      const wordNormalized = normalizeWord(wordOriginal);
      if (!wordOriginal || !wordNormalized) {
        report.skipped += 1;
        report.errors.push({ row: rowNumber, word: wordOriginal, reason: "word is empty" });
        continue;
      }
      if (!translationsRaw) {
        report.skipped += 1;
        report.errors.push({ row: rowNumber, word: wordOriginal, reason: "translations is empty" });
        continue;
      }
      if (seen.has(wordNormalized)) report.duplicatesInFile += 1;
      seen.add(wordNormalized);

      const progress = toInt(item.progress, 0);
      const learnedAt = parseImportedDate(item.learnedAt);
      const status = computeStatus(progress, learnedAt);
      const frequency = parseFrequency(item.frequency);
      const existing = await client.query("SELECT id, status FROM words WHERE user_id = $1 AND word_normalized = $2", [req.user.id, wordNormalized]);

      const params = [
        req.user.id,
        wordOriginal,
        wordNormalized,
        translationsRaw,
        toTextOrNull(item.comment),
        toTextOrNull(item.sourceAuthor),
        toTextOrNull(item.sourceTitle),
        toTextOrNull(item.sentence),
        frequency.frequencyRaw,
        frequency.frequencyRank,
        frequency.frequencyIsOpenEnd,
        progress,
        status,
        toOptionalInt(item.repeated),
        parseImportedDate(item.lastTrainedAt),
        parseImportedDate(item.nextTrainAt),
        learnedAt,
        parseImportedDate(item.addedAt),
      ];

      let wordId;
      if (existing.rows[0]) {
        if (existing.rows[0].status !== status) report.statusChanged += 1;
        const update = await client.query(
          `UPDATE words SET
            word_original = $2, translations_raw = $4, comment = $5, source_author = $6, source_title = $7,
            sentence = $8, frequency_raw = $9, frequency_rank = $10, frequency_is_open_end = $11,
            progress = $12, status = $13, repeated_imported = $14, last_trained_at_imported = $15,
            next_train_at_imported = $16, learned_at = $17, added_at_imported = $18,
            last_imported_at = now(), updated_at = now()
           WHERE user_id = $1 AND word_normalized = $3 RETURNING id`,
          params
        );
        wordId = update.rows[0].id;
        report.updated += 1;
        await ensureStatsForWord(client, req.user.id, wordId, status, false);
      } else {
        const insert = await client.query(
          `INSERT INTO words (
            user_id, word_original, word_normalized, translations_raw, comment, source_author, source_title, sentence,
            frequency_raw, frequency_rank, frequency_is_open_end, progress, status, repeated_imported,
            last_trained_at_imported, next_train_at_imported, learned_at, added_at_imported
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
          params
        );
        wordId = insert.rows[0].id;
        report.created += 1;
        await ensureStatsForWord(client, req.user.id, wordId, status, true);
      }
    }
    await client.query("COMMIT");
    return res.json(report);
  } catch (error) {
    await client.query("ROLLBACK");
    return handleServerError(res, error);
  } finally {
    client.release();
  }
});

app.get("/api/english-words/settings", requireAuth, async (req, res) => {
  try {
    const row = await getTrainingSettings(req.user.id);
    return res.json(settingsFromRow(row));
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.patch("/api/english-words/settings", requireAuth, async (req, res) => {
  try {
    const settings = normalizeSettingsPayload(req.body, true);
    await ensureTrainingSettings(req.user.id);
    const result = await db.query(
      `UPDATE user_training_settings SET
        max_frequency_rank = $1, include_unknown_frequency = $2, ru_to_en_options_count = $3,
        en_to_ru_options_count = $4, training_direction_mode = $5, hide_options_until_reveal = $6,
        auto_start_word_on_training = $7, updated_at = now()
       WHERE user_id = $8 RETURNING *`,
      [
        settings.maxFrequencyRank,
        settings.includeUnknownFrequency,
        settings.ruToEnOptionsCount,
        settings.enToRuOptionsCount,
        settings.trainingDirectionMode,
        settings.hideOptionsUntilReveal,
        settings.autoStartWordOnTraining,
        req.user.id,
      ]
    );
    return res.json(settingsFromRow(result.rows[0]));
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/english-words/stats", requireAuth, async (req, res) => {
  try {
    const settings = settingsFromRow(await getTrainingSettings(req.user.id));
    const [inProgress, notStarted, all] = await Promise.all([
      getModeStats(req.user.id, "in_progress", settings),
      getModeStats(req.user.id, "not_started", settings),
      getModeStats(req.user.id, "all", settings),
    ]);
    return res.json({ inProgress, notStarted, all });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.post("/api/english-words/trainings", requireAuth, async (req, res) => {
  try {
    const mode = String(req.body.mode || "");
    if (!MODES.has(mode)) return res.status(400).json({ error: "INVALID_TRAINING_MODE", message: "Недопустимый режим тренировки." });
    const globalSettingsRow = await getTrainingSettings(req.user.id);
    const baseSnapshot = settingsSnapshotFromRow(globalSettingsRow);
    const settingsSnapshot = req.body.overrideSettings
      ? { ...baseSnapshot, ...normalizeSettingsPayload(req.body.overrideSettings, false) }
      : baseSnapshot;
    const modeStats = await getModeStats(req.user.id, mode, settingsSnapshot);
    if (modeStats.total === 0) return res.status(400).json({ error: "NO_WORDS_AVAILABLE", message: "Нет слов для тренировки с выбранными настройками." });
    const activeWordsCount = await db.query("SELECT COUNT(*)::int AS total FROM words WHERE user_id = $1 AND is_active = true", [req.user.id]);
    if (Number(activeWordsCount.rows[0]?.total || 0) < 2) {
      return res.status(400).json({ error: "NOT_ENOUGH_OPTIONS", message: "Недостаточно слов для формирования вариантов ответа." });
    }
    const result = await db.query(
      "INSERT INTO training_sessions (user_id, mode, settings_snapshot) VALUES ($1, $2, $3::jsonb) RETURNING id, mode, settings_snapshot",
      [req.user.id, mode, JSON.stringify(settingsSnapshot)]
    );
    return res.status(201).json({ sessionId: result.rows[0].id, mode: result.rows[0].mode, settingsSnapshot: result.rows[0].settings_snapshot });
  } catch (error) {
    return handleServerError(res, error);
  }
});

app.get("/api/english-words/trainings/:sessionId/next", requireAuth, async (req, res) => {
  try {
    const sessionResult = await db.query("SELECT * FROM training_sessions WHERE id = $1 AND user_id = $2", [req.params.sessionId, req.user.id]);
    const session = sessionResult.rows[0];
    if (!session || session.status !== "active") return res.status(404).json({ error: "TRAINING_NOT_FOUND" });
    const word = await selectNextWord(req.user.id, session);
    if (!word) return res.json({ finished: true, message: "Текущий круг тренировки завершён." });
    const questionType = pickQuestionType(session.settings_snapshot);
    const optionsCount = questionType === "RU_TO_EN" ? session.settings_snapshot.ruToEnOptionsCount : session.settings_snapshot.enToRuOptionsCount;
    const distractors = await getDistractors(req.user.id, session.mode, session.settings_snapshot, word.id, optionsCount - 1);
    if (distractors.length < 1) return res.status(400).json({ error: "NOT_ENOUGH_OPTIONS", message: "Недостаточно слов для формирования вариантов ответа." });
    const optionRows = [word, ...distractors];
    const options = shuffle(optionRows).map((item) => ({
      id: item.id,
      text: questionType === "RU_TO_EN" ? item.word_original : item.translations_raw,
    }));
    const prompt = questionType === "RU_TO_EN" ? word.translations_raw : word.word_original;
    const snapshot = {
      wordId: word.id,
      questionType,
      prompt,
      options,
      hideOptionsUntilReveal: Boolean(session.settings_snapshot.hideOptionsUntilReveal),
      autoAdvanceAfterAnswer: Boolean(session.settings_snapshot.autoStartWordOnTraining),
    };
    await db.query("UPDATE training_sessions SET current_question_snapshot = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3", [JSON.stringify(snapshot), session.id, req.user.id]);
    return res.json(snapshot);
  } catch (error) {
    return handleServerError(res, error);
  }
});

async function recordAttempt({ req, selectedOptionId, skipped }) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query("SELECT * FROM training_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE", [req.params.sessionId, req.user.id]);
    const session = sessionResult.rows[0];
    if (!session || session.status !== "active") throw Object.assign(new Error("TRAINING_NOT_FOUND"), { status: 404 });
    const snapshot = session.current_question_snapshot;
    const wordId = req.body.wordId;
    const questionType = req.body.questionType;
    if (!snapshot || snapshot.wordId !== wordId || snapshot.questionType !== questionType || !QUESTION_TYPES.has(questionType)) {
      throw Object.assign(new Error("QUESTION_MISMATCH"), { status: 400 });
    }
    const correctOptionId = snapshot.wordId;
    const isCorrect = skipped ? null : selectedOptionId === correctOptionId;
    await client.query(
      `INSERT INTO training_attempts (session_id, user_id, word_id, scope, question_type, prompt, options_snapshot, correct_option_id, selected_option_id, is_correct)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
      [session.id, req.user.id, wordId, session.mode, questionType, snapshot.prompt, JSON.stringify(snapshot.options.map((option) => ({ ...option, isCorrect: option.id === correctOptionId }))), correctOptionId, skipped ? null : selectedOptionId, isCorrect]
    );
    await ensureStatForWord(client, req.user.id, wordId, session.mode, 0);
    await client.query(
      `UPDATE word_training_stats SET
        shown_count = shown_count + 1,
        answered_count = answered_count + $4,
        correct_count = correct_count + $5,
        wrong_count = wrong_count + $6,
        skipped_count = skipped_count + $7,
        shown_ru_to_en_count = shown_ru_to_en_count + $8,
        shown_en_to_ru_count = shown_en_to_ru_count + $9,
        last_answered_at = now(), updated_at = now()
       WHERE user_id = $1 AND word_id = $2 AND scope = $3`,
      [req.user.id, wordId, session.mode, skipped ? 0 : 1, isCorrect === true ? 1 : 0, isCorrect === false ? 1 : 0, skipped ? 1 : 0, questionType === "RU_TO_EN" ? 1 : 0, questionType === "EN_TO_RU" ? 1 : 0]
    );
    await client.query("UPDATE training_sessions SET current_question_snapshot = NULL, updated_at = now() WHERE id = $1", [session.id]);
    await client.query("COMMIT");
    const correctOption = snapshot.options.find((option) => option.id === correctOptionId);
    return { skipped, isCorrect, correctOptionId, correctText: correctOption?.text || "" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.post("/api/english-words/trainings/:sessionId/answer", requireAuth, async (req, res) => {
  try {
    const selectedOptionId = String(req.body.selectedOptionId || "");
    const result = await recordAttempt({ req, selectedOptionId, skipped: false });
    return res.json({ isCorrect: result.isCorrect, correctOptionId: result.correctOptionId, correctText: result.correctText });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return handleServerError(res, error);
  }
});

app.post("/api/english-words/trainings/:sessionId/skip", requireAuth, async (req, res) => {
  try {
    await recordAttempt({ req, selectedOptionId: null, skipped: true });
    return res.json({ skipped: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return handleServerError(res, error);
  }
});

app.post("/api/english-words/trainings/:sessionId/finish", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE training_sessions SET status = 'finished', finished_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING status, finished_at",
      [req.params.sessionId, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "TRAINING_NOT_FOUND" });
    return res.json({ status: result.rows[0].status, finishedAt: result.rows[0].finished_at });
  } catch (error) {
    return handleServerError(res, error);
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`English Words backend listening on ${PORT}`));
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
