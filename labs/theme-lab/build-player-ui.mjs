/*
 * 播放器界面 · 静态预览
 * --------------------
 * 参考图：横版卡片
 *   左：方形封面（占位用专辑图，后续换成二次元人物）
 *   右：上方留空（原耳机位置，后续放别的东西）
 *       下方 歌名/歌手 一行 + 细进度条 + 时间
 *   底部：歌词（上一句 / 当前句 / 下一句）
 *
 * 视觉沿用樱花麻薯：荆南麦圆体歌词 + 浅粉字面深粉描边 + 纸纹光斑装饰。
 *
 * 用法：node theme-lab/build-player-ui.mjs
 * 产物：theme-lab/player-ui.html
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from './palettes.mjs'
import { timerModuleSource } from './src/timer-inline.mjs'
import { liveModuleSource } from '../lyric-overlay/src/live-inline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

/** 八向环绕描边。 */
function ring(color, px) {
  const k = px * 0.7071
  return [
    [px, 0], [-px, 0], [0, px], [0, -px],
    [k, k], [-k, -k], [k, -k], [-k, k],
  ].map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px 0 ${color}`).join(', ')
}

/** 花字配色。 */
const FLOWER = {
  light: { fill: '#ffb3c6', dim: '#f5c9d4', stroke: '#e8557d' },
  dark: { fill: '#ffc2d1', dim: '#c99aa9', stroke: '#c2436a' },
}

/**
 * 界面文字的花字配色。
 *
 * 每个元素一个色系，靠**色相**区分主次（而不是全用粉，那样看久了会疲劳）；
 * 但都收在糖果色范围内，保证和樱花麻薯主题统一。
 *
 *   大钟  —— 天蓝：一屏最大的元素，用冷色压场，和粉色歌词形成对比
 *   日期  —— 薰衣草紫：跟大钟同属冷色，形成一组
 *   歌名  —— 樱花粉：暖色，和歌词呼应（歌名和歌词本来就是一件事）
 *   歌手  —— 蜜桃橙：比粉再暖一档，最轻
 *
 * 每组都是「浅色字面 + 深色描边」，亮色底上用深色字 + 白边。
 */
const TEXT_INK = {
  light: {
    clock: { fill: '#5aa9d6', stroke: 'rgba(255,255,255,.95)', outer: 'rgba(90,169,214,.5)' },
    date: { fill: '#8b9ad4', stroke: 'rgba(255,255,255,.9)', outer: null },
    title: { fill: '#ef7d9a', stroke: 'rgba(255,255,255,.9)', outer: null },
    artist: { fill: '#e8a06a', stroke: 'rgba(200,120,60,.5)', outer: null },
  },
  dark: {
    clock: { fill: '#a8d8f0', stroke: 'rgba(26,38,52,.95)', outer: 'rgba(168,216,240,.45)' },
    date: { fill: '#b8c2ef', stroke: 'rgba(30,32,58,.9)', outer: null },
    title: { fill: '#f7a8b8', stroke: 'rgba(58,42,51,.9)', outer: null },
    artist: { fill: '#e8b98a', stroke: 'rgba(70,48,30,.7)', outer: null },
  },
}

/**
 * 生成"描边"用的 text-shadow。
 * 原理同歌词：八向环绕（-webkit-text-stroke 在 Chrome 里会被填充盖住，不能用）。
 *
 * @param {string} color 描边色
 * @param {number} px 描边粗细
 */
function ringShadow(color, px) {
  const k = px * 0.7071
  return [
    [px, 0], [-px, 0], [0, px], [0, -px],
    [k, k], [-k, -k], [k, -k], [-k, k],
  ].map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px 0 ${color}`).join(', ')
}

/** 大钟：内白描边 + 外深粉圈，做出"贴纸字"的厚度。 */
function clockInk(t) {
  const parts = [ringShadow(t.stroke, 2.6)]
  if (t.outer !== null) parts.push(ringShadow(t.outer, 4.2))
  return parts.join(', ')
}

