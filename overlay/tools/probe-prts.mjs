/*
 * 抓 PRTS 铃兰页面里的立绘链接 · prts probe
 * 用法：node lyric-overlay/tools/probe-prts.mjs
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

const res = await fetch('https://prts.wiki/w/%E9%93%83%E5%85%B0', { headers: { 'User-Agent': UA } })
const html = await res.text()
console.log('页面大小:', html.length)

// 所有 prts 域名下的图片链接
const urls = [...new Set(html.match(/https:\/\/[a-z.]*prts\.wiki\/[^"'\s)]+\.(?:png|jpg|jpeg|webp)/gi) ?? [])]
console.log('图片链接总数:', urls.length)

const decoded = urls.map(u => ({ raw: u, d: decodeURIComponent(u) }))

console.log('\n--- 含 char_358（铃兰内部代号 lisa） ---')
decoded.filter(x => /char_358|358_lisa/i.test(x.d)).slice(0, 30).forEach(x => console.log('  ', x.d))

console.log('\n--- 疑似立绘（含立绘/皮肤/skin 关键词） ---')
decoded.filter(x => /立绘|皮肤|skin|char_358/i.test(x.d)).slice(0, 30).forEach(x => console.log('  ', x.d))

console.log('\n--- 前 20 个链接（看命名规律） ---')
decoded.slice(0, 20).forEach(x => console.log('  ', x.d))

// 也看看有没有 charinfo 接口
const m = html.match(/charinfo[^"']*/gi)
if (m) {
  console.log('\n--- charinfo 相关 ---')
  ;[...new Set(m)].slice(0, 10).forEach(x => console.log('  ', x))
}
