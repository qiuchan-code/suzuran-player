/*
 * 用正确的参数调老接口 · qq-legacy-api.mjs
 * --------------------------------------
 * 从 music.js 里挖到的完整调用约定：
 *
 *   默认参数（FormSender 自动补的）：
 *     loginUin, hostUin:0, format:"fs", inCharset, outCharset,
 *     notice:0, platform:"yqq", needNewCode:0
 *   外加：
 *     g_tk = _DJB(skey 或 qqmusic_key)      ← **之前缺的就是这个**
 *
 *   _DJB(str): hash=5381; hash += (hash<<5) + charCodeAt(i); return hash & 2147483647
 *
 * 接口：
 *   POST https://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg
 *        songinfo = "歌名|歌手||歌名|歌手"（最多 500 首）
 *
 * 用法：node --use-system-ca overlay/tools/qq-legacy-api.mjs
 */

import { readFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

/** 腾讯标准的 CSRF token 算法。 */
function djbHash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; ++i) hash += (hash << 5) + str.charCodeAt(i)
  return hash & 2147483647
}

/** 从 cookie 串里取某项。 */
function cookieOf(cookie, name) {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(cookie)
  return m ? decodeURIComponent(m[1]) : ''
}

/**
 * 调老 fcg 接口。
 * @param {string} url
 * @param {object} data 业务参数
 * @param {{cookie:string, uin:string}} sess
 */
async function legacyCall(url, data, sess, { format = 'json' } = {}) {
  const skey = cookieOf(sess.cookie, 'skey') || cookieOf(sess.cookie, 'qqmusic_key')
  const gtk = djbHash(skey)

  const body = new URLSearchParams({
    loginUin: String(sess.uin || 0),
    hostUin: '0',
    format,
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq',
    needNewCode: '0',
    g_tk: String(gtk),
    ...data,
  }).toString()

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: REF,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      Cookie: sess.cookie,
    },
    body,
    signal: AbortSignal.timeout(25000),
  })
  const text = await r.text()
  return { status: r.status, text }
}

/* ── 主流程 ── */

console.log('════════ ① 取登录态 ════════\n')
const { getSession } = await import('./qq-session.mjs')
const sess = await getSession()
console.log(`  昵称 ${sess.nick}   uin ${sess.uin}`)

const skey = cookieOf(sess.cookie, 'skey') || cookieOf(sess.cookie, 'qqmusic_key')
console.log(`  skey/qqmusic_key 长度 ${skey.length}`)
console.log(`  算出的 g_tk = ${djbHash(skey)}`)
console.log(`  cookie 里有哪些键：${sess.cookie.split(';').map(s => s.trim().split('=')[0]).join(', ')}`)

console.log('\n════════ ② 试 fcg_match_songid ════════\n')

const FILE = 'C:\\Users\\56851\\Desktop\\歌单拆分\\素材_中文_3063首_2026-09-11.txt'
const lines = readFileSync(FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
const parse = (l) => {
  const i = l.lastIndexOf(' - ')
  return i < 0 ? null : { name: l.slice(0, i).trim(), artist: l.slice(i + 3).trim() }
}
const sample = lines.slice(0, 8).map(parse).filter(Boolean)
const songinfo = sample.map(s => `${s.name}|${s.artist}`).join('||')
console.log(`  8 首，songinfo ${songinfo.length} 字符`)

const MATCH_URLS = [
  'https://i.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg',
  'https://c.y.qq.com/lyric/fcgi-bin/fcg_match_songid.fcg',
]

for (const url of MATCH_URLS) {
  console.log(`\n── ${url}`)
  for (const format of ['json', 'fs']) {
    const r = await legacyCall(url, { songinfo }, sess, { format })
    console.log(`   [format=${format}] HTTP ${r.status}  ${r.text.length} 字节`)
    console.log(`     ${r.text.slice(0, 400).replace(/\s+/g, ' ')}`)

    try {
      const j = JSON.parse(r.text)
      if (j.code === 0 && j.data?.songlist) {
        console.log(`\n   ✓✓ 匹配成功！${j.data.songlist.length} 首`)
        for (const s of j.data.songlist.slice(0, 6)) {
          console.log('     ' + JSON.stringify(s))
        }
        console.log('\n   ════ 这就是我们要的接口 ════')
        process.exit(0)
      }
    } catch { /* 不是 JSON */ }
    await new Promise(r => setTimeout(r, 600))
  }
}

console.log('\n✗ 还没通，需要再调参数。')
