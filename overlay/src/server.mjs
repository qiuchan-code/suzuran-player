/*
 * 歌词浮层服务 · server
 * --------------------
 * 干三件事：
 *   1. 每秒读一次系统媒体会话，知道 QQ 音乐（或任何播放器）在放什么；
 *   2. 切歌时按「歌名 + 歌手」搜歌词，解析成带时间戳的行；
 *   3. 用 SSE 把「曲目 + 当前歌词行」推给浮层页面。
 *
 * 不碰音频文件、不绕过任何保护：只读系统公开的媒体会话信息 + 公开歌词接口。
 *
 * 用法：
 *   node src/server.mjs                 # 默认 127.0.0.1:7788
 *   node src/server.mjs --port 8899 --app QQMusic
 * 打开：http://127.0.0.1:7788/
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createTrackReader, trackKey } from './track-reader.mjs'
import { lyricsFor, breakerState, searchDiagnostics, throttleState, searchSongForTest } from './lyrics.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 解析命令行参数。 */
function parseArgs(argv) {
  const out = { port: 7788, host: '127.0.0.1', app: '', poll: 1000, demo: false, verbose: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--host') out.host = argv[++i]
    else if (a === '--app') out.app = argv[++i]
    else if (a === '--poll') out.poll = Number(argv[++i])
    else if (a === '--demo') out.demo = true
    else if (a === '--verbose') out.verbose = true
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const reader = createTrackReader({
  app: args.app,
  interval: args.poll,
  onError: (msg) => { if (args.verbose) console.warn(`[监视器] ${msg}`) },
})
reader.start()

/* ── demo 模式：不读真实会话，用假进度驱动真歌词，用来验证跟唱效果 ── */

const DEMO_TRACKS = [
  { title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269 },
  { title: '起风了', artist: '买辣椒也用券', album: '起风了', duration: 311 },
]
let demoIndex = 0
let demoStart = Date.now()

function demoTrack() {
  const t = DEMO_TRACKS[demoIndex % DEMO_TRACKS.length]
  const elapsed = (Date.now() - demoStart) / 1000
  // 播完就切下一首
  if (elapsed > t.duration) { demoIndex++; demoStart = Date.now(); return demoTrack() }
  // 位置由合成时钟负责，这里只给元数据
  return { app: 'demo', status: 'Playing', ...t }
}

/* ── 状态 ── */

/**
 * 合成时钟。
 *
 * 为什么需要它：实测 QQ 音乐**不通过 SMTC 上报播放进度**（Position/EndTime 恒为 0），
 * 它的 UI 树里也没有进度条节点。所以拿不到真实播放位置。
 *
 * 做法：以"检测到开始播放/切歌"为起点，用墙钟时间推算位置。
 *   · 切歌 → 归零
 *   · 暂停 → 停表；续播 → 继续
 *   · 用户拖动进度条 → 会漂移，用手动偏移量（offset）补偿
 * 精度取决于是否拖动进度条；纯顺序播放时误差约 1 秒内。
 */
let clock = {
  /** 起点（毫秒）；playing 为 false 时表示"停表时刻" */
  startAt: 0,
  /** 暂停前已经积累的秒数 */
  accumulated: 0,
  playing: false,
  /** 手动偏移（秒）：正数表示歌词提前 */
  offset: 0,
}

function clockReset() {
  clock = { ...clock, startAt: Date.now(), accumulated: 0, playing: false }
}

function clockResume() {
  if (clock.playing) return
  clock = { ...clock, startAt: Date.now(), playing: true }
}

function clockPause() {
  if (!clock.playing) return
  clock = { ...clock, accumulated: clock.accumulated + (Date.now() - clock.startAt) / 1000, playing: false }
}

/** 当前推算位置（秒）。 */
function clockPosition() {
  const live = clock.playing ? (Date.now() - clock.startAt) / 1000 : 0
  return Math.max(0, clock.accumulated + live + clock.offset)
}

/** 当前曲目（含歌词与推算出的播放位置）。 */
let state = {
  track: null,
  lyrics: null,
  error: null,
}

/** SSE 客户端。 */
const clients = new Set()

/** 把当前状态推给所有客户端。 */
function broadcast() {
  const payload = JSON.stringify(snapshot())
  for (const res of clients) {
    try { res.write(`data: ${payload}\n\n`) } catch { clients.delete(res) }
  }
}

/** 组装给前端的快照：带上推算后的位置与当前歌词行。 */
function snapshot() {
  const t = state.track
  const playing = clock.playing
  if (t === null) return { track: null, kind: 'none', lines: [], textLines: [], index: -1, position: 0, playing: false, offset: clock.offset, error: state.error }

  let position = clockPosition()
  if (t.duration > 0) position = Math.min(position, t.duration)

  const lyrics = state.lyrics
  const kind = lyrics?.kind ?? 'none'
  const lines = lyrics?.lines ?? []
  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position + 0.15) index = i
    else break
  }
  const trans = lyrics?.trans ?? new Map()
  const transText = index >= 0 ? (trans.get(Math.round(lines[index].time * 10)) ?? '') : ''

  // 时长：SMTC 给就用；QQ 音乐不给（恒为 0），退回搜索接口的 interval 或歌词末行估算
  const duration = t.duration > 0
    ? t.duration
    : (lyrics?.duration ?? 0)

  return {
    track: { title: t.title, artist: t.artist, album: t.album, duration, app: t.app },
    /** 是否有封面图（图走 /api/cover，不塞进状态里，免得每次推送都带一大坨 base64） */
    hasCover: typeof t.coverB64 === 'string' && t.coverB64.length > 0,
    /** 封面图 URL：QQ 音乐专辑图（SMTC 的缩略图对 QQ 音乐是空流，只能走这条） */
    coverUrl: lyrics?.coverUrl ?? null,
    matched: lyrics?.matched ?? null,
    kind,
    /** 正文歌词开始的时间；在此之前只显示"前奏"提示，不滚字幕 */
    creditUntil: lyrics?.creditUntil ?? 0,
    lines: lines.map(l => ({ time: l.time, text: l.text })),
    textLines: lyrics?.textLines ?? [],
    trans: transText,
    index,
    position,
    playing,
    offset: clock.offset,
    error: state.error,
  }
}

