/*
 * 列出 Wallpaper Engine 本地壁纸 · list wallpapers
 * ----------------------------------------------
 * 读创意工坊目录（431960）下每个壁纸的 project.json，列出标题/类型/文件。
 *
 * 用法：node theme-lab/list-wallpapers.mjs
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:/Steam/steamapps/workshop/content/431960'

if (!existsSync(ROOT)) {
  console.log('目录不存在:', ROOT)
  process.exit(1)
}

const dirs = readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
console.log(`创意工坊壁纸：${dirs.length} 个\n`)

const MEDIA = /\.(mp4|webm|gif|png|jpe?g|webp)$/i

for (const id of dirs) {
  const dir = join(ROOT, id)
  let meta = {}
  const pj = join(dir, 'project.json')
  if (existsSync(pj)) {
    try {
      const raw = readFileSync(pj, 'utf8').replace(/^\uFEFF/, '')
      meta = JSON.parse(raw)
    } catch (e) { meta = { _err: e.message } }
  }

  // 列媒体文件
  const files = []
  const walk = (d, depth = 0) => {
    if (depth > 2) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'preview.gif' || e.name.startsWith('.')) continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (MEDIA.test(e.name)) files.push({ path: p.slice(dir.length + 1), size: statSync(p).size })
    }
  }
  try { walk(dir) } catch { /* 忽略 */ }

  console.log(`── ${id}`)
  console.log(`   title : ${meta.title ?? '(无 project.json)'}`)
  console.log(`   type  : ${meta.type ?? '?'}    file: ${meta.file ?? '?'}`)
  if (meta.general?.properties) {
    const props = Object.entries(meta.general.properties).map(([k, v]) => `${k}=${v?.value ?? ''}`)
    if (props.length) console.log(`   属性  : ${props.join(', ')}`)
  }
  const total = files.reduce((a, b) => a + b.size, 0)
  console.log(`   媒体  : ${files.length} 个，共 ${(total / 1024 / 1024).toFixed(1)} MB`)
  for (const f of files.sort((a, b) => b.size - a.size).slice(0, 4)) {
    console.log(`           ${(f.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${f.path}`)
  }
  console.log('')
}
