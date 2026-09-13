/*
 * 预览页 v2 · 樱花麻薯精进版
 * --------------------------
 * 在 v1 的基础上加三件事：
 *   1. 字体：霞鹜文楷（正文）+ Maple Mono（代码），可在页面上切换对比
 *   2. 装饰层：三档强度（素 / 柔 / 满），用真实的 CSS 手法而不是纯换色
 *   3. 细节：贴纸感圆角、柔和投影、呼吸光、纸纹、渐晕
 *
 * 仍然只用 DSH 自带的样式表 + 真实组件类名，token 写在 body 上，
 * 与真机 ThemePresenter 的做法一致。
 *
 * 用法：node theme-lab/build-preview2.mjs
 * 产物：theme-lab/preview2.html
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sakuraMochiLight, sakuraMochiDark } from './palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESEARCH = join(HERE, '..', 'data', '_theme-research')
const read = (n) => readFileSync(join(RESEARCH, n), 'utf8')

const HOST_CSS = [
  read('base.css'), read('corner-shape.css'), read('scrollbar.css'),
  read('design-platform.css'), read('gradient-shadow-text.css'),
  read('sidebar.css'), read('conversation.css'),
].join('\n')

/* ══════════════════════ 装饰层 · 三档强度 ══════════════════════
 *
 * 全部装饰都挂在 body::before / body::after 上（position:fixed +
 * pointer-events:none），因此不进布局、不挡点击、不改变任何组件尺寸。
 * 这是"装饰层能安全叠加"的前提。
 */

/** 纸纹：极淡的斜向细线 + 噪点，用 SVG 内联，避免外部请求。 */
const GRAIN = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"

/** 圆点纸：12px 一格的淡点阵。 */
const DOTS = "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Ccircle cx='1.2' cy='1.2' r='1' fill='%23000' opacity='.055'/%3E%3C/svg%3E\")"

