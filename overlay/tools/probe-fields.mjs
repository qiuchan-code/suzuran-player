/*
 * 看接口返回的真实字段名 · probe-fields.mjs
 * 用法：node --use-system-ca overlay/tools/probe-fields.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: REF }, signal: AbortSignal.timeout(15000) })
  return r.json()
}

console.log('① 歌单详情里 songlist[0] 的字段名')
const d = await get('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7011264340&format=json')
const s0 = d.cdlist?.[0]?.songlist?.[0]
if (s0) {
  console.log('  字段：', Object.keys(s0).join(', '))
  console.log('  name     =', JSON.stringify(s0.name))
  console.log('  songname =', JSON.stringify(s0.songname))
  console.log('  title    =', JSON.stringify(s0.title))
  console.log('  singer   =', JSON.stringify(s0.singer))
}

console.log('\n② 排行榜返回结构')
const t = await get('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
  comm: { ct: 24, cv: 0 },
  req_1: { module: 'musicToplist.ToplistInfoServer', method: 'GetDetail', param: { topId: 4, offset: 0, num: 3, period: '' } },
})))
const td = t.req_1?.data?.data
console.log('  data 的字段：', td ? Object.keys(td).join(', ') : '(无)')
const ts0 = td?.song?.[0]
if (ts0) {
  console.log('  song[0] 字段：', Object.keys(ts0).join(', '))
  console.log('  JSON 片段：', JSON.stringify(ts0).slice(0, 400))
}

console.log('\n③ 搜索接口（试几种参数名）')
const tries = [
  { name: 'DoSearchForQQMusicDesktop + query', param: { query: '铃兰', num_per_page: 5, page_num: 1, search_type: 0 } },
  { name: 'DoSearchForQQMusicDesktop + w', param: { w: '铃兰', num_per_page: 5, page_num: 1, search_type: 0 } },
  { name: 'search_cp + w', module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { w: '铃兰', n: 5, p: 1 } },
]
for (const tr of tries) {
  const j = await get('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
    comm: { ct: 24, cv: 0 },
    req_1: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: tr.param },
  })))
  const r1 = j.req_1
  const list = r1?.data?.body?.song?.list
  console.log(`  ${tr.name.padEnd(38)} code=${r1?.code}  条数=${list?.length ?? '无'}  data字段=${r1?.data ? Object.keys(r1.data).join(',') : '无'}`)
  if (list?.[0]) {
    console.log('     命中，song[0] 字段：', Object.keys(list[0]).slice(0, 12).join(', '))
    console.log('     name =', JSON.stringify(list[0].name), ' title =', JSON.stringify(list[0].title))
    break
  }
}
