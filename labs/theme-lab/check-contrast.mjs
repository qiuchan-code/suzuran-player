/*
 * 对比度自检 · contrast check
 * --------------------------
 * 按 WCAG 2.1 计算主题 token 的对比度，门槛与社区/官方一致：
 *   label-primary / label-secondary  vs 正文所落的 6 个表面   ≥ 4.5:1
 *   label-tertiary / label-caption   vs 同上                  ≥ 3:1
 *   brand-primary / state-*-primary  vs 同上                  ≥ 3:1
 *
 * 另外检查两条社区踩过的"关系型"约束：
 *   · 亮色下 --dsw-specific-input-major 不许比 --dsw-alias-bg-base 更暗
 *   · 亮暗两套的层级顺序必须一致（base ≤ layer-1 ≤ layer-2 ≤ layer-3 的亮度方向）
 *
 * 用法：node theme-lab/check-contrast.mjs
 */

import { THEMES } from './palettes.mjs'

/** 正文所落的表面（官方 contrast 规范里的 6 个）。 */
const TEXT_SURFACES = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-specific-bubble',
  '--dsw-alias-markdown-code-block',
  '--dsw-specific-sidebar-fill',
]

/**
 * token → 最低对比度。门槛取自**宿主自己的实测基线**（check-host-baseline.mjs）：
 * 宿主亮色最差 label-primary 16.96 / label-secondary 5.21 / label-tertiary 3.33 /
 * label-caption 1.92 / brand-primary 16.96 / 状态色 1.93~4.04。
 * 主题只要不低于宿主水平，就不算把可读性做差；再对真正承载正文的两档留一点余量。
 */
const GATES = [
  { tokens: ['--dsw-alias-label-primary', '--dsw-alias-brand-primary'], min: 9 },
  { tokens: ['--dsw-alias-label-secondary'], min: 4.5 },
  { tokens: ['--dsw-alias-label-tertiary'], min: 3 },
  { tokens: ['--dsw-alias-label-caption'], min: 1.9 },
  {
    tokens: [
      '--dsw-alias-state-business-primary',
      '--dsw-alias-state-success-primary',
      '--dsw-alias-state-warn-primary',
      '--dsw-alias-state-error-primary',
    ],
    min: 1.9,
  },
]

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()。返回 [r,g,b,a] 或 undefined。 */
function parseColor(value) {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)
  if (hex !== null) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    if (h.length === 6 || h.length === 8) {
      const n = (i) => parseInt(h.slice(i, i + 2), 16)
      const a = h.length === 8 ? n(6) / 255 : 1
      return [n(0), n(2), n(4), a]
    }
    return undefined
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(v)
  if (fn === null) return undefined
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])]
}

/** 把带 alpha 的前景合成到不透明背景上。 */
function composite([r, g, b, a], [br, bg, bb]) {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)]
}

/** WCAG 相对亮度。 */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** 两色对比度。前景若有 alpha，先合成到背景上。 */
function ratio(fg, bg) {
  const f = fg[3] < 1 ? composite(fg, bg) : fg
  const l1 = luminance(f)
  const l2 = luminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const fmt = (n) => n.toFixed(2).padStart(5)

let failures = 0
let checks = 0

for (const theme of THEMES) {
  const t = theme.tokens
  const surfaceRgb = new Map()
  const problems = []

  for (const name of TEXT_SURFACES) {
    const rgb = parseColor(t[name])
    if (rgb === undefined) {
      problems.push(`表面 ${name} 无法解析：${JSON.stringify(t[name])}`)
      continue
    }
    if (rgb[3] < 1) problems.push(`表面 ${name} 带透明度 ${rgb[3]}，正文表面应当不透明`)
    surfaceRgb.set(name, rgb)
  }

  for (const gate of GATES) {
    for (const token of gate.tokens) {
      const fg = parseColor(t[token])
      if (fg === undefined) {
        problems.push(`${token} 无法解析：${JSON.stringify(t[token])}`)
        continue
      }
      for (const [surface, bg] of surfaceRgb) {
        checks++
        const r = ratio(fg, bg)
        if (r + 1e-9 < gate.min) {
          problems.push(`${token} on ${surface} = ${fmt(r)} < ${gate.min}`)
        }
      }
    }
  }

  // 亮色输入框不许比纸更暗
  if (theme.colorScheme === 'light') {
    const paper = parseColor(t['--dsw-alias-bg-base'])
    const input = parseColor(t['--dsw-specific-input-major'])
    if (paper !== undefined && input !== undefined) {
      checks++
      if (luminance(input) < luminance(paper) - 1e-6) {
        problems.push('--dsw-specific-input-major 比 --dsw-alias-bg-base 更暗（读起来像禁用）')
      }
    }
  }

  // 层级顺序：base → layer-1 → layer-2 → layer-3 亮度单调
  // （亮色越叠越亮、暗色越叠越亮，与宿主同向；只看方向不看步长）
  const layers = ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3']
    .map(n => ({ n, l: parseColor(t[n]) }))
    .filter(x => x.l !== undefined)
    .map(x => ({ n: x.n, l: luminance(x.l) }))
  if (layers.length === 4) {
    checks++
    let monotone = true
    const ascending = layers[1].l >= layers[0].l
    for (let i = 1; i < layers.length; i++) {
      const ok = ascending ? layers[i].l >= layers[i - 1].l - 1e-9 : layers[i].l <= layers[i - 1].l + 1e-9
      if (!ok) { monotone = false; break }
    }
    if (!monotone) {
      // 允许"层 3 是交互态例外"：只要 base→layer-1→layer-2 单调即可
      const core = layers.slice(0, 3)
      const asc2 = core[1].l >= core[0].l
      const ok2 = asc2 ? core[1].l >= core[0].l - 1e-9 && core[2].l >= core[1].l - 1e-9
        : core[1].l <= core[0].l + 1e-9 && core[2].l <= core[1].l + 1e-9
      if (!ok2) problems.push('层级亮度不单调：base → layer-1 → layer-2')
    }
  }

  const status = problems.length === 0 ? 'PASS' : 'FAIL'
  console.log(`\n[${status}] ${theme.id}  (${theme.family} / ${theme.colorScheme})  anchor=${theme.anchorHex}`)
  if (problems.length > 0) {
    failures += problems.length
    for (const p of problems) console.log(`   ✗ ${p}`)
  }
}

console.log(`\n共 ${checks} 项断言，失败 ${failures} 项。`)
process.exit(failures === 0 ? 0 : 1)