const DECOR = /* css */ `
/* ── 第一层：纸纹 + 点阵（永远在最后面） ── */
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0;
  pointer-events: none;
  background-image: var(--dsh-decor-grain, none), var(--dsh-decor-dots, none);
  background-size: 120px 120px, 12px 12px;
  opacity: var(--dsh-decor-grain-opacity, 0);
  mix-blend-mode: var(--dsh-decor-blend, normal);
}
/* ── 第二层：柔和光斑（缓慢呼吸，不移动布局） ── */
body::after {
  content: ''; position: fixed; inset: -10%; z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(38% 32% at 12% 8%,  var(--dsh-decor-blob-1, transparent) 0%, transparent 62%),
    radial-gradient(34% 30% at 92% 22%, var(--dsh-decor-blob-2, transparent) 0%, transparent 60%),
    radial-gradient(46% 40% at 74% 96%, var(--dsh-decor-blob-3, transparent) 0%, transparent 64%),
    radial-gradient(30% 26% at 34% 78%, var(--dsh-decor-blob-4, transparent) 0%, transparent 60%);
  opacity: var(--dsh-decor-blob-opacity, 0);
  animation: dsh-breathe 14s ease-in-out infinite alternate;
}
@keyframes dsh-breathe {
  0%   { transform: scale(1)    translate(0, 0); }
  100% { transform: scale(1.06) translate(1.2%, -1.4%); }
}

/* 装饰层不该盖住内容：内容区抬到装饰之上 */
.dsh-shell { position: relative; z-index: 1; }

/* ── 贴纸感：圆角、柔和投影、轻微描边 ── */
.dsh-shell ._7yHdaG_dock,
.dsh-shell .uV2eYG_card { border-radius: var(--dsh-decor-radius-card, 22px); }
.dsh-shell .dsh-bubble {
  border-radius: var(--dsh-decor-radius-card, 20px);
  border-bottom-left-radius: var(--dsh-decor-radius-tail, 6px);
  padding: 10px 14px;
  box-shadow: var(--dsh-decor-shadow, var(--dsw-elevation-panel));
}
.dsh-shell .dsh-bubble--user {
  border-bottom-left-radius: var(--dsh-decor-radius-card, 20px);
  border-bottom-right-radius: var(--dsh-decor-radius-tail, 6px);
}
.dsh-shell .dsh-toolRow,
.dsh-shell .dsh-code { border-radius: var(--dsh-decor-radius-card, 14px); box-shadow: var(--dsh-decor-shadow-soft, none); }

/* ── 侧栏：底部渐晕 + 顶部高光，像奶油上的一层糖霜 ── */
.dsh-shell .hHd-Xa_root {
  background-image:
    linear-gradient(180deg,
      var(--dsh-decor-sidebar-top, transparent) 0%,
      transparent 42%,
      var(--dsh-decor-sidebar-bottom, transparent) 100%);
}

/* ── 顶栏：底部一条柔和渐变线 ── */
.dsh-shell .dsh-topbar { position: relative; }
.dsh-shell .dsh-topbar::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1.5px;
  background: var(--dsh-decor-rule, transparent);
  opacity: var(--dsh-decor-rule-opacity, 0);
}

/* ── 输入区：底部一层渐晕光，像桌上打了一盏小灯 ── */
.dsh-shell .dsh-composerSeat {
  background: linear-gradient(180deg, transparent 0%, var(--dsh-decor-composer-glow, transparent) 100%);
}

/* ── 贴纸小徽章 ── */
.dsh-shell .dsh-pill {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 8px; border-radius: 999px;
  font-size: 11px; line-height: 20px;
  font-family: 'Nunito', 'Microsoft YaHei', sans-serif;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  border: .5px solid var(--dsw-alias-border-l2);
}
.dsh-shell .dsh-pill--accent {
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 16%, transparent);
  color: var(--dsw-alias-button-primary-fill);
  border-color: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 32%, transparent);
}

/* ── logo：圆角方块 + 呼吸光 ── */
.dsh-shell .dsh-mark {
  width: 30px; height: 30px; border-radius: 11px; corner-shape: round;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 16px; line-height: 1;
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 18%, transparent);
  box-shadow: 0 0 0 var(--dsh-decor-mark-halo, 0px) color-mix(in srgb, var(--dsw-alias-button-primary-fill) 14%, transparent);
  animation: dsh-halo 4.5s ease-in-out infinite alternate;
}
@keyframes dsh-halo {
  0%   { box-shadow: 0 0 0 var(--dsh-decor-mark-halo, 0px) color-mix(in srgb, var(--dsw-alias-button-primary-fill) 12%, transparent); }
  100% { box-shadow: 0 0 0 calc(var(--dsh-decor-mark-halo, 0px) * 1.9) color-mix(in srgb, var(--dsw-alias-button-primary-fill) 5%, transparent); }
}

/* ── 新会话按钮：胶囊 + 顶部高光 ── */
.dsh-shell .hHd-Xa_newSession {
  border-radius: 999px;
  border: .5px solid color-mix(in srgb, var(--dsw-alias-button-primary-fill) 42%, transparent);
  background-image: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-button-primary-fill) 16%, transparent) 0%,
    transparent 60%);
  box-shadow: var(--dsh-decor-shadow-soft, none);
  transition: transform .16s var(--ds-ease-in-out), box-shadow .16s var(--ds-ease-in-out);
}
.dsh-shell .hHd-Xa_newSession:hover { transform: translateY(-1px); box-shadow: var(--dsw-elevation-panel); }

/* ── 代码块：三颗小圆点 ── */
.dsh-shell .dsh-dots { display: inline-flex; gap: 4px; }
.dsh-shell .dsh-dots i {
  width: 8px; height: 8px; border-radius: 50%; corner-shape: round; display: block;
  background: var(--dsw-alias-label-dimmed);
}
.dsh-shell .dsh-dots i:nth-child(1) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 62%, transparent); }
.dsh-shell .dsh-dots i:nth-child(2) { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 62%, transparent); }
.dsh-shell .dsh-dots i:nth-child(3) { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 62%, transparent); }

/* ── 卡片 hover 轻抬 ── */
.dsh-shell .dsh-lift { transition: transform .18s var(--ds-ease-in-out), box-shadow .18s var(--ds-ease-in-out); }
.dsh-shell .dsh-lift:hover { transform: translateY(-1.5px); box-shadow: var(--dsw-elevation-prominent); }

@media (prefers-reduced-motion: reduce) {
  body::after, .dsh-shell .dsh-mark { animation: none; }
  .dsh-shell .dsh-lift, .dsh-shell .hHd-Xa_newSession { transition: none; }
}
`

/* ══════════════════════ 三档装饰强度 ══════════════════════ */

