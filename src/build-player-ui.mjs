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
import { timerModuleSource } from './timer-inline.mjs'
import { liveModuleSource } from '../overlay/src/live-inline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
/** 页面输出到项目根（和 assets/ 同级，相对路径才好写）。 */
const OUT_HTML = join(ROOT, 'player-ui.html')
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

/**
 * 发光描边：内圈细描边（让字从背景里跳出来）+ 外层柔光（光晕）。
 *
 * 和内联的 "ring" 不是一回事：ring 是**实心**环绕（八向偏移 0 模糊），
 * 这里外层用**带模糊**的 shadow 才会柔，像灯牌。
 *
 * @param {string} color 光色
 * @param {string} core 内描边色（亮色底用白，暗色底用深色）
 */
function glowInk(color, core) {
  const ring = ringShadow(core, 1.6)
  return [
    ring,
    `0 0 8px ${color}`,
    `0 0 18px color-mix(in srgb, ${color} 55%, transparent)`,
    `0 0 32px color-mix(in srgb, ${color} 28%, transparent)`,
  ].join(', ')
}

/** 四种状态的显示色（发光就用这个色）。 */
const STATE_COLORS = {
  study: '#ef7d9a',
  fun: '#4a9e74',
  out: '#d99a3c',
  sleep: '#d24b5b',
}

