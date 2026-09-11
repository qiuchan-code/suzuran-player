/*
 * 歌词/搜索接口可用性诊断 · probe-apis.mjs
 * --------------------------------------
 * QQ 音乐这两个搜索接口**限流的表现不一样**，这是当初误判的根源：
 *
 *   musicu.fcg（备）           → HTTP 200 + {"req":{"code":2001,"data":null}}
 *   client_search_cp（主）     → HTTP 500
 *
 * 早先只认出前一种，把后一种当成"接口已废弃"，于是误判了很久。
 * 这个脚本两种都测，并按"限流"而不是"挂了"来判定。
 *
 * 用法：node --use-system-ca overlay/tools/probe-apis.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://y.qq.com/' }

/** 带超时的 fetch。 */
async function tryFetch(url, headers = {}, ms = 8000) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { ...H, ...headers }, signal: AbortSignal.timeout(ms) })
    const text = await r.text()
    return { status: r.status, ms: Date.now() - t0, text }
  } catch (e) {
    return { status: 'ERR', ms: Date.now() - t0, text: '', err: e.message }
  }
}

/** 解析一次搜索响应，返回 { 判定, 说明 }。 */
function judge(label, res, parse) {
  if (res.status === 'ERR') return { ok: false, kind: '网络错误', note: res.err?.slice(0, 60) }
  if (res.status === 500) return { ok: false, kind: '限流', note: 'HTTP 500 —— 这个接口限流时返 500' }
  if (res.status !== 200) return { ok: false, kind: `HTTP ${res.status}`, note: '' }
  try {
    const r = parse(res.text)
    if (r.throttled) return { ok: false, kind: '限流', note: `code=${r.code}` }
    if (r.count > 0) return { ok: true, kind: '正常', note: `${r.count} 条结果，${res.ms}ms` }
    return { ok: false, kind: '无结果', note: `code=${r.code}` }
  } catch (e) {
    return { ok: false, kind: '解析失败', note: e.message.slice(0, 60) }
  }
}

const KW = '月圆花开'
const KW2 = '晴天 周杰伦'

const oldUrl = (w) => `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=8&w=${encodeURIComponent(w)}&format=json&cr=1&new_json=1`
const newUrl = (w) => `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify({
  comm: { ct: 19, cv: 1859 },
  req: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { num_per_page: 8, page_num: 1, query: w, search_type: 0 } },
}))}`

const parseOld = (text) => {
  // 注意：这个接口**现在返回纯 JSON**，不要盲目剥 JSONP 壳 ——
  // 之前用 /^[^(]*\(/ 去剥，结果在数据里歌名的括号处切断了（比如"动感版)"）。
  // 只在确实带了回调名时才剥。
  const t = text.trim()
  const shelled = /^[A-Za-z_$][\w$]*\s*\(/.test(t)
  const body = shelled ? t.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '') : t
  const j = JSON.parse(body)
  return { code: j.code, throttled: j.code !== undefined && j.code !== 0, count: (j.data?.song?.list ?? []).length }
}
const parseNew = (text) => {
  const j = JSON.parse(text)
  const code = j.req?.code
  return { code, throttled: code !== undefined && code !== 0, count: (j.req?.data?.body?.song?.list ?? []).length }
}

const probes = [
  ['★主 client_search_cp（冷门词）', oldUrl(KW), parseOld],
  ['★主 client_search_cp（晴天）', oldUrl(KW2), parseOld],
  ['★主 client_search_cp（无 Referer）', oldUrl(KW), parseOld, {}],
  ['  备 musicu（冷门词）', newUrl(KW), parseNew],
  ['  备 musicu（晴天）', newUrl(KW2), parseNew],
  ['  歌词 fcg_query_lyric_new', 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=0039MnYb0qxYhV&format=json&nobase64=1',
    (t) => ({ code: JSON.parse(t).code, throttled: false, count: JSON.parse(t).lyric ? 1 : 0 })],
]

console.log('判据：HTTP 500 = 限流（不是挂了）；code=2001 = 限流\n')

let pass = 0
for (const [label, url, parse, extraHeaders] of probes) {
  const res = await tryFetch(url, extraHeaders)
  const v = judge(label, res, parse)
  if (v.ok) pass++
  const mark = v.ok ? '✓' : (v.kind === '限流' ? '限' : '✗')
  console.log(`  ${mark} ${label.padEnd(30)} ${String(res.status).padEnd(4)} ${String(res.ms).padStart(5)}ms  ${v.kind}${v.note ? '  ' + v.note : ''}`)
  await new Promise(r => setTimeout(r, 800))
}

console.log(`\n通过 ${pass}/${probes.length}`)
console.log('\n如果"限"很多，说明当前在冷却期内，等 1 分钟再跑。')
