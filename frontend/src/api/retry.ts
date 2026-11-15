/**
 * Retries a request while the backend is briefly unreachable: during a
 * restart (uvicorn --reload, docker compose restart) the dev proxy resets the
 * connection or answers 5xx for a few seconds. Invalid data and client errors
 * are never retried: they would fail the same way again.
 */

/** Waits between attempts: about 30 s in total before the error is shown. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]

/** Network failures (fetch rejects with TypeError) and server-side or timeout statuses. */
export function isTransient(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' && (status >= 500 || status === 408 || status === 429)
}

export async function withRetry<T>(
  load: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load()
    } catch (err) {
      if (attempt >= delays.length || !isTransient(err)) throw err
      await wait(delays[attempt])
    }
  }
}
