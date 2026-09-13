/*
 * 歌词字体候选 · 样张生成
 * ----------------------
 * 用同一段歌词，把每款候选字体渲染一屏，再拼成对比图。
 *
 * 字体来自 theme-lab/fonts/<包名>/（cn-fontsource 的分片 woff2 + font.css），
 * 浏览器按 unicode-range 只拉用到的分片，所以整包不大。
 *
 * 用法：node theme-lab/build-lyric-fonts.mjs
 * 产物：theme-lab/font-specimens/*.png + compare.png
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONTS = join(HERE, 'fonts')
const OUT = join(HERE, 'font-specimens')
mkdirSync(OUT, { recursive: true })

/** 候选字体。cssFamily 是 font.css 里声明的 family 名，需要从 CSS 里读。 */
const CANDIDATES = [
  { dir: 'cn-fontsource-yozai-regular', name: '悠哉字体', note: '手写感，笔画圆润，像铅笔写的' },
  { dir: 'cn-fontsource-maoken-zhuyuan-ti-regular', name: '猫啃珠圆体', note: '标题圆体，圆润饱满' },
  { dir: 'cn-fontsource-mdmd-wu-feng-ti-regular', name: '无锋体', note: '浑圆无折角，没有笔锋' },
  { dir: 'cn-fontsource-hanazome-font-regular', name: '花染体', note: '日系可爱手写' },
  { dir: 'cn-fontsource-rii-tegaki-fude-regular', name: 'Rii 手写笔', note: '日系手写，带一点毛笔味' },
  { dir: 'cn-fontsource-lxgw-marker-gothic-regular', name: '霞鹜漫黑', note: '漫画标题风，笔画粗圆' },
  { dir: 'cn-fontsource-x-12-y-16-px-maru-monica-regular', name: '丸モニカ', note: '16px 点阵圆体（像素感）' },
  { dir: 'builtin-wenkai', name: '霞鹜文楷（现用）', note: '当前方案，作为对照' },
]

/** 从 font.css 里读出 font-family 名。 */
function familyOf(dir) {
  const css = join(FONTS, dir, 'font.css')
  if (!existsSync(css)) return null
  const text = readFileSync(css, 'utf8')
  const m = /font-family\s*:\s*['"]?([^'";]+)['"]?\s*;/.exec(text)
  return m === null ? null : m[1].trim()
}

/** 样张用的歌词（真实歌词内容）。 */
const LYRICS = [
  '我所到之处留下的回忆都是你',
  '昏暗的光影 脚步声也清晰',
  '你的心扑通扑通钻进我脑里',
  '晚风吹过 云朵朵',
]

const PAGE_CSS = /* css */ `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 26px 30px;
  background: #fff9fa; color: #3b2830;
  font-family: 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 15px; margin: 0 0 3px; font-weight: 500; }
.sub { font-size: 12px; color: #9b7f8b; margin: 0 0 20px; }
.row { margin-bottom: 20px; }
.tag { font-size: 11px; color: #9b7f8b; letter-spacing: .04em; margin-bottom: 5px; }
.big { font-size: 30px; line-height: 44px; }
.mid { font-size: 22px; line-height: 34px; }
.small { font-size: 15px; line-height: 26px; color: #6f5460; }
.latin { font-size: 17px; line-height: 26px; }
.nums { font-size: 15px; line-height: 24px; font-variant-numeric: tabular-nums; }
.punct { font-size: 15px; line-height: 24px; }
.now { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #ffeef1; }
`

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))

