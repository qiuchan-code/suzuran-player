/*
 * 实时数据层 · live
 * ----------------
 * 抽出来给两个页面共用（歌词浮层、播放器界面）：
 *   · 拉状态快照 + 订阅 SSE
 *   · 用「快照时刻 + 推算位置」在两次推送之间补间，进度条和歌词才不会一跳一跳
 *   · 算当前行 / 上一句 / 下一句
 *   · 封面图 URL（SMTC 缩略图对 QQ 音乐是空流，只能走搜索接口给的专辑图）
 *
 * 用法（浏览器，作为普通脚本内联）：
 *   const live = createLive({ onChange: render })
 *   live.start()
 */

/**
 * @param {{
 *   base?: string,                 // 服务端地址，默认同源；file:// 打开时需要显式指定
 *   onChange?: (state: object) => void,
 * }} options
 */
export function createLive(options = {}) {
  const base = (options.base ?? '').replace(/\/$/, '')
  const onChange = options.onChange ?? (() => {})

  /** 最近一次快照。 */
  let snap = null
  /** 收到快照的本地时刻（毫秒）。 */
  let snapAt = 0
  /** 打开页面时的本地时刻与快照位置的基准，用于补间。 */
  let basePosition = 0

  let es = null
  let pollTimer = null

  /** 推算当前播放位置（秒）。 */
  function position() {
    if (snap === null) return 0
    let pos = basePosition
    if (snap.playing) pos += (Date.now() - snapAt) / 1000
    const dur = snap.track?.duration ?? 0
    if (dur > 0) pos = Math.min(pos, dur)
    return Math.max(0, pos)
  }

  /** 当前行下标（-1 表示还没到第一句）。 */
  function indexAt(pos, lines) {
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= pos + 0.15) idx = i
      else break
    }
    return idx
  }

  /** 给 UI 的完整视图状态。 */
  function view() {
    if (snap === null) {
      return {
        ready: false, track: null, kind: 'none',
        position: 0, duration: 0, playing: false, index: -1,
        prev: '', now: '正在连接…', next: '',
        coverUrl: null, placeholder: 'connecting',
      }
    }

    const t = snap.track
    if (t === null) {
      return {
        ready: true, track: null, kind: 'none',
        position: 0, duration: 0, playing: false, index: -1,
        prev: '', now: '打开 QQ 音乐播放任意歌曲', next: '',
        coverUrl: null, placeholder: 'idle',
      }
    }

    const pos = position()
    const duration = t.duration ?? 0
    const lines = snap.lines ?? []
    const idx = indexAt(pos, lines)

    // 纯文本歌词：没有时间轴，退化成"不跟唱"
    if (snap.kind === 'plain') {
      const texts = snap.textLines ?? []
      return {
        ready: true, track: t, kind: 'plain',
        position: pos, duration, playing: snap.playing,
        index: -1, prev: '', now: '这首歌没有同步歌词',
        next: texts.slice(0, 2).join(' / '),
        coverUrl: snap.coverUrl ?? null,
        placeholder: null,
      }
    }

    // 前奏：正文没开始，不滚字幕
    if ((snap.creditUntil ?? 0) > 0 && pos < snap.creditUntil) {
      return {
        ready: true, track: t, kind: snap.kind,
        position: pos, duration, playing: snap.playing,
        index: -1, prev: '', now: '前奏中 · 歌词马上开始', next: '',
        coverUrl: snap.coverUrl ?? null,
        placeholder: 'intro',
      }
    }

    if (lines.length === 0) {
      return {
        ready: true, track: t, kind: 'none',
        position: pos, duration, playing: snap.playing,
        index: -1, prev: '', now: '这首歌暂时没有同步歌词', next: '',
        coverUrl: snap.coverUrl ?? null,
        placeholder: 'none',
      }
    }

    return {
      ready: true, track: t, kind: snap.kind,
      position: pos, duration, playing: snap.playing,
      index: idx,
      prev: idx > 0 ? lines[idx - 1].text : '',
      now: idx >= 0 ? lines[idx].text : '',
      next: idx + 1 < lines.length ? lines[idx + 1].text : '',
      coverUrl: snap.coverUrl ?? null,
      placeholder: idx >= 0 ? null : 'intro',
    }
  }

  /** 收下一次快照。 */
  function absorb(next) {
    const prevKey = snap?.track === null ? '∅' : `${snap?.track?.title}\u0000${snap?.track?.artist}`
    const nextKey = next.track === null ? '∅' : `${next.track.title}\u0000${next.track.artist}`
    const changed = prevKey !== nextKey

    snap = next
    snapAt = Date.now()
    // 换了歌：位置从 0 重来；否则跟着服务端给的位置对齐
    basePosition = changed ? (next.position ?? 0) : (next.position ?? 0)

    onChange(view())
  }

  async function fetchState() {
    try {
      const res = await fetch(`${base}/api/state`, { cache: 'no-store' })
      if (!res.ok) return
      absorb(await res.json())
    } catch { /* 服务没起或者网络抖动，等下一次 */ }
  }

  function openStream() {
    try {
      es = new EventSource(`${base}/api/events`)
      es.onmessage = (e) => {
        try { absorb(JSON.parse(e.data)) } catch { /* 忽略坏帧 */ }
      }
      es.onerror = () => {
        // EventSource 自己会重连；这里只保证首帧拿得到
        fetchState()
      }
    } catch {
      es = null
    }
  }

  /** 开始接收数据。 */
  function start() {
    fetchState()
    openStream()
    // 每秒兜底拉一次：SSE 万一断了也能自愈
    pollTimer = setInterval(fetchState, 5000)
  }

  function stop() {
    if (es !== null) { es.close(); es = null }
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
  }

  /** 每帧调用：补间推进，让进度条和歌词跟得上。 */
  function tick() {
    onChange(view())
  }

  return { start, stop, tick, position, view, get snapshot() { return snap } }
}

/** 秒 → m:ss。 */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')}`
}
