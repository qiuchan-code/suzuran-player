/*
 * 视频壁纸抽帧预览 · video wallpaper preview
 * ----------------------------------------
 * 用 ffmpeg 从每个视频壁纸里抽几帧，生成缩略图，方便挑选。
 *
 * 用法：node theme-lab/preview-wallpapers.mjs
 * 产物：theme-lab/wallpaper-preview/*.jpg + wallpaper-gallery.html
 */

import { mkdirSync, existsSync, readdirSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = 'D:/Steam/steamapps/workshop/content/431960'
const OUT = join(HERE, 'wallpaper-preview')
mkdirSync(OUT, { recursive: true })

const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'
const FFPROBE = 'D:\\ffmpeg\\bin\\ffprobe.exe'

/** 探测视频信息。 */
function probe(file) {
  try {
    const out = execFileSync(FFPROBE, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration,nb_frames,r_frame_rate,codec_name',
      '-show_entries', 'format=duration,size',
      '-of', 'json', file,
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const j = JSON.parse(out)
    const s = j.streams?.[0] ?? {}
    return {
      w: s.width, h: s.height, codec: s.codec_name, fps: s.r_frame_rate,
      duration: Number(j.format?.duration ?? s.duration ?? 0),
      size: Number(j.format?.size ?? 0),
    }
  } catch (e) {
    return { err: String(e.message).slice(0, 80) }
  }
}

/** 抽一帧。 */
function grab(file, atSec, out) {
  try {
    execFileSync(FFMPEG, [
      '-y', '-v', 'error', '-ss', String(atSec), '-i', file,
      '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', out,
    ], { stdio: 'ignore', maxBuffer: 8 * 1024 * 1024 })
    return existsSync(out) && statSync(out).size > 1000
  } catch { return false }
}

/** 找目录里的主视频文件。 */
function findVideo(dir) {
  for (const e of readdirSync(dir)) {
    if (/\.(mp4|webm)$/i.test(e)) return join(dir, e)
  }
  return null
}

const dirs = readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
const items = []

for (const id of dirs) {
  const dir = join(ROOT, id)
  const pj = join(dir, 'project.json')
  let title = id, type = '?'
  if (existsSync(pj)) {
    try {
      const m = JSON.parse(readFileSync(pj, 'utf8').replace(/^\uFEFF/, ''))
      title = m.title ?? id
      type = m.type ?? '?'
    } catch { /* 忽略 */ }
  }
  if (type !== 'video') continue

  const vid = findVideo(dir)
  if (vid === null) continue

  const info = probe(vid)
  const dur = info.duration || 10
  // 抽 3 帧：10% / 45% / 80%
  const frames = []
  for (const [i, frac] of [0.1, 0.45, 0.8].entries()) {
    const out = join(OUT, `${id}_${i + 1}.jpg`)
    if (grab(vid, dur * frac, out)) frames.push(basename(out))
  }
  console.log(`✓ ${title}`)
  console.log(`   ${info.w}x${info.h}  ${info.codec}  ${info.fps}fps  ${dur.toFixed(1)}s  ${(info.size / 1024 / 1024).toFixed(1)}MB`)
  console.log(`   抽帧 ${frames.length} 张`)
  items.push({ id, title, type, info, dur, frames, vid })
}

const cards = items.map(it => `
<section class="card">
  <h2>${it.title}</h2>
  <p class="meta">${it.info.w}×${it.info.h} · ${it.info.codec} · ${it.dur.toFixed(1)}s · ${(it.info.size / 1024 / 1024).toFixed(1)} MB · <code>${it.id}</code></p>
  <div class="frames">
    ${it.frames.map(f => `<img src="./wallpaper-preview/${f}" alt="帧">`).join('')}
  </div>
</section>`).join('\n')

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>视频壁纸预览</title>
<style>
@font-face { font-family:'KN Maiyuan'; src:url('./fonts/raw/KNMaiyuan-Regular.ttf') format('truetype'); }
*{box-sizing:border-box}
body{margin:0;padding:26px 30px 60px;background:#fff9fa;color:#3b2830;font-family:'KN Maiyuan','Microsoft YaHei',sans-serif}
h1{font-size:17px;font-weight:400;margin:0 0 4px}
.hint{font-size:12px;color:#9b7f8b;margin:0 0 24px;line-height:1.7}
.card{border:.5px solid rgba(59,40,48,.1);border-radius:18px;padding:16px 18px 18px;background:rgba(255,255,255,.72);margin-bottom:18px}
.card h2{font-size:14px;font-weight:400;margin:0 0 4px}
.meta{font-size:11.5px;color:#9b7f8b;margin:0 0 14px}
code{font-size:11px;color:#6b5560}
.frames{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.frames img{width:100%;border-radius:10px;display:block;background:#f6eef1}
</style></head>
<body>
<h1>视频壁纸预览（${items.length} 个）</h1>
<p class="hint">每个视频抽了 3 帧（10% / 45% / 80% 位置），看动态效果和构图。</p>
${cards}
</body></html>`

const out = join(HERE, 'wallpaper-gallery.html')
writeFileSync(out, html, 'utf8')
console.log(`\nwrote ${out}`)