/** 构建时算好的描边串（页面里直接用，不跑函数）。 */
const INK_CSS = {
  light: {
    clockFill: TEXT_INK.light.clock.fill,
    clockRing: clockInk(TEXT_INK.light.clock),
    dateFill: TEXT_INK.light.date.fill,
    dateRing: ringShadow(TEXT_INK.light.date.stroke, 1.8),
    titleFill: TEXT_INK.light.title.fill,
    titleRing: ringShadow(TEXT_INK.light.title.stroke, 1.8),
    artistFill: TEXT_INK.light.artist.fill,
    artistRing: ringShadow(TEXT_INK.light.artist.stroke, 1.3),
  },
  dark: {
    clockFill: TEXT_INK.dark.clock.fill,
    clockRing: clockInk(TEXT_INK.dark.clock),
    dateFill: TEXT_INK.dark.date.fill,
    dateRing: ringShadow(TEXT_INK.dark.date.stroke, 1.8),
    titleFill: TEXT_INK.dark.title.fill,
    titleRing: ringShadow(TEXT_INK.dark.title.stroke, 1.8),
    artistFill: TEXT_INK.dark.artist.fill,
    artistRing: ringShadow(TEXT_INK.dark.artist.stroke, 1.3),
  },
}

/** 装饰层变量（与浮层一致，柔档）。 */
const GRAIN = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"
const DOTS = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Ccircle cx='1.2' cy='1.2' r='1' fill='%23000' opacity='.055'/%3E%3C/svg%3E\")"

function decorVars(level, scheme) {
  const dark = scheme === 'dark'
  const accent = dark ? '#f7a8b8' : '#ef7d9a'
  const accent2 = dark ? '#8ed6ae' : '#5fb98a'
  if (level === 'plain') {
    return {
      '--decor-grain': 'none', '--decor-grain-opacity': '0', '--decor-blob-opacity': '0',
      '--decor-blob-1': 'transparent', '--decor-blob-2': 'transparent', '--decor-blob-3': 'transparent',
      '--decor-radius': '18px',
    }
  }
  const soft = {
    '--decor-grain': GRAIN,
    '--decor-grain-opacity': dark ? '0.05' : '0.06',
    '--decor-blend': dark ? 'screen' : 'multiply',
    '--decor-blob-opacity': dark ? '0.55' : '0.7',
    '--decor-blob-1': `color-mix(in srgb, ${accent} 20%, transparent)`,
    '--decor-blob-2': `color-mix(in srgb, ${accent2} 16%, transparent)`,
    '--decor-blob-3': `color-mix(in srgb, ${accent} 12%, transparent)`,
    '--decor-radius': '22px',
  }
  if (level !== 'rich') return soft
  return {
    ...soft,
    '--decor-grain': `${GRAIN}, ${DOTS}`,
    '--decor-grain-opacity': dark ? '0.08' : '0.09',
    '--decor-blob-opacity': dark ? '0.85' : '1',
    '--decor-blob-1': `color-mix(in srgb, ${accent} 30%, transparent)`,
    '--decor-blob-2': `color-mix(in srgb, ${accent2} 24%, transparent)`,
    '--decor-radius': '26px',
  }
}

/** 封面占位图：渐变底 + 圆 + 波浪，后续替换成人物插画。 */
const COVER_SVG = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="封面占位">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd0dc"/><stop offset="55%" stop-color="#ffb3c6"/><stop offset="100%" stop-color="#c9a7e8"/>
    </linearGradient>
    <radialGradient id="cr" cx="32%" cy="26%" r="70%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".7"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#cg)"/>
  <rect width="400" height="400" fill="url(#cr)"/>
  <circle cx="250" cy="150" r="96" fill="#fff" opacity=".28"/>
  <circle cx="150" cy="250" r="64" fill="#fff" opacity=".2"/>
  <g stroke="#fff" stroke-width="3" fill="none" opacity=".55">
    <path d="M20 320 C 90 260, 150 330, 220 270 S 340 250, 380 210"/>
    <path d="M20 350 C 100 290, 170 355, 250 295 S 350 275, 390 240"/>
  </g>
