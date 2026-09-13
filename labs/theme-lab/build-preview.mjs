/*
 * 预览页生成器 · preview builder
 * ------------------------------
 * 用 DSH 自带样式表（design-platform / base / corner-shape / scrollbar /
 * gradient-shadow-text / sidebar / conversation）+ 候选主题 token，
 * 拼出一张可切换主题的静态界面样张。
 *
 * 页面里的组件用的是**真实 CSS Modules 类名**，所以看到的圆角、间距、
 * 层级关系就是真机上的关系；只有布局壳与装饰层是手写的。
 *
 * 用法：node theme-lab/build-preview.mjs
 * 产物：theme-lab/preview.html（单文件，双击即可看）
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { THEMES } from './palettes.mjs'

const RESEARCH = new URL('../data/_theme-research/', import.meta.url)
const OUT = new URL('./preview.html', import.meta.url)

const read = (name) => readFileSync(new URL(name, RESEARCH), 'utf8')

/** DSH 自带样式表，顺序与 ui-theme 的加载顺序一致。 */
const HOST_CSS = [
  read('base.css'),
  read('corner-shape.css'),
  read('scrollbar.css'),
  read('design-platform.css'),
  read('gradient-shadow-text.css'),
  read('sidebar.css'),
  read('conversation.css'),
].join('\n')

/* ────────────────────────── 装饰层（主题的一部分，不只是换色） ────────────────────────── */

/**
 * 这段 CSS 是"清新可爱"的加分项，注入在宿主样式之后。
 * 它只做宿主 token 做不到的事：更大的圆角、气泡尾巴、柔和底纹、hover 抬升。
 */
const CUTE_LAYER = /* css */ `
/* 圆角整体调大，卡片感变"软" */
.dsh-cute ._7yHdaG_dock,
.dsh-cute .uV2eYG_card { border-radius: 22px; }
.dsh-cute ._7yHdaG_row,
.dsh-cute .hWmORq_root { border-radius: 16px; }

/* 侧栏：底部一层柔和渐晕，像汽水里的小气泡 */
.dsh-cute .hHd-Xa_root {
  background-image:
    radial-gradient(120% 60% at 50% 100%, color-mix(in srgb, var(--dsw-specific-sidebar-nav-item-active-accent) 16%, transparent) 0%, transparent 70%);
}

/* 会话气泡：更圆的角 + 一侧小尾巴 */
.dsh-cute .dsh-bubble {
  border-radius: 20px;
  border-bottom-left-radius: 6px;
  padding: 10px 14px;
  box-shadow: var(--dsw-elevation-panel);
}
.dsh-cute .dsh-bubble--user {
  border-bottom-left-radius: 20px;
  border-bottom-right-radius: 6px;
}

/* 顶栏标题：字重 + 一点点字距，显得软 */
.dsh-cute .dsh-title { letter-spacing: .01em; }

/* 卡片/工具行 hover 抬升 */
.dsh-cute .dsh-lift { transition: transform .18s var(--ds-ease-in-out), box-shadow .18s var(--ds-ease-in-out); }
.dsh-cute .dsh-lift:hover { transform: translateY(-1px); box-shadow: var(--dsw-elevation-prominent); }

/* 可爱小徽章 */
.dsh-cute .dsh-pill {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 8px; border-radius: 999px;
  font-size: 11px; line-height: 20px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-cute .dsh-pill--accent {
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 16%, transparent);
  color: var(--dsw-alias-button-primary-fill);
}

/* 鲸鱼 logo 的圆底 */
.dsh-cute .dsh-mark {
  width: 28px; height: 28px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px;
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 18%, transparent);
}
.dsh-cute .dsh-mark { corner-shape: round; }

/* 代码块顶部的小圆点 */
.dsh-cute .dsh-dots { display: inline-flex; gap: 4px; }
.dsh-cute .dsh-dots i {
  width: 8px; height: 8px; border-radius: 50%; display: block; corner-shape: round;
  background: var(--dsw-alias-label-dimmed);
}
.dsh-cute .dsh-dots i:nth-child(1) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 70%, transparent); }
.dsh-cute .dsh-dots i:nth-child(2) { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 70%, transparent); }
.dsh-cute .dsh-dots i:nth-child(3) { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 70%, transparent); }

@media (prefers-reduced-motion: reduce) {
  .dsh-cute .dsh-lift { transition: none; }
}
`

