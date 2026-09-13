/*
 * 歌词花字 · 单方案
 * -----------------
 * 按参考图：字面浅粉、描边深粉，无外圈。
 *
 * 描边用 text-shadow 八向环绕实现（实测 -webkit-text-stroke + paint-order
 * 在 Chrome 里白边/描边会被填充盖住，不可靠）。
 *
 * 用法：node theme-lab/build-flower-text.mjs
 * 产物：theme-lab/flower-text.html
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const SAMPLE_CN = '我所到之处留下的回忆都是你'
const SAMPLE_CN2 = '昏暗的光影 脚步声也清晰'
const SAMPLE_EN = 'I keep going back to when I laid eyes on you'

/** 八向环绕描边：把 n 个方向的偏移叠成"描边"。 */
function ring(color, px) {
  const d = px
  const k = px * 0.7071 // 对角方向，保证圆形环绕
  return [
    [d, 0], [-d, 0], [0, d], [0, -d],
    [k, k], [-k, -k], [k, -k], [-k, k],
  ].map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px 0 ${color}`).join(', ')
}

/** 亮/暗两套配色：字面浅、描边深。 */
const THEMES = {
  light: {
    label: '亮色',
    paper: '#fff9fa',
    fill: '#ffb3c6',      // 字面：浅粉
    stroke: '#e8557d',    // 描边：深粉
    text: '#3b2830',
    muted: '#9b7f8b',
    cardBg: 'rgba(255,255,255,.72)',
    swatch: '#ffb3c6',
  },
  dark: {
    label: '暗色',
    paper: '#211920',
    fill: '#ffc2d1',      // 字面：浅粉（暗底上再亮一点）
    stroke: '#c2436a',    // 描边：深粉
    text: '#ffeef3',
    muted: '#a48795',
    cardBg: 'rgba(255,255,255,.06)',
    swatch: '#ffc2d1',
  },
}

/** 描边粗细：按字号缩放，小字号描边细一点。 */
const SIZES = [
  { cls: 'big', px: 38, ring: 2.6 },
  { cls: 'mid', px: 22, ring: 1.8 },
  { cls: 'small', px: 14, ring: 1.2 },
]

const stageHtml = SIZES.map(s => `
  <div class="specimen s-${s.cls}">${SAMPLE_CN}</div>`).join('')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>歌词花字 · 浅粉字面 + 深粉描边</title>
<style>
@font-face {
  font-family: 'KN Maiyuan';
  src: url('./fonts/raw/KNMaiyuan-Regular.ttf') format('truetype');
  font-weight: 400; font-display: swap;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: 'Microsoft YaHei', sans-serif;
  background: var(--paper);
  color: var(--text);
  padding: 30px 32px 70px;
  transition: background .2s, color .2s;
}
h1 { font-size: 17px; font-weight: 500; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--muted); margin: 0 0 26px; }

.panel {
  border: .5px solid color-mix(in srgb, var(--text) 12%, transparent);
  border-radius: 20px; padding: 26px 30px 30px;
  background: var(--cardBg);
  max-width: 880px;
}
.row { display: flex; flex-direction: column; gap: 26px; }

/* 花字本体：浅粉字面 + 深粉描边 */
.flower {
  font-family: 'KN Maiyuan', 'Microsoft YaHei', sans-serif;
  color: var(--fill);
  line-height: 1.5;
  word-break: break-word;
  text-shadow: var(--flower-ring);
}
.s-big   { font-size: 40px; }
.s-mid   { font-size: 24px; }
.s-small { font-size: 15px; }

/* 各字号的描边粗细（由脚本按主题写入 --flower-ring） */

.meta {
  display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
  margin-top: 30px; padding-top: 20px;
  border-top: .5px solid color-mix(in srgb, var(--text) 10%, transparent);
  font-size: 12px; color: var(--muted);
}
.dot {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid var(--stroke); background: var(--fill);
  vertical-align: -2px; margin-right: 6px;
}
code { font-family: Consolas, monospace; font-size: 11.5px; color: var(--text); }

.switch {
  position: fixed; top: 16px; right: 16px; z-index: 9;
  display: flex; gap: 6px; padding: 5px;
  border-radius: 999px;
  background: var(--cardBg);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--text) 14%, transparent);
  border: .5px solid color-mix(in srgb, var(--text) 12%, transparent);
}
.switch button {
  font: inherit; font-size: 12px; height: 26px; padding: 0 12px; cursor: pointer;
  border: 0; border-radius: 999px; background: transparent; color: var(--text);
}
.switch button[aria-pressed="true"] { background: var(--stroke); color: #fff; }
</style>
</head>
<body>

<div class="switch">
  <button type="button" id="lightBtn" aria-pressed="true">亮色</button>
  <button type="button" id="darkBtn">暗色</button>
</div>

<h1>歌词花字 · 浅粉字面 + 深粉描边</h1>
<p class="hint">按参考图：字面浅粉、描边深粉，无外圈。三种字号都按比例调整描边粗细。</p>

<div class="panel">
  <div class="row">
    <div class="flower s-big">${SAMPLE_CN}</div>
    <div class="flower s-mid">${SAMPLE_CN2}</div>
    <div class="flower s-small">下一句 · ${SAMPLE_EN}</div>
  </div>

  <div class="meta">
    <span><span class="dot"></span>字面 <code id="fillHex">#ffb3c6</code></span>
    <span>描边 <code id="strokeHex">#e8557d</code></span>
    <span>描边粗细 <code>2.6 / 1.8 / 1.2 px</code>（按字号缩放）</span>
  </div>
</div>

<script>
const THEMES = ${JSON.stringify(THEMES)}
const RINGS = ${JSON.stringify(SIZES.map(s => s.ring))}
const RING_CSS = ${JSON.stringify(SIZES.map(s => ring('var(--stroke)', s.ring)))}

function apply(name) {
  const t = THEMES[name]
  const b = document.body
  b.style.setProperty('--paper', t.paper)
  b.style.setProperty('--fill', t.fill)
  b.style.setProperty('--stroke', t.stroke)
  b.style.setProperty('--text', t.text)
  b.style.setProperty('--muted', t.muted)
  b.style.setProperty('--cardBg', t.cardBg)

  // 每个字号套自己那层描边
  const cls = ['s-big', 's-mid', 's-small']
  cls.forEach((c, i) => {
    document.querySelectorAll('.' + c).forEach(el => {
      el.style.textShadow = RING_CSS[i]
    })
  })

  document.getElementById('fillHex').textContent = t.fill
  document.getElementById('strokeHex').textContent = t.stroke
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

const out = join(HERE, 'flower-text.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB)`)
