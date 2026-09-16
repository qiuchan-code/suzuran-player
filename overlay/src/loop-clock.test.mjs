/*
 * 曲末判断测试 · loop-clock.test.mjs
 * ------------------------------
 * 针对「单曲循环时歌词和进度条不再滚动」这个 bug 的边缘情况。
 *
 * 这里最要紧的两条：
 *   · 时长估短了不能提前把进度条拽回 0（比不归零更难受）
 *   · 时长完全不可信时（0）不能瞎判断
 *
 * 用法：node overlay/src/loop-clock.test.mjs
 */

import { effectiveEnd, isLoopOverrun, lastLyricTime, LOOP_GRACE_S, LOOP_GRACE_RATIO, LOOP_MIN_DURATION_S } from './loop-clock.mjs'

/** 和实现一致地算宽限，测试里别写死数字。 */
const grace = (end) => Math.max(LOOP_GRACE_S, end * LOOP_GRACE_RATIO)

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}   ${detail}`) }
}

/* ── effectiveEnd ── */

console.log('=== effectiveEnd（这首歌多长）===')

ok('都没有 → 0', effectiveEnd({}, null) === 0)
ok('只有 SMTC 时长', effectiveEnd({ duration: 240 }, null) === 240)
ok('只有歌词 interval', effectiveEnd({}, { duration: 200 }) === 200)
ok('只有歌词末行', effectiveEnd({}, { lines: [{ time: 10 }, { time: 233.5 }] }) === 233.5)
ok('SMTC 为 0 时用歌词的', effectiveEnd({ duration: 0 }, { duration: 200 }) === 200)
ok('取最大值（时长 200 / 末行 233）→ 233', effectiveEnd({ duration: 200 }, { duration: 200, lines: [{ time: 233 }] }) === 233)
ok('SMTC 比歌词长时用 SMTC', effectiveEnd({ duration: 300 }, { duration: 200, lines: [{ time: 233 }] }) === 300)
ok('脏值 NaN 当 0', effectiveEnd({ duration: NaN }, { duration: NaN }) === 0)
ok('脏值字符串当 0', effectiveEnd({ duration: 'abc' }, null) === 0)
ok('空歌词数组不炸', effectiveEnd({}, { lines: [] }) === 0)

console.log('\n=== lastLyricTime ===')
ok('null → 0', lastLyricTime(null) === 0)
ok('空数组 → 0', lastLyricTime({ lines: [] }) === 0)
ok('取最后一行', lastLyricTime({ lines: [{ time: 1 }, { time: 2 }, { time: 3 }] }) === 3)
ok('lines 不是数组 → 0', lastLyricTime({ lines: 'nope' }) === 0)

/* ── isLoopOverrun ── */

console.log('\n=== isLoopOverrun（这一轮放完了吗）===')

const D = 200   // 假设歌长 200 秒；宽限 = max(3, 200*4%) = 8 秒

ok('刚开始（10 秒）→ 没完', isLoopOverrun(10, D) === false)
ok('歌快完（199 秒）→ 没完', isLoopOverrun(199, D) === false)
ok('刚好到时长（200）→ 没完', isLoopOverrun(200, D) === false)
ok('宽限内（205）→ 没完', isLoopOverrun(205, D) === false)
ok('刚过宽限 → 完了', isLoopOverrun(D + grace(D) + 0.1, D) === true)
ok('早就过了（400）→ 完了', isLoopOverrun(400, D) === true)

console.log('\n--- 宽限随时长缩放 ---')
ok('短歌（30 秒）宽限 3 秒', Math.abs(grace(30) - 3) < 1e-9, String(grace(30)))
ok('3 分钟宽限 7.2 秒', Math.abs(grace(180) - 7.2) < 1e-9, String(grace(180)))
ok('8 分钟宽限 19.2 秒', Math.abs(grace(480) - 19.2) < 1e-9, String(grace(480)))
ok('8 分钟的歌在 8:10 时没触发', isLoopOverrun(490, 480) === false)
ok('8 分钟的歌在 8:25 时触发了', isLoopOverrun(505, 480) === true)

console.log('\n--- 时长不可信时不该判断 ---')
ok('end=0 → 不判断', isLoopOverrun(9999, 0) === false)
ok(`end 小于 ${LOOP_MIN_DURATION_S} 秒 → 不判断`, isLoopOverrun(9999, LOOP_MIN_DURATION_S - 1) === false)
ok(`end 刚好 ${LOOP_MIN_DURATION_S} 秒 → 参与判断`, isLoopOverrun(LOOP_MIN_DURATION_S + LOOP_GRACE_S + 1, LOOP_MIN_DURATION_S) === true)
ok('end 是 NaN → 不判断', isLoopOverrun(9999, NaN) === false)
ok('end 是负数 → 不判断', isLoopOverrun(9999, -5) === false)

console.log('\n--- 位置异常时不该判断 ---')
ok('位置为 0 → 不判断', isLoopOverrun(0, D) === false)
ok('位置为负 → 不判断', isLoopOverrun(-10, D) === false)
ok('位置 NaN → 不判断', isLoopOverrun(NaN, D) === false)

console.log('\n--- 模拟单曲循环一整轮 ---')
{
  /* 歌长 200 秒，时钟从 0 往上走，每 10 秒看一次 */
  let resetAt = null
  for (let pos = 0; pos <= 260; pos += 10) {
    if (isLoopOverrun(pos, D)) { resetAt = pos; break }
  }
  ok('一轮里第一次触发在 210 秒（>202.5 的第一个 10 的倍数）', resetAt === 210, `实际 ${resetAt}`)
  ok('不会在歌放到一半就触发', isLoopOverrun(150, D) === false)
}

console.log('\n--- 时长估短 vs 估长的后果对比 ---')
{
  /* 真实 200 秒，但被估成 150 秒 */
  const mis = 150
  const g = grace(mis)   // 6 秒
  ok(`估短到 150：${(150 + g - 1).toFixed(1)} 秒时还没触发`, isLoopOverrun(150 + g - 1, mis) === false)
  ok(`估短到 150：${(150 + g + 1).toFixed(1)} 秒才触发`, isLoopOverrun(150 + g + 1, mis) === true)
  ok('估长到 260：220 秒时不触发（宁晚不早）', isLoopOverrun(220, 260) === false)
}

console.log('\n--- 真实曲目量级的抽样 ---')
{
  for (const d of [156, 227, 269, 311, 385]) {
    const trig = d + grace(d)
    const mm = Math.floor(d / 60), ss = String(d % 60).padStart(2, '0')
    ok(`${mm}:${ss} 的歌 → ${trig.toFixed(1)} 秒归零（晚 ${grace(d).toFixed(1)} 秒）`,
      trig > d && trig < d + 25)
  }
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
