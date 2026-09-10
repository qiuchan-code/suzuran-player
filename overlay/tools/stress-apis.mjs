/*
 * 接口稳定性压测 · API stability
 * -----------------------------
 * 连续请求搜索接口与歌词接口多次，统计成功率与耗时分布。
 * 用来判断"经常显示不出歌词"到底是接口不稳、限流，还是本地的问题。
 *
 * 用法：node lyric-overlay/tools/stress-apis.mjs [次数]
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const N = Number(process.argv[2] ?? 10)

/** 搜索：新接口 musicu */
async function searchNew(query) {
  const body = {
    comm: { ct: 19, cv: 1859 },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: 10, page_num: 1, query, search_type: 0 },
    },
  }
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body))}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  const list = j?.req?.data?.body?.song?.list ?? []
  if (list.length === 0) throw new Error('空结果')
  return list
}

/** 搜索：旧接口 */
async function searchOld(query) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=10&w=${encodeURIComponent(query)}&format=json&cr=1&new_json=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const t = (await res.text()).trim()
  const j = JSON.parse(t.startsWith('callback(') ? t.slice(9).replace(/\)\s*;?\s*$/, '') : t)
  const list = j?.data?.song?.list ?? []
  if (list.length === 0) throw new Error('空结果')
  return list
}

/** 歌词 */
async function lyric(mid) {
  const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${mid}&format=json&nobase64=1`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  const lrc = j?.lyric ?? ''
  if (lrc === '') throw new Error('空歌词')
  return lrc
}

/** 跑一轮，统计。 */
async function bench(label, fn, times) {
  const results = []
  for (let i = 0; i < times; i++) {
    const t0 = Date.now()
    try {
      await fn()
      results.push({ ok: true, ms: Date.now() - t0 })
    } catch (e) {
      results.push({ ok: false, ms: Date.now() - t0, err: e.message })
    }
    await new Promise(r => setTimeout(r, 250))
  }
  const ok = results.filter(r => r.ok)
  const fail = results.filter(r => !r.ok)
  const ms = ok.map(r => r.ms).sort((a, b) => a - b)
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0
  const p95 = ms.length ? ms[Math.floor(ms.length * 0.95)] ?? ms[ms.length - 1] : 0
  console.log(`${ok.length === results.length ? '✓' : '✗'} ${label.padEnd(20)} 成功 ${ok.length}/${results.length}`
    + `  耗时 avg=${avg}ms p95=${p95}ms max=${ms[ms.length - 1] ?? 0}ms`)
  if (fail.length > 0) {
    const reasons = {}
    for (const f of fail) reasons[f.err] = (reasons[f.err] ?? 0) + 1
    console.log('      失败原因:', JSON.stringify(reasons))
  }
  return { ok: ok.length, total: results.length }
}

const QUERIES = ['月圆花开', '晴天 周杰伦', '奔跑 黄征', '起风了', '晚风告诉我']
const MIDS = ['0039MnYb0qxYhV', '000nGXrP4cV0UK', '001NG3dX3koNFt']

console.log(`每个接口各测 ${N} 次，间隔 250ms\n`)

await bench('新搜索 musicu', () => searchNew(QUERIES[Math.floor(Math.random() * QUERIES.length)]), N)
await bench('旧搜索 client_search', () => searchOld(QUERIES[Math.floor(Math.random() * QUERIES.length)]), N)
await bench('歌词接口', () => lyric(MIDS[Math.floor(Math.random() * MIDS.length)]), N)

console.log('\n=== 并发 3 个请求（看是否会被限流）===')
{
  const t0 = Date.now()
  const rs = await Promise.allSettled([
    searchNew('晴天'), searchNew('奔跑'), searchNew('起风了'),
  ])
  const okCount = rs.filter(r => r.status === 'fulfilled').length
  console.log(`  并发 3 个 musicu：成功 ${okCount}/3，总耗时 ${Date.now() - t0}ms`)
  rs.forEach((r, i) => { if (r.status === 'rejected') console.log(`    第${i + 1}个失败：${r.reason.message}`) })
}
