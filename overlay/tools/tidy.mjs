/*
 * 整理 overlay/tools · tidy.mjs
 * ---------------------------
 * 「把歌单拆分」这轮调研往 overlay/tools 里塞了 41 个脚本，
 * 其中大部分是一次性探针（抓包、试接口、找加密函数），用完就没价值了。
 *
 * 按用途分三类：
 *   保留 → playlist/  能用的成品工具
 *   保留 → api/       排查接口用的（以后接口再出问题还用得上）
 *   删除              一次性探针
 *
 * 用法：node overlay/tools/tidy.mjs [--dry]
 */

import { mkdirSync, renameSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

/** 成品工具：能实际用起来的。 */
const KEEP_PLAYLIST = [
  'playlist.mjs',        // 读歌单 / 随机抽歌 / 查歌词
  'playlist-stats.mjs',  // 语种统计
  'export-split.mjs',    // 按语种拆分导出
  'make-slices.mjs',     // 切成可粘贴的小片
  'resolve-share.mjs',   // 解析分享短链
]

/** 排查接口用的：以后接口再出问题还用得上。 */
const KEEP_API = [
  'probe-apis.mjs',      // ★ 接口可用性诊断（区分限流和故障）
  'stress-switch.mjs',   // ★ 快速切歌压测
  'qq-session.mjs',      // 从调试 Edge 取登录态
  'launch-debug-edge.ps1', // 起一个带调试端口的 Edge
]

/** 留着但归档：这轮调研的中间产物，以后再碰这类问题能参考思路。 */
const ARCHIVE = [
  'qq-login-check.mjs',
  'probe-qq-api.mjs',
  'hook-requests.mjs',
  'find-sign.mjs',
  'extract-webpack4.mjs',
  'extract-crypto.mjs',
  'read-jsonp.mjs',
  'legacy-call.mjs',
  'qq-legacy-api.mjs',
  'dig-import-page.mjs',
  'dig-formsender.mjs',
  'probe-fields.mjs',
  'probe-playlist-api.mjs',
]

/** 直接删：一次性探针，没有复用价值。 */
const DELETE = [
  'capture-add.mjs',
  'capture-create.mjs',
  'dump-import.mjs',
  'inspect-import.mjs',
  'inspect-page.mjs',
  'open-import-mobile.mjs',
  'test-import.mjs',
  'test-match-api.mjs',
  'ui-add-one.mjs',
  'ui-search.mjs',
  'probe-smtc.ps1',
  'probe-uia.ps1',
  'sample-ambiguous.mjs',
  'wallpaper-test.mjs',
]

const say = (m) => console.log(m)

/** 把文件挪到子目录。 */
function moveTo(file, sub) {
  const from = join(HERE, file)
  if (!existsSync(from)) return false
  const to = join(HERE, sub, file)
  if (!DRY) {
    mkdirSync(join(HERE, sub), { recursive: true })
    renameSync(from, to)
  }
  return true
}

say(`整理 ${HERE}\n`)

let n1 = 0, n2 = 0, n3 = 0

for (const f of KEEP_PLAYLIST) if (moveTo(f, 'playlist')) { n1++; say(`  → playlist/  ${f}`) }
for (const f of KEEP_API) if (moveTo(f, 'api')) { n2++; say(`  → api/       ${f}`) }
for (const f of ARCHIVE) if (moveTo(f, 'api/_archive')) { n3++; say(`  → _archive/  ${f}`) }

let n4 = 0
for (const f of DELETE) {
  const p = join(HERE, f)
  if (!existsSync(p)) continue
  if (!DRY) rmSync(p, { force: true })
  n4++
  say(`  ✗ 删除       ${f}`)
}

say(`\n归类 ${n1} 个成品 + ${n2} 个排查工具 + ${n3} 个归档，删除 ${n4} 个一次性脚本`)

/* 剩下还在根目录的（非 .mjs/.ps1，或者漏掉的） */
const rest = readdirSync(HERE, { withFileTypes: true })
  .filter(e => e.isFile() && /\.(mjs|ps1)$/.test(e.name))
  .map(e => e.name)
if (rest.length) {
  say(`\n⚠ 根目录还剩 ${rest.length} 个没归类：`)
  for (const f of rest) say(`    ${f}`)
  say('  （上面这几行就是待办，自己看着办）')
} else {
  say('\n✓ 根目录已清空，脚本都归类了')
}
