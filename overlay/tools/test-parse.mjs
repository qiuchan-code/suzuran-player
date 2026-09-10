import { fetchLyric, parseLrc, isCreditLine, plainLines, firstRealLineIndex, lyricsFor } from '../src/lyrics.mjs'

const MID = '0039MnYb0qxYhV'   // 晴天

const raw = await fetchLyric(MID)
console.log('fetchLyric:', raw === null ? 'null' : `lrc ${raw.lrc.length} 字, trans ${raw.trans.length} 字`)

const lines = parseLrc(raw.lrc)
console.log('parseLrc 行数:', lines.length)
lines.slice(0, 6).forEach(l => console.log('   ', l.time.toFixed(2), JSON.stringify(l.text), '→ isCreditLine:', isCreditLine(l.text)))

const real = lines.filter(l => !isCreditLine(l.text))
console.log('过滤字幕后的正文行数:', real.length)
if (real.length === 0) {
  console.log('!! 全部被判为字幕，前 10 行判定：')
  lines.slice(0, 10).forEach(l => console.log('   ', isCreditLine(l.text), JSON.stringify(l.text)))
}

console.log('firstRealLineIndex:', firstRealLineIndex(lines))

const plain = plainLines(raw.lrc)
console.log('plainLines 行数:', plain.length)
const plainReal = plain.filter(t => !isCreditLine(t))
console.log('plainLines 过滤后:', plainReal.length)

console.log('')
const r = await lyricsFor({ title: '晴天', artist: '周杰伦' })
console.log('lyricsFor →', 'kind=' + r.kind, 'lines=' + r.lines.length, 'textLines=' + r.textLines.length, 'matched=' + r.matched, 'diag=' + r.diag)
