/*
 * 测老接口 fcg_match_songid · test-match-api.mjs
 * -------------------------------------------
 * 从官方导入页源码里挖到的：
 *
 *   POST http://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg
 *   data = { inCharset:'utf-8', outCharset:'utf-8', songinfo: '歌名|歌手||歌名|歌手' }
 *   一次最多 500 首
 *
 * 这个老接口**是明文表单，不加密**（新版 musics.fcg 才要 QRC 加密 + 签名）。
 * 如果它能用，整件事就通了：匹配拿到 songmid → 再用 create_playlist_add_song.fcg 加歌。
 *
 * 用法：node --use-system-ca overlay/tools/test-match-api.mjs
 */

import { readFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const FILE = 'C:\\Users\\56851\\Desktop\\歌单拆分\\素材_中文_3063首_2026-09-11.txt'

/* 读清单，转成 "歌名|歌手" */
const lines = readFileSync(FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
const parse = (l) => {
  // 格式：歌名 - 歌手
  const i = l.lastIndexOf(' - ')
  if (i < 0) return null
  return { name: l.slice(0, i).trim(), artist: l.slice(i + 3).trim() }
}

const sample = lines.slice(0, 8).map(parse).filter(Boolean)
console.log(`取前 ${sample.length} 首：`)
for (const s of sample) console.log(`  ${s.name}  |  ${s.artist}`)

const songinfo = sample.map(s => `${s.name}|${s.artist}`).join('||')
console.log(`\nsonginfo（${songinfo.length} 字符）：`)
console.log('  ' + songinfo.slice(0, 200) + (songinfo.length > 200 ? ' …' : ''))

/* ── 试几种域名/协议组合 ── */
const endpoints = [
  { label: '① i.y.qq.com + http', url: 'http://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg' },
  { label: '② i.y.qq.com + https', url: 'https://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg' },
  { label: '③ c.y.qq.com + https', url: 'https://c.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg' },
]

/** 发一次请求。 */
async function tryEndpoint(ep, withCookie) {
  const body = new URLSearchParams({
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    songinfo,
    format: 'json',
  }).toString()

  const headers = {
    'User-Agent': UA,
    Referer: REF,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json, text/plain, */*',
  }
  if (withCookie) headers.Cookie = withCookie

  try {
    const r = await fetch(ep.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(20000) })
    const text = await r.text()
    return { status: r.status, text }
  } catch (e) {
    return { status: 0, text: '', err: e.message }
  }
}

/* 先不带 cookie 试 */
console.log('\n════════ 匿名试（不带 cookie）════════\n')
for (const ep of endpoints) {
  const r = await tryEndpoint(ep, null)
  console.log(`── ${ep.label}`)
  console.log(`   HTTP ${r.status}${r.err ? '  ' + r.err : ''}   长度 ${r.text.length}`)
  console.log(`   ${r.text.slice(0, 260).replace(/\s+/g, ' ')}`)
  console.log('')
  await new Promise(r => setTimeout(r, 500))
}

/* 再带登录 cookie 试 */
console.log('════════ 带登录态试 ════════\n')
let cookie = ''
try {
  const { getSession } = await import('./qq-session.mjs')
  const s = await getSession()
  cookie = s.cookie
  console.log(`  拿到 cookie（${cookie.length} 字节，昵称 ${s.nick}）\n`)
} catch (e) {
  console.log('  拿不到 cookie（调试 Edge 没开？）：' + e.message + '\n')
}

if (cookie) {
  const r = await tryEndpoint(endpoints[1], cookie)
  console.log(`── 带 cookie：${endpoints[1].label}`)
  console.log(`   HTTP ${r.status}   长度 ${r.text.length}`)
  console.log(`   ${r.text.slice(0, 800).replace(/\s+/g, ' ')}`)

  // 试着解析
  try {
    const j = JSON.parse(r.text)
    console.log(`\n   解析成功：code=${j.code}`)
    if (j.data?.songlist) {
      console.log(`   匹配到 ${j.data.songlist.length} 首：`)
      for (const s of j.data.songlist.slice(0, 10)) {
        console.log('     ' + JSON.stringify(s).slice(0, 180))
      }
    } else {
      console.log('   data: ' + JSON.stringify(j.data).slice(0, 300))
    }
  } catch {
    console.log('   （不是 JSON）')
  }
}