/* ────────────────────────── 样张骨架 ────────────────────────── */

/** 一条会话气泡。 */
function bubble(kind, html) {
  return `<div class="dsh-bubble dsh-bubble--${kind}">${html}</div>`
}

/** 页面主体：侧栏 + 会话 + 输入区。 */
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

    <button class="dsh-newSession hHd-Xa_newSession">＋ 新会话</button>

    <div class="hHd-Xa_regionArea dsh-region">
      <div class="dsh-regionLabel">今天</div>
      <div class="dsh-navItem hHd-Xa_navItem hHd-Xa_active">清新可爱主题怎么定调</div>
      <div class="dsh-navItem hHd-Xa_navItem">把 README 翻成中文</div>
      <div class="dsh-navItem hHd-Xa_navItem">修一个时区 bug</div>
      <div class="dsh-regionLabel">昨天</div>
      <div class="dsh-navItem hHd-Xa_navItem">整理插件安装清单</div>
      <div class="dsh-navItem hHd-Xa_navItem">对比三个 diff 工具</div>
    </div>

    <div class="hHd-Xa_footArea dsh-foot">
      <span class="hHd-Xa_iconButton">⚙</span>
      <span class="hHd-Xa_iconButton">☾</span>
      <span class="dsh-pill">v0.1.2-rc.1</span>
    </div>
  </aside>

  <main class="dsh-main wSkVaW_root">
    <header class="dsh-topbar">
      <span class="dsh-title">清新可爱主题怎么定调</span>
      <span class="dsh-pill dsh-pill--accent">deepseek-v4.1</span>
      <span class="dsh-pill">工作区 D:\\deepseek_harness</span>
    </header>

    <div class="dsh-scroll">
      ${bubble('user', `<p>帮我把界面主题改成清新可爱一点的，别太商务。</p>`)}

      ${bubble('assistant', `
        <p>可以，先把方向拆成三件事：<strong>配色</strong>、<strong>圆角与留白</strong>、<strong>字体气质</strong>。</p>
        <p>配色建议用低饱和的清爽色系，避免高饱和撞色带来的"促销页"感：</p>
        <div class="_7yHdaG_row dsh-lift dsh-toolRow">
          <span class="dsh-pill">⚡ read_file</span>
          <span class="dsh-toolText">theme-lab/palettes.mjs</span>
          <span class="dsh-pill">128 行</span>
        </div>
        <div class="dsh-code">
          <div class="_7yHdaG_header dsh-codeHead">
            <span class="dsh-dots"><i></i><i></i><i></i></span>
            <span class="dsh-codeName">palettes.mjs</span>
          </div>
          <pre><code>export const mintSodaLight = {
  id: 'mint-soda-light',
  colorScheme: 'light',
  tokens: { '--dsw-alias-bg-base': '#f7fbf9' },
}</code></pre>
        </div>
        <p>下面是同一个界面的两种落法，切换右上角按钮就能看：</p>
        <ul>
          <li><strong>薄荷汽水</strong>：清透绿 + 柠檬奶油，最"汽水"</li>
          <li><strong>樱花麻薯</strong>：樱粉 + 抹茶，最"软糯"</li>
          <li><strong>柠檬奶油</strong>：奶油黄 + 天蓝，最"暖"</li>
        </ul>
      `)}

      ${bubble('user', `<p>先都看看，顺便把对比度检查一下。</p>`)}

      ${bubble('assistant', `
        <p>已经在做了。正文对比度按宿主自己的基线对齐（宿主 <code>label-secondary</code> 最差 5.21:1），
        弱化元数据保持宿主水平。这是刚跑完的结果：</p>
        <div class="_7yHdaG_row dsh-lift dsh-toolRow">
          <span class="dsh-pill">⚡ run_command</span>
          <span class="dsh-toolText">node theme-lab/check-contrast.mjs</span>
          <span class="dsh-pill dsh-pill--accent">PASS 333/333</span>
        </div>
      `)}
    </div>

    <div class="wSkVaW_composerSeat dsh-composerSeat">
      <div class="uV2eYG_root">
        <div class="uV2eYG_card dsh-lift">
          <div class="uV2eYG_input">选好方向之后，我就把它打包成可安装的 DSH 主题插件<span class="dsh-caret"></span></div>
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

