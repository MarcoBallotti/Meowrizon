import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const urls = new Map()
function moduleUrl(url) {
  if (urls.has(url.href)) return urls.get(url.href)
  const stripped = stripTypeScriptTypes(readFileSync(url, 'utf8'))
  const source = stripped.replace(/\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g, (_, quote, path) => {
    const dependency = new URL(path.endsWith('.ts') ? path : `${path}.ts`, url)
    return `from ${quote}${moduleUrl(dependency)}${quote}`
  })
  const value = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  urls.set(url.href, value)
  return value
}

export function load(path) {
  return import(moduleUrl(new URL(path, import.meta.url)))
}
