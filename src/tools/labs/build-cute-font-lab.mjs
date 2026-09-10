/*
 * 可爱/俏皮中文字体 · 对比样张
 * ------------------------------
 * 读 assets/fonts/cute/<slug>/meta.json（由 fetch-cute-fonts.mjs 生成），
 * 把每款字体渲染成一张卡片，三档字号 —— 38px / 22px / 14px，对应播放器里
 * 「当前歌词 / 下一句歌词 / 辅助信息」的实际大小。
 *
 * 为什么要有「系统默认」对照卡：
 *   如果某款字体没加载成功，浏览器会静默 fallback 成系统字体，卡片看起来
 *   「也还行」—— 这正是最坑的地方。放一张对照卡，只要它和别的长得一样，
 *   就说明是 fallback 了。另外 src/tools/check-font-coverage.mjs 会直接解析
 *   字体的 cmap 表，从数据上先排掉「缺字导致的 fallback」。
 *
 * 用法：node src/tools/build-cute-font-lab.mjs
 * 产物：cute-font-lab.html
 *
 * 截图（必须走 http://，file:// 下 Chrome 会拦字体）：
 *   node src/serve.mjs 7791 D:\suzuran-player
 *   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
 *     --no-sandbox --no-first-run --user-data-dir="$env:TEMP\fontlab" --hide-scrollbars `
 *     --window-size=1500,2400 --virtual-time-budget=30000 `
 *     --screenshot="D:\suzuran-player\cute-font-lab.png" "http://127.0.0.1:7791/cute-font-lab.html"
 */

import { writeFileSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { THEMES } from '../../palettes.mjs'
import { SAMPLE } from '../lib/cute-font-sample.mjs'
import { coverageOf } from '../checks/check-font-coverage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')   // src/tools/labs → 项目根
const CUTE = join(ROOT, 'assets', 'fonts', 'cute')
const LIGHT = THEMES.find(t => t.id === 'sakura-mochi-light')
const DARK = THEMES.find(t => t.id === 'sakura-mochi-dark')

/* 展示顺序 + 一句话点评（点评是主观的，写在这里方便改） */
const CURATION = [
  ['jason-qmeng', '综合最萌', '手写体里最"软"的一档，笔画一顿一顿，38px 歌词像手账。'],
  ['zcool-kuaile', '最甜', '糖果包装盒上的字，圆头圆脑，适合歌名不适合小字。'],
  ['black-sugar-plum-candy', '最胖', '字形被横向撑开、笔画收细，辨识度和可爱度都高。'],
  ['zcool-qingke-huangyou', '最俏皮', '黄油块一样厚，重心低、字距挤，做标题最有气氛。'],
  ['lxgw-marker-gothic', '最有个性', '马克笔手写，起收笔有顿挫、结构略歪 —— 最"人味"。'],
  ['yozai', '最耐看', '日系悠闲手写，撇捺舒展，整句歌词读起来最舒服。'],
  ['kn-bobohei', '最规矩', '手写黑体，字面满、外扩，小字号下依然清楚。'],
  ['smiley-sans', '最张扬', '倾斜窄体美术字，笔画末端上翘带笑，做歌名最抢眼。'],
]

/* ── 收集已下载的字体 ─────────────────────────────── */
function formatOf(name) {
  const e = name.toLowerCase().split('.').pop()
  return e === 'ttf' ? 'truetype' : e === 'otf' ? 'opentype' : e === 'woff2' ? 'woff2' : 'woff'
}

