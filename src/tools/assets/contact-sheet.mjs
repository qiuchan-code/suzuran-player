/*
 * 做昼夜总览图 · day/night contact sheet
 * -------------------------------------
 * 从原片每 4 秒抽一帧，横向拼成一张图，并在帧上标时间。
 * 用来判断：哪一段是白天、哪一段是夜晚、变化是渐变还是突变。
 *
 * 用法：node src/tools/contact-sheet.mjs
 */

import { mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'assets', 'wallpaper', 'contact')
mkdirSync(OUT, { recursive: true })

const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'
const SRC = 'D:/Steam/steamapps/workshop/content/431960/2946293341/[明日方舟] 铃兰 雪霁 - 昼夜更替.mp4'

if (!existsSync(SRC)) { console.error('源视频不存在:', SRC); process.exit(1) }

/** 每 4 秒一帧，52 秒共 13 帧，横向拼接。 */
const STEP = 4
const COUNT = 13
const TW = 200      // 每帧宽
const TH = 267      // 每帧高（3:4）

console.log(`抽 ${COUNT} 帧（每 ${STEP} 秒），拼成横向总览…`)

// 用 ffmpeg 的 select+tile 一次搞定：每 STEP 秒选一帧，拼成 13x1
const filter = [
  `select='not(mod(n,${STEP * 30}))'`,      // 30fps，每 STEP 秒取一帧
  `scale=${TW}:${TH}`,
  `tile=${COUNT}x1`,
  `drawtext=text='%{eif\\:n*${STEP}\\:d}s':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4`,
].join(',')

const outFile = join(OUT, 'sheet.jpg')
try {
  execFileSync(FFMPEG, [
    '-y', '-v', 'error',
    '-i', SRC,
    '-vf', filter,
    '-frames:v', '1',
    '-q:v', '3',
    outFile,
  ], { stdio: 'inherit', maxBuffer: 32 * 1024 * 1024 })
  console.log(`  ✓ ${outFile.replace(ROOT + '\\', '')}`)
} catch (e) {
  console.error('  ffmpeg 失败，改用逐帧抽取再拼接')
  // 退化路线：逐帧抽，交给页面拼
  for (let i = 0; i < COUNT; i++) {
    const t = i * STEP
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-ss', String(t), '-i', SRC,
      '-frames:v', '1', '-vf', `crop=1620:2160:(iw-1620)/2:0,scale=${TW}:${TH}`,
      '-q:v', '4', join(OUT, `f${String(t).padStart(2, '0')}.jpg`),
    ], { stdio: 'ignore' })
  }
  console.log('  已逐帧抽取到 assets/wallpaper/contact/')
}

// 顺手算一下每帧平均亮度，用数值判断昼夜（比肉眼可靠）
console.log('\n各时间点平均亮度（0=黑 1=白）：')
for (let i = 0; i < COUNT; i++) {
  const t = i * STEP
  const f = join(OUT, `bright_${t}.jpg`)
  try {
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-ss', String(t), '-i', SRC,
      '-frames:v', '1', '-vf', 'crop=1620:2160:(iw-1620)/2:0,scale=80:107,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
      '-f', 'null', '-',
    ], { stdio: 'pipe' })
  } catch { /* 忽略 */ }
}
