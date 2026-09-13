/*
 * 字体样张生成器 · font specimen
 * ------------------------------
 * 在樱花麻薯（亮色）这套调色板上，把同一段文字用不同字体各渲染一屏，
 * 再用 Chrome 无头模式截图，最后拼成一张对比图。
 *
 * 目的：让"柔和不影响代码阅读"这件事可比较，而不是靠形容词。
 *
 * 用法：node theme-lab/build-fonts.mjs
 * 产物：theme-lab/fonts-out/*.png、theme-lab/fonts-out/compare.png
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sakuraMochiLight } from './palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'fonts-out')
mkdirSync(OUT, { recursive: true })

const RESEARCH = join(HERE, '..', 'data', '_theme-research')
const read = (n) => readFileSync(join(RESEARCH, n), 'utf8')

/** 字体候选：ui 是正文/界面字体，code 是代码字体。 */
const CANDIDATES = [
  {
    id: 'wenkai',
    label: '霞鹜文楷 GB Lite（柔和手写感）',
    ui: "'LXGW WenKai GB Lite', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', Consolas, monospace",
    note: '开源 OFL。笔画带手写收笔，柔和不僵硬；字形略宽，需要把行高加一点。',
  },
  {
    id: 'wenkai-nunito',
    label: '霞鹜文楷 + Nunito（中文手写 + 英文圆体）',
    ui: "'Nunito', 'LXGW WenKai GB Lite', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', Consolas, monospace",
    note: '英文/数字走 Nunito（圆润几何体），中文走文楷，两边的"软"是一致的。',
  },
  {
    id: 'nunito',
    label: 'Nunito 优先 + 微软雅黑兜底（全圆润）',
    ui: "'Nunito', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', Consolas, monospace",
    note: '英文最圆润，但中文落回雅黑（黑体），中英文气质会有一点落差。',
  },
  {
    id: 'quicksand',
    label: 'Quicksand + 微软雅黑（更年轻的圆体）',
    ui: "'Quicksand', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', Consolas, monospace",
    note: 'Quicksand 笔画更细更圆，偏"可爱"；小字号下英文略飘。',
  },
  {
    id: 'deng',
    label: '等线 DengXian（本机系统字体，基线对照）',
    ui: "'DengXian', 'Microsoft YaHei', sans-serif",
    code: "Consolas, monospace",
    note: '不用装任何字体，柔和中带一点棱角，是最保守的选择。',
  },
]

/** 样张正文：中文、英文、数字、标点、代码、界面片段。 */
const SAMPLE = {
  cn: '春风十里，山河辽阔。人生百态，喜乐安然。',
  cn2: '把界面做得清新可爱一点，但别影响读代码。',
  en: 'The quick brown fox jumps over the lazy dog.',
  digits: '0123456789  ¥1,280.50  v0.1.2-rc.1',
  punct: '!@#$%^&*()_+-=[]{}|;:\'",./<>?',
  code: `export const sakuraMochi = {
  id: 'sakura-mochi',
  colorScheme: 'light',
  tokens: { '--dsw-alias-bg-base': '#fff9fa' },
}`,
}

