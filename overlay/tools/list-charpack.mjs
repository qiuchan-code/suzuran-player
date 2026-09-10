/*
 * 列全 charpack，找铃兰所有皮肤 · all suzuran skins
 * 用法：node --use-system-ca lyric-overlay/tools/list-charpack.mjs [关键词]
 */

const HEADERS = { 'User-Agent': 'dsh-research', Accept: 'application/vnd.github+json' }
const KEY = process.argv[2] ?? 'lisa'

const out = []
for (let page = 1; page <= 12; page++) {
  const res = await fetch(`https://api.github.com/repos/fexli/ArknightsResource/contents/charpack?ref=main&per_page=1000&page=${page}`, { headers: HEADERS })
  if (!res.ok) { console.log(`page ${page}: HTTP ${res.status}`); break }
  const j = await res.json()
  if (!Array.isArray(j) || j.length === 0) break
  out.push(...j.map(f => ({ name: f.name, size: f.size })))
  if (j.length < 1000) break
}

console.log(`charpack 共 ${out.length} 个文件\n`)

const hits = out.filter(f => new RegExp(KEY, 'i').test(f.name))
console.log(`含 "${KEY}" 的（${hits.length} 个）：`)
for (const f of hits) console.log(`  ${(f.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${f.name}`)

if (hits.length === 0) {
  console.log('\n样例命名（前 20）：')
  out.slice(0, 20).forEach(f => console.log('  ' + f.name))
  // 看看有没有 amiYa 之外的命名方式
  const pats = {}
  for (const f of out) {
    const m = f.name.match(/^(char_\d+_[a-z]+)/i)
    if (m) pats[m[1]] = (pats[m[1]] ?? 0) + 1
  }
  const keys = Object.keys(pats)
  console.log(`\n共 ${keys.length} 个不同干员代号。编号 350-370 的：`)
  for (const k of keys) {
    const n = Number(k.match(/char_(\d+)/)?.[1])
    if (n >= 350 && n <= 370) console.log(`  ${k}  (${pats[k]} 个文件)`)
  }
}