/* ── 轮询 ── */

let lastKey = ''
/** 歌词请求的序号：切歌后旧请求的结果一律丢弃。 */
let lyricSeq = 0
/** 正在取歌词的那首歌的 key；避免同一首重复发起。 */
let lyricPending = ''

/**
 * 轮询：常驻监视器已经把最新状态放在 reader 里，这里只做"有没有变化"的判断，
 * 因此可以跑得很密（默认 250ms），切歌感知几乎即时。
 *
 * 注意：**这里绝不 await 歌词请求**。曾经写成 await，结果接口一慢（限流时每首 5 秒+）
 * 就把整轮循环堵住，表现为"切歌后曲名半天不更新"。现在曲目信息先推，歌词取到再补推。
 */
function tick() {
  try {
    const track = args.demo ? demoTrack() : reader.read()
    if (track === null) {
      if (state.track !== null) {
        state = { track: null, lyrics: null, error: null }
        clockPause()
        lastKey = ''
        broadcast()
      }
      return
    }

    const key = trackKey(track)
    const changed = key !== lastKey
    const nowPlaying = track.status === 'Playing'

    if (changed) {
      lastKey = key
      state = { track, lyrics: null, error: null }
      clockReset()
      if (nowPlaying) clockResume()
      broadcast()                       // ← 曲目信息立刻推，不等歌词

      // 歌词后台取；只对"当前这首歌"生效
      const seq = ++lyricSeq
      if (lyricPending !== key) {
        lyricPending = key
        lyricsFor(track).then((lyrics) => {
          // 期间又切歌了 → 丢弃
          if (seq !== lyricSeq) return
          lyricPending = ''
          state = { ...state, lyrics }
          broadcast()
          if (args.verbose) {
            console.log(`[歌词] ${track.title} - ${track.artist} → kind=${lyrics?.kind ?? 'null'}`
              + ` lines=${lyrics?.lines?.length ?? 0} matched=${lyrics?.matched ?? 'null'}`)
          }
        }).catch((err) => {
          lyricPending = ''
          if (args.verbose) console.warn(`[歌词] ${track.title} 失败：${String(err)}`)
        })
      }
      return
    }

    // 同一首歌：只同步播放状态（位置由合成时钟负责）
    const wasPlaying = clock.playing
    if (nowPlaying && !wasPlaying) clockResume()
    else if (!nowPlaying && wasPlaying) clockPause()

    state = { ...state, track }
    if (nowPlaying !== wasPlaying || nowPlaying) broadcast()
  } catch (err) {
    state = { ...state, error: String(err) }
    broadcast()
  }
}

/* ── HTTP ── */

