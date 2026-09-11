/*
 * 扒开官方导入页的源码 · dig-import-page.mjs
 * ----------------------------------------
 * 页面 https://y.qq.com/y/static/mymusic/songlist_import.html 点了按钮报
 * "MUSIC is not defined"，说明它依赖主站的全局对象。
 *
 * 这个脚本直接把页面源码拉下来，找：
 *   · 引用了哪些 JS
 *   · 匹配歌曲调的是哪个接口
 *   · MUSIC 对象是什么、怎么构造的
 *
 * 用法：node --use-system-ca overlay/tools/dig-import-page.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const PAGE = 'https://y.qq.com/y/static/mymusic/songlist_import.html'

const html = await (await fetch(PAGE, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })).text()
console.log(`页面 ${html.length} 字节\n`)

console.log('════════ ① 引用的脚本 ════════\n')
const scripts = []
for (const m of html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) scripts.push(m[1])
if (scripts.length === 0) console.log('  （没有外链脚本）')
for (const s of scripts) console.log('  ' + s)

console.log('\n════════ ② 内联脚本里出现的接口 ════════\n')
const inline = []
for (const m of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi)) inline.push(m[1])
console.log(`  内联脚本 ${inline.length} 段，共 ${inline.reduce((a, s) => a + s.length, 0)} 字节`)

const allInline = inline.join('\n')
const patterns = [
  ['fcg 接口', /[\w/]*fcg[\w_]*\.fcg[^\s"'`)]*/g],
  ['cgi-bin 路径', /[\w./-]*cgi-bin[\w./-]*/g],
  ['完整 URL', /https?:\/\/[\w.-]+(?:\/[\w./-]*)?/g],
]
for (const [label, re] of patterns) {
  const found = [...new Set(allInline.match(re) ?? [])].filter(s => s.length > 5)
  if (found.length) {
    console.log(`\n  ── ${label} ──`)
    for (const f of found.slice(0, 20)) console.log('    ' + f)
  }
}

console.log('\n════════ ③ MUSIC 对象怎么用的 ════════\n')
const musicUses = [...allInline.matchAll(/MUSIC\s*\.\s*(\w+)/g)].map(m => m[1])
const uniq = [...new Set(musicUses)]
if (uniq.length === 0) console.log('  （内联脚本里没直接用 MUSIC）')
else {
  console.log('  用到的成员：' + uniq.join(', '))
}

/* 上下文片段，看看怎么用的 */
for (const kw of ['MUSIC.', 'matchSong', '匹配', 'importSong', 'xiami']) {
  const i = allInline.indexOf(kw)
  if (i < 0) continue
  console.log(`\n  ── 出现 "${kw}" 的上下文 ──`)
  console.log('    ' + allInline.slice(Math.max(0, i - 300), i + 400).replace(/\s+/g, ' '))
}

console.log('\n════════ ④ 把所有内联脚本存下来慢慢看 ════════\n')
const { writeFileSync, mkdirSync } = await import('node:fs')
mkdirSync('D:/suzuran-player/overlay/tools/_dump', { recursive: true })
inline.forEach((s, i) => {
  writeFileSync(`D:/suzuran-player/overlay/tools/_dump/import-inline-${i}.js`, s, 'utf8')
})
writeFileSync('D:/suzuran-player/overlay/tools/_dump/import-page.html', html, 'utf8')
console.log(`  已存到 overlay/tools/_dump/ （${inline.length} 段内联脚本 + 原始 HTML）`)

console.log('\n════════ ⑤ 页面里有没有"导入歌单"按钮和它绑的接口 ════════\n')
for (const kw of ['id_match', 'id_import', '导入歌单', 'btn_upload']) {
  const i = html.indexOf(kw)
  if (i < 0) { console.log(`  ${kw}: 没找到`); continue }
  console.log(`  ── ${kw} ──`)
  console.log('    ' + html.slice(Math.max(0, i - 200), i + 300).replace(/\s+/g, ' '))
}
