/*
 * 间隔对照测试 · interval test
 * ---------------------------
 * 同一批歌，用不同的请求间隔跑，看哪种间隔不掉。用来定"最小安全间隔"。
 *
 * 用法：node lyric-overlay/tools/probe-interval.mjs [间隔ms]
 */

import { clearLyricCache, breakerState, searchSong } from '../src/lyrics.mjs'

const GAP = Number(process.argv[2] ?? 3000)

const SONGS = [
  ['晴天', '周杰伦'], ['奔跑', '黄征/羽泉'], ['起风了', '买辣椒也用券'],
  ['云烟成雨', '房东的猫'], ['房间', '刘瑞琦'], ['像我这样的人', '毛不易'],
  ['声声慢', '崔开潮'], ['晚安', '丢火车'], ['夜航星', '不才'],
  ['春风十里', '鹿先森乐队'], ['南山南', '马頔'], ['斑马斑马', '宋冬野'],
]

console.log(`间隔 ${GAP}ms，共 ${SONGS.length} 首\n`)

clearLyricCache()
let ok = 0
for (const [title, artist] of SONGS) {
  const t0 = Date.now()
  const r = await searchSong(title, artist)
  const ms = Date.now() - t0
  if (r !== null) ok++
  console.log(`  ${(r === null ? '✗' : '✓')} ${title.padEnd(14)} ${String(ms).padStart(5)}ms  ${r === null ? '' : r.name + ' - ' + r.singer}`)
  await new Promise(r => setTimeout(r, GAP))
}

console.log(`\n命中 ${ok}/${SONGS.length}`)
console.log('熔断:', JSON.stringify(breakerState()))
