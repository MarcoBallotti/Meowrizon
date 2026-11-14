import type { JobState } from './types'

export class JobFailedError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'JobFailedError'
    this.code = code
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Submit a job and poll until it completes, with capped exponential backoff.
 * A cached result returns immediately from the submission.
 */
export async function runJob<T>(
  submit: () => Promise<JobState<T>>,
  poll: (id: string) => Promise<JobState<T>>,
  onUpdate: (state: JobState<T>) => void,
  signal?: AbortSignal,
): Promise<T> {
  let state = await submit()
  let delay = 250
  for (;;) {
    onUpdate(state)
    if (state.status === 'completed') {
      if (!state.result) throw new JobFailedError('empty_result', 'Il lavoro è completato ma non contiene risultati.')
      return state.result
    }
    if (state.status === 'failed') {
      throw new JobFailedError(state.error?.code ?? 'failed', state.error?.message ?? 'Elaborazione non riuscita.')
    }
    await sleep(delay, signal)
    delay = Math.min(delay * 1.6, 3000)
    state = await poll(state.id)
  }
}
