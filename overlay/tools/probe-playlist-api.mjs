/*
 * 探测 QQ 音乐网页 API 能不能读歌单 · probe-playlist-api.mjs
 * ------------------------------------------------------
 * 思路：QQ 音乐有网页版（y.qq.com），它的歌单接口相对公开。
 * 先不管登录，看匿名能拿到什么。
 *
 * 需要 --use-system-ca（这台机器的证书链问题）
 *
 * 用法：node --use-system-ca overlay/tools/probe-playlist-api.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

/** 带 referer/UA 的 fetch（QQ 音乐接口会校验）。 */
async function api(url, extraHeaders = {}) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: REF,
        Accept: 'application/json, text/plain, */*',
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(12000),
    })
    const text = await r.text()
    return { ok: r.ok, status: r.status, text }
  } catch (e) {
    return { ok: false, status: 0, text: '', err: e.message }
  }
}

const tests = [
  {
    name: '① 推荐歌单列表（匿名）',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'music.playlist.PlayListCategory',
        method: 'get_category_content',
        param: { titleid: 3317, caller: 0, categoryId: 10000000, size: 5, page: 0, use_page: 1 },
      },
    })),
  },
  {
    name: '② 歌单详情（用推荐里的一个 id 试）',
    url: 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7011264340&format=json',
  },
  {
    name: '③ 排行榜（Top500）',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'musicToplist.ToplistInfoServer',
        method: 'GetDetail',
        param: { topId: 4, offset: 0, num: 10, period: '' },
      },
    })),
  },
  {
    name: '④ 歌手热门歌曲（周杰伦）',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'music.web_singer_info_svr',
        method: 'get_singer_detail_info',
        param: { sort: 5, singermid: '0025NhlN2yWrP4', sin: 0, num: 10 },
      },
    })),
  },
]

console.log('探测 QQ 音乐网页 API（匿名，不带登录态）\n')

for (const t of tests) {
  const r = await api(t.url)
  const head = (r.text || '').slice(0, 160).replace(/\s+/g, ' ')
  console.log(`── ${t.name} ──`)
  console.log(`   HTTP ${r.status}${r.err ? '  错误: ' + r.err : ''}   长度 ${(r.text || '').length}`)
  console.log(`   ${head}`)

  // 试着解析，看有没有歌单结构
  try {
    const j = JSON.parse(r.text)
    const code = j.code ?? j.req?.code ?? j.req_1?.code
    console.log(`   code=${code}`)
    // 找常见的歌单字段
    const s = JSON.stringify(j)
    for (const k of ['disslist', 'cdlist', 'songlist', 'toplist', 'data']) {
      if (s.includes('"' + k + '"')) console.log(`   含字段: ${k}`)
    }
  } catch {
    console.log('   （不是 JSON，可能是 HTML 或需要登录）')
  }
  console.log('')
}

console.log('判读：')
console.log('  · ①②③④ 里哪个返回了带 songlist/disslist 的 JSON，就说明这条能读到歌单内容')
console.log('  · 如果全是 code=2001 或 HTML 登录页，说明需要 cookie')
