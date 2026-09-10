/*
 * 计时器核心测试 · stopwatch test
 * ------------------------------
 * 用假时钟驱动，不需要真实等待。
 *
 * 用法：node theme-lab/tools/test-timer.mjs
 */

import { createTimer, formatDuration, formatDate, formatClockMark } from '../src/timer.mjs'

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`) }
}

/** 假时钟：手动推进时间并触发到期回调。 */
function fakeClock(startMs = new Date('2026-09-10T14:30:00').getTime()) {
  let t = startMs
  let timers = []
  return {
    now: () => t,
    setTimer: (fn) => { timers.push(fn); return fn },
    clearTimer: (fn) => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1) },
    advance(ms) {
      t += ms
      const due = timers.splice(0, timers.length)
      for (const fn of due) fn()
    },
  }
}

console.log('=== formatDuration ===')
ok('0 → 0:00:00', formatDuration(0) === '0:00:00', formatDuration(0))
ok('65 → 0:01:05', formatDuration(65) === '0:01:05', formatDuration(65))
ok('3600 → 1:00:00', formatDuration(3600) === '1:00:00', formatDuration(3600))
ok('2825 → 0:47:05', formatDuration(2825) === '0:47:05', formatDuration(2825))
ok('负数归零', formatDuration(-5) === '0:00:00', formatDuration(-5))

console.log('')
console.log('=== formatDate / formatClockMark ===')
{
  const t = new Date('2026-09-10T14:30:00').getTime()
  ok('日期 2026/9/10', formatDate(t) === '2026/9/10', formatDate(t))
  ok('时刻 +14:30', formatClockMark(t) === '+14:30', formatClockMark(t))
  const t2 = new Date('2026-01-05T09:05:00').getTime()
  ok('日期补零不补', formatDate(t2) === '2026/1/5', formatDate(t2))
  ok('时刻补零', formatClockMark(t2) === '+09:05', formatClockMark(t2))
}

console.log('')
console.log('=== 初始状态 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  const s = t.snapshot()
  ok('默认 study', s.mode === 'study', s.mode)
  ok('默认 idle', s.status === 'idle')
  ok('初始 0 秒', s.seconds === 0, String(s.seconds))
  ok('未开始过时 sessionStart 为 null', s.sessionStart === null)
  ok('轮数 0', s.rounds === 0)
}

console.log('')
console.log('=== 正计时推进 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  t.toggle()
  ok('开始后 running', t.status === 'running')
  ok('sessionStart 已记录', t.snapshot().sessionStart !== null)

  c.advance(47 * 60 * 1000 + 5000)   // 47 分 5 秒
  ok('47:05 后 seconds = 2825', t.snapshot().seconds === 2825, String(t.snapshot().seconds))
  ok('显示为 0:47:05', formatDuration(t.snapshot().seconds) === '0:47:05', formatDuration(t.snapshot().seconds))
  ok('sinceStart 同步', t.snapshot().sinceStart === 2825, String(t.snapshot().sinceStart))
}

console.log('')
console.log('=== 暂停不丢时间 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  t.toggle()
  c.advance(10_000)
  t.toggle()                      // 暂停
  ok('暂停状态', t.status === 'paused')
  ok('暂停时 10 秒', t.snapshot().seconds === 10, String(t.snapshot().seconds))

  c.advance(60_000)               // 暂停期间时间流逝
  ok('暂停期间不走', t.snapshot().seconds === 10, String(t.snapshot().seconds))

  t.toggle()                      // 继续
  c.advance(5_000)
  ok('继续后累计 15 秒', t.snapshot().seconds === 15, String(t.snapshot().seconds))
  ok('继续不改 sessionStart', t.snapshot().sinceStart !== null)
}

console.log('')
console.log('=== 归零 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  t.toggle()
  c.advance(30_000)
  t.reset()
  ok('归零后 idle', t.status === 'idle')
  ok('归零后 0 秒', t.snapshot().seconds === 0, String(t.snapshot().seconds))
}

console.log('')
console.log('=== 四种状态切换会重置 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  t.toggle()
  c.advance(30_000)

  t.setMode('fun')
  let s = t.snapshot()
  ok('切到 娱乐', s.mode === 'fun', s.mode)
  ok('娱乐：切后 idle', s.status === 'idle')
  ok('娱乐：切后归零', s.seconds === 0)
  ok('娱乐：sessionStart 清空', s.sessionStart === null)

  t.setMode('out')
  ok('切到 外出', t.snapshot().mode === 'out', t.snapshot().mode)

  t.setMode('sleep')
  ok('切到 睡觉', t.snapshot().mode === 'sleep', t.snapshot().mode)

  t.setMode('study')
  ok('切回 学习', t.snapshot().mode === 'study', t.snapshot().mode)

  // 非法值应被忽略，保持原状态
  t.setMode('work')
  ok('非法状态被忽略（旧值 work）', t.snapshot().mode === 'study', t.snapshot().mode)
  t.setMode('rest')
  ok('非法状态被忽略（旧值 rest）', t.snapshot().mode === 'study', t.snapshot().mode)

  // 非法状态下仍能正常计时
  t.toggle()
  c.advance(5_000)
  ok('切状态后仍能计时', t.snapshot().seconds === 5, String(t.snapshot().seconds))
}

console.log('')
console.log('=== 默认状态 ===')
{
  const c = fakeClock()
  const t = createTimer({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  ok('不传 mode 默认 study', t.snapshot().mode === 'study', t.snapshot().mode)
  const c2 = fakeClock()
  const t2 = createTimer({ mode: 'nonsense', now: c2.now, setTimer: c2.setTimer, clearTimer: c2.clearTimer })
  ok('非法 mode 回落到 study', t2.snapshot().mode === 'study', t2.snapshot().mode)
}

console.log('')
console.log('=== 轮数 ===')
{
  const c = fakeClock()
  const t = createTimer({ mode: 'study', now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer })
  t.addRound()
  t.addRound()
  ok('加两轮', t.snapshot().rounds === 2, String(t.snapshot().rounds))
  t.clearRounds()
  ok('清零', t.snapshot().rounds === 0)
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