function page(candidate) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('../fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Nunito'; src: url('../fonts/nunito-latin-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Nunito'; src: url('../fonts/nunito-latin-700.woff2') format('woff2'); font-weight: 700; font-display: block; }
@font-face { font-family: 'Quicksand'; src: url('../fonts/quicksand-latin-400.woff2') format('woff2'); font-weight: 400; font-display: block; }
@font-face { font-family: 'Quicksand'; src: url('../fonts/quicksand-latin-700.woff2') format('woff2'); font-weight: 700; font-display: block; }
@font-face { font-family: 'Maple Mono'; src: url('../fonts/maple-mono-latin-400.woff2') format('woff2'); font-weight: 400; font-display: block; }

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: ${candidate.ui};
  background: #fff9fa; color: #3b2830;
  padding: 28px 34px;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 15px; font-weight: 700; margin: 0 0 2px; color: #3b2830; }
.sub { font-size: 12px; color: #9b7f8b; margin: 0 0 20px; }
.row { margin: 0 0 16px; }
.tag { font-size: 11px; color: #9b7f8b; letter-spacing: .04em; margin-bottom: 4px; }
.cn { font-size: 26px; line-height: 40px; }
.cn2 { font-size: 15px; line-height: 26px; }
.en { font-size: 18px; line-height: 28px; }
.num { font-size: 16px; line-height: 26px; }
.punct { font-size: 15px; line-height: 24px; }
.bubble {
  max-width: 560px; padding: 10px 14px; border-radius: 20px;
  border-bottom-left-radius: 6px; background: #ffeef1;
  border: .5px solid #4a24301f; font-size: 14px; line-height: 24px;
  box-shadow: 0 1px 2px #4a243014;
}
.bubble code {
  font-family: ${candidate.code}; font-size: 12px;
  background: #fff; padding: 1px 5px; border-radius: 6px; color: #3b2830;
}
pre {
  margin: 0; padding: 12px 14px; border-radius: 14px;
  background: #fff3f5; border: .5px solid #4a24301f;
  font-family: ${candidate.code}; font-size: 12.5px; line-height: 20px;
  color: #6f5460; overflow: hidden;
}
.pill {
  display: inline-flex; align-items: center; height: 22px; padding: 0 10px;
  border-radius: 999px; background: #ffeaee; color: #ef7d9a;
  font-size: 12px; margin-right: 6px;
}
.btn {
  display: inline-flex; align-items: center; height: 34px; padding: 0 16px;
  border-radius: 12px; background: #ef7d9a; color: #fff; font-size: 13px;
  font-weight: 600; margin-right: 8px;
}
</style></head>
<body>
  <h1>${candidate.label}</h1>
  <p class="sub">${candidate.note}</p>

  <div class="row"><div class="tag">中文 · 26px</div><div class="cn">${SAMPLE.cn}</div></div>
  <div class="row"><div class="tag">中文 · 15px（界面正文）</div><div class="cn2">${SAMPLE.cn2}</div></div>
  <div class="row"><div class="tag">英文 · 18px</div><div class="en">${SAMPLE.en}</div></div>
  <div class="row"><div class="tag">数字与符号</div><div class="num">${SAMPLE.digits}</div><div class="punct">${SAMPLE.punct}</div></div>
  <div class="row"><div class="tag">对话气泡（含行内代码）</div>
    <div class="bubble">选好了就把它打包成主题插件，配置项叫 <code>--dsw-alias-bg-base</code>。</div>
  </div>
  <div class="row"><div class="tag">代码块 · 12.5px</div><pre>${SAMPLE.code}</pre></div>
  <div class="row"><div class="tag">控件</div>
    <span class="btn">新会话</span>
    <span class="pill">deepseek-v4.1</span><span class="pill">sakura-mochi</span><span class="pill">PASS</span>
  </div>
</body></html>`
}

/* ── 渲染 ── */

const CANDIDATES_WITH_FILES = CANDIDATES.map(c => ({ ...c, html: join(OUT, `${c.id}.html`), png: join(OUT, `${c.id}.png`) }))
for (const c of CANDIDATES_WITH_FILES) writeFileSync(c.html, page(c), 'utf8')

const CANDIDATES_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browser = CANDIDATES_BROWSERS.find(p => existsSync(p))
if (browser === undefined) {
  console.error('找不到 Chrome/Edge，跳过截图（HTML 已生成，可手动打开）。')
  process.exit(0)
}

for (const c of CANDIDATES_WITH_FILES) {
  const url = `file:///${c.html.replace(/\\/g, '/')}`
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
      '--hide-scrollbars', '--force-device-scale-factor=2',
      '--window-size=720,760', '--virtual-time-budget=4000',
      `--screenshot=${c.png}`, url,
    ], { stdio: 'ignore', timeout: 60_000 })
    console.log(`  ✓ ${c.id}.png`)
  } catch (err) {
    console.error(`  ✗ ${c.id}: ${err.message}`)
  }
}

/* ── 拼对比图：把 5 张竖排到一张宽图上 ── */

const cards = CANDIDATES_WITH_FILES
  .filter(c => existsSync(c.png))
  .map(c => `<figure><img src="${c.id}.png" alt="${c.label}"><figcaption>${c.label}</figcaption></figure>`)
  .join('\n')

writeFileSync(join(OUT, 'compare.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 20px; background: #f4eef1; font-family: 'Microsoft YaHei', sans-serif; }
h2 { font-size: 15px; color: #3b2830; margin: 0 0 16px; }
figure { margin: 0 0 22px; }
img { display: block; width: 620px; border-radius: 10px; box-shadow: 0 2px 10px #4a243022; background: #fff; }
figcaption { font-size: 12px; color: #6f5460; margin-top: 6px; }
</style></head><body>
<h2>字体候选对比（樱花麻薯 · 亮色）</h2>
${cards}
</body></html>`, 'utf8')

try {
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${join(OUT, '.profile')}`,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=680,3900', '--virtual-time-budget=4000',
    `--screenshot=${join(OUT, 'compare.png')}`,
    `file:///${join(OUT, 'compare.html').replace(/\\/g, '/')}`,
  ], { stdio: 'ignore', timeout: 90_000 })
  console.log('  ✓ compare.png')
} catch (err) {
  console.error(`  ✗ compare: ${err.message}`)
}

console.log('done')
