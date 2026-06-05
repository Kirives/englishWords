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

export interface TrainingQuestion {
  wordId: string;
  questionType: QuestionType;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  hideOptionsUntilReveal: boolean;
  autoAdvanceAfterAnswer: boolean;
  finished?: false;
}

export interface TrainingFinished {
  finished: true;
  message: string;
}

export interface AnswerResponse {
  isCorrect: boolean;
  correctOptionId: string;
  correctText: string;
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

  getNextQuestion(sessionId: string) {
    return apiRequest<TrainingQuestion | TrainingFinished>(
      `/english-words/trainings/${sessionId}/next`,
      { method: "GET" },
      true
    );
  },

  answerQuestion(sessionId: string, payload: { wordId: string; questionType: QuestionType; selectedOptionId: string }) {
    return apiRequest<AnswerResponse>(
      `/english-words/trainings/${sessionId}/answer`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    );
  },

  skipQuestion(sessionId: string, payload: { wordId: string; questionType: QuestionType }) {
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
};
