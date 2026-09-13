/*
 * 鎾斁鍣ㄥ師鍨嬫埅鍥?路 player preview shots
 * -------------------------------------
 * 鐢?file:// 鐩村紑棰勮椤碉紙headless 鐩磋繛鏈湴 HTTP 浼氭寕浣忥紝杩欎釜鍧戝湪 DSH 涓婚涓婅俯杩囷級锛? * 鎴嚑绉嶇粍鍚堝苟鎷兼垚瀵规瘮鍥俱€? *
 * 鐢ㄦ硶锛歯ode theme-lab/shoot-player.mjs
 * 浜х墿锛歵heme-lab/player-shots/*.png銆乧ompare.png
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PAGE = join(HERE, 'player-preview.html')
const OUT = join(HERE, 'player-shots')
mkdirSync(OUT, { recursive: true })

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))
if (browser === undefined) { console.error('鎵句笉鍒?Chrome/Edge'); process.exit(0) }

const fileUrl = `file:///${PAGE.replace(/\\/g, '/')}`
const SHOTS = [
  { name: 'light-soft', hash: 'scheme=light&decor=soft' },
  { name: 'light-rich', hash: 'scheme=light&decor=rich' },
  { name: 'dark-rich', hash: 'scheme=dark&decor=rich' },
  { name: 'dark-plain', hash: 'scheme=dark&decor=plain' },
]

for (const s of SHOTS) {
  const png = join(OUT, `${s.name}.png`)
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
      '--hide-scrollbars', '--force-device-scale-factor=1',
      '--window-size=1440,1000', '--virtual-time-budget=4000',
      `--screenshot=${png}`, `${fileUrl}#${s.hash}`,
    ], { stdio: 'ignore', timeout: 60_000 })
    console.log(`  鉁?${s.name}.png`)
  } catch (err) {
    console.error(`  鉁?${s.name}: ${err.message}`)
  }
}

const grid = SHOTS.filter(s => existsSync(join(OUT, `${s.name}.png`)))
  .map(s => `<figure><img src="${s.name}.png"><figcaption>${s.name}</figcaption></figure>`).join('\n')
writeFileSync(join(OUT, 'compare.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;padding:18px;background:#f4eef1;font-family:'Microsoft YaHei',sans-serif}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
figure{margin:0}img{display:block;width:100%;border-radius:8px;box-shadow:0 2px 10px #4a243022;background:#fff}
figcaption{font-size:12px;color:#6f5460;margin-top:5px;text-align:center}
</style></head><body><div class="grid">
${grid}
</div></body></html>`, 'utf8')

try {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1600,1200', '--virtual-time-budget=5000',
    `--screenshot=${join(OUT, 'compare.png')}`,
    `file:///${join(OUT, 'compare.html').replace(/\\/g, '/')}`,
  ], { stdio: 'ignore', timeout: 90_000 })
  console.log('  鉁?compare.png')
} catch (err) {
  console.error(`  鉁?compare: ${err.message}`)
}
console.log('done')

