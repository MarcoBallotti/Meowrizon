/**
 * Living brand kit: every component shown here is the real one the app uses.
 * Change a token or a component and this page changes with it.
 */
import { useState, type ReactNode } from 'react'
import { AudienceSwitch } from '../features/TopBar'
import { goTo } from '../state/store'
import {
  ArrowIcon,
  BackIcon,
  BothIcon,
  Button,
  Card,
  Chip,
  DownloadIcon,
  EarthIcon,
  EarthPhase,
  EclipseIcon,
  Field,
  IconButton,
  Input,
  Logo,
  Metric,
  MoonriseMark,
  Notice,
  PauseIcon,
  PlayIcon,
  Progress,
  Segmented,
  Select,
  SiteTile,
  SpaceWindow,
  StepBackIcon,
  StoryCard,
  SunIcon,
  Toggle,
  TrackBar,
} from '../ui'

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="kit-section" id={id} aria-labelledby={`${id}-h`}>
      <header>
        <h2 className="ui-title is-m" id={`${id}-h`}>
          {title}
        </h2>
        {lead && <p className="ui-muted">{lead}</p>}
      </header>
      {children}
    </section>
  )
}

interface Swatch {
  name: string
  token: string
  hex: string
  use: string
}

const COLOURS: { group: string; items: Swatch[] }[] = [
  {
    group: 'Ground and ink',
    items: [
      { name: 'Ground', token: '--ground', hex: '#ECEEF6', use: 'Page background. Never pure white.' },
      { name: 'Card', token: '--card', hex: '#FFFFFF', use: 'Every container sits on a white card.' },
      { name: 'Line', token: '--line', hex: '#C9CDE0', use: 'Input and tile borders.' },
      { name: 'Ink', token: '--ink', hex: '#171A2B', use: 'Text, selected segments, dark cards.' },
      { name: 'Ink 2', token: '--ink-2', hex: '#4A4F66', use: 'Secondary text. 7:1 on white.' },
    ],
  },
  {
    group: 'Action',
    items: [
      { name: 'Indigo', token: '--primary', hex: '#2B2FA8', use: 'Primary buttons, selection, focus. Never means Sun or Earth.' },
      { name: 'Indigo soft', token: '--primary-soft', hex: '#E5E7FA', use: 'Selected tile fill, hover.' },
    ],
  },
  {
    group: 'Meaning',
    items: [
      { name: 'Sun', token: '--sun', hex: '#F5A300', use: 'Sunlight, power. Fills and marks only.' },
      { name: 'Sun ink', token: '--sun-ink', hex: '#8A5A00', use: 'Sun text on white (6:1).' },
      { name: 'Earth', token: '--earth', hex: '#2F6FED', use: 'Earth in view, radio link.' },
      { name: 'Earth ink', token: '--earth-ink', hex: '#1F55C4', use: 'Earth text on white (6:1).' },
      { name: 'Both', token: '--both', hex: '#171A2B', use: 'Sun and Earth together.' },
    ],
  },
  {
    group: 'Space window',
    items: [
      { name: 'Space', token: '--space', hex: '#0B0D1A', use: 'The only dark surface: wherever we look into space.' },
      { name: 'Earth sky', token: '--earth-sky', hex: '#5B93FF', use: 'Earth disc on black.' },
      { name: 'Rock near', token: '--rock-near-top', hex: '#8E8CA0', use: 'Foreground hills.' },
      { name: 'Rock far', token: '--rock-far-top', hex: '#3A3B55', use: 'The real horizon ridge.' },
    ],
  },
]

const TYPE = [
  { label: 'Display', meta: 'Bricolage Grotesque 800 · 56/1.02', node: <span className="ui-display">Where shall we land?</span> },
  { label: 'Display S', meta: 'Bricolage Grotesque 800 · 44', node: <span className="ui-display is-s">6 days of sunlight left</span> },
  { label: 'Title M', meta: 'Bricolage Grotesque 800 · 30', node: <span className="ui-title is-m">Shackleton crater</span> },
  { label: 'Title', meta: 'Bricolage Grotesque 700 · 24', node: <span className="ui-title">Pick a place</span> },
  { label: 'Body', meta: 'Figtree 400 · 18/1.45', node: <span>Earth is in view, so the lander can talk to us directly.</span> },
  { label: 'Small', meta: 'Figtree 400–700 · 16', node: <span className="ui-small">Time is UTC, the clock mission teams share.</span> },
  { label: 'Data', meta: 'JetBrains Mono 500 · tabular', node: <span className="mono">EL −0.42°  AZ 92.4°  06 d 04 h 12 m</span> },
]

