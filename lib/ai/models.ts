/**
 * Central registry for all AI model identifiers.
 * Update model versions here ONLY — no model strings appear anywhere else in the codebase.
 */
export const AI_MODELS = {
  deepseek: {
    /** Primary model for relevance filtering, scoring, and summary generation */
    primary: "deepseek-chat",
    /** Reasoning model for complex entity extraction and deep reports */
    reasoner: "deepseek-reasoner",
  },
  gemini: {
    /** Automatic fallback when DeepSeek is unavailable or times out */
    fallback: "gemini-2.0-flash",
  },
} as const;

/** Timeout in milliseconds before falling back to secondary provider */
export const AI_TIMEOUT_MS = 15_000;

/** Minimum relevance score (0–1) to pass the relevance filter */
export const RELEVANCE_THRESHOLD = 0.6;