/** 构建时算好的四种状态发光串。 */
const STATE_CSS = {
  light: Object.fromEntries(Object.entries(STATE_COLORS).map(([k, c]) => [k, glowInk(c, 'rgba(255,255,255,.9)')])),
  dark: Object.fromEntries(Object.entries(STATE_COLORS).map(([k, c]) => [k, glowInk(c, 'rgba(30,24,28,.85)')])),
}
/** 暂停时的发光（琥珀色，和任何状态都区分得开）。 */
const PAUSE_CSS = {
  light: { color: '#d99a3c', glow: glowInk('#d99a3c', 'rgba(255,255,255,.9)') },
  dark: { color: '#e8b47a', glow: glowInk('#e8b47a', 'rgba(30,24,28,.85)') },
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

/**
 * 装饰层变量。
 *
 * 原来有素/柔/满三档，后来定稿只保留「满」——实际用起来那点差异不值一个开关，
 * 少一个选项界面更清爽。函数保留 scheme 参数，因为亮/暗两套的浓度不同。
 */
function decorVars(scheme) {
  const dark = scheme === 'dark'
  const accent = dark ? '#f7a8b8' : '#ef7d9a'
  const accent2 = dark ? '#8ed6ae' : '#5fb98a'
  return {
    '--decor-grain': `${GRAIN}, ${DOTS}`,
    '--decor-grain-opacity': dark ? '0.08' : '0.09',
    '--decor-blend': dark ? 'screen' : 'multiply',
    '--decor-blob-opacity': dark ? '0.85' : '1',
    '--decor-blob-1': `color-mix(in srgb, ${accent} 30%, transparent)`,
    '--decor-blob-2': `color-mix(in srgb, ${accent2} 24%, transparent)`,
    '--decor-blob-3': `color-mix(in srgb, ${accent} 12%, transparent)`,
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
/* body 不设 padding、不居中：界面要**无条件铺满视口**。
   之前有 padding: 28px + flex 居中，加卡片限宽，结果 F11 全屏后
   卡片被挤到中间，两侧露出背景色 —— 又是一条"分界线"（用户反馈）。
   现在 body 直接铺满，卡片也不限宽，任何窗口尺寸下都是全覆盖。 */
body {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  /* 界面默认字体（档位提示等）用主题字体 */
  font-family: var(--font-ui, 'KN Maiyuan'), 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

/* ── 界面本体：铺满视口，不做卡片 ──
   背景分三层，铺满整个卡片（不再左一块右一块）：
     ① .card 自身的底色渐变 —— 连续的柔光，不分成两栏
     ② .fx 网格渐变 + 落雪
     ③ .left / .right 两栏内容（透明背景）
   曾经左栏有自己的底色、右栏直接是 --bg-base，中间就出现了一条竖直分界线。 */
.card {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 46% 1fr;
  gap: 0;
  background: var(--dsw-alias-bg-base);
}
/* ① 底色层：横向连续的柔光渐变，左右不分家 */
.card::before {
  content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(58% 78% at 22% 30%, color-mix(in srgb, var(--dsw-alias-button-primary-fill) 12%, transparent) 0%, transparent 66%),
    radial-gradient(52% 70% at 82% 72%, color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent) 0%, transparent 64%),
    linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 92%, #fff) 0%, var(--dsw-alias-bg-base) 100%);
}
/* 装饰颗粒与光斑：也铺满整卡，不再局限一栏 */
.card::after {
  content: ''; position: absolute; inset: -20%; z-index: 0; pointer-events: none;
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
/* 颗粒纹理单独一层（用 ::before 会和底色冲突） */
.grain {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background-image: var(--decor-grain, none);
  background-size: 120px 120px;
  opacity: var(--decor-grain-opacity, 0);
  mix-blend-mode: var(--decor-blend, normal);
}
/* 整卡渐隐层：铺满整个卡片，上下轻微压暗 + 左缘略沉。
   和原来分栏那两条伪元素的区别是——它是**一整张**，没有"到某处突然结束"
   的边界，所以不会在任何地方留下竖直分界线。 */
.vignette {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--dsw-alias-bg-base) 26%, transparent) 0%,
      transparent 16%, transparent 84%,
      color-mix(in srgb, var(--dsw-alias-bg-base) 30%, transparent) 100%),
    linear-gradient(90deg,
      color-mix(in srgb, var(--dsw-alias-bg-base) 12%, transparent) 0%,
      transparent 22%);
}

/* ── 壁纸层（遮罩铺满整卡，但画面区域仍是"原来那条 46% 宽的竖带"） ──
   为什么要这么绕：
     · 原来壁纸放在 .left（46% 宽的栏）里，椭圆遮罩到栏边界只衰减到约 0.5，
       被栏边界一刀切断 —— 像素实测 x=662 处有 18 单位的台阶（那条分界线）。
     · 修法是把遮罩放到卡片级别（能自由淡出），但画面区域必须保持 46% 宽，
       否则 object-fit: cover 的裁切比例变了，铃兰的大小/位置也跟着变。
   所以：画面容器 .heroArt 仍是 46% 宽的竖带（和原来一模一样），
   遮罩挂在外层 .hero（铺满整卡）上 —— 既不分栏裁断，铃兰大小也不变。 */
.hero {
  position: absolute; inset: 0; z-index: 2;
  pointer-events: none;
  overflow: hidden;
  /* 竖椭圆渐隐：中心不透明，往外一路淡到全透明。
     圆心和半径由 fitHero() 按卡片尺寸算（--hero-*） */
  -webkit-mask-image: radial-gradient(ellipse var(--hero-rx) var(--hero-ry) at var(--hero-x) var(--hero-y),
    #000 0%, #000 34%, rgba(0,0,0,.86) 50%, rgba(0,0,0,.5) 64%, rgba(0,0,0,.2) 78%, rgba(0,0,0,.05) 90%, transparent 100%);
  mask-image: radial-gradient(ellipse var(--hero-rx) var(--hero-ry) at var(--hero-x) var(--hero-y),
    #000 0%, #000 34%, rgba(0,0,0,.86) 50%, rgba(0,0,0,.5) 64%, rgba(0,0,0,.2) 78%, rgba(0,0,0,.05) 90%, transparent 100%);
}
/* 画面区域：和原来的左栏等宽等高，保证铃兰的裁切比例不变 */
.heroArt {
  position: absolute;
  left: 0; top: 0;
  width: 46%; height: 100%;
}
.hero .bgVid {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: 50% 42%;   /* 和原来看起来一致 */
  display: block;
  /* 淡入淡出要慢，才有"天色渐变"的感觉，不能像开关 */
  transition: opacity 1.2s var(--ds-ease);
}
.hero .bgDay { opacity: 1; }
.hero .bgNight { opacity: 0; }
/* 暗色主题：露出夜晚那版 */
body[data-ds-dark-theme] .hero .bgDay { opacity: 0; }
body[data-ds-dark-theme] .hero .bgNight { opacity: 1; }
/* 没有视频时退回封面占位 */
.cover {
  position: relative; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #ffd0dc, #ffb3c6 55%, #c9a7e8);
}
.cover svg { display: block; width: 100%; height: 100%; }
/* 左栏右缘柔化、上下压暗：**已删除**。
 *
 * 原来这里有两条伪元素（.left::after / .left::before），把左栏自己的右缘
 * 渐变成不透明的 --bg-base（近白）、上下压暗。问题在于它们是**按栏**渲染的：
 * 渐变到 100% 就是实色，到下一条规则突然结束，于是在 46% 处留下一条硬边。
 * 用户排查得很准——"两侧渲染逻辑不一样"。
 *
 * 现在改成整卡一张连续的压暗层（见 .card::after 之后的 .vignette），
 * 不再分栏，从根上没有边界。 */

/* ── 背景动效（铺满整个界面：网格渐变 + 落雪） ──
   原来只铺右栏，但那样只有半边在动，看着突兀。现在铺满整个 .card，
   左边压在壁纸上（增加氛围），右边就是主背景。
   要点：
     · 绝对定位铺满 .card，压在 .left / .right 之下
     · .left / .right 必须抬到它上面（见下面各自的 z-index）
     · 不吃鼠标事件
     · isolation: isolate 把混合模式关在本层内 */
.fx {
  position: absolute; inset: 0; z-index: 2;
  overflow: hidden; pointer-events: none;
  isolation: isolate;
}

/* 网格渐变：四个色团缓慢游走。用普通混合 + 足够饱和，别糊成白
   （mix-blend-mode: screen 在浅色底上会把颜色推向白色，看不见） */
.fxMesh { position: absolute; inset: 0; }
.fxMesh .fm {
  position: absolute; width: 58%; height: 58%; border-radius: 50%;
  filter: blur(46px); opacity: .5;
}
.fxMesh .fm1 { background: #ff9db8; top: -6%; left: -6%;  animation: fmA 13s ease-in-out infinite alternate }
.fxMesh .fm2 { background: #8fd0f5; top: 32%; left: 40%; animation: fmB 17s ease-in-out infinite alternate }
.fxMesh .fm3 { background: #c39bf0; top: 58%; left: 4%;  animation: fmC 15s ease-in-out infinite alternate }
.fxMesh .fm4 { background: #ffd98f; top: 2%;  left: 48%; animation: fmD 19s ease-in-out infinite alternate }
@keyframes fmA { to { transform: translate(26%, 30%) scale(1.2) } }
@keyframes fmB { to { transform: translate(-34%, -18%) scale(.86) } }
@keyframes fmC { to { transform: translate(30%, -24%) scale(1.14) } }
@keyframes fmD { to { transform: translate(-20%, 36%) scale(.9) } }
body[data-ds-dark-theme] .fxMesh .fm { opacity: .34; filter: blur(54px) }

/* 落雪：雪点从上方飘落，带轻微左右漂移 */
.fxSnow { position: absolute; inset: 0; }
.fxSnow i {
  position: absolute; top: -14px;
  width: var(--s); height: var(--s); border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 5px rgba(160,195,225,.9);
  opacity: 0;
  animation: snFall var(--d) linear infinite;
  animation-delay: var(--dl);
  will-change: transform, top;
}
@keyframes snFall {
  0%   { top: -14px; opacity: 0; transform: translateX(0) }
  12%  { opacity: .95 }
  50%  { opacity: .5; transform: translateX(16px) }
  88%  { opacity: .88 }
  100% { top: 104%; opacity: 0; transform: translateX(-12px) }
}
body[data-ds-dark-theme] .fxSnow i { background: #eaf4ff; box-shadow: 0 0 6px rgba(200,225,255,.95) }

/* 开关：默认全关（none），由设置里的"背景动效"控制 */
.fx .fxMesh { display: none; }
.fx .fxSnow { display: none; }
.fx[data-fx="mesh"] .fxMesh { display: block; }
.fx[data-fx="snow"] .fxSnow { display: block; }
.fx[data-fx="both"] .fxMesh,
.fx[data-fx="both"] .fxSnow { display: block; }

/* ── 右：内容区 ──
   层级关系（都在 .card 里）：
     0  底色渐变
     1  颗粒纹理
     2  背景动效（.fx，网格 + 落雪）
     3  左右两栏内容（.left / .right）
     21 状态滑块、铃兰按钮
     40 主题切换的过渡快照
   注意：.right 上的 z-index 必须低于 .fx，所以这里是 3；
   早期把它设成 1 又把 .fx 设成 0，结果 .fx 被盖住看不见。 */
.right {
  position: relative; z-index: 3;
  display: flex; flex-direction: column;
  padding: 26px 30px 22px 28px;
  min-width: 0; min-height: 0;
}

/* 尺寸变量：由 JS 按右栏实际宽度算，保证不同窗口下都"排得满"。
   参考图比例：封面边长 ≈ 38% 右栏宽；歌名 ≈ 4.8%；大钟 ≈ 85% 右栏高内。

   挂在 :root 上而不是 .right——表情按钮在 body 下，不在 .right 里，
   挂 .right 的话它取不到 --w，宽度会算成 0（踩过）。

   字号：歌名/状态/歌手/歌词是用户定稿的定值（1440 宽窗口、原字体下量的）。
   但换成荆南波波黑后字变宽了：100px 的「21:43:03」宽 499px、50px 的
   「2026/9/10」宽 319px，加起来 834px 塞不进 689px。所以大钟与日期改成
   按栏宽推导，解得大钟系数 ≈ 0.111（两者 + 间距 ≤ 0.94 × --w）。 */
:root {
  --w: 640px;
  --cover: calc(var(--w) * 0.38);
  --fs-title: 70px;
  --fs-clock: calc(var(--w) * 0.111);
  --fs-state: 60px;
  --fs-date: calc(var(--fs-clock) * 0.46);
  --fs-artist: 40px;
  --fs-lyNow: 30px;
  --fs-lySide: 17px;

  --font-title: 'Black Sugar Plum Candy', 'Microsoft YaHei', sans-serif;
  --font-clock: 'KN Bobohei', 'Microsoft YaHei', sans-serif;
  --font-lyric: 'ZCOOL KuaiLe', 'Microsoft YaHei', sans-serif;
}
.right {
  min-width: 0; min-height: 0;
}
/* 内容块统一抬到动效层之上 */
.stage, .meta, .lyrics { position: relative; z-index: 1; }

/* 切换过渡期间：把实时动效层整个藏掉。
   为什么必须藏：快照里已经有一份"冻结"的动效画面，如果实时动效还在上面继续画，
   就会把扩散的痕迹盖住——用户反馈"只能在铃兰的透明区才看到切换痕迹"，就是这个原因。
   藏掉之后，屏幕上只有"旧快照淡出 + 新画面露出"，过渡就看得很清楚。 */
.card.switching .fx,
.card.switching .grain,
.card.switching .card-decor { visibility: hidden; }

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
  font-family: var(--font-title);
  font-size: var(--fs-title); line-height: 1.15; font-weight: 400;
  color: var(--ink-title-fill);
  text-shadow: var(--ink-title-ring);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trackArtist {
  font-family: var(--font-title);
  font-size: var(--fs-artist); line-height: 1.3;
  color: var(--ink-artist-fill);
  text-shadow: var(--ink-artist-ring);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 状态与计时：发光描边（内描边 + 外层柔光，光色跟着状态走） */
.tState {
  font-family: var(--font-clock);
  font-size: var(--fs-state); line-height: 1.28; letter-spacing: .03em;
  color: var(--state-color);
  text-shadow: var(--state-glow);
}
.tMark {
  font-family: var(--font-clock);
  font-size: var(--fs-state); line-height: 1.28; font-variant-numeric: tabular-nums;
  color: var(--state-color);
  text-shadow: var(--state-glow);
}

/* 第二行：大钟 + 日期 */
.clockRow {
  display: flex; align-items: baseline; gap: calc(var(--w) * 0.024);
  /* 时钟行不许溢出：日期太长就截断，别把整行撑出去 */
  min-width: 0;
}
.tTime {
  font-family: var(--font-clock);
  font-size: var(--fs-clock); line-height: 1; font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--ink-clock-fill);
  text-shadow: var(--ink-clock-ring);
  letter-spacing: .01em;
  flex: none;
}
.tDate {
  font-family: var(--font-clock);
  font-size: var(--fs-date); font-variant-numeric: tabular-nums;
  color: var(--ink-date-fill);
  text-shadow: var(--ink-date-ring);
  letter-spacing: .02em;
  min-width: 0; overflow: hidden; white-space: nowrap;
}

/* ── 律动频谱 ──
   说明：拿不到系统音频流（QQ 音乐的声音不经过本页），所以这不是真频谱，
   而是"播放中就有律动"的拟态动画：多组不同频率/相位的正弦叠加，
   做出起伏自然的波形。暂停时压平、切歌时打一次脉冲。 */
.viz {
  flex: none;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 3px;
  height: calc(var(--w) * 0.058);
  min-height: 22px;
  margin-bottom: calc(var(--w) * 0.016);
  /* 左右两端淡出，不做成硬邦邦一根长条 */
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 6%, #000 94%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0%, #000 6%, #000 94%, transparent 100%);
}
/* 柱子必须有确定高度才能 transform 出可见高度：
   显式给 height:100%，不靠 flex 拉伸，避免被压成 0 */
.viz span {
  flex: 1 1 0; min-width: 2px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-state-success-primary) 80%, #fff),
    var(--dsw-alias-button-primary-fill));
  transform-origin: bottom center;
  transform: scaleY(.12);
  will-change: transform;
  transition: opacity .4s var(--ds-ease);
}
.card:not(.playing) .viz span { opacity: .38; }

/* ── 右下角：铃兰表情按钮（点开设置） ──
   两张表情叠加，靠透明度切换：
     · 舒展（站立高）→ 睁眼
     · 压缩（半高）  → 闭眼
   节奏由播放状态 + 正弦驱动，细节见 updateExpression()。 */
.mascot {
  position: fixed;
  right: calc(var(--w) * 0.035);
  bottom: calc(var(--w) * 0.018);
  /* 宽度要能被内容撑开：button 是 inline 语义，光靠子元素 aspect-ratio
     撑不起父级尺寸（实测宽度 0）。所以两层都给确定宽度。 */
  width: calc(var(--w) * 0.125);
  z-index: 21;
  border: 0; padding: 0; background: transparent; cursor: pointer;
  transform-origin: 50% 100%;
  -webkit-tap-highlight-color: transparent;
  display: block;
}
.mascot .mStack {
  position: relative; display: block;
  width: 100%; height: calc(var(--w) * 0.125);
  transform-origin: 50% 100%;
  /* 高度压缩靠 scaleY；transform-origin 在底部，压下去像"蹲一下" */
  will-change: transform;
}
.mascot img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: contain;
  pointer-events: none;
  transition: opacity .09s linear;
}
.mascot .mOpen { opacity: 1; }
.mascot .mClosed { opacity: 0; }
.mascot.squash .mOpen { opacity: 0; }
.mascot.squash .mClosed { opacity: 1; }
/* hover 时轻轻放大，提示可点 */
.mascot:hover .mStack { filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--dsw-alias-button-primary-fill) 45%, transparent)); }
/* 焦点可见性（键盘 Tab 时） */
.mascot:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: 4px; border-radius: 18px; }

/* ── 主题切换的过渡层 ──
   早期版本是"新主题纯色铺满 + 径向遮罩推开"，结果扩散期间整个屏幕是
   一块纯色、内容全没了（用户反馈"炸掉重载"）。
   现在改成：把当前画面**克隆一份**盖在上面当旧画面，底下真页面切成新主题，
   然后让旧画面从右下角小铃兰处向外淡出 —— 全程都有内容。
   遮罩由 JS 每帧写（半径从 0 推到对角线长度）。 */
.reveal {
  position: absolute; inset: 0;
  z-index: 40;            /* 压在所有内容之上；动画只 0.7s，且过渡期无需交互 */
  pointer-events: none;
  overflow: hidden;
}
.reveal[hidden] { display: none; }
.reveal .snap {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  overflow: hidden;
}
/* 快照里的动画停掉——静态够用，还省性能 */
.reveal .snap *,
.reveal .snap *::before,
.reveal .snap *::after { animation-play-state: paused !important; }
/* 快照用海报帧就够，避免双份视频解码 */
.reveal .snap video { visibility: hidden; }

/* ── 状态滑块（右下角，铃兰左边） ──
   四档命名借了 ChatGPT 的星座/行星思路，强度从左到右递增：
     luna 睡觉（红） → terra 外出（琥珀） → sol 娱乐（绿） → astra 学习（粉）
   只留一条滑轨（去掉了外框、两端文字、右侧文案），拖动或点击换档。

   灵敏度：视觉上轨道只有 7px 高，但**可点/可拖区域做成 34px 高**，
   不然很难点中。做法是给 .ssTrack 加透明 padding（background-clip 只画中间那条）。 */
.stateSlider {
  position: fixed;
  right: calc(var(--w) * 0.035 + var(--w) * 0.125 + 18px);
  /* 下界和右下角铃兰对齐：铃兰是 bottom: calc(--w*0.018)，高度 --w*0.125 */
  bottom: calc(var(--w) * 0.018);
  z-index: 21;
  /* 整块都可交互，但视觉上只有滑轨 */
  padding: 14px 0;
  display: flex; align-items: center;
  touch-action: none;            /* 触屏上拖滑块不要滚动页面 */
}
.stateSlider .ssWrap {
  position: relative;
  display: flex; flex-direction: column; align-items: center;
  padding-top: 15px;
}
/* 档位名：均匀分布在轨道上方（很小很淡，只做提示） */
.stateSlider .ssNames {
  position: absolute; top: 0; left: 0; right: 0;
  height: 13px;
  pointer-events: none;
}
.stateSlider .ssNames span {
  position: absolute; transform: translateX(-50%);
  font-size: 9px; letter-spacing: .05em;
  color: var(--dsw-alias-label-caption);
  opacity: .5;
  transition: color .25s var(--ds-ease), opacity .25s var(--ds-ease);
  white-space: nowrap;
}
.stateSlider .ssNames span.on { color: var(--ss-color); opacity: 1 }

/* 滑轨：四色渐变 */
.stateSlider .ssTrack {
  position: relative;
  width: var(--ss-w, 190px); height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg,
    #d24b5b 0%, #d24b5b 8%,
    #d99a3c 36%,
    #4a9e74 64%,
    #ef7d9a 92%, #ef7d9a 100%);
  box-shadow: inset 0 0 0 .5px rgba(0,0,0,.08),
              0 1px 4px rgba(0,0,0,.10);
  cursor: pointer;
}
/* 扩大命中区：伪元素向外扩一圈透明的，视觉不变但好点得多 */
.stateSlider .ssTrack::before {
  content: ''; position: absolute;
  left: 0; right: 0; top: -15px; bottom: -15px;
  border-radius: 999px;
}
/* 滑块头 */
.stateSlider .ssThumb {
  position: absolute; top: 50%; left: 0;
  width: 20px; height: 20px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--dsw-alias-button-floating-fill);
  border: 3.5px solid var(--ss-color, #ef7d9a);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ss-color) 50%, transparent),
              0 0 0 3px color-mix(in srgb, var(--ss-color) 20%, transparent);
  pointer-events: none;
  transition: left .28s cubic-bezier(.34,1.4,.64,1), border-color .25s var(--ds-ease), box-shadow .25s var(--ds-ease);
}
/* 拖动中：去掉过渡跟手，滑块头放大一点 */
.stateSlider.dragging .ssThumb {
  transition: border-color .25s var(--ds-ease), box-shadow .25s var(--ds-ease);
  width: 24px; height: 24px;
}

/* ── 进度条 + 时间（渐变胶囊） ── */
.meta { flex: none; }
.bar {
  position: relative; height: 6px; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover-solid);
}
/* 已播部分：粉 → 薄荷绿渐变（和设置的"渐变胶囊"皮肤一致） */
.bar i {
  position: absolute; inset: 0 auto 0 0; width: 0%;
  border-radius: 999px;
  background: linear-gradient(90deg,
    var(--dsw-alias-button-primary-fill),
    color-mix(in srgb, var(--dsw-alias-state-success-primary) 85%, #fff));
  transition: width .25s linear;
}
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
.timeRow {
  display: flex; justify-content: space-between; margin-top: 6px;
  font-size: 10.5px; font-variant-numeric: tabular-nums;
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

/* 设置面板已移除：剩下的唯一设置是明暗，改成点右下角铃兰直接切 */

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
@font-face { font-family: 'KN Maiyuan'; src: url('./assets/fonts/theme/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
/* 歌名 / 歌手 —— 黑糖话梅（软萌体，字面饱满） */
@font-face { font-family: 'Black Sugar Plum Candy'; src: url('./assets/fonts/cute/black-sugar-plum-candy/BlackSugarPlumCandy-Bold.ttf') format('truetype'); font-weight: 400 700; font-display: swap; }
/* 状态 / 计时 / 时间日期 —— 荆南波波黑（手写黑体，字面满） */
@font-face { font-family: 'KN Bobohei'; src: url('./assets/fonts/cute/kn-bobohei/KNBobohei-Bold.ttf') format('truetype'); font-weight: 400 700; font-display: swap; }
/* 歌词 —— 站酷快乐体（糖果包装美术字） */
@font-face { font-family: 'ZCOOL KuaiLe'; src: url('./assets/fonts/cute/zcool-kuaile/ZCOOLKuaiLe-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
</style>
<style>
/* ══════════ 省电：按状态冻结动画 ══════════

   背景（实测数据）：
     频谱每帧写 91 个 DOM，占约 4.6ms/帧；CSS 动画（4 个 blur(46px) 浮动层
     + 18 个雪花 + breathe）再占 2.3ms。而这套东西**在没听歌时也一直在跑**。

     更关键的是：光停 rAF 没用。试过把两个 rAF 循环停掉，界面照样跑到
     158fps —— 因为 CSS 动画跑在**合成器线程**上，JavaScript 管不着。
     所以必须用 animation-play-state 冻住它们。

   怎么冻：只加一条 animation-play-state: paused。
     **所有元素照常渲染，只是停在当前姿态** —— 不隐藏、不删、不改布局，
     所以"保留当前所有元素"这条是满足的。

   什么时候冻：暂停播放 / 被窗口遮挡 / 息屏 / 锁屏。
     正在播放时一切照旧，视觉与之前完全一致。

   为什么不做"降速"而是"冻住"：
     降速要把每个动画的时长都改一遍（13s/17s/15s/19s/7s/16s…），
     改动面大还容易漏；冻住只要一条规则，而且暂停时界面本来就该静下来。 */

html.sz-frozen *,
html.sz-frozen *::before,
html.sz-frozen *::after {
  animation-play-state: paused !important;
}
/* 过渡也停掉：冻结状态下没人在操作，留着只是空转 */
html.sz-frozen .vignette,
html.sz-frozen .card,
html.sz-frozen .mStack {
  transition: none !important;
}
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

<!-- 右下角铃兰表情：点一下切明暗。睁眼/闭眼两张叠加，随节奏切换 -->
<button class="mascot" id="mascot" title="切换明暗" aria-label="切换明暗主题">
  <span class="mStack">
    <img class="mOpen" src="./assets/character/expressions/open.gif" alt="">
    <img class="mClosed" src="./assets/character/expressions/closed.gif" alt="">
  </span>
</button>

<!-- 状态滑块：铃兰左边，只留一条滑轨。左右拖动调档，强度从左到右递增
     luna 睡觉 → terra 外出 → sol 娱乐 → astra 学习 -->
<div class="stateSlider" id="stateSlider">
  <div class="ssWrap" id="ssWrap">
    <div class="ssNames" id="ssNames"></div>
    <div class="ssTrack" id="ssTrack">
      <div class="ssThumb" id="ssThumb"></div>
    </div>
  </div>
</div>

<div class="card">
  <!-- 颗粒纹理层（铺满整卡） -->
  <div class="grain" aria-hidden="true"></div>
  <!-- 整卡渐隐层（铺满整卡，替代原来分栏的 .left::before/::after） -->
  <div class="vignette" aria-hidden="true"></div>

  <!-- 背景动效层：铺满整个界面，压在内容之下。
       固定为"网格渐变 + 落雪"叠加，不再做成开关。 -->
  <div class="fx" id="fx" data-fx="both" aria-hidden="true">
    <div class="fxMesh">
      <div class="fm fm1"></div><div class="fm fm2"></div><div class="fm fm3"></div><div class="fm fm4"></div>
    </div>
    <div class="fxSnow" id="fxSnow"></div>
  </div>

  <!-- 主题切换的过渡层：旧画面淡出，新画面从右下角铃兰处扩散推开 -->
  <div class="reveal" id="reveal" hidden></div>

  <!-- 壁纸层：铺满整卡，用竖椭圆遮罩以铃兰为中心向外淡出。
       放在卡片级别（不再放在左栏里）——否则椭圆在 46% 处被栏边界裁断，
       会留下一条竖直分界线。 -->
  <div class="hero" id="hero">
    <!-- 画面区域保持 46% 宽（和原来的左栏一致），铃兰的裁切比例不变；
         遮罩挂在外层 .hero（铺满整卡），所以能自由淡出、不被栏边界裁断。 -->
    <div class="heroArt" id="heroArt">
      <video id="bgDay" class="bgVid bgDay" autoplay loop muted playsinline preload="auto"
             poster="./assets/wallpaper/poster_day.jpg">
        <source src="./assets/wallpaper/suzuran_yukihare_34_day.mp4" type="video/mp4">
      </video>
      <video id="bgNight" class="bgVid bgNight" autoplay loop muted playsinline preload="auto"
             poster="./assets/wallpaper/poster_night.jpg">
        <source src="./assets/wallpaper/suzuran_yukihare_34_night.mp4" type="video/mp4">
      </video>
    </div>
  </div>

  <div class="left"></div>

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

    <!-- 律动频谱：时钟下方到进度条之间 -->
    <div class="viz" id="viz" aria-hidden="true"></div>

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
const LIGHT_T = ${JSON.stringify(LIGHT)}
const DARK_T = ${JSON.stringify(DARK)}
const FLOWER = ${JSON.stringify(FLOWER)}
const DECOR = ${JSON.stringify({
  light: decorVars('light'),
  dark: decorVars('dark'),
})}
const RING = ${JSON.stringify({
  light: { thick: ring(FLOWER.light.stroke, 2.2), thin: ring(FLOWER.light.stroke, 1.5) },
  dark: { thick: ring(FLOWER.dark.stroke, 2.2), thin: ring(FLOWER.dark.stroke, 1.5) },
})}
const INK_CSS = ${JSON.stringify(INK_CSS)}
const STATE_COLORS = ${JSON.stringify(STATE_COLORS)}
const STATE_CSS = ${JSON.stringify(STATE_CSS)}
const PAUSE_CSS = ${JSON.stringify(PAUSE_CSS)}

let scheme = 'light'
let painted = []

/**
 * 【调试开关】是否显示左侧铃兰壁纸。
 *
 * 排查界面层次问题时可以关掉（左栏只剩纯背景）。
 * 注意这个开关对应的是**隐藏已有的 .hero 元素**，不是从模板挂载。
 */
const SHOW_HERO = true

function paint() {
  const body = document.body
  for (const n of painted) body.style.removeProperty(n)
  painted = []
  const theme = THEMES[scheme]
  document.documentElement.style.colorScheme = scheme
  body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
  for (const [k, v] of Object.entries(theme.tokens)) { body.style.setProperty(k, v); painted.push(k) }

  // 界面文字分三套字体（用户指定）：
  //   歌名/歌手 → 黑糖话梅    状态/计时/时间日期 → 荆南波波黑    歌词 → 站酷快乐体
  // 这些都在 CSS 里用 --font-title / --font-clock / --font-lyric 指定，
  // 这里只留一个界面默认字体（档位按钮、提示文字）。
  const ui = "'KN Maiyuan', 'Microsoft YaHei', sans-serif"
  body.style.setProperty('--font-ui', ui); painted.push('--font-ui')
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

  for (const [k, v] of Object.entries(DECOR[scheme])) { body.style.setProperty(k, v); painted.push(k) }
}

/**
 * 切到指定主题。扩散动画的落点是**右下角那只小铃兰**（不是左边的大立绘）——
 * 小铃兰就是开关本身，从它身上扩散出去最自然。
 */
function switchScheme(to) {
  if (to === scheme) return
  revealTheme(to, () => {
    scheme = to
    paint()
    renderTimer(timer.snapshot())   // 发光串分亮/暗两套，换主题要重画
    applySchemeSideEffects()
  })
}

// 点右下角铃兰 = 切明暗（设置面板已移除，这是唯一设置入口）
const mascot = document.getElementById('mascot')
mascot.addEventListener('click', (e) => {
  e.stopPropagation()
  switchScheme(scheme === 'light' ? 'dark' : 'light')
})

addEventListener('keydown', (e) => {
  if (e.key === 'd') switchScheme(scheme === 'light' ? 'dark' : 'light')
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
const elStateSlider = document.getElementById('stateSlider')
const elThumb = document.getElementById('ssThumb')
const elSsNames = document.getElementById('ssNames')
const elSsTrack = document.getElementById('ssTrack')
const elSsWrap = document.getElementById('ssWrap')
/* 右侧状态文案、两端档位名都已移除，DOM 里不再有对应元素 */

/**
 * 四种状态。
 * 档位名借用了 ChatGPT 那套星座/行星的命名思路，**强度从左到右递增**：
 *   luna 睡觉 → terra 外出 → sol 娱乐 → astra 学习
 * 显示文案统一用「…ing」（用户要求，比「…中」俏皮）。
 */
const MODES = {
  study: { label: '学习ing', tier: 'astra' },
  fun: { label: '娱乐ing', tier: 'sol' },
  out: { label: '外出ing', tier: 'terra' },
  sleep: { label: '睡觉ing', tier: 'luna' },
}

/** 滑块的档位顺序（左→右）。索引就是滑块位置。 */
const TIERS = ['luna', 'terra', 'sol', 'astra']
const TIER_MODES = ['sleep', 'out', 'fun', 'study']   // 与 TIERS 一一对应
/** 各档主题色（与 STATE_COLORS 同源，按 TIERS 顺序）。 */
const TIER_COLORS = ['#d24b5b', '#d99a3c', '#4a9e74', '#ef7d9a']

const timer = createTimer({ mode: 'study', onChange: renderTimer })

/** 渲染一次。 */
function renderTimer(s) {
  // 大钟：系统时间（h:mm:ss）
  elTime.textContent = formatDuration(nowSeconds())
  // 已计时长，带 + 号
  elMark.textContent = '+' + formatDuration(s.seconds)
  elDate.textContent = formatDate(Date.now())

  const m = MODES[s.mode] ?? MODES.study
  // 暂停时把 ing 换成 已暂停：学习ing → 学习已暂停
  elState.textContent = s.status === 'paused' ? m.label.replace('ing', '已暂停') : m.label

  // 发光：暂停用琥珀色，否则用当前状态色
  const isPaused = s.status === 'paused'
  const st = isPaused ? PAUSE_CSS[scheme] : null
  const color = isPaused ? st.color : STATE_COLORS[s.mode]
  const glow = isPaused ? st.glow : STATE_CSS[scheme][s.mode]
  elState.style.color = color
  elMark.style.color = color
  elState.style.textShadow = glow
  elMark.style.textShadow = glow

  elStage.classList.toggle('paused', isPaused)

  // 滑块：位置、颜色、档位名高亮
  const idx = Math.max(0, TIERS.indexOf(m.tier))
  elStateSlider.style.setProperty('--ss-color', color)
  elThumb.style.left = (idx * 33.333).toFixed(2) + '%'
  for (const sp of elSsNames.children) {
    sp.classList.toggle('on', sp.dataset.n === m.tier)
  }
}

/** 当前时刻换算成"当天零点起的秒数"，交给 formatDuration 渲染成 h:mm:ss。 */
function nowSeconds() {
  const d = new Date()
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/* ══════════ 状态滑块 ══════════ */

/** 建出四个档位名（均匀分布在轨道上方）。 */
for (const tier of TIERS) {
  const sp = document.createElement('span')
  sp.dataset.n = tier
  sp.textContent = tier
  sp.style.left = (TIERS.indexOf(tier) * 33.333).toFixed(2) + '%'
  elSsNames.appendChild(sp)
}

/** 当前档位索引（由 timer.mode 推出）。 */
function currentTierIndex() {
  const m = MODES[timer.mode] ?? MODES.study
  return Math.max(0, TIERS.indexOf(m.tier))
}

/**
 * 切到第 i 档。
 * @param {number} i 0..3
 * @param {boolean} restartIfSame 同一档时是否重新计时（点/拖到当前档）
 */
function setTier(i, restartIfSame = true) {
  const idx = Math.max(0, Math.min(TIERS.length - 1, Math.round(i)))
  const mode = TIER_MODES[idx]
  if (mode === timer.mode && timer.status === 'running') {
    if (restartIfSame) timer.reset()
  } else {
    timer.setMode(mode)
  }
  if (timer.status !== 'running') timer.toggle()   // 立刻开始，不用手动点
  renderTimer(timer.snapshot())
}

/** 把 clientX 换算成档位索引（含小数，供拖动时预览）。 */
function posToTier(clientX) {
  const r = elSsTrack.getBoundingClientRect()
  const ratio = r.width > 0 ? (clientX - r.left) / r.width : 0
  return ratio * (TIERS.length - 1)
}

// 拖动 / 点击都走这套：按下就开始跟手，松手吸附到最近档位
let dragging = false
let lastPreview = -1

function onDown(e) {
  dragging = true
  elStateSlider.classList.add('dragging')
  elSsTrack.setPointerCapture?.(e.pointerId)
  onMove(e)
}
function onMove(e) {
  if (!dragging) return
  const t = posToTier(e.clientX)
  // 拖动过程中只预览位置和颜色，不真的切状态（免得来回重计时）
  const idx = Math.max(0, Math.min(TIERS.length - 1, Math.round(t)))
  elThumb.style.left = (t / (TIERS.length - 1) * 100).toFixed(2) + '%'
  elStateSlider.style.setProperty('--ss-color', TIER_COLORS[idx])
  if (idx !== lastPreview) lastPreview = idx
  e.preventDefault()
}
function onUp(e) {
  if (!dragging) return
  dragging = false
  elStateSlider.classList.remove('dragging')
  const idx = Math.max(0, Math.min(TIERS.length - 1, Math.round(posToTier(e.clientX))))
  lastPreview = -1
  setTier(idx, true)
}

elSsTrack.addEventListener('pointerdown', onDown)
elSsTrack.addEventListener('pointermove', onMove)
elSsTrack.addEventListener('pointerup', onUp)
elSsTrack.addEventListener('pointercancel', onUp)
// 键盘可达：左右方向键换档
elSsTrack.tabIndex = 0
elSsTrack.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { setTier(currentTierIndex() - 1, false); e.preventDefault() }
  if (e.key === 'ArrowRight') { setTier(currentTierIndex() + 1, false); e.preventDefault() }
})

renderTimer(timer.snapshot())

/* 打开就在计时：默认学习状态，页面加载即开始 */
if (timer.status === 'idle') timer.toggle()
renderTimer(timer.snapshot())

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
/** 最近一次实时视图状态（频谱和表情都要读它）。 */
let lastLive = null
/** 最后一次收到数据帧的时刻。看护循环靠它判断 SSE 连接是否还活着。 */
let liveSeenAt = Date.now()

function renderLive(v) {
  if (!v.ready) return
  lastLive = v
  liveSeenAt = Date.now()

  // 歌名 / 歌手
  if (v.track === null) {
    elTrackTitle.textContent = '等待播放…'
    elTrackArtist.textContent = '在 QQ 音乐里开始播放'
  } else {
    elTrackTitle.textContent = v.track.title || '未知曲目'
    elTrackArtist.textContent = v.track.artist || ''
  }

  // 换歌：给频谱打个脉冲，表情也弹一下
  const tk = v.track === null ? '' : v.track.title + '\u0000' + v.track.artist
  if (tk !== vizLastTrack) {
    vizLastTrack = tk
    if (tk !== '') vizKick = 1
  }

  /*
   * 单曲循环：曲目标识没变，但服务端在曲末把时钟归零了（v.loops 递增）。
   *
   * 这里跟着打一次脉冲 —— 否则进度条会静悄悄跳回 0，看着像卡了一下。
   * 有了这个，"重头开始"和"切歌"的视觉反馈就一致了。
   */
  if (typeof v.loops === 'number') {
    if (v.loops !== vizLastLoops) {
      vizLastLoops = v.loops
      if (v.loops > 0) vizKick = 1
    }
  }

  // 播放状态：频谱的明暗和表情的抖动都跟着它
  document.querySelector('.card').classList.toggle('playing', v.playing === true)

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

/* ══════════ 帧节流器 ══════════ */

/**
 * 统一管住两个每帧循环，**只在真需要渲染时才跑**。
 *
 * 为什么需要（实测数据）：
 *   频谱每帧要对 91 个 DOM 元素逐个写 style，占约 4.6ms/帧（总帧耗时的 39%）；
 *   CSS 动画（4 个 blur(46px) 浮动层 + 18 个雪花 + breathe）再占 2.3ms。
 *   而这些开销**在音乐暂停时也一直在烧** —— 频谱是正弦模拟的，
 *   它不依赖真实音频，所以永远在动。
 *
 * 壁纸是常驻进程，这就导致"没听歌也在发热"。
 *
 * 处理：分三档
 *   active  正在播放  → 全速（保持视觉完全不变）
 *   idle    暂停/停播  → 降到 IDLE_FPS，且频谱冻结
 *   asleep  隐藏/息屏/锁屏 → 完全停掉
 *
 * 画面元素一个没少，只是"没必要动的时候不动"。
 */
const IDLE_FPS = 12              // 暂停时降到 12fps（时钟和状态计时够用）
const FPS_CAP = 60               // 上限 60：屏幕 85Hz 时不必多画那 25 帧

const throttle = {
  sleeping: false,               // 页面隐藏 / 息屏 / 锁屏
  burstUntil: 0,                 // 这个时刻之前跑满帧（切歌/切档位/拖动的短暂提速）
  forced: undefined,             // 排查用：手动指定 playing（见 __forcePlaying）
  get playing() { return this.forced !== undefined ? this.forced : lastLive?.playing === true },
  /** 当前允许的最小帧间隔（ms）。 */
  minGap() {
    if (this.sleeping) return Infinity
    return 1000 / (this.playing ? FPS_CAP : IDLE_FPS)
  },
}
/** 主进程报来的电源状态（和 document.hidden 分开记，两者取或）。 */
let powerSleeping = false
window.__throttle = throttle        // 排查用

/** 短时间内跑满帧。切歌、切档位、拖动进度条时用，保证手感不变。 */
function burst(ms = 1500) { throttle.burstUntil = Date.now() + ms }

/* 页面被遮挡就不再渲染。壁纸在桌面最底层，被窗口盖住时完全没必要画。 */
document.addEventListener('visibilitychange', () => {
  applyState()
})

/* 系统息屏 / 锁屏 / 挂起 —— 由主进程用 postMessage 通知（没设 preload）。 */
window.addEventListener('message', (e) => {
  const d = e.data
  if (d && d.type === 'power') { powerSleeping = d.state !== 'active'; applyState() }
  if (d && d.type === 'burst') burst(d.ms ?? 1500)
})

/**
 * 统一应用"现在该跑多快"。
 *
 * **CSS 动画的冻结比停 rAF 重要得多。** 实测：把两个 rAF 循环停掉之后，
 * 界面照样跑到 158fps —— 因为 18 个雪花、4 个 blur(46px) 浮动层、breathe
 * 这些全是 **CSS 动画，跑在合成器线程上**，JS 根本管不着。
 *
 * 三档（画面元素一个不少，只是动与不动的区别）：
 *   播放中        → 全速，CSS 动画正常运行
 *   暂停/停播      → 冻住 CSS 动画，rAF 降到 12fps
 *   遮挡/息屏/锁屏 → 再停掉视频
 *
 * 为什么暂停时也冻：暂停时界面本来就该"静下来"，
 * 雪花还在飘、光斑还在晃反而不自然；而且这是一天里占比最大的状态。
 */
function applyState() {
  const next = powerSleeping || document.hidden
  if (throttle.sleeping === next) { syncFrozen(); return }
  throttle.sleeping = next
  syncFrozen()
  if (!next) syncHeroVideo()
}

/** 按当前状态开关"冻住动画"的 class。 */
function syncFrozen() {
  const frozen = throttle.sleeping || !throttle.playing
  document.documentElement.classList.toggle('sz-frozen', frozen)

  /*
   * 壁纸视频也一起停 —— 这是**单个最贵的开销**。
   *
   * 实测（renderer + gpu-process 的平均核数）：
   *   关掉壁纸视频   省 0.825 核（占总量 26%）← 最大头
   *   关掉频谱       省 0.399 核（13%）
   *   关掉 blur/grain/vignette   ≈0（这些几乎不花钱，之前的猜测是错的）
   *
   * 视频是 loop 播放的循环动图，暂停时也一直在解码。
   * 而"暂停时"是一天里占比最大的状态 —— 纯粹白烧。
   *
   * 停掉之后画面定在最后一帧，看上去就是一张静止壁纸，观感没损失。
   * 恢复播放时 syncHeroVideo() 会让它接着动。
   */
  const shouldPlayVideo = !frozen
  for (const vid of document.querySelectorAll('.hero .bgVid')) {
    const isActive = vid.classList.contains('bgNight') === document.body.hasAttribute('data-ds-dark-theme')
    if (shouldPlayVideo && isActive && vid.paused) { vid.play().catch(() => { }) }
    else if ((!shouldPlayVideo || !isActive) && !vid.paused) { try { vid.pause() } catch { } }
  }
}

/* 状态变化时重算（playing 变了、视频状态变了都要） */
setInterval(syncFrozen, 1000)

/**
 * 排查用：强制指定"在不在播放"。
 *
 * 为什么需要：playing 平时来自 SSE 推送的 lastLive.playing，
 * 那个对象在模块作用域里，**从调试端口改不动**（const 绑定，
 * 而且 onChange 会把它覆盖回去）。量省电效果时必须能手动切状态。
 *
 * ⚠️ 这段代码位于第 778 行开始的大模板字符串里（构建 HTML 的那块），
 *    所以注释和字符串里**不能出现反引号** —— 会提前闭合外层模板，
 *    报出一堆看不懂的语法错误（踩过）。
 */
window.__forcePlaying = (v) => {
  throttle.forced = v === null ? undefined : !!v
  syncFrozen()
  return { forced: throttle.forced ?? null, frozen: document.documentElement.classList.contains('sz-frozen') }
}

/**
 * 每帧补间推进（进度条平滑、歌词到点就换）+ 连接看护。
 *
 * 为什么需要看护：SSE 靠 EventSource 自动重连，但**服务挂掉再起来**时
 * 它不一定会恢复 —— 界面是经 serve.mjs 代理到 :7788 的，上游不通时
 * 代理返 502，EventSource 可能就此卡死。
 *
 * 表现很迷惑：壁纸不切歌了，但日志一切正常（根本没报错，只是永远收不到新帧）。
 * 处理：超过 STALE_MS 没收到任何数据帧就重载页面，重建整条连接。
 * 宁可闪一下，也别一直卡着。
 */
const STALE_MS = 30_000
let lastTickAt = 0
function liveLoop() {
  const now = performance.now()
  const gap = throttle.minGap()
  /* 节流：没到该画的时候直接跳过这一帧，但循环继续挂着。
     注意 live.tick() 也要一起跳过 —— 它内部按时间差推进歌词和进度，
     跳过不画不影响正确性，恢复时会一次性追上。 */
  if (gap === Infinity || (gap > 0 && now - lastTickAt < gap)) {
    requestAnimationFrame(liveLoop)
    return
  }
  lastTickAt = now

  live.tick()
  if (Date.now() - liveSeenAt > STALE_MS) {
    // 先把时刻推后，避免浏览器延迟 reload 时反复触发
    liveSeenAt = Date.now()
    location.reload()
    return
  }
  requestAnimationFrame(liveLoop)
}
requestAnimationFrame(liveLoop)

/* ══════════ 律动频谱 ══════════ */

const elViz = document.getElementById('viz')
/** 柱子元素。 */
let vizBars = []
/** 平滑后的整体强度（0=静音、1=满幅），避免播放/暂停瞬间突跳。 */
let vizLevel = 0
/** 切歌脉冲：每次换歌打一下，让波形"弹"起来。 */
let vizKick = 0
/** 上次看到的曲目标识，用来判断换歌。 */
let vizLastTrack = ''
/** 上次看到的循环轮次（单曲循环时服务端会在曲末归零，靠它触发脉冲）。 */
let vizLastLoops = 0

/** 按容器宽度铺满柱子。 */
function buildViz() {
  const w = elViz.clientWidth
  if (w <= 0) return
  const gap = 3
  const n = Math.max(16, Math.min(96, Math.floor(w / (gap + 5))))
  if (vizBars.length === n) return
  elViz.innerHTML = ''
  vizBars = []
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span')
    elViz.appendChild(s)
    vizBars.push(s)
  }
}

/**
 * 推一帧频谱。
 *
 * 拿不到真实音频（QQ 音乐的声音不经过本页），所以用多组正弦叠加模拟律动：
 * 三个不同空间频率 + 各自随时间的相位漂移，叠出来起伏自然、不重复。
 * 真要做真频谱得拿到音频流，那需要虚拟声卡或 WASAPI 环回采集，
 * 代价大得多——这里先做拟态，视觉上够用。
 */
function vizFrame(t) {
  if (vizBars.length === 0) return
  const n = vizBars.length
  const playing = lastLive?.playing === true
  // 强度平滑：播放时升到 1，暂停时落到 0.12
  const target = playing ? 1 : 0.12
  vizLevel += (target - vizLevel) * (playing ? 0.08 : 0.05)
  vizKick *= 0.94                                  // 脉冲自然衰减

  const sec = t / 1000
  for (let i = 0; i < n; i++) {
    const x = i / n
    // 三组波：低频大起伏 + 中频细节 + 高频抖动
    const a = Math.sin(x * 6.0 + sec * 2.1) * 0.34
    const b = Math.sin(x * 15.0 - sec * 3.4) * 0.24
    const c = Math.sin(x * 31.0 + sec * 5.7) * 0.14
    // 中间高两端低的包络，像真实频谱
    const env = 0.55 + 0.45 * Math.sin(x * Math.PI)
    let amp = (0.42 + a + b + c) * env
    amp = Math.max(0.08, Math.min(1, amp))
    // 脉冲按柱序延迟，形成从左扫到右的"冲击波"
    amp = Math.min(1, amp + vizKick * Math.exp(-Math.pow((x - 0.5) * 3.2, 2)))
    vizBars[i].style.transform = 'scaleY(' + (amp * vizLevel + 0.05).toFixed(3) + ')'
  }
}

let vizRaf = 0
let vizLastAt = 0
function vizLoop(t) {
  /*
   * 频谱和表情是**这个界面里最贵的每帧工作**（实测占约 39% 帧耗时：
   * 91 个 DOM 元素逐个写 style.transform）。
   *
   * 而它是**正弦模拟**的，不依赖真实音频 —— 也就是说歌停了它照样在动。
   * 所以暂停时直接停掉整帧：柱子会停在最后那个高度，
   * 体感上就是"音乐停了，波形也静了"，比继续空转合理。
   */
  if (throttle.sleeping || !throttle.playing) {
    vizRaf = requestAnimationFrame(vizLoop)
    return
  }

  const gap = 1000 / FPS_CAP
  if (t - vizLastAt < gap) {
    vizRaf = requestAnimationFrame(vizLoop)
    return
  }
  vizLastAt = t

  vizFrame(t)
  updateExpression()      // 表情也要每帧推，抖动才跟得上节奏
  vizRaf = requestAnimationFrame(vizLoop)
}
buildViz()
vizRaf = requestAnimationFrame(vizLoop)

/* ══════════ 日夜壁纸视频：只让可见的那个解码 ══════════ */

/**
 * 两个 <video>（白天/夜晚）是叠着放的，靠 CSS 的 opacity 切换。
 *
 * 问题：**两个都 autoplay loop，也就是都在解码**，而其中一个 opacity 常年是 0。
 * 实测两个都在跑（810x1080，各一份解码器），纯属白烧。
 *
 * 处理：只播当前可见的那个，另一个暂停。
 * 切换主题时再对调 —— 因为暂停的视频保留最后一帧，
 * 所以交叉淡入淡出的观感不受影响。
 */
function syncHeroVideo() {
  const dark = document.body.hasAttribute('data-ds-dark-theme')
  for (const v of document.querySelectorAll('.hero .bgVid')) {
    const shouldPlay = v.classList.contains('bgNight') === dark
    if (shouldPlay && v.paused) { v.play().catch(() => { }) }
    else if (!shouldPlay && !v.paused) { v.pause() }
  }
}

/* 主题切换靠 body 上的属性，盯它最省事（不用改散落各处的切换代码） */
new MutationObserver(syncHeroVideo)
  .observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

/* 视频能播了再同步一次（首帧时可能还没 loadeddata） */
for (const v of document.querySelectorAll('.hero .bgVid')) {
  v.addEventListener('loadeddata', syncHeroVideo, { once: true })
}
syncHeroVideo()

/* ══════════ 铃兰表情（右下角，随节奏抖） ══════════ */

const elMascot = document.getElementById('mascot')
const elMStack = elMascot.querySelector('.mStack')
/** 平滑后的压缩量：0=完全舒展（睁眼全高），1=完全压缩（闭眼半高）。 */
let squash = 0
/** 上次是否处于压缩态，用来只在跨越阈值时切 class，避免每帧改 DOM。 */
let wasSquashed = false

/**
 * 推一帧表情。
 *
 * 做法：两张 GIF（睁眼 / 闭眼）叠在一起，靠透明度切换。
 * 不用单张 GIF 重播来做——GIF 从头播会闪一下，节奏也对不齐。
 *
 * 压缩量由两拍一循环的正弦驱动（像心跳），舒展时睁眼、压缩时闭眼；
 * 压缩到底时高度只有原来一半（scaleY 0.5，origin 在底部，像"蹲一下"）。
 */
function updateExpression() {
  const playing = lastLive?.playing === true
  const t = performance.now() / 1000
  // 播放中：约 1.1 秒一个循环（≈55 BPM 的"点头"感）；暂停时几乎不动
  const beat = playing ? Math.abs(Math.sin(t * Math.PI / 1.1)) : 0
  const target = playing ? beat : 0
  // 压缩用快、回弹用慢，更像呼吸
  squash += (target - squash) * (target > squash ? 0.35 : 0.16)

  // scaleY: 1 → 0.5；再叠一点点横向鼓起，避免单纯压扁显得瘪
  const sy = 1 - squash * 0.5
  const sx = 1 + squash * 0.06
  elMStack.style.transform = 'scale(' + sx.toFixed(3) + ', ' + sy.toFixed(3) + ')'

  // 过阈值才切表情：避免在边界反复抖
  const squashed = squash > 0.45
  if (squashed !== wasSquashed) {
    wasSquashed = squashed
    elMascot.classList.toggle('squash', squashed)
  }
}

/* ══════════ 背景动效（网格渐变 + 落雪） ══════════ */

const elFx = document.getElementById('fx')
const elFxSnow = document.getElementById('fxSnow')
/** 当前动效模式：none | mesh | snow | both。默认「叠加」——用户定稿。 */
let fxMode = 'both'

/** 生成雪点。数量按整个背景宽度走——铺满界面了，密度要跟着调。 */
function buildSnow() {
  const w = elFx.clientWidth
  if (w <= 0) return
  const n = Math.max(28, Math.min(90, Math.round(w / 20)))
  if (elFxSnow.children.length === n) return
  elFxSnow.innerHTML = ''
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i')
    // 用伪随机但确定性的分布，避免每次重建都跳位
    const seed = (i * 2654435761) % 1000 / 1000
    const seed2 = (i * 40503) % 1000 / 1000
    s.style.left = (seed * 97).toFixed(1) + '%'
    s.style.setProperty('--s', (2 + (i % 3) * 1.7).toFixed(1) + 'px')
    s.style.setProperty('--d', (7 + seed2 * 7).toFixed(1) + 's')
    s.style.setProperty('--dl', (-seed2 * 12).toFixed(1) + 's')   // 负延迟：一上来就分布在各处
    elFxSnow.appendChild(s)
  }
}

/* 动效固定为"网格 + 落雪"叠加（用户定稿，不再做开关），
   所以这里不用 setFx，直接在标记上写死 data-fx="both" 并铺一次雪点。 */
buildSnow()

/* ══════════ 铃兰椭圆遮罩 & 主题扩散 ══════════ */

const elCard = document.querySelector('.card')
const elLeft = document.querySelector('.left')
const elHero = document.getElementById('hero')
const elReveal = document.getElementById('reveal')

/**
 * 算出竖椭圆遮罩的参数。
 *
 * 画面区域 .heroArt 仍是 46% 宽的竖带（保证铃兰的裁切比例和原来一致），
 * 遮罩挂在外层 .hero（铺满整卡）上，圆心就取那条竖带的中心偏上——
 * 和原来"左栏中心、垂直 46%"的位置一致。
 */
function fitHero() {
  const cw = elCard.clientWidth
  const ch = elCard.clientHeight
  if (cw <= 0 || ch <= 0) return
  const band = cw * 0.46          // 画面竖带的宽度
  document.documentElement.style.setProperty('--hero-x', (band * 0.5).toFixed(0) + 'px')
  document.documentElement.style.setProperty('--hero-y', (ch * 0.46).toFixed(0) + 'px')
  // 半径（两个系数都取 0.6）：
  //   短半轴 = 竖带宽 × 0.6   → 1440 宽下 = 662 × 0.6 ≈ 397px
  //   长半轴 = 卡片高 × 0.6   → 900 高下  = 900 × 0.6 = 540px
  // 注意这两个系数作用在不同基准上（带宽 / 卡高），所以不是正圆。
  document.documentElement.style.setProperty('--hero-rx', (band * 0.6).toFixed(0) + 'px')
  document.documentElement.style.setProperty('--hero-ry', (ch * 0.6).toFixed(0) + 'px')
}

/**
 * 主题切换：旧画面淡出的同时，新画面从**右下角小铃兰**那里扩散推开。
 *
 * 为什么用"快照"而不是纯色层：
 *   早期版本是拿新主题的纯色铺满一层，再用径向遮罩推开。
 *   结果扩散过程中整个屏幕是**一块纯色**，内容全没了，像"炸掉重载"。
 *   现在改成把当前 DOM 复制一份盖在上面做旧画面，底下的真页面切成新主题，
 *   然后让旧画面从铃兰位置向外淡出 —— 视觉上是"新主题推开旧画面"，
 *   全程都有内容，不会出现空白纯色期。
 *
 * @param {string} toScheme 目标主题（'light' | 'dark'）
 * @param {() => void} applyTheme 真正切换主题的函数
 */
function revealTheme(toScheme, applyTheme) {
  // 尊重"减少动态效果"：直接切，不做过渡
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { applyTheme(); return }

  // 扩散原点 = 状态滑块（最贴近"我正在操作的地方"），退化到铃兰
  const s = elSsTrack.getBoundingClientRect()
  const m = mascot.getBoundingClientRect()
  const ref = s.width > 0 ? s : m
  const ox = ref.width > 0 ? ref.left + ref.width / 2 : elCard.clientWidth * 0.85
  const oy = ref.height > 0 ? ref.top + ref.height / 2 : elCard.clientHeight * 0.92

  // 冻结实时动效层：否则它会盖住扩散痕迹
  elCard.classList.add('switching')

  // 快照当前画面（克隆整个 card 的内容，动画自己停下来，静态就够）
  const snap = elCard.cloneNode(true)
  snap.removeAttribute('id')
  snap.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  snap.setAttribute('aria-hidden', 'true')
  snap.classList.add('snap')
  snap.querySelectorAll('video').forEach(v => { v.removeAttribute('autoplay'); v.pause?.() })

  /*
   * ★ 关键一步：把"当前主题的 CSS 变量"搬到快照自己身上。
   *
   * 为什么必须这么做：主题变量是写在 <body> 的行内样式上的，而快照也挂在 <body> 下。
   * applyTheme() 一改 body 的变量，快照里的元素**立刻跟着变成新主题**，
   * 于是"新主题推开新主题"，扩散完全看不出来（实测快照和页面的颜色一模一样）。
   * 把旧变量以行内样式写到快照根节点上（行内优先于继承），它就被冻在旧主题了。
   */
  const bodyCS = getComputedStyle(document.body)
  for (const prop of painted) {
    const v = bodyCS.getPropertyValue(prop)
    if (v) snap.style.setProperty(prop, v.trim())
  }
  // 这几项不在 painted 里，但同样决定观感
  snap.style.setProperty('--font-ui', bodyCS.getPropertyValue('--font-ui') || 'sans-serif')
  /*
   * 底色必须**完全不透明**。
   *
   * 不能直接用 --dsw-alias-bg-base —— 那个值是半透明的（设计上是叠层用的），
   * 拿它当快照底色会让快照整体透光：Live 的暗色透上来、旧浅色压不住，
   * 两层糊在一起，扩散过程几乎看不出来（用户反馈"右侧看不到扩散"）。
   * 这里从 body 的实际背景色取，它是不透明的。
   */
  const bodyBg = bodyCS.backgroundColor
  snap.style.background = (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)') ? bodyBg : '#fff9fa'

  /*
   * 覆盖层：用径向遮罩控制"旧画面还留着多少"。
   *
   * 半径 r 处仍然全不透明（旧画面），r 以内是**已经让开的洞**（露出 Live 新主题）。
   *
   * 边缘只留 14px 渐隐 —— 之前给了 90px 宽的过渡带，
   * 结果新旧两层在很宽的一条带里半透明重叠，糊成一片，
   * 看起来就是"只有局部在变"（用户反馈"右侧看不到扩散"）。
   */
  const EDGE = 14
  const maskAt = (r) => {
    const inner = Math.max(0, r - EDGE)
    return 'radial-gradient(circle ' + r + 'px at ' + ox + 'px ' + oy + 'px,' +
      ' transparent 0%, transparent ' + inner + 'px,' +
      ' #000 ' + r + 'px)'
  }
  // 一开始半径 0：旧画面完整盖着（全不透明）
  snap.style.webkitMaskImage = maskAt(0)
  snap.style.maskImage = maskAt(0)
  elReveal.hidden = false
  elReveal.appendChild(snap)

  const far = Math.hypot(elCard.clientWidth, elCard.clientHeight) * 1.15
  const t0 = performance.now()
  /**
   * 过渡时长（毫秒）。
   * 1100 偏快、涟漪一闪而过；现在定 5000（用户要求"极限一点"看清过程）。
   * 可以用 ?slow=N 再放大 N 倍（调试用），?slow=0.2 之类也能加速。
   */
  const SLOW = Number(new URLSearchParams(location.search).get('slow') || 1)
  const DUR = 5000 * (Number.isFinite(SLOW) && SLOW > 0 ? Math.min(SLOW, 10) : 1)

  // 诊断日志：把每帧的半径记到 window.__rvLog，方便排查"扩散看不见"
  window.__rvLog = [{ t: 0, r: 0, far, ox, oy, ev: 'start' }]

  // 底下立刻切主题（被快照盖着，看不见跳变）
  applyTheme()

  const tick = (now) => {
    const p = Math.min(1, (now - t0) / DUR)
    // easeOutCubic：一开始快、后面慢，像涟漪推开
    const e = 1 - Math.pow(1 - p, 3)
    const r = far * e
    snap.style.webkitMaskImage = maskAt(r)
    snap.style.maskImage = maskAt(r)
    window.__rvLog.push({ t: Math.round(now - t0), p: Number(p.toFixed(3)), r: Math.round(r), mi: (snap.style.maskImage || '').slice(0, 40) })
    if (p < 1) { requestAnimationFrame(tick); return }
    // 收尾：撤掉快照，恢复实时动效
    elReveal.hidden = true
    elReveal.innerHTML = ''
    elCard.classList.remove('switching')
  }
  requestAnimationFrame(tick)
}

/**
 * 换明暗主题时要跟着动的东西。
/**
 * 换主题时要跟着动的东西。
 * 白天/夜晚两版壁纸靠 CSS（body[data-ds-dark-theme]）自动交叉淡入，
 * 这里只负责把视频保险地播起来——某些情况下 autoplay 会被拦。
 */
function applySchemeSideEffects() {
  for (const v of document.querySelectorAll('.hero .bgVid')) {
    if (v.paused) v.play().catch(() => {})
  }
}

/* ── 壁纸开关 ──
   注意：壁纸是直接写在标记里的（.hero 在 .card 内），不是模板挂载的。
   所以这个开关要做的是**把已有的 .hero 藏起来**，而不是去挂载什么。 */
if (!SHOW_HERO) {
  elHero.style.display = 'none'
  elHero.setAttribute('aria-hidden', 'true')
  for (const v of document.querySelectorAll('.hero .bgVid')) v.pause()
} else {
  // 视频自动播放兜底：浏览器偶发拦截，首次交互后补播
  for (const v of document.querySelectorAll('.hero .bgVid')) {
    v.play().catch(() => {
      const resume = () => { v.play().catch(() => {}); removeEventListener('click', resume) }
      addEventListener('click', resume, { once: true })
    })
  }
}

/* 尺寸自适应：把右栏实际宽度写进 --w，CSS 里所有字号/封面尺寸都由它推导。
   这样窗口大小一变，整块版面等比缩放，始终"排得满"。
   窗口变化后要重跑 fitTexts——字号变了，能放下多少字也跟着变。 */
function fitScale() {
  const w = rightColEl.clientWidth
  /* 写到 :root，表情按钮（在 body 下）也能拿到 */
  if (w > 0) document.documentElement.style.setProperty('--w', w + 'px')
  fitTexts()
  buildViz()
  fitHero()
  buildSnow()
}
fitScale()
new ResizeObserver(fitScale).observe(rightColEl)
// 窗口尺寸变化也要重算椭圆（--hero-* 依赖卡片实际高宽）
new ResizeObserver(fitHero).observe(elCard)
// 视频元数据到位后，尺寸可能才定型，再算一次
for (const v of document.querySelectorAll('.left .bgVid')) {
  v.addEventListener('loadedmetadata', fitHero, { once: true })
}

// 每秒刷新：系统时间要一直走（不管计时器有没有开）
setInterval(() => {
  if (timer.status === 'running') timer.tick()
  else renderTimer(timer.snapshot())
}, 1000)
</script>
</body>
</html>
`

writeFileSync(OUT_HTML, html, 'utf8')
console.log(`wrote ${OUT_HTML}  (${(html.length / 1024).toFixed(1)} KiB)`)
