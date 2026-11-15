// Captures crisp stills of the running app (http://localhost:5173) for the promo.
import { chromium } from 'playwright'
const BASE = process.env.APP_URL ?? 'http://localhost:5173'
const out = (n) => `public/shots/${n}.png`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
const shot = async (name, wait = 1500) => { await page.waitForTimeout(wait); await page.screenshot({ path: out(name) }); console.log('shot', name) }

await page.goto(`${BASE}/#/`)
await page.waitForTimeout(5000)
await page.getByRole('button', { name: 'Mission Planner', exact: true }).first().click()
await shot('home', 3000)
await page.getByLabel('Part of the Moon in view').getByRole('button', { name: 'South pole', exact: true }).click()
await shot('globe-south', 5000)
await page.getByRole('button', { name: /^Compare sites for/ }).click()
await page.waitForTimeout(6000)
await shot('explore-start', 0)
// wait for the ranking to fill
for (let i = 0; i < 60; i++) {
  const busy = await page.getByText(/Evaluating sites/).count()
  if (!busy) break
  await page.waitForTimeout(3000)
}
await shot('explore')
await page.getByRole('button', { name: /^Open the horizon at/ }).click()
for (let i = 0; i < 40; i++) {
  if (await page.getByText('Day 1 of').count()) break
  await page.waitForTimeout(2000)
}
await shot('site', 3000)
await page.getByRole('button', { name: 'Play', exact: false }).first().click().catch(() => console.log('no play'))
await shot('site-play', 4000)
for (const a of ['Educator', 'General Public']) {
  await page.getByRole('button', { name: a, exact: true }).first().click().catch(() => page.getByText(a, { exact: true }).first().click())
  await shot(`site-${a.toLowerCase().replace(' ', '-')}`, 6000)
}
await page.getByRole('button', { name: 'Mission Planner', exact: true }).first().click().catch(() => {})
await page.getByRole('button', { name: /^Compare/ }).first().click()
await shot('compare', 4000)
await browser.close()
