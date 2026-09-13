/*
 * 大钟变体 · 样张
 * --------------
 * 参考桌面壁纸时钟的做法：时间占绝对主导、大量留白、辅助信息极小极淡。
 * 同一份数据（系统时间 / 已计时长 / 日期 / 状态）排成几种版式。
 *
 * 用法：node theme-lab/build-clock-lab.mjs
 * 产物：theme-lab/clock-lab.html
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from './palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

/** 样张数据（固定值，方便对比版式）。 */
const SAMPLE = {
  clock: '0:47:05',
  clockParts: ['0', '47', '05'],
  elapsed: '+0:17:05',
  date: '2026/9/10',
  state: '专注中',
}

const VARIANTS = [
  {
    id: 'v1',
    name: 'V1 · 极简巨钟',
    note: '时间独占，日期压在正下方。其他信息一律不要——最接近壁纸时钟的做法。',
    html: `
      <div class="stage v1">
        <div class="c1time">${SAMPLE.clock}</div>
        <div class="c1date">${SAMPLE.date}</div>
      </div>`,
  },
  {
    id: 'v2',
    name: 'V2 · 巨钟 + 计时',
    note: '主时间是系统时间，右下方挂已计时长。信息完整但仍有主次。',
    html: `
      <div class="stage v2">
        <div class="c2main">
          <div class="c1time">${SAMPLE.clock}</div>
          <div class="c1date">${SAMPLE.date}</div>
        </div>
        <div class="c2side">
          <div class="c2elapsed">${SAMPLE.elapsed}</div>
          <div class="c2state">${SAMPLE.state}</div>
        </div>
      </div>`,
  },
  {
    id: 'v3',
    name: 'V3 · 分段巨钟',
    note: '时/分/秒 分段，冒号做小做淡。数字感的壁纸钟常用这个做法。',
    html: `
      <div class="stage v3">
        <div class="c3time">
          <span>${SAMPLE.clockParts[0]}</span><i>:</i><span>${SAMPLE.clockParts[1]}</span><i>:</i><span>${SAMPLE.clockParts[2]}</span>
        </div>
        <div class="c3row">
          <span>${SAMPLE.date}</span>
          <span class="dot">·</span>
          <span class="c3elapsed">${SAMPLE.elapsed}</span>
          <span class="dot">·</span>
          <span class="c3state">${SAMPLE.state}</span>
        </div>
      </div>`,
  },
  {
    id: 'v4',
    name: 'V4 · 计时为主',
    note: '把已计时长做成主数字（毕竟这是计时器），系统时间退到副行。',
    html: `
      <div class="stage v4">
        <div class="c4top"><span class="c4state">${SAMPLE.state}</span><span class="c1date">${SAMPLE.date}</span></div>
        <div class="c1time">${SAMPLE.elapsed}</div>
        <div class="c4now">${SAMPLE.clock}</div>
      </div>`,
  },
]