/** 每档只改一组 CSS 变量，装饰层本身的结构不变。 */
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
      '--dsh-decor-radius-card': '14px', '--dsh-decor-radius-tail': '4px',
      '--dsh-decor-shadow': 'var(--dsw-elevation-panel)', '--dsh-decor-shadow-soft': 'none',
      '--dsh-decor-sidebar-top': 'transparent', '--dsh-decor-sidebar-bottom': 'transparent',
      '--dsh-decor-rule': 'transparent', '--dsh-decor-rule-opacity': '0',
      '--dsh-decor-composer-glow': 'transparent', '--dsh-decor-mark-halo': '0px',
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
    '--dsh-decor-radius-card': '22px', '--dsh-decor-radius-tail': '6px',
    '--dsh-decor-shadow': 'var(--dsw-elevation-panel)',
    '--dsh-decor-shadow-soft': 'var(--dsw-elevation-soft)',
    '--dsh-decor-sidebar-top': `color-mix(in srgb, ${accent} 7%, transparent)`,
    '--dsh-decor-sidebar-bottom': `color-mix(in srgb, ${accent} 13%, transparent)`,
    '--dsh-decor-rule': `linear-gradient(90deg, transparent, ${accent}55, ${accent2}44, transparent)`,
    '--dsh-decor-rule-opacity': '1',
    '--dsh-decor-composer-glow': `color-mix(in srgb, ${accent} 7%, transparent)`,
    '--dsh-decor-mark-halo': '6px',
  }

  const rich = {
    ...soft,
    '--dsh-decor-grain': `${GRAIN}, ${DOTS}`, '--dsh-decor-dots': DOTS,
    '--dsh-decor-grain-opacity': dark ? '0.07' : '0.085',
    '--dsh-decor-blob-opacity': dark ? '0.78' : '0.95',
    '--dsh-decor-blob-1': `color-mix(in srgb, ${accent} 24%, transparent)`,
    '--dsh-decor-blob-2': `color-mix(in srgb, ${accent2} 20%, transparent)`,
    '--dsh-decor-blob-3': `color-mix(in srgb, ${accent} 16%, transparent)`,
    '--dsh-decor-blob-4': `color-mix(in srgb, ${accent2} 13%, transparent)`,
    '--dsh-decor-radius-card': '26px', '--dsh-decor-radius-tail': '8px',
    '--dsh-decor-shadow': 'var(--dsw-elevation-prominent)',
    '--dsh-decor-sidebar-top': `color-mix(in srgb, ${accent} 11%, transparent)`,
    '--dsh-decor-sidebar-bottom': `color-mix(in srgb, ${accent} 20%, transparent)`,
    '--dsh-decor-composer-glow': `color-mix(in srgb, ${accent} 12%, transparent)`,
    '--dsh-decor-mark-halo': '10px',
  }

  return level === 'rich' ? rich : soft
}

/** 字体方案：ui 走正文，chrome 走控件（控件保持无衬线更清晰），code 走代码。 */
const FONT_STACKS = {
  wenkai: {
    label: '文楷 + Maple',
    ui: "'LXGW WenKai GB Lite', 'Microsoft YaHei', sans-serif",
    chrome: "'Nunito', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', 'SF Mono', Consolas, monospace",
  },
  wenkaiNunito: {
    label: '文楷 + Nunito + Maple',
    ui: "'Nunito', 'LXGW WenKai GB Lite', 'Microsoft YaHei', sans-serif",
    chrome: "'Nunito', 'Microsoft YaHei', sans-serif",
    code: "'Maple Mono', 'SF Mono', Consolas, monospace",
  },
  system: {
    label: '微软雅黑（系统基线）',
    ui: "'Microsoft YaHei', sans-serif",
    chrome: "'Microsoft YaHei', sans-serif",
    code: "Consolas, monospace",
  },
}

/* ══════════════════════ 样张骨架 ══════════════════════ */

