/*
 * 生成歌词浮层页面 · build overlay
 * --------------------------------
 * 用樱花麻薯的调色板与字体，做一张"实时歌词"浮层：
 *   · 顶部：当前曲目（封面位、歌名、歌手）
 *   · 中间：当前歌词行（大字）+ 下一行（小字）
 *   · 底部：细进度条 + 时间
 *   · 装饰：纸纹 + 呼吸光斑，三档强度可切
 *
 * 数据来自 /api/events（SSE），位置在两次推送之间用 requestAnimationFrame 推算，
 * 所以歌词切换是跟手而不是每秒跳一下。
 *
 * 用法：node src/build-overlay.mjs
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from '../../theme-lab/palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'overlay.html')

const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

const GRAIN = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"

/* ── 花字：字面浅粉 + 描边深粉 ── */

/**
 * 八向环绕描边。
 *
 * 为什么不用 -webkit-text-stroke：实测在 Chrome 里它会被字面填充盖住，
 * 描边出不来（paint-order 也救不回来）。text-shadow 八向叠放最可靠。
 */
function ringCss(color, px) {
  const d = px
  const k = px * 0.7071
  return [
    [d, 0], [-d, 0], [0, d], [0, -d],
    [k, k], [-k, -k], [k, -k], [-k, k],
  ].map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px 0 ${color}`).join(', ')
}

/** 花字配色：亮色用浅粉字面 + 深粉描边；暗色把字面提亮一档。 */
const FLOWER = {
  light: { fill: '#ffb3c6', fillDim: '#f5c9d4', stroke: '#e8557d' },
  dark: { fill: '#ffc2d1', fillDim: '#c99aa9', stroke: '#c2436a' },
}

/** 构建时算好的描边串（页面里直接用，不跑函数）。 */
const RING = {
  light: { thick: ringCss(FLOWER.light.stroke, 2.6), thin: ringCss(FLOWER.light.stroke, 1.8) },
  dark: { thick: ringCss(FLOWER.dark.stroke, 2.6), thin: ringCss(FLOWER.dark.stroke, 1.8) },
}

function decorVars(level, scheme) {
  const dark = scheme === 'dark'
  const accent = dark ? '#f7a8b8' : '#ef7d9a'
  const accent2 = dark ? '#8ed6ae' : '#5fb98a'
  if (level === 'plain') {
    return {
      '--decor-grain': 'none', '--decor-grain-opacity': '0', '--decor-blob-opacity': '0',
      '--decor-blob-1': 'transparent', '--decor-blob-2': 'transparent',
      '--decor-radius': '18px',
    }
  }
  const soft = {
    '--decor-grain': GRAIN,
    '--decor-grain-opacity': dark ? '0.05' : '0.06',
    '--decor-blend': dark ? 'screen' : 'multiply',
    '--decor-blob-opacity': dark ? '0.55' : '0.68',
    '--decor-blob-1': `color-mix(in srgb, ${accent} 20%, transparent)`,
    '--decor-blob-2': `color-mix(in srgb, ${accent2} 16%, transparent)`,
    '--decor-radius': '22px',
  }
  if (level !== 'rich') return soft
  return {
    ...soft,
    '--decor-grain-opacity': dark ? '0.08' : '0.09',
    '--decor-blob-opacity': dark ? '0.85' : '1',
    '--decor-blob-1': `color-mix(in srgb, ${accent} 30%, transparent)`,
    '--decor-blob-2': `color-mix(in srgb, ${accent2} 24%, transparent)`,
    '--decor-radius': '26px',
  }
}

const CSS = /* css */ `
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--font-ui);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

/* 浮层本体：整屏一张圆角卡片 */
.card {
  position: relative; height: 100%; margin: 10px;
  border-radius: var(--decor-radius);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent);
  border: .5px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-prominent);
  overflow: hidden;
  display: flex; flex-direction: column;
}
/* 装饰层 */
.card::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: var(--decor-grain, none);
  background-size: 120px 120px;
  opacity: var(--decor-grain-opacity, 0);
  mix-blend-mode: var(--decor-blend, normal);
}
.card::after {
  content: ''; position: absolute; inset: -20%; pointer-events: none;
  background:
    radial-gradient(42% 38% at 16% 12%, var(--decor-blob-1, transparent) 0%, transparent 62%),
    radial-gradient(38% 34% at 88% 30%, var(--decor-blob-2, transparent) 0%, transparent 60%),
    radial-gradient(50% 44% at 70% 96%, var(--decor-blob-1, transparent) 0%, transparent 64%);
  opacity: var(--decor-blob-opacity, 0);
  animation: breathe 16s ease-in-out infinite alternate;
}
@keyframes breathe {
  0% { transform: scale(1) translate(0,0) }
  100% { transform: scale(1.08) translate(1.5%, -2%) }
}

