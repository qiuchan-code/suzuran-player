/*
 * 看频谱怎么画的 + 窗口有没有省电策略 · inspect-viz.mjs
 * --------------------------------------------------
 * 基准显示频谱是最大头（占 42% 帧耗时），先搞清它到底在干什么。
 *
 * 重点看：
 *   · 是不是每帧都在改 DOM 的 style（会触发重排/重绘）
 *   · 有没有读布局属性（offsetWidth / getBoundingClientRect）→ 强制同步重排
 *   · 有没有用 canvas
 *   · 窗口有没有在"不可见/息屏"时暂停的机制
 *
 * 用法：node desktop/tools/inspect-viz.mjs
 */

import { readFileSync } from 'node:fs'

const src = readFileSync('src/build-player-ui.mjs', 'utf8')
const lines = src.split('\n')

/** 打印某个函数体。 */
function showFn(name, maxLines = 60) {
  const i = lines.findIndex(l => new RegExp(`function\\s+${name}\\s*\\(`).test(l))
  if (i < 0) { console.log(`  （找不到 ${name}）`); return }
  console.log(`\n── ${name}()  行 ${i + 1} ──`)
  let depth = 0, started = false
  for (let k = i; k < Math.min(lines.length, i + maxLines); k++) {
    const l = lines[k]
    for (const ch of l) { if (ch === '{') { depth++; started = true } else if (ch === '}') depth-- }
    console.log('  ' + l)
    if (started && depth <= 0) break
  }
}

console.log('════════ 频谱实现 ════════')
for (const n of ['vizFrame', 'buildViz']) showFn(n, 45)

console.log('\n════════ 每一帧改了多少 DOM ════════\n')
/* 找 rAF 循环里对 style / textContent 的写入 */
const loopBodies = [...src.matchAll(/function\s+(\w*(?:[Ll]oop|[Ff]rame|[Tt]ick)\w*)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g)]
for (const [, name, body] of loopBodies) {
  const styleWrites = (body.match(/\.style\./g) ?? []).length
  const textWrites = (body.match(/textContent\s*=/g) ?? []).length
  const classWrites = (body.match(/classList\./g) ?? []).length
  const layoutReads = (body.match(/offsetWidth|offsetHeight|getBoundingClientRect|clientWidth|clientHeight|scrollTop/g) ?? []).length
  console.log(`  ${name.padEnd(14)} style写 ${String(styleWrites).padStart(3)}  text写 ${String(textWrites).padStart(3)}  class写 ${String(classWrites).padStart(3)}  ⚠布局读 ${layoutReads}`)
}

console.log('\n════════ 全局搜"强制同步布局"的写法 ════════\n')
const forced = [
  ['offsetWidth/offsetHeight', /offset(Width|Height)/g],
  ['getBoundingClientRect', /getBoundingClientRect/g],
  ['clientWidth/clientHeight', /client(Width|Height)/g],
  ['getComputedStyle', /getComputedStyle/g],
]
for (const [name, re] of forced) {
  const n = (src.match(re) ?? []).length
  if (n) {
    console.log(`  ${name.padEnd(26)} ${String(n).padStart(3)} 次`)
    /* 找出所在函数 */
    for (const m of src.matchAll(re)) {
      const before = src.slice(0, m.index)
      const fn = [...before.matchAll(/function\s+(\w+)/g)].pop()
      if (fn) console.log(`      ← ${fn[1]}()`)
      if (m.index > 60000) break
    }
  }
}

console.log('\n════════ 窗口省电策略（有没有在不需要时停下来）════════\n')
const power = [
  ['visibilitychange', /visibilitychange/g, '页面不可见时暂停'],
  ['document.hidden', /document\.hidden/g, ''],
  ['blur / focus 事件', /addEventListener\(['"]blur|addEventListener\(['"]focus/g, '窗口失焦时停'],
  ['powerMonitor', /powerMonitor/g, '系统息屏/挂起时停'],
  ['backgroundThrottling', /backgroundThrottling/g, 'Electron 的后台节流'],
  ['setIgnoreMouseEvents', /setIgnoreMouseEvents/g, ''],
  ['requestVideoFrameCallback', /requestVideoFrameCallback/g, ''],
  ['prefers-reduced-motion', /prefers-reduced-motion/g, '系统省电偏好'],
]
for (const [name, re, note] of power) {
  const n = (src.match(re) ?? []).length
  console.log(`  ${n ? '✓' : '✗'} ${name.padEnd(26)} ${String(n).padStart(3)} 次  ${note}`)
}

console.log('\n════════ desktop/main.mjs 里的省电相关 ════════\n')
try {
  const main = readFileSync('desktop/main.mjs', 'utf8')
  for (const [name, re] of [
    ['backgroundThrottling', /backgroundThrottling/g],
    ['powerMonitor', /powerMonitor/g],
    ['setBackgroundThrottling', /setBackgroundThrottling/g],
    ['disable-frame-rate-limit', /disable-frame-rate-limit/g],
    ['disable-gpu-vsync', /disable-gpu-vsync/g],
  ]) {
    const n = (main.match(re) ?? []).length
    console.log(`  ${n ? '✓' : '✗'} ${name.padEnd(26)} ${n} 次`)
  }
  console.log('\n  webPreferences 里设了什么：')
  const m = /webPreferences:\s*\{([\s\S]{0,400}?)\}/.exec(main)
  if (m) console.log(m[1].split('\n').map(l => '    ' + l.trim()).join('\n'))
} catch (e) { console.log('  读不到 desktop/main.mjs: ' + e.message) }
