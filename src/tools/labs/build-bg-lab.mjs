/*
 * 右侧背景动效 · 样张 v2
 * ---------------------
 * v1 的问题：mix-blend-mode: screen 在浅色底上会把颜色推向白色（看不见），
 * mesh 的模糊+低透明度也几乎全白。这版分两类处理：
 *
 *   screen 类（极光）：必须先铺深色底，再用 screen 叠光团
 *   normal 类（网格渐变/浮尘/气泡/落樱）：用普通混合 + 足够饱和度
 *
 * 每个样张都套在模拟右栏（460×330）里并叠真实文字，看会不会干扰阅读。
 *
 * 用法：node src/tools/build-bg-lab.mjs
 * 产物：bg-lab.html
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from '../../palettes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')   // src/tools/labs → 项目根
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

const EFFECTS = [
  { key: 'none', name: '无 · 现状', note: '只有静态柔光斑（当前实现），作对照。', body: '' },
  {
    key: 'aurora', name: '极光', note: '深底 + 三层光团用 screen 加色混合、各自游走。流动感最强。',
    body: `<div class="aur a1"></div><div class="aur a2"></div><div class="aur a3"></div>`,
  },
  {
    key: 'mesh', name: '网格渐变', note: '四个色团缓慢游走，交界自然融合。比极光柔和，最百搭。',
    body: `<div class="me m1"></div><div class="me m2"></div><div class="me m3"></div><div class="me m4"></div>`,
  },
  {
    key: 'float', name: '浮尘', note: '微粒上浮 + 左右漂移，带微光。最安静，几乎不干扰阅读。',
    body: Array.from({ length: 16 }, (_, i) =>
      `<div class="fl" style="left:${(i * 6.2 + 3) % 95}%;--d:${(6 + (i % 5) * 1.4).toFixed(1)}s;--dl:${(i * 0.6).toFixed(1)}s;--s:${4 + (i % 3) * 2}px"></div>`).join(''),
  },
  {
    key: 'bubbles', name: '气泡', note: '半透明大圆上浮，像水族箱。可爱但比较抢眼。',
    body: Array.from({ length: 7 }, (_, i) =>
      `<div class="bu" style="left:${7 + i * 13}%;--sz:${30 + (i % 4) * 16}px;--d:${(7 + i).toFixed(1)}s;--dl:${(i * 0.9).toFixed(1)}s"></div>`).join(''),
  },
  {
    key: 'petal', name: '落樱', note: '粉色花瓣旋转飘落 —— 配合樱花麻薯主题做的；和铃兰雪景会有点冲突。',
    body: Array.from({ length: 14 }, (_, i) =>
      `<div class="pe" style="left:${(i * 7.1) % 96}%;--d:${(7 + (i % 4) * 2.2).toFixed(1)}s;--dl:${(i * 0.95).toFixed(1)}s;--sc:${(0.55 + (i % 3) * 0.28).toFixed(2)}"></div>`).join(''),
  },
  {
    key: 'shift', name: '渐变位移', note: '超大渐变背景缓慢平移，整体色调缓缓流动。存在感弱但耐看。',
    body: '',
  },
  {
    key: 'snow', name: '落雪', note: '白色雪点飘落 —— 和铃兰雪霁壁纸同调，最贴当前主题。',
    body: Array.from({ length: 26 }, (_, i) =>
      `<div class="sn" style="left:${(i * 3.9) % 98}%;--d:${(6 + (i % 5) * 1.6).toFixed(1)}s;--dl:${(i * 0.45).toFixed(1)}s;--s:${2 + (i % 3) * 1.6}px"></div>`).join(''),
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
h1 { font-size: 17px; font-weight: 400; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--dsw-alias-label-caption); margin: 0 0 24px; line-height: 1.75; }
.hint a { color: var(--dsw-alias-button-primary-fill); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(430px, 1fr)); gap: 18px; }
.card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 18px; padding: 14px 18px 18px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 60%, #fff 40%);
}
body[data-ds-dark-theme] .card { background: color-mix(in srgb, var(--dsw-alias-bg-base) 84%, #fff 16%); }
.card h2 { font-size: 13.5px; font-weight: 400; margin: 0 0 2px; }
.note { font-size: 11.5px; color: var(--dsw-alias-label-caption); margin: 0 0 14px; line-height: 1.6; }

/* 模拟右栏 */
.stage {
  position: relative; width: 100%; height: 300px;
  border-radius: 14px; overflow: hidden;
  background: var(--dsw-alias-bg-base);
  border: .5px solid var(--dsw-alias-border-l2);
  isolation: isolate;          /* 隔离混合模式，别串到别的卡片 */
}
.bgw { position: absolute; inset: 0; overflow: hidden; }
.content { position: relative; z-index: 5; height: 100%; padding: 20px 24px; display: flex; flex-direction: column; justify-content: center; gap: 7px; }
.cTitle { font-size: 32px; color: var(--dsw-alias-label-primary); }
.cArtist { font-size: 15px; color: var(--dsw-alias-label-tertiary); }
.cClock { font-size: 46px; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; margin-top: 4px; }
.cLy { font-size: 14px; color: var(--dsw-alias-button-primary-fill); }
.cLy2 { font-size: 12px; color: var(--dsw-alias-label-caption); }

