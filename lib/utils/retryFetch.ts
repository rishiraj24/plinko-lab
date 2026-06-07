// lib/utils/retryFetch.ts

interface RetryOptions {
  maxAttempts?: number   // default 3
  baseDelayMs?: number   // default 400ms
}

/**
 * Fetch with automatic retry on network errors (CORS failures, offline, etc).
 * Does NOT retry on HTTP error responses (4xx, 5xx) — those are real failures.
 */
export async function retryFetch(
  input: RequestInfo,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const { maxAttempts = 3, baseDelayMs = 400 } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init)
      return res   // return immediately — even if res.ok is false
    } catch (err) {
      // Only catch network-level errors (TypeError from fetch)
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1)  // 400, 800, 1600…
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries')
}