const BODY = /* html */ `
<div class="dsh-shell">
  <aside class="dsh-sidebar hHd-Xa_root">
    <div class="hHd-Xa_logoRow">
      <span class="hHd-Xa_brand">
        <span class="hHd-Xa_brandIdentity">
          <span class="hHd-Xa_brandMark dsh-mark">🐋</span>
          <span class="hHd-Xa_brandName">DeepSeek Harness</span>
        </span>
      </span>
    </div>
    <button class="hHd-Xa_newSession">＋ 新会话</button>
    <div class="hHd-Xa_regionArea dsh-region">
      <div class="dsh-regionLabel">今天</div>
      <div class="dsh-navItem hHd-Xa_active">樱花麻薯主题精进</div>
      <div class="dsh-navItem">把 README 翻成中文</div>
      <div class="dsh-navItem">修一个时区 bug</div>
      <div class="dsh-regionLabel">昨天</div>
      <div class="dsh-navItem">整理插件安装清单</div>
      <div class="dsh-navItem">对比三个 diff 工具</div>
    </div>
    <div class="hHd-Xa_footArea dsh-foot">
      <span class="hHd-Xa_iconButton">⚙</span>
      <span class="hHd-Xa_iconButton">☾</span>
      <span class="dsh-pill">v0.1.2-rc.1</span>
    </div>
  </aside>

  <main class="dsh-main wSkVaW_root">
    <header class="dsh-topbar">
      <span class="dsh-title">樱花麻薯主题精进</span>
      <span class="dsh-pill dsh-pill--accent">deepseek-v4.1</span>
      <span class="dsh-pill">D:\\deepseek_harness</span>
    </header>

    <div class="dsh-scroll">
      <div class="dsh-bubble dsh-bubble--user"><p>这个方向不错，字体也换成柔和一点的吧。</p></div>

      <div class="dsh-bubble dsh-bubble--assistant">
        <p>好，正文换成<strong>霞鹜文楷</strong>（开源 OFL，笔画带一点手写收笔），
        代码保持<strong>圆角等宽</strong>，两边都软但不糊。</p>
        <div class="_7yHdaG_row dsh-lift dsh-toolRow">
          <span class="dsh-pill">⚡ read_file</span>
          <span class="dsh-toolText">theme-lab/palettes.mjs</span>
          <span class="dsh-pill">80 个 token</span>
        </div>
        <div class="dsh-code">
          <div class="_7yHdaG_header dsh-codeHead">
            <span class="dsh-dots"><i></i><i></i><i></i></span>
            <span class="dsh-codeName">sakura-mochi.mjs</span>
          </div>
          <pre><code>export const sakuraMochiLight = {
  id: 'sakura-mochi-light',
  colorScheme: 'light',
  tokens: { '--dsw-alias-bg-base': '#fff9fa' },
}</code></pre>
        </div>
        <p>装饰层分三档，右上角可以切：素、柔、满。全部挂在固定定位的伪元素上，
        不占布局、不挡点击。</p>
      </div>

      <div class="dsh-bubble dsh-bubble--user"><p>先看看"满"这档会不会太花。</p></div>

      <div class="dsh-bubble dsh-bubble--assistant">
        <p>满档加了点阵纸纹、四团呼吸光斑、侧栏糖霜渐晕、顶栏渐变细线，
        以及卡片 hover 的轻抬。文字对比度没动——装饰层只加底纹，不改 token。</p>
        <div class="_7yHdaG_row dsh-lift dsh-toolRow">
          <span class="dsh-pill">⚡ run_command</span>
          <span class="dsh-toolText">node theme-lab/check-contrast.mjs</span>
          <span class="dsh-pill dsh-pill--accent">PASS 333/333</span>
        </div>
      </div>
    </div>

    <div class="wSkVaW_composerSeat dsh-composerSeat">
      <div class="uV2eYG_root">
        <div class="uV2eYG_card dsh-lift">
          <div class="uV2eYG_input">选好字体和装饰强度，我就打包成插件<span class="dsh-caret"></span></div>
          <div class="dsh-composerBar">
            <span class="dsh-pill">@ 文件</span>
            <span class="dsh-pill">/ 命令</span>
            <span class="dsh-pill">⏎ 发送</span>
            <span class="dsh-pill dsh-pill--accent">标准预设</span>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
`

