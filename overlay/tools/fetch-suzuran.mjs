/*
 * 下载铃兰的高清立绘并读数尺寸 · suzuran fetch
 * 用法：node --use-system-ca lyric-overlay/tools/fetch-suzuran.mjs
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const HEADERS = { 'User-Agent': 'dsh-research', Accept: 'application/vnd.github+json' }
const OUT = 'D:/deepseek_harness/theme-lab/characters/raw'
mkdirSync(OUT, { recursive: true })

/** 读 PNG 尺寸。 */
function pngSize(buf) {
  if (buf.length < 24) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/** 列出 charpack 全部文件名。 */
async function listCharpack() {
  const out = []
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`https://api.github.com/repos/fexli/ArknightsResource/contents/charpack?ref=main&per_page=1000&page=${page}`, { headers: HEADERS })
    if (!res.ok) break
    const j = await res.json()
    if (!Array.isArray(j) || j.length === 0) break
    out.push(...j.map(f => ({ name: f.name, size: f.size })))
    if (j.length < 1000) break
  }
  return out
}

console.log('列出 charpack/ ...')
const all = await listCharpack()
const lisa = all.filter(f => /lisa|358/i.test(f.name))
console.log(`共 ${all.length} 个文件，铃兰相关 ${lisa.length} 个：`)
for (const f of lisa) console.log(`  ${(f.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${f.name}`)

console.log('\n下载铃兰立绘...')
const targets = lisa.length > 0
  ? lisa.map(f => f.name)
  : ['char_358_lisa_1.png', 'char_358_lisa_2.png']

for (const name of targets) {
  const url = `https://raw.githubusercontent.com/fexli/ArknightsResource/main/charpack/${name}`
  const out = join(OUT, 'full_' + name)
  if (existsSync(out)) { console.log(`  跳过（已存在） ${name}`); continue }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'dsh-research' } })
    if (!res.ok) { console.log(`  ✗ ${name} HTTP ${res.status}`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(out, buf)
    const size = pngSize(buf)
    console.log(`  ✓ ${name.padEnd(34)} ${size ? size.w + 'x' + size.h : '?'}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
  } catch (e) {
    console.log(`  ✗ ${name} ${e.message.slice(0, 50)}`)
  }
}