/** 一款字体一屏。 */
function page(candidate, family) {
  // 注意：@import 必须位于样式表最前，否则被忽略——所以这里直接内联 font.css 内容。
  let faceCss
  if (family === null) {
    faceCss = `@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('http://127.0.0.1:7790/fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: block; }`
  } else {
    const cssPath = join(FONTS, candidate.dir, 'font.css')
    // 用 http:// 绝对地址：file:// 下 Chrome 会拦字体请求
    faceCss = readFileSync(cssPath, 'utf8')
      .replace(/url\((['"]?)([^)'"]+)\1\)/g, (_, _q, p) =>
        `url('http://127.0.0.1:7790/fonts/${candidate.dir}/${p.replace(/^\.\//, '')}')`)
  }
  const fam = family === null ? "'LXGW WenKai GB Lite'" : `'${family}'`

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${faceCss}</style>
<style>${PAGE_CSS}</style>
<style>
  .specimen { font-family: ${fam}, 'Microsoft YaHei', sans-serif; }
</style>
</head><body>
  <h1>${candidate.name}</h1>
  <p class="sub">${candidate.note}</p>

  <div class="row"><div class="tag">当前歌词 · 30px</div>
    <div class="specimen big"><span class="now">${LYRICS[0]}</span></div></div>

  <div class="row"><div class="tag">整句 · 22px</div>
    <div class="specimen mid">${LYRICS[1]}<br>${LYRICS[2]}</div></div>

  <div class="row"><div class="tag">下一句 · 15px</div>
    <div class="specimen small">下一句 · ${LYRICS[3]}</div></div>

  <div class="row"><div class="tag">英文歌词 · 17px</div>
    <div class="specimen latin">I keep going back to when I laid eyes on you</div></div>

  <div class="row"><div class="tag">数字与标点</div>
    <div class="specimen nums">0:30 / 3:33　128kbps　2026</div>
    <div class="specimen punct">！？，。、；：""''（）——…·～</div></div>
</body></html>`
}

const shots = []

for (const c of CANDIDATES) {
  const family = c.dir === 'builtin-wenkai' ? null : familyOf(c.dir)
  if (c.dir !== 'builtin-wenkai' && family === null) {
    console.log(`  ✗ ${c.name}：读不到 font.css 里的 family`)
    continue
  }
  const htmlPath = join(OUT, `${c.dir}.html`)
  const pngPath = join(OUT, `${c.dir}.png`)
  writeFileSync(htmlPath, page(c, family), 'utf8')
  shots.push({ ...c, htmlPath, pngPath, family })
  console.log(`  ✓ ${c.name.padEnd(12)} family=${family ?? '(内置)'}`)
}

if (browser === undefined) { console.log('找不到 Chrome/Edge，HTML 已生成'); process.exit(0) }

for (const s of shots) {
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
      '--hide-scrollbars', '--force-device-scale-factor=2',
      '--window-size=680,600', '--virtual-time-budget=8000',
      `--screenshot=${s.pngPath}`, `http://127.0.0.1:7790/font-specimens/${s.dir}.html`,
    ], { stdio: 'ignore', timeout: 90_000 })
    console.log(`  ✓ 截图 ${s.dir}.png`)
  } catch (err) {
    console.log(`  ✗ 截图 ${s.dir}: ${err.message}`)
  }
}

// 拼对比图
const cards = shots.filter(s => existsSync(s.pngPath))
  .map(s => `<figure><img src="${s.dir}.png"><figcaption>${s.name} · ${s.note}</figcaption></figure>`).join('\n')
writeFileSync(join(OUT, 'compare.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{margin:0;padding:18px;background:#f4eef1;font-family:'Microsoft YaHei',sans-serif}
h2{font-size:15px;color:#3b2830;margin:0 0 16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
figure{margin:0}
img{display:block;width:100%;border-radius:8px;box-shadow:0 2px 10px #4a243022;background:#fff}
figcaption{font-size:12px;color:#6f5460;margin-top:5px}
</style></head><body>
<h2>歌词字体候选（樱花麻薯 · 亮色）</h2>
<div class="grid">${cards}</div>
</body></html>`, 'utf8')

try {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1500,2100', '--virtual-time-budget=8000',
    `--screenshot=${join(OUT, 'compare.png')}`,
    'http://127.0.0.1:7790/font-specimens/compare.html',
  ], { stdio: 'ignore', timeout: 120_000 })
  console.log('  ✓ compare.png')
} catch (err) {
  console.log(`  ✗ compare: ${err.message}`)
}

console.log('done')
