import type { ReactNode } from 'react'
import { provider } from '../api'
import { AUDIENCES, setAudience, useStore } from '../state/store'
import { Chip, Logo, Segmented } from '../ui'

/** The audience switch: the whole tool changes with it, not one panel. */
export function AudienceSwitch({ size = 'm' }: { size?: 's' | 'm' }) {
  const audience = useStore((s) => s.audience)
  return (
    <Segmented
      label="Who is reading"
      size={size}
      value={audience}
      onChange={setAudience}
      options={AUDIENCES.map((a) => ({ value: a.id, label: a.label, title: a.hint }))}
    />
  )
}

export function DemoChip() {
  if (provider.kind !== 'demo') return <Chip tone="neutral" title="Real backend catalogs. Scientific analysis is unavailable; orbital and globe lighting previews remain approximate.">Backend catalogs · preview visuals</Chip>
  return (
    <Chip tone="demo" dot title="Synthetic horizon and approximate ephemeris. Not a site assessment.">
      Practice data
    </Chip>
  )
}

export function TopBar({ start, children, demo = true }: { start?: ReactNode; children?: ReactNode; demo?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-start">{start ?? <Logo size={40} href="#/" />}</div>
      <div className="topbar-middle">{children}</div>
      <div className="topbar-end">
        {demo && <DemoChip />}
        <AudienceSwitch />
      </div>
    </header>
  )
}
