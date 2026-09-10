/*
 * 限流阈值探测 · rate limit probe
 * -------------------------------
 * 快速连发搜索请求，看从第几次开始失败、恢复要多久。
 * 目的：给"切歌太快时接口跟不上"定一个安全的请求间隔。
 *
 * 用法：node lyric-overlay/tools/probe-ratelimit.mjs [次数] [间隔ms]
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

const N = Number(process.argv[2] ?? 15)
const GAP = Number(process.argv[3] ?? 200)

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
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`非 JSON(${text.length}B)`) }
  const list = j?.req?.data?.body?.song?.list ?? []
  if (list.length === 0) throw new Error('空结果')
  return list.length
}

const QUERIES = ['晴天', '奔跑', '起风了', '晚风告诉我', '月圆花开', 'Come Over', '房间', '晚安', '声声慢', '云烟成雨', '像你这样的人', '夜航星', '春风十里', '南山南', '斑马斑马']

console.log(`连发 ${N} 次，间隔 ${GAP}ms（约 ${(1000 / GAP).toFixed(1)} 次/秒）\n`)

let firstFailAt = null
let okCount = 0
for (let i = 0; i < N; i++) {
  const q = QUERIES[i % QUERIES.length]
  const t0 = Date.now()
  try {
    const n = await searchNew(q)
    okCount++
    console.log(`  ${String(i + 1).padStart(2)}  ✓ ${q.padEnd(12)} ${n} 条  ${Date.now() - t0}ms`)
  } catch (e) {
    if (firstFailAt === null) firstFailAt = i + 1
    console.log(`  ${String(i + 1).padStart(2)}  ✗ ${q.padEnd(12)} ${e.message}  ${Date.now() - t0}ms`)
  }
  await new Promise(r => setTimeout(r, GAP))
}

console.log(`\n成功 ${okCount}/${N}，首次失败在第 ${firstFailAt ?? '—'} 次`)

console.log('\n=== 冷却后探测恢复（等 20 秒，发 3 次，间隔 3 秒）===')
await new Promise(r => setTimeout(r, 20_000))
for (let i = 0; i < 3; i++) {
  try {
    const n = await searchNew(QUERIES[i])
    console.log(`  第${i + 1}次 ✓ ${n} 条`)
  } catch (e) {
    console.log(`  第${i + 1}次 ✗ ${e.message}`)
  }
  await new Promise(r => setTimeout(r, 3000))
}
