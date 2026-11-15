import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'
const { lessonSlots, slotCursor, comparisonKey } = await load('../src/domain/learning.ts')
const chosen = { key: 'site', name: 'A ridge', site: { latDeg: -85, lonEastDeg: 10 } }
const settings = { startMs: 1000, observerHeightM: 2, durationDays: 10, stepMinutes: 30, azimuthStepDeg: 1, maxDistanceKm: 100 }

test('date lessons keep one site and align elapsed time without conflating UTC dates', () => {
  const slots = lessonSlots('dates', chosen, 1000, 500000)
  assert.deepEqual(slots[0].site, slots[1].site)
  assert.notEqual(slots[0].key, slots[1].key)
  assert.equal(slotCursor(slots[0], 0, 3600000), 3601000)
  assert.equal(slotCursor(slots[1], 0, 3600000), 4100000)
  assert.notEqual(comparisonKey(slots[0], settings), comparisonKey(slots[1], settings))
})

test('terrain lessons change only the horizon model', () => {
  const [a, b] = lessonSlots('terrain', chosen, 1000, 500000)
  assert.deepEqual(a.site, b.site)
  assert.equal(a.startMs, b.startMs)
  assert.equal(a.horizonMode, 'terrain')
  assert.equal(b.horizonMode, 'ideal')
  assert.notEqual(comparisonKey(a, settings), comparisonKey(b, settings))
  a.site.latDeg = 0
  assert.equal(chosen.site.latDeg, -85)
  assert.equal(b.site.latDeg, -85)
})

test('changing any scientific comparison setting invalidates a previous result', () => {
  const slot = lessonSlots('dates', chosen, 1000, 500000)[0]
  const old = comparisonKey(slot, settings)
  for (const key of ['observerHeightM', 'durationDays', 'stepMinutes', 'azimuthStepDeg', 'maxDistanceKm']) {
    assert.notEqual(old, comparisonKey(slot, { ...settings, [key]: settings[key] + 1 }))
  }
  assert.equal(old, comparisonKey(slot, { ...settings, startMs: 9999 })) // explicit slot date wins
  assert.notEqual(comparisonKey(chosen, settings), comparisonKey(chosen, { ...settings, startMs: 9999 }))
})
