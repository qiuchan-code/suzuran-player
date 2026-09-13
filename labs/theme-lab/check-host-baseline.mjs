/*
 * 宿主基线对比度 · host baseline
 * ------------------------------
 * 用同一套闸门量一遍 DSH 自带的亮/暗调色板，得到"及格线到底在哪"。
 * 主题只要不低于宿主自己的水平，就不算把可读性做差了。
 *
 * 用法：node theme-lab/check-host-baseline.mjs
 */

import { readFileSync } from 'node:fs'

const CSS_PATH = new URL('../data/_theme-research/design-platform.css', import.meta.url)
const css = readFileSync(CSS_PATH, 'utf8')

/** 从 design-platform.css 里按选择器收集 token 定义。 */
function collect(selector) {
  const out = {}
  const blocks = [...css.matchAll(/(body(?:\[data-ds-dark-theme\])?)\{([^{}]*)\}/g)]
  for (const b of blocks) {
    if (b[1] !== selector) continue
    for (const m of b[2].matchAll(/(--dsw-[a-z0-9-]+):([^;}]+)/g)) out[m[1]] = m[2]
  }
  return out
}

/** 展开一层（或数层）var() 引用。 */
function resolve(tokens, value) {
  let cur = String(value).trim()
  for (let i = 0; i < 8; i++) {
    const m = /^var\((--dsw-[a-z0-9-]+)\)$/.exec(cur)
    if (m === null) break
    cur = String(tokens[m[1]] ?? '').trim()
    if (cur === '') break
  }
  return cur
}

function parseColor(value) {
  const v = String(value).trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)
  if (hex !== null) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(v)
  if (fn === null) return undefined
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])]
}

const composite = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)]
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(fg, bg) {
  const f = fg[3] < 1 ? composite(fg, bg) : fg
  const [a, b] = [luminance(f), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

const SURFACES = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-specific-bubble',
  '--dsw-alias-markdown-code-block',
  '--dsw-specific-sidebar-fill',
]
const FOREGROUNDS = [
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption',
  '--dsw-alias-brand-primary',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-error-primary',
]

for (const [label, selector] of [['host-light', 'body'], ['host-dark', 'body[data-ds-dark-theme]']]) {
  const raw = collect(selector)
  const tokens = {}
  for (const [k, v] of Object.entries(raw)) tokens[k] = resolve(raw, v)
  console.log(`\n=== ${label} ===`)
  const surfaces = SURFACES.map(n => [n.replace('--dsw-', ''), parseColor(tokens[n])]).filter(x => x[1] !== undefined)
  const worst = new Map()
  for (const fgName of FOREGROUNDS) {
    const fg = parseColor(tokens[fgName])
    if (fg === undefined) continue
    let min = Infinity
    let where = ''
    for (const [sn, bg] of surfaces) {
      const r = ratio(fg, bg)
      if (r < min) { min = r; where = sn }
    }
    worst.set(fgName, { min, where })
  }
  for (const [name, { min, where }] of worst) {
    console.log(`  ${name.padEnd(38)} 最差 ${min.toFixed(2).padStart(5)}  (on ${where})`)
  }
}
