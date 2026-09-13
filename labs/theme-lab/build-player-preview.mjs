/*
 * 樱花麻薯 · 音乐播放器视觉原型
 * ------------------------------
 * 复用 DSH 主题的调色板与字体，做一张可切换主题的播放器样张。
 * 不接任何播放逻辑：进度、频谱、歌词滚动都用假数据驱动，
 * 目的是先定"看起来对不对"，再决定投哪条实现路线。
 *
 * 用法：node theme-lab/build-player-preview.mjs
 * 产物：theme-lab/player-preview.html（相对路径加载 fonts/ 与 palettes.mjs 的数据）
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from './palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'player-preview.html')

/** 只取樱花麻薯两套（用户选定的方向）。 */
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

/* ══════════════════════ 播放器样式 ══════════════════════ */

const CSS = /* css */ `
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--dsh-font-ui);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ── 装饰层：与 DSH 主题同一套做法 ── */
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: var(--dsh-decor-grain, none), var(--dsh-decor-dots, none);
  background-size: 120px 120px, 12px 12px;
  opacity: var(--dsh-decor-grain-opacity, 0);
  mix-blend-mode: var(--dsh-decor-blend, normal);
}
body::after {
  content: ''; position: fixed; inset: -10%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(38% 32% at 12% 8%,  var(--dsh-decor-blob-1, transparent) 0%, transparent 62%),
    radial-gradient(34% 30% at 92% 22%, var(--dsh-decor-blob-2, transparent) 0%, transparent 60%),
    radial-gradient(46% 40% at 74% 96%, var(--dsh-decor-blob-3, transparent) 0%, transparent 64%),
    radial-gradient(30% 26% at 34% 78%, var(--dsh-decor-blob-4, transparent) 0%, transparent 60%);
  opacity: var(--dsh-decor-blob-opacity, 0);
  animation: breathe 14s ease-in-out infinite alternate;
}
@keyframes breathe {
  0%   { transform: scale(1)    translate(0, 0); }
  100% { transform: scale(1.06) translate(1.2%, -1.4%); }
}

/* ── 布局 ── */
.app { position: relative; z-index: 1; display: grid; grid-template-columns: 232px 1fr; height: 100vh; }
.sidebar {
  display: flex; flex-direction: column; gap: 6px; padding: 18px 12px;
  background: var(--dsw-specific-sidebar-fill);
  background-image: linear-gradient(180deg,
    var(--dsh-decor-sidebar-top, transparent) 0%, transparent 42%,
    var(--dsh-decor-sidebar-bottom, transparent) 100%);
  border-right: .5px solid var(--dsw-alias-border-l3);
}
.brand { display: flex; align-items: center; gap: 9px; padding: 4px 6px 16px; }
.brandMark {
  width: 30px; height: 30px; border-radius: 11px; corner-shape: round;
  display: inline-flex; align-items: center; justify-content: center; font-size: 16px;
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 18%, transparent);
  animation: halo 4.5s ease-in-out infinite alternate;
}
@keyframes halo {
  0%   { box-shadow: 0 0 0 var(--dsh-decor-mark-halo, 0px) color-mix(in srgb, var(--dsw-alias-button-primary-fill) 12%, transparent); }
  100% { box-shadow: 0 0 0 calc(var(--dsh-decor-mark-halo, 0px) * 1.9) color-mix(in srgb, var(--dsw-alias-button-primary-fill) 5%, transparent); }
}
.brandName { font-size: 15px; font-weight: 500; letter-spacing: .01em; }
.navLabel { padding: 12px 8px 4px; font-size: 11px; color: var(--dsw-alias-label-caption); letter-spacing: .06em; }
.navItem {
  display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px;
  border-radius: 10px; font-size: 13px; color: var(--dsw-alias-label-secondary); cursor: default;
}
.navItem:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
.navItem.on {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 2px 0 0 0 var(--dsw-specific-sidebar-nav-item-active-accent);
}
.navItem .ico { width: 16px; text-align: center; opacity: .85; }
.sidebarFoot { margin-top: auto; display: flex; align-items: center; gap: 6px; padding-top: 10px; }

/* ── 主区 ── */
.main { display: flex; flex-direction: column; min-width: 0; }
.topbar {
  display: flex; align-items: center; gap: 8px; height: 54px; flex: none;
  padding: 0 24px; border-bottom: .5px solid var(--dsw-alias-border-l2); position: relative;
}
.topbar::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1.5px;
  background: var(--dsh-decor-rule, transparent); opacity: var(--dsh-decor-rule-opacity, 0);
  pointer-events: none;
}
.pageTitle { font-size: 14px; font-weight: 500; }
.spacer { flex: 1; }

/* ── 现在播放：封面 + 歌词 + 信息 ── */
.stage { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 400px) 1fr; gap: 24px 34px; padding: 22px 32px 10px; }
.nowCol { grid-column: 1; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.infoCol { grid-column: 2; display: flex; flex-direction: column; min-height: 0; }

.artWrap { position: relative; flex: none; }
/* 封面外圈柔光，切歌时轻微呼吸 */
.artGlow {
  position: absolute; inset: -14px; border-radius: 34px; z-index: -1;
  background: radial-gradient(circle at 50% 45%,
    color-mix(in srgb, var(--dsw-alias-button-primary-fill) 26%, transparent) 0%, transparent 68%);
  filter: blur(10px);
  animation: glow 6s ease-in-out infinite alternate;
}
@keyframes glow { from { opacity: .55 } to { opacity: .95 } }
/* 黑胶从封面右侧露出来一点 */
.disc {
  position: absolute; top: 50%; right: -34px; width: 74%; aspect-ratio: 1; z-index: -1;
  transform: translateY(-50%); border-radius: 50%; corner-shape: round;
  background:
    repeating-radial-gradient(circle at 50% 50%,
      color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent) 0 1px,
      transparent 1px 5px),
    radial-gradient(circle at 50% 50%, var(--dsw-specific-bubble) 24%, transparent 24.5%),
    color-mix(in srgb, var(--dsw-alias-bg-base) 80%, var(--dsw-alias-label-primary));
  box-shadow: var(--dsw-elevation-panel);
  animation: spin 26s linear infinite;
}
@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }
.art {
  position: relative; aspect-ratio: 1; border-radius: var(--dsh-decor-radius-card, 22px);
  overflow: hidden; box-shadow: var(--dsw-elevation-prominent);
  background: var(--dsw-specific-bubble);
  animation: artIn .5s var(--ds-ease-in-out, ease);
}
@keyframes artIn { from { transform: scale(.96); opacity: .6 } to { transform: scale(1); opacity: 1 } }
.art svg { display: block; width: 100%; height: 100%; }

.trackInfo { padding-top: 0; min-width: 0; }
.trackTitle { font-size: 25px; line-height: 34px; font-weight: 500; margin: 0 0 2px; }
.trackArtist { font-size: 13.5px; line-height: 21px; color: var(--dsw-alias-label-secondary); margin: 0 0 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px;
  border-radius: 999px; font-size: 11px; line-height: 22px;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
  border: .5px solid var(--dsw-alias-border-l2);
}
.chip.accent {
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 16%, transparent);
  color: var(--dsw-alias-button-primary-fill);
  border-color: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 32%, transparent);
}

/* ── 频谱 ── */
.spectrum { position: relative; height: 96px; margin-bottom: 14px; }
.spectrum canvas { display: block; width: 100%; height: 100%; }
.spectrumLabel {
  position: absolute; right: 2px; top: -2px; font-size: 10px; letter-spacing: .08em;
  color: var(--dsw-alias-label-caption); font-family: var(--dsh-font-num);
}

/* ── 进度条 ── */
.progress { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.time {
  font-family: var(--dsh-font-num); font-size: 12px; color: var(--dsw-alias-label-tertiary);
  min-width: 42px; font-variant-numeric: tabular-nums;
}
.time.right { text-align: right; }
.track {
  position: relative; flex: 1; height: 8px; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover-solid); cursor: pointer;
}
.fill {
  position: absolute; inset: 0 auto 0 0; border-radius: 999px; width: 38%;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--dsw-alias-button-primary-fill) 70%, transparent),
    var(--dsw-alias-button-primary-fill));
}
.knob {
  position: absolute; top: 50%; left: 38%; width: 14px; height: 14px; border-radius: 50%;
  corner-shape: round; transform: translate(-50%, -50%);
  background: var(--dsw-alias-button-floating-fill);
  border: 2px solid var(--dsw-alias-button-primary-fill);
  box-shadow: var(--dsw-elevation-panel);
}
.bubble {
  position: absolute; bottom: 18px; left: 38%; transform: translateX(-50%);
  padding: 2px 8px; border-radius: 999px; font-size: 11px;
  font-family: var(--dsh-font-num); font-variant-numeric: tabular-nums;
  background: var(--dsw-alias-tooltip-bg); color: var(--dsw-alias-label-primary-inverted);
  white-space: nowrap;
}

/* ── 传输控件 ── */
.transport { display: flex; align-items: center; gap: 14px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font: inherit; padding: 0;
  transition: transform .16s var(--ds-ease-in-out, ease), background .16s var(--ds-ease-in-out, ease);
}
.btn:hover { background: var(--dsw-alias-interactive-bg-hover); border-radius: 999px; }
.btn.round { width: 38px; height: 38px; border-radius: 50%; corner-shape: round; font-size: 15px; }
.btn.play {
  width: 52px; height: 52px; border-radius: 50%; corner-shape: round; font-size: 19px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  box-shadow: var(--dsw-elevation-panel);
}
.btn.play:hover { transform: translateY(-1.5px); box-shadow: var(--dsw-elevation-prominent); }
.btn.ghost.on { color: var(--dsw-alias-button-primary-fill); }
.volume { display: flex; align-items: center; gap: 8px; margin-left: 6px; }
.volume .bar { width: 84px; height: 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); position: relative; }
.volume .bar i { position: absolute; inset: 0 auto 0 0; width: 62%; border-radius: 999px; background: var(--dsw-alias-button-primary-fill); }

/* ── 歌词面板 ── */
.lyrics {
  flex: 1; min-height: 96px; margin: 0;
  border-radius: var(--dsh-decor-radius-card, 22px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 72%, transparent);
  border: .5px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsh-decor-shadow-soft, none);
  overflow: hidden; position: relative;
}
.lyricsInner { padding: 22px 26px; display: flex; flex-direction: column; gap: 12px; transition: transform .5s var(--ds-ease-in-out, ease); }
.lyricLine { font-size: 15px; line-height: 24px; color: var(--dsw-alias-label-caption); transition: all .3s var(--ds-ease-in-out, ease); }
.lyricLine.on { font-size: 19px; line-height: 28px; color: var(--dsw-alias-label-primary); font-weight: 500; }
.lyricLine.on::before {
  content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; corner-shape: round;
  background: var(--dsw-alias-button-primary-fill); margin-right: 10px; vertical-align: middle;
}
.lyricsFadeTop, .lyricsFadeBottom { position: absolute; left: 0; right: 0; height: 34px; pointer-events: none; }
.lyricsFadeTop { top: 0; background: linear-gradient(180deg, var(--dsw-alias-bg-base), transparent); }
.lyricsFadeBottom { bottom: 0; background: linear-gradient(0deg, var(--dsw-alias-bg-base), transparent); }

/* ── 队列 ── */
.queue { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 18px; }
.queueHead { display: flex; align-items: center; gap: 8px; padding: 0 2px 10px; }
.queueTitle { font-size: 13px; font-weight: 500; }
.queueList { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding-right: 4px; }
.queueRow {
  display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px;
  height: 44px; padding: 0 10px; border-radius: 12px; cursor: default;
}
.queueRow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.queueRow.on { background: var(--dsw-specific-sidebar-nav-item-active); }
.queueRow.on .qTitle { color: var(--dsw-alias-button-primary-fill); font-weight: 500; }
.qIndex { font-family: var(--dsh-font-num); font-size: 12px; color: var(--dsw-alias-label-caption); text-align: center; }
.qTitle { font-size: 13px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qArtist { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qTime { font-family: var(--dsh-font-num); font-size: 11px; color: var(--dsw-alias-label-caption); font-variant-numeric: tabular-nums; }
.qPlaying { display: inline-flex; gap: 2px; align-items: flex-end; height: 12px; }
.qPlaying i { width: 2px; border-radius: 2px; background: var(--dsw-alias-button-primary-fill); animation: eq 1s ease-in-out infinite; }
.qPlaying i:nth-child(1) { height: 6px; animation-delay: 0s; }
.qPlaying i:nth-child(2) { height: 11px; animation-delay: .2s; }
.qPlaying i:nth-child(3) { height: 8px; animation-delay: .4s; }
@keyframes eq { 50% { transform: scaleY(.4) } }

/* ── 底部迷你播放条 ── */
.mini {
  flex: none; display: grid; grid-template-columns: 232px 1fr 232px; align-items: center;
  height: 66px; padding: 0 18px; border-top: .5px solid var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 76%, transparent);
  backdrop-filter: blur(10px);
}
.miniTrack { display: flex; align-items: center; gap: 10px; min-width: 0; }
.miniArt { width: 38px; height: 38px; border-radius: 12px; overflow: hidden; flex: none; box-shadow: var(--dsw-elevation-panel); }
.miniArt svg { display: block; width: 100%; height: 100%; }
.miniTitle { font-size: 12.5px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.miniArtist { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.miniCenter { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.miniControls { display: flex; align-items: center; gap: 12px; }
.miniProgress { width: min(420px, 60%); height: 4px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover-solid); position: relative; }
.miniProgress i { position: absolute; inset: 0 auto 0 0; width: 38%; border-radius: 999px; background: var(--dsw-alias-button-primary-fill); }
.miniRight { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

/* ── 右上角控制条 ── */
.switch {
  position: fixed; top: 14px; right: 14px; z-index: 99;
  display: flex; align-items: center; gap: 6px; padding: 6px;
  border-radius: 999px; background: var(--dsw-alias-button-floating-fill);
  box-shadow: var(--dsw-elevation-prominent); border: .5px solid var(--dsw-alias-border-l2);
  font-family: 'Nunito', 'Microsoft YaHei', sans-serif;
}
.switch button {
  font: inherit; font-size: 12px; cursor: pointer; height: 28px; padding: 0 12px;
  border-radius: 999px; border: 0; color: var(--dsw-alias-label-secondary); background: transparent;
}
.switch button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.switch button[aria-pressed="true"] { background: var(--dsw-alias-button-primary-fill); color: #fff; }
.switch .sep { border-left: .5px solid var(--dsw-alias-border-l2); padding-left: 10px; margin-left: 2px; }

@media (prefers-reduced-motion: reduce) {
  body::after, .disc, .brandMark, .qPlaying i { animation: none; }
  .btn, .lyricLine, .lyricsInner { transition: none; }
}
`