/* ══ 极光：必须先有深底，screen 才有东西可加 ══ */
.aurora .bgw { background: radial-gradient(120% 100% at 20% 10%, #2c1f2e 0%, #191524 45%, #121a24 100%); }
.aurora .aur { position: absolute; width: 170%; height: 170%; top: -35%; left: -35%; border-radius: 50%; filter: blur(52px); mix-blend-mode: screen; }
.aurora .a1 { background: radial-gradient(circle, #ff5f92 0%, rgba(255,95,146,0) 48%); animation: aurMove 8s ease-in-out infinite alternate; }
.aurora .a2 { background: radial-gradient(circle, #3fb8ff 0%, rgba(63,184,255,0) 48%); animation: aurMove 11s ease-in-out infinite alternate-reverse; animation-delay: -2s; }
.aurora .a3 { background: radial-gradient(circle, #a45cf0 0%, rgba(164,92,240,0) 48%); animation: aurMove 14s ease-in-out infinite alternate; animation-delay: -5s; }
@keyframes aurMove {
  0%   { transform: translate(-16%, -12%) rotate(0deg) scale(1) }
  50%  { transform: translate(10%, 6%) rotate(180deg) scale(1.15) }
  100% { transform: translate(18%, 16%) rotate(360deg) scale(1.02) }
}
/* 极光底下文字要用浅色 */
.aurora .cTitle, .aurora .cClock { color: #fff }
.aurora .cArtist { color: rgba(255,255,255,.70) }
.aurora .cLy2 { color: rgba(255,255,255,.58) }

/* ══ 网格渐变：普通混合 + 足够饱和，别糊成白 ══ */
.mesh .bgw { background: #fdf3f7; }
body[data-ds-dark-theme] .mesh .bgw { background: #221a20; }
.mesh .me { position: absolute; width: 58%; height: 58%; border-radius: 50%; filter: blur(38px); opacity: .72; }
body[data-ds-dark-theme] .mesh .me { opacity: .5; filter: blur(44px) }
.mesh .m1 { background: #ff9db8; top: -8%; left: -6%;  animation: me1 12s ease-in-out infinite alternate }
.mesh .m2 { background: #8fd0f5; top: 34%; left: 42%; animation: me2 16s ease-in-out infinite alternate }
.mesh .m3 { background: #c39bf0; top: 56%; left: 6%;  animation: me3 14s ease-in-out infinite alternate }
.mesh .m4 { background: #ffd98f; top: 2%;  left: 50%; animation: me4 18s ease-in-out infinite alternate }
@keyframes me1 { to { transform: translate(26%, 30%) scale(1.2) } }
@keyframes me2 { to { transform: translate(-38%, -20%) scale(.84) } }
@keyframes me3 { to { transform: translate(32%, -26%) scale(1.15) } }
@keyframes me4 { to { transform: translate(-22%, 38%) scale(.9) } }

/* ══ 浮尘 ══ */
.float .fl {
  position: absolute; bottom: -4%; width: var(--s); height: var(--s); border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #fff, #ff9db8);
  box-shadow: 0 0 7px rgba(255,140,175,.85);
  opacity: 0; animation: flRise var(--d) linear infinite; animation-delay: var(--dl);
}
@keyframes flRise {
  0%   { bottom: -4%; opacity: 0; transform: translateX(0) }
  12%  { opacity: .85 }
  50%  { opacity: .4; transform: translateX(18px) }
  88%  { opacity: .8 }
  100% { bottom: 104%; opacity: 0; transform: translateX(-14px) }
}

/* ══ 气泡 ══ */
.bubbles .bu {
  position: absolute; bottom: -90px; width: var(--sz); height: var(--sz); border-radius: 50%;
  /* 浅色底上纯白看不见，所以给一层粉调 + 实一点的描边 */
  background: radial-gradient(circle at 32% 28%, rgba(255,255,255,.95), rgba(255,157,184,.55) 58%, rgba(255,157,184,.22));
  border: 1.5px solid rgba(255,140,175,.7);
  box-shadow: inset 0 0 14px rgba(255,255,255,.9);
  opacity: .8; animation: buRise var(--d) ease-in infinite; animation-delay: var(--dl);
}
@keyframes buRise { 0% { bottom: -90px; transform: translateX(0) } 100% { bottom: 104%; transform: translateX(24px) } }
body[data-ds-dark-theme] .bubbles .bu { opacity: .38; border-color: rgba(255,157,184,.5) }

/* ══ 落樱 ══ */
.petal .pe {
  position: absolute; top: -26px; width: 15px; height: 15px;
  /* 加深一档，浅色底上才看得见 */
  background: linear-gradient(135deg, #ffb8ce, #ff5f8a);
  box-shadow: 0 1px 3px rgba(200,80,120,.25);
  border-radius: 62% 0 62% 0; opacity: .95;
  animation: peFall var(--d) linear infinite; animation-delay: var(--dl);
  transform: scale(var(--sc));
}
@keyframes peFall {
  0%   { top: -26px; opacity: 0 }
  10%  { opacity: .95 }
  50%  { transform: translateX(30px) rotate(200deg) scale(var(--sc)) }
  90%  { opacity: .85 }
  100% { top: 104%; opacity: 0; transform: translateX(-18px) rotate(420deg) scale(var(--sc)) }
}
body[data-ds-dark-theme] .petal .pe { opacity: .55 }

/* ══ 渐变位移 ══ */
.shift .bgw {
  background: linear-gradient(-45deg, #ffe6ee, #ffc9da, #e6d6f7, #cfeaf9, #ffe6ee);
  background-size: 420% 420%; animation: shMove 20s ease infinite;
}
@keyframes shMove { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
body[data-ds-dark-theme] .shift .bgw {
  background: linear-gradient(-45deg, #2b1f26, #3d2a35, #2c2438, #1e2a34, #2b1f26);
  background-size: 420% 420%;
}

/* ══ 落雪 ══ */
.snow .sn {
  position: absolute; top: -14px; width: var(--s); height: var(--s); border-radius: 50%;
  background: #fff; box-shadow: 0 0 5px rgba(255,255,255,.95);
  opacity: 0; animation: snFall var(--d) linear infinite; animation-delay: var(--dl);
}
@keyframes snFall {
  0%   { top: -14px; opacity: 0; transform: translateX(0) }
  12%  { opacity: .95 }
  50%  { opacity: .55; transform: translateX(14px) }
  88%  { opacity: .9 }
  100% { top: 104%; opacity: 0; transform: translateX(-12px) }
}
body:not([data-ds-dark-theme]) .snow .sn { background: #fff; box-shadow: 0 0 6px rgba(180,205,230,.95) }

.switch {
  position: fixed; top: 16px; right: 16px; z-index: 9;
  display: flex; gap: 6px; padding: 5px; border-radius: 999px;
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

const cards = EFFECTS.map((e, i) => `
<section class="card fx ${e.key}" data-i="${i + 1}">
  <h2>${i + 1}. ${e.name}</h2>
  <p class="note">${e.note}</p>
  <div class="stage">
    <div class="bgw"></div>
    ${e.body}
    <div class="content">
      <div class="cTitle">书夏意</div>
      <div class="cArtist">以冬</div>
      <div class="cClock">18:41:18</div>
      <div class="cLy">留此刻 与夏夜老去</div>
      <div class="cLy2">街巷口跑过的女儿家 才把青梅嗅罢</div>
    </div>
  </div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>右侧背景动效 · 样张</title>
<style>
@font-face { font-family: 'KN Maiyuan'; src: url('../assets/fonts/theme/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; display: swap; }
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

<h1>右侧背景动效 · ${EFFECTS.length} 种</h1>
<p class="hint">
  每种套在模拟右栏（<b>460×330</b>）里，叠上歌名/大钟/歌词的真实文字 —— 这样才能看出<b>背景会不会干扰阅读</b>。<br>
  切右上角看亮/暗两套。参考：<a href="https://abduarrahman.com/blog/css-background-animations-10-effects/">CSS Background Animations — 10 Atmospheric Effects</a>
</p>
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

const out = join(ROOT, 'labs', 'bg-lab.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB, ${EFFECTS.length} 种)`)
