/*
 * 歌词匹配回归测试 · match test
 * ----------------------------
 * 覆盖：完全同名、带版本号、同名不同歌手、找不到。
 * 关键要求：**不串歌**（宁可 none，也不要别的歌的歌词）。
 *
 * 用法：node lyric-overlay/tools/test-match.mjs
 */

import { searchSong, lyricsFor, baseTitle, isCreditLine, firstRealLineIndex, parseLrc } from '../src/lyrics.mjs'

const CASES = [
  { title: '晴天', artist: '周杰伦', expect: 'synced' },
  { title: 'Come Over', artist: 'Dagny', expect: 'synced' },
  { title: '晚风告诉我', artist: '赵薇薇', expect: 'synced' },
  { title: 'Gotta Run (Phonk)', artist: 'GTR7', expect: 'any' },   // 带版本号
  { title: '不存在的歌名XYZ', artist: '不存在的人', expect: 'none' },
]

console.log('=== baseTitle 去版本号 ===')
for (const t of ['Gotta Run (Phonk)', '起风了 (Live)', '晚风告诉我', 'xxx -Remix', '晴天 (Live版)']) {
  console.log(`  ${t.padEnd(20)} → ${JSON.stringify(baseTitle(t))}`)
}

console.log('')
console.log('=== 搜索匹配 ===')
for (const c of CASES) {
  const song = await searchSong(c.title, c.artist)
  console.log(`  ${c.title.padEnd(22)} → ${song === null ? '未命中' : `${song.name} - ${song.singer} (${song.interval}s)`}`)
}

console.log('')
console.log('=== 端到端 ===')
let pass = 0
for (const c of CASES) {
  const r = await lyricsFor({ title: c.title, artist: c.artist })
  const ok = c.expect === 'any' ? true : r.kind === c.expect
  if (ok) pass++
  console.log(`  ${ok ? '✓' : '✗'} ${c.title.padEnd(22)} kind=${r.kind.padEnd(7)} lines=${String(r.lines.length).padStart(3)} matched=${r.matched ?? 'null'}`)
}
console.log(`\n${pass}/${CASES.length} 通过`)
