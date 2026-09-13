/*
 * 下载候选字体（按需分片） · fetch fonts (subset-aware)
 * ----------------------------------------------------
 * cn-fontsource 系列把中文字体拆成几百个 unicode-range 分片。整包下载又慢又占空间，
 * 这里只下载「样张文字实际用到的」分片——够做字体对比，也不浪费。
 *
 * 用法：node theme-lab/fetch-fonts.mjs
 * 产物：theme-lab/fonts/<包名>/font.css + 用到的分片
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'fonts')

/** 候选字体（圆体系）。 */
const CANDIDATES = [
  { pkg: 'cn-fontsource-975-maru-sc-regular', name: '975 圆体', note: '基于思源黑体 + 狮尾圆体，标准圆体' },
  { pkg: 'cn-fontsource-975-maru-sc-medium-regular', name: '975 圆体 Medium', note: '同上，笔画略粗' },
  { pkg: 'cn-fontsource-975-maru-sc-bold', name: '975 圆体 Bold', note: '同上，粗体' },
  { pkg: 'cn-fontsource-maoken-zhuyuan-ti-regular', name: '猫啃珠圆体', note: '标题圆体，圆润饱满（基准）' },
  { pkg: 'cn-fontsource-logo-sc-long-zhu-ti-zhs-regular', name: '龙珠体', note: '圆润标题体，字面饱满' },
  { pkg: 'cn-fontsource-mdmd-wu-feng-ti-regular', name: '无锋体', note: '浑圆无折角，没有笔锋' },
  { pkg: 'cn-fontsource-ding-talk-jin-bu-ti-regular', name: '钉Talk进步体', note: '圆润现代，字面偏小' },
]

/** 样张里会出现全部字符（决定要拉哪些分片）。 */
const SAMPLE_TEXT = [
  '我所到之处留下的回忆都是你',
  '昏暗的光影 脚步声也清晰',
  '你的心扑通扑通钻进我脑里',
  '晚风吹过 云朵朵',
  '下一句 · 当前歌词 整句 英文数字与标点',
  'I keep going back to when I laid eyes on you',
  '0:30 / 3:33　128kbps　2026',
  '！？，。、；：""\'\'（）——…·～',
  '975 圆体 猫啃珠圆 龙珠体 无锋体 钉Talk进步体 Medium Bold',
].join('')

const CODEPOINTS = [...new Set([...SAMPLE_TEXT].map(c => c.codePointAt(0)))]

/** U+xxxx / U+xxxx-yyyy / U+xx?? 是否覆盖某码点。 */
function covers(range, cp) {
  const m = /^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/.exec(range.trim())
  if (m === null) return false
  const startRaw = m[1]
  if (startRaw.includes('?')) {
    const lo = parseInt(startRaw.replace(/\?/g, '0'), 16)
    const hi = parseInt(startRaw.replace(/\?/g, 'F'), 16)
    return cp >= lo && cp <= hi
  }
  const lo = parseInt(startRaw, 16)
  const hi = m[2] === undefined ? lo : parseInt(m[2], 16)
  return cp >= lo && cp <= hi
}

/** 解析 font.css → [{ url, ranges }]。 */
function parseFaces(css) {
  const faces = []
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1]
    const urlM = /url\((['"]?)([^)'"]+)\1\)/.exec(body)
    const rangeM = /unicode-range\s*:\s*([^;]+);/.exec(body)
    if (urlM === null) continue
    faces.push({
      url: urlM[2].trim(),
      ranges: rangeM === null ? [] : rangeM[1].split(',').map(s => s.trim()).filter(Boolean),
    })
  }
  return faces
}

async function getText(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return await res.text()
}
async function getBytes(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

mkdirSync(OUT, { recursive: true })

for (const c of CANDIDATES) {
  const dir = join(OUT, c.pkg)
  const cssPath = join(dir, 'font.css')
  if (existsSync(cssPath)) { console.log(`  · ${c.name}（已存在，跳过）`); continue }
  mkdirSync(dir, { recursive: true })

  try {
    const base = `https://unpkg.com/${c.pkg}/`
    const css = await getText(`${base}font.css`)
    const faces = parseFaces(css)
    const need = faces.filter(f =>
      f.ranges.length === 0 || CODEPOINTS.some(cp => f.ranges.some(r => covers(r, cp))))

    let bytes = 0
    let ok = 0
    for (const f of need) {
      const rel = f.url.replace(/^\.\//, '')
      try {
        const buf = await getBytes(`${base}${rel}`)
        const target = join(dir, rel)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, buf)
        bytes += buf.length
        ok++
      } catch { /* 单个分片失败不影响整体 */ }
    }
    writeFileSync(cssPath, css, 'utf8')
    console.log(`  ✓ ${c.name.padEnd(16)} ${ok}/${faces.length} 分片  ${(bytes / 1024).toFixed(0)} KB`)
  } catch (err) {
    console.log(`  ✗ ${c.name.padEnd(16)} FAIL: ${err.message}`)
  }
}

console.log('done')
