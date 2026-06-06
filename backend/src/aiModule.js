const crypto = require("crypto");

const PROMPT_VERSION = "context_examples_v1";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_DISTRIBUTION = { simple: 4, medium: 3, hard: 3 };
const ALLOWED_DIFFICULTIES = new Set(["simple", "medium", "hard"]);
const ALLOWED_PARTS_OF_SPEECH = new Set([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "phrase",
  "phrasal_verb",
  "other",
]);
const ALLOWED_GRAMMAR_FORMS = new Set([
  "base",
  "past_simple",
  "past_participle",
  "present_simple",
  "third_person_singular",
  "gerund",
  "plural",
  "comparative",
  "superlative",
  "adverb",
  "fixed_phrase",
  "phrasal_verb_past",
  "other",
]);

const SYSTEM_PROMPT = `You are an assistant that creates English cloze sentence examples for Russian-speaking English learners.

Your task:
Generate natural English sentences where a target English word or phrase is used in context.
The learner will see the sentence with a blank and choose the correct word/form.

Return ONLY valid JSON.
Do not use Markdown.
Do not add explanations outside JSON.

Rules:
1. Use the target word in the meaning suggested by its Russian translations and source sentence.
2. The target may be inflected naturally: verbs can become past tense, gerunds, participles; nouns can become plural; adjectives can become comparative/superlative if natural.
3. answerText must be the exact text that fills the blank.
4. In fullSentenceMarked, wrap the exact answerText with [[ and ]].
5. The marked answer must appear exactly once.
6. Do not use the target word elsewhere in the same sentence.
7. Do not create definition-like sentences such as "The word X means...".
8. Keep sentences natural and useful for reading.
9. Keep content neutral and safe.
10. For phrasal verbs and multiword expressions, keep the answer as one contiguous phrase.
11. Avoid using the target answer as the first word of the sentence unless it is clearly natural.
12. Russian translation must translate the full English sentence naturally.
13. Generate diverse contexts. Do not repeat the same pattern.`;

function toTrimmed(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toFloat(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, normalized));
}

