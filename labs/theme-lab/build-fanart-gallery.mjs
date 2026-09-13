/*
 * 二创画廊 · fanart gallery
 * ------------------------
 * 用法：node theme-lab/build-fanart-gallery.mjs
 * 产物：theme-lab/fanart-gallery.html
 */

import { readdirSync, writeFileSync, statSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, basename } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, 'characters', 'fanart')
const THUMBS = join(HERE, 'characters', 'fanart-thumb')
mkdirSync(THUMBS, { recursive: true })

/** 读 PNG / JPEG 尺寸。 */
function size(buf, ext) {
  if (ext === '.png' && buf.slice(1, 4).toString() === 'PNG') {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  return null
}

const index = existsSync(join(DIR, 'index.json'))
  ? JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'))
  : []
const byFile = new Map(index.map(x => [x.file, x]))

const files = readdirSync(DIR).filter(f => /\.(png|jpe?g|webp)$/i.test(f))
const items = []
for (const f of files) {
  const buf = readFileSync(join(DIR, f))
  const sz = size(buf, extname(f).toLowerCase())
  const meta = byFile.get(f)
  items.push({
    file: f,
    w: sz?.w ?? meta?.w ?? 0,
    h: sz?.h ?? meta?.h ?? 0,
    mb: statSync(join(DIR, f)).size / 1024 / 1024,
    id: meta?.id,
    source: meta?.source,
    tags: (meta?.tags ?? '').split(' ').filter(t => !t.includes('(') && t.length > 2).slice(0, 10).join(' '),
  })
}
items.sort((a, b) => b.w * b.h - a.w * a.h)

const cards = items.map((it, i) => `
<section class="card">
  <div class="shot">
    <img src="./characters/fanart/${encodeURIComponent(it.file)}" alt="铃兰二创 ${i + 1}" loading="lazy">
  </div>
  <div class="meta">
    <span class="idx">${String(i + 1).padStart(2, '0')}</span>
    <span class="dim">${it.w}×${it.h}</span>
    <span class="mb">${it.mb.toFixed(1)} MB</span>
    ${it.id ? `<span class="src">Safebooru #${it.id}</span>` : ''}
  </div>
  <div class="tags">${it.tags}</div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>铃兰 · 二创素材</title>
<style>
@font-face { font-family: 'KN Maiyuan'; src: url('./fonts/raw/KNMaiyuan-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 26px 30px 60px;
  background: #fff9fa; color: #3b2830;
  font-family: 'KN Maiyuan', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}
h1 { font-size: 17px; font-weight: 400; margin: 0 0 4px; }
.hint { font-size: 12px; color: #9b7f8b; margin: 0 0 22px; line-height: 1.7; }
.hint a { color: #ef7d9a; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 18px; }
.card {
  border: .5px solid rgba(59,40,48,.1); border-radius: 18px;
  padding: 12px 14px 14px; background: rgba(255,255,255,.72);
}
.shot {
  border-radius: 12px; overflow: hidden; background: #f6eef1;
  display: flex; align-items: center; justify-content: center;
  height: 420px;
}
.shot img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; display: block; }
.meta {
  display: flex; align-items: baseline; gap: 10px; margin-top: 10px;
  font-size: 12px; color: #6b5560; font-variant-numeric: tabular-nums;
}
.idx { font-size: 15px; color: #ef7d9a; }
.dim { color: #3b2830; }
.src { margin-left: auto; color: #b9a3ac; font-size: 11px; }
.tags { margin-top: 5px; font-size: 11px; color: #b9a3ac; line-height: 1.5; word-break: break-all; }
</style>
</head>
<body>
<h1>铃兰 · 二创素材（${items.length} 张）</h1>
<p class="hint">
  来源：<a href="https://safebooru.org/index.php?page=post&s=list&tags=suzuran_%28arknights%29">Safebooru</a>
  （用 <code>suzuran_(arknights)</code> 标签检索，按分辨率从高到低）。
  原图多为 Pixiv 作品，出处见每张的 source 字段（存在 <code>characters/fanart/index.json</code>）。
  <b>仅供个人使用，不要再分发或商用。</b>
</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`

const out = join(HERE, 'fanart-gallery.html')
writeFileSync(out, html, 'utf8')
console.log(`wrote ${out}  (${items.length} 张)`)
for (const it of items) console.log(`  ${String(it.w).padStart(5)}x${String(it.h).padStart(5)}  ${it.mb.toFixed(1).padStart(5)} MB  ${it.file}`)
