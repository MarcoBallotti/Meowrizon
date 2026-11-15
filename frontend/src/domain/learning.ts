import type { CompareSite } from '../state/store'

export type LessonMode = 'sites' | 'dates' | 'terrain'

/** Paired controls change one variable while duration and calculation settings stay shared. */
export function lessonSlots(mode: 'dates' | 'terrain', chosen: CompareSite, startMs: number, secondStartMs: number): CompareSite[] {
  return ['A', 'B'].map((letter, i) => ({
    key: `lesson:${letter}`, name: chosen.name, site: { ...chosen.site },
    startMs: mode === 'dates' && i === 1 ? secondStartMs : startMs,
    horizonMode: mode === 'terrain' && i === 1 ? 'ideal' : 'terrain',
  }))
}

export function slotStart(slot: CompareSite, sharedStart: number): number {
  return slot.startMs ?? sharedStart
}

export function slotCursor(slot: CompareSite, sharedStart: number, elapsedMs: number): number {
  return slotStart(slot, sharedStart) + elapsedMs
}

export interface ComparisonSettings {
  startMs: number
  observerHeightM: number
  durationDays: number
  stepMinutes: number
  azimuthStepDeg: number
  maxDistanceKm: number
}

export function comparisonKey(slot: CompareSite, settings: ComparisonSettings): string {
  return JSON.stringify([slot.site.latDeg, slot.site.lonEastDeg, slotStart(slot, settings.startMs),
    slot.horizonMode ?? 'terrain', settings.observerHeightM, settings.durationDays,
    settings.stepMinutes, settings.azimuthStepDeg, settings.maxDistanceKm])
}