const fonts = []
for (const [slug, tag, comment] of CURATION) {
  const dir = join(CUTE, slug)
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) { console.warn(`跳过 ${slug}：没有 meta.json（还没下载成功？）`); continue }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  // 样张页输出到 labs/，所以字体相对路径要多上一层
  meta.dir = '../assets/fonts/cute/' + slug

  // 两种落地形态：
  //   A. 单个 ttf/otf/woff2     → 自己写 @font-face
  //   B. font.css + 一堆 woff2 切片（cn-fontsource 包）→ 直接搬 font.css，里面自带 unicode-range
  const files = readdirSync(dir)
  const css = files.find(n => n.toLowerCase() === 'font.css')

  let entry
  if (css) {
    const raw = readFileSync(join(dir, css), 'utf8')
    // font.css 里的 url('L1_xxx.woff2') 是相对 CSS 自身的；内联进 HTML 后基准变成 HTML，
    // 所以要改写成相对 HTML 的 ./assets/fonts/cute/<slug>/L1_xxx.woff2
    const rewritten = raw.replace(/url\(\s*(['"]?)(?!https?:|data:|\/)([^'")]+)\1\s*\)/g,
      (_, q, p) => `url('${meta.dir}/${p.replace(/^\.\//, '')}')`)
    const family = (raw.match(/font-family:\s*['"]([^'"]+)['"]/) || [, null])[1]
    if (!family) { console.warn(`跳过 ${slug}：font.css 里没解析出 font-family`); continue }
    entry = { familyCss: rewritten, family, file: `${css} + ${files.filter(n => /\.woff2$/i.test(n)).length} 个 woff2 切片`, ext: null, bytes: meta.bytes, sliced: true }
  } else {
    const file = files.filter(n => /\.(ttf|otf|woff2?)$/i.test(n))
      .sort((a, b) => (/\.(ttf|otf)$/i.test(b) ? 1 : 0) - (/\.(ttf|otf)$/i.test(a) ? 1 : 0))[0]
    if (!file) { console.warn(`跳过 ${slug}：目录里没有字体文件`); continue }
    entry = { family: meta.family, file, ext: formatOf(file), bytes: statSync(join(dir, file)).size, sliced: false }
  }
  fonts.push({ ...meta, tag, comment, ...entry, cov: coverageOf(dir) })
}

const extra = readdirSync(CUTE, { withFileTypes: true })
  .filter(e => e.isDirectory() && !CURATION.some(c => c[0] === e.name))
  .map(e => e.name)
if (extra.length) console.warn(`注意：cute/ 下还有未列进样张的目录：${extra.join(', ')}`)

/* ── @font-face ────────────────────────────────────── */
const faceCss = fonts.map(f => f.sliced
  ? `/* ${f.name} — 来自 cn-fontsource 包的切片 CSS */\n${f.familyCss}`
  : `@font-face {
  font-family: '${f.family}';
  src: url('${f.dir}/${f.file}') format('${f.ext}');
  font-weight: 400; font-style: normal; font-display: block;
}`).join('\n')

const kb = n => n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : `${(n / 1024).toFixed(0)} KiB`

/* 覆盖徽章：缺字会让单个字符悄悄掉回系统字体，必须让人看见 */
const covBadge = f => {
  if (!f.cov || f.cov.missing === null) return ''
  const pct = ((f.cov.chars - f.cov.missing.length) / f.cov.chars * 100).toFixed(1)
  return f.cov.missing.length
    ? `<span class="covBadge bad" title="样张里这些字该字体没有字形，会掉回系统字体">样张缺 ${f.cov.missing.join(' ')}（覆盖 ${pct}%）</span>`
    : `<span class="covBadge ok" title="样张里每一个字该字体都有字形，不会 fallback">样张 ${pct}% 覆盖</span>`
}

/* ── 卡片 ──────────────────────────────────────────── */
const card = (f, i) => `
<section class="card">
  <header>
    <div class="idx">${String(i + 1).padStart(2, '0')}</div>
    <div class="titles">
      <h2 class="zh" style="font-family:'${f.family}',var(--fallback)">${f.name}</h2>
      <div class="latin">${f.latin === f.family ? f.latin : `${f.latin} · <span class="fam">${f.family}</span>`}</div>
    </div>
    <div class="tag">${f.tag}</div>
  </header>

  <p class="vibe">${f.vibe} ${covBadge(f)}</p>

  <div class="stage" style="font-family:'${f.family}',var(--fallback)">
    <div class="l38">${SAMPLE.big}</div>
    <div class="l22">${SAMPLE.mid}</div>
    <div class="l14">${SAMPLE.small}</div>
  </div>

  <p class="comment">${f.comment}</p>

  <dl class="meta">
    <div><dt>授权</dt><dd class="lic">${f.license}</dd></div>
    <div><dt>来源</dt><dd><a href="${f.source}" target="_blank" rel="noreferrer">${f.source.replace(/^https?:\/\//, '')}</a></dd></div>
    <div><dt>文件</dt><dd>${f.file} · <b>${kb(f.bytes)}</b>${f.sliced ? ' <span class="warn">（按需加载的 woff2 切片，首次用到的字才会下）</span>' : ''}</dd></div>
    <div><dt>用法</dt><dd><code>font-family: '${f.family}'</code>${f.sliced ? ` — <code>${f.dir}/font.css</code>` : ` — <code>${f.dir}/${f.file}</code>`}</dd></div>
  </dl>
</section>`

const control = `
<section class="card control">
  <header>
    <div class="idx">00</div>
    <div class="titles">
      <h2 class="zh">系统默认（对照）</h2>
      <div class="latin">Microsoft YaHei / Segoe UI · 没写 font-family 时长什么样</div>
    </div>
    <div class="tag">对照</div>
  </header>
  <p class="vibe">这张卡不加载任何 @font-face。如果下面某张卡的样张长得和它一样，说明那款字体<b>没生效</b>（浏览器静默 fallback 了）。</p>
  <div class="stage">
    <div class="l38">${SAMPLE.big}</div>
    <div class="l22">${SAMPLE.mid}</div>
    <div class="l14">${SAMPLE.small}</div>
  </div>
  <p class="comment">留作基准线，别删。</p>
  <dl class="meta">
    <div><dt>授权</dt><dd class="lic">—</dd></div>
    <div><dt>来源</dt><dd>操作系统自带</dd></div>
    <div><dt>文件</dt><dd>—</dd></div>
    <div><dt>用法</dt><dd><code>font-family: system-ui</code></dd></div>
  </dl>
</section>`

const CSS = /* css */ `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 22px 26px 48px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: system-ui, 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 17px; font-weight: 400; margin: 0 0 4px; }
.hint { font-size: 12px; color: var(--dsw-alias-label-caption); margin: 0 0 20px; line-height: 1.75; max-width: 1180px; }
.hint a { color: var(--dsw-alias-button-primary-fill); }
.hint b { color: var(--dsw-alias-label-primary); font-weight: 500; }

.fontStatus {
  font-size: 11.5px; line-height: 1.7; margin: -12px 0 18px;
  padding: 7px 11px; border-radius: 10px; max-width: 1180px;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  border: .5px solid var(--dsw-alias-border-l2);
  word-break: break-all;
}
.fontStatus.ok  { border-color: #93ceaa; background: color-mix(in srgb, #6fce93 12%, transparent); }
.fontStatus.bad { border-color: #e8c37a; background: color-mix(in srgb, #e8b95a 16%, transparent); }

.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }

.card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 16px; padding: 12px 15px 13px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 62%, #fff 38%);
  display: flex; flex-direction: column;
}
body[data-ds-dark-theme] .card { background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, #fff 14%); }
.card.control { border-style: dashed; opacity: .92; }

.card header { display: flex; align-items: baseline; gap: 9px; }
.idx {
  font-size: 11px; font-variant-numeric: tabular-nums; color: #fff;
  background: var(--dsw-alias-button-primary-fill);
  border-radius: 7px; padding: 2px 6px; flex: none;
}
.card.control .idx { background: var(--dsw-alias-label-caption); }
.titles { flex: 1; min-width: 0; }
h2.zh { font-size: 20px; font-weight: 400; margin: 0; line-height: 1.25; }
.latin { font-size: 11px; color: var(--dsw-alias-label-caption); margin-top: 1px; }
.latin .fam { font-family: ui-monospace, Consolas, monospace; }
.tag {
  flex: none; font-size: 11px; padding: 2px 9px; border-radius: 999px;
  color: var(--dsw-alias-button-primary-fill);
  border: .5px solid color-mix(in srgb, var(--dsw-alias-button-primary-fill) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 9%, transparent);
}

.vibe { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); margin: 7px 0 9px; line-height: 1.62; }

/* 样张舞台：樱花麻薯主题的粉底 + 三档字号 */
.stage {
  border-radius: 12px; padding: 11px 14px 12px;
  background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 7%, var(--dsw-alias-bg-base));
  border: .5px solid color-mix(in srgb, var(--dsw-alias-button-primary-fill) 20%, transparent);
}
body[data-ds-dark-theme] .stage { background: color-mix(in srgb, var(--dsw-alias-button-primary-fill) 12%, #000 4%); }
.l38 { font-size: 38px; line-height: 1.28; color: var(--dsw-alias-label-primary); }
.l22 { font-size: 22px; line-height: 1.38; color: var(--dsw-alias-button-primary-fill); margin-top: 3px; }
.l14 { font-size: 14px; line-height: 1.45; color: var(--dsw-alias-label-tertiary); margin-top: 5px; }
.sizeNote { font-size: 10px; color: var(--dsw-alias-label-caption); margin: 4px 0 0; }

.comment { font-size: 11px; color: var(--dsw-alias-label-caption); margin: 7px 0 0; line-height: 1.55; }

.meta { margin: 8px 0 0; font-size: 11px; display: grid; gap: 2px; }
.meta > div { display: flex; gap: 8px; }
.meta dt { flex: none; width: 30px; color: var(--dsw-alias-label-caption); }
.meta dd { margin: 0; min-width: 0; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.meta dd.lic { color: var(--dsw-alias-label-tertiary); }
.meta a { color: var(--dsw-alias-button-primary-fill); text-decoration: none; }
.meta a:hover { text-decoration: underline; }
.meta code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  border-radius: 4px; padding: 0 4px; word-break: break-all;
}
.meta b { font-weight: 500; color: var(--dsw-alias-label-primary); }
.meta .warn { color: var(--dsw-alias-label-caption); }

.covBadge {
  display: inline-block; margin-left: 2px; padding: 0 6px; border-radius: 999px;
  font-size: 10.5px; white-space: nowrap;
}
.covBadge.ok  { color: #1f6b3a; background: #d8f2e0; border: .5px solid #93ceaa; }
.covBadge.bad { color: #8a5a12; background: #ffe9bd; border: .5px solid #e8c37a; }
body[data-ds-dark-theme] .covBadge.ok  { color: #a7e8bf; background: #14301f; border-color: #2f6b45; }
body[data-ds-dark-theme] .covBadge.bad { color: #ffd79a; background: #4a3413; border-color: #7a5a1e; }

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

.foot {
  margin-top: 18px; padding: 14px 18px 16px;
  border: .5px dashed var(--dsw-alias-border-l2); border-radius: 16px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, #fff 30%);
}
body[data-ds-dark-theme] .foot { background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, #fff 12%); }
.foot h3 {
  font-size: 12px; font-weight: 500; margin: 12px 0 5px;
  color: var(--dsw-alias-button-primary-fill);
}
.foot h3:first-child { margin-top: 0; }
.foot ul { margin: 0; padding-left: 17px; }
.foot li { font-size: 11.5px; line-height: 1.78; color: var(--dsw-alias-label-secondary); }
.foot b { font-weight: 500; color: var(--dsw-alias-label-primary); }
.foot code {
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  border-radius: 4px; padding: 0 4px;
}
`

const totalBytes = fonts.reduce((a, f) => a + f.bytes, 0)
const slicedCount = fonts.filter(f => f.sliced).length

const FOOT = `
<section class="foot">
  <h3>怎么挑</h3>
  <ul>
    <li><b>38px 当前歌词</b>：优先 05 霞鹜漫黑、06 悠哉字体、01 清松手写体6 —— 手写感在整句上最耐看，而且笔画粗细撑得住大字号。</li>
    <li><b>22px 下一句</b>：07 荆南波波黑、03 黑糖话梅 更规整，字号小下来仍然清楚。</li>
    <li><b>做歌名/标题</b>：02 站酷快乐体、04 站酷庆科黄油体、08 得意黑 是美术字，天生不适合正文，但做标题一眼就跳出来。</li>
    <li><b>14px 辅助小字</b>：这几款都不太适合当正文 —— 手写体的小字会糊。建议小字仍用现成的黑体，只把歌词/歌名换掉。</li>
  </ul>

  <h3>接进播放器要注意</h3>
  <ul>
    <li>本页 ${fonts.length} 款 TTF 合计 <b>${kb(totalBytes)}</b>（其中 ${slicedCount} 款已经是 woff2 切片）。整包塞进播放器太重，
        正式接入前建议<b>按实际用到的字做子集化</b>，或者直接抄 06 悠哉字体的做法（<code>font.css</code> + 按 unicode-range 分片，用到哪个字才下哪个包）。</li>
    <li>每款字体目录里都留了 <code>OFL.txt</code>（或 <code>README.md</code>），分发时要一起带上 —— SIL OFL 要求保留授权文件。</li>
    <li>SIL OFL 允许商用、修改、再分发，但<b>不能拿衍生物单独卖字库</b>，也不能用作者名做背书。</li>
  </ul>

  <h3>已知问题</h3>
  <ul>
    <li><b>01 清松手写体6 是繁体字库</b>：样张里的「过」「罢」它没有字形（简体「过」对应繁体「過」），会掉回系统字体。
        简体歌词里「过」出现频率很高，要用的话得接受偶发掉字，或只拿它排歌名。它的加字版 6p 也一样缺。</li>
    <li>样张标点统一用 <code>•</code>（U+2022）而不是 <code>·</code>：普查发现 <code>·</code> 在 01 和 04 里没有字形，
        用它会单个字符 fallback，看起来像"字体没生效"，白白误导人。</li>
  </ul>
</section>`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>可爱/俏皮中文字体 · 对比样张</title>
<style>
${faceCss}
</style>
<style>
:root {
  --fallback: 'Microsoft YaHei', system-ui, sans-serif;
  --dsw-elevation-stroke-color: rgba(0,0,0,.06);
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

<h1>可爱 / 俏皮中文字体 · ${fonts.length} 款（+1 对照）</h1>
<p class="hint">
  全部 <b>免费可商用</b>，以 <b>SIL Open Font License 1.1</b> 为主，已连同 OFL 授权文件一起放在
  <code>assets/fonts/cute/</code> 下。<br>
  每张卡按播放器真实字号渲染：<b>38px</b> 当前歌词 / <b>22px</b> 下一句歌词 / <b>14px</b> 辅助信息 ——
  同一句中文、一句英文、一串数字标点都过一遍。<br>
  第 <b>00</b> 张是系统默认对照：哪张卡和它长得像，哪张就是没生效。
  字体文件合计 <b>${kb(totalBytes)}</b>，按相对路径 <code>./assets/fonts/cute/…</code> 引用（没有 base64 内联）。
</p>
<p class="fontStatus" id="fontStatus">浏览器实测：正在加载字体…</p>

<div class="grid">
${control}
${fonts.map(card).join('\n')}
</div>

${FOOT}

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
// ?theme=dark 方便无头截图直接拍暗色（headless 点不了按钮）
apply(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light')

// 用浏览器自己的字体表核对一遍：document.fonts.check 会真的去要这个字体的字形，
// 比"看起来像"可靠。结果写进 DOM，无头截图 --dump-dom 也能直接读出来。
document.fonts.ready.then(() => {
  const fams = ${JSON.stringify(fonts.map(f => ({ family: f.family, name: f.name })))}
  const rows = fams.map(f => f.name + '=' + (document.fonts.check('38px "' + f.family + '"') ? 'OK' : 'MISSING'))
  const okCount = rows.filter(r => r.endsWith('OK')).length
  const el = document.getElementById('fontStatus')
  el.textContent = '浏览器实测：' + okCount + '/' + fams.length + ' 款已加载 · ' + rows.join(' · ')
  el.classList.add(okCount === fams.length ? 'ok' : 'bad')
  document.body.dataset.fontcheck = rows.join('|')
  console.log('[font-lab] ' + rows.join(' | '))
})
</script>
</body>
</html>
`

const out = join(ROOT, 'labs', 'cute-font-lab.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}`)
console.log(`  ${fonts.length} 款字体 + 1 对照，合计 ${kb(totalBytes)}`)
fonts.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')} ${f.name} — ${f.file} ${kb(f.bytes)} [${f.license.slice(0, 24)}]`))
