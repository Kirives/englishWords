export interface ApiUser {
  id: string;
  email: string;
}

export type TrainingMode = "in_progress" | "not_started" | "all";
export type TrainingDirectionMode = "mixed" | "ru_to_en_only" | "en_to_ru_only";
export type QuestionType = "RU_TO_EN" | "EN_TO_RU";

export interface TrainingSettings {
  maxFrequencyRank: number;
  includeUnknownFrequency: boolean;
  ruToEnOptionsCount: number;
  enToRuOptionsCount: number;
  contextOptionsCount: number;
  trainingDirectionMode: TrainingDirectionMode;
  hideOptionsUntilReveal: boolean;
  autoStartWordOnTraining: boolean;
}

export type TrainingSettingsSnapshot = Omit<TrainingSettings, "autoStartWordOnTraining">;

export interface ModeStats {
  total: number;
  currentCycle: number;
  remainingInCycle: number;
}

export interface StatsResponse {
  inProgress: ModeStats;
  notStarted: ModeStats;
  all: ModeStats;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
  statusChanged: number;
  errors: Array<{ row: number; word: string; reason: string }>;
}

export interface TrainingCreateResponse {
  sessionId: string;
  mode: TrainingMode;
  settingsSnapshot: TrainingSettingsSnapshot;
}

export type QuestionTypeMode = "default" | "context_cloze";

export interface TrainingQuestion {
  wordId: string;
  questionType: QuestionType;
  prompt: string;
  options: Array<{ id: string; wordId?: string; text: string }>;
  hideOptionsUntilReveal: boolean;
  autoAdvanceAfterAnswer: boolean;
  contextExampleId?: string;
  translationAvailable?: boolean;
  fullSentence?: string | null;
  ruTranslation?: string | null;
  correctAnswerText?: string | null;
  finished?: false;
}

export interface TrainingFinished {
  finished: true;
  message: string;
}

export interface AnswerResponse {
  isCorrect: boolean;
  correctOptionId: string;
  correctWordId?: string;
  correctText: string;
  correctAnswerText?: string;
  fullSentence?: string | null;
  ruTranslation?: string | null;
}

export interface AiProviderSettings {
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  modelName: string;
  temperature: number;
  maxOutputTokens: number;
  wordsPerBatch: number;
  requestTimeoutSec: number;
  lastCheckStatus: string;
  lastCheckAt: string | null;
  lastCheckError: string | null;
}

export interface AiProviderSettingsUpdatePayload {
  baseUrl: string;
  apiKey?: string;
  modelName: string;
  temperature: number;
  maxOutputTokens: number;
  wordsPerBatch: number;
  requestTimeoutSec: number;
}

export interface ContextGenerationJob {
  jobId: string;
  status: string;
  targetWordsCount: number;
  processedWordsCount: number;
  generatedExamplesCount: number;
  validExamplesCount: number;
  invalidExamplesCount: number;
  failedWordsCount: number;
  errorMessage?: string | null;
  errorDetails?: Array<{ word: string; reason: string }>;
}

export interface ContextGenerationJobCreateResponse {
  jobId: string;
  status: string;
  targetWordsCount: number;
  estimatedExamplesCount: number;
  estimatedAiRequestsCount: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "english_words_token";

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getStoredToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed: ${response.status}`);
  }

  return data as T;
}

export const api = {
  register(email: string, password: string) {
    return apiRequest<{ token: string; user: ApiUser }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false
    );
  },

  login(email: string, password: string) {
    return apiRequest<{ token: string; user: ApiUser }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false
    );
  },

  me() {
    return apiRequest<{ user: ApiUser }>("/me", { method: "GET" }, true);
  },

  importWords(payload: unknown) {
    return apiRequest<ImportReport>(
      "/english-words/import",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  getSettings() {
    return apiRequest<TrainingSettings>("/english-words/settings", { method: "GET" }, true);
  },

  getAiSettings() {
    return apiRequest<AiProviderSettings>("/english-words/ai-settings", { method: "GET" }, true);
  },

  updateAiSettings(payload: AiProviderSettingsUpdatePayload) {
    return apiRequest<AiProviderSettings>(
      "/english-words/ai-settings",
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  testAiSettings() {
    return apiRequest<{ status: string; message: string }>(
      "/english-words/ai-settings/test",
      { method: "POST" },
      true
    );
  },

  updateSettings(payload: TrainingSettings) {
    return apiRequest<TrainingSettings>(
      "/english-words/settings",
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  getStats() {
    return apiRequest<StatsResponse>("/english-words/stats", { method: "GET" }, true);
  },

  createContextEnrichmentJob(payload: {
    wordScope: string;
    generationMode: string;
    sentencesPerWord: number;
    difficultyDistribution: { simple: number; medium: number; hard: number };
    maxWordsPerJob: number;
    wordsPerBatch: number;
    useFrequencyFilter: boolean;
  }) {
    return apiRequest<ContextGenerationJobCreateResponse>(
      "/english-words/context-examples/enrich",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  getContextGenerationJob(jobId: string) {
    return apiRequest<ContextGenerationJob>(
      `/english-words/context-examples/jobs/${jobId}`,
      { method: "GET" },
      true
    );
  },

  cancelContextGenerationJob(jobId: string) {
    return apiRequest<{ status: string }>(
      `/english-words/context-examples/jobs/${jobId}/cancel`,
      { method: "POST" },
      true
    );
  },

  createTraining(mode: TrainingMode, overrideSettings?: TrainingSettingsSnapshot) {
    return apiRequest<TrainingCreateResponse>(
      "/english-words/trainings",
      {
        method: "POST",
        body: JSON.stringify({ mode, overrideSettings }),
      },
      true
    );
  },

  createContextTraining(mode: TrainingMode, overrideSettings?: TrainingSettingsSnapshot) {
    return apiRequest<TrainingCreateResponse>(
      "/english-words/trainings",
      {
        method: "POST",
        body: JSON.stringify({ mode, overrideSettings, questionTypeMode: "context_cloze" }),
      },
      true
    );
  },

  getNextQuestion(sessionId: string) {
    return apiRequest<TrainingQuestion | TrainingFinished>(
      `/english-words/trainings/${sessionId}/next`,
      { method: "GET" },
      true
    );
  },

  answerQuestion(sessionId: string, payload: {
    wordId: string;
    questionType: QuestionType;
    selectedOptionId?: string;
    contextExampleId?: string;
    selectedOptionWordId?: string;
    selectedOptionText?: string;
    hintTranslationShown?: boolean;
  }) {
    return apiRequest<AnswerResponse>(
      `/english-words/trainings/${sessionId}/answer`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  skipQuestion(sessionId: string, payload: { wordId: string; questionType: QuestionType; contextExampleId?: string; hintTranslationShown?: boolean }) {
    return apiRequest<{ skipped: true }>(
      `/english-words/trainings/${sessionId}/skip`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  finishTraining(sessionId: string) {
    return apiRequest<{ status: "finished"; finishedAt: string }>(
      `/english-words/trainings/${sessionId}/finish`,
      { method: "POST" },
      true
    );
  },

  getContextTranslation(contextExampleId: string) {
    return apiRequest<{ contextExampleId: string; ruTranslation: string | null }>(
      `/english-words/context-examples/${contextExampleId}/translation`,
      { method: "GET" },
      true
    );
  },
};
