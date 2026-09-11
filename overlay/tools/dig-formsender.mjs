/*
 * 看 MUSIC.FormSender 到底加了哪些参数 · dig-formsender.mjs
 * ------------------------------------------------------
 * fcg_match_songid.fcg 返回 "parameter error"，说明缺参数。
 * 老代码用的是 MUSIC.FormSender，那是个封装，会自动补参数。
 * 把 music.js 拉下来看它的实现。
 *
 * 用法：node --use-system-ca overlay/tools/dig-formsender.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const LIB = 'http://imgcache.gtimg.cn/music/portal_v3/js/music.js?max_age=2592000&v=20151116'
const COMMON = 'http://imgcache.gtimg.cn/music/js/lib/aq_common.js?max_age=2592000'

mkdirSync('D:/suzuran-player/overlay/tools/_dump', { recursive: true })

for (const [label, url] of [['music.js', LIB], ['aq_common.js', COMMON]]) {
  console.log(`拉 ${label} …`)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' }, signal: AbortSignal.timeout(25000) })
    const t = await r.text()
    console.log(`  HTTP ${r.status}  ${t.length} 字节`)
    writeFileSync(`D:/suzuran-player/overlay/tools/_dump/${label}`, t, 'utf8')

    /* 找 FormSender */
    for (const kw of ['FormSender', 'g_tk', 'getGTk', 'skey', 'format', 'jsonpCallback']) {
      const i = t.indexOf(kw)
      if (i < 0) continue
      console.log(`\n  ── "${kw}" 出现在 ${i} ──`)
      console.log('    ' + t.slice(Math.max(0, i - 300), i + 500).replace(/\s+/g, ' '))
    }
  } catch (e) {
    console.log('  ✗ ' + e.message)
  }
  console.log('')
}

/* 也看看 g_user / g_tk 怎么来的 */
console.log('════════ 找 g_tk 的算法 ════════\n')
const { readFileSync } = await import('node:fs')
for (const f of ['music.js', 'aq_common.js']) {
  let t
  try { t = readFileSync(`D:/suzuran-player/overlay/tools/_dump/${f}`, 'utf8') } catch { continue }
  for (const kw of ['g_tk', 'GTK', 'hash33', 'bkn']) {
    const i = t.indexOf(kw)
    if (i < 0) continue
    console.log(`── ${f} 里的 "${kw}"`)
    console.log('   ' + t.slice(Math.max(0, i - 250), i + 450).replace(/\s+/g, ' '))
    console.log('')
  }
}