/** 允许跨源取数据：播放器界面可能从别的源/本地文件打开。 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = readFileSync(join(HERE, 'overlay.html'), 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(html)
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('overlay.html 不存在')
    }
    return
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS,
    })
    res.end(JSON.stringify(snapshot()))
    return
  }

  // 封面图：直接吐图片字节（base64 解码一次），比走 JSON 省一半体积
  if (url.pathname === '/api/cover') {
    const b64 = state.track?.coverB64 ?? ''
    if (b64 === '') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...CORS })
      res.end('no cover')
      return
    }
    try {
      const buf = Buffer.from(b64, 'base64')
      // 认一下魔数，给对 content-type，不然浏览器可能不显示
      const isPng = buf[0] === 0x89 && buf[1] === 0x50
      res.writeHead(200, {
        'content-type': isPng ? 'image/png' : 'image/jpeg',
        'content-length': buf.length,
        'cache-control': 'no-store',
        ...CORS,
      })
      res.end(buf)
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', ...CORS })
      res.end('bad cover')
    }
    return
  }

  if (url.pathname === '/api/sessions') {
    const list = await reader.list()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(list))
    return
  }

  // 排查用：最近 30 次搜索的匹配详情（哪首没搜到、候选是什么、是否被限流）
  if (url.pathname === '/api/diagnostics') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({
      breaker: breakerState(),
      throttle: throttleState(),
      recent: searchDiagnostics(),
    }, null, 1))
    return
  }

  // 排查用：直接拿歌名+歌手跑一次搜索，返回命中情况和用的哪个源。
  // 用途：压测"快速切歌"时接口扛不扛得住（见 overlay/tools/stress-switch.mjs）
  if (url.pathname === '/api/search-test') {
    const title = url.searchParams.get('title') ?? ''
    const artist = url.searchParams.get('artist') ?? ''
    if (!title) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: '缺少 title 参数' }))
      return
    }
    try {
      const r = await searchSongForTest(title, artist)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(r))
    } catch (e) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: String(e?.message ?? e) }))
    }
    return
  }

  // 手动微调：QQ 音乐不上报进度，拖动进度条后歌词会漂移，用这个补偿
  if (url.pathname === '/api/offset') {
    const delta = Number(url.searchParams.get('delta') ?? '0')
    const set = url.searchParams.get('set')
    if (set !== null) clock.offset = Number(set) || 0
    else clock.offset = Math.round((clock.offset + delta) * 10) / 10
    broadcast()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ offset: clock.offset }))
    return
  }

  // 手动对齐到某个位置（拖动进度条后用）
  if (url.pathname === '/api/seek') {
    const to = Number(url.searchParams.get('to') ?? '0')
    clock.accumulated = Math.max(0, to - clock.offset)
    clock.startAt = Date.now()
    broadcast()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ position: clockPosition() }))
    return
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
      ...CORS,
    })
    res.write('retry: 2000\n\n')
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...CORS })
  res.end('not found')
})

server.listen(args.port, args.host, () => {
  console.log(`歌词浮层：http://${args.host}:${args.port}/`)
  if (args.demo) console.log('模式：demo（假进度 + 真歌词，用于验证跟唱效果）')
  else console.log(`读取会话：${args.app === '' ? '自动（优先正在播放的）' : args.app}`)
  console.log(`轮询间隔：${args.poll}ms`)
})

// 每秒轮询；位置在两次轮询之间由前端推算
setInterval(tick, args.poll)
tick()

/**
 * 歌词补取：取词失败（限流、网络抖动）时不放弃，定期重试。
 *
 * 为什么需要：QQ 音乐接口对突发频率很敏感，连查几首就会返 code=2001 进入
 * 分钟级冷却。没有这个补取的话，冷却期间切的歌会一直显示"没有歌词"，
 * 只能手动切回来才可能恢复。有它就能在冷却结束后自动补上。
 *
 * 失败项在 lyrics 模块里只缓存 30 秒，所以这里的 25 秒间隔正好能赶上。
 */
setInterval(() => {
  if (state.track === null) return
  if (state.lyrics !== null && state.lyrics.kind !== 'none') return
  const key = trackKey(state.track)
  if (lyricPending === key) return          // 已经在取了
  const seq = ++lyricSeq
  lyricPending = key
  lyricsFor(state.track).then((lyrics) => {
    if (seq !== lyricSeq) return            // 期间切歌了
    lyricPending = ''
    if (lyrics.kind !== 'none') {
      state = { ...state, lyrics }
      broadcast()
      if (args.verbose) console.log(`[补取] ${state.track.title} → kind=${lyrics.kind} lines=${lyrics.lines.length}`)
    }
  }).catch(() => { lyricPending = '' })
}, 25_000)
