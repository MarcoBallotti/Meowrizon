import { useStore, type ScenarioKey } from '../state/store'

const LABELS = {
  idle: 'In attesa',
  terrain: 'Calcolo dell’orizzonte',
  ephemeris: 'Effemeridi e visibilità',
  ready: 'Risultati aggiornati',
  error: 'Elaborazione non riuscita',
} as const

export function RunStatus({ k, onRetry }: { k: ScenarioKey; onRetry: () => void }) {
  const run = useStore((s) => s.scenarios[k].run)
  const busy = run.phase === 'terrain' || run.phase === 'ephemeris'
  const pct = Math.round((run.progress ?? 0) * 100)
  const tone = run.phase === 'error' ? 'is-error' : busy ? 'is-busy' : run.stale ? 'is-stale' : 'is-ready'

  return (
    <div className={`run-status ${tone}`} role="status" aria-live="polite">
      <div className="run-status-row">
        <span className="run-dot" aria-hidden="true" />
        <span className="run-label">
          {run.phase === 'ready' && run.stale ? 'In aggiornamento' : LABELS[run.phase]}
        </span>
        {busy && <span className="run-pct tabular">{pct}%</span>}
      </div>
      {busy && (
        <div className="progress" aria-hidden="true">
          <div className="progress-bar" style={{ transform: `scaleX(${Math.max(0.04, run.progress ?? 0)})` }} />
        </div>
      )}
      {busy && run.evaluation && (
        <p className="field-hint">Le viste mostrano il risultato precedente fino al completamento.</p>
      )}
      {run.phase === 'error' && (
        <>
          <p className="field-error">{run.error}</p>
          <button className="btn btn-small" onClick={onRetry}>
            Riprova
          </button>
        </>
      )}
    </div>
  )
}
