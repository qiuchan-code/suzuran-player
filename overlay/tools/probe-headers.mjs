/*
 * 请求头对照 · header probe
 * ------------------------
 * QQ 音乐接口对匿名请求有限制。试几种请求头组合，看哪种不触发限流。
 *
 * 用法：node lyric-overlay/tools/probe-headers.mjs
 */

const BASE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

/** 各种 host + 请求头组合。 */
const VARIANTS = [
  {
    label: 'u.y.qq.com（当前）',
    headers: { 'User-Agent': BASE_UA, Referer: 'https://y.qq.com/' },
    url: q => `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body(q)))}`,
  },
  {
    label: 'u.y.qq.com + Origin/Accept',
    headers: {
      'User-Agent': BASE_UA,
      Referer: 'https://y.qq.com/',
      Origin: 'https://y.qq.com',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    url: q => `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body(q)))}`,
  },
  {
    label: 'c.y.qq.com（老 host）',
    headers: { 'User-Agent': BASE_UA, Referer: 'https://y.qq.com/' },
    url: q => `https://c.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body(q)))}`,
  },
  {
    label: 'u.y.qq.com + Cookie',
    headers: {
      'User-Agent': BASE_UA,
      Referer: 'https://y.qq.com/',
      Cookie: 'pgv_pvi=1; pgv_si=s1; ts_uid=1',
    },
    url: q => `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body(q)))}`,
  },
  {
    label: 'musicu + POST',
    headers: { 'User-Agent': BASE_UA, Referer: 'https://y.qq.com/', 'Content-Type': 'application/json' },
    method: 'POST',
    body: q => JSON.stringify(body(q)),
    url: () => 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json',
  },
]

function body(q) {
  return {
    comm: { ct: 19, cv: 1859 },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: 10, page_num: 1, query: q, search_type: 0 },
    },
  }
}

/** 连打 6 次，看第几次开始返 2001。 */
async function probe(v, queries) {
  const codes = []
  for (const q of queries) {
    const t0 = Date.now()
    try {
      const init = { headers: v.headers }
      if (v.method === 'POST') { init.method = 'POST'; init.body = v.body(q) }
      const res = await fetch(v.url(q), init)
      const text = await res.text()
      let j
      try { j = JSON.parse(text) } catch { codes.push(`非JSON`); continue }
      const code = j?.req?.code
      const n = (j?.req?.data?.body?.song?.list ?? []).length
      codes.push(`${code === 0 ? '✓' : '✗'}${code}(${n}条,${Date.now() - t0}ms)`)
    } catch (e) {
      codes.push(`ERR(${e.message.slice(0, 24)})`)
    }
    await new Promise(r => setTimeout(r, 400))
  }
  return codes
}

const QUERIES = ['晴天', '奔跑', '起风了', '云烟成雨', '房间', '声声慢']

console.log('每个组合连打 6 次（间隔 400ms），看第几次开始限流\n')
for (const v of VARIANTS) {
  const codes = await probe(v, QUERIES)
  console.log(`${v.label}`)
  console.log(`  ${codes.join('  ')}`)
  console.log('')
  await new Promise(r => setTimeout(r, 3000))
}
