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

/*
 * 换行符检查 —— 这里有个容易搞错的点。
 *
 * `.gitattributes` 里的 `eol=crlf` 作用是「**检出时**转成 CRLF」，
 * 而 git 内部存储的依然是 LF。所以：
 *   · 去 raw.githubusercontent.com 取文件，看到的是**存储版**（LF）—— 查了没用
 *   · 正确做法：看 `git ls-files --eol`，它会显示 index(i) 和 working-tree(w) 两侧的实际换行
 *
 * 期望输出形如：  i/lf  w/crlf  attr/text eol=crlf
 */
console.log('\n=== 换行符配置（.bat/.ps1 应为 w/crlf）===')
const { execFileSync } = await import('node:child_process')
let localDir = null
try { localDir = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() } catch { /* 不在 git 仓库里 */ }

if (!localDir) {
  console.log('  （不在本地 git 仓库中运行，跳过）')
} else {
  const files = ['start-player.bat', 'src/launcher.ps1', 'src/make-shortcut.ps1', 'overlay/tools/session-watch.ps1']
  for (const f of files) {
    let out = ''
    try {
      out = execFileSync('git', ['-C', localDir, 'ls-files', '--eol', f], { encoding: 'utf8' }).trim()
    } catch { /* 忽略 */ }
    if (!out) { console.log(`  ? ${f}  （不在版本控制中）`); continue }
    // 形如：i/lf    w/crlf  attr/text eol=crlf    	start-player.bat
    const iIdx = /i\/(\w+)/.exec(out)?.[1] ?? '?'
    const wIdx = /w\/(\w+)/.exec(out)?.[1] ?? '?'
    const attr = /attr\/([^\s]*)/.exec(out)?.[1] ?? ''
    const wantCrlf = /\.(bat|cmd|ps1|psm1)$/i.test(f)
    const good = wantCrlf ? wIdx === 'crlf' : true
    console.log(`  ${good ? '✓' : '✗'} ${f.padEnd(34)} index=${iIdx} 工作区=${wIdx}  ${attr}`)
  }
  console.log('  说明：index=lf 是正常的（git 内部统一存 LF），关键是**工作区为 crlf**，')
  console.log('        这样别人克隆到 Windows 上双击 .bat 才能正常跑。')
}
