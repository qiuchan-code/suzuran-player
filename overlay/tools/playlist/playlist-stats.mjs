/*
 * 歌单语种统计 · playlist-stats.mjs
 * --------------------------------
 * 接口没有"语种"字段，所以只能按**曲名 + 歌手的字符集**推断。
 *
 * 判定规则（按优先级）：
 *   1. 有**谚文**（한글）          → 韩语
 *   2. 有**平假名/片假名**          → 日语
 *   3. 只有拉丁字母 + 数字           → 西文（英语为主）
 *   4. 有**汉字**，且没有假名/谚文    → 中文
 *   5. 以上都没有（西里尔/泰文等）    → 其它
 *
 * 局限（会说清楚）：
 *   · 中文歌名但英文歌手（或反过来）会被归到"中文"（汉字优先于拉丁）
 *   · 日语歌名全用汉字（如「夜に駆ける」写成「夜驱」）会误判成中文
 *   · 纯音乐/无歌词的曲子按曲名字符集算
 *
 * 用法：node --use-system-ca overlay/tools/playlist/playlist-stats.mjs <歌单>
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

/** 判定一段文本属于哪个语种。 */
function scriptOf(text) {
  if (!text) return { korean: 0, kana: 0, han: 0, latin: 0, other: 0 }
  const c = { korean: 0, kana: 0, han: 0, latin: 0, other: 0 }
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (
      (cp >= 0xAC00 && cp <= 0xD7A3) ||   // 谚文音节
      (cp >= 0x1100 && cp <= 0x11FF) ||   // 谚文字母
      (cp >= 0x3130 && cp <= 0x318F)      // 谚文兼容字母
    ) c.korean++
    else if (
      (cp >= 0x3040 && cp <= 0x309F) ||   // 平假名
      (cp >= 0x30A0 && cp <= 0x30FF) ||   // 片假名
      (cp >= 0x31F0 && cp <= 0x31FF)      // 片假名扩展
    ) c.kana++
    else if (
      (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK 统一汉字
      (cp >= 0x3400 && cp <= 0x4DBF) ||   // 扩展 A
      (cp >= 0xF900 && cp <= 0xFAFF)      // 兼容汉字
    ) c.han++
    else if (
      (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) ||
      (cp >= 0xC0 && cp <= 0x24F)         // 带变音符号的拉丁字母
    ) c.latin++
    else if (cp > 0x2000 && cp < 0x3000) c.other++   // 标点，忽略不计
    else if (cp > 0x7F) c.other++
  }
  return c
}

/** 综合曲名 + 歌手，判断语种。 */
function classify(name, singers) {
  const n = scriptOf(name)
  const s = scriptOf(singers)
  const all = {
    korean: n.korean + s.korean,
    kana: n.kana + s.kana,
    han: n.han + s.han,
    latin: n.latin + s.latin,
    other: n.other + s.other,
  }

  // ① 谚文 → 韩语
  if (all.korean > 0) return '韩语'
  // ② 假名 → 日语
  if (all.kana > 0) return '日语'
  // ③ 有汉字 → 中文（汉字比拉丁优先）
  if (all.han > 0) return '中文'
  // ④ 只有拉丁 → 西文
  if (all.latin > 0) return '西文'
  // ⑤ 其它文字
  if (all.other > 0) return '其它'
  return '无法判定'
}

/**
 * 只按**曲名**判断文字。
 *
 * 为什么需要这个：原先把曲名和歌手合起来判，导致
 *   「SEXY LOVE — T-ara (티아라)」被判成韩语（对）
 *   「Rollin' — Brave Girls」被判成西文（**错**，这是 K-pop）
 * 因为拉丁字母优先级低于谚文但高于"什么都没"。
 *
 * 单看曲名能更清楚地分出：
 *   · 曲名是韩文 → 确定是韩语歌
 *   · 曲名是拉丁 → 可能是英文歌，也可能是 K-pop/J-pop 用了英文名
 * 所以这个维度只说明"标题用什么文字写的"，不代表语种。
 */
function scriptLabel(name) {
  const n = scriptOf(name)
  if (n.korean > 0) return '韩文'
  if (n.kana > 0) return '日文（含假名）'
  if (n.han > 0) return '汉字'
  if (n.latin > 0) return '拉丁字母'
  if (n.other > 0) return '其它文字'
  return '（空）'
}

const get = async (url) => {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: REF },
    signal: AbortSignal.timeout(20000),
  })
  return r.json()
}