/* ══════════════════════ 组装 ══════════════════════ */

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>樱花麻薯 · 主题精进预览</title>
<style>
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Medium.ttf') format('truetype'); font-weight: 500 700; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Nunito'; src: url('./fonts/nunito-latin-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Maple Mono'; src: url('./fonts/maple-mono-latin-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
</style>
<style>
${HOST_CSS}
</style>
<style>
${DECOR}
</style>
<style>
/* 样张自己的布局壳 */
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--dsh-font-ui, var(--dsw-font-family));
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.dsh-shell { display: grid; grid-template-columns: 264px 1fr; height: 100vh; }
.dsh-sidebar { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.dsh-region { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 2px; }
.dsh-regionLabel { padding: 10px 8px 4px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption); letter-spacing: .04em; }
.dsh-navItem {
  height: 32px; display: flex; align-items: center; padding: 0 10px; border-radius: 10px;
  font-size: 13px; cursor: default; color: var(--dsw-alias-label-secondary);
  text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
}
.dsh-navItem:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
.dsh-navItem.hHd-Xa_active {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 2px 0 0 0 var(--dsw-specific-sidebar-nav-item-active-accent);
}
.dsh-foot { display: flex; flex-direction: row; align-items: center; gap: 6px; flex: none; padding-top: 8px; }

.dsh-main { display: flex; flex-direction: column; min-width: 0; background: var(--dsw-alias-bg-base); }
.dsh-topbar { display: flex; align-items: center; gap: 8px; height: 52px; flex: none; padding: 0 24px; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.dsh-title { font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-scroll {
  flex: 1; min-height: 0; overflow-y: auto; padding: 24px 32px 8px;
  display: flex; flex-direction: column; gap: 14px; max-width: 860px; width: 100%; margin: 0 auto;
}
.dsh-bubble { font-size: 14px; line-height: 25px; max-width: 78%; }
.dsh-bubble p { margin: 0 0 8px; }
.dsh-bubble p:last-child { margin-bottom: 0; }
.dsh-bubble code {
  font-family: var(--dsh-font-code, monospace); font-size: 12px;
  background: var(--dsw-alias-markdown-inline-code); padding: 1px 5px; border-radius: 6px;
}
.dsh-bubble--user { align-self: flex-end; background: var(--dsw-specific-bubble); border: .5px solid var(--dsw-alias-border-l2); }
.dsh-bubble--assistant { align-self: flex-start; background: transparent; }
.dsh-toolRow {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 8px 0;
  border: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
}
.dsh-toolText { font-size: 12.5px; color: var(--dsw-alias-label-secondary); font-family: var(--dsh-font-code, monospace); }
.dsh-code { margin: 10px 0; overflow: hidden; border: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-markdown-code-block); }
.dsh-codeHead {
  display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px;
  background: var(--dsw-alias-markdown-code-block-banner); border-bottom: .5px solid var(--dsw-alias-border-l1);
}
.dsh-codeName { font-size: 12px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsh-font-code, monospace); }
.dsh-code pre { margin: 0; padding: 12px 14px; overflow-x: auto; }
.dsh-code code {
  font-family: var(--dsh-font-code, monospace); font-size: 12.5px; line-height: 20px;
  color: var(--dsw-alias-label-secondary); background: none; padding: 0;
}
.dsh-composerSeat { flex: none; }
.dsh-composerBar { display: flex; gap: 6px; padding: 8px 12px 10px; }
.dsh-caret {
  display: inline-block; width: 1.5px; height: 15px; vertical-align: -2px;
  background: var(--dsw-alias-state-business-primary);
  animation: dsh-blink 1s steps(2, start) infinite;
}
@keyframes dsh-blink { 50% { opacity: 0; } }

/* 控件一律走无衬线，避免文楷在小控件里发虚 */
.dsh-pill, .dsh-navItem, .hHd-Xa_newSession, .hHd-Xa_brandName, .dsh-regionLabel {
  font-family: var(--dsh-font-chrome, sans-serif);
}

/* 右上角控制条 */
.dsh-switch {
  position: fixed; top: 14px; right: 14px; z-index: 99;
  display: flex; align-items: center; gap: 6px; padding: 6px;
  border-radius: 999px; background: var(--dsw-alias-button-floating-fill);
  box-shadow: var(--dsw-elevation-prominent); border: .5px solid var(--dsw-alias-border-l2);
  font-family: 'Nunito', 'Microsoft YaHei', sans-serif;
}
.dsh-switch button {
  font: inherit; font-size: 12px; cursor: pointer; height: 28px; padding: 0 12px;
  border-radius: 999px; border: 0; color: var(--dsw-alias-label-secondary); background: transparent;
}
.dsh-switch button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-switch button[aria-pressed="true"] { background: var(--dsw-alias-button-primary-fill); color: #fff; }
.dsh-switch .sep { border-left: .5px solid var(--dsw-alias-border-l2); padding-left: 10px; margin-left: 2px; }
</style>
</head>
<body>

<div class="dsh-switch">
  <button type="button" data-decor="plain">素</button>
  <button type="button" data-decor="soft">柔</button>
  <button type="button" data-decor="rich">满</button>
  <span class="sep"><button type="button" id="schemeBtn">暗色</button></span>
  <span class="sep"><button type="button" data-font="wenkai">文楷</button>
  <button type="button" data-font="wenkaiNunito">文楷+Nunito</button>
  <button type="button" data-font="system">雅黑</button></span>
</div>

${BODY}

<script>
const THEMES = ${JSON.stringify({ light: sakuraMochiLight, dark: sakuraMochiDark })}
const FONTS = ${JSON.stringify(FONT_STACKS)}
const DECOR = ${JSON.stringify({
  plain: { light: decorVars('plain', 'light'), dark: decorVars('plain', 'dark') },
  soft: { light: decorVars('soft', 'light'), dark: decorVars('soft', 'dark') },
  rich: { light: decorVars('rich', 'light'), dark: decorVars('rich', 'dark') },
})}

let scheme = 'light'
let decor = 'soft'
let font = 'wenkai'
let painted = []

function paint() {
  const body = document.body
  for (const name of painted) body.style.removeProperty(name)
  painted = []

  const theme = THEMES[scheme]
  document.documentElement.style.colorScheme = scheme
  body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
  body.style.setProperty('--dsh-content-font-size', '14px')
  for (const [name, value] of Object.entries(theme.tokens)) {
    body.style.setProperty(name, value)
    painted.push(name)
  }

  // 字体：正文/控件/代码三条栈分别写进变量
  const f = FONTS[font]
  body.style.setProperty('--dsh-font-ui', f.ui)
  body.style.setProperty('--dsh-font-chrome', f.chrome)
  body.style.setProperty('--dsh-font-code', f.code)
  // 让宿主自己的 --dsw-font-family 也跟着走（标题、行高阶梯都用它）
  body.style.setProperty('--dsw-font-family', f.ui)
  body.style.setProperty('--ds-font-family-code', f.code)
  painted.push('--dsh-font-ui', '--dsh-font-chrome', '--dsh-font-code', '--dsw-font-family', '--ds-font-family-code')

  // 装饰层
  const vars = DECOR[decor][scheme]
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined) continue
    body.style.setProperty(name, value)
    painted.push(name)
  }

  for (const b of document.querySelectorAll('[data-decor]')) b.setAttribute('aria-pressed', String(b.dataset.decor === decor))
  for (const b of document.querySelectorAll('[data-font]')) b.setAttribute('aria-pressed', String(b.dataset.font === font))
  document.getElementById('schemeBtn').textContent = scheme === 'light' ? '暗色' : '亮色'
}

