import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'

const { HttpProvider } = await load('../src/api/httpProvider.ts')

test('aborting during submission releases the returned job with its own consumer token', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  let receive
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (options.method === 'POST') {
      return new Promise(resolve => { receive = () => resolve(Response.json({ id: 'job', status: 'queued' })) })
    }
    return Response.json({ id: 'job', status: 'failed' })
  }
  const controller = new AbortController()
  const provider = new HttpProvider('/api')
  const pending = provider.submitTerrainAnalysis({ priority: 'background', site: {}, config: {} }, controller.signal)
  controller.abort()
  receive()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls[0].options.headers['X-Job-Priority'], 'background')
  assert.equal(JSON.parse(calls[0].options.body).priority, undefined)
  assert.equal(calls[1].options.method, 'DELETE')
  assert.equal(calls[1].options.headers['X-Job-Consumer'], calls[0].options.headers['X-Job-Consumer'])
})

test('shared submissions release only the aborted consumer; completed polling removes listeners', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return Response.json({ id: 'shared', status: options.method === 'POST' ? 'queued' : 'completed' })
  }
  const provider = new HttpProvider('/api')
  const first = new AbortController(), second = new AbortController()
  await provider.submitScenarioEvaluation({}, first.signal)
  await provider.submitScenarioEvaluation({}, second.signal)
  first.abort()
  assert.equal(calls.filter(c => c.options.method === 'DELETE').length, 1)
  assert.notEqual(calls[0].options.headers['X-Job-Consumer'], calls[1].options.headers['X-Job-Consumer'])
  await provider.getScenarioEvaluation('shared', second.signal)
  second.abort()
  assert.equal(calls.filter(c => c.options.method === 'DELETE').length, 1)
})
