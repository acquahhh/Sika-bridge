// Regenerates the PNG app icons from public/icons/favicon.svg.
// Needs Playwright with Chromium (npx playwright install chromium). The PNGs are
// committed, so you only need to run this after changing the SVG.
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const svg = await readFile(new URL('../public/icons/favicon.svg', import.meta.url), 'utf8')
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url)

// Maskable: full-bleed background, artwork scaled into the 80% safe zone.
const maskable = svg
  .replace('<rect width="512" height="512" rx="112" fill="#065f46"/>', '<rect width="512" height="512" fill="#065f46"/><g transform="translate(76.8 76.8) scale(0.7)">')
  .replace('</svg>', '</g></svg>')

const targets = [
  ['icon-32.png', 32, svg],
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['apple-touch-icon.png', 180, maskable],
  ['maskable-512.png', 512, maskable],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, source] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  await writeFile(out(name), await page.locator('svg').screenshot({ omitBackground: true }))
  console.log('wrote', name)
}
await browser.close()
