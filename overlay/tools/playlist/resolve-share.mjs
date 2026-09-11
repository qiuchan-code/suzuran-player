/*
 * 解析 QQ 音乐分享短链 · resolve-share.mjs
 * --------------------------------------
 * 分享出来的链接形如 https://c6.y.qq.com/base/fcgi-bin/u?__=xxxx
 * 它是个跳转短链，需要跟着重定向找到真正的歌单 id。
 *
 * 用法：node --use-system-ca overlay/tools/playlist/resolve-share.mjs <分享链接>
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const share = process.argv[2] ?? 'https://c6.y.qq.com/base/fcgi-bin/u?__=WuidD7UF9FVj'

console.log(`分享链接：${share}\n`)

console.log('=== ① 手动跟随重定向 ===')
try {
  const r = await fetch(share, {
    headers: { 'User-Agent': UA, Referer: REF, Accept: 'text/html,application/xhtml+xml,*/*' },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  })
  console.log(`  HTTP ${r.status}`)
  console.log('  响应头：')
  for (const [k, v] of r.headers) {
    if (/location|set-cookie|content-type/i.test(k)) console.log(`    ${k}: ${v.slice(0, 200)}`)
  }
  const body = await r.text()
  console.log(`  正文长度 ${body.length}`)
  if (body.length > 0 && body.length < 3000) {
    console.log('  正文：')
    console.log(body.split('\n').slice(0, 20).map(l => '    ' + l).join('\n'))
  }
} catch (e) {
  console.log('  失败: ' + e.message)
}

console.log('\n=== ② 自动跟随重定向 ===')
try {
  const r = await fetch(share, {
    headers: { 'User-Agent': UA, Referer: REF },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  console.log(`  HTTP ${r.status}`)
  console.log(`  最终 URL: ${r.url}`)

  // 从最终 URL 里抠出各种可能的 id
  const u = r.url
  const patterns = [
    ['歌单 disstid', /playlist\/(\d+)/],
    ['歌单 id (参数)', /[?&](?:id|disstid)=(\d+)/],
    ['专辑 albumId', /albumDetail\/(\d+)/],
    ['歌手 singerMid', /singer\/(\w+)/],
    ['歌曲 songmid', /songDetail\/(\w+)/],
  ]
  console.log('  识别出的 id：')
  let found = false
  for (const [label, re] of patterns) {
    const m = re.exec(u)
    if (m) { console.log(`    ✓ ${label}: ${m[1]}`); found = true }
  }
  if (!found) console.log('    （最终 URL 里没有标准 id，看下面的正文）')

  const body = await r.text()
  console.log(`  正文长度 ${body.length}`)
  // 页面里常有 __INITIAL_DATA__ 或 window.__data 之类的内嵌 JSON
  for (const key of ['disstid', 'dissid', 'playlistId', 'songlist', 'dissname']) {
    const i = body.indexOf(key)
    if (i >= 0) {
      console.log(`    正文含 "${key}"，片段：`)
      console.log('      ' + body.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' '))
      break
    }
  }
  // 打印 meta 里的信息
  const metas = [...body.matchAll(/<meta[^>]+>/gi)].slice(0, 8)
  if (metas.length) {
    console.log('  meta 标签：')
    for (const m of metas) console.log('    ' + m[0].slice(0, 160))
  }
} catch (e) {
  console.log('  失败: ' + e.message)
}
