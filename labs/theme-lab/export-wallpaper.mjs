/*
 * 导出视频壁纸（网页用）· export wallpaper video
 * --------------------------------------------
 * 把 WE 的视频壁纸中裁、降分辨率、重编码成适合网页循环播放的 mp4。
 *
 * 要点：
 *   · 居中裁切（用户要求"留中间，中间是铃兰"）
 *   · 降到 810px 宽：4K 原片 69MB，网页用不上那么大
 *   · -movflags +faststart：让浏览器能边下边播，不用等整段下载完
 *   · 去掉音轨（壁纸没声，且静音自动播放才不被浏览器拦）
 *
 * 用法：node theme-lab/export-wallpaper.mjs
 * 产物：theme-lab/characters/wallpaper/*.mp4
 */

import { mkdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'characters', 'wallpaper')
mkdirSync(OUT, { recursive: true })

const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'
const SRC = 'D:/Steam/steamapps/workshop/content/431960/2946293341/[明日方舟] 铃兰 雪霁 - 昼夜更替.mp4'

if (!existsSync(SRC)) { console.error('源视频不存在'); process.exit(1) }

/** 源尺寸 3840x2160。 */
const SRC_W = 3840
const SRC_H = 2160

const VARIANTS = [
  {
    tag: 'square',
    label: '正方形 1:1',
    // 1215x1215 居中，缩到 810
    size: 810,
    cropW: SRC_H,
    outW: 810, outH: 810,
  },
  {
    tag: '34',
    label: '竖版 3:4',
    // 1620x2160 居中，缩到 810x1080
    size: 810,
    cropW: Math.round(SRC_H * 3 / 4),
    outW: 810, outH: 1080,
  },
]

for (const v of VARIANTS) {
  const out = join(OUT, `suzuran_yukihare_${v.tag}.mp4`)
  console.log(`\n--- ${v.label} → ${v.outW}x${v.outH} ---`)
  const vf = `crop=${v.cropW}:${SRC_H}:(iw-${v.cropW})/2:0,scale=${v.outW}:${v.outH}:flags=lanczos`
  const args = [
    '-y', '-v', 'error',
    '-i', SRC,
    '-vf', vf,
    '-an',                       // 去音轨
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',       // 兼容性最好
    '-movflags', '+faststart',   // 边下边播
    out,
  ]
  const t0 = Date.now()
  try {
    execFileSync(FFMPEG, args, { stdio: 'inherit', maxBuffer: 64 * 1024 * 1024 })
    const mb = statSync(out).size / 1024 / 1024
    console.log(`  ✓ ${out.replace(HERE + '\\', '')}  ${mb.toFixed(2)} MB  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  } catch (e) {
    console.error('  失败:', String(e.message).slice(0, 200))
  }
}

console.log('\n完成。目录内容：')
for (const f of (await import('node:fs')).readdirSync(OUT)) {
  console.log(`  ${(statSync(join(OUT, f)).size / 1024 / 1024).toFixed(2)} MB  ${f}`)
}
