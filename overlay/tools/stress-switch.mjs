/*
 * 快速切歌压测 · stress-switch.mjs
 * ------------------------------
 * 这是当初误判接口"挂了"的场景：连续快速切歌，短时间大量搜索请求。
 *
 * 对比：
 *   改之前主用 musicu      → 1 秒间隔下只有 5/10
 *   改之后主用 client_search → 期望显著更好
 *
 * 注意：服务里有 MIN_GAP_MS=3000 的请求闸门，所以这个脚本按
 * 3.2 秒间隔打，模拟"用户快速切歌时的真实受限频率"。
 *
 * 用法：node --use-system-ca overlay/tools/stress-switch.mjs [次数]
 */

const N = Number(process.argv[2] ?? 8)
const GAP = 3200      // 略大于服务里的 MIN_GAP_MS

const SONGS = [
  ['稻香', '周杰伦'],
  ['青花瓷', '周杰伦'],
  ['夜曲', '周杰伦'],
  ['晴天', '周杰伦'],
  ['七里香', '周杰伦'],
  ['告白气球', '周杰伦'],
  ['倔强', '五月天'],
  ['突然好想你', '五月天'],
  ['小幸运', '田馥甄'],
  ['起风了', '买辣椒也用券'],
  ['漠河舞厅', '柳爽'],
  ['我用什么把你留住', '隔壁老樊'],
]

console.log(`连续搜 ${N} 首，间隔 ${GAP}ms（模拟快速切歌）\n`)
console.log('  序号  歌名                    源                结果      耗时')
console.log('  ' + '─'.repeat(68))

let hit = 0, miss = 0, failed = 0
const sources = {}

for (let i = 0; i < N; i++) {
  const [t, a] = SONGS[i % SONGS.length]
  const t0 = Date.now()

  let out
  try {
    const r = await fetch('http://127.0.0.1:7788/api/search-test?title=' + encodeURIComponent(t) + '&artist=' + encodeURIComponent(a), {
      signal: AbortSignal.timeout(30000),
    })
    out = await r.json()
  } catch (e) {
    out = { error: e.message }
  }

  const ms = Date.now() - t0

  if (out.error) {
    failed++
    console.log(`  ${String(i + 1).padStart(3)}   ${t.padEnd(22)}  ${'—'.padEnd(16)}  请求失败   ${ms}ms  ${out.error.slice(0, 30)}`)
  } else if (out.matched) {
    hit++
    sources[out.source] = (sources[out.source] ?? 0) + 1
    console.log(`  ${String(i + 1).padStart(3)}   ${t.padEnd(22)}  ${String(out.source).padEnd(16)}  命中       ${ms}ms`)
  } else {
    miss++
    console.log(`  ${String(i + 1).padStart(3)}   ${t.padEnd(22)}  ${String(out.source ?? '—').padEnd(16)}  未命中     ${ms}ms`)
  }

  if (i < N - 1) await new Promise(r => setTimeout(r, GAP))
}

console.log('\n  ' + '─'.repeat(68))
console.log(`  命中 ${hit}  未命中 ${miss}  失败 ${failed}   共 ${N}`)
console.log(`  命中率 ${(hit / N * 100).toFixed(0)}%`)
console.log(`  用到的源：${Object.entries(sources).map(([k, v]) => k + '×' + v).join('  ') || '（无）'}`)

console.log('\n判读：')
console.log('  · 命中率应该接近 100%（冷门歌可能未命中，那是正常的）')
console.log('  · "源" 以 client_search 为主就说明改动生效')
console.log('  · 如果出现大量"失败"，看是不是被限流了')
