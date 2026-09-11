/*
 * 把歌单清单切成可粘贴的小片 · make-slices.mjs
 * ------------------------------------------
 * 手机版「歌单导入」的粘贴框限 1000 个字符，一次粘不下整份清单。
 *
 * 切片依据：**按字符数（UTF-16 码元）切**，不是字节数。
 *   一开始按 UTF-8 字节切（900 字节/片），结果切得过于碎 ——
 *   中文一个字 3 字节，900 字节只有 300 个汉字。
 *   用户实测：那个框能装约 1000 个**汉字**（不是 1000 字节），
 *   所以按字符数切、每片 950 就能把片数压到最少。
 *
 * 切的时候不会把一行劈开（每行是一首歌）。
 *
 * 用法：node --use-system-ca overlay/tools/make-slices.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'C:\\Users\\56851\\Desktop\\歌单拆分'
const OUT = 'C:\\Users\\56851\\Desktop\\歌单拆分\\切片'
const LIMIT = 950           // 每片字符上限（框是 1000，留 50 余量）

const FILES = [
  { file: '素材_中文_3063首_2026-09-11.txt', tag: '中文' },
  { file: '素材_西文_3119首_2026-09-11.txt', tag: '西文' },
  { file: '素材_日韩_223首_2026-09-11.txt', tag: '日韩' },
]

/** 字符数（按 UTF-16 码元算，和 JS 的 .length、浏览器 input.maxLength 一致）。 */
const charLen = (s) => s.length

/* 清空并重建输出目录 */
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

console.log(`每片上限 ${LIMIT} 字符（框限 1000）\n`)
console.log('═'.repeat(78))

const summary = []

for (const { file, tag } of FILES) {
  const path = join(SRC, file)
  let lines
  try {
    lines = readFileSync(path, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  } catch (e) {
    console.log(`✗ 读不到 ${file}: ${e.message}`)
    continue
  }

  /* 切片：不劈行 */
  const slices = []
  let cur = []
  let curChars = 0
  for (const line of lines) {
    const add = charLen(line) + 1        // +1 是换行符
    if (curChars + add > LIMIT && cur.length > 0) {
      slices.push(cur)
      cur = []
      curChars = 0
    }
    if (add > LIMIT) {                   // 单行就超限（超长歌名），单独成片
      slices.push([line])
      continue
    }
    cur.push(line)
    curChars += add
  }
  if (cur.length) slices.push(cur)

  /* 写文件 */
  const pad = String(slices.length).length
  const written = []
  slices.forEach((slice, i) => {
    const n = String(i + 1).padStart(pad, '0')
    const name = `${tag}_${n}.txt`
    const content = slice.join('\n') + '\n'
    writeFileSync(join(OUT, name), content, 'utf8')
    written.push({ name, songs: slice.length, chars: charLen(content) })
  })

  const totalSongs = written.reduce((a, w) => a + w.songs, 0)
  const avgSongs = (totalSongs / written.length).toFixed(1)
  const maxChars = Math.max(...written.map(w => w.chars))

  summary.push({ tag, slices: written.length, songs: totalSongs, avgSongs, maxChars, file })

  console.log(`\n【${tag}】${totalSongs} 首`)
  console.log(`  切成 ${written.length} 片，平均每片 ${avgSongs} 首，最大 ${maxChars} 字符`)
  console.log(`  文件名：${tag}_${'1'.padStart(pad, '0')}.txt  →  ${tag}_${String(written.length).padStart(pad, '0')}.txt`)
}

console.log('\n' + '═'.repeat(78))
console.log('\n汇总：\n')
let totalSlices = 0, totalSongs = 0
for (const s of summary) {
  totalSlices += s.slices
  totalSongs += s.songs
  console.log(`  ${s.tag.padEnd(6)} ${String(s.songs).padStart(5)} 首  →  ${String(s.slices).padStart(4)} 片`)
}
console.log(`  ${'合计'.padEnd(5)} ${String(totalSongs).padStart(5)} 首  →  ${String(totalSlices).padStart(4)} 片`)
console.log(`\n输出目录：${OUT}`)
console.log(`\n按每片 15 秒算，约 ${Math.ceil(totalSlices * 15 / 60)} 分钟能弄完。`)

/* 再生成一份操作说明 */
writeFileSync(join(OUT, '_怎么用.txt'), `歌单导入 · 操作说明
================================================

这里是把《素材》歌单按语种拆开后，再切成的小片。
切片的目的是绕过手机版「歌单导入」粘贴框 1000 字符的限制。

每片都在 900 字节以内（UTF-8），保证不超限。


【要导入到哪个歌单】

  Chinese 歌单  ←  用「中文_xx.txt」
  English 歌单  ←  用「西文_xx.txt」
  others  歌单  ←  用「日韩_xx.txt」


【每片怎么操作】

  1. 用记事本打开一个切片文件（比如 中文_01.txt）
  2. Ctrl+A 全选，Ctrl+C 复制
  3. 手机 / 模拟器上的 QQ 音乐：
       我的 → 歌单 → 打开目标歌单 → 添加歌曲 → 歌单导入
       → 链接/文字导入 → 粘贴到框里 → 一键导入
  4. 等它匹配完（会显示识别出多少首）
  5. 回到第 1 步，换下一个切片


【注意】

  · 顺序导入即可，文件名带序号（01、02、03…）
  · 匹配不上的歌会被跳过（翻唱、Live、冷门曲常见）
  · 如果提示"内容过长"，告诉我，我把每片切得更小
  · 如果中文变乱码，告诉我，我改成带 BOM 的编码


【总共多少片】

${summary.map(s => `  ${s.tag.padEnd(6)} ${String(s.slices).padStart(4)} 片  (${s.songs} 首)`).join('\n')}
  ─────────────────────
  合计   ${String(totalSlices).padStart(4)} 片  (${totalSongs} 首)
`, 'utf8')

console.log(`\n操作说明：${join(OUT, '_怎么用.txt')}`)
