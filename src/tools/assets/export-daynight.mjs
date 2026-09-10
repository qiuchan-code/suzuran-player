/*
 * 导出白天 / 夜晚两版壁纸 · export day & night
 * -------------------------------------------
 * 原片（铃兰 雪霁·昼夜更替）的亮度实测：
 *   0–20s   白天   YAVG≈169
 *   24–28s  夜晚   YAVG≈107（夜色 + 铃兰发光）
 *   32–44s  黄昏   YAVG≈135
 *   48s+    夜
 *
 * 所以切两段：白天取 2–19s（跳过开头静止），夜晚取 25–46s（含发光段落），
 * 各自循环。界面里两版叠加，按明暗主题交叉淡入淡出。
 *
 * 用法：node src/tools/export-daynight.mjs
 */

import { mkdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'assets', 'wallpaper')
mkdirSync(OUT, { recursive: true })

const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'
const SRC = 'D:/Steam/steamapps/workshop/content/431960/2946293341/[明日方舟] 铃兰 雪霁 - 昼夜更替.mp4'

if (!existsSync(SRC)) { console.error('源视频不存在'); process.exit(1) }

/** 源是 3840x2160，竖版 3:4 裁中间，缩到 810x1080。 */
const CROP_W = 1620
const OUT_W = 810
const OUT_H = 1080
const VF = `crop=${CROP_W}:2160:(iw-${CROP_W})/2:0,scale=${OUT_W}:${OUT_H}:flags=lanczos`

const CLIPS = [
  { tag: 'day', label: '白天', from: 2, to: 19 },
  { tag: 'night', label: '夜晚', from: 25, to: 46 },
]

for (const c of CLIPS) {
  const out = join(OUT, `suzuran_yukihare_34_${c.tag}.mp4`)
  const dur = c.to - c.from
  console.log(`\n--- ${c.label}：${c.from}s → ${c.to}s（${dur}s）→ ${out.split('\\').pop()} ---`)
  const args = [
    '-y', '-v', 'error',
    '-ss', String(c.from), '-t', String(dur),
    '-i', SRC,
    '-vf', VF,
    '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    out,
  ]
  const t0 = Date.now()
  try {
    execFileSync(FFMPEG, args, { stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 })
    console.log(`  ✓ ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  } catch (e) {
    console.error('  失败:', String(e.message).slice(0, 160))
  }
  // 顺手出一张海报帧
  const poster = join(OUT, `poster_${c.tag}.jpg`)
  try {
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-ss', String(c.from + 3), '-i', SRC,
      '-frames:v', '1', '-vf', VF + ',scale=810:1080', '-q:v', '3', poster,
    ], { stdio: 'ignore' })
    console.log(`  ✓ 海报 ${poster.split('\\').pop()}`)
  } catch { /* 忽略 */ }
}

console.log('\n完成：')
for (const f of ['suzuran_yukihare_34_day.mp4', 'suzuran_yukihare_34_night.mp4', 'poster_day.jpg', 'poster_night.jpg']) {
  const p = join(OUT, f)
  if (existsSync(p)) console.log(`  ${(statSync(p).size / 1024 / 1024).toFixed(2)} MB  ${f}`)
}