</svg>`

const LYRIC = {
  prev: '笑光阴 光阴也动心',
  now: '留此刻 与夏夜老去',
  next: '街巷口跑过的女儿家 才把青梅嗅罢',
}

const CSS = /* css */ `
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--font-ui);
  padding: 28px;
  -webkit-font-smoothing: antialiased;
}

/* ── 界面本体：铺满视口，不做卡片 ── */
.card {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 46% 1fr;
  gap: 0;
  background: var(--dsw-alias-bg-base);
}
/* 装饰层 */
.card::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image: var(--decor-grain, none);
  background-size: 120px 120px;
  opacity: var(--decor-grain-opacity, 0);
  mix-blend-mode: var(--decor-blend, normal);
}
.card::after {
  content: ''; position: absolute; inset: -20%; pointer-events: none; z-index: 0;
  background:
    radial-gradient(42% 38% at 16% 12%, var(--decor-blob-1, transparent) 0%, transparent 62%),
    radial-gradient(38% 34% at 88% 30%, var(--decor-blob-2, transparent) 0%, transparent 60%),
    radial-gradient(50% 44% at 70% 96%, var(--decor-blob-3, transparent) 0%, transparent 64%);
  opacity: var(--decor-blob-opacity, 0);
  animation: breathe 16s ease-in-out infinite alternate;
}
@keyframes breathe {
  0% { transform: scale(1) translate(0,0) }
  100% { transform: scale(1.08) translate(1.5%, -2%) }
}

/* ── 左：壁纸 / 封面 ── */
.left {
  position: relative; z-index: 1;
  overflow: hidden;
}
/* 视频壁纸：铺满左栏，裁切填满 */
.left video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: 50% 42%;
  display: block;
}
/* 没有视频时退回封面占位 */
.cover {
  position: relative; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #ffd0dc, #ffb3c6 55%, #c9a7e8);
}
.cover svg { display: block; width: 100%; height: 100%; }
/* 左栏右缘柔化，和右侧内容过渡 */
.left::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg,
    transparent 0%, transparent 62%,
    color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent) 88%,
    var(--dsw-alias-bg-base) 100%);
}
/* 顶部/底部轻微压暗，让视频和界面更融合 */
.left::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 32%, transparent) 0%,
    transparent 18%, transparent 82%,
    color-mix(in srgb, var(--dsw-alias-bg-base) 38%, transparent) 100%);
}

/* ── 右：内容区 ── */
.right {
  position: relative; z-index: 1;
  display: flex; flex-direction: column;
  padding: 26px 30px 22px 28px;
  min-width: 0; min-height: 0;
}

/* 尺寸变量：由 JS 按右栏实际宽度算，保证不同窗口下都"排得满"。
   参考图比例：封面边长 ≈ 38% 右栏宽；歌名 ≈ 4.8%；大钟 ≈ 85% 右栏高内。 */
.right {
  --w: 640px;
  --cover: calc(var(--w) * 0.38);
  /* 字号：定值（用户定的美观值，1440 宽窗口下）
     歌名 70 / 大钟 100 / 状态与计时 60 / 日期 50 / 歌手 40 / 当前歌词 30 */
  --fs-title: 70px;
  --fs-clock: 100px;
  --fs-state: 60px;
  --fs-date: 50px;
  --fs-artist: 40px;
  --fs-lyNow: 30px;
  --fs-lySide: 17px;
}
/* 上方区：封面 + 歌名 + 状态计时 + 大钟
   各元素尺寸用 --w（右栏宽度）当基准算，跟参考图的比例对齐：
     封面边长 ≈ 38% 右栏宽；歌名 ≈ 4.8% 右栏宽；大钟 ≈ 85% 右栏高内。 */
.stage {
  flex: 1 1 0; min-height: 0;
  display: flex; flex-direction: column; justify-content: center;
  gap: calc(var(--w) * 0.048);
  margin-bottom: calc(var(--w) * 0.02);
}

/* 第一行：封面 + 右侧信息。用 grid 给右列「剩余全部宽度」——
   用 flex 的话 .nowInfo 会被压到"最长子项宽度"，歌名拿不到足够空间，
   自动缩字号会误判成溢出。 */
