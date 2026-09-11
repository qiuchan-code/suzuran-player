/*
 * 带着完整登录态和老参数体系重试 · legacy-call.mjs
 * ---------------------------------------------
 * 关键发现：create_playlist_add_song.fcg 没挂，它只是回 "please login first"。
 * 所以老接口体系还在，之前 502/1101 是我请求发得不对。
 *
 * 老页面的 FormSender 全貌（从 music.js 里挖的）：
 *   默认参数：
 *     loginUin, hostUin:0, format:"fs", inCharset, outCharset,
 *     notice:0, platform:"yqq", needNewCode:0, g_tk
 *   g_tk = _DJB(skey || qqmusic_key)
 *   还走了一个 proxyURL（FSHelperPage）—— 提交不是直接发到目标 URL！
 *
 * 所以先探测 create_playlist_add_song（它是 GET + JSONP 风格），再回头调 match。
 *
 * 用法：node --use-system-ca overlay/tools/legacy-call.mjs
 */

import { readFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

function djbHash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; ++i) hash += (hash << 5) + str.charCodeAt(i)
  return hash & 2147483647
}
const cookieOf = (c, n) => {
  const m = new RegExp('(?:^|;\\s*)' + n + '=([^;]*)').exec(c)
  return m ? decodeURIComponent(m[1]) : ''
}

const { getSession } = await import('./qq-session.mjs')
const sess = await getSession()
const skey = cookieOf(sess.cookie, 'skey') || cookieOf(sess.cookie, 'qqmusic_key')
const gtk = djbHash(skey)

const BASE = {
  loginUin: String(sess.uin || 0),
  hostUin: '0',
  inCharset: 'utf-8',
  outCharset: 'utf-8',
  notice: '0',
  platform: 'yqq',
  needNewCode: '0',
  g_tk: String(gtk),
}

console.log(`登录：${sess.nick}  uin=${sess.uin}  g_tk=${gtk}\n`)

/** GET 调老接口（老页面很多是 GET + JSONP）。 */
async function getCall(url, params) {
  const qs = new URLSearchParams({ ...BASE, ...params }).toString()
  const full = url + (url.includes('?') ? '&' : '?') + qs
  const r = await fetch(full, {
    headers: { 'User-Agent': UA, Referer: REF, Cookie: sess.cookie, Accept: '*/*' },
    signal: AbortSignal.timeout(25000),
  })
  return { status: r.status, text: await r.text(), url: full }
}

/** POST 调老接口。 */
async function postCall(url, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA, Referer: REF, Cookie: sess.cookie,
      'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*',
    },
    body: new URLSearchParams({ ...BASE, ...params }).toString(),
    signal: AbortSignal.timeout(25000),
  })
  return { status: r.status, text: await r.text() }
}

/* ── ① 先确认 create_playlist_add_song 认得我们 ── */
console.log('════════ ① create_playlist_add_song（只探登录态，不带真实操作）════════\n')
{
  const r = await getCall('https://c.y.qq.com/s.plcloud/fcgi-bin/create_playlist_add_song.fcg', {
    format: 'json',
  })
  console.log(`  HTTP ${r.status}`)
  console.log('  ' + r.text.slice(0, 300).replace(/\s+/g, ' '))
  const loggedIn = !/please login first/.test(r.text)
  console.log(loggedIn ? '  ✓ 登录态被认了' : '  ✗ 还是说没登录 —— cookie 可能不全（老接口要 skey，不是 qm_keyst）')
}

/* ── ② 试 fcg_match_songid（多种参数组合）── */
console.log('\n════════ ② fcg_match_songid 参数组合 ════════\n')

const FILE = 'C:\\Users\\56851\\Desktop\\歌单拆分\\素材_中文_3063首_2026-09-11.txt'
const lines = readFileSync(FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
const parse = (l) => { const i = l.lastIndexOf(' - '); return i < 0 ? null : { n: l.slice(0, i).trim(), a: l.slice(i + 3).trim() } }
const sample = lines.slice(0, 5).map(parse).filter(Boolean)

const variants = [
  { label: 'format=json + songinfo', params: { format: 'json', songinfo: sample.map(s => `${s.n}|${s.a}`).join('||') } },
  { label: 'format=fs + songinfo', params: { format: 'fs', songinfo: sample.map(s => `${s.n}|${s.a}`).join('||') } },
  { label: 'format=json + 单首', params: { format: 'json', songinfo: `${sample[0].n}|${sample[0].a}` } },
  { label: 'format=json + songinfo 用 || 但带 songname/singer', params: { format: 'json', songinfo: sample.map(s => `${s.n}|${s.a}`).join('||'), songname: sample[0].n, singer: sample[0].a } },
  { label: 'format=json + lyrics 字段名', params: { format: 'json', songinfo: `${sample[0].n}-${sample[0].a}` } },
]

for (const v of variants) {
  const r = await postCall('https://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg', v.params)
  const short = r.text.slice(0, 200).replace(/\s+/g, ' ')
  console.log(`── ${v.label}`)
  console.log(`   HTTP ${r.status}  ${short}`)
  if (/"code":0/.test(r.text) && /songlist/.test(r.text)) {
    console.log('\n   ✓✓✓ 通了！')
    console.log(r.text.slice(0, 1200))
    process.exit(0)
  }
  await new Promise(r => setTimeout(r, 700))
}

/* ── ③ 也试 GET ── */
console.log('\n════════ ③ 换 GET 试 ════════\n')
for (const fmt of ['json', 'fs']) {
  const r = await getCall('https://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg', {
    format: fmt,
    songinfo: sample.map(s => `${s.n}|${s.a}`).join('||'),
  })
  console.log(`── GET format=${fmt}`)
  console.log(`   HTTP ${r.status}  ${r.text.slice(0, 250).replace(/\s+/g, ' ')}`)
  await new Promise(r => setTimeout(r, 700))
}

console.log('\n注：老页面的 FormSender 是通过一个 proxyURL（FSHelperPage）提交的，')
console.log('    不是直接 POST 到目标域名。如果上面都不通，下一步就去找那 个 proxy 地址。')