const CSS = /* css */ `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 26px 30px 60px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: 'KN Maiyuan', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 16px; font-weight: 400; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--dsw-alias-label-caption); margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); gap: 18px; }
.card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 18px; padding: 14px 20px 18px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 60%, #fff 40%);
}
body[data-ds-dark-theme] .card { background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, #fff 18%); }
.card h2 { font-size: 13.5px; font-weight: 400; margin: 0 0 2px; }
.note { font-size: 11.5px; color: var(--dsw-alias-label-caption); margin: 0 0 20px; line-height: 1.6; }
.stage {
  min-height: 260px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
  background:
    radial-gradient(60% 50% at 30% 20%, color-mix(in srgb, var(--dsw-alias-button-primary-fill) 10%, transparent) 0%, transparent 62%),
    radial-gradient(50% 44% at 80% 90%, color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent) 0%, transparent 60%);
}

/* 通用巨钟 */
.c1time {
  font-size: 92px; line-height: 1; font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: .01em;
  color: var(--dsw-alias-label-primary);
}
.c1date {
  font-size: 15px; color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  letter-spacing: .08em;
}

/* V1 */
.v1 { flex-direction: column; gap: 10px; }

/* V2 */
.v2 { justify-content: center; gap: 46px; }
.c2main { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.c2side { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.c2elapsed {
  font-size: 30px; line-height: 1.1; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-button-primary-fill);
}
.c2state { font-size: 13px; color: var(--dsw-alias-state-success-primary); letter-spacing: .08em; }

/* V3 */
.v3 { flex-direction: column; gap: 14px; }
.c3time {
  display: flex; align-items: baseline; gap: 4px;
  font-size: 92px; line-height: 1; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.c3time i {
  font-style: normal; font-size: 54px;
  color: var(--dsw-alias-label-dimmed);
  transform: translateY(-6px);
  animation: blink 2s steps(1, end) infinite;
}
@keyframes blink { 50% { opacity: .28 } }
.c3row {
  display: flex; align-items: baseline; gap: 10px;
  font-size: 14px; color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums; letter-spacing: .06em;
}
.c3row .dot { opacity: .5 }
.c3elapsed { color: var(--dsw-alias-button-primary-fill); }
.c3state { color: var(--dsw-alias-state-success-primary); }

/* V4 */
.v4 { flex-direction: column; gap: 12px; }
.c4top {
  display: flex; align-items: baseline; gap: 16px;
  font-size: 13px; letter-spacing: .1em;
}
.c4state { color: var(--dsw-alias-state-success-primary); }
.c4now {
  font-size: 22px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-caption); letter-spacing: .06em;
}

/* 控制条 */
.switch {
  position: fixed; top: 16px; right: 16px; z-index: 9;
  display: flex; gap: 6px; padding: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-button-floating-fill);
  box-shadow: var(--dsw-elevation-prominent);
  border: .5px solid var(--dsw-alias-border-l2);
}
.switch button {
  font: inherit; font-size: 12px; height: 26px; padding: 0 12px; cursor: pointer;
  border: 0; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary);
}
.switch button[aria-pressed="true"] { background: var(--dsw-alias-button-primary-fill); color: #fff; }
`

const cards = VARIANTS.map(v => `
<section class="card">
  <h2>${v.name}</h2>
  <p class="note">${v.note}</p>
  ${v.html}
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大钟版式 · 样张</title>
<style>
@font-face { font-family: 'KN Maiyuan'; src: url('./fonts/raw/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
</style>
<style>
:root {
  --dsw-elevation-stroke-color: rgba(0,0,0,.06);
  --dsw-elevation-panel: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.03), 0 0 16px 0 rgba(0,0,0,.02);
  --dsw-elevation-prominent: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05);
}
</style>
<style>${CSS}</style>
</head>
<body>

<div class="switch">
  <button type="button" id="lightBtn" aria-pressed="true">亮色</button>
  <button type="button" id="darkBtn">暗色</button>
</div>

<h1>大钟版式 · ${VARIANTS.length} 种</h1>
<p class="hint">同一份数据、四种排布。切右上角看暗色下的表现。</p>
<div class="grid">
${cards}
</div>

<script>
const THEMES = ${JSON.stringify({ light: LIGHT, dark: DARK })}
function apply(name) {
  const t = THEMES[name]
  const b = document.body
  for (const [k, v] of Object.entries(t.tokens)) b.style.setProperty(k, v)
  b.toggleAttribute('data-ds-dark-theme', name === 'dark')
  document.documentElement.style.colorScheme = name
  document.getElementById('lightBtn').setAttribute('aria-pressed', String(name === 'light'))
  document.getElementById('darkBtn').setAttribute('aria-pressed', String(name === 'dark'))
}
document.getElementById('lightBtn').addEventListener('click', () => apply('light'))
document.getElementById('darkBtn').addEventListener('click', () => apply('dark'))
apply('light')
</script>
</body>
</html>
`

const out = join(HERE, 'clock-lab.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB, ${VARIANTS.length} 种)`)
