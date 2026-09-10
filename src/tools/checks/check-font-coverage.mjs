/*
 * 字体覆盖检查
 * -------------
 * 样张里最容易骗人的一件事：字体其实没加载成功，浏览器悄悄 fallback 成系统字体，
 * 卡片看起来"也还行"。所以渲染之前先从数据上确认：每款字体到底有没有样张里
 * 每一个字的字形。
 *
 * 两种落地形态分别处理：
 *   ttf / otf        → 直接解析 sfnt 的 cmap 表
 *   font.css + woff2 切片（cn-fontsource 包）→ 解析 CSS 里的 unicode-range 并集
 *
 * 用法：node src/tools/check-font-coverage.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SAMPLE, sampleChars } from '../lib/cute-font-sample.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CUTE = join(ROOT, 'assets', 'fonts', 'cute')

export { SAMPLE }

/* ── 极简 sfnt cmap 解析 ─────────────────────────────── */
function readTables(buf) {
  const num = buf.readUInt16BE(4)
  const t = {}
  for (let i = 0; i < num; i++) {
    const o = 12 + i * 16
    const tag = buf.toString('ascii', o, o + 4)
    t[tag] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) }
  }
  return t
}

function parseCmap(buf, off) {
  const n = buf.readUInt16BE(off + 2)
  const recs = []
  for (let i = 0; i < n; i++) {
    const o = off + 4 + i * 8
    recs.push({ pid: buf.readUInt16BE(o), eid: buf.readUInt16BE(o + 2), off: buf.readUInt32BE(o + 4) })
  }
  // 优先 (3,10) UCS-4，其次 (3,1) BMP，再次 (0,x)
  const pick =
    recs.find(r => r.pid === 3 && r.eid === 10) ||
    recs.find(r => r.pid === 3 && r.eid === 1) ||
    recs.find(r => r.pid === 0)
  if (!pick) return null
  const sub = off + pick.off
  const fmt = buf.readUInt16BE(sub)

  if (fmt === 4) {
    const segX2 = buf.readUInt16BE(sub + 6)
    const seg = segX2 / 2
    const endO = sub + 14
    const startO = endO + segX2 + 2
    const deltaO = startO + segX2
    const rangeO = deltaO + segX2
    return cp => {
      if (cp > 0xffff) return 0
      for (let i = 0; i < seg; i++) {
        const end = buf.readUInt16BE(endO + i * 2)
        if (cp > end) continue
        const start = buf.readUInt16BE(startO + i * 2)
        if (cp < start) return 0
        const delta = buf.readInt16BE(deltaO + i * 2)
        const ro = buf.readUInt16BE(rangeO + i * 2)
        if (ro === 0) return (cp + delta) & 0xffff
        const g = buf.readUInt16BE(rangeO + i * 2 + ro + (cp - start) * 2)
        return g === 0 ? 0 : (g + delta) & 0xffff
      }
      return 0
    }
  }

  if (fmt === 12) {
    const nGroups = buf.readUInt32BE(sub + 12)
    const groups = []
    for (let i = 0; i < nGroups; i++) {
      const o = sub + 16 + i * 12
      groups.push([buf.readUInt32BE(o), buf.readUInt32BE(o + 4), buf.readUInt32BE(o + 8)])
    }
    return cp => {
      for (const [s, e, g] of groups) if (cp >= s && cp <= e) return g + (cp - s)
      return 0
    }
  }

  if (fmt === 6) {
    const first = buf.readUInt16BE(sub + 6)
    const count = buf.readUInt16BE(sub + 8)
    return cp => (cp >= first && cp < first + count ? buf.readUInt16BE(sub + 10 + (cp - first) * 2) : 0)
  }

  return null
}

/** 从 ttf/otf 拿一个「码位 → 是否有字形」的判定函数 */
export function glyphLookup(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32BE(0) === 0x774f4632) return null   // wOF2，本解析器不认
  const tables = readTables(buf)
  if (!tables.cmap) return null
  return parseCmap(buf, tables.cmap.off)
}

/** 从 cn-fontsource 的 font.css 拿判定函数（unicode-range 并集） */
export function cssLookup(cssPath) {
  const txt = readFileSync(cssPath, 'utf8')
  const ranges = []
  for (const m of txt.matchAll(/unicode-range:([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const mm = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/)
      if (mm) ranges.push([parseInt(mm[1], 16), parseInt(mm[2] ?? mm[1], 16)])
    }
  }
  if (!ranges.length) return null
  return cp => (ranges.some(([a, b]) => cp >= a && cp <= b) ? 1 : 0)
}

/**
 * 统一入口：给一个字体目录，返回 { kind, lookup, file }
 * kind = 'ttf' | 'css' | null
 */
export function lookupFor(dir) {
  const files = readdirSync(dir)
  const ttf = files.filter(f => /\.(ttf|otf)$/i.test(f))[0]
  if (ttf) {
    const l = glyphLookup(join(dir, ttf))
    if (l) return { kind: 'ttf', lookup: l, file: ttf }
  }
  const css = files.find(f => f.toLowerCase() === 'font.css')
  if (css) {
    const l = cssLookup(join(dir, css))
    if (l) return { kind: 'css', lookup: l, file: css }
  }
  return { kind: null, lookup: null, file: null }
}

/** 某款字体对样张的覆盖情况 */
export function coverageOf(dir) {
  const chars = sampleChars()
  const { kind, lookup, file } = lookupFor(dir)
  if (!lookup) return { kind, file, chars: chars.length, missing: null }
  return { kind, file, chars: chars.length, missing: chars.filter(c => !lookup(c.codePointAt(0))) }
}

/* ── CLI ──────────────────────────────────────────── */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('check-font-coverage.mjs')) {
  const dirs = readdirSync(CUTE, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()
  let bad = 0
  console.log(`样张去重字符数：${sampleChars().length}`)
  console.log(`  big   : ${SAMPLE.big}`)
  console.log(`  mid   : ${SAMPLE.mid}`)
  console.log(`  small : ${SAMPLE.small}\n`)

  for (const d of dirs) {
    const c = coverageOf(join(CUTE, d))
    if (!c.missing) { console.log(`?  ${d.padEnd(24)} 无法判定（${c.file ?? '没有可解析的字体文件'}）`); bad++; continue }
    const pct = ((c.chars - c.missing.length) / c.chars * 100).toFixed(1)
    if (c.missing.length) {
      bad++
      console.log(`✗  ${d.padEnd(24)} ${pct.padStart(5)}%  缺：${c.missing.join('')}   [${c.kind}: ${c.file}]`)
    } else {
      console.log(`✓  ${d.padEnd(24)} ${pct.padStart(5)}%  [${c.kind}: ${c.file}]`)
    }
  }
  console.log(bad ? `\n有 ${bad} 款需要留意。` : `\n全部 ${dirs.length} 款都覆盖样张字符。`)
}
