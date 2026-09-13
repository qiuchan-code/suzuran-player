/*
 * 计时器核心 · stopwatch
 * ----------------------
 * 纯逻辑，不碰 DOM：状态机 + 时间推进 + 快照。
 * 正计时（从 0 往上走），两种状态：专注 / 休息。
 *
 * 设计：
 *   · 用"开始时刻"算已过时间，不用"每秒加一"——后台标签页被节流也不会走慢
 *   · 状态：idle → running ⇄ paused
 *   · 每次从 idle 开始都会记录一个"本次开始时刻"，用于显示 +17:05 这样的标记
 *   · 切状态（专注↔休息）会重置计时，因为换了一件事
 *
 * 用法（浏览器）：
 *   const t = createTimer({ onChange: render })
 *   t.toggle()          // 开始/暂停
 *   t.setMode('rest')   // 切状态（会重置）
 *   t.tick()            // 每帧或每秒调一次
 */

/**
 * 合法的状态。四种"形态"，切换时归零重新计时。
 *   study 学习 / fun 娱乐 / out 外出 / sleep 睡觉
 */
export const VALID_MODES = new Set(['study', 'fun', 'out', 'sleep'])

/**
 * 造一个计时器。
 * @param {{
 *   mode?: 'study' | 'fun' | 'out' | 'sleep',
 *   onChange?: (snapshot: object) => void,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 * }} options
 */
export function createTimer(options = {}) {
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h))
  const onChange = options.onChange ?? (() => {})

  let mode = VALID_MODES.has(options.mode) ? options.mode : 'study'   // study | fun | out | sleep
  let status = 'idle'                                    // idle | running | paused
  /** 本次运行的目标：已累计的毫秒数 + 本次开始时刻 */
  let accumulated = 0        // 暂停前累计的毫秒
  let startedAt = null       // 本次运行的开始时刻（毫秒）；暂停时清空
  /** 最近一次"从 idle 开始"的时刻，用于显示 +HH:MM 标记 */
  let sessionStart = null
  /** 已完成的专注段数 */
  let rounds = 0
  let handle = null

  /** 已过毫秒。 */
  function elapsedMs() {
    if (status === 'running') return accumulated + (now() - startedAt)
    return accumulated
  }

  /** 给 UI 的快照。 */
  function snapshot() {
    const ms = elapsedMs()
    return {
      mode,
      status,
      /** 已过秒数（浮点） */
      elapsed: ms / 1000,
      /** 已过秒数（整） */
      seconds: Math.floor(ms / 1000),
      /** 本次开始的墙上时刻（毫秒）；从未开始过为 null */
      sessionStart,
      /** 从 sessionStart 到现在经过的秒数（用于 +17:05） */
      sinceStart: sessionStart === null ? null : Math.floor((now() - sessionStart) / 1000),
      rounds,
    }
  }

  const emit = () => onChange(snapshot())

  function clearPending() {
    if (handle !== null) { clearTimer(handle); handle = null }
  }

  function schedule() {
    clearPending()
    if (status !== 'running') return
    // 每 250ms 唤醒一次，秒数切换够跟手
    handle = setTimer(() => { if (status === 'running') tick() }, 250)
  }

  /** 推进一次。 */
  function tick() {
    if (status !== 'running') return
    schedule()
    emit()
  }

  /** 开始 / 暂停切换。 */
  function toggle() {
    if (status === 'running') {
      accumulated = elapsedMs()
      startedAt = null
      status = 'paused'
      clearPending()
      emit()
      return
    }
    // 从 idle 开始（或暂停后继续）
    if (status === 'idle') {
      accumulated = 0
      sessionStart = now()
    }
    startedAt = now()
    status = 'running'
    emit()
    schedule()
  }

  /** 归零（保留 sessionStart，避免 +HH:MM 跳变；再次开始会重新记）。 */
  function reset() {
    clearPending()
    accumulated = 0
    startedAt = null
    status = 'idle'
    emit()
  }

  /** 切换状态（学习↔娱乐↔外出↔睡觉）：重置计时，并记一次新开始时刻。 */
  function setMode(next) {
    if (!VALID_MODES.has(next)) return
    clearPending()
    mode = next
    accumulated = 0
    startedAt = null
    sessionStart = null
    status = 'idle'
    emit()
  }

  /** 清零已完成段数。 */
  function clearRounds() {
    rounds = 0
    emit()
  }

  /** 完成一段（外部在需要时调用，例如手动打卡）。 */
  function addRound() {
    rounds += 1
    emit()
  }

  function dispose() {
    clearPending()
  }

  return {
    toggle, reset, setMode, clearRounds, addRound, tick, dispose, snapshot,
    get mode() { return mode },
    get status() { return status },
    get rounds() { return rounds },
  }
}

/**
 * 秒 → h:mm:ss（恒带小时位，例：0:47:05）。
 * 恒带小时是为了数字位数稳定——计时器每秒都在跳，位数变化会让整行左右晃。
 */
export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/**
 * 时间戳 → "2026/9/10"
 * @param {number} ms
 */
export function formatDate(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 时间戳 → "+17:05"（当天零点起算的 HH:MM）。
 * @param {number} ms
 */
export function formatClockMark(ms) {
  const d = new Date(ms)
  return `+${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