const LEVELS: [string, string, string, string][] = [
  ['Words', 'One plain sentence per fact.', 'The sentence plus the number and the why.', 'Labels and units, no prose.'],
  ['Numbers', 'Rounded: “6 days”, “3 Sun-widths”.', 'Degrees to 0.1°, dates, percentages.', 'Az/El/H(az)/margin to 0.01°, UTC to the minute.'],
  ['Sky view', 'Name bubbles, no grid.', 'Bubbles with heights, elevation grid, flat-horizon line.', 'Target brackets, HUD readouts, dashed H(az), azimuth grid.'],
  ['Lens', 'Eye only (true scale).', 'Eye, Wide, 360° (stretch declared).', 'Same, plus drag and arrow keys to pan.'],
  ['Timeline', 'Sunlight and Earth bars, Day N of M.', '+ Sun + Earth bar, day ticks, speed.', '+ UTC, ±6 h steps, A/B groups.'],
  ['Report', 'Power, Calling home, Why it matters.', '+ period stats and prompts for the class.', 'Now table, countdowns, period metrics, A/B, CSV, data and caveats.'],
  ['Density', '18 px body, 60 px targets: projector.', 'Same as student.', '16 px body, 52 px targets: desk.'],
]

export function KitScreen() {
  const [seg, setSeg] = useState<'sun' | 'earth' | 'both'>('sun')
  const [tile, setTile] = useState('shackleton')
  const [on, setOn] = useState(true)
  const now = Date.UTC(2026, 11, 1)
  const span = 30 * 86_400_000
  const demoSun = [
    { startMs: now, endMs: now + 11 * 86_400_000 },
    { startMs: now + 19 * 86_400_000, endMs: now + span },
  ]
  const demoEarth = [
    { startMs: now, endMs: now + 5 * 86_400_000 },
    { startMs: now + 14 * 86_400_000, endMs: now + 26 * 86_400_000 },
  ]
  const demoBoth = [
    { startMs: now, endMs: now + 5 * 86_400_000 },
    { startMs: now + 19 * 86_400_000, endMs: now + 26 * 86_400_000 },
  ]

  return (
    <div className="kit-page">
      <div className="topbar">
        <Button variant="quiet" pill size="s" icon={<BackIcon />} onClick={() => goTo('moon')}>
          Back to the app
        </Button>
        <div className="topbar-end">
          <AudienceSwitch />
        </div>
      </div>

      <div className="kit-hero">
        <Logo size={72} />
        <h1 className="ui-display">Brand kit</h1>
        <p className="moon-lead">
          A friendly field guide to the lunar sky. Classroom first, honest with numbers. Light grey ground, white cards, one dark window into space,
          and two colours that always mean the same thing: amber is the Sun, blue is Earth.
        </p>
        <p className="ui-small ui-muted">Switch the audience above: every sample on this page follows it, like the app does.</p>
      </div>

      <Section id="principles" title="Principles">
        <div className="kit-grid">
          {[
            ['The horizon is the hero', 'Every screen leads to the view from the ground. Data explains the picture, never the other way round.'],
            ['Two colours, two meanings', 'Amber = Sun and power. Blue = Earth and radio. Indigo is for actions only.'],
            ['Real size, or say so', 'Sun and Earth are drawn at their true angular size. Any stretch is written on screen.'],
            ['One tool, three readers', 'Engineer, Teacher, Student change words, numbers and density. Never three different apps.'],
            ['Honest numbers', 'Practice data is labelled. Decoration never hides what the engine says is visible.'],
            ['Big enough for the back row', 'Projector first: 18 px body, 60 px targets, short sentences.'],
          ].map(([t, b]) => (
            <Card key={t}>
              <h3 className="ui-title">{t}</h3>
              <p className="ui-muted">{b}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="logo"
        title="Logo"
        lead="Twin suns over the Moon: like the double sunset on Tatooine, the Earth and the Sun hang one above the other over the curved, cratered edge of the Moon. From the Moon the Earth looks about four times wider than the Sun, so it is the large disc. It is the app in one picture: Sun and Earth over a real lunar horizon. Clear space equals the Sun's radius. Minimum size 20 px."
      >
        <div className="kit-grid">
          <div className="kit-logo-stage is-light">
            <Logo size={56} />
          </div>
          <div className="kit-logo-stage is-white">
            <MoonriseMark size={96} />
          </div>
          <div className="kit-logo-stage is-dark">
            <Logo size={56} tone="dark" />
          </div>
          <div className="kit-logo-stage is-white">
            <div className="kit-row">
              <MoonriseMark size={24} />
              <MoonriseMark size={32} />
              <MoonriseMark size={44} />
              <MoonriseMark size={64} />
            </div>
          </div>
        </div>
        <Card tone="sunk">
          <ul className="kit-do">
            <li>Keep the Sun amber and Earth blue: they mean the same as in the data.</li>
            <li>Use the dark version only inside the space window.</li>
            <li>No background behind the mark, no gradients, no glow.</li>
          </ul>
        </Card>
      </Section>

      <Section id="colour" title="Colour">
        {COLOURS.map((g) => (
          <div key={g.group} className="kit-section">
            <h3 className="ui-title">{g.group}</h3>
            <div className="kit-grid">
              {g.items.map((c) => (
                <div key={c.token} className="kit-swatch">
                  <div className="kit-swatch-chip" style={{ background: `var(${c.token})` }} />
                  <span className="kit-swatch-name">{c.name}</span>
                  <span className="kit-swatch-meta">
                    {c.token} · {c.hex}
                  </span>
                  <span className="ui-small ui-muted">{c.use}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section id="type" title="Typography" lead="Bricolage Grotesque for headlines, Figtree for reading, JetBrains Mono for numbers that must line up. Planner mode shrinks the whole scale one step.">
        <Card>
          {TYPE.map((t) => (
            <div key={t.label} className="kit-type-row">
              <div>
                <div className="ui-eyebrow">{t.label}</div>
                <div className="kit-type-meta">{t.meta}</div>
              </div>
              <div>{t.node}</div>
            </div>
          ))}
        </Card>
      </Section>

      <Section id="levels" title="Three readers" lead="The audience switch sits top right on every screen and changes the whole tool.">
        <div className="kit-row">
          <AudienceSwitch />
        </div>
        <Card>
          <table className="ui-table kit-matrix">
            <thead>
              <tr>
                <th scope="col">What changes</th>
                <th scope="col">Student</th>
                <th scope="col">Teacher</th>
                <th scope="col">Planner</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map(([what, s, t, p]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td>{s}</td>
                  <td>{t}</td>
                  <td>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="kit-grid">
          <StoryCard eyebrow="Student" tone="sun" headline="6 days of sunlight left">
            The Sun is up, barely. It sits about 3 Sun-widths above the hills.
          </StoryCard>
          <StoryCard eyebrow="Teacher" tone="sun" headline="6 days of sunlight left" extra={<Chip tone="sun" icon={<SunIcon size={16} />}>Sunlight 62% of 30 days</Chip>}>
            Sun is 1.6° above the hills. Sunset on 7 Dec, 04:12 UTC.
          </StoryCard>
          <Card>
            <span className="ui-eyebrow">Planner</span>
            <div className="ui-metric-grid">
              <Metric tone="sun" label="Sunset in" value="06 d 04 h 12 m" detail="2026-12-07 04:12 UTC" />
              <Metric label="Sun margin" value="+1.62" unit="°" detail="El 0.91° · H(az) −0.71°" />
            </div>
          </Card>
        </div>
      </Section>

      <Section id="buttons" title="Buttons" lead="One indigo primary per view. Secondary is an ink outline. Quiet is white on the grey ground.">
        <Card>
          <div className="kit-row">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <span className="kit-ground">
              <Button variant="quiet">Quiet</Button>
            </span>
            <Button disabled>Disabled</Button>
          </div>
          <div className="kit-row">
            <Button size="s">Small</Button>
            <Button size="s" variant="secondary" icon={<DownloadIcon />}>
              Intervals CSV
            </Button>
            <Button size="s" variant="quiet" pill icon={<BackIcon />}>
              Back to the Moon
            </Button>
          </div>
          <Button size="l" step={3} block>
            Fly down to the surface
          </Button>
          <Button size="l" icon={<ArrowIcon />}>
            Analyse site
          </Button>
          <div className="kit-row">
            <IconButton aria-label="Play">
              <PlayIcon />
            </IconButton>
            <IconButton aria-label="Pause">
              <PauseIcon />
            </IconButton>
            <IconButton aria-label="Back 6 hours" variant="secondary" size="s">
              <StepBackIcon />
            </IconButton>
          </div>
        </Card>
      </Section>

      <Section id="controls" title="Controls">
        <div className="kit-grid is-wide">
          <Card>
            <h3 className="ui-title">Segmented</h3>
            <Segmented
              label="Look at"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'sun', label: 'Sun' },
                { value: 'earth', label: 'Earth' },
                { value: 'both', label: 'Both' },
              ]}
            />
            <Segmented
              label="Look at, small"
              size="s"
              tone="sunk"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'sun', label: 'Sun' },
                { value: 'earth', label: 'Earth' },
                { value: 'both', label: 'Both' },
              ]}
            />
            <Toggle checked={on} onChange={setOn}>
              Paths this period
            </Toggle>
          </Card>
          <Card>
            <h3 className="ui-title">Fields</h3>
            <Field label="Pick a day" htmlFor="kit-date" hint="Time is UTC, the clock mission teams share.">
              <Input id="kit-date" type="datetime-local" defaultValue="2026-12-01T00:00" />
            </Field>
            <Field label="Latitude °" htmlFor="kit-lat" error="Latitude must be between −90° and 90°.">
              <Input id="kit-lat" data inputSize="s" defaultValue="-95" aria-invalid="true" />
            </Field>
            <div className="moon-period">
              <Field label="Duration" htmlFor="kit-dur">
                <Select id="kit-dur" inputSize="s" defaultValue="30">
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </Select>
              </Field>
              <Field label="Observer height" htmlFor="kit-h">
                <Input id="kit-h" type="number" data inputSize="s" unit="m" defaultValue={2} />
              </Field>
            </div>
          </Card>
          <Card>
            <h3 className="ui-title">Site tiles</h3>
            <div className="ui-site-grid">
              {[
                ['shackleton', 'Shackleton crater'],
                ['de-gerlache', 'de Gerlache crater'],
                ['malapert', 'Malapert massif'],
                ['apollo11', 'Apollo 11'],
              ].map(([id, name]) => (
                <SiteTile key={id} name={name} selected={tile === id} onSelect={() => setTile(id)} />
              ))}
            </div>
            <SiteTile name="Shackleton crater" meta="89.67° S 129.80° E" selected onSelect={() => undefined} />
          </Card>
        </div>
      </Section>

      <Section id="data" title="Data display">
        <Card>
          <div className="kit-row">
            <Chip tone="sun" icon={<SunIcon size={16} />}>
              Sun visible
            </Chip>
            <Chip tone="earth" icon={<EarthIcon size={16} />}>
              Earth in view
            </Chip>
            <Chip tone="both" icon={<BothIcon size={16} />}>
              Sun + Earth
            </Chip>
            <Chip tone="off">Hidden</Chip>
            <Chip tone="demo" dot>
              Practice data
            </Chip>
            <Chip tone="danger">Out of DEM coverage</Chip>
          </div>
        </Card>
        <div className="kit-grid">
          <StoryCard eyebrow="Calling home" tone="earth" headline="2 days of radio link left">
            Earth is in view, so the lander can talk to us directly.
          </StoryCard>
          <Card tone="dark">
            <span className="ui-eyebrow">Why it matters</span>
            <p className="report-why">Land a few kilometres away, or a week later, and both numbers change completely.</p>
          </Card>
          <Card>
            <div className="ui-metric-grid">
              <Metric label="Sun visible" value="62" unit="%" />
              <Metric label="Longest night" value="3 d 2 h" />
              <Metric tone="earth" label="Earthset in" value="02 d 11 h 40 m" detail="2026-12-03 11:40 UTC" />
            </div>
          </Card>
        </div>
        <Card>
          <div className="timeline-bars" style={{ paddingLeft: 170 }}>
            <div className="timeline-hit">
              <div className="timeline-row">
                <span className="timeline-row-label is-sun">
                  <SunIcon size={16} />
                  Sunlight
                </span>
                <TrackBar tone="sun" intervals={demoSun} startMs={now} spanMs={span} label="Sunlight sample" />
              </div>
              <div className="timeline-row">
                <span className="timeline-row-label is-earth">
                  <EarthIcon size={16} />
                  Earth in view
                </span>
                <TrackBar tone="earth" intervals={demoEarth} startMs={now} spanMs={span} label="Earth sample" />
              </div>
              <div className="timeline-row">
                <span className="timeline-row-label">
                  <BothIcon size={16} />
                  Sun + Earth
                </span>
                <TrackBar tone="both" intervals={demoBoth} startMs={now} spanMs={span} label="Both sample" />
              </div>
              <span className="timeline-cursor" style={{ left: '38%' }} aria-hidden="true" />
            </div>
          </div>
          <Progress value={0.6} label="Sample progress" />
          <Progress label="Sample indeterminate progress" />
        </Card>
        <div className="kit-grid is-wide">
          <Notice tone="demo">
            <strong>Practice data.</strong> The horizon is synthetic and Sun/Earth directions are approximate. Use it to learn the tool, not to judge a site.
          </Notice>
          <Notice tone="info">
            <strong>Visibility is geometric.</strong> Radio links also need antennas and a link budget.
          </Notice>
        </div>
      </Section>

      <Section id="bodies" title="Sun and Earth" lead="From the Moon, Earth looks 3.6 times wider than the Sun (1.9° against 0.53°). Earth shows phases opposite to the Moon's: it is “new” when it sits next to the Sun. When it passes in front of the Sun, its rim glows red: that is an eclipse.">
        <Card>
          <div className="kit-row">
            <SunIcon size={48} />
            <EarthIcon size={48} />
            {[0.08, 0.3, 0.5, 0.75, 1].map((k) => (
              <EarthPhase key={k} size={48} lit={k} />
            ))}
            <EclipseIcon size={48} />
          </div>
        </Card>
      </Section>

      <Section id="space" title="Space window" lead="The only dark surface. Rounded 32 px, black sky, controls in translucent pills, a white caption that states the scale.">
        <SpaceWindow className="kit-space-demo">
          <div className="scene-controls">
            <Segmented
              label="Look at, on dark"
              tone="on-dark"
              size="s"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'sun', label: 'Sun' },
                { value: 'earth', label: 'Earth' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </div>
          <div className="scene-toggles">
            <Toggle checked={on} onChange={setOn} onDark>
              Paths this period
            </Toggle>
          </div>
          <span className="ui-space-caption">Sun and Earth are drawn at their real size in the sky</span>
        </SpaceWindow>
      </Section>

      <Section id="voice" title="Voice">
        <div className="kit-grid is-wide">
          <Card>
            <h3 className="ui-title">Do</h3>
            <ul className="kit-do">
              <li>Say the fact first: “6 days of sunlight left”.</li>
              <li>Measure with things people know: Sun-widths, days.</li>
              <li>Name the topic in two words: Power, Calling home.</li>
              <li>Write UTC every time a clock time appears.</li>
            </ul>
          </Card>
          <Card>
            <h3 className="ui-title">Avoid</h3>
            <ul className="kit-do">
              <li>Jargon in Student mode: illumination fraction, DTE, ephemeris.</li>
              <li>Exclamation marks and puns in data.</li>
              <li>Claims of safety or certification: visibility is geometry only.</li>
              <li>Colour as the only signal: always pair with a word or icon.</li>
            </ul>
          </Card>
        </div>
      </Section>
    </div>
  )
}
