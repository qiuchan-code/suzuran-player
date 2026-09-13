/*
 * 无头截图 · headless shots
 * -------------------------
 * 用 Chrome/Edge 无头模式把预览页的几种组合各截一张，做"真的渲染出来了"的自检。
 *
 * 注意：走 file:// 直开预览页。曾经起本地 HTTP 服务再让 Chrome 去访问，
 * Chrome 会在连接上挂住不返回（同样的参数、同样的页面，file:// 只要 1.3 秒）。
 *
 * 用法：node theme-lab/shoot.mjs
 * 产物：theme-lab/shots/*.png
 */

import { existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const HTML = join(HERE, 'preview.html')
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browser = CANDIDATES.find(p => existsSync(p))
if (browser === undefined) {
  console.error('找不到 Chrome/Edge，跳过截图。')
  process.exit(0)
}
console.log(`browser: ${browser}`)

/** file:// 形式的预览页地址（Windows 反斜杠要换成斜杠）。 */
const fileUrl = `file:///${HTML.replace(/\\/g, '/')}`

const SHOTS_LIST = [
  { name: 'mint-soda-light', family: 'mint-soda', scheme: 'light', cute: true },
  { name: 'mint-soda-dark', family: 'mint-soda', scheme: 'dark', cute: true },
  { name: 'sakura-mochi-light', family: 'sakura-mochi', scheme: 'light', cute: true },
  { name: 'lemon-cream-light', family: 'lemon-cream', scheme: 'light', cute: true },
  { name: 'sakura-mochi-nocute', family: 'sakura-mochi', scheme: 'light', cute: false },
]

for (const shot of SHOTS_LIST) {
  const url = `${fileUrl}#theme=${shot.family}&scheme=${shot.scheme}&cute=${shot.cute ? 1 : 0}`
  const out = join(SHOTS, `${shot.name}.png`)
  try {
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(SHOTS, '.profile')}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1440,900',
      '--virtual-time-budget=2500',
      `--screenshot=${out}`,
      url,
    ], { stdio: 'ignore', timeout: 45_000 })
    console.log(`  ✓ ${shot.name}.png`)
  } catch (err) {
    console.error(`  ✗ ${shot.name}: ${err.message}`)
  }
}

console.log('done')
