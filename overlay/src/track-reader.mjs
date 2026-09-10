/*
 * 读取当前媒体会话 · Node 侧封装（常驻进程版）
 * ------------------------------------------
 * 底层是 Windows 的 SMTC（GlobalSystemMediaTransportControlsSessionManager），
 * 由 tools/session-watch.ps1 常驻输出 JSON 行。
 *
 * 为什么改成常驻：每启动一次 PowerShell 读一次会话要 ~800ms。之前 Node 每秒
 * 调一次脚本，等于每秒烧掉 800ms 的进程启动开销，切歌感知延迟接近 2 秒。
 * 现在只启动一次进程，它内部每 250ms 轮询、变化时才输出一行，Node 侧读流即可，
 * 读状态变成"取最近一行"的零成本操作。
 *
 * 用法：
 *   const reader = createTrackReader({ app: 'QQMusic' })
 *   reader.start()
 *   reader.read()        // → 最近一次快照（同步，不等待）
 *   reader.stop()
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'tools', 'session-watch.ps1')

/** Windows PowerShell 5.1（有完整 WinRT 支持）。 */
const PS = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`

/**
 * 造一个读取器。
 * @param {{app?: string, interval?: number, onError?: (msg: string) => void}} options
 */
export function createTrackReader(options = {}) {
  const app = options.app ?? ''
  const interval = options.interval ?? 250
  const onError = options.onError ?? (() => {})

  /** 最近一次快照。 */
  let latest = null
  /** 快照到达的本地时刻（用于推算）。 */
  let latestAt = 0
  let child = null
  let buf = ''
  let stopped = false
  let restartTimer = null
  /** 会话列表缓存（用于 -List 之外的排查）。 */
  let lastError = null

  /** 把一行 JSON 变成快照。 */
  function parseLine(line) {
    let j
    try { j = JSON.parse(line) } catch { return null }
    if (j.none === true) return { none: true }
    return {
      app: j.app ?? '',
      status: j.status ?? 'Unknown',
      title: j.title ?? '',
      artist: j.artist ?? '',
      album: j.album ?? '',
      position: Number(j.position) || 0,
      duration: Number(j.duration) || 0,
      cover: j.cover === true,
      coverB64: typeof j.coverB64 === 'string' ? j.coverB64 : '',
    }
  }

  function spawnWatcher() {
    if (stopped) return
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Interval', String(interval)]
    if (app !== '') args.push('-App', app)
    child = spawn(PS, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    buf = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line === '') continue
        const snap = parseLine(line)
        if (snap === null) continue
        latest = snap.none === true ? null : snap
        latestAt = Date.now()
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      lastError = String(chunk).trim().slice(0, 300)
      onError(lastError)
    })

    child.on('exit', () => {
      child = null
      if (stopped) return
      // 监视器挂了就重启，退避 1 秒
      restartTimer = setTimeout(spawnWatcher, 1000)
    })
  }

  /** 启动常驻监视器。 */
  function start() {
    if (child !== null) return
    stopped = false
    spawnWatcher()
  }

  /** 停止。 */
  function stop() {
    stopped = true
    if (restartTimer !== null) { clearTimeout(restartTimer); restartTimer = null }
    if (child !== null) { try { child.kill() } catch { /* 已经退出 */ } child = null }
  }

  /**
   * 读最近一次快照。
   * @returns {object|null} 同步返回，不等待子进程
   */
  function read() {
    return latest
  }

  /** 快照到达的本地时刻。 */
  function readAt() {
    return latestAt
  }

  /** 最近一次错误（排查用）。 */
  function error() {
    return lastError
  }

  /** 是否活着。 */
  function alive() {
    return child !== null
  }

  return { start, stop, read, readAt, error, alive }
}

/** 曲目身份：切歌判断用。 */
export function trackKey(track) {
  if (track === null || track === undefined) return ''
  return `${track.title}\u0000${track.artist}`
}
