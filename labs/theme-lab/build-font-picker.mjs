/*
 * 生成自包含的字体样张页 · self-contained specimens
 * ------------------------------------------------
 * 把每款字体「样张文字实际用到的分片」以 base64 内联进 HTML，
 * 生成一个双击就能看的单文件页（不依赖本地服务、不联网）。
 *
 * 用法：node theme-lab/build-font-picker.mjs
 * 产物：theme-lab/font-picker.html
 */

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONTS = join(HERE, 'fonts')

const CANDIDATES = [
  // 圆体系（按圆润/日常程度排序）
  { ttf: 'raw/KNMaiyuan-Regular.ttf', family: 'KN Maiyuan', name: '荆南麦圆体', note: '笔画粗细一致、两端圆润，清新俏皮（SIL OFL 开源）' },
  { ttf: 'raw/jf-openhuninn-2.1.ttf', family: 'jf open 粉圆', name: 'jf open 粉圆', note: '经典可爱圆体，笔画饱满、字面圆润（SIL OFL 开源）' },
  { dir: 'cn-fontsource-maoken-zhuyuan-ti-regular', name: '猫啃珠圆体', note: '圆润饱满的标题圆体（你选中的基准）' },
  { dir: 'cn-fontsource-975-maru-sc-regular', name: '975 圆体', note: '基于思源黑体 + 狮尾圆体，笔画最匀' },
  { dir: 'cn-fontsource-975-maru-sc-medium-regular', name: '975 圆体 Medium', note: '同上，笔画略粗，小字号更清晰' },
  { dir: 'cn-fontsource-975-maru-sc-bold', name: '975 圆体 Bold', note: '同上，粗体，大字歌词有分量' },
  { dir: 'cn-fontsource-logo-sc-long-zhu-ti-zhs-regular', name: '龙珠体', note: '圆润标题体，字面饱满，重心偏上' },
  { dir: 'cn-fontsource-mdmd-wu-feng-ti-regular', name: '无锋体', note: '浑圆无折角、没有笔锋，最干净' },
  { dir: 'cn-fontsource-ding-talk-jin-bu-ti-regular', name: '钉Talk进步体', note: '圆润现代，字面偏小、留白多' },
  { dir: 'builtin-wenkai', name: '霞鹜文楷（现用）', note: '当前方案，作为对照' },
]

const LYRICS = {
  now: '我所到之处留下的回忆都是你',
  mid: ['昏暗的光影 脚步声也清晰', '你的心扑通扑通钻进我脑里'],
  next: '晚风吹过 云朵朵',
  latin: 'I keep going back to when I laid eyes on you',
  nums: '0:30 / 3:33　128kbps　2026',
  punct: '！？，。、；：""\'\'（）——…·～',
}

/** 样张页上出现的全部字符（用来判断哪些分片需要内联）。 */
const ALL_TEXT = [LYRICS.now, ...LYRICS.mid, LYRICS.next, LYRICS.latin, LYRICS.nums, LYRICS.punct].join('')

