/*
 * 从 Safebooru 抓铃兰二创 · fetch fanart
 * ------------------------------------
 * Safebooru 是唯一能通的图库（Danbooru/Konachan/yande.re 都连不上）。
 * API：index.php?page=dapi&s=post&q=index&json=1
 *
 * 用法：node --use-system-ca theme-lab/fetch-fanart.mjs [数量]
 * 产物：theme-lab/characters/fanart/*.jpg + 索引 json
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'dsh-research/1.0 (personal music player overlay)'
const OUT = 'D:/deepseek_harness/theme-lab/characters/fanart'
const WANT = Number(process.argv[2] ?? 12)

mkdirSync(OUT, { recursive: true })

const TAGS = 'suzuran_(arknights)'
const API = 'https://safebooru.org/index.php'
const IMG_BASE = 'https://safebooru.org/images'

/** 拉一页。注意 Safebooru 图片路径是 /images/<md5前2位>/<md5后2位>/<md5>.jpg */
async function fetchPage(pid) {
  const url = `${API}?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(TAGS)}&limit=100&pid=${pid}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`非 JSON（${text.length}B）: ${text.slice(0, 80)}`) }
  return Array.isArray(j) ? j : []
}

/** 由 md5 拼出完整图片地址。 */
function imageUrl(md5, ext = 'jpg') {
  return `${IMG_BASE}/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.${ext}`
}

console.log('拉取列表...')
let posts = []
for (let pid = 0; pid < 3 && posts.length < 300; pid++) {
  try {
    const page = await fetchPage(pid)
    console.log(`  pid=${pid}: ${page.length} 条`)
    if (page.length === 0) break
    posts.push(...page)
  } catch (e) {
    console.log(`  pid=${pid} 失败：${e.message}`)
  }
  await new Promise(r => setTimeout(r, 1200))
}

console.log(`\n共 ${posts.length} 条`)

// 按分辨率排序，挑大的；只要够大的（适合放播放器左栏）
const usable = posts
  .filter(p => Number(p.width) >= 800 && Number(p.height) >= 800)
  .map(p => ({
    id: p.id,
    w: Number(p.width),
    h: Number(p.height),
    ratio: Number(p.width) / Number(p.height),
    rating: p.rating,
    tags: p.tags,
    source: p.source,
    url: p.file_url,
  }))
  .sort((a, b) => (b.w * b.h) - (a.w * a.h))

console.log(`可用（≥800px）${usable.length} 条，按分辨率排序，前 8：`)
for (const p of usable.slice(0, 8)) {
  console.log(`  ${String(p.w).padStart(5)}x${String(p.h).padStart(5)}  比例 ${p.ratio.toFixed(2)}  #${p.id}`)
}

// 下载前 WANT 张
console.log(`\n下载前 ${WANT} 张...`)
const index = []
for (const p of usable.slice(0, WANT)) {
  const ext = p.url.split('.').pop()
  const file = `suzuran_${p.id}_${p.w}x${p.h}.${ext}`
  const out = join(OUT, file)
  if (existsSync(out)) { console.log(`  跳过 ${file}`); index.push({ ...p, file }); continue }
  try {
    const res = await fetch(p.url, { headers: { 'User-Agent': UA, Referer: 'https://safebooru.org/' } })
    if (!res.ok) { console.log(`  ✗ #${p.id} HTTP ${res.status}`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2000) { console.log(`  ✗ #${p.id} 内容太小（${buf.length}B）`); continue }
    writeFileSync(out, buf)
    console.log(`  ✓ ${file.padEnd(36)} ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
    index.push({ ...p, file })
  } catch (e) {
    console.log(`  ✗ #${p.id} ${e.message.slice(0, 50)}`)
  }
  await new Promise(r => setTimeout(r, 800))
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1), 'utf8')
console.log(`\n已下载 ${index.length} 张 → ${OUT}`)
