/*
 * 上传前预处理 · prep-github.mjs
 * ----------------------------
 * 目的：把项目收拾成适合公开的仓库形态。
 *
 * 做四件事：
 *   1. 清掉不该提交的垃圾（尤其 overlay/shots 里混进的 Chrome 用户数据目录）
 *   2. 通过 ffmpeg 把所有大截图从 PNG 压成 JPEG（29MB → 约 6MB）
 *   3. 只保留界面实际用到的 4 款字体，其余候选字体移出仓库范围
 *   4. 写 .gitignore
 *
 * 用法：node src/tools/assets/prep-github.mjs [--dry]
 */

import { existsSync, readdirSync, statSync, rmSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = 'D:/suzuran-player'
const DRY = process.argv.includes('--dry')
const FFMPEG = 'D:\\ffmpeg\\bin\\ffmpeg.exe'

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'
let removedBytes = 0

/* ── 1. 清垃圾 ── */

/** 这些目录整棵删掉。 */
const JUNK_DIRS = [
  'overlay/shots/.cdp-settings',      // CDP 调试残留
  'overlay/shots/.profile',           // Chrome profile 残留
  'overlay/shots/Cache',
  'overlay/shots/Code Cache',
  'overlay/shots/GPUCache',
  'overlay/shots/Local Storage',
  'overlay/shots/Session Storage',
  'overlay/shots/Service Worker',
  'overlay/shots/IndexedDB',
]

/** 这些扩展名的文件在任何地方都删掉（Chrome 配置文件）。 */
const JUNK_EXT = new Set(['.bdic', '.pma', '.db', '.db-journal', '.db-wal', '.journal',
  '.dat', '.bf', '.baj', '.baf', '.log', '.old', '.binarypb'])

function walk(dir, out = []) {
  let ents
  try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

console.log('── 1. 清理垃圾 ──')
for (const d of JUNK_DIRS) {
  const p = join(ROOT, d)
  if (!existsSync(p)) continue
  const size = walk(p).reduce((a, f) => a + statSync(f).size, 0)
  console.log(`  删除目录 ${d}  (${mb(size)})`)
  removedBytes += size
  if (!DRY) rmSync(p, { recursive: true, force: true })
}

// 按扩展名删散落的 Chrome 文件（只在 overlay/shots 下，别误伤别处）
const shotsDir = join(ROOT, 'overlay', 'shots')
if (existsSync(shotsDir)) {
  for (const f of walk(shotsDir)) {
    const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
    if (!JUNK_EXT.has(ext)) continue
    const size = statSync(f).size
    removedBytes += size
    if (!DRY) rmSync(f, { force: true })
  }
  console.log(`  按扩展名清掉 Chrome 配置文件（.bdic/.pma/.db/.log 等）`)
}

/* ── 2. PNG 压成 JPEG ── */

/**
 * 把大 PNG 压成 JPEG。
 * 超过阈值的才压 —— 小图（如 bisect 那组 70KB）保持 PNG 更清楚。
 */
const PNG_THRESHOLD = 200 * 1024
const targets = [
  join(ROOT, 'docs', 'shots'),
  join(ROOT, 'overlay', 'shots'),
  join(ROOT, 'labs'),
]

console.log('\n── 2. 截图 PNG → JPEG ──')
let saved = 0
for (const dir of targets) {
  if (!existsSync(dir)) continue
  for (const f of walk(dir)) {
    if (!f.toLowerCase().endsWith('.png')) continue
    const size = statSync(f).size
    if (size < PNG_THRESHOLD) continue
    const out = f.slice(0, -4) + '.jpg'
    const r = spawnSync(FFMPEG, [
      '-y', '-v', 'error', '-i', f,
      '-q:v', '4',                    // 质量 4 ≈ 视觉无损
      '-vf', 'scale=iw*0.75:ih*0.75', // 缩到 75%（这些图是 2x 截的，仍然清晰）
      out,
    ], { stdio: 'inherit' })
    if (r.status !== 0) { console.log(`  ✗ 失败 ${f}`); continue }
    const newsize = statSync(out).size
    saved += size - newsize
    console.log(`  ${f.replace(ROOT + '/', '').replace(/\\/g, '/')}  ${Math.round(size / 1024)}KB → ${Math.round(newsize / 1024)}KB`)
    if (!DRY) rmSync(f, { force: true })
  }
}
removedBytes += saved

/* ── 3. 字体瘦身 ── */

console.log('\n── 3. 字体 ──')
/*
 * 结构是 assets/fonts/{theme,cute/<slug>,pickers/<slug>} 。
 * 界面实际只用 4 款：theme 整个保留；cute 下留 3 个子目录。
 * 其余候选字体移到 _archive/（.gitignore 排除），需要时可以再拿回来。
 */
const KEEP_THEME = true
const KEEP_CUTE = new Set([
  'black-sugar-plum-candy',   // 黑糖话梅（歌名/歌手）
  'kn-bobohei',               // 荆南波波黑（状态/时间）
  'zcool-kuaile',             // 站酷快乐体（歌词）
])
const fontsDir = join(ROOT, 'assets', 'fonts')
const archive = join(ROOT, '_archive')

/** 把一个目录挪到 _archive/<rel>。 */
function archiveDir(abs, rel) {
  const size = walk(abs).reduce((a, f) => a + statSync(f).size, 0)
  console.log(`  移出 ${rel}  (${mb(size)})`)
  removedBytes += size
  if (DRY) return
  const dest = join(archive, rel)
  mkdirSync(join(dest, '..'), { recursive: true })
  renameSync(abs, dest)
}

// assets/fonts/pickers/ 整个移走（早期一批圆体候选，界面没用）
const pickers = join(fontsDir, 'pickers')
if (existsSync(pickers)) archiveDir(pickers, 'fonts/pickers')

/*
 * overlay/fonts/ 也移走（34.5MB）。
 * 那是早期"歌词浮层"那份独立页面用的字体（霞鹜文楷等），
 * 现在的播放器界面不用它 —— assets/fonts 里那份才是界面在用的。
 */
const overlayFonts = join(ROOT, 'overlay', 'fonts')
if (existsSync(overlayFonts)) archiveDir(overlayFonts, 'overlay-fonts')

// overlay/shots/ 里混进来的非截图文件（CDP 调试残留）也清一遍
const ovShots = join(ROOT, 'overlay', 'shots')
if (existsSync(ovShots)) {
  for (const f of walk(ovShots)) {
    const base = f.slice(f.lastIndexOf('\\') + 1)
    // 只保留 png/jpg，其余（json/html/js/css/binarypb 等）都是调试残留
    if (/\.(png|jpe?g|gif|webp)$/i.test(base)) continue
    removedBytes += statSync(f).size
    if (!DRY) rmSync(f, { force: true })
  }
  console.log('  清掉 overlay/shots 下的非截图文件')
}

// assets/fonts/cute/ 里只留 3 款，其余移走
const cute = join(fontsDir, 'cute')
if (existsSync(cute)) {
  for (const slug of readdirSync(cute)) {
    const p = join(cute, slug)
    if (!statSync(p).isDirectory()) continue
    if (KEEP_CUTE.has(slug)) { console.log(`  保留 cute/${slug}`); continue }
    archiveDir(p, `fonts/cute/${slug}`)
  }
}
// cute 根下的散文件（下载脚本产物）也移走
if (existsSync(cute)) {
  for (const f of readdirSync(cute)) {
    const p = join(cute, f)
    if (statSync(p).isDirectory()) continue
    removedBytes += statSync(p).size
    if (!DRY) { mkdirSync(join(archive, 'fonts/cute'), { recursive: true }); renameSync(p, join(archive, 'fonts/cute', f)) }
  }
}
if (KEEP_THEME) console.log('  保留 theme/（荆南麦圆体）')

/* ── 4. .gitignore ── */

console.log('\n── 4. .gitignore ──')
const gitignore = `# ── 依赖 ──
node_modules/

# ── 构建产物 ──
# player-ui.html 由 src/build-player-ui.mjs 生成，不入库
player-ui.html
labs/*.html
*.tmp

# ── 跑测试/调试时的临时产物 ──
.cdp-*/
*-check.png
*-strip.png
debug-*.png
shrink-test.png

# ── 备份 ──
_archive/
*.bak
*.orig

# ── 系统 ──
Thumbs.db
desktop.ini
.DS_Store
`
if (!DRY) writeFileSync(join(ROOT, '.gitignore'), gitignore, 'utf8')
console.log(gitignore.split('\n').map(l => '  ' + l).join('\n'))

/* ── 汇总 ── */
console.log(`\n共释放约 ${mb(removedBytes)}${DRY ? '（dry run，未实际改动）' : ''}`)