/* ══════════════════════ 装饰层变量（与 DSH 主题一致） ══════════════════════ */

const GRAIN = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"
const DOTS = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Ccircle cx='1.2' cy='1.2' r='1' fill='%23000' opacity='.055'/%3E%3C/svg%3E\")"

function decorVars(level, scheme) {
  const dark = scheme === 'dark'
  const accent = dark ? '#f7a8b8' : '#ef7d9a'
  const accent2 = dark ? '#8ed6ae' : '#5fb98a'

  if (level === 'plain') {
    return {
      '--dsh-decor-grain': 'none', '--dsh-decor-dots': 'none',
      '--dsh-decor-grain-opacity': '0', '--dsh-decor-blob-opacity': '0',
      '--dsh-decor-blob-1': 'transparent', '--dsh-decor-blob-2': 'transparent',
      '--dsh-decor-blob-3': 'transparent', '--dsh-decor-blob-4': 'transparent',
      '--dsh-decor-radius-card': '14px', '--dsh-decor-shadow': 'var(--dsw-elevation-panel)',
      '--dsh-decor-shadow-soft': 'none',
      '--dsh-decor-sidebar-top': 'transparent', '--dsh-decor-sidebar-bottom': 'transparent',
      '--dsh-decor-rule': 'transparent', '--dsh-decor-rule-opacity': '0',
      '--dsh-decor-mark-halo': '0px',
    }
  }
  const soft = {
    '--dsh-decor-grain': GRAIN, '--dsh-decor-dots': 'none',
    '--dsh-decor-grain-opacity': dark ? '0.045' : '0.055',
    '--dsh-decor-blend': dark ? 'screen' : 'multiply',
    '--dsh-decor-blob-opacity': dark ? '0.5' : '0.62',
    '--dsh-decor-blob-1': `color-mix(in srgb, ${accent} 16%, transparent)`,
    '--dsh-decor-blob-2': `color-mix(in srgb, ${accent2} 13%, transparent)`,
    '--dsh-decor-blob-3': `color-mix(in srgb, ${accent} 10%, transparent)`,
    '--dsh-decor-blob-4': `color-mix(in srgb, ${accent2} 8%, transparent)`,
    '--dsh-decor-radius-card': '22px',
    '--dsh-decor-shadow': 'var(--dsw-elevation-panel)',
    '--dsh-decor-shadow-soft': 'var(--dsw-elevation-soft)',
    '--dsh-decor-sidebar-top': `color-mix(in srgb, ${accent} 7%, transparent)`,
    '--dsh-decor-sidebar-bottom': `color-mix(in srgb, ${accent} 13%, transparent)`,
    '--dsh-decor-rule': `linear-gradient(90deg, transparent, ${accent}55, ${accent2}44, transparent)`,
    '--dsh-decor-rule-opacity': '1',
    '--dsh-decor-mark-halo': '6px',
  }
  if (level !== 'rich') return soft
  return {
    ...soft,
    '--dsh-decor-grain': `${GRAIN}, ${DOTS}`, '--dsh-decor-dots': DOTS,
    '--dsh-decor-grain-opacity': dark ? '0.07' : '0.085',
    '--dsh-decor-blob-opacity': dark ? '0.78' : '0.95',
    '--dsh-decor-blob-1': `color-mix(in srgb, ${accent} 24%, transparent)`,
    '--dsh-decor-blob-2': `color-mix(in srgb, ${accent2} 20%, transparent)`,
    '--dsh-decor-blob-3': `color-mix(in srgb, ${accent} 16%, transparent)`,
    '--dsh-decor-blob-4': `color-mix(in srgb, ${accent2} 13%, transparent)`,
    '--dsh-decor-radius-card': '26px',
    '--dsh-decor-shadow': 'var(--dsw-elevation-prominent)',
    '--dsh-decor-sidebar-top': `color-mix(in srgb, ${accent} 11%, transparent)`,
    '--dsh-decor-sidebar-bottom': `color-mix(in srgb, ${accent} 20%, transparent)`,
    '--dsh-decor-mark-halo': '10px',
  }
}