/** 解析 font.css，返回 [{ url, unicodeRanges }]。 */
function parseFaces(css) {
  const faces = []
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1]
    const urlM = /url\((['"]?)([^)'"]+)\1\)/.exec(body)
    const rangeM = /unicode-range\s*:\s*([^;]+);/.exec(body)
    if (urlM === null) continue
    faces.push({
      url: urlM[2].trim(),
      ranges: rangeM === null ? [] : rangeM[1].split(',').map(s => s.trim()).filter(Boolean),
    })
  }
  return faces
}

/** 一个 unicode-range 项是否覆盖某码点。 */
function covers(range, cp) {
  // 形如 U+4E00 或 U+4E00-4E0F 或 U+4E??
  const m = /^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/.exec(range.trim())
  if (m === null) return false
  const startRaw = m[1]
  if (startRaw.includes('?')) {
    const lo = parseInt(startRaw.replace(/\?/g, '0'), 16)
    const hi = parseInt(startRaw.replace(/\?/g, 'F'), 16)
    return cp >= lo && cp <= hi
  }
  const lo = parseInt(startRaw, 16)
  const hi = m[2] === undefined ? lo : parseInt(m[2], 16)
  return cp >= lo && cp <= hi
}

/** 该字体里，样张文字用到的分片。 */
function neededFaces(faces) {
  const cps = [...new Set([...ALL_TEXT].map(c => c.codePointAt(0)))]
  return faces.filter(f => f.ranges.length === 0 || cps.some(cp => f.ranges.some(r => covers(r, cp))))
}

/** 读成 base64 data URI（按扩展名给 MIME）。 */
function toDataUri(path) {
  const buf = readFileSync(path)
  return `data:font/woff2;base64,${buf.toString('base64')}`
}

/** 任意字体文件的 data URI。 */
function toDataUriAny(path) {
  const buf = readFileSync(path)
  const mime = path.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf'
  return `data:${mime};base64,${buf.toString('base64')}`
}

const blocks = []
let totalBytes = 0

/** 本页全部字体都内联，不依赖联网。 */
const webLinks = ''

for (const c of CANDIDATES) {
  if (c.dir === 'builtin-wenkai') {
    // 文楷是单个 TTF，内联体积太大，这里只声明本地相对路径（预览页同目录取不到就退回系统字体）
    blocks.push({
      ...c,
      family: "'LXGW WenKai GB Lite'",
      css: `@font-face { font-family: 'LXGW WenKai GB Lite'; src: url('./fonts/LXGWWenKaiGBLite-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }`,
      note: c.note + '（内联体积太大，此处按相对路径加载，文件缺失时退回系统字体）',
    })
    continue
  }

  // 整包 TTF（荆南麦圆体、jf open 粉圆）：内联会让页面膨胀到 20MB+，
  // 改用相对路径——预览页与 fonts/ 同目录，双击也能加载。
  if (c.ttf !== undefined) {
    const p = join(FONTS, c.ttf)
    if (!existsSync(p)) { console.log(`  ✗ 缺少 ${c.ttf}`); continue }
    const size = statSync(p).size
    blocks.push({
      ...c,
      family: `'${c.family}'`,
      css: `@font-face { font-family: '${c.family}'; src: url('./fonts/${c.ttf}') format('truetype'); font-weight: 400; font-display: swap; }`,
    })
    console.log(`  ✓ ${c.name.padEnd(12)} family=${c.family.padEnd(24)} 相对路径 TTF  ${(size / 1024).toFixed(0)} KB`)
    continue
  }

  const cssPath = join(FONTS, c.dir, 'font.css')
  if (!existsSync(cssPath)) { console.log(`  ✗ 缺少 ${c.dir}`); continue }

  const css = readFileSync(cssPath, 'utf8')
  const familyM = /font-family\s*:\s*['"]?([^'";]+)['"]?\s*;/.exec(css)
  const family = familyM === null ? null : familyM[1].trim()
  const faces = parseFaces(css)
  const need = neededFaces(faces)

  let bytes = 0
  const faceCss = need.map((f) => {
    const p = join(FONTS, c.dir, f.url.replace(/^\.\//, ''))
    if (!existsSync(p)) return null
    bytes += statSync(p).size
    const range = f.ranges.length > 0 ? `unicode-range: ${f.ranges.join(',')};` : ''
    return `@font-face { font-family: '${family}'; src: url('${toDataUri(p)}') format('woff2'); font-weight: 400; font-style: normal; font-display: block; ${range} }`
  }).filter(Boolean).join('\n')

  totalBytes += bytes
  blocks.push({ ...c, family: `'${family}'`, css: faceCss, faces: need.length })
  console.log(`  ✓ ${c.name.padEnd(12)} family=${family.padEnd(24)} 内联 ${String(need.length).padStart(3)}/${faces.length} 分片  ${(bytes / 1024).toFixed(0)} KB`)
}

const CARDS = blocks.map((b, i) => `
<section class="card" data-i="${i}">
  <header>
    <h2>${b.name}</h2>
    <p class="note">${b.note}</p>
  </header>
  <style>${b.css}</style>
  <div class="specimen" style="font-family: ${b.family}, 'Microsoft YaHei', sans-serif">
    <div class="tag">当前歌词 · 30px</div>
    <div class="big"><span class="now">${LYRICS.now}</span></div>

    <div class="tag">整句 · 22px</div>
    <div class="mid">${LYRICS.mid[0]}<br>${LYRICS.mid[1]}</div>

    <div class="tag">下一句 · 15px</div>
    <div class="small">下一句 · ${LYRICS.next}</div>

    <div class="tag">英文歌词 · 17px</div>
    <div class="latin">${LYRICS.latin}</div>

    <div class="tag">数字与标点</div>
    <div class="nums">${LYRICS.nums}</div>
    <div class="punct">${LYRICS.punct}</div>
  </div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>歌词字体候选 · 樱花麻薯</title>
${webLinks}
<style>
* { box-sizing: border-box; }
body {
  margin: 0; padding: 28px 30px 60px;
  background: #fff9fa; color: #3b2830;
  font-family: 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 17px; font-weight: 500; margin: 0 0 4px; }
.hint { font-size: 12px; color: #9b7f8b; margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; }
.card {
  border: .5px solid #4a24301f; border-radius: 18px; padding: 18px 20px 22px;
  background: #fff; box-shadow: 0 2px 10px #4a243014;
}
.card h2 { font-size: 14px; font-weight: 500; margin: 0 0 2px; }
.note { font-size: 11.5px; color: #9b7f8b; margin: 0 0 14px; }
.tag { font-size: 10.5px; color: #9b7f8b; letter-spacing: .04em; margin: 14px 0 4px; }
.big { font-size: 30px; line-height: 44px; }
.mid { font-size: 22px; line-height: 34px; }
.small { font-size: 15px; line-height: 26px; color: #6f5460; }
.latin { font-size: 17px; line-height: 26px; }
.nums { font-size: 15px; line-height: 24px; font-variant-numeric: tabular-nums; }
.punct { font-size: 15px; line-height: 24px; }
.now { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #ffeef1; }
</style>
</head>
<body>
<h1>歌词字体候选 · 樱花麻薯</h1>
<p class="hint">共 ${blocks.length} 款。字体已内联进本文件，双击即可打开，不联网也能看。</p>
<div class="grid">
${CARDS}
</div>
</body>
</html>
`

const out = join(HERE, 'font-picker.html')
writeFileSync(out, html, 'utf8')
console.log(`\nwrote ${out}`)
console.log(`大小：${(html.length / 1024 / 1024).toFixed(2)} MiB（内联字体 ${(totalBytes / 1024).toFixed(0)} KB）`)
