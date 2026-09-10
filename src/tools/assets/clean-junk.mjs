/*
 * 清理项目垃圾 · clean-junk.mjs
 * ---------------------------
 * 用户反馈：仓库里有一堆截图（还带着以前的 bug），预览图也打不开，全删掉。
 *
 * 清理原则：
 *   · 截图 / 验证图 —— 全删。这类图带环境状态、容易过期误导人，
 *     而且每个人自己截最准。需要时用工具脚本现截。
 *   · 一次性排查脚本 —— 只留真正可复用的三个（分界线排查三件套），
 *     其余本次排查用完即弃的删掉。
 *   · 文档里对已删文件的引用 —— 同步改掉，不留死链。
 *
 * 用法：node src/tools/assets/clean-junk.mjs [--dry]
 */

import { existsSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const ROOT = 'D:/suzuran-player'
const DRY = process.argv.includes('--dry')
const MB = (n) => (n / 1024 / 1024).toFixed(2) + ' MB'

let freed = 0, removed = 0

/** 整个目录删掉。 */
const DROP_DIRS = [
  'docs/shots',        // 截图全清
  'overlay/shots',     // 旧浮层演示图
]

/** 单独删的文件。 */
const DROP_FILES = [
  'labs/cute-font-lab.png',
  'labs/cute-font-lab-dark.png',
  // 一次性排查脚本（用完即弃）
  'src/tools/checks/body-vars.mjs',
  'src/tools/checks/debug-live.mjs',
  'src/tools/checks/debug-parts.mjs',
  'src/tools/checks/mask-assign.mjs',
  'src/tools/checks/mask-mode-test.mjs',
  'src/tools/checks/read-rvlog.mjs',
  'src/tools/checks/snap-audit.mjs',
  'src/tools/checks/snap-inline.mjs',
  'src/tools/checks/switch-minimal.mjs',
  'src/tools/checks/transition-errors.mjs',
  'src/tools/checks/transition-log.mjs',
  'src/tools/checks/two-layer.mjs',
  'src/tools/checks/what-at-x.mjs',
  'src/tools/shots/transition-frames.mjs',
  'src/tools/organize.mjs',
  'src/tools/assets/check-readme-api.mjs',
  'src/tools/assets/why-preview-broken.mjs',
  'src/tools/assets/scan-junk.mjs',
]

function sizeOf(p) {
  const st = statSync(p)
  if (!st.isDirectory()) return st.size
  let n = 0
  for (const e of readdirSync(p, { withFileTypes: true })) n += sizeOf(join(p, e.name))
  return n
}

console.log('── 删除目录 ──')
for (const d of DROP_DIRS) {
  const p = join(ROOT, d)
  if (!existsSync(p)) continue
  const s = sizeOf(p)
  freed += s; removed++
  console.log(`  ${d}   ${MB(s)}`)
  if (!DRY) rmSync(p, { recursive: true, force: true })
}

console.log('\n── 删除文件 ──')
for (const f of DROP_FILES) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  const s = sizeOf(p)
  freed += s; removed++
  console.log(`  ${f}   ${(s / 1024).toFixed(0)} KB`)
  if (!DRY) rmSync(p, { recursive: true, force: true })
}

/* ── 文档去死链 ── */

console.log('\n── 修文档引用 ──')

/** 把交接文档里"工具清单"那节里已删的条目去掉。 */
const handoverPath = join(ROOT, 'docs', '交接文档.md')
if (existsSync(handoverPath)) {
  let t = readFileSync(handoverPath, 'utf8')
  const before = t.length
  const dead = [
    '  dump-columns.mjs      逐列打印 RGB，定位跳变在哪一像素\n',
    '  check-divider.mjs     中值滤波 + 台阶检测，量化"有没有分界线"\n',
    '  bg-audit.mjs          列出元素及伪元素的背景/遮罩/混合样式\n',
    '  dom-dump.mjs          打印 DOM 结构（也能用来确认页面有没有加载成功）\n',
  ]
  for (const d of dead) {
    if (t.includes(d)) { t = t.replace(d, ''); console.log('  交接文档：移除条目 ' + d.trim()) }
  }
  if (t.length !== before && !DRY) writeFileSync(handoverPath, t, 'utf8')
}

/** README 去掉预览图（图已删，留着就是坏图）。 */
const readmePath = join(ROOT, 'README.md')
if (existsSync(readmePath)) {
  let t = readFileSync(readmePath, 'utf8')
  const before = t.length
  t = t.replace(/!\[预览\]\([^)]*\)\n\n/, '')
  t = t.replace(/!\[[^\]]*\]\(docs\/shots\/[^)]*\)\n?/g, '')
  if (t.length !== before) {
    console.log('  README：移除预览图引用（图已删除）')
    if (!DRY) writeFileSync(readmePath, t, 'utf8')
  }
}

/* ── .gitignore 补上截图目录，防止再被提交 ── */
const giPath = join(ROOT, '.gitignore')
if (existsSync(giPath)) {
  let t = readFileSync(giPath, 'utf8')
  if (!t.includes('# 截图')) {
    t = t.replace('# ── 备份 / 归档 ──', `# ── 截图（环境相关、容易过期，不入库；需要时用 tools 现截）──
docs/shots/
overlay/shots/

# ── 备份 / 归档 ──`)
    console.log('  .gitignore：加入截图目录')
    if (!DRY) writeFileSync(giPath, t, 'utf8')
  }
}

console.log(`\n删了 ${removed} 项，释放 ${MB(freed)}${DRY ? '（dry run）' : ''}`)
