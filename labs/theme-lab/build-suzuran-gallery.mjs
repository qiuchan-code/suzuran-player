/*
 * 下载铃兰全部立绘 + 生成对比页 · suzuran gallery
 * ---------------------------------------------
 * 用法：node --use-system-ca theme-lab/build-suzuran-gallery.mjs
 * 产物：theme-lab/suzuran-gallery.html
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = join(HERE, 'characters')
const FULLDIR = join(OUTDIR, 'full')
mkdirSync(FULLDIR, { recursive: true })

const BASE = 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/charpack'

/** 铃兰的 5 套立绘（高清版，不含 b 拆层）。 */
const SKINS = [
  { file: 'char_358_lisa_1.png', name: '精英 0 · 基础立绘', note: '初始立绘，蓝白连衣裙 + 法杖' },
  { file: 'char_358_lisa_2.png', name: '精英 2 · 精二立绘', note: '精二，白紫礼裙，气场更足' },
  { file: 'char_358_lisa_epoque_22.png', name: '皮肤 · 时代系列 22', note: '时代（EPOQUE）系列' },
  { file: 'char_358_lisa_lxh_1.png', name: '皮肤 · lxh 系列', note: '和风 / 新年风格' },
  { file: 'char_358_lisa_wild_3.png', name: '皮肤 · WILD 系列 3', note: '野外 / 冒险风格' },
]

/** 读 PNG 尺寸。 */
function pngSize(buf) {
  if (buf.length < 24) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

console.log('检查/下载立绘...')
for (const s of SKINS) {
  const out = join(FULLDIR, s.file)
  if (existsSync(out)) {
    const buf = readFileSync(out)
    const sz = pngSize(buf)
    console.log(`  已有 ${s.file.padEnd(32)} ${sz ? sz.w + 'x' + sz.h : '?'}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
    s.local = './characters/full/' + s.file
    s.size = sz
    continue
  }
  try {
    const res = await fetch(`${BASE}/${s.file}`, { headers: { 'User-Agent': 'dsh-research' } })
    if (!res.ok) { console.log(`  ✗ ${s.file} HTTP ${res.status}`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(out, buf)
    const sz = pngSize(buf)
    s.local = './characters/full/' + s.file
    s.size = sz
    console.log(`  ✓ ${s.file.padEnd(32)} ${sz ? sz.w + 'x' + sz.h : '?'}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
  } catch (e) {
    console.log(`  ✗ ${s.file}  ${e.message.slice(0, 50)}`)
  }
}

const available = SKINS.filter(s => s.local)

const cards = available.map(s => `
<section class="card">
  <header>
    <h2>${s.name}</h2>
    <p class="note">${s.note} · ${s.size ? s.size.w + '×' + s.size.h : ''} · ${(statSync(join(FULLDIR, s.file)).size / 1024 / 1024).toFixed(1)} MB</p>
  </header>
  <div class="shot">
    <img src="${s.local}" alt="${s.name}">
  </div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>铃兰 · 立绘素材</title>
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
.hint { font-size: 12px; color: #9b7f8b; margin: 0 0 24px; line-height: 1.7; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
.card {
  border: .5px solid rgba(59,40,48,.1); border-radius: 20px;
  padding: 16px 18px 18px; background: rgba(255,255,255,.7);
}
.card h2 { font-size: 14px; font-weight: 400; margin: 0 0 3px; }
.note { font-size: 11.5px; color: #9b7f8b; margin: 0 0 14px; }
.shot {
  border-radius: 14px; overflow: hidden;
  /* 棋盘格底，方便看透明区域 */
  background-color: #fff;
  background-image:
    linear-gradient(45deg, rgba(239,125,154,.07) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(239,125,154,.07) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(239,125,154,.07) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(239,125,154,.07) 75%);
  background-size: 18px 18px;
  background-position: 0 0, 0 9px, 9px -9px, -9px 0px;
  display: flex; align-items: center; justify-content: center;
  min-height: 300px; padding: 8px;
}
.shot img { display: block; max-width: 100%; max-height: 460px; object-fit: contain; }
</style>
</head>
<body>
<h1>铃兰（Suzuran / char_358_lisa）· 立绘素材</h1>
<p class="hint">
  来源：<a href="https://github.com/fexli/ArknightsResource">fexli/ArknightsResource</a> 的 charpack（游戏原生素材）。<br>
  棋盘格底表示透明背景 —— 立绘可以直接叠在播放器界面上，不用抠图。共 ${available.length} 套。
</p>
<div class="grid">
${cards}
</div>
</body>
</html>
`

const out = join(HERE, 'suzuran-gallery.html')
writeFileSync(out, html, 'utf8')
console.log(`\nwrote ${out}  (${Skins_count()} 套)`)
function Skins_count() { return available.length }
