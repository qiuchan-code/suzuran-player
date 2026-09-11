/*
 * QQ 音乐歌单读取器 · playlist.mjs
 * ------------------------------
 * 能读什么（**公开数据，不需要登录**）：
 *   · 任意歌单详情（给 disstid）
 *   · 排行榜（Top500 等）
 *   · 歌手热门作品
 *   · 搜索
 *
 * 读不到什么：
 *   · **你账号里的个人歌单** —— 那需要登录 cookie，
 *     而 QQ 音乐客户端的 cookie 存在加密的 SetCookie.dat 里，拿不出来
 *
 * 用法：
 *   node --use-system-ca overlay/tools/playlist.mjs <命令> [参数]
 *
 * 命令：
 *   detail <disstid>      读歌单详情
 *   top [topId]           读排行榜（默认 4 = 飙升榜）
 *   singer <singermid>    读歌手热门
 *   search <关键词>        搜索
 *   demo                  演示：跑一遍所有能力
 *
 * 歌单 id 怎么找：在 QQ 音乐里打开歌单 → 分享 → 复制链接，
 * 形如 https://y.qq.com/n/ryqq/playlist/7011264340 ，最后那串数字就是 disstid。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const COMM = { ct: 24, cv: 0 }

/** 调 musicu.fcg（QQ 音乐的通用网关）。 */
async function musicu(reqObj) {
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(reqObj))
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REF, Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(15000),
  })
  return r.json()
}

