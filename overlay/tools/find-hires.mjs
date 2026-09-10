/*
 * 找铃兰的高清全身立绘 · find hi-res art
 * -------------------------------------
 * charpor/ 里是 180x360 小头像，不能用。这里探几个可能放全身立绘的地方：
 *   · 仓库里的其它目录
 *   · PRTS 的静态资源
 *
 * 用法：node --use-system-ca lyric-overlay/tools/find-hires.mjs
 */

const HEADERS = { 'User-Agent': 'dsh-research', Accept: 'application/vnd.github+json' }

/** 列出仓库某目录（分页拿全）。 */
async function listDir(dir) {
  const out = []
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://api.github.com/repos/fexli/ArknightsResource/contents/${dir}?ref=main&per_page=1000&page=${page}`, { headers: HEADERS })
    if (!res.ok) return { err: `HTTP ${res.status}`, list: out }
    const j = await res.json()
    if (!Array.isArray(j) || j.length === 0) break
    out.push(...j.map(f => ({ name: f.name, size: f.size, type: f.type })))
    if (j.length < 1000) break
  }
  return { list: out }
}

console.log('=== 仓库顶层目录 ===')
{
  const res = await fetch('https://api.github.com/repos/fexli/ArknightsResource/contents/?ref=main', { headers: HEADERS })
  const j = await res.json()
  for (const f of j) console.log(`  ${f.type === 'dir' ? '📁' : '  '} ${f.name}`)
}

for (const dir of ['avgs', 'charpack']) {
  console.log(`\n=== ${dir}/ 里找 lisa ===`)
  const { list, err } = await listDir(dir)
  if (err) { console.log('  ' + err); continue }
  console.log(`  共 ${list.length} 项`)
  const hits = list.filter(f => /lisa|358/i.test(f.name))
  if (hits.length === 0) {
    console.log('  无 lisa，样例命名：')
    list.slice(0, 5).forEach(f => console.log('    ' + f.name))
  } else {
    hits.slice(0, 20).forEach(f => console.log(`    ${(f.size / 1024).toFixed(0).padStart(7)} KB  ${f.name}`))
  }
}

console.log('\n=== PRTS 静态资源探测 ===')
const PRTS = [
  'https://media.prts.wiki/char_358_lisa/char_358_lisa_1.png',
  'https://media.prts.wiki/images/char_358_lisa/char_358_lisa_1.png',
  'https://static.prts.wiki/char_358_lisa/char_358_lisa_1.png',
  'https://media.prts.wiki/char_358_lisa/char_358_lisa_2.png',
]
for (const u of PRTS) {
  try {
    const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } })
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.status}  ${u}`)
  } catch (e) {
    console.log(`  ✗ ERR  ${u}  (${e.message.slice(0, 40)})`)
  }
}
