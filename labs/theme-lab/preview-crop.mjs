/*
 * 中裁预览 · center crop check
 * ---------------------------
 * 竖向区域要放横版视频，得裁中间。先抽几帧看裁切后的构图对不对。
 *
 * 用法：node theme-lab/preview-crop.mjs
 * 产物：theme-lab/crop-check/*.jpg
 */

import { mkdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'crop-check')
mkdirSync(OUT, { recursive: true })

const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'
const SRC = 'D:/Steam/steamapps/workshop/content/431960/2946293341/[明日方舟] 铃兰 雪霁 - 昼夜更替.mp4'

if (!existsSync(SRC)) { console.error('源视频不存在:', SRC); process.exit(1) }

/** 抽一帧并裁切。 */
function grab(atSec, filter, out) {
  const args = ['-y', '-v', 'error', '-ss', String(atSec), '-i', SRC, '-frames:v', '1', '-vf', filter, '-q:v', '4', out]
  try {
    execFileSync(FFMPEG, args, { stdio: 'ignore', maxBuffer: 8 * 1024 * 1024 })
    return existsSync(out) && statSync(out).size > 1000
  } catch (e) {
    console.error('  抽帧失败:', String(e.message).slice(0, 100))
    return false
  }
}

// 源 3840x2160。竖版 9:16 → 宽 = 2160 * 9/16 = 1215
const H = 2160
const W916 = Math.round(H * 9 / 16)   // 1215
const W11 = H                          // 2160（正方）
const W34 = Math.round(H * 3 / 4)      // 1620

const CROPS = [
  { tag: 'square', w: W11, label: '正方形 1:1（2160x2160）' },
  { tag: '34', w: W34, label: '竖版 3:4（1620x2160）' },
  { tag: '916', w: W916, label: '竖版 9:16（1215x2160）' },
]

const TIMES = [5, 20, 40]

console.log(`源视频：3840x2160`)
for (const c of CROPS) {
  console.log(`\n--- ${c.label} ---`)
  for (const t of TIMES) {
    const out = join(OUT, `${c.tag}_${t}s.jpg`)
    // crop=w:h:(iw-w)/2:(ih-h)/2  居中裁切，再缩到 600 宽方便看
    const vf = `crop=${c.w}:${H}:(iw-${c.w})/2:0,scale=600:-2`
    if (grab(t, vf, out)) {
      console.log(`  ✓ ${t}s → ${out.replace(HERE + '\\', '')}  (${(statSync(out).size / 1024).toFixed(0)} KB)`)
    }
  }
}
