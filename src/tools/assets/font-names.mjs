/*
 * 读字体文件里的真实 family 名 · font names
 * 解析 sfnt 的 name 表（nameID 1 = family）。ttf/otf 都能读。
 * 用法：node src/tools/font-names.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:/suzuran-player/assets/fonts'

/** 解析 sfnt name 表，取 family（nameID=1）。 */
function readFamily(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = dv.getUint32(0)
  // 0x00010000 = TrueType, 'OTTO' = CFF, 'true'/'typ1' = 老 Mac
  const isSfnt = tag === 0x00010000 || tag === 0x4F54544F || tag === 0x74727565
  if (!isSfnt) return null

  const numTables = dv.getUint16(4)
  let nameOff = 0
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const t = dv.getUint32(rec)
    if (t === 0x6E616D65) { nameOff = dv.getUint32(rec + 8); break }   // 'name'
  }
  if (nameOff === 0) return null

  const count = dv.getUint16(nameOff + 2)
  const strOff = nameOff + dv.getUint16(nameOff + 4)
  const out = {}
  for (let i = 0; i < count; i++) {
    const r = nameOff + 6 + i * 12
    const platform = dv.getUint16(r)
    const nameId = dv.getUint16(r + 6)
    const len = dv.getUint16(r + 8)
    const off = dv.getUint16(r + 10)
    if (nameId !== 1 && nameId !== 4 && nameId !== 6) continue
    const bytes = buf.subarray(strOff + off, strOff + off + len)
    // platform 3 = Windows，字符串是 UTF-16BE；platform 1 = Mac，ASCII/Latin
    let s
    if (platform === 3) {
      s = ''
      for (let j = 0; j + 1 < bytes.length; j += 2) s += String.fromCharCode((bytes[j] << 8) | bytes[j + 1])
    } else {
      s = bytes.toString('latin1')
    }
    s = s.replace(/\0/g, '').trim()
    if (s !== '') out[nameId] = out[nameId] ?? s
  }
  return { family: out[1] ?? '', full: out[4] ?? '', ps: out[6] ?? '' }
}

/** 递归找字体文件。 */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ttf|otf)$/i.test(e.name)) out.push(p)
  }
  return out
}

console.log('=== assets/fonts 下所有 ttf/otf ===')
for (const f of walk(ROOT)) {
  const buf = readFileSync(f)
  const n = readFamily(buf)
  const mb = (statSync(f).size / 1024 / 1024).toFixed(1)
  const rel = f.replace(ROOT + '\\', '').replace(ROOT + '/', '')
  if (n) {
    console.log(`  ${rel}`)
    console.log(`      family="${n.family}"  full="${n.full}"  ps="${n.ps}"  (${mb} MB)`)
  } else {
    console.log(`  ${rel}  → 无法解析 (${mb} MB)`)
  }
}
