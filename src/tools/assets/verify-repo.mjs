/*
 * 验证 GitHub 仓库状态 · verify-repo.mjs
 * 用法：node src/tools/assets/verify-repo.mjs [owner/repo]
 */

const REPO = process.argv[2] ?? 'qiuchan-code/suzuran-player'

/** 拿 gh 的 token（避免在脚本里硬编码）。 */
async function token() {
  const { execFileSync } = await import('node:child_process')
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
}

const tk = await token()
const api = async (path) => {
  const r = await fetch('https://api.github.com' + path, {
    headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', 'User-Agent': 'verify' },
  })
  if (!r.ok) throw new Error(path + ' → HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return r.json()
}

const repo = await api('/repos/' + REPO)
console.log('=== 仓库 ===')
console.log('  名称    ', repo.full_name)
console.log('  可见性  ', repo.visibility)
console.log('  默认分支', repo.default_branch)
console.log('  地址    ', repo.html_url)
console.log('  描述    ', repo.description)
console.log('  许可    ', repo.license?.spdx_id ?? '（未识别）')

const tree = await api(`/repos/${REPO}/git/trees/${repo.default_branch}?recursive=1`)
const blobs = tree.tree.filter(t => t.type === 'blob')
const total = blobs.reduce((a, b) => a + (b.size ?? 0), 0)
console.log('\n=== 内容 ===')
console.log(`  文件数  ${blobs.length}`)
console.log(`  总大小  ${(total / 1024 / 1024).toFixed(1)} MB`)

console.log('\n=== 顶层 ===')
const top = new Map()
for (const b of blobs) {
  const p = b.path.split('/')[0]
  const cur = top.get(p) ?? { n: 0, size: 0 }
  cur.n++; cur.size += b.size ?? 0
  top.set(p, cur)
}
for (const [name, v] of [...top].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${name.padEnd(22)} ${String(v.n).padStart(4)} 个  ${(v.size / 1024 / 1024).toFixed(1)} MB`)
}

console.log('\n=== 不该出现的（垃圾检查）===')
const bad = blobs.filter(b => /node_modules|_archive|\.cdp-|\.profile|\.bdic|\.pma$|Cache\/|\/\.git\//.test(b.path))
if (bad.length === 0) console.log('  ✓ 干净')
else for (const b of bad.slice(0, 20)) console.log('  ⚠ ' + b.path)

console.log('\n=== 该有的关键文件 ===')
for (const f of ['README.md', 'LICENSE', '.gitignore', '.gitattributes', 'start-player.bat',
  'player-ui.html', 'src/build-player-ui.mjs', 'docs/交接文档.md',
  'assets/wallpaper/suzuran_yukihare_34_day.mp4',
  'assets/fonts/theme/KNMaiyuan-Regular.ttf',
  'assets/fonts/cute/kn-bobohei/KNBobohei-Bold.ttf']) {
  const hit = blobs.find(b => b.path === f)
  console.log(`  ${hit ? '✓' : '✗'} ${f}${hit ? '  ' + Math.round((hit.size ?? 0) / 1024) + ' KB' : ''}`)
}

console.log('\n=== 换行符配置是否生效（.bat 应为 CRLF）===')
const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/${repo.default_branch}/start-player.bat`)
const text = await raw.text()
const crlf = (text.match(/\r\n/g) ?? []).length
const lf = (text.match(/(?<!\r)\n/g) ?? []).length
console.log(`  start-player.bat  CRLF=${crlf}  裸LF=${lf}  ${crlf > 0 && lf === 0 ? '✓' : '✗'}`)
