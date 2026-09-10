/*
 * 复现批量失败 · repro
 * 用法：node lyric-overlay/tools/repro.mjs
 */

import { searchSong, lyricsFor, searchDiagnostics, breakerState } from '../src/lyrics.mjs'

const songs = [
  ['月圆花开', 'ATK/张宇佳'], ['奔跑', '黄征/羽泉'], ['晴天', '周杰伦'],
  ['Gotta Run (Phonk)', 'GTR7'], ['Come Over', 'Dagny'], ['晚风告诉我', '赵薇薇'],
]

console.log('=== 逐个 searchSong（间隔 1.5 秒）===')
for (const [t, a] of songs) {
  try {
    const r = await searchSong(t, a)
    console.log(`  ${t.padEnd(20)} → ${r === null ? '未命中' : r.name + ' - ' + r.singer}`)
  } catch (e) {
    console.log(`  ${t.padEnd(20)} → 抛错 ${e.constructor.name}: ${e.message}`)
  }
  await new Promise(r => setTimeout(r, 1500))
}

console.log('')
console.log('熔断状态:', JSON.stringify(breakerState()))
console.log('诊断记录:')
for (const d of searchDiagnostics()) {
  console.log(`  ${d.result} | ${d.title} / ${d.artist} | 候选 ${d.candidates} | ${d.source} | ${d.how ?? ''} | ${JSON.stringify(d.names ?? [])}`)
}

console.log('')
console.log('=== 再走 lyricsFor（同样间隔）===')
for (const [t, a] of songs) {
  const r = await lyricsFor({ title: t, artist: a })
  console.log(`  ${t.padEnd(20)} → kind=${r.kind} lines=${r.lines.length}`)
  await new Promise(r => setTimeout(r, 1500))
}
