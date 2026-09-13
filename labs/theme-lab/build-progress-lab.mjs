/*
 * 进度条皮肤 · 样张
 * ----------------
 * 同一首曲子，几种进度条样式并排，挑一个接进播放器界面。
 *
 * 参考了主流播放器的做法：
 *   网易云：细线 + 圆点，hover 变粗
 *   Apple Music：胶囊 + 拖柄放大
 *   波形条：细竖条阵列，已播部分点亮（你给的参考图用的就是这个）
 *
 * 用法：node theme-lab/build-progress-lab.mjs
 * 产物：theme-lab/progress-lab.html
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from './palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

/** 波形条的假数据（固定种子，保证每次渲染一致）。 */
function waveHeights(n, seed = 7) {
  const out = []
  let s = seed
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648
    const r = s / 2147483648
    // 中间偏高、两端偏低，加一点随机
    const env = 0.45 + 0.55 * Math.sin((i / n) * Math.PI)
    out.push(Math.round((0.28 + 0.72 * r) * env * 100) / 100)
  }
  return out
}

const BARS = 64
const HEIGHTS = waveHeights(BARS)
const DOTS = 48

const VARIANTS = [
  {
    id: 'thin',
    name: '细线胶囊（当前）',
    note: '5px 细条 + 圆点拖柄。最克制，不抢戏。',
    html: `<div class="pb pb-thin"><i style="width:42%"></i><span class="knob"></span></div>`,
  },
  {
    id: 'thick',
    name: '粗胶囊 + 大拖柄',
    note: '8px 粗条 + 14px 拖柄。更好抓，视觉更重。',
    html: `<div class="pb pb-thick"><i style="width:42%"></i><span class="knob"></span></div>`,
  },
  {
    id: 'heart',
    name: '心形拖柄',
    note: '细条 + 心形拖柄（用 emoji 或 CSS 画）。可爱度最高。',
    html: `<div class="pb pb-thin"><i style="width:42%"></i><span class="knob knob-heart">♥</span></div>`,
  },
  {
    id: 'wave',
    name: '波形条',
    note: '细竖条阵列，已播部分点亮（你参考图里的做法）。信息量最大。',
    html: `<div class="pb pb-wave">${HEIGHTS.map((h, i) =>
      `<span class="${i / BARS <= 0.42 ? 'on' : ''}" style="height:${Math.round(h * 100)}%"></span>`).join('')}</div>`,
  },
  {
    id: 'dots',
    name: '圆点条',
    note: '一排小圆点，已播的点填充。轻巧、有节奏感。',
    html: `<div class="pb pb-dots">${Array.from({ length: DOTS }, (_, i) =>
      `<span class="${i / DOTS <= 0.42 ? 'on' : ''}"></span>`).join('')}</div>`,
  },
  {
    id: 'glow',
    name: '发光胶囊',
    note: '已播部分带同色柔光，像灯条。暗色底上尤其好看。',
    html: `<div class="pb pb-glow"><i style="width:42%"></i><span class="knob"></span></div>`,
  },
  {
    id: 'gradient',
    name: '双色渐变胶囊',
    note: '粉 → 薄荷绿渐变，已播部分有颜色流动感。',
    html: `<div class="pb pb-gradient"><i style="width:42%"></i><span class="knob"></span></div>`,
  },
  {
    id: 'segments',
    name: '分段胶囊',
    note: '切成若干小段，已播的段点亮。复古进度条的感觉。',
    html: `<div class="pb pb-segments">${Array.from({ length: 28 }, (_, i) =>
      `<span class="${i / 28 <= 0.42 ? 'on' : ''}"></span>`).join('')}</div>`,
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
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 18px; }
.card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 18px; padding: 16px 20px 20px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 60%, #fff 40%);
}
body[data-ds-dark-theme] .card { background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, #fff 18%); }
.card h2 { font-size: 13.5px; font-weight: 400; margin: 0 0 2px; }
.note { font-size: 11.5px; color: var(--dsw-alias-label-caption); margin: 0 0 22px; line-height: 1.6; }
.stage { padding: 6px 2px 2px; }
.timeRow {
  display: flex; justify-content: space-between; margin-top: 8px;
  font-size: 10.5px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-caption);
}

/* ── 通用 ── */
.pb { position: relative; }
.pb i {
  position: absolute; inset: 0 auto 0 0; border-radius: 999px;
  background: var(--dsw-alias-button-primary-fill);
}
.knob {
  position: absolute; top: 50%; left: 42%; transform: translate(-50%, -50%);
  border-radius: 50%; corner-shape: round;
  background: var(--dsw-alias-button-floating-fill);
  border: 2px solid var(--dsw-alias-button-primary-fill);
  box-shadow: var(--dsw-elevation-panel);
}
.knob-heart {
  border: 0; background: transparent; box-shadow: none;
  color: var(--dsw-alias-button-primary-fill);
  font-size: 16px; line-height: 1;
}

/* 1 细线 */
.pb-thin { height: 5px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.pb-thin .knob { width: 10px; height: 10px; }

/* 2 粗胶囊 */
.pb-thick { height: 9px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.pb-thick .knob { width: 15px; height: 15px; border-width: 2.5px; }

/* 4 波形 */
.pb-wave {
  height: 26px; display: flex; align-items: center; gap: 2px;
}
.pb-wave span {
  flex: 1; min-height: 3px; border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
}
.pb-wave span.on { background: var(--dsw-alias-button-primary-fill); }

/* 5 圆点 */
.pb-dots { height: 14px; display: flex; align-items: center; gap: 3px; }
.pb-dots span {
  width: 5px; height: 5px; border-radius: 50%; corner-shape: round; flex: none;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
}
.pb-dots span.on { background: var(--dsw-alias-button-primary-fill); }

/* 6 发光 */
.pb-glow { height: 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.pb-glow i { box-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-button-primary-fill) 75%, transparent); }
.pb-glow .knob { width: 11px; height: 11px; box-shadow: 0 0 10px color-mix(in srgb, var(--dsw-alias-button-primary-fill) 60%, transparent); }

/* 7 渐变 */
.pb-gradient { height: 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.pb-gradient i {
  background: linear-gradient(90deg,
    var(--dsw-alias-button-primary-fill),
    color-mix(in srgb, var(--dsw-alias-state-success-primary) 85%, #fff));
}
.pb-gradient .knob { width: 11px; height: 11px; border-color: var(--dsw-alias-state-success-primary); }

/* 8 分段 */
.pb-segments { height: 10px; display: flex; gap: 3px; }
.pb-segments span {
  flex: 1; border-radius: 3px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.pb-segments span.on { background: var(--dsw-alias-button-primary-fill); }

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
  <div class="stage">${v.html}</div>
  <div class="timeRow"><span>01:09</span><span>02:44</span></div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>进度条皮肤 · 样张</title>
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

<h1>进度条皮肤 · ${VARIANTS.length} 种</h1>
<p class="hint">同一首曲子、同一进度（42%）。切右上角看暗色下的表现。</p>
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

const out = join(HERE, 'progress-lab.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB, ${VARIANTS.length} 种)`)
