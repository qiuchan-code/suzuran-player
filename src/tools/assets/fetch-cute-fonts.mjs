/*
 * 可爱/俏皮中文字体 · 下载器
 * --------------------------
 * 抓取 8 款「免费可商用」的中文字体到 assets/fonts/cute/<slug>/
 * 每款同时落一份 meta.json（字体名 / 授权 / 来源 / 文件），供 build-cute-font-lab.mjs 读取。
 *
 * 用法：node --use-system-ca src/tools/fetch-cute-fonts.mjs
 *
 * 注意：Node 的 fetch 在这台机器上必须加 --use-system-ca，否则 UNABLE_TO_VERIFY_LEAF_SIGNATURE。
 */

import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(ROOT, 'assets', 'fonts', 'cute')
const TMP = join(ROOT, 'src', 'tools', '.cache')

const JSD = 'https://cdn.jsdelivr.net/gh'
const RAW = 'https://raw.githubusercontent.com'

/* ── 候选清单 ──────────────────────────────────────────────
 * source  = 人类可读的来源页
 * license = 授权类型
 * files   = 要下载的文件（url → 本地文件名）
 */
const FONTS = [
  {
    slug: 'zcool-kuaile',
    name: '站酷快乐体',
    latin: 'ZCOOL KuaiLe',
    family: 'ZCOOL KuaiLe',
    vibe: '糖果感 · 圆头圆脑的卡通美术字，笔画粗细均匀、横竖都带笑。最"甜"的一款。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/maoken-fonts/zcool-kuaile',
    author: '站酷 ZCOOL',
    files: [
      { url: `${JSD}/maoken-fonts/zcool-kuaile@main/fonts/ZCOOLKuaiLe-Regular.ttf`, as: 'ZCOOLKuaiLe-Regular.ttf' },
      { url: `${JSD}/maoken-fonts/zcool-kuaile@main/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'zcool-qingke-huangyou',
    name: '站酷庆科黄油体',
    latin: 'ZCOOL QingKe HuangYou',
    family: 'ZCOOL QingKe HuangYou',
    vibe: '黄油块一样的粗头美术字，重心偏低、字形挤在一起，非常"胖萌"。适合大标题。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou',
    author: '站酷 ZCOOL / 庆科',
    files: [
      { url: `${JSD}/google/fonts@main/ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf`, as: 'ZCOOLQingKeHuangYou-Regular.ttf' },
      { url: `${JSD}/google/fonts@main/ofl/zcoolqingkehuangyou/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'lxgw-marker-gothic',
    name: '霞鹜漫黑',
    latin: 'LXGW Marker Gothic',
    family: 'LXGW Marker Gothic',
    vibe: '马克笔手写感 —— 笔画起收有顿挫、结构略微歪斜，像随手写在便签上。辨识度很高。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/lxgw/LxgwMarkerGothic',
    author: 'LXGW 霞鹜（衍生自 Tanugo）',
    files: [
      { url: `${JSD}/lxgw/LxgwMarkerGothic@main/fonts/ttf/LXGWMarkerGothic-Regular.ttf`, as: 'LXGWMarkerGothic-Regular.ttf' },
      { url: `${RAW}/lxgw/LxgwMarkerGothic/main/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'kn-bobohei',
    name: '荆南波波黑',
    latin: 'KN Bobohei',
    family: 'KN Bobohei',
    vibe: '手写感黑体，字面偏满、笔画外扩，带一点点"胖"，比漫黑更规整、更好读。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/maoken-fonts/KNBobohei',
    author: '荆南字坊 · 猫啃网',
    files: [
      { url: `${JSD}/maoken-fonts/KNBobohei@main/fonts/TTF/KNBobohei-Bold.ttf`, as: 'KNBobohei-Bold.ttf' },
      { url: `${JSD}/maoken-fonts/KNBobohei@main/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'jason-qmeng',
    name: '清松手写体6「Q萌」',
    latin: 'JasonHandwriting6 Q-Meng',
    family: 'JasonHandwriting6',
    vibe: '台湾游清松的原子笔手写体第 6 弹，专门叫「Q萌」—— 字形矮胖、笔画一顿一顿，最萌的一版。',
    license: 'SIL Open Font License 1.1（作者明示：个人/企业、任何形式商用 100% 免费）',
    source: 'https://github.com/jasonhandwriting/JasonHandwriting',
    author: '游清松 Jason (Yu Ching Sung)',
    files: [
      { url: `${RAW}/jasonhandwriting/JasonHandwriting/master/JasonHandwriting6.ttf`, as: 'JasonHandwriting6.ttf' },
      { url: `${RAW}/jasonhandwriting/JasonHandwriting/master/README.md`, as: 'README.md' },
    ],
  },
  {
    slug: 'yozai',
    name: '悠哉字体',
    latin: 'Yozai',
    family: 'Yozai',
    vibe: '日系悠闲手写体（衍生自 YOzFont），字形松、撇捺舒展，慵懒可爱，适合整句歌词。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/lxgw/yozai-font',
    author: 'LXGW 霞鹜（衍生自 YOzFont）',
    npmFallback: 'cn-fontsource-yozai-regular',
    files: [
      { url: `${RAW}/lxgw/yozai-font/master/fonts/ttf/Yozai-Regular.ttf`, as: 'Yozai-Regular.ttf', optional: true },
      { url: 'https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf', as: 'Yozai-Regular.ttf' },
      { url: `${RAW}/lxgw/yozai-font/master/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'black-sugar-plum-candy',
    name: '黑糖话梅',
    latin: 'Black Sugar Plum Candy',
    family: 'Black Sugar Plum Candy',
    vibe: '手机美化圈的可爱字体（基于韩文 BM JUA + 思源黑补字），字形胖圆、笔画收细，软萌。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/lxgw/BlackSugarPlumCandy',
    author: 'LXGW 霞鹜（BM JUA / Adobe Source）',
    files: [
      { url: `${RAW}/lxgw/BlackSugarPlumCandy/main/TTF/BlackSugarPlumCandy-Bold.ttf`, as: 'BlackSugarPlumCandy-Bold.ttf' },
      { url: `${RAW}/lxgw/BlackSugarPlumCandy/main/OFL.txt`, as: 'OFL.txt' },
    ],
  },
  {
    slug: 'smiley-sans',
    name: '得意黑',
    latin: 'Smiley Sans',
    family: 'Smiley Sans',
    vibe: '倾斜的窄体标题美术字，笔画末端上翘、带"笑"，做歌名/大标题的气氛最强。',
    license: 'SIL Open Font License 1.1',
    source: 'https://github.com/atelier-anchor/smiley-sans',
    author: 'Atelier Anchor 得意黑',
    npmFallback: 'cn-fontsource-smiley-sans-oblique-regular',
    files: [
      { url: `${RAW}/atelier-anchor/smiley-sans/main/LICENSE`, as: 'OFL.txt', optional: true },
      { url: 'https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip', as: '.smiley-sans.zip', extract: true },
    ],
  },
]

async function get(url, tries = 3) {
  let last
  for (let i = 1; i <= tries; i++) {
    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 90_000)   // 卡死就重来，别让整个脚本挂住
      const res = await fetch(url, {
        redirect: 'follow',
        signal: ac.signal,
        headers: { 'User-Agent': 'suzuran-font-hunt' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      clearTimeout(timer)
      // 字体动辄几 MB，小于 4 KiB 基本可以断定是错误页；文本文件（OFL/README）不设这条
      const isText = /\.(txt|md|css)$/i.test(url.split('?')[0])
      if (!isText && buf.length < 4096) throw new Error(`响应只有 ${buf.length} 字节，像是错误页`)
      return buf
    } catch (e) {
      last = e
      if (i < tries) await new Promise(r => setTimeout(r, 1500 * i))
    }
  }
  throw last
}

const report = []
let failures = []

for (const f of FONTS) {
  const dir = join(OUT, f.slug)
  mkdirSync(dir, { recursive: true })
  const got = []
  for (const file of f.files) {
    const dest = join(dir, file.as)
    if (existsSync(dest) && statSync(dest).size > 1024 && !file.extract) {
      got.push({ file: file.as, bytes: statSync(dest).size, cached: true })
      continue
    }
    try {
      process.stdout.write(`  ${f.slug} ← ${file.as} ... `)
      const buf = await get(file.url)
      writeFileSync(dest, buf)
      console.log(`${(buf.length / 1048576).toFixed(2)} MiB`)
      got.push({ file: file.as, bytes: buf.length })
    } catch (e) {
      console.log(`FAIL ${e.message}`)
      if (!file.optional) failures.push(`${f.slug} / ${file.as}: ${e.message}`)
    }
  }
  report.push({ ...f, files: got, dir })
}

/* ── 兜底：从 npm 的 cn-fontsource-* 包取（已是切好的 woff2 + font.css） ── */
async function installFromNpm(pkg, destDir) {
  const reg = await get(`https://registry.npmjs.org/${pkg}`)
  const meta = JSON.parse(reg.toString('utf8'))
  const latest = meta['dist-tags'].latest
  const tarball = meta.versions[latest].dist.tarball
  console.log(`  ${pkg}@${latest} ← ${tarball}`)
  const tgz = await get(tarball)
  const tgzPath = join(TMP, `${pkg.replace(/[@/]/g, '_')}.tgz`)
  mkdirSync(TMP, { recursive: true })
  writeFileSync(tgzPath, tgz)
  const ex = join(TMP, pkg.replace(/[@/]/g, '_'))
  mkdirSync(ex, { recursive: true })
  // Windows 自带的 bsdtar 会把 "D:\xxx" 当成 host:path（"Cannot connect to D:"），
  // 所以把 cwd 切换过去、只传相对文件名。
  execFileSync('tar', ['-xzf', `${pkg.replace(/[@/]/g, '_')}.tgz`, '-C', pkg.replace(/[@/]/g, '_')],
    { stdio: 'inherit', cwd: TMP })
  // 包内一般在 package/ 下；也可能是 package/fonts/…
  const srcDir = existsSync(join(ex, 'package')) ? join(ex, 'package') : ex
  let n = 0
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(woff2?|css)$/i.test(e.name)) {
        writeFileSync(join(destDir, e.name), readFileSync(p))
        n++
      }
    }
  }
  walk(srcDir)
  rmSync(tgzPath, { force: true })
  rmSync(ex, { recursive: true, force: true })
  return n
}

/* 得意黑发的是 zip，解出来只要 ttf/woff2 */
for (const r of report) {
  const zip = join(r.dir, '.smiley-sans.zip')
  if (!existsSync(zip)) continue
  const ex = join(TMP, 'smiley-sans')
  mkdirSync(ex, { recursive: true })
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${ex}' -Force`], { stdio: 'inherit' })
    const found = []
    const walk = d => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ttf|woff2)$/i.test(e.name)) found.push(p)
      }
    }
    walk(ex)
    for (const p of found) {
      // 包里同时给 ttf 和 ttf.woff2 / otf.woff2，名字重复又占地方，只留 ttf + 一个规范命名的 woff2
      const base = p.split(/[\\/]/).pop().replace(/\.(ttf|otf)\.woff2$/i, '.woff2')
      if (base !== p.split(/[\\/]/).pop() && found.some(q => q.split(/[\\/]/).pop() === base)) continue
      const dest = join(r.dir, base)
      if (!existsSync(dest)) writeFileSync(dest, readFileSync(p))
    }
    console.log(`smiley-sans: 从 zip 解出 ${found.map(p => p.split(/[\\/]/).pop()).join(', ')}`)
    rmSync(zip, { force: true })
    rmSync(ex, { recursive: true, force: true })
  } catch (e) {
    failures.push(`smiley-sans unzip: ${e.message}`)
  }
}

