/*
 * 拆到进程级看谁在烧 CPU · cpu-breakdown.mjs
 * ---------------------------------------
 * 上一个工具只测了"electron 全部进程的 CPU 总和"，看不出是谁。
 * 3.2 核这个数字偏高，得知道花在哪。
 *
 * 用法：node desktop/tools/cpu-breakdown.mjs [采样秒数]
 */

import { execFileSync } from 'node:child_process'

const SECS = Number(process.argv[2] ?? 8)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** 取每个 electron 进程的 pid / 类型 / 累计 CPU 秒。 */
function snapshot() {
  const ps = `
$out = @()
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { return }
  $cl = $_.CommandLine
  $type = 'Browser'
  if ($cl -match '--type=([\\w-]+)') { $type = $matches[1] }
  $out += [PSCustomObject]@{
    pid  = $_.ProcessId
    type = $type
    cpu  = [math]::Round($p.CPU, 3)
    mb   = [math]::Round($p.WorkingSet64 / 1MB)
    gpu  = if ($cl -match '--gpu-preferences') { $true } else { $false }
  }
}
$out | ConvertTo-Json -Compress
`
  try {
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 }).trim()
    if (!raw) return []
    const j = JSON.parse(raw)
    return Array.isArray(j) ? j : [j]
  } catch (e) {
    console.log('  取进程失败: ' + String(e.message).slice(0, 80))
    return []
  }
}

console.log(`采样 ${SECS} 秒…\n`)

const A = snapshot()
if (!A.length) { console.log('没有 electron 进程'); process.exit(1) }
console.log(`读取到 ${A.length} 个 electron 进程\n`)

const t0 = Date.now()
await sleep(SECS * 1000)
const B = snapshot()
const secs = (Date.now() - t0) / 1000

/** 按 pid 配对。 */
const byPid = new Map(B.map(p => [p.pid, p]))
const rows = []
for (const a of A) {
  const b = byPid.get(a.pid)
  if (!b) continue
  const d = b.cpu - a.cpu
  rows.push({ pid: a.pid, type: a.type, delta: d, cores: d / secs, mb: b.mb })
}
rows.sort((x, y) => y.cores - x.cores)

console.log('  pid      类型            平均核数   占总量   内存')
console.log('  ' + '─'.repeat(58))
const total = rows.reduce((s, r) => s + r.cores, 0)
for (const r of rows) {
  const pct = total > 0 ? (r.cores / total * 100) : 0
  const bar = '█'.repeat(Math.max(0, Math.round(pct / 3)))
  console.log(`  ${String(r.pid).padEnd(8)} ${r.type.padEnd(14)} ${r.cores.toFixed(3).padStart(7)}  ${pct.toFixed(1).padStart(5)}%  ${String(r.mb).padStart(4)}MB  ${bar}`)
}
console.log('  ' + '─'.repeat(58))
console.log(`  ${'合计'.padEnd(23)} ${total.toFixed(3).padStart(7)} 核`)

console.log('\n  按类型汇总：')
const byType = {}
for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + r.cores
for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(16)} ${c.toFixed(3).padStart(7)} 核`)
}

console.log('\n  判读：')
console.log('    · renderer 就是界面本身 —— 它的核数直接反映界面负载')
console.log('    · gpu-process 是合成/光栅化')
console.log('    · 如果 Browser 主进程也很高，说明是主进程在做轮询或 IPC')