// URL 参数：#scheme=dark&decor=rich&font=wenkai
{
  const p = new URLSearchParams(location.hash.slice(1))
  const s = p.get('scheme'); if (s === 'light' || s === 'dark') scheme = s
  const d = p.get('decor'); if (d && DECOR[d]) decor = d
  const f = p.get('font'); if (f && FONTS[f]) font = f
}

for (const b of document.querySelectorAll('[data-decor]')) b.addEventListener('click', () => { decor = b.dataset.decor; paint() })
for (const b of document.querySelectorAll('[data-font]')) b.addEventListener('click', () => { font = b.dataset.font; paint() })
document.getElementById('schemeBtn').addEventListener('click', () => { scheme = scheme === 'light' ? 'dark' : 'light'; paint() })

addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { scheme = scheme === 'light' ? 'dark' : 'light'; paint() }
  if (e.key === '1') { decor = 'plain'; paint() }
  if (e.key === '2') { decor = 'soft'; paint() }
  if (e.key === '3') { decor = 'rich'; paint() }
})

paint()
</script>
</body>
</html>
`

writeFileSync(join(HERE, 'preview2.html'), html, 'utf8')
console.log(`wrote ${join(HERE, 'preview2.html')}`)
console.log(`size: ${(html.length / 1024).toFixed(1)} KiB`)
