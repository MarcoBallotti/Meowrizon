import { provider } from '../api'
import { assessRegions, publicExplanation, rank } from '../domain/ranking'
import { useStore } from '../state/store'
import { Card } from '../ui'

/** Explain the selected point using the very same assessment as the ranking. */
export function PublicAssessment() {
  const input = useStore(s => s.scenarios.A.input)
  const ranking = useStore(s => s.ranking)
  const catalog = useStore(s => s.regions)
  const mission = useStore(s => s.mission)
  const regions = provider.kind === 'api' ? ranking?.regions ?? [] : catalog?.regions ?? []
  const matches = (r: { id: string; name: string }) => provider.kind === 'api' ? r.id === input.selectionId || r.id === `custom:${input.site.latDeg}:${input.site.lonEastDeg}` : r.name === input.siteName
  const ordered = rank(regions, 'all', mission)
  const chosen = ordered.find(matches)
  const excluded = assessRegions(regions, 'all', mission).find(({ region }) => matches(region))
  const failed = ranking?.failed.find(matches)
  const skipped = ranking?.skipped.find(matches)
  return <Card as="section" aria-label="Your site's explained result">
    <h2 className="ui-title">Why this site?</h2>
    {chosen ? <>
      <p><strong>#{chosen.rank} of {ordered.length} eligible sites · visibility index {chosen.score.toFixed(1)}/100</strong>{ranking?.busy ? ' · provisional while other sites are measured' : ''}</p>
      <p>{publicExplanation(chosen)}</p>
      <details><summary>How to read this position</summary>
        <p>This site meets the configured requirements. It belongs to trade-off group {chosen.paretoFront}. Groups come first: a site in the first group cannot be improved on every compared measure by another eligible site. The visibility index orders sites within each group, so a higher index alone does not guarantee a higher position.</p>
        <p>Sunlight can support solar power, while a clear view of Earth makes a direct radio link possible. Shared visibility gives time to do both. Long dark stretches require stored energy; blocked Earth visibility means waiting or using a relay.</p>
        <p>The result describes this point and the selected period. It does not establish landing safety or guarantee enough power or a working radio link. {provider.kind === 'demo' ? 'Practice data is illustrative and does not recalculate for the selected date.' : 'Terrain resolution and the visibility model limit the result.'}</p>
      </details>
    </> : excluded ? <><p>This site has no position because {excluded.assessment.status === 'insufficient-data' ? 'required measurements are missing' : 'it does not meet the configured requirements'}.</p><p>{publicExplanation(excluded.region)}</p><ul>{excluded.assessment.checks.filter(c => c.status !== 'pass').map(c => <li key={c.id}>{c.label}: {c.reason ?? `${c.value?.toFixed(2)} ${c.unit}; ${c.direction === 'min' ? 'minimum' : 'maximum'} ${c.limit} ${c.unit}`}</li>)}</ul></>
      : skipped ? <p>This site is outside the ranking: sunlight is at most {(skipped.sunFractionUpperBound * 100).toFixed(1)}%, below the required {(mission.minSunFraction * 100).toFixed(1)}%.</p>
      : failed ? <p>This site could not be compared: {failed.reason}</p>
      : <p>{ranking?.busy ? 'Comparing your site with the other candidates. Its position will appear as measurements finish.' : 'Select an evaluated site to see its position and the reasons behind it. Custom points require engine data and cannot be ranked using practice data.'}</p>}
  </Card>
}