/** 解析歌单（支持短链 / 链接 / 纯 id）。 */
async function toDisstid(input) {
  const s = String(input).trim().replace(/^["']|["']$/g, '')
  if (/^\d+$/.test(s)) return s
  const direct = /[?&](?:id|disstid)=(\d+)/.exec(s) ?? /playlist\/(\d+)/.exec(s)
  if (direct) return direct[1]
  const r = await fetch(s, { headers: { 'User-Agent': UA, Referer: REF }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  const m = /playlist\/(\d+)/.exec(r.url) ?? /[?&](?:id|disstid)=(\d+)/.exec(r.url)
  if (m) return m[1]
  throw new Error('解析不出歌单 id：' + r.url)
}

/** 分页拉完整歌单。 */
async function fetchAll(disstid) {
  const all = []
  let name = '', creator = '', total = 0
  let page = 0
  const PAGE = 500
  while (true) {
    const url = `/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${disstid}&format=json&song_begin=${page * PAGE}&song_num=${PAGE}`
    const j = await get('https://c.y.qq.com' + url)
    if (j.code !== 0 || !j.cdlist?.length) throw new Error(`code=${j.code}（可能是限流，等一分钟再试）`)
    const cd = j.cdlist[0]
    name = cd.dissname; creator = cd.nickname; total = cd.songnum
    const batch = cd.songlist ?? []
    all.push(...batch)
    process.stderr.write(`\r  已拉取 ${all.length}/${total} 首…`)
    if (batch.length === 0 || all.length >= total) break
    page++
    if (page > 30) break
    await new Promise(r => setTimeout(r, 400))   // 别把接口打太急
  }
  process.stderr.write('\n')
  return { name, creator, total, songs: all }
}

/* ── 主流程 ── */

const input = process.argv[2]
if (!input) {
  console.log('用法：node --use-system-ca overlay/tools/playlist/playlist-stats.mjs <歌单>')
  console.log('  <歌单> 可以是纯数字 id、完整链接、或分享短链')
  process.exit(1)
}

const disstid = await toDisstid(input)
const pl = await fetchAll(disstid)

console.log(`\n《${pl.name}》   创建者：${pl.creator}`)
console.log(`共 ${pl.songs.length} 首（接口报 ${pl.total}）\n`)

/* 逐首分类 */
const counts = {}
const titleScripts = {}
const samples = {}
let durations = 0, withDuration = 0
const artists = {}
/** 交叉表：曲名文字 × 综合语种，用来发现误判。 */
const cross = {}

for (const s of pl.songs) {
  const name = s.songname ?? s.name ?? ''
  const singers = Array.isArray(s.singer) ? s.singer.map(x => x.name).filter(Boolean).join('/') : ''

  const lang = classify(name, singers)
  counts[lang] = (counts[lang] ?? 0) + 1

  const ts = scriptLabel(name)
  titleScripts[ts] = (titleScripts[ts] ?? 0) + 1

  const key = ts + ' → ' + lang
  cross[key] = (cross[key] ?? 0) + 1

  if (!samples[lang]) samples[lang] = []
  if (samples[lang].length < 6) samples[lang].push(`${name} — ${singers}`)

  if (s.interval > 0) { durations += s.interval; withDuration++ }

  const first = Array.isArray(s.singer) && s.singer[0] ? s.singer[0].name : ''
  if (first) artists[first] = (artists[first] ?? 0) + 1
}

/* 输出 */
const totalCount = pl.songs.length
console.log('════════════ 语种分布 ════════════\n')
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
const maxW = Math.max(...sorted.map(([k]) => k.length))

for (const [lang, n] of sorted) {
  const pct = (n / totalCount * 100)
  const bar = '█'.repeat(Math.max(1, Math.round(pct / 2)))
  console.log(`  ${lang.padEnd(maxW + 2)} ${String(n).padStart(5)} 首  ${pct.toFixed(1).padStart(5)}%  ${bar}`)
}
console.log(`  ${'合计'.padEnd(maxW + 2)} ${String(totalCount).padStart(5)} 首`)

console.log('\n════════ 曲名用的什么文字 ════════\n')
const tsSorted = Object.entries(titleScripts).sort((a, b) => b[1] - a[1])
const maxW2 = Math.max(...tsSorted.map(([k]) => k.length))
for (const [ts, n] of tsSorted) {
  const pct = (n / totalCount * 100)
  const bar = '█'.repeat(Math.max(1, Math.round(pct / 2)))
  console.log(`  ${ts.padEnd(maxW2 + 2)} ${String(n).padStart(5)} 首  ${pct.toFixed(1).padStart(5)}%  ${bar}`)
}

console.log('\n════ 交叉表（曲名文字 → 判定语种）════\n')
console.log('  这个表能看出误判：比如「拉丁字母 → 西文」里混着 K-pop。\n')
const crossSorted = Object.entries(cross).sort((a, b) => b[1] - a[1])
for (const [k, n] of crossSorted) {
  if (n < 20) continue
  console.log(`  ${String(n).padStart(5)} 首   ${k}`)
}

console.log('\n════════════ 各类抽样 ════════════\n')
for (const [lang] of sorted) {
  console.log(`【${lang}】`)
  for (const s of samples[lang]) console.log(`    ${s}`)
  console.log('')
}

console.log('════════════ 其它统计 ════════════\n')
if (withDuration > 0) {
  const avg = durations / withDuration
  const h = Math.floor(durations / 3600)
  console.log(`  总时长    ${h} 小时 ${Math.floor((durations % 3600) / 60)} 分`)
  console.log(`  平均时长  ${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')}`)
}

const topArtists = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 15)
console.log(`\n  出现最多的歌手（按第一歌手统计）：`)
for (const [a, n] of topArtists) console.log(`    ${String(n).padStart(4)} 首   ${a}`)

console.log('\n注：语种是按曲名/歌手的字符集推断的（接口没有语种字段）。')
console.log('    有汉字就判中文，所以「中文名 + 英文歌手」这类会归到中文。')