.nowRow {
  display: grid;
  grid-template-columns: var(--cover) minmax(0, 1fr);
  align-items: center;
  gap: calc(var(--w) * 0.048);
}
.coverBox {
  flex: none;
  width: var(--cover); height: var(--cover);
  border-radius: calc(var(--cover) * 0.07); overflow: hidden;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 88%, transparent);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--dsw-elevation-panel);
  position: relative;
}
.coverBox img { width: 100%; height: 100%; object-fit: cover; display: block; }
.coverPh {
  font-size: calc(var(--cover) * 0.19); letter-spacing: .1em;
  color: var(--dsw-alias-button-primary-fill);
}
.nowInfo { display: flex; flex-direction: column; gap: calc(var(--w) * 0.004); min-width: 0; }
.trackTitle {
  font-size: var(--fs-title); line-height: 1.15; font-weight: 400;
  color: var(--ink-title-fill);
  text-shadow: var(--ink-title-ring);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trackArtist {
  font-size: var(--fs-artist); line-height: 1.3;
  color: var(--ink-artist-fill);
  text-shadow: var(--ink-artist-ring);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tState {
  font-size: var(--fs-state); line-height: 1.28; letter-spacing: .03em;
  color: var(--dsw-alias-state-success-primary);
}
.tMark {
  font-size: var(--fs-state); line-height: 1.28; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-state-success-primary);
}
.stage.paused .tState, .stage.paused .tMark { color: var(--dsw-alias-state-warn-primary); }
.stage.idle .tState, .stage.idle .tMark { color: var(--dsw-alias-label-tertiary); }

/* 第二行：大钟 + 日期 */
.clockRow { display: flex; align-items: baseline; gap: calc(var(--w) * 0.024); }
.tTime {
  font-size: var(--fs-clock); line-height: 1; font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--ink-clock-fill);
  text-shadow: var(--ink-clock-ring);
  letter-spacing: .01em;
}
.tDate {
  font-size: var(--fs-date); font-variant-numeric: tabular-nums;
  color: var(--ink-date-fill);
  text-shadow: var(--ink-date-ring);
  letter-spacing: .02em;
}

/* ── 进度条 + 时间 ── */
.meta { flex: none; }
.bar {
  position: relative; height: 5px; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover-solid);
}
.bar i {
  position: absolute; inset: 0 auto 0 0; width: 42%;
  border-radius: 999px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--dsw-alias-button-primary-fill) 70%, transparent),
    var(--dsw-alias-button-primary-fill));
}
.barKnob {
  position: absolute; top: 50%; left: 42%; width: 10px; height: 10px;
  border-radius: 50%; corner-shape: round; transform: translate(-50%, -50%);
  background: var(--dsw-alias-button-floating-fill);
  border: 2px solid var(--dsw-alias-button-primary-fill);
  box-shadow: var(--dsw-elevation-panel);
}
.timeRow {
  display: flex; justify-content: space-between; margin-top: 6px;
  font-family: var(--font-num); font-size: 10.5px; font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-caption);
}

/* ── 歌词 ── */
.lyrics {
  flex: none; padding-top: calc(var(--w) * 0.022);
  display: flex; flex-direction: column; gap: calc(var(--w) * 0.008); align-items: flex-start;
}
.ly {
  font-family: var(--font-lyric);
  line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%;
}
.ly-prev, .ly-next {
  font-size: var(--fs-lySide); color: var(--lyric-dim);
  text-shadow: var(--lyric-ring-thin);
}
.ly-prev { opacity: .5; }
.ly-next { opacity: .72; }
.ly-now {
  font-size: var(--fs-lyNow); color: var(--lyric-fill);
  text-shadow: var(--lyric-ring);
}

/* ── 设置按钮 + 弹出面板 ── */
.settingsBtn {
  position: fixed; top: 18px; right: 18px; z-index: 20;
  width: 34px; height: 34px; border-radius: 50%; corner-shape: round;
  display: inline-flex; align-items: center; justify-content: center;
  border: .5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-button-floating-fill);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 15px; line-height: 1;
  box-shadow: var(--dsw-elevation-panel);
  transition: transform .18s var(--ds-ease), color .18s var(--ds-ease);
}
.settingsBtn:hover { color: var(--dsw-alias-button-primary-fill); transform: rotate(24deg); }