/* ══════════════════════ 封面（用 SVG 生成，不依赖外部图片） ══════════════════════ */

/** 一张"樱花封面"：渐变底 + 花瓣 + 一圈柔光。 */
function coverSvg(id, a, b, c) {
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="专辑封面">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="r${id}" cx="30%" cy="26%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="300" height="300" fill="url(#g${id})"/>
  <rect width="300" height="300" fill="url(#r${id})"/>
  <g fill="${c}" opacity=".85">
    <circle cx="196" cy="92" r="34"/>
    <circle cx="96" cy="196" r="22"/>
    <circle cx="238" cy="212" r="13"/>
    <circle cx="150" cy="150" r="9"/>
  </g>
  <g stroke="${c}" stroke-width="2" fill="none" opacity=".5">
    <path d="M40 250 C 90 210, 140 250, 190 210 S 270 200, 290 170"/>
    <path d="M40 268 C 96 232, 150 268, 204 228 S 274 218, 292 196"/>
  </g>
</svg>`
}

const QUEUE = [
  { t: '春風十里', a: '鹿先森乐队', d: '4:12', on: true },
  { t: '夜航星', a: '不才', d: '3:48' },
  { t: '起风了', a: '买辣椒也用券', d: '5:11' },
  { t: '云烟成雨', a: '房东的猫', d: '4:02' },
  { t: '房间', a: '刘瑞琦', d: '3:36' },
  { t: '像我这样的人', a: '毛不易', d: '4:26' },
  { t: '声声慢', a: '崔开潮', d: '3:55' },
  { t: '晚安', a: '丢火车', d: '4:40' },
]

const LYRICS = [
  '我在二环路的里边想着你',
  '你在远方的山上春风十里',
  '今天的风吹向你下了雨',
  '我说所有的酒都不如你',
  '把所有的春天都揉进了一个清晨',
  '把所有停不下的言语变成秘密关上了门',
]

/* ══════════════════════ 组装 ══════════════════════ */

const queueHtml = QUEUE.map((q, i) => `
  <div class="queueRow${q.on ? ' on' : ''}">
    <div class="qIndex">${q.on
      ? '<span class="qPlaying"><i></i><i></i><i></i></span>'
      : String(i + 1).padStart(2, '0')}</div>
    <div style="min-width:0">
      <div class="qTitle">${q.t}</div>
      <div class="qArtist">${q.a}</div>
    </div>
    <div class="qTime">${q.d}</div>
  </div>`).join('')

const lyricsHtml = LYRICS.map((l, i) => `<div class="lyricLine${i === 1 ? ' on' : ''}">${l}</div>`).join('')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>樱花麻薯 · 音乐播放器原型</title>
<style>
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Medium.ttf') format('truetype'); font-weight: 500 700; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
</style>
<style>
/* 宿主基座：用 DSH 的静态色阶占位，保证 var() 链都能解析 */
:root {
  --dsw-elevation-stroke-color: rgba(0,0,0,.06);
  --dsw-elevation-panel: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.03), 0 0 16px 0 rgba(0,0,0,.02);
  --dsw-elevation-prominent: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05);
  --dsw-elevation-soft: 0 0 0 .5px var(--dsw-elevation-stroke-color), 0 4px 16px 0 rgba(0,0,0,.03), 0 0 24px 0 rgba(0,0,0,.03);
  --ds-ease-in-out: cubic-bezier(.4,0,.2,1);
}
</style>
<style>${CSS}</style>
</head>
<body>

<div class="switch">
  <button type="button" data-decor="plain">素</button>
  <button type="button" data-decor="soft">柔</button>
  <button type="button" data-decor="rich">满</button>
  <span class="sep"><button type="button" id="schemeBtn">暗色</button></span>
</div>

<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <span class="brandMark">🌸</span>
      <span class="brandName">麻薯音乐</span>
    </div>

    <div class="navLabel">我的音乐</div>
    <div class="navItem on"><span class="ico">♫</span>正在播放</div>
    <div class="navItem"><span class="ico">♥</span>我喜欢的</div>
    <div class="navItem"><span class="ico">◷</span>最近播放</div>
    <div class="navItem"><span class="ico">☁</span>本地曲库</div>

    <div class="navLabel">歌单</div>
    <div class="navItem"><span class="ico">✿</span>春日限定</div>
    <div class="navItem"><span class="ico">✿</span>深夜书房</div>
    <div class="navItem"><span class="ico">✿</span>开车循环</div>

    <div class="sidebarFoot">
      <span class="chip">本地</span>
      <span class="chip">128 首</span>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <span class="pageTitle">正在播放</span>
      <span class="spacer"></span>
      <span class="chip accent">FLAC 44.1kHz</span>
      <span class="chip">春日限定</span>
    </header>

    <div class="stage">
      <div class="nowCol">
        <div class="artWrap">
          <div class="artGlow"></div>
          <div class="disc"></div>
          <div class="art">${coverSvg('main', '#f7a8b8', '#8ed6ae', '#ffffff')}</div>
        </div>

        <div class="lyrics">
          <div class="lyricsFadeTop"></div>
          <div class="lyricsFadeBottom"></div>
          <div class="lyricsInner" id="lyricsInner">${lyricsHtml}</div>
        </div>
      </div>

      <div class="infoCol">
        <div class="trackInfo">
          <h1 class="trackTitle">春風十里</h1>
          <p class="trackArtist">鹿先森乐队 · 所有的酒都不如你</p>

          <div class="chips">
            <span class="chip accent">♡ 已收藏</span>
            <span class="chip">无损</span>
            <span class="chip">3 次播放</span>
          </div>

          <div class="spectrum">
            <span class="spectrumLabel">SPECTRUM</span>
            <canvas id="spectrum" width="900" height="192"></canvas>
          </div>

          <div class="progress">
            <span class="time">1:36</span>
            <div class="track">
              <div class="fill"></div>
              <div class="knob"></div>
              <div class="bubble">1:36</div>
            </div>
            <span class="time right">4:12</span>
          </div>

          <div class="transport">
            <button class="btn ghost round on" title="随机">⤨</button>
            <button class="btn round" title="上一首">◀◀</button>
            <button class="btn play" title="播放/暂停">▶</button>
            <button class="btn round" title="下一首">▶▶</button>
            <button class="btn ghost round" title="循环">↻</button>
            <span class="volume">
              <span style="font-size:13px;color:var(--dsw-alias-label-tertiary)">🔊</span>
              <span class="bar"><i></i></span>
            </span>
          </div>
        </div>

        <div class="queue">
          <div class="queueHead">
            <span class="queueTitle">播放队列</span>
            <span class="chip">8 首 · 32 分钟</span>
            <span class="spacer"></span>
            <span class="chip">清空</span>
          </div>
          <div class="queueList">${queueHtml}</div>
        </div>
      </div>
    </div>

    <footer class="mini">
      <div class="miniTrack">
        <div class="miniArt">${coverSvg('mini', '#f7a8b8', '#8ed6ae', '#ffffff')}</div>
        <div style="min-width:0">
          <div class="miniTitle">春風十里</div>
          <div class="miniArtist">鹿先森乐队</div>
        </div>
      </div>
      <div class="miniCenter">
        <div class="miniControls">
          <button class="btn" title="随机">⤨</button>
          <button class="btn" title="上一首">◀◀</button>
          <button class="btn round" style="background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);width:32px;height:32px" title="播放/暂停">▶</button>
          <button class="btn" title="下一首">▶▶</button>
          <button class="btn" title="循环">↻</button>
        </div>
        <div class="miniProgress"><i></i></div>
      </div>
      <div class="miniRight">
        <span class="chip">1:36 / 4:12</span>
      </div>
    </footer>
  </main>
</div>

<script>
const THEMES = ${JSON.stringify({ light: LIGHT, dark: DARK })}
const DECOR = ${JSON.stringify({
  plain: { light: decorVars('plain', 'light'), dark: decorVars('plain', 'dark') },
  soft: { light: decorVars('soft', 'light'), dark: decorVars('soft', 'dark') },
  rich: { light: decorVars('rich', 'light'), dark: decorVars('rich', 'dark') },
})}

let scheme = 'light'
let decor = 'soft'
let painted = []

// 支持 #scheme=dark&decor=rich，便于分享/截图固定状态
{
  const p = new URLSearchParams(location.hash.slice(1))
  const s = p.get('scheme'); if (s === 'light' || s === 'dark') scheme = s
  const d = p.get('decor'); if (d && DECOR[d]) decor = d
}

function paint() {
  const body = document.body
  for (const n of painted) body.style.removeProperty(n)
  painted = []

  const theme = THEMES[scheme]
  document.documentElement.style.colorScheme = scheme
  body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
  for (const [k, v] of Object.entries(theme.tokens)) { body.style.setProperty(k, v); painted.push(k) }

  // 字体三条栈
  const ui = "'Nunito', 'LXGW WenKai GB Lite', 'Microsoft YaHei', sans-serif"
  const num = "'Nunito', 'Maple Mono', ui-monospace, monospace"
  body.style.setProperty('--dsh-font-ui', ui); painted.push('--dsh-font-ui')
  body.style.setProperty('--dsh-font-num', num); painted.push('--dsh-font-num')
  body.style.setProperty('--dsw-font-family', ui); painted.push('--dsw-font-family')

  for (const [k, v] of Object.entries(DECOR[decor][scheme])) { body.style.setProperty(k, v); painted.push(k) }

  for (const b of document.querySelectorAll('[data-decor]')) b.setAttribute('aria-pressed', String(b.dataset.decor === decor))
  document.getElementById('schemeBtn').textContent = scheme === 'light' ? '暗色' : '亮色'
  drawSpectrum(true)
}

for (const b of document.querySelectorAll('[data-decor]')) b.addEventListener('click', () => { decor = b.dataset.decor; paint() })
document.getElementById('schemeBtn').addEventListener('click', () => { scheme = scheme === 'light' ? 'dark' : 'light'; paint() })
addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { scheme = scheme === 'light' ? 'dark' : 'light'; paint() }
  if (e.key === '1') { decor = 'plain'; paint() }
  if (e.key === '2') { decor = 'soft'; paint() }
  if (e.key === '3') { decor = 'rich'; paint() }
})

/* ── 假频谱：用两条正弦叠一个包络，随时间缓慢起伏 ── */
const canvas = document.getElementById('spectrum')
const ctx = canvas.getContext('2d')
let t = 0

function readVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim()
  return v || fallback
}

function drawSpectrum(reset) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth || 600
  const h = canvas.clientHeight || 96
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const accent = readVar('--dsw-alias-button-primary-fill', '#ef7d9a')
  const accent2 = readVar('--dsw-alias-state-business-primary', '#5f8fd8')
  const bars = 56
  const gap = 2
  const bw = (w - gap * (bars - 1)) / bars
  const grad = ctx.createLinearGradient(0, h, 0, 0)
  grad.addColorStop(0, accent)
  grad.addColorStop(1, accent2)

  ctx.fillStyle = grad
  for (let i = 0; i < bars; i++) {
    const x = i * (bw + gap)
    // 低频高、高频低 + 缓慢起伏
    const env = Math.pow(1 - i / bars, 1.5)
    const wob = 0.5 + 0.5 * Math.sin(t * 0.045 + i * 0.42)
    const wob2 = 0.5 + 0.5 * Math.sin(t * 0.02 + i * 0.11 + 1.7)
    const v = Math.max(0.06, env * (0.45 * wob + 0.55 * wob2))
    const bh = Math.max(3, v * h * 0.92)
    const r = Math.min(bw / 2, 3)
    ctx.beginPath()
    ctx.roundRect(x, h - bh, bw, bh, [r, r, 0, 0])
    ctx.fill()
  }
}

let raf
function loop() {
  t += 1
  drawSpectrum()
  raf = requestAnimationFrame(loop)
}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
if (!reduce) loop()
else drawSpectrum(true)

addEventListener('resize', () => drawSpectrum(true))

/* ── 歌词轻微上移，模拟跟随 ── */
let lyricOffset = 0
if (!reduce) {
  setInterval(() => {
    lyricOffset = (lyricOffset + 1) % 6
    const inner = document.getElementById('lyricsInner')
    inner.style.transform = \`translateY(\${-lyricOffset * 36}px)\`
  }, 4000)
}

paint()
</script>
</body>
</html>
`

writeFileSync(OUT, html, 'utf8')
console.log(`wrote ${OUT}`)
console.log(`size: ${(html.length / 1024).toFixed(1)} KiB`)
