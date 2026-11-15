import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'

const { withRetry, isTransient, RETRY_DELAYS_MS } = await load('../src/api/retry.ts')
const httpError = (status) => Object.assign(new Error(`API ${status}`), { status })
const noWait = async () => {}

test('network failures and server errors are transient; client errors and bad data are not', () => {
  assert.equal(isTransient(new TypeError('Failed to fetch')), true)
  for (const status of [500, 502, 503, 504, 408, 429]) assert.equal(isTransient(httpError(status)), true)
  for (const status of [400, 401, 404, 422]) assert.equal(isTransient(httpError(status)), false)
  assert.equal(isTransient(new Error('Invalid region geometry or status.')), false)
  assert.equal(isTransient(null), false)
})

test('a backend that comes back during the retries is loaded without an error', async () => {
  let calls = 0
  const waits = []
  const value = await withRetry(async () => {
    calls++
    if (calls < 3) throw new TypeError('Failed to fetch')
    return 'catalog'
  }, [10, 20, 40], async (ms) => { waits.push(ms) })
  assert.equal(value, 'catalog')
  assert.equal(calls, 3)
  assert.deepEqual(waits, [10, 20])
})

test('non-transient errors fail at once, without retrying', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw httpError(404) }, [10, 20], noWait), /API 404/)
  assert.equal(calls, 1)
})

test('after the last retry the original error is reported', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw httpError(502) }, [1, 1, 1], noWait), /API 502/)
  assert.equal(calls, 4)
})

test('default retries cover a backend restart of about half a minute', () => {
  const total = RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)
  assert.ok(total >= 20000 && total <= 60000)
})