.settingsPanel {
  position: fixed; top: 60px; right: 18px; z-index: 20;
  width: 232px; padding: 14px 16px 16px;
  border-radius: 18px;
  background: var(--dsw-alias-button-floating-fill);
  border: .5px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-prominent);
  display: flex; flex-direction: column; gap: 14px;
  transform-origin: top right;
  animation: panelIn .18s var(--ds-ease);
}
.settingsPanel[hidden] { display: none; }
@keyframes panelIn {
  from { opacity: 0; transform: scale(.94) translateY(-6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.field { display: flex; flex-direction: column; gap: 7px; }
.fieldLabel { font-size: 11px; color: var(--dsw-alias-label-caption); letter-spacing: .05em; }
.seg { display: flex; gap: 5px; }
.seg button {
  flex: 1; height: 28px; font: inherit; font-size: 12px; cursor: pointer;
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
  .card::after, .coverGlow { animation: none; }
}
`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>播放器界面预览 · 樱花麻薯</title>
<style>
@font-face { font-family: 'KN Maiyuan'; src: url('./fonts/raw/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
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
    <span class="fieldLabel">状态</span>
    <div class="seg" id="modeSeg">
      <button type="button" data-mode="study" aria-pressed="true">学习</button>
      <button type="button" data-mode="fun">娱乐</button>
      <button type="button" data-mode="out">外出</button>
      <button type="button" data-mode="sleep">睡觉</button>
    </div>
    <span class="fieldHint">切换状态会归零重新计时；点当前状态可重新开始这一段。</span>
  </div>
</div>

<div class="card">
  <div class="left">
    <!-- 视频壁纸：铃兰 雪霁·昼夜更替（从 Wallpaper Engine 壁纸中裁导出，竖版） -->
    <video id="bgVideo" autoplay loop muted playsinline preload="auto"
           poster="./characters/wallpaper/poster.jpg">
      <source src="./characters/wallpaper/suzuran_yukihare_34.mp4" type="video/mp4">
    </video>
  </div>

  <div class="right">
    <div class="stage">
      <div class="nowRow">
        <!-- 封面 -->
        <div class="coverBox" id="coverBox">
          <span class="coverPh" id="coverPh">封面</span>
          <img id="coverImg" alt="" hidden>
        </div>
        <!-- 右侧：歌名 / 歌手 / 状态 / 计时 -->
        <div class="nowInfo">
          <span class="trackTitle" id="trackTitle">等待播放…</span>
          <span class="trackArtist" id="trackArtist">在 QQ 音乐里开始播放</span>
          <div class="tState" id="tState">学习中</div>
          <div class="tMark" id="tMark">+0:00:00</div>
        </div>
      </div>

      <div class="clockRow">
        <span class="tTime" id="tTime">0:00:00</span>
        <span class="tDate" id="tDate">----/--/--</span>
      </div>
    </div>

    <div class="meta">
      <div class="bar">
        <i id="barFill"></i>
        <span class="barKnob" id="barKnob"></span>
      </div>
      <div class="timeRow">
        <span id="posText">0:00</span>
        <span id="durText">0:00</span>
      </div>
    </div>

    <div class="lyrics">
      <div class="ly ly-prev" id="lyPrev"></div>
      <div class="ly ly-now" id="lyNow">正在连接…</div>
      <div class="ly ly-next" id="lyNext"></div>
    </div>
  </div>
</div>

<script>
const THEMES = ${JSON.stringify({ light: LIGHT, dark: DARK })}
const FLOWER = ${JSON.stringify(FLOWER)}
const DECOR = ${JSON.stringify({
  plain: { light: decorVars('plain', 'light'), dark: decorVars('plain', 'dark') },
  soft: { light: decorVars('soft', 'light'), dark: decorVars('soft', 'dark') },
  rich: { light: decorVars('rich', 'light'), dark: decorVars('rich', 'dark') },
})}
const RING = ${JSON.stringify({
  light: { thick: ring(FLOWER.light.stroke, 2.2), thin: ring(FLOWER.light.stroke, 1.5) },
  dark: { thick: ring(FLOWER.dark.stroke, 2.2), thin: ring(FLOWER.dark.stroke, 1.5) },
})}
const INK_CSS = ${JSON.stringify(INK_CSS)}

let scheme = 'light'
let decor = 'soft'
let painted = []

function paint() {
  const body = document.body
  for (const n of painted) body.style.removeProperty(n)
  painted = []
  const theme = THEMES[scheme]
  document.documentElement.style.colorScheme = scheme
  body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
  for (const [k, v] of Object.entries(theme.tokens)) { body.style.setProperty(k, v); painted.push(k) }

  // 界面全部用荆南麦圆体：曲名、歌手、时间、设置面板文案…
  // 数字用 tabular-nums 保证等宽，不会随秒数跳动。
  const ui = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  const num = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  const lyric = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  body.style.setProperty('--font-ui', ui); painted.push('--font-ui')
  body.style.setProperty('--font-num', num); painted.push('--font-num')
  body.style.setProperty('--font-lyric', lyric); painted.push('--font-lyric')
  body.style.setProperty('--dsw-font-family', ui); painted.push('--dsw-font-family')

  const f = FLOWER[scheme]
  body.style.setProperty('--lyric-fill', f.fill); painted.push('--lyric-fill')
  body.style.setProperty('--lyric-dim', f.dim); painted.push('--lyric-dim')
  body.style.setProperty('--lyric-ring', RING[scheme].thick); painted.push('--lyric-ring')
  body.style.setProperty('--lyric-ring-thin', RING[scheme].thin); painted.push('--lyric-ring-thin')

  // 界面文字的花字配色：大钟 / 日期 / 歌名 / 歌手（各一个色系，描边串构建时算好）
  const ink = INK_CSS[scheme]
  body.style.setProperty('--ink-clock-fill', ink.clockFill); painted.push('--ink-clock-fill')
  body.style.setProperty('--ink-clock-ring', ink.clockRing); painted.push('--ink-clock-ring')
  body.style.setProperty('--ink-date-fill', ink.dateFill); painted.push('--ink-date-fill')
  body.style.setProperty('--ink-date-ring', ink.dateRing); painted.push('--ink-date-ring')
  body.style.setProperty('--ink-title-fill', ink.titleFill); painted.push('--ink-title-fill')
  body.style.setProperty('--ink-title-ring', ink.titleRing); painted.push('--ink-title-ring')
  body.style.setProperty('--ink-artist-fill', ink.artistFill); painted.push('--ink-artist-fill')
  body.style.setProperty('--ink-artist-ring', ink.artistRing); painted.push('--ink-artist-ring')

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

// 左侧画面：只用竖版（构图留白更舒服，也能看到神社台阶和鸟居）

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

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') togglePanel(false)
  if (e.key === 'd') { scheme = scheme === 'light' ? 'dark' : 'light'; paint() }
  if (e.key === '1') { decor = 'plain'; paint() }
  if (e.key === '2') { decor = 'soft'; paint() }
  if (e.key === '3') { decor = 'rich'; paint() }
  if (e.key === ' ') { e.preventDefault(); timer.toggle() }   // 空格开始/暂停
})
paint()

/* ══════════ 正计时器 ══════════ */

const { createTimer, formatDuration, formatDate, formatClockMark } = (() => {
${timerModuleSource().split('\n').map(l => '  ' + l).join('\n')}
})()

const elTime = document.getElementById('tTime')
const elMark = document.getElementById('tMark')
const elDate = document.getElementById('tDate')
const elState = document.getElementById('tState')
const elStage = document.querySelector('.stage')

/** 四种状态：显示名与配色。 */
const MODES = {
  study: { label: '学习中', token: '--dsw-alias-button-primary-fill' },
  fun: { label: '娱乐中', token: '--dsw-alias-state-success-primary' },
  out: { label: '外出中', token: '--dsw-alias-state-warn-primary' },
  sleep: { label: '睡觉中', token: '--dsw-alias-state-error-primary' },
}

const timer = createTimer({ mode: 'study', onChange: renderTimer })

/** 渲染一次。 */
function renderTimer(s) {
  // 大钟：系统时间（h:mm:ss）
  elTime.textContent = formatDuration(nowSeconds())
  // 已计时长，带 + 号
  elMark.textContent = '+' + formatDuration(s.seconds)
  elDate.textContent = formatDate(Date.now())

  const m = MODES[s.mode] ?? MODES.study
  // 四种状态任何时候都占一种，所以只有"X中"和"X已暂停"两种说法
  elState.textContent = s.status === 'paused' ? m.label.replace('中', '已暂停') : m.label

  const color = s.status === 'paused'
    ? 'var(--dsw-alias-state-warn-primary)'
    : 'var(' + m.token + ')'
  elState.style.color = color
  elMark.style.color = color

  elStage.classList.toggle('paused', s.status === 'paused')

  for (const b of document.querySelectorAll('#modeSeg [data-mode]')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode))
  }
}

/** 当前时刻换算成"当天零点起的秒数"，交给 formatDuration 渲染成 h:mm:ss。 */
function nowSeconds() {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

// 切换状态：归零重计。点当前状态 = 重新开始这一段。
for (const b of document.querySelectorAll('#modeSeg [data-mode]')) {
  b.addEventListener('click', () => {
    if (b.dataset.mode === timer.mode && timer.status === 'running') {
      timer.reset()          // 同一状态再点一次 = 重新计时
    } else {
      timer.setMode(b.dataset.mode)
    }
    timer.toggle()           // 立刻进入计时，不需要手动点开始
    renderTimer(timer.snapshot())
  })
}

renderTimer(timer.snapshot())

/* 打开就在计时：默认学习状态，页面加载即开始 */
if (timer.status === 'idle') timer.toggle()

/* ══════════ 实时数据（连歌词服务） ══════════ */

const { createLive, fmtTime } = (() => {
${liveModuleSource().split('\n').map(l => '  ' + l).join('\n')}
})()

const elCoverImg = document.getElementById('coverImg')
const elCoverPh = document.getElementById('coverPh')
const elTrackTitle = document.getElementById('trackTitle')
const elTrackArtist = document.getElementById('trackArtist')
const elLyPrev = document.getElementById('lyPrev')
const elLyNow = document.getElementById('lyNow')
const elLyNext = document.getElementById('lyNext')
const elBarFill = document.getElementById('barFill')
const elBarKnob = document.getElementById('barKnob')
const elPosText = document.getElementById('posText')
const elDurText = document.getElementById('durText')
/** 右栏容器：字号变量和可用宽度都从它身上取。 */
const rightColEl = document.querySelector('.right')

/**
 * 自动缩字号：内容超宽时逐步降字号，直到放得下（或到下限）。
 *
 * 为什么不用 CSS：没有"按内容实测宽度自适应字号"的原生属性
 * （text-wrap / container queries 都做不到）。
 *
 * 用二分而不是逐像素降：字号区间 70→38 逐像素要试 30 多次，
 * 二分只要 6 次；每次都要读 scrollWidth（强制重排），差别很明显。
 *
 * @param {HTMLElement} el 目标元素（需 nowrap + overflow hidden）
 * @param {number} maxPx 原字号
 * @param {number} minPx 最小字号（再小就交给省略号）
 * @returns {boolean} 是否缩过
 */
function shrinkToFit(el, maxPx, minPx) {
  if (el === null) return false
  // 量父容器可用宽度，而不是元素自身——自身宽度会被内容撑开，量不出溢出
  const avail = el.parentElement?.clientWidth ?? 0
  if (avail <= 0) return false

  const fits = (px) => {
    el.style.fontSize = px + 'px'
    return el.scrollWidth <= avail
  }

  if (fits(maxPx)) return false
  if (!fits(minPx)) { el.style.fontSize = minPx + 'px'; return true }

  // 二分找最大可行字号，取整到 0.5px
  let lo = minPx
  let hi = maxPx
  for (let i = 0; i < 6 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  el.style.fontSize = Math.floor(lo * 2) / 2 + 'px'
  return true
}

/** 读右栏上某个字号变量。 */
function fsVar(name, fallback) {
  const v = parseFloat(getComputedStyle(rightColEl).getPropertyValue(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** 歌名 / 歌手 / 歌词三行自适应。 */
function fitTexts() {
  const titleBase = fsVar('--fs-title', 70)
  const artistBase = fsVar('--fs-artist', 40)
  const lyNowBase = fsVar('--fs-lyNow', 30)
  const lySideBase = fsVar('--fs-lySide', 17)

  // 歌名可以缩得多一点（宁可小也要显示全，比截断好看）
  shrinkToFit(elTrackTitle, titleBase, titleBase * 0.5)
  shrinkToFit(elTrackArtist, artistBase, artistBase * 0.55)
  // 歌词当前行尽量少缩，副行可以多缩
  shrinkToFit(elLyNow, lyNowBase, lyNowBase * 0.62)
  shrinkToFit(elLyPrev, lySideBase, lySideBase * 0.6)
  shrinkToFit(elLyNext, lySideBase, lySideBase * 0.6)
}

/** 上次显示的歌词行，用来判断要不要重播入场动画。 */
let shownLyric = ''
/** 上次设的封面地址，避免每帧重设 img.src。 */
let shownCover = ''

function renderLive(v) {
  if (!v.ready) return

  // 歌名 / 歌手
  if (v.track === null) {
    elTrackTitle.textContent = '等待播放…'
    elTrackArtist.textContent = '在 QQ 音乐里开始播放'
  } else {
    elTrackTitle.textContent = v.track.title || '未知曲目'
    elTrackArtist.textContent = v.track.artist || ''
  }

  // 封面（QQ 音乐专辑图；拿不到就显示占位字）
  const cover = v.coverUrl ?? ''
  if (cover !== shownCover) {
    shownCover = cover
    if (cover === '') {
      elCoverImg.hidden = true
      elCoverPh.hidden = false
    } else {
      elCoverImg.src = cover
      elCoverImg.hidden = false
      elCoverPh.hidden = true
    }
  }

  // 歌词三行
  if (v.now !== shownLyric) {
    const first = shownLyric === ''
    shownLyric = v.now
    elLyNow.textContent = v.now
    if (!first && v.placeholder === null) {
      elLyNow.classList.remove('enter')
      void elLyNow.offsetWidth
      elLyNow.classList.add('enter')
    }
  }
  elLyPrev.textContent = v.prev
  elLyNext.textContent = v.next

  // 进度
  const pct = v.duration > 0 ? Math.min(100, v.position / v.duration * 100) : 0
  elBarFill.style.width = pct + '%'
  elBarKnob.style.left = pct + '%'
  elPosText.textContent = fmtTime(v.position)
  elDurText.textContent = fmtTime(v.duration)

  // 文字排完之后再缩字号（此刻内容已定，量的宽度才准）
  fitTexts()
}

// 服务端地址：同源优先；用 file:// 打开时退回本机默认端口
const API_BASE = location.protocol === 'file:' ? 'http://127.0.0.1:7788' : ''
const live = createLive({ base: API_BASE, onChange: renderLive })
live.start()

// 每帧补间推进（进度条平滑、歌词到点就换）
function liveLoop() {
  live.tick()
  requestAnimationFrame(liveLoop)
}
requestAnimationFrame(liveLoop)

/* 尺寸自适应：把右栏实际宽度写进 --w，CSS 里所有字号/封面尺寸都由它推导。
   这样窗口大小一变，整块版面等比缩放，始终"排得满"。
   窗口变化后要重跑 fitTexts——字号变了，能放下多少字也跟着变。 */
function fitScale() {
  const w = rightColEl.clientWidth
  if (w > 0) rightColEl.style.setProperty('--w', w + 'px')
  fitTexts()
}
fitScale()
new ResizeObserver(fitScale).observe(rightColEl)

// 每秒刷新：系统时间要一直走（不管计时器有没有开）
setInterval(() => {
  if (timer.status === 'running') timer.tick()
  else renderTimer(timer.snapshot())
}, 1000)
</script>
</body>
</html>
`

const out = join(HERE, 'player-ui.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB)`)
