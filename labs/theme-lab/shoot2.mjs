/*
 * 预览 v2 截图 · shots for preview2
 * ---------------------------------
 * 截三种装饰强度（素/柔/满）+ 暗色 + 字体对照，并拼成一张对比图。
 *
 * 用法：node theme-lab/shoot2.mjs
 * 产物：theme-lab/shots2/*.png、compare.png
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PAGE = join(HERE, 'preview2.html')
const OUT = join(HERE, 'shots2')
mkdirSync(OUT, { recursive: true })

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browser = BROWSERS.find(p => existsSync(p))
if (browser === undefined) { console.error('找不到 Chrome/Edge'); process.exit(0) }
console.log(`browser: ${browser}`)

const fileUrl = `file:///${PAGE.replace(/\\/g, '/')}`

const SHOTS = [
  { name: 'plain-light', hash: 'scheme=light&decor=plain&font=wenkai' },
  { name: 'soft-light', hash: 'scheme=light&decor=soft&font=wenkai' },
  { name: 'rich-light', hash: 'scheme=light&decor=rich&font=wenkai' },
  { name: 'rich-dark', hash: 'scheme=dark&decor=rich&font=wenkai' },
  { name: 'soft-nunito', hash: 'scheme=light&decor=soft&font=wenkaiNunito' },
  { name: 'soft-system', hash: 'scheme=light&decor=soft&font=system' },
]

for (const shot of SHOTS) {
  const png = join(OUT, `${shot.name}.png`)
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
      '--hide-scrollbars', '--force-device-scale-factor=1',
      '--window-size=1440,900', '--virtual-time-budget=4000',
      `--screenshot=${png}`, `${fileUrl}#${shot.hash}`,
    ], { stdio: 'ignore', timeout: 60_000 })
    console.log(`  ✓ ${shot.name}.png`)
  } catch (err) {
    console.error(`  ✗ ${shot.name}: ${err.message}`)
  }
}

/** 拼一张 2×3 的对比图，方便一屏看完。 */
const grid = SHOTS.filter(s => existsSync(join(OUT, `${s.name}.png`)))
  .map(s => `<figure><img src="${s.name}.png"><figcaption>${s.name}</figcaption></figure>`).join('\n')
writeFileSync(join(OUT, 'compare.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 18px; background: #f4eef1; font-family: 'Microsoft YaHei', sans-serif; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
figure { margin: 0; }
img { display: block; width: 100%; border-radius: 8px; box-shadow: 0 2px 10px #4a243022; background: #fff; }
figcaption { font-size: 12px; color: #6f5460; margin-top: 5px; text-align: center; }
</style></head><body><div class="grid">
${grid}
</div></body></html>`, 'utf8')

try {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1600,1120', '--virtual-time-budget=5000',
    `--screenshot=${join(OUT, 'compare.png')}`,
    `file:///${join(OUT, 'compare.html').replace(/\\/g, '/')}`,
  ], { stdio: 'ignore', timeout: 90_000 })
  console.log('  ✓ compare.png')
} catch (err) {
  console.error(`  ✗ compare: ${err.message}`)
}

console.log('done')
