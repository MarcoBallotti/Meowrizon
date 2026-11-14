/**
 * Imperative handle the globe registers while mounted, so the opening screen
 * can run the descent without importing CesiumJS eagerly.
 */
export const globeHandle: { flyDown: ((lat: number, lon: number) => Promise<void>) | null } = { flyDown: null }
