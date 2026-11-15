/** Shared helpers for the compare picker and screen. */
import { formatLat, formatLon } from '../domain/format'
import { CUSTOM_SITE_NAME } from '../domain/sites'
import { getState, setState, siteKey, type CompareSite } from '../state/store'

export const SLOT_LETTERS = ['A', 'B', 'C', 'D'] as const

/** The site open in the site view, as a compare slot. */
export function currentCompareSite(): CompareSite {
  const A = getState().scenarios.A.input
  return { key: siteKey(A.site), name: A.siteName ?? `${CUSTOM_SITE_NAME} · ${formatLat(A.site.latDeg, 2)}, ${formatLon(A.site.lonEastDeg, 2)}`, site: A.site }
}

export function openComparePicker(): void {
  setState({ pickerOpen: true })
}