/* ────────────────────────── 组装 ────────────────────────── */

const themeJson = JSON.stringify(THEMES, null, 2)

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSH 清新可爱主题 · 预览</title>
<style>
${HOST_CSS}
</style>
<style>
${CUTE_LAYER}
</style>
<style>
/* 样张自己的布局壳（不影响主题判断，只为把组件摆成 DSH 的样子） */
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: var(--dsw-font-family);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
}
.dsh-shell { display: grid; grid-template-columns: 264px 1fr; height: 100vh; }
.dsh-sidebar { display: flex; flex-direction: column; gap: 8px; height: 100%; }
/* 新会话按钮沿用宿主 .hHd-Xa_newSession 的真实样式，这里只补一句文字对齐 */
.dsh-region { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 2px; }
.dsh-regionLabel {
  padding: 10px 8px 4px; font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-caption); letter-spacing: .04em;
}
.dsh-navItem {
  height: 32px; display: flex; align-items: center; padding: 0 10px;
  border-radius: 10px; font-size: 13px; cursor: default;
  color: var(--dsw-alias-label-secondary);
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
.dsh-topbar {
  display: flex; align-items: center; gap: 8px; height: 52px; flex: none;
  padding: 0 24px; border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.dsh-title { font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-scroll {
  flex: 1; min-height: 0; overflow-y: auto; padding: 24px 32px 8px;
  display: flex; flex-direction: column; gap: 14px;
  max-width: 860px; width: 100%; margin: 0 auto;
}
.dsh-bubble { font-size: 14px; line-height: 24px; max-width: 78%; }
.dsh-bubble p { margin: 0 0 8px; }
.dsh-bubble p:last-child { margin-bottom: 0; }
.dsh-bubble ul { margin: 0 0 8px; padding-left: 20px; }
.dsh-bubble code {
  font-family: var(--ds-font-family-code); font-size: 12px;
  background: var(--dsw-alias-markdown-inline-code);
  padding: 1px 5px; border-radius: 6px;
}
.dsh-bubble--user {
  align-self: flex-end;
  background: var(--dsw-specific-bubble);
  border: .5px solid var(--dsw-alias-border-l2);
}
.dsh-bubble--assistant { align-self: flex-start; background: transparent; }
.dsh-toolRow {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 8px 0;
  border: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.dsh-toolText { font-size: 13px; color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code); }
.dsh-code {
  margin: 10px 0; border-radius: 14px; overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-markdown-code-block);
}
.dsh-codeHead {
  display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px;
  background: var(--dsw-alias-markdown-code-block-banner);
  border-bottom: .5px solid var(--dsw-alias-border-l1);
}
.dsh-codeName { font-size: 12px; color: var(--dsw-alias-label-tertiary); font-family: var(--ds-font-family-code); }
.dsh-code pre { margin: 0; padding: 12px 14px; overflow-x: auto; }
.dsh-code code {
  font-family: var(--ds-font-family-code); font-size: 12px; line-height: 19px;
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

/* 右上角主题切换器 */
.dsh-switch {
  position: fixed; top: 14px; right: 14px; z-index: 99;
  display: flex; align-items: center; gap: 6px; padding: 6px;
  border-radius: 999px; background: var(--dsw-alias-button-floating-fill);
  box-shadow: var(--dsw-elevation-prominent);
  border: .5px solid var(--dsw-alias-border-l2);
}
.dsh-switch button {
  font: inherit; font-size: 12px; cursor: pointer;
  height: 28px; padding: 0 12px; border-radius: 999px; border: 0;
  color: var(--dsw-alias-label-secondary); background: transparent;
}
.dsh-switch button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-switch button[aria-pressed="true"] {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dsh-switch .dsh-scheme { border-left: .5px solid var(--dsw-alias-border-l2); padding-left: 10px; margin-left: 2px; }
.dsh-switch .dsh-toggleCute { font-size: 11px; }
</style>
</head>
<body>

<div class="dsh-switch">
  <button type="button" data-theme="mint-soda">薄荷汽水</button>
  <button type="button" data-theme="sakura-mochi">樱花麻薯</button>
  <button type="button" data-theme="lemon-cream">柠檬奶油</button>
  <span class="dsh-scheme"><button type="button" id="schemeBtn">暗色</button></span>
  <button type="button" class="dsh-toggleCute" id="cuteBtn" aria-pressed="true">可爱层</button>
</div>

${BODY}

<script>
const THEMES = ${themeJson}
const byId = new Map(THEMES.map(t => [t.id, t]))
const FAMILIES = ['mint-soda', 'sakura-mochi', 'lemon-cream']

let family = 'mint-soda'
let scheme = 'light'
let cute = true

// 支持 #theme=<family>&scheme=<light|dark>&cute=<0|1>，便于分享/截图固定状态
{
  const params = new URLSearchParams(location.hash.slice(1))
  const f = params.get('theme'); if (FAMILIES.includes(f)) family = f
  const s = params.get('scheme'); if (s === 'light' || s === 'dark') scheme = s
  const c = params.get('cute'); if (c === '0' || c === '1') cute = c === '1'
}

/** 已写入 body 的 token 名，切换时先撤再写。 */
let painted = []

function paint() {
  const body = document.body
  for (const name of painted) body.style.removeProperty(name)
  painted = []
  const theme = byId.get(family + '-' + scheme)
  if (!theme) return
  document.documentElement.style.colorScheme = theme.colorScheme
  body.toggleAttribute('data-ds-dark-theme', theme.colorScheme === 'dark')
  body.style.setProperty('--dsh-content-font-size', '14px')
  for (const [name, value] of Object.entries(theme.tokens)) {
    body.style.setProperty(name, value)
    painted.push(name)
  }
  for (const btn of document.querySelectorAll('.dsh-switch [data-theme]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.theme === family))
  }
  document.getElementById('schemeBtn').textContent = scheme === 'light' ? '暗色' : '亮色'
  document.getElementById('cuteBtn').setAttribute('aria-pressed', String(cute))
  body.classList.toggle('dsh-cute', cute)
}

for (const btn of document.querySelectorAll('.dsh-switch [data-theme]')) {
  btn.addEventListener('click', () => { family = btn.dataset.theme; paint() })
}
document.getElementById('schemeBtn').addEventListener('click', () => {
  scheme = scheme === 'light' ? 'dark' : 'light'; paint()
})
document.getElementById('cuteBtn').addEventListener('click', () => { cute = !cute; paint() })

// 键盘：1/2/3 切家族，d 切明暗
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
  if (e.key === '1' || e.key === '2' || e.key === '3') { family = FAMILIES[Number(e.key) - 1]; paint() }
  if (e.key === 'd' || e.key === 'D') { scheme = scheme === 'light' ? 'dark' : 'light'; paint() }
})

paint()
</script>
</body>
</html>
`

writeFileSync(OUT, html, 'utf8')
console.log(`wrote ${OUT.pathname}`)
console.log(`size: ${(html.length / 1024).toFixed(1)} KiB, themes: ${THEMES.length}`)
