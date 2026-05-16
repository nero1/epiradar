/**
 * Retry with exponential backoff and jitter.
 * Used for all external API calls (data sources, AI providers, payment webhooks).
 */

interface RetryOptions {
  /** Maximum number of attempts (default: 5) */
  maxAttempts?: number;
  /** Base delay in ms before first retry (default: 500) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 30_000) */
  maxDelayMs?: number;
  /** Jitter factor 0–1 (default: 0.3) — randomizes delay to avoid thundering herd */
  jitter?: number;
  /** Optional predicate — only retry if this returns true for the error */
  retryIf?: (error: unknown) => boolean;
}

/**
 * Executes `fn` with exponential backoff retries.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    jitter = 0.3,
    retryIf = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !retryIf(error)) {
        break;
      }

      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
      const jitterAmount = cappedDelay * jitter * (Math.random() * 2 - 1);
      const delay = Math.max(0, cappedDelay + jitterAmount);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wraps a fetch call with a timeout that rejects after `timeoutMs`.
 */
export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
