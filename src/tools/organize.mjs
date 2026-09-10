/*
 * 整理 src/tools：按用途分目录 · organize.mjs
 * -------------------------------------------
 * 45 个脚本平铺在一起太乱。按用途分五组：
 *   lib/    公共库（被别的脚本 import）
 *   shots/  截图与视觉验证
 *   checks/ 断言 / 测量 / 排查
 *   labs/   样张页生成（背景动效、字体）
 *   assets/ 素材处理（壁纸导出、字体信息）
 *
 * 移动后自动修正相对 import。
 *
 * 用法：node src/tools/organize.mjs
 */

import { mkdirSync, readdirSync, renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 分组表。没列到的留在原处。 */
const GROUPS = {
  lib: ['cdp-shot.mjs', 'cute-font-sample.mjs'],
  shots: [
    'shoot-ui.mjs', 'shoot-ui-dark.mjs', 'shoot-timer.mjs', 'shot-el.mjs',
    'verify-live-ui.mjs', 'verify-player-ui.mjs', 'verify-hero.mjs',
    'verify-slider.mjs', 'verify-settings.mjs', 'verify-snap-freeze.mjs',
    'transition-strip.mjs', 'transition-frames.mjs',
  ],
  checks: [
    'smoke.mjs', 'check-divider.mjs', 'check-shrink.mjs', 'check-font-coverage.mjs',
    'isolate-divider.mjs', 'bisect-divider.mjs', 'measure-ui.mjs', 'measure-boxes.mjs',
    'measure-clock.mjs', 'dump-columns.mjs', 'what-at-x.mjs', 'bg-audit.mjs',
    'dom-dump.mjs', 'snap-audit.mjs', 'snap-inline.mjs', 'body-vars.mjs',
    'mask-assign.mjs', 'mask-mode-test.mjs', 'two-layer.mjs', 'switch-minimal.mjs',
    'read-rvlog.mjs', 'transition-log.mjs', 'transition-errors.mjs',
    'debug-live.mjs', 'debug-parts.mjs',
  ],
  labs: ['build-bg-lab.mjs', 'build-cute-font-lab.mjs'],
  assets: ['export-daynight.mjs', 'contact-sheet.mjs', 'font-names.mjs', 'fetch-cute-fonts.mjs'],
}

const target = new Map()
for (const [group, files] of Object.entries(GROUPS)) {
  for (const f of files) target.set(f, group)
}

for (const g of Object.keys(GROUPS)) mkdirSync(join(HERE, g), { recursive: true })

// ── 移动 ──
let moved = 0
const nowIn = new Map()
for (const f of readdirSync(HERE)) {
  if (!f.endsWith('.mjs')) continue
  nowIn.set(f, target.get(f) ?? '')
}
for (const [f, g] of nowIn) {
  if (g === '') continue
  const from = join(HERE, f)
  const to = join(HERE, g, f)
  if (!existsSync(from)) continue
  renameSync(from, to)
  moved++
}
console.log(`移动了 ${moved} 个文件`)

// ── 修相对 import ──
const allFiles = []
const walk = (dir, rel) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), rel === '' ? e.name : rel + '/' + e.name)
    else if (e.name.endsWith('.mjs')) allFiles.push({ name: e.name, rel: rel === '' ? e.name : rel + '/' + e.name, abs: join(dir, e.name) })
  }
}
walk(HERE, '')

const locOf = new Map(allFiles.map(f => [f.name, f.rel]))
let fixed = 0
for (const f of allFiles) {
  const src = readFileSync(f.abs, 'utf8')
  const next = src.replace(/from '\.\/([\w.-]+\.mjs)'/g, (m, dep) => {
    const depRel = locOf.get(dep)
    if (depRel === undefined) return m
    const fromParts = dirname(f.rel) === '.' ? [] : dirname(f.rel).split('/')
    const depParts = depRel.split('/')
    while (fromParts.length > 0 && depParts.length > 1 && fromParts[0] === depParts[0]) {
      fromParts.shift(); depParts.shift()
    }
    const p = [...fromParts.map(() => '..'), ...depParts].join('/')
    return "from '" + (p.startsWith('.') ? p : './' + p) + "'"
  })
  if (next !== src) {
    writeFileSync(f.abs, next, 'utf8')
    fixed++
    console.log(`  修 import: ${f.rel}`)
  }
}
console.log(`修了 ${fixed} 个文件的 import\n`)

console.log('=== 整理后 ===')
for (const g of ['', ...Object.keys(GROUPS)]) {
  const dir = g === '' ? HERE : join(HERE, g)
  const list = readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.mjs'))
  if (list.length === 0) continue
  console.log(`  ${g === '' ? '(tools 根)' : g + '/'}  ${list.length} 个：`)
  console.log('      ' + list.map(e => e.name).join('\n      '))
}
