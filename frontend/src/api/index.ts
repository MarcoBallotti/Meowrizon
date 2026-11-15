import { DemoProvider } from './demoProvider'
import { HttpProvider } from './httpProvider'
import type { DataProvider } from './types'

/**
 * VITE_DATA_SOURCE=demo explicitly enables the synthetic provider.
 * VITE_DATA_SOURCE=api uses the engine at VITE_API_BASE_URL (default /api,
 * proxied by Vite to MEOWRIZON_API_ORIGIN in development).
 */
function createProvider(): DataProvider {
  const source = import.meta.env.VITE_DATA_SOURCE ?? 'api'
  if (source === 'api') return new HttpProvider(import.meta.env.VITE_API_BASE_URL ?? '/api')
  return new DemoProvider()
}

export const provider: DataProvider = createProvider()
export const catalogApi = new HttpProvider(import.meta.env.VITE_API_BASE_URL ?? '/api')
export * from './types'
