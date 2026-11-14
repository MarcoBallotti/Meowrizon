import { lazy, Suspense, useEffect, useRef } from 'react'
import { provider } from './api'
import { ControlPanel } from './components/ControlPanel'
import { HorizonView } from './components/HorizonView'
import { TimelineView } from './components/TimelineView'
import { loadCoverage, runScenario } from './state/runner'
import { getState, setState, useStore, type ScenarioKey } from './state/store'

const GlobeView = lazy(() => import('./components/GlobeView'))

/** Re-run a scenario shortly after its inputs settle; superseded runs are aborted. */
function useAutoRun() {
  const A = useStore((s) => s.scenarios.A.input)
  const B = useStore((s) => s.scenarios.B.input)
  const compare = useStore((s) => s.compare)
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  const lastKeys = useRef<Partial<Record<ScenarioKey, string>>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      const wanted: [ScenarioKey, typeof A][] = compare ? [['A', A], ['B', B]] : [['A', A]]
      for (const [key, input] of wanted) {
        const k = JSON.stringify([input, durationDays, stepMinutes])
        if (lastKeys.current[key] === k) continue
        lastKeys.current[key] = k
        void runScenario(key)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [A, B, compare, durationDays, stepMinutes])
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea, button, [role="slider"]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setState({ playing: !getState().playing })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden="true">
      <circle cx="16" cy="16" r="15" className="brand-disc" />
      <path d="M2 19 L8 15 L12 17 L17 12 L22 16 L26 14 L30 18 V31 H2 Z" className="brand-terrain" />
      <circle cx="23" cy="8" r="2.6" className="brand-sun" />
    </svg>
  )
}

export default function App() {
  const compare = useStore((s) => s.compare)
  useAutoRun()
  useKeyboard()
  useEffect(() => {
    void loadCoverage()
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Meowrizon</h1>
            <p className="brand-sub">Navigatore dei siti di atterraggio lunare</p>
          </div>
        </div>
        {provider.kind === 'demo' ? (
          <div className="demo-badge" role="note">
            <span className="demo-badge-dot" aria-hidden="true" />
            <span>
              <strong>Dati dimostrativi</strong> — orizzonte ed effemeridi sintetici, motore numerico non collegato
            </span>
          </div>
        ) : (
          <div className="source-badge">Motore numerico collegato</div>
        )}
      </header>

      <ControlPanel />

      <main className={`stage${compare ? ' is-compare' : ''}`}>
        <section className="view view-globe" aria-label="Globo lunare">
          <Suspense fallback={<div className="globe-loading">Caricamento del globo…</div>}>
            <GlobeView />
          </Suspense>
        </section>
        <HorizonView />
      </main>

      <TimelineView />
    </div>
  )
}