function normalizeLooseText(value) {
  let text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  text = text.replace(/^[\s'"‘’“”.,!?:;]+/u, "");
  text = text.replace(/[\s'"‘’“”.,!?:;]+$/u, "");
  return text;
}

function maskApiKey(apiKey) {
  const value = toTrimmed(apiKey);
  if (!value) return "";
  const start = value.slice(0, Math.min(3, value.length));
  const end = value.slice(-4);
  return `${start}••••••••${end}`;
}

function getEncryptionSecret() {
  const secret = String(process.env.AI_SETTINGS_ENCRYPTION_SECRET || "");
  if (secret.length < 16) {
    throw new Error("AI_SETTINGS_ENCRYPTION_SECRET is not configured");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey) {
  if (!toTrimmed(apiKey)) return null;
  const key = getEncryptionSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(apiKey), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptApiKey(payload) {
  if (!payload) return "";
  const [ivEncoded, tagEncoded, encryptedEncoded] = String(payload).split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error("Invalid encrypted API key payload");
  }
  const key = getEncryptionSecret();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivEncoded, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function buildImportedMarkedSentence(sentence) {
  const raw = toTrimmed(sentence);
  if (!raw) return null;
  const match = raw.match(/<<(.*?)>>/u);
  if (!match) return null;
  const answer = toTrimmed(match[1]);
  if (!answer) return null;
  return raw.replace(/<<(.*?)>>/u, `[[${answer}]]`);
}

function buildContextExampleRecord(input) {
  const fullSentenceMarked = toTrimmed(input.fullSentenceMarked);
  const matches = [...fullSentenceMarked.matchAll(/\[\[(.*?)\]\]/gu)];
  if (matches.length !== 1) {
    return { valid: false, reason: "fullSentenceMarked must contain exactly one [[...]] block" };
  }

  const answerText = toTrimmed(matches[0][1]);
  if (!answerText) {
    return { valid: false, reason: "answerText is empty" };
  }

  const fullSentence = fullSentenceMarked.replace(/\[\[(.*?)\]\]/u, answerText).replace(/\s+/g, " ").trim();
  const maskedSentence = fullSentenceMarked.replace(/\[\[(.*?)\]\]/u, "_____").replace(/\s+/g, " ").trim();
  const answerNormalized = normalizeLooseText(answerText);
  const fullSentenceNormalized = normalizeLooseText(fullSentence);

  if (!fullSentence || !maskedSentence || !answerNormalized) {
    return { valid: false, reason: "failed to derive sentence fields" };
  }

  return {
    valid: true,
    value: {
      userId: input.userId,
      wordId: input.wordId,
      generationJobId: input.generationJobId || null,
      source: input.source,
      difficulty: input.difficulty,
      cefr: toTrimmed(input.cefr) || null,
      fullSentence,
      fullSentenceMarked,
      fullSentenceNormalized,
      maskedSentence,
      answerText,
      answerNormalized,
      ruTranslation: toTrimmed(input.ruTranslation) || null,
      partOfSpeech: input.partOfSpeech,
      grammarForm: input.grammarForm,
      aiModel: input.aiModel || null,
      promptVersion: input.promptVersion || null,
      isActive: input.isActive !== false,
      qualityStatus: input.qualityStatus || "valid",
      rejectReason: input.rejectReason || null,
    },
  };
}

async function ensureAiProviderSettings(db, userId, client = db) {
  await client.query(
    `INSERT INTO ai_provider_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getAiProviderSettings(db, userId, client = db) {
  await ensureAiProviderSettings(db, userId, client);
  const result = await client.query(
    "SELECT * FROM ai_provider_settings WHERE user_id = $1",
    [userId]
  );
  return result.rows[0];
}

function aiSettingsResponse(row) {
  return {
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.api_key_encrypted),
    apiKeyMasked: row.api_key_encrypted ? maskApiKey(decryptApiKey(row.api_key_encrypted)) : "",
    modelName: row.model_name,
    temperature: Number(row.temperature),
    maxOutputTokens: Number(row.max_output_tokens),
    wordsPerBatch: Number(row.words_per_batch),
    requestTimeoutSec: Number(row.request_timeout_sec),
    lastCheckStatus: row.last_check_status,
    lastCheckAt: row.last_check_at,
    lastCheckError: row.last_check_error,
  };
}

function normalizeAiSettingsPayload(payload = {}) {
  return {
    baseUrl: toTrimmed(payload.baseUrl) || DEFAULT_BASE_URL,
    apiKey: payload.apiKey === undefined ? undefined : toTrimmed(payload.apiKey),
    modelName: toTrimmed(payload.modelName) || DEFAULT_MODEL,
    temperature: clamp(payload.temperature, 0, 1, 0.4),
    maxOutputTokens: Math.max(1, toInt(payload.maxOutputTokens, 8000)),
    wordsPerBatch: clamp(payload.wordsPerBatch, 1, 10, 5),
    requestTimeoutSec: clamp(payload.requestTimeoutSec, 5, 300, 60),
  };
}

function normalizeDistribution(total, distribution = DEFAULT_DISTRIBUTION) {
  const simple = Math.max(0, toInt(distribution.simple, DEFAULT_DISTRIBUTION.simple));
  const medium = Math.max(0, toInt(distribution.medium, DEFAULT_DISTRIBUTION.medium));
  const hard = Math.max(0, toInt(distribution.hard, DEFAULT_DISTRIBUTION.hard));
  const sum = simple + medium + hard;
  if (sum === total) return { simple, medium, hard };
  if (total <= 0) return { simple: 0, medium: 0, hard: 0 };
  const scaled = {
    simple: Math.round((simple / sum) * total) || 0,
    medium: Math.round((medium / sum) * total) || 0,
    hard: Math.round((hard / sum) * total) || 0,
  };
  let current = scaled.simple + scaled.medium + scaled.hard;
  while (current < total) {
    scaled.simple += 1;
    current += 1;
  }
  while (current > total) {
    if (scaled.hard > 0) scaled.hard -= 1;
    else if (scaled.medium > 0) scaled.medium -= 1;
    else if (scaled.simple > 0) scaled.simple -= 1;
    current -= 1;
  }
  return scaled;
}

async function syncImportedContextExamplesForUser(db, userId, client = db) {
  const result = await client.query(
    `SELECT id, sentence
     FROM words
     WHERE user_id = $1 AND is_active = true AND sentence IS NOT NULL AND btrim(sentence) <> ''`,
    [userId]
  );

  let created = 0;
  for (const row of result.rows) {
    const marked = buildImportedMarkedSentence(row.sentence);
    if (!marked) continue;
    const built = buildContextExampleRecord({
      userId,
      wordId: row.id,
      source: "imported",
      difficulty: "medium",
      cefr: null,
      fullSentenceMarked: marked,
      ruTranslation: null,
      partOfSpeech: "other",
      grammarForm: "other",
      promptVersion: PROMPT_VERSION,
    });
    if (!built.valid) continue;
    const record = built.value;
    const insert = await client.query(
      `INSERT INTO word_context_examples (
        user_id, word_id, generation_job_id, source, difficulty, cefr,
        full_sentence, full_sentence_marked, full_sentence_normalized,
        masked_sentence, answer_text, answer_normalized, ru_translation,
        part_of_speech, grammar_form, ai_model, prompt_version,
        is_active, quality_status, reject_reason
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,
        $10,$11,$12,$13,
        $14,$15,$16,$17,
        $18,$19,$20
      ) ON CONFLICT (user_id, word_id, full_sentence_normalized) DO NOTHING
      RETURNING id`,
      [
        record.userId,
        record.wordId,
        record.generationJobId,
        record.source,
        record.difficulty,
        record.cefr,
        record.fullSentence,
        record.fullSentenceMarked,
        record.fullSentenceNormalized,
        record.maskedSentence,
        record.answerText,
        record.answerNormalized,
        record.ruTranslation,
        record.partOfSpeech,
        record.grammarForm,
        record.aiModel,
        record.promptVersion,
        record.isActive,
        record.qualityStatus,
        record.rejectReason,
      ]
    );
    if (insert.rows[0]) created += 1;
  }
  return created;
}

function buildStructuredResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: PROMPT_VERSION,
      schema: {
        type: "object",
        properties: {
          version: { type: "string" },
          items: { type: "array" },
        },
        required: ["version", "items"],
        additionalProperties: true,
      },
    },
  };
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("INVALID_JSON_RESPONSE");
  }
}

async function callChatCompletions(settings, apiKey, body, allowStructured = true) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(settings.request_timeout_sec || 60) * 1000);
  try {
    const response = await fetch(`${settings.base_url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `AI request failed: ${response.status}`;
      if (allowStructured && response.status >= 400 && response.status < 500) {
        return callChatCompletions(settings, apiKey, { ...body, response_format: undefined }, false);
      }
      const error = new Error(message);
      error.code = payload?.error?.code || `HTTP_${response.status}`;
      throw error;
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("EMPTY_AI_RESPONSE");
    }
    return parseJsonPayload(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildTestRequest(settings) {
  return {
    model: settings.model_name,
    messages: [
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: "Return exactly this JSON: {\"ok\":true}" },
    ],
    temperature: 0,
    max_tokens: 100,
    response_format: buildStructuredResponseFormat(),
  };
}

function buildEnrichRequestBody(modelName, temperature, maxTokens, batch) {
  const wordsJson = JSON.stringify(batch, null, 2);
  const userPrompt = `Generate context examples for the following English words.

Return this JSON structure:
{
  "version": "${PROMPT_VERSION}",
  "items": [
    {
      "wordId": "string",
      "baseWord": "string",
      "contexts": [
        {
          "difficulty": "simple | medium | hard",
          "cefr": "A1 | A2 | B1 | B2",
          "fullSentenceMarked": "English sentence with [[answerText]] marked",
          "answerText": "exact answer text",
          "maskedSentence": "same sentence with _____ instead of answerText",
          "ruTranslation": "Russian translation of the full sentence",
          "partOfSpeech": "noun | verb | adjective | adverb | preposition | conjunction | phrase | phrasal_verb | other",
          "grammarForm": "base | past_simple | past_participle | present_simple | third_person_singular | gerund | plural | comparative | superlative | adverb | fixed_phrase | phrasal_verb_past | other"
        }
      ]
    }
  ]
}

Input words:
${wordsJson}`;

  return {
    model: modelName,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: buildStructuredResponseFormat(),
  };
}

function validateContextResponse(payload, batchMap) {
  if (!payload || payload.version !== PROMPT_VERSION || !Array.isArray(payload.items)) {
    throw new Error("AI returned invalid top-level JSON structure");
  }

  const validRecords = [];
  const invalidRecords = [];

  for (const item of payload.items) {
    const batchWord = batchMap.get(item.wordId);
    if (!batchWord || !Array.isArray(item.contexts)) {
      invalidRecords.push({ wordId: item.wordId || null, reason: "Unknown wordId or missing contexts array" });
      continue;
    }

    for (const context of item.contexts) {
      const difficulty = toTrimmed(context.difficulty);
      const partOfSpeech = toTrimmed(context.partOfSpeech);
      const grammarForm = toTrimmed(context.grammarForm);
      if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
        invalidRecords.push({ wordId: item.wordId, reason: "Invalid difficulty" });
        continue;
      }
      if (!ALLOWED_PARTS_OF_SPEECH.has(partOfSpeech)) {
        invalidRecords.push({ wordId: item.wordId, reason: "Invalid partOfSpeech" });
        continue;
      }
      if (!ALLOWED_GRAMMAR_FORMS.has(grammarForm)) {
        invalidRecords.push({ wordId: item.wordId, reason: "Invalid grammarForm" });
        continue;
      }
      const built = buildContextExampleRecord({
        userId: batchWord.userId,
        wordId: batchWord.wordId,
        generationJobId: batchWord.generationJobId,
        source: "ai",
        difficulty,
        cefr: context.cefr,
        fullSentenceMarked: context.fullSentenceMarked,
        ruTranslation: context.ruTranslation,
        partOfSpeech,
        grammarForm,
        aiModel: batchWord.modelName,
        promptVersion: PROMPT_VERSION,
      });
      if (!built.valid) {
        invalidRecords.push({ wordId: item.wordId, reason: built.reason });
        continue;
      }
      validRecords.push(built.value);
    }
  }

  return { validRecords, invalidRecords };
}

function createWordTargets(words, request) {
  const sentencesPerWord = Math.max(1, toInt(request.sentencesPerWord, 10));
  const distribution = normalizeDistribution(sentencesPerWord, request.difficultyDistribution || DEFAULT_DISTRIBUTION);
  return words.map((word) => {
    const existingCount = Number(word.active_context_examples_count || 0);
    const missingCount = request.generationMode === "generate_missing"
      ? Math.max(0, sentencesPerWord - existingCount)
      : sentencesPerWord;
    return {
      ...word,
      targetCount: missingCount,
      simpleCount: Math.min(distribution.simple, missingCount),
      mediumCount: Math.min(distribution.medium, Math.max(0, missingCount - distribution.simple)),
      hardCount: Math.max(0, missingCount - Math.min(distribution.simple, missingCount) - Math.min(distribution.medium, Math.max(0, missingCount - distribution.simple))),
    };
  }).filter((word) => word.targetCount > 0 || request.generationMode === "regenerate");
}

async function selectWordsForEnrichment(db, userId, request, trainingSettings, client = db) {
  const statuses = request.wordScope === "in_progress"
    ? ["in_progress"]
    : request.wordScope === "not_started"
      ? ["not_started"]
      : ["not_started", "in_progress"];

  const filters = [
    "w.user_id = $1",
    "w.is_active = true",
    "w.status = ANY($2::text[])",
  ];
  const params = [userId, statuses];

  if (toBoolean(request.useFrequencyFilter)) {
    filters.push("((w.frequency_rank IS NOT NULL AND w.frequency_rank <= $3) OR (w.frequency_rank IS NULL AND $4::boolean = true))");
    params.push(trainingSettings.maxFrequencyRank, trainingSettings.includeUnknownFrequency);
  }

  const limit = Math.max(1, toInt(request.maxWordsPerJob, 50));
  const query = `
    SELECT w.id, w.word_original, w.translations_raw, w.sentence,
      COALESCE(active_examples.total, 0)::int AS active_context_examples_count
    FROM words w
    LEFT JOIN (
      SELECT word_id, COUNT(*)::int AS total
      FROM word_context_examples
      WHERE user_id = $1 AND is_active = true
      GROUP BY word_id
    ) active_examples ON active_examples.word_id = w.id
    WHERE ${filters.join(" AND ")}
    ORDER BY w.created_at ASC
    LIMIT ${limit}`;

  let rows = (await client.query(query, params)).rows;

  if (request.wordScope === "missing_contexts") {
    const target = Math.max(1, toInt(request.sentencesPerWord, 10));
    rows = rows.filter((row) => Number(row.active_context_examples_count || 0) < target);
  }

  return rows;
}

async function insertContextExample(db, record, client = db) {
  return client.query(
    `INSERT INTO word_context_examples (
      user_id, word_id, generation_job_id, source, difficulty, cefr,
      full_sentence, full_sentence_marked, full_sentence_normalized,
      masked_sentence, answer_text, answer_normalized, ru_translation,
      part_of_speech, grammar_form, ai_model, prompt_version,
      is_active, quality_status, reject_reason
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,
      $10,$11,$12,$13,
      $14,$15,$16,$17,
      $18,$19,$20
    ) ON CONFLICT (user_id, word_id, full_sentence_normalized) DO NOTHING
    RETURNING id`,
    [
      record.userId,
      record.wordId,
      record.generationJobId,
      record.source,
      record.difficulty,
      record.cefr,
      record.fullSentence,
      record.fullSentenceMarked,
      record.fullSentenceNormalized,
      record.maskedSentence,
      record.answerText,
      record.answerNormalized,
      record.ruTranslation,
      record.partOfSpeech,
      record.grammarForm,
      record.aiModel,
      record.promptVersion,
      record.isActive,
      record.qualityStatus,
      record.rejectReason,
    ]
  );
}

async function processGenerationJob(db, userId, jobId) {
  const jobResult = await db.query("SELECT * FROM context_generation_jobs WHERE id = $1 AND user_id = $2", [jobId, userId]);
  const job = jobResult.rows[0];
  if (!job || job.status === "cancelled") return;

  await db.query("UPDATE context_generation_jobs SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1", [jobId]);

  const settings = job.settings_snapshot;
  const aiRow = await getAiProviderSettings(db, userId);
  const apiKey = decryptApiKey(aiRow.api_key_encrypted);
  const targets = Array.isArray(settings.selectedWords) ? settings.selectedWords : [];

  let processedWordsCount = 0;
  let generatedExamplesCount = 0;
  let validExamplesCount = 0;
  let invalidExamplesCount = 0;
  let failedWordsCount = 0;
  const errorDetails = [];

  for (let index = 0; index < targets.length; index += settings.wordsPerBatch) {
    const latestJob = (await db.query("SELECT status FROM context_generation_jobs WHERE id = $1", [jobId])).rows[0];
    if (!latestJob || latestJob.status === "cancelled") {
      await db.query(
        `UPDATE context_generation_jobs
         SET status = 'cancelled', processed_words_count = $2, generated_examples_count = $3,
             valid_examples_count = $4, invalid_examples_count = $5, failed_words_count = $6,
             error_details = $7::jsonb, finished_at = now(), updated_at = now()
         WHERE id = $1`,
        [jobId, processedWordsCount, generatedExamplesCount, validExamplesCount, invalidExamplesCount, failedWordsCount, JSON.stringify(errorDetails)]
      );
      return;
    }

    const batch = targets.slice(index, index + settings.wordsPerBatch).map((item) => ({
      wordId: item.wordId,
      word: item.word,
      translations: item.translations,
      sourceSentence: item.sourceSentence,
      targetCount: item.targetCount,
      simpleCount: item.simpleCount,
      mediumCount: item.mediumCount,
      hardCount: item.hardCount,
    }));

    try {
      const response = await callChatCompletions(
        {
          base_url: settings.baseUrl,
          model_name: settings.modelName,
          request_timeout_sec: settings.requestTimeoutSec,
        },
        apiKey,
        buildEnrichRequestBody(settings.modelName, settings.temperature, settings.maxOutputTokens, batch)
      );

      const batchMap = new Map(batch.map((item) => [item.wordId, {
        userId,
        wordId: item.wordId,
        generationJobId: jobId,
        modelName: settings.modelName,
      }]));

      const validated = validateContextResponse(response, batchMap);
      generatedExamplesCount += validated.validRecords.length + validated.invalidRecords.length;
      invalidExamplesCount += validated.invalidRecords.length;

      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");

        if (settings.generationMode === "regenerate") {
          const wordIds = [...new Set(batch.map((item) => item.wordId))];
          await client.query(
            `UPDATE word_context_examples
             SET is_active = false, updated_at = now()
             WHERE user_id = $1 AND source = 'ai' AND word_id = ANY($2::uuid[])`,
            [userId, wordIds]
          );
        }

        for (const record of validated.validRecords) {
          const insert = await insertContextExample(db, record, client);
          if (insert.rows[0]) {
            validExamplesCount += 1;
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      processedWordsCount += batch.length;
    } catch (error) {
      failedWordsCount += batch.length;
      processedWordsCount += batch.length;
      errorDetails.push(...batch.map((item) => ({ word: item.word, reason: error.message || "AI batch failed" })));
    }

    await db.query(
      `UPDATE context_generation_jobs
       SET processed_words_count = $2,
           generated_examples_count = $3,
           valid_examples_count = $4,
           invalid_examples_count = $5,
           failed_words_count = $6,
           error_details = $7::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [jobId, processedWordsCount, generatedExamplesCount, validExamplesCount, invalidExamplesCount, failedWordsCount, JSON.stringify(errorDetails)]
    );
  }

  const finalStatus = failedWordsCount > 0 && validExamplesCount === 0 ? "failed" : "completed";
  const errorMessage = failedWordsCount > 0 ? "Some words failed during generation" : null;

  await db.query(
    `UPDATE context_generation_jobs
     SET status = $2, processed_words_count = $3, generated_examples_count = $4,
         valid_examples_count = $5, invalid_examples_count = $6, failed_words_count = $7,
         error_message = $8, error_details = $9::jsonb, finished_at = now(), updated_at = now()
     WHERE id = $1`,
    [jobId, finalStatus, processedWordsCount, generatedExamplesCount, validExamplesCount, invalidExamplesCount, failedWordsCount, errorMessage, JSON.stringify(errorDetails)]
  );
}

function registerAiRoutes(app, { db, requireAuth, getTrainingSettings }) {
  app.get("/api/english-words/ai-settings", requireAuth, async (req, res) => {
    try {
      const row = await getAiProviderSettings(db, req.user.id);
      return res.json(aiSettingsResponse(row));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/english-words/ai-settings", requireAuth, async (req, res) => {
    try {
      const payload = normalizeAiSettingsPayload(req.body);
      await ensureAiProviderSettings(db, req.user.id);
      const row = await getAiProviderSettings(db, req.user.id);
      const encryptedApiKey = payload.apiKey === undefined
        ? row.api_key_encrypted
        : payload.apiKey
          ? encryptApiKey(payload.apiKey)
          : row.api_key_encrypted;

      const result = await db.query(
        `UPDATE ai_provider_settings SET
          base_url = $1,
          api_key_encrypted = $2,
          model_name = $3,
          temperature = $4,
          max_output_tokens = $5,
          words_per_batch = $6,
          request_timeout_sec = $7,
          updated_at = now()
         WHERE user_id = $8
         RETURNING *`,
        [
          payload.baseUrl,
          encryptedApiKey,
          payload.modelName,
          payload.temperature,
          payload.maxOutputTokens,
          payload.wordsPerBatch,
          payload.requestTimeoutSec,
          req.user.id,
        ]
      );

      return res.json(aiSettingsResponse(result.rows[0]));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/english-words/ai-settings/test", requireAuth, async (req, res) => {
    try {
      const row = await getAiProviderSettings(db, req.user.id);
      if (!row.api_key_encrypted) {
        return res.status(400).json({ status: "error", code: "MISSING_API_KEY", message: "Сначала сохраните API ключ." });
      }

      const apiKey = decryptApiKey(row.api_key_encrypted);
      const result = await callChatCompletions(row, apiKey, buildTestRequest(row));
      const ok = result && result.ok === true;

      await db.query(
        `UPDATE ai_provider_settings
         SET last_check_status = $1, last_check_at = now(), last_check_error = $2, updated_at = now()
         WHERE user_id = $3`,
        [ok ? "success" : "invalid_json", ok ? null : "Model did not return {\"ok\":true}", req.user.id]
      );

      if (!ok) {
        return res.status(400).json({ status: "error", code: "INVALID_JSON", message: "Модель не вернула валидный JSON." });
      }

      return res.json({ status: "success", message: "Подключение работает." });
    } catch (error) {
      const message = error.message || "Ошибка подключения";
      const code = String(error.code || "CONNECTION_ERROR");
      const mappedCode = code.includes("401") || /auth/i.test(code) ? "INVALID_API_KEY" : code;
      await db.query(
        `UPDATE ai_provider_settings
         SET last_check_status = $1, last_check_at = now(), last_check_error = $2, updated_at = now()
         WHERE user_id = $3`,
        ["error", message, req.user.id]
      );
      return res.status(400).json({ status: "error", code: mappedCode, message });
    }
  });

  app.post("/api/english-words/context-examples/enrich", requireAuth, async (req, res) => {
    try {
      await syncImportedContextExamplesForUser(db, req.user.id);
      const aiRow = await getAiProviderSettings(db, req.user.id);
      if (!aiRow.api_key_encrypted) {
        return res.status(400).json({ error: "AI_NOT_CONFIGURED", message: "Сначала настройте AI API." });
      }

      const trainingSettingsRow = await getTrainingSettings(req.user.id);
      const trainingSettings = {
        maxFrequencyRank: Number(trainingSettingsRow.max_frequency_rank),
        includeUnknownFrequency: Boolean(trainingSettingsRow.include_unknown_frequency),
      };

      const request = {
        wordScope: toTrimmed(req.body.wordScope) || "missing_contexts",
        generationMode: toTrimmed(req.body.generationMode) || "generate_missing",
        sentencesPerWord: Math.max(1, toInt(req.body.sentencesPerWord, 10)),
        difficultyDistribution: req.body.difficultyDistribution || DEFAULT_DISTRIBUTION,
        maxWordsPerJob: Math.max(1, toInt(req.body.maxWordsPerJob, 50)),
        wordsPerBatch: clamp(req.body.wordsPerBatch ?? aiRow.words_per_batch, 1, 10, 5),
        useFrequencyFilter: toBoolean(req.body.useFrequencyFilter),
      };

      const selectedWords = await selectWordsForEnrichment(db, req.user.id, request, trainingSettings);
      const targets = createWordTargets(selectedWords, request);

      const settingsSnapshot = {
        baseUrl: aiRow.base_url,
        modelName: aiRow.model_name,
        temperature: Number(aiRow.temperature),
        maxOutputTokens: Number(aiRow.max_output_tokens),
        wordsPerBatch: request.wordsPerBatch,
        requestTimeoutSec: Number(aiRow.request_timeout_sec),
        sentencesPerWord: request.sentencesPerWord,
        distribution: normalizeDistribution(request.sentencesPerWord, request.difficultyDistribution),
        generationMode: request.generationMode,
        wordScope: request.wordScope,
        useFrequencyFilter: request.useFrequencyFilter,
        selectedWords: targets.map((word) => ({
          wordId: word.id,
          word: word.word_original,
          translations: word.translations_raw,
          sourceSentence: word.sentence,
          targetCount: word.targetCount,
          simpleCount: word.simpleCount,
          mediumCount: word.mediumCount,
          hardCount: word.hardCount,
        })),
      };

      const estimatedRequests = targets.length === 0 ? 0 : Math.ceil(targets.length / request.wordsPerBatch);
      const estimatedExamples = targets.reduce((sum, item) => sum + Math.max(0, item.targetCount), 0);

      const result = await db.query(
        `INSERT INTO context_generation_jobs (
          user_id, status, mode, target_words_count, settings_snapshot, prompt_version
        ) VALUES ($1, 'pending', $2, $3, $4::jsonb, $5)
        RETURNING id, status, target_words_count`,
        [req.user.id, request.generationMode, targets.length, JSON.stringify(settingsSnapshot), PROMPT_VERSION]
      );

      const jobId = result.rows[0].id;
      setTimeout(() => {
        processGenerationJob(db, req.user.id, jobId).catch((error) => console.error(error));
      }, 0);

      return res.status(201).json({
        jobId,
        status: result.rows[0].status,
        targetWordsCount: targets.length,
        estimatedExamplesCount: estimatedExamples,
        estimatedAiRequestsCount: estimatedRequests,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/english-words/context-examples/jobs/:jobId", requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, status, target_words_count, processed_words_count, generated_examples_count,
                valid_examples_count, invalid_examples_count, failed_words_count, error_message, error_details
         FROM context_generation_jobs
         WHERE id = $1 AND user_id = $2`,
        [req.params.jobId, req.user.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      const row = result.rows[0];
      return res.json({
        jobId: row.id,
        status: row.status,
        targetWordsCount: Number(row.target_words_count),
        processedWordsCount: Number(row.processed_words_count),
        generatedExamplesCount: Number(row.generated_examples_count),
        validExamplesCount: Number(row.valid_examples_count),
        invalidExamplesCount: Number(row.invalid_examples_count),
        failedWordsCount: Number(row.failed_words_count),
        errorMessage: row.error_message,
        errorDetails: row.error_details || [],
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/english-words/context-examples/jobs/:jobId/cancel", requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `UPDATE context_generation_jobs
         SET status = 'cancelled', finished_at = now(), updated_at = now()
         WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'running')
         RETURNING status`,
        [req.params.jobId, req.user.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      return res.json({ status: result.rows[0].status });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/english-words/context-examples/:contextExampleId/translation", requireAuth, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, ru_translation
         FROM word_context_examples
         WHERE id = $1 AND user_id = $2`,
        [req.params.contextExampleId, req.user.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "CONTEXT_EXAMPLE_NOT_FOUND" });
      return res.json({
        contextExampleId: result.rows[0].id,
        ruTranslation: result.rows[0].ru_translation,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

module.exports = { registerAiRoutes };