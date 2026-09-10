/*
 * 定位铃兰立绘 · find suzuran v2
 * 用 GitHub contents API 分页列出 charpor/，筛出铃兰（内部代号 lisa / 编号 358）。
 *
 * 用法：node --use-system-ca lyric-overlay/tools/find-suzuran.mjs
 */

const HEADERS = { 'User-Agent': 'dsh-research', Accept: 'application/vnd.github+json' }
const API = 'https://api.github.com/repos/fexli/ArknightsResource/contents/charpor'

async function listAll() {
  const out = []
  for (let page = 1; page <= 6; page++) {
    const url = `${API}?ref=main&per_page=1000&page=${page}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) { console.log(`  第 ${page} 页 HTTP ${res.status}`); break }
    const j = await res.json()
    if (!Array.isArray(j) || j.length === 0) break
    out.push(...j.map(f => ({ name: f.name, size: f.size, path: f.path })))
    console.log(`  第 ${page} 页 ${j.length} 项（累计 ${out.length}）`)
    if (j.length < 1000) break
  }
  return out
}

console.log('列出 charpor/ ...')
const all = await listAll()
console.log(`共 ${all.length} 个文件\n`)

const lisa = all.filter(f => /lisa|358/i.test(f.name))
console.log(`铃兰相关（${lisa.length} 个）：`)
for (const f of lisa) console.log(`  ${(f.size / 1024).toFixed(0).padStart(6)} KB  ${f.name}`)

// 顺便看看命名规律（拿几个样例）
console.log('\n命名规律样例（前 6 个）：')
for (const f of all.slice(0, 6)) console.log(`  ${f.name}`)
