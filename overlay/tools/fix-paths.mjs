/*
 * 修路径引用 + 生成说明 · fix-paths.mjs
 * -----------------------------------
 * tidy.mjs 把脚本挪进了子目录，那些互相引用的路径要跟着改：
 *   · 代码里的 import
 *   · 注释里提到的调用命令
 *
 * 用法：node overlay/tools/fix-paths.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 文件的旧位置 → 新位置。 */
const MOVED = {
  'playlist.mjs': 'playlist/playlist.mjs',
  'playlist-stats.mjs': 'playlist/playlist-stats.mjs',
  'export-split.mjs': 'playlist/export-split.mjs',
  'make-slices.mjs': 'playlist/make-slices.mjs',
  'resolve-share.mjs': 'playlist/resolve-share.mjs',
  'probe-apis.mjs': 'api/probe-apis.mjs',
  'stress-switch.mjs': 'api/stress-switch.mjs',
  'qq-session.mjs': 'api/qq-session.mjs',
  'launch-debug-edge.ps1': 'api/launch-debug-edge.ps1',
  'qq-login-check.mjs': 'api/_archive/qq-login-check.mjs',
  'probe-qq-api.mjs': 'api/_archive/probe-qq-api.mjs',
  'hook-requests.mjs': 'api/_archive/hook-requests.mjs',
  'find-sign.mjs': 'api/_archive/find-sign.mjs',
  'extract-webpack4.mjs': 'api/_archive/extract-webpack4.mjs',
  'extract-crypto.mjs': 'api/_archive/extract-crypto.mjs',
  'read-jsonp.mjs': 'api/_archive/read-jsonp.mjs',
  'legacy-call.mjs': 'api/_archive/legacy-call.mjs',
  'qq-legacy-api.mjs': 'api/_archive/qq-legacy-api.mjs',
  'dig-import-page.mjs': 'api/_archive/dig-import-page.mjs',
  'dig-formsender.mjs': 'api/_archive/dig-formsender.mjs',
  'probe-fields.mjs': 'api/_archive/probe-fields.mjs',
  'probe-playlist-api.mjs': 'api/_archive/probe-playlist-api.mjs',
}

/** 递归收集所有 .mjs / .ps1。 */
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== '_dump') walk(p, out) }
    else if (/\.(mjs|ps1)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(HERE)
console.log(`扫描 ${files.length} 个文件…\n`)

let changed = 0
for (const f of files) {
  let t = readFileSync(f, 'utf8')
  const before = t

  for (const [oldName, newPath] of Object.entries(MOVED)) {
    // ① import 语句：`from './xxx.mjs'` → 按新相对位置
    const relImport = /from '\.\/([\w.-]+\.mjs)'/g
    t = t.replace(relImport, (m, dep) => {
      if (!MOVED[dep]) return m
      // 从当前文件所在目录出发算相对路径
      const fromDir = f.slice(HERE.length + 1).replace(/\\/g, '/').split('/').slice(0, -1)
      const depParts = MOVED[dep].split('/')
      const parts = [...fromDir]
      while (parts.length && depParts.length > 1 && parts[0] === depParts[0]) { parts.shift(); depParts.shift() }
      const p = [...parts.map(() => '..'), ...depParts].join('/')
      return "from '" + (p.startsWith('.') ? p : './' + p) + "'"
    })

    // ② 注释/文档里的命令：tools/xxx → tools/新路径
    t = t.replace(new RegExp('tools/' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      'tools/' + newPath)
    t = t.replace(new RegExp('overlay/tools/' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      'overlay/tools/' + newPath)
  }

  if (t !== before) {
    writeFileSync(f, t, 'utf8')
    changed++
    console.log(`  修了 ${f.slice(HERE.length + 1)}`)
  }
}

console.log(`\n改了 ${changed} 个文件`)

/* 生成子目录说明 */
const README = `# overlay/tools

歌词服务的配套工具。按用途分三组。

## playlist/ — 歌单工具（能实际用的）

| 脚本 | 作用 |
|---|---|
| \`playlist.mjs\` | 读公开歌单 / 随机抽歌 / 按 mid 查歌词 |
| \`playlist-stats.mjs\` | 语种分布统计（按曲名歌手的字符集推断） |
| \`export-split.mjs\` | 按语种拆分导出成「歌名 - 歌手」文本 |
| \`make-slices.mjs\` | 把清单切成可粘贴的小片（手机版导入框限 1000 字符） |
| \`resolve-share.mjs\` | 解析 QQ 音乐分享短链拿到 disstid |

\`\`\`powershell
# 例：读一个分享歌单并随机抽一首
node --use-system-ca overlay/tools/playlist/playlist.mjs shuffle "https://c6.y.qq.com/base/fcgi-bin/u?__=xxxx"
\`\`\`

> 都需要 \`--use-system-ca\`（这台机器的证书链问题）

## api/ — 接口排查（接口出问题时用）

| 脚本 | 作用 |
|---|---|
| \`probe-apis.mjs\` | ★ 诊断搜索接口可用性，**区分「限流」和「故障」** |
| \`stress-switch.mjs\` | ★ 快速切歌压测，看接口扛不扛得住 |
| \`qq-session.mjs\` | 从调试 Edge 里取登录态（cookie 不是 httpOnly，读得到） |
| \`launch-debug-edge.ps1\` | 起一个带调试端口的独立 Edge |

\`\`\`powershell
# 接口感觉不对时先跑这个
node --use-system-ca overlay/tools/api/probe-apis.mjs

# 压测
node --use-system-ca overlay/tools/api/stress-switch.mjs 10
\`\`\`

**重要**：两个搜索接口的限流表现不同 —— \`client_search_cp\` 返 HTTP 500，
\`musicu.fcg\` 返 \`code=2001\`。把 500 当成「接口挂了」会得出错误结论。

## api/_archive/ — 归档

定位接口、逆加密、抓包那轮的中间产物。**现在不需要跑**，
留着是为了以后再碰类似问题（比如接口又改版）时能参考思路。

## 根目录

| 脚本 | 作用 |
|---|---|
| \`session-watch.ps1\` | 常驻 SMTC 监视器（服务运行时靠它读播放状态） |
| \`now-playing.ps1\` | 读一次当前播放（被 session-watch 调用） |
| \`probe-ratelimit.mjs\` | 限流行为排查 |
| \`tidy.mjs\` | 整理本目录（一次性，已用完） |
| \`fix-paths.mjs\` | 修路径引用（一次性，已用完） |
`

writeFileSync(join(HERE, 'README.md'), README, 'utf8')
console.log(`\n已生成 ${join(HERE, 'README.md')}`)
