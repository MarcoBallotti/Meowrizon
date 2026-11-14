import { bestProductFor } from '../domain/coverage'
import { useStore, type ScenarioKey } from '../state/store'

export function DataQuality({ k }: { k: ScenarioKey }) {
  const run = useStore((s) => s.scenarios[k].run)
  const lat = useStore((s) => s.scenarios[k].input.site.latDeg)
  const coverage = useStore((s) => s.coverage)
  const profile = run.terrain?.profile
  const evaluation = run.evaluation

  const products = coverage?.products ?? []
  const used = profile?.dem.productIds.map((id) => products.find((p) => p.id === id)).filter((p) => p !== undefined) ?? []
  // Before a result exists, show which product would cover the point.
  const candidate = bestProductFor(lat, products)
  const product = used[0] ?? candidate
  const isDemo = run.terrain?.origin === 'demo' || evaluation?.origin === 'demo'

  return (
    <details className="panel-section quality" open>
      <summary className="section-title">Dati e approssimazioni</summary>

      {isDemo && (
        <p className="demo-callout">
          <strong>Simulazione dimostrativa.</strong> Orizzonte e posizioni sono sintetici: servono a provare
          l’interfaccia, non a valutare un sito.
        </p>
      )}

      <dl className="facts">
        <dt>Terreno</dt>
        <dd>
          {product ? (
            <a href={product.url} target="_blank" rel="noreferrer">
              {product.title}
            </a>
          ) : (
            '—'
          )}
        </dd>
        <dt>Pixel dichiarato</dt>
        <dd className="tabular">
          {profile ? `${profile.dem.effectivePixelSizeM} m` : product ? `${product.pixelSizeM} m` : '—'}
        </dd>
        {profile && (
          <>
            <dt>NoData</dt>
            <dd className="tabular">{(profile.dem.noDataFraction * 100).toFixed(1)}%</dd>
            <dt>Quota superficie</dt>
            <dd className="tabular">
              {profile.observer.surfaceHeightM === null ? '—' : `${profile.observer.surfaceHeightM} m`} (r. {profile.observer.referenceRadiusKm} km)
            </dd>
            <dt>Campionamento</dt>
            <dd className="tabular">
              {profile.params.azimuthStepDeg}° · {profile.params.maxDistanceKm} km
            </dd>
            <dt>Algoritmo</dt>
            <dd className="mono">{profile.algorithmVersion}</dd>
          </>
        )}
        {evaluation && (
          <>
            <dt>Effemeridi</dt>
            <dd>
              {evaluation.ephemeris.source} <span className="mono">{evaluation.ephemeris.version}</span>
            </dd>
            <dt>Correzioni</dt>
            <dd>{evaluation.ephemeris.corrections}</dd>
            <dt>Visibilità</dt>
            <dd>Centro del disco sopra l’orizzonte del terreno</dd>
          </>
        )}
      </dl>

      {product && !product.available && (
        <p className="field-hint">Prodotto non ancora preparato nel motore: nessuna quota reale è stata letta.</p>
      )}
      {product?.notes && <p className="field-hint">{product.notes}</p>}

      {Boolean(evaluation?.approximations.length || profile?.warnings.length) && (
        <ul className="caveats">
          {profile?.warnings.map((w) => <li key={w}>{w}</li>)}
          {evaluation?.approximations.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      <p className="scope-note">
        La visibilità è una condizione <em>geometrica</em>. Un collegamento radio richiede antenne, puntamento e link
        budget; la produzione elettrica richiede orientamento dei pannelli, area ed efficienza. Nessuna delle due è
        calcolata qui. Quote e pendenze non certificano la sicurezza di un atterraggio.
      </p>
    </details>
  )
}