/* 兜底：凡是一个字体文件都没落地的，试 npm 的 cn-fontsource 包 */
for (const r of report) {
  const has = readdirSync(r.dir).some(n => /\.(ttf|otf|woff2?)$/i.test(n))
  if (has || !r.npmFallback) continue
  console.log(`\n${r.slug}: 直链全挂了，改从 npm ${r.npmFallback} 取 …`)
  try {
    const n = await installFromNpm(r.npmFallback, r.dir)
    console.log(`  ${r.slug}: 从 npm 落了 ${n} 个文件`)
    if (!n) failures.push(`${r.slug}: npm 包里也没有字体文件`)
  } catch (e) {
    console.log(`  ${r.slug}: npm 兜底也失败 — ${e.message}`)
  }
}

/* 落 meta.json */
for (const r of report) {
  const entries = readdirSync(r.dir).filter(n => /\.(ttf|otf|woff2?)$/i.test(n))
  if (!entries.length) { failures.push(`${r.slug}: 一个字体文件都没下到`); continue }
  const files = entries.map(n => ({ name: n, bytes: statSync(join(r.dir, n)).size }))
  // 同一款字体若同时有 ttf 和 woff2，只把 ttf 算进「文件大小」（woff2 是压缩副本，避免重复计数）
  const full = files.filter(f => /\.(ttf|otf)$/i.test(f.name))
  const counted = full.length ? full : files
  const meta = {
    slug: r.slug, name: r.name, latin: r.latin, family: r.family, vibe: r.vibe,
    license: r.license, source: r.source, author: r.author,
    dir: `./assets/fonts/cute/${r.slug}`,
    files,
    bytes: counted.reduce((a, b) => a + b.bytes, 0),
  }
  writeFileSync(join(r.dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
}

console.log('\n=== 结果 ===')
for (const r of report) {
  const m = join(r.dir, 'meta.json')
  if (!existsSync(m)) { console.log(`✗ ${r.name} (${r.slug}) — 无产物`); continue }
  const meta = JSON.parse(readFileSync(m, 'utf8'))
  console.log(`✓ ${meta.name.padEnd(10, '　')} ${(meta.bytes / 1048576).toFixed(2)} MiB  ${meta.files.map(f => f.name).join(', ')}`)
}
if (failures.length) {
  console.log('\n=== 失败 ===')
  failures.forEach(x => console.log('  ✗ ' + x))
}
