/*
 * 抽查"拉丁曲名 + 中文歌手"那 129 首 · sample-ambiguous.mjs
 * ------------------------------------------------------
 * 这一类的判定最容易出错：
 *   · 可能是中国歌手唱英文歌
 *   · 可能是中文歌但曲名被写成英文
 *   · 也可能是 API 把外国歌手的中文译名当主名
 *
 * 用法：node --use-system-ca overlay/tools/sample-ambiguous.mjs <歌单> [数量]
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const get = async (url) => (await fetch(url, { headers: { 'User-Agent': UA, Referer: REF }, signal: AbortSignal.timeout(20000) })).json()

function scriptOf(text) {
  const c = { korean: 0, kana: 0, han: 0, latin: 0, other: 0 }
  for (const ch of (text || '')) {
    const cp = ch.codePointAt(0)
    if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)) c.korean++
    else if ((cp >= 0x3040 && cp <= 0x309F) || (cp >= 0x30A0 && cp <= 0x30FF) || (cp >= 0x31F0 && cp <= 0x31FF)) c.kana++
    else if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF)) c.han++
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) || (cp >= 0xC0 && cp <= 0x24F)) c.latin++
    else if (cp > 0x7F && (cp < 0x2000 || cp > 0x3000)) c.other++
  }
  return c
}

async function toDisstid(input) {
  const s = String(input).trim()
  if (/^\d+$/.test(s)) return s
  const d = /[?&](?:id|disstid)=(\d+)/.exec(s) ?? /playlist\/(\d+)/.exec(s)
  if (d) return d[1]
  const r = await fetch(s, { headers: { 'User-Agent': UA, Referer: REF }, redirect: 'follow' })
  const m = /playlist\/(\d+)/.exec(r.url) ?? /[?&](?:id|disstid)=(\d+)/.exec(r.url)
  return m[1]
}

const disstid = await toDisstid(process.argv[2])
const LIMIT = Number(process.argv[3] ?? 40)

const all = []
let total = 0, page = 0
while (true) {
  const j = await get(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${disstid}&format=json&song_begin=${page * 500}&song_num=500`)
  const cd = j.cdlist?.[0]
  if (!cd) break
  total = cd.songnum
  const b = cd.songlist ?? []
  all.push(...b)
  process.stderr.write(`\r  拉取 ${all.length}/${total}`)
  if (!b.length || all.length >= total) break
  page++
  await new Promise(r => setTimeout(r, 350))
}
process.stderr.write('\n\n')

/** 拉丁曲名 + 中文歌手 */
const ambiguous = []
for (const s of all) {
  const name = s.songname ?? ''
  const singers = Array.isArray(s.singer) ? s.singer.map(x => x.name).join('/') : ''
  const n = scriptOf(name), si = scriptOf(singers)
  const nameLatin = n.latin > 0 && n.han === 0 && n.kana === 0 && n.korean === 0
  const singerHan = si.han > 0 && si.kana === 0 && si.korean === 0
  if (nameLatin && singerHan) ambiguous.push({ name, singers, album: s.albumname ?? '' })
}

console.log(`「拉丁曲名 + 中文歌手」共 ${ambiguous.length} 首，随机抽 ${Math.min(LIMIT, ambiguous.length)} 首看：\n`)

// 随机抽样
const picked = []
const pool = [...ambiguous]
while (picked.length < Math.min(LIMIT, pool.length)) {
  picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
}
for (const s of picked) {
  console.log(`  ${s.name}`)
  console.log(`      歌手：${s.singers}    专辑：${s.album}`)
}

console.log('\n判读：')
console.log('  · 如果歌手是「中国歌手 + 英文曲名」→ 归中文没错（中文歌/中文歌手唱英文）')
console.log('  · 如果歌手是外国人的中文译名（如「初音未来」「泰勒斯威夫特」）→ 应该归到对应语种')
