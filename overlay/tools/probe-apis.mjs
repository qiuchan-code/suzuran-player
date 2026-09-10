/*
 * 歌词接口可用性诊断 · lyrics API probe
 * ------------------------------------
 * QQ 音乐搜索接口限流后会返 500。这里挨个试几个变体，看哪个还能用，
 * 顺便确认是不是"全局限流"还是"某个参数触发的"。
 *
 * 用法：node lyric-overlay/tools/probe-apis.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

async function tryFetch(label, url, headers = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } })
    const text = await r.text()
    const ms = Date.now() - t0
    return { label, status: r.status, ms, len: text.length, head: text.slice(0, 120) }
  } catch (e) {
    return { label, status: 'ERR', ms: Date.now() - t0, len: 0, head: String(e.message) }
  }
}

const KW = encodeURIComponent('月圆花开')
const KW2 = encodeURIComponent('晴天 周杰伦')

const probes = [
  // 原有接口：带 new_json + cr
  ['A 原接口(带 cr/new_json)', `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=8&w=${KW}&format=json&cr=1&new_json=1`, { Referer: 'https://y.qq.com/' }],
  // 去掉 cr / new_json
  ['B 原接口(最简参数)', `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${KW}&format=json`, { Referer: 'https://y.qq.com/' }],
  // 知名歌曲对照（看是否只对冷门歌失败）
  ['C 原接口(晴天)', `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=8&w=${KW2}&format=json&cr=1&new_json=1`, { Referer: 'https://y.qq.com/' }],
  // 新版 musicu 接口
  ['D musicu 搜索', `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify({ comm: { ct: 19, cv: 1859 }, req: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { num_per_page: 8, page_num: 1, query: '月圆花开', search_type: 0 } } }))}`, { Referer: 'https://y.qq.com/' }],
  // 歌词接口本身
  ['E 歌词接口(已知 mid)', 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=0039MnYb0qxYhV&format=json&nobase64=1', { Referer: 'https://y.qq.com/' }],
  // 不带 Referer 试试
  ['F 原接口(无 Referer)', `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=8&w=${KW}&format=json&cr=1&new_json=1`, {}],
]

for (const [label, url, headers] of probes) {
  const r = await tryFetch(label, url, headers)
  console.log(`${r.status === 200 && r.len > 0 ? '✓' : '✗'} ${label.padEnd(26)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)}ms  len=${r.len}`)
  if (r.status !== 200 || r.len === 0) console.log(`      ${r.head.slice(0, 100)}`)
  await new Promise(r => setTimeout(r, 600))
}