/** 调老式 fcg 接口（歌单详情走这个）。 */
async function fcg(path) {
  const r = await fetch('https://c.y.qq.com' + path, {
    headers: { 'User-Agent': UA, Referer: REF, Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(15000),
  })
  return r.json()
}

/** 把秒数格式化成 m:ss。 */
const mmss = (s) => {
  const n = Number(s) || 0
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
}

/**
 * 歌曲字段归一化。
 *
 * ⚠️ 三套接口的歌名字段**都不一样**，踩过：
 *   · 老 fcg 歌单详情  → songname / albumname / songmid / interval
 *   · 新 musicu 排行榜 → title / singerName / albumMid / rank  （没有 interval）
 *   · 新 musicu 歌手/搜索 → name / title / album.name / mid
 * 所以统一走这里，别在各处直接取字段。
 */
function normSong(s, i) {
  const singers = Array.isArray(s.singer)
    ? s.singer.map(x => x.name).filter(Boolean).join('/')
    : (s.singerName ?? s.singer ?? '')
  return {
    i: s.rank ?? i + 1,
    name: s.songname ?? s.name ?? s.title ?? '(未知)',
    singers,
    album: s.albumname ?? s.album?.name ?? '',
    mid: s.songmid ?? s.mid ?? '',
    interval: s.interval ?? 0,
  }
}

/** 歌单详情。 */
async function detail(disstid, limit = 30) {
  const j = await fcg(`/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${disstid}&format=json`)
  if (j.code !== 0 || !j.cdlist?.length) {
    return { error: `code=${j.code}${j.subcode ? ' subcode=' + j.subcode : ''}`, raw: j }
  }
  const cd = j.cdlist[0]
  const all = cd.songlist ?? []
  return {
    title: cd.dissname,
    creator: cd.nickname,
    desc: (cd.desc ?? '').slice(0, 60),
    total: cd.songnum,
    songCount: all.length,
    songs: all.slice(0, limit).map(normSong),
  }
}

/** 排行榜。 */
async function top(topId = 4, limit = 20) {
  const j = await musicu({
    comm: COMM,
    req_1: { module: 'musicToplist.ToplistInfoServer', method: 'GetDetail', param: { topId: Number(topId), offset: 0, num: limit, period: '' } },
  })
  const d = j.req_1?.data?.data
  if (!d) return { error: `code=${j.req_1?.code}` }
  return {
    title: d.title ?? `topId=${topId}`,
    update: d.updateTime,
    total: d.totalNum,
    songs: (d.song ?? []).slice(0, limit).map(normSong),
  }
}

/** 歌手热门作品。 */
async function singer(singermid, limit = 20) {
  const j = await musicu({
    comm: COMM,
    req_1: { module: 'music.web_singer_info_svr', method: 'get_singer_detail_info', param: { sort: 5, singermid, sin: 0, num: limit } },
  })
  const d = j.req_1?.data
  if (!d?.songlist) return { error: `code=${j.req_1?.code}` }
  return {
    title: d.singer?.name ?? singermid,
    songs: d.songlist.map(normSong),
  }
}

/**
 * 搜索歌曲。
 *
 * 注意：`DoSearchForQQMusicDesktop` 现在返回 code=0 但**列表为空**
 * （body.song.list 是空数组）—— 接口还在但匿名拿不到结果，需要登录态。
 * 所以这里改用老式 search_cp 接口。
 */
async function search(keyword, limit = 15) {
  const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=' + limit +
    '&w=' + encodeURIComponent(keyword) + '&cr=1&t=0'
  const j = await fcg(url.replace('https://c.y.qq.com', ''))
  const list = j.data?.song?.list
  if (!list) return { error: `code=${j.code}${j.message ? ' ' + j.message : ''}（这个接口对匿名请求可能已关闭）` }
  return {
    title: `搜索「${keyword}」`,
    total: j.data?.song?.totalnum,
    songs: list.map(normSong),
  }
}

/* ── 输出 ── */

function print(result, opts = {}) {
  if (result.error) {
    console.log(`  ✗ 失败：${result.error}`)
    if (result.error.includes('2001')) {
      console.log('    2001 = 接口限流，等约 1 分钟再试（这个项目里也遇到过）')
    }
    return
  }
  console.log(`\n《${result.title}》`)
  if (result.creator) console.log(`  创建者：${result.creator}`)
  if (result.update) console.log(`  更新时间：${result.update}`)
  if (result.total != null) console.log(`  曲目总数：${result.total}`)
  if (result.desc) console.log(`  简介：${result.desc}`)
  console.log('')
  for (const s of result.songs ?? []) {
    const dur = opts.showDuration && s.interval ? `  ${mmss(s.interval)}` : ''
    const alb = opts.showAlbum && s.album ? `  「${s.album}」` : ''
    console.log(`  ${String(s.i).padStart(3)}. ${s.name}  —  ${s.singers}${alb}${dur}`)
  }
  if (opts.showMids) {
    console.log('\n  mid（可用它查这首歌的歌词/详情）：')
    for (const s of (result.songs ?? []).slice(0, 8)) console.log(`    ${s.mid}  ${s.name}`)
  }
}

/* ── 入口 ── */

/**
 * 把"分享短链"或"歌单 id"统一转成 disstid。
 *
 * 分享出来的链接长这样（不能直接用，得跟重定向）：
 *   https://c6.y.qq.com/base/fcgi-bin/u?__=WuidD7UF9FVj
 *     → 302 → i.y.qq.com/n2/m/share/details/taoge.html?id=9366662983
 *     → 200 → y.qq.com/n/ryqq_v2/playlist/9366662983
 *
 * 已经是纯数字就直接返回。
 */
async function toDisstid(input) {
  const s = String(input).trim().replace(/^["']|["']$/g, '')
  if (/^\d+$/.test(s)) return s

  // 从链接里直接抠（有些链接本身就带 id）
  const direct = /[?&](?:id|disstid)=(\d+)/.exec(s) ?? /playlist\/(\d+)/.exec(s)
  if (direct) return direct[1]

  // 短链要走重定向
  if (/^https?:/i.test(s)) {
    process.stderr.write('  解析分享短链… ')
    const r = await fetch(s, {
      headers: { 'User-Agent': UA, Referer: REF },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    })
    const m = /playlist\/(\d+)/.exec(r.url) ?? /[?&](?:id|disstid)=(\d+)/.exec(r.url)
    if (m) { process.stderr.write(`→ ${m[1]}\n`); return m[1] }
    // 退一步：302 的 location 里找
    const r2 = await fetch(s, { headers: { 'User-Agent': UA, Referer: REF }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const loc = r2.headers.get('location') ?? ''
    const m2 = /[?&](?:id|disstid)=(\d+)/.exec(loc) ?? /playlist\/(\d+)/.exec(loc)
    if (m2) { process.stderr.write(`→ ${m2[1]}\n`); return m2[1] }
    process.stderr.write('失败\n')
    throw new Error(`解析不出歌单 id，最终 URL 是 ${r.url}`)
  }

  throw new Error(`无法识别：${s}\n给纯数字的 disstid，或者 QQ 音乐分享链接`)
}

const [cmd, arg] = process.argv.slice(2)

if (!cmd || cmd === 'help') {
  console.log(`
QQ 音乐歌单读取器

  node --use-system-ca overlay/tools/playlist.mjs <命令> [参数]

  detail <歌单>        读歌单详情
  shuffle <歌单>       从歌单里随机抽一首
  lyric <songmid>      查某首歌的歌词
  top [topId]          排行榜（默认 4=流行指数榜）
  singer <singermid>   歌手热门（周杰伦 = 0025NhlN2yWrP4）
  search <关键词>       搜索
  demo                 演示全部能力

  <歌单> 可以是：
    · 纯数字 id            7011264340
    · 完整歌单链接          https://y.qq.com/n/ryqq/playlist/7011264340
    · 分享短链             https://c6.y.qq.com/base/fcgi-bin/u?__=xxxx

  ⚠️ 只能读**公开**数据。账号里的私密歌单需要登录 cookie，读不到。

  例：
    node --use-system-ca overlay/tools/playlist.mjs shuffle "https://c6.y.qq.com/base/fcgi-bin/u?__=WuidD7UF9FVj"
`)
  process.exit(0)
}

if (cmd === 'demo') {
  console.log('演示：QQ 音乐公开数据的读取能力\n' + '═'.repeat(50))
  console.log('\n① 排行榜（Top500，topId=4）')
  print(await top(4, 12))
  console.log('\n' + '─'.repeat(50))
  console.log('\n② 歌手热门（周杰伦）')
  print(await singer('0025NhlN2yWrP4', 12))
  console.log('\n' + '─'.repeat(50))
  console.log('\n③ 搜索')
  print(await search('铃兰', 10), { showAlbum: true, showDuration: true })
  console.log('\n' + '─'.repeat(50))
  console.log('\n④ 歌单详情（随便找个公开歌单）')
  print(await detail('7011264340', 12), { showAlbum: true, showDuration: true })
  process.exit(0)
}

if (cmd === 'detail') {
  print(await detail(await toDisstid(arg ?? '')), { showAlbum: true, showDuration: true, showMids: true })
  process.exit(0)
}
if (cmd === 'top') { print(await top(arg ?? 4, 20), { showDuration: true }); process.exit(0) }
if (cmd === 'singer') { print(await singer(arg ?? '0025NhlN2yWrP4', 20), { showMids: true }); process.exit(0) }
if (cmd === 'search') { print(await search(arg ?? '', 15), { showAlbum: true, showDuration: true }); process.exit(0) }

if (cmd === 'shuffle') {
  const d = await detail(await toDisstid(arg ?? ''), 5000)
  if (d.error) { print(d); process.exit(1) }
  const s = d.songs[Math.floor(Math.random() * d.songs.length)]
  console.log(`\n《${d.title}》 共 ${d.total} 首，随机抽到：\n`)
  console.log(`  ${s.name}`)
  console.log(`  ${s.singers}`)
  if (s.album) console.log(`  专辑：${s.album}`)
  if (s.interval) console.log(`  时长：${mmss(s.interval)}`)
  console.log(`  mid ：${s.mid}`)
  console.log(`\n  用 mid 去查这首歌的歌词：`)
  console.log(`    node --use-system-ca overlay/tools/playlist.mjs lyric ${s.mid}`)
  process.exit(0)
}

if (cmd === 'lyric') {
  // 用项目自己的歌词逻辑查（复用 overlay/src/lyrics.mjs 的思路）
  const mid = arg ?? ''
  console.log(`查歌词：${mid}`)
  const j = await fcg(`/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${mid}&format=json&nobase64=1`)
  const txt = j.lyric ?? ''
  if (!txt) { console.log('  ✗ 没拿到歌词（可能限流或这首歌没词）'); process.exit(1) }
  console.log('')
  console.log(txt.split('\n').slice(0, 30).map(l => '  ' + l).join('\n'))
  process.exit(0)
}

console.log(`未知命令：${cmd}（试试 help）`)