/* ── 顶部：曲目 ── */
.head {
  position: relative; z-index: 1; flex: none;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 22px 10px;
}
.cover {
  width: 46px; height: 46px; border-radius: 14px; flex: none;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--dsw-alias-button-primary-fill) 55%, transparent),
    color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent));
  box-shadow: var(--dsw-elevation-panel);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.meta { min-width: 0; flex: 1; }
.title {
  font-size: 17px; line-height: 25px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.artist {
  font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.status {
  flex: none; display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 10px; border-radius: 999px; font-size: 11px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  border: .5px solid var(--dsw-alias-border-l2);
}
.status .dot {
  width: 6px; height: 6px; border-radius: 50%; corner-shape: round;
  background: var(--dsw-alias-label-caption);
}
.status.on .dot { background: var(--dsw-alias-state-success-primary); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35 } }

/* ── 中间：歌词（上一句 / 当前句 / 下一句） ── */
.lyricArea {
  position: relative; z-index: 1; flex: 1; min-height: 0;
  display: flex; flex-direction: column; justify-content: center;
  padding: 0 22px; gap: 14px;
}
/* 当前歌词：荆南麦圆体 + 浅粉字面 / 深粉描边（text-shadow 八向环绕） */
.lineNow {
  font-family: var(--font-lyric);
  font-size: 40px; line-height: 1.42; font-weight: 400;
  color: var(--lyric-fill);
  text-shadow: var(--lyric-ring);
  transition: opacity .25s var(--ds-ease), transform .25s var(--ds-ease);
  word-break: break-word;
}
.lineNow.enter { animation: lineIn .38s var(--ds-ease); }
@keyframes lineIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* 上一句 / 下一句：同一字体，字号小一档、描边细一档、颜色更浅 */
.linePrev,
.lineNext {
  font-family: var(--font-lyric);
  font-size: 22px; line-height: 1.45;
  color: var(--lyric-fill-dim);
  text-shadow: var(--lyric-ring-thin);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: opacity .25s var(--ds-ease);
}
.linePrev { opacity: .55; }
.lineNext { opacity: .78; }
.lineTrans {
  font-size: 13px; line-height: 21px; color: var(--dsw-alias-label-tertiary);
  min-height: 21px;
}
.placeholder { font-size: 16px; line-height: 26px; color: var(--dsw-alias-label-caption); }
.placeholder b { color: var(--dsw-alias-label-secondary); font-weight: 500; }

/* ── 底部：进度（渐变胶囊） ── */
.foot {
  position: relative; z-index: 1; flex: none;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 22px 18px;
}
.time {
  font-family: var(--font-num); font-size: 11px; color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums; min-width: 38px;
}
.time.r { text-align: right; }
.bar { position: relative; flex: 1; height: 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); }
.bar i {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  background: linear-gradient(90deg,
    var(--dsw-alias-button-primary-fill),
    color-mix(in srgb, var(--dsw-alias-state-success-primary) 85%, #fff));
  border-radius: 999px;
  transition: width .25s linear;
}
/* 拖柄：随进度移动的圆点 */
.barKnob {
  position: absolute; top: 50%; left: 0; width: 11px; height: 11px;
  border-radius: 50%; corner-shape: round;
  transform: translate(-50%, -50%);
  background: var(--dsw-alias-button-floating-fill);
  border: 2px solid var(--dsw-alias-state-success-primary);
  box-shadow: var(--dsw-elevation-panel);
  transition: left .25s linear;
  pointer-events: none;
}

/* ── 设置按钮 + 弹出面板 ── */
.settingsBtn {
  position: fixed; top: 16px; right: 16px; z-index: 20;
  width: 30px; height: 30px; border-radius: 50%; corner-shape: round;
  display: inline-flex; align-items: center; justify-content: center;
  border: .5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-button-floating-fill);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 14px; line-height: 1;
  box-shadow: var(--dsw-elevation-panel);
  opacity: .35;
  transition: opacity .2s, transform .18s var(--ds-ease), color .18s var(--ds-ease);
}
.settingsBtn:hover, .settingsPanel:not([hidden]) ~ .settingsBtn { opacity: 1; }
.settingsBtn:hover { color: var(--dsw-alias-button-primary-fill); transform: rotate(24deg); }

.settingsPanel {
  position: fixed; top: 54px; right: 16px; z-index: 20;
  width: 226px; padding: 13px 15px 15px;
  border-radius: 16px;
  background: var(--dsw-alias-button-floating-fill);
  border: .5px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-prominent);
  display: flex; flex-direction: column; gap: 13px;
  font-family: var(--font-ui);
  transform-origin: top right;
  animation: panelIn .18s var(--ds-ease);
}
.settingsPanel[hidden] { display: none; }
@keyframes panelIn {
  from { opacity: 0; transform: scale(.94) translateY(-6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.field { display: flex; flex-direction: column; gap: 6px; }
.fieldLabel { font-size: 11px; color: var(--dsw-alias-label-caption); letter-spacing: .05em; }
.seg { display: flex; gap: 5px; }
.seg button {
  flex: 1; height: 26px; font: inherit; font-size: 12px; cursor: pointer;
  border: .5px solid var(--dsw-alias-border-l3); border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.seg button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.seg button[aria-pressed="true"] {
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-foreground);
}
.fieldHint { font-size: 10.5px; color: var(--dsw-alias-label-caption); line-height: 1.6; }

@media (prefers-reduced-motion: reduce) {
  .card::after, .status.on .dot { animation: none; }
  .lineNow, .bar i, .barKnob { transition: none; }
}
`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>实时歌词 · 樱花麻薯</title>
<style>
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Medium.ttf') format('truetype'); font-weight: 500 700; font-display: swap; }
@font-face { font-family: 'KN Maiyuan'; src: url('./fonts/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
</style>
<style>
:root {
  --ds-ease: cubic-bezier(.4,0,.2,1);
  --dsw-elevation-stroke-color: rgba(0,0,0,.06);
  --dsw-elevation-panel: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.03), 0 0 16px 0 rgba(0,0,0,.02);
  --dsw-elevation-prominent: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05);
}
</style>
<style>${CSS}</style>
</head>
<body>

<button class="settingsBtn" id="settingsBtn" title="设置" aria-expanded="false">⚙</button>

<div class="settingsPanel" id="settingsPanel" hidden>
  <div class="field">
    <span class="fieldLabel">明暗</span>
    <div class="seg" id="schemeSeg">
      <button type="button" data-scheme="light" aria-pressed="true">亮色</button>
      <button type="button" data-scheme="dark">暗色</button>
    </div>
  </div>

  <div class="field">
    <span class="fieldLabel">装饰强度</span>
    <div class="seg" id="decorSeg">
      <button type="button" data-decor="plain">素</button>
      <button type="button" data-decor="soft" aria-pressed="true">柔</button>
      <button type="button" data-decor="rich">满</button>
    </div>
    <span class="fieldHint">素＝无纹理，柔＝轻纸纹与光斑，满＝加重点阵与光斑。</span>
  </div>

  <div class="field">
    <span class="fieldLabel">歌词对齐</span>
    <div class="seg">
      <button type="button" id="backBtn" title="歌词提前 1 秒">−1s</button>
      <button type="button" id="offsetRead" title="当前偏移量">0.0s</button>
      <button type="button" id="fwdBtn" title="歌词延后 1 秒">+1s</button>
    </div>
    <span class="fieldHint">QQ 音乐不上报播放进度，拖动进度条后歌词可能整体偏移，用这里补偿。</span>
  </div>
</div>

<div class="card">
  <div class="head">
    <div class="cover" id="cover">♪</div>
    <div class="meta">
      <div class="title" id="title">等待播放…</div>
      <div class="artist" id="artist">在 QQ 音乐里开始播放</div>
    </div>
    <div class="status" id="status"><span class="dot"></span><span id="statusText">未连接</span></div>
  </div>

  <div class="lyricArea">
    <div class="linePrev" id="linePrev"></div>
    <div class="lineNow" id="lineNow"><span class="placeholder">打开 <b>QQ 音乐</b> 播放任意歌曲，这里会实时跟唱。</span></div>
    <div class="lineTrans" id="lineTrans"></div>
    <div class="lineNext" id="lineNext"></div>
  </div>

  <div class="foot">
    <span class="time" id="pos">0:00</span>
    <div class="bar"><i id="barFill"></i><span class="barKnob" id="barKnob"></span></div>
    <span class="time r" id="dur">0:00</span>
  </div>
</div>

<script>
const THEMES = ${JSON.stringify({ light: LIGHT, dark: DARK })}
const FLOWER = ${JSON.stringify(FLOWER)}
const RING = ${JSON.stringify(RING)}
const DECOR = ${JSON.stringify({
  plain: { light: decorVars('plain', 'light'), dark: decorVars('plain', 'dark') },
  soft: { light: decorVars('soft', 'light'), dark: decorVars('soft', 'dark') },
  rich: { light: decorVars('rich', 'light'), dark: decorVars('rich', 'dark') },
})}

let scheme = 'light'
let decor = 'soft'
let painted = []
let state = null          // 最近一次 SSE 快照
let snapshotAt = 0        // 收到快照的时刻
let basePosition = 0
let playing = false
let shownIndex = -2

function paint() {
  const body = document.body
  for (const n of painted) body.style.removeProperty(n)
  painted = []
  const theme = THEMES[scheme]
  document.documentElement.style.colorScheme = scheme
  body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
  for (const [k, v] of Object.entries(theme.tokens)) { body.style.setProperty(k, v); painted.push(k) }
  // 界面字体也统一成荆南麦圆体（歌名、时间、面板文案）
  const ui = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  const num = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  body.style.setProperty('--font-ui', ui); painted.push('--font-ui')
  body.style.setProperty('--font-num', num); painted.push('--font-num')
  body.style.setProperty('--font-lyric', "'KN Maiyuan', 'Microsoft YaHei', sans-serif"); painted.push('--font-lyric')
  body.style.setProperty('--dsw-font-family', ui); painted.push('--dsw-font-family')

  // 花字：字面浅粉 + 描边深粉（八向环绕）。描边串在构建时算好，页面里不跑函数。
  const flower = FLOWER[scheme]
  body.style.setProperty('--lyric-fill', flower.fill); painted.push('--lyric-fill')
  body.style.setProperty('--lyric-fill-dim', flower.fillDim); painted.push('--lyric-fill-dim')
  body.style.setProperty('--lyric-ring', RING[scheme].thick); painted.push('--lyric-ring')
  body.style.setProperty('--lyric-ring-thin', RING[scheme].thin); painted.push('--lyric-ring-thin')

  for (const [k, v] of Object.entries(DECOR[decor][scheme])) { body.style.setProperty(k, v); painted.push(k) }
  for (const b of document.querySelectorAll('#decorSeg [data-decor]')) {
    b.setAttribute('aria-pressed', String(b.dataset.decor === decor))
  }
  for (const b of document.querySelectorAll('#schemeSeg [data-scheme]')) {
    b.setAttribute('aria-pressed', String(b.dataset.scheme === scheme))
  }
}

for (const b of document.querySelectorAll('#decorSeg [data-decor]')) {
  b.addEventListener('click', () => { decor = b.dataset.decor; paint() })
}
for (const b of document.querySelectorAll('#schemeSeg [data-scheme]')) {
  b.addEventListener('click', () => { scheme = b.dataset.scheme; paint() })
}

// 设置面板开关
const panel = document.getElementById('settingsPanel')
const gear = document.getElementById('settingsBtn')
function togglePanel(open) {
  const next = open ?? panel.hidden
  panel.hidden = !next
  gear.setAttribute('aria-expanded', String(next))
}
gear.addEventListener('click', (e) => { e.stopPropagation(); togglePanel() })
panel.addEventListener('click', (e) => e.stopPropagation())
addEventListener('click', () => togglePanel(false))

// 手动对齐：QQ 音乐不上报播放进度，歌词整体偏移时用这两个按钮补偿
async function nudge(delta) {
  try {
    const r = await fetch('/api/offset?delta=' + delta)
    const j = await r.json()
    document.getElementById('offsetRead').textContent = (j.offset >= 0 ? '+' : '') + j.offset.toFixed(1) + 's'
  } catch { /* 网络抖一下就忽略 */ }
}
document.getElementById('backBtn').addEventListener('click', () => nudge(-1))
document.getElementById('fwdBtn').addEventListener('click', () => nudge(1))

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') togglePanel(false)
  if (e.key === 'd') { scheme = scheme === 'light' ? 'dark' : 'light'; paint() }
  if (e.key === '1') { decor = 'plain'; paint() }
  if (e.key === '2') { decor = 'soft'; paint() }
  if (e.key === '3') { decor = 'rich'; paint() }
  if (e.key === '[') nudge(-1)
  if (e.key === ']') nudge(1)
})

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

/* ── SSE ── */
let es
function connect() {
  es = new EventSource('/api/events')
  es.onmessage = (e) => {
    try {
      state = JSON.parse(e.data)
      snapshotAt = performance.now()
      basePosition = state.position ?? 0
      playing = !!state.playing
      render(true)
    } catch { /* 忽略坏帧 */ }
  }
  es.onerror = () => {
    document.getElementById('statusText').textContent = '重连中'
    document.getElementById('status').classList.remove('on')
  }
  es.onopen = () => { /* 状态由数据帧决定 */ }
}
connect()

/** 推算当前位置（两次推送之间插值，让歌词跟手）。 */
function currentPosition() {
  if (state === null) return 0
  const elapsed = playing ? (performance.now() - snapshotAt) / 1000 : 0
  let p = basePosition + elapsed
  const dur = state.track?.duration ?? 0
  if (dur > 0) p = Math.min(p, dur)
  return p
}

function render(fresh) {
  const el = (id) => document.getElementById(id)
  if (state === null) return

  const status = el('status')
  const statusText = el('statusText')

  if (state.track === null) {
    el('title').textContent = '等待播放…'
    el('artist').textContent = '在 QQ 音乐里开始播放'
    el('cover').textContent = '♪'
    el('linePrev').textContent = ''
    el('lineNow').innerHTML = '<span class="placeholder">打开 <b>QQ 音乐</b> 播放任意歌曲，这里会实时跟唱。</span>'
    el('lineTrans').textContent = ''
    el('lineNext').textContent = ''
    el('barFill').style.width = '0%'
    el('barKnob').style.left = '0%'
    el('pos').textContent = '0:00'
    el('dur').textContent = '0:00'
    statusText.textContent = '未播放'
    status.classList.remove('on')
    shownIndex = -2
    return
  }

  el('title').textContent = state.track.title || '未知曲目'
  el('artist').textContent = [state.track.artist, state.track.album].filter(Boolean).join(' · ')
  el('cover').textContent = '♪'
  statusText.textContent = playing ? '播放中' : '已暂停'
  status.classList.toggle('on', playing)

  const pos = currentPosition()
  el('pos').textContent = fmt(pos)
  el('dur').textContent = fmt(state.track.duration ?? 0)
  const pct = state.track.duration > 0 ? Math.min(100, pos / state.track.duration * 100) : 0
  el('barFill').style.width = pct + '%'
  el('barKnob').style.left = pct + '%'

  // 只有纯文本歌词（没有时间戳）时，退化成"不跟唱、只显示一段"
  if (state.kind === 'plain') {
    if (shownIndex !== -3) {
      shownIndex = -3
      const texts = state.textLines ?? []
      el('linePrev').textContent = ''
      el('lineNow').innerHTML = '<span class="placeholder">这首歌没有同步歌词</span>'
      el('lineTrans').textContent = ''
      el('lineNext').textContent = texts.slice(0, 2).join(' / ')
    }
    return
  }

  // 前奏阶段：正文歌词还没开始（开头的作词/作曲字幕不上屏）
  if (state.creditUntil > 0 && pos < state.creditUntil) {
    if (shownIndex !== -4) {
      shownIndex = -4
      el('linePrev').textContent = ''
      el('lineNow').innerHTML = '<span class="placeholder">前奏中 · 歌词马上开始</span>'
      el('lineTrans').textContent = ''
      el('lineNext').textContent = ''
    }
    return
  }

  const lines = state.lines ?? []

  // 用推算位置重新找当前行（推送之间也更新）
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= pos + 0.15) idx = i
    else break
  }

  if (idx !== shownIndex) {
    shownIndex = idx
    const prev = idx > 0 ? lines[idx - 1].text : ''
    const now = idx >= 0 ? lines[idx].text : ''
    const next = idx + 1 < lines.length ? lines[idx + 1].text : ''
    const nowEl = el('lineNow')
    if (now === '') {
      nowEl.innerHTML = '<span class="placeholder">' + (lines.length === 0 ? '这首歌暂时没有同步歌词' : '…') + '</span>'
    } else {
      nowEl.textContent = now
      nowEl.classList.remove('enter')
      void nowEl.offsetWidth
      nowEl.classList.add('enter')
    }
    el('linePrev').textContent = prev
    el('lineNext').textContent = next
    el('lineTrans').textContent = state.trans || ''
  }
}

// 每帧更新进度条与当前行（SSE 只负责切歌/歌词到位）
function loop() {
  if (state !== null && state.track !== null) render(false)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

paint()
</script>
</body>
</html>
`

writeFileSync(OUT, html, 'utf8')
console.log(`wrote ${OUT}`)
console.log(`size: ${(html.length / 1024).toFixed(1)} KiB`)
