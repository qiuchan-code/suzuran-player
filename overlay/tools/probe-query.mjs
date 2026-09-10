/*
 * 查询写法对照 · query form test
 * -----------------------------
 * 同一首歌，试几种查询写法，看到底哪种能搜到。
 *
 * 用法：node lyric-overlay/tools/probe-query.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

async function search(query, num = 10) {
  const body = {
    comm: { ct: 19, cv: 1859 },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: num, page_num: 1, query, search_type: 0 },
    },
  }
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body))}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { return { err: `非JSON(${text.length}B)` } }
  const list = j?.req?.data?.body?.song?.list ?? []
  return { list, code: j?.req?.code }
}

const CASES = [
  { title: '晴天', artist: '周杰伦' },
  { title: '奔跑', artist: '黄征/羽泉' },
  { title: '起风了', artist: '买辣椒也用券' },
]

for (const c of CASES) {
  console.log(`\n=== ${c.title} / ${c.artist} ===`)
  const forms = [
    ['歌名+歌手', `${c.title} ${c.artist}`],
    ['仅歌名', c.title],
    ['仅歌手', c.artist],
    ['歌名空格', c.title.split('').join(' ')],
  ]
  for (const [label, q] of forms) {
    const t0 = Date.now()
    const r = await search(q)
    const ms = Date.now() - t0
    if (r.err) { console.log(`  ${label.padEnd(10)} ✗ ${r.err} (${ms}ms)`); continue }
    console.log(`  ${label.padEnd(10)} ${r.list.length === 0 ? '0 条' : r.list.length + ' 条'}  code=${r.code}  (${ms}ms)`)
    r.list.slice(0, 3).forEach(s => console.log(`       ${JSON.stringify(s.name)} - ${(s.singer || []).map(x => x.name).join('/')}`))
    await new Promise(r => setTimeout(r, 900))
  }
  await new Promise(r => setTimeout(r, 1500))
}
