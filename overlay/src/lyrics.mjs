/*
 * 歌词获取与解析 · lyrics
 * ----------------------
 * 数据源：QQ 音乐公开歌词接口（只读、免登录、不下载音频）。
 *
 * 关键事实（实测）：同一接口对不同的歌返回不同质量——
 *   《晴天》    → 带 [mm:ss.xx] 时间戳，可同步
 *   《一笑倾城若桃花》→ 只有纯文本，没有时间戳
 * 所以这里把结果分成三态：synced（可同步）/ plain（纯文本）/ none（没有）。
 *
 * 为什么不自动换平台兜底：网易云搜"一笑倾城"命中汪苏泷的《一笑倾城》，
 * 与当前在播的《一笑倾城若桃花》不是同一首。跨平台模糊匹配会串歌，
 * 比"没有同步歌词"更糟。要兜底必须由用户显式开启，并接受串歌风险。
 *
 * 缓存：同一首歌只查一次，内存留最近 50 首。
 */

const HEADERS = {
  'Referer': 'https://y.qq.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
}

/** 曲目 key → { value, expiresAt }。命中过的永久留，失败过的一段时间后可重试。 */
const cache = new Map()
const CACHE_MAX = 50
/**
 * 失败结果（none）的缓存时长。
 *
 * 30 秒是权衡：太短会在限流期间反复重试（越试越糟），
 * 太长则接口恢复后迟迟不补歌词。限流冷却 60 秒，配合服务端的
 * 定时重试（见 server.mjs），恰好能赶在冷却结束后补上。
 */
const MISS_TTL_MS = 30_000

/**
 * 失败熔断：连续多次搜索失败后，短时间内不再尝试。
 *
 * 为什么需要：接口限流时每次失败要等几秒，而切歌很快——不熔断的话
 * 每首都白等好几秒，界面表现就是"切歌后半天不更新"。
 */
const breaker = {
  consecutiveFailures: 0,
  /** 熔断解除时刻（毫秒）；0 表示未熔断 */
  openUntil: 0,
}
const BREAKER_THRESHOLD = 5
const BREAKER_COOLDOWN_MS = 20_000

/** 熔断是否打开。 */
function breakerOpen() {
  if (breaker.openUntil === 0) return false
  if (Date.now() >= breaker.openUntil) {
    // 冷却结束，半开：允许一次尝试
    breaker.openUntil = 0
    breaker.consecutiveFailures = 0
    return false
  }
  return true
}

/** 记录一次失败。 */
function noteFailure() {
  breaker.consecutiveFailures += 1
  if (breaker.consecutiveFailures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS
  }
}

/** 记录一次成功。 */
function noteSuccess() {
  breaker.consecutiveFailures = 0
  breaker.openUntil = 0
}

/** 查熔断状态（排查用）。 */
export function breakerState() {
  return { ...breaker, open: breakerOpen() }
}
/** 带超时的 fetch。 */
async function fetchWithTimeout(url, ms = 8000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { headers: HEADERS, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 重试包装。
 *
 * 关键区分：
 *   · 抛错（超时 / HTTP 错 / 非 JSON / **限流 2001**）→ 值得重试
 *   · 返回空数组 → 接口正常应答但没这条，**是有效结果**，重试只是白等
 *
 * @returns {Promise<{ ok: true, value: any } | { ok: false, error: string, throttled: boolean }>}
 */
async function retry(fn, times = 3, delayMs = 400) {
  let lastError = '未知错误'
  let lastThrottled = false
  for (let i = 0; i < times; i++) {
    try {
      const r = await fn()
      if (r !== null && r !== undefined && r !== '') return { ok: true, value: r }
      // 空字符串/null 视为有效但为空
      return { ok: true, value: Array.isArray(r) ? r : null }
    } catch (err) {
      lastError = err?.message ?? String(err)
      lastThrottled = err?.name === 'ThrottledError'
      // 被限流时退避要长——冷却期内急着重试只会让限流更久
      const wait = lastThrottled ? 25_000 : delayMs * (i + 1)
      if (i < times - 1) await new Promise(r => setTimeout(r, wait))
    }
  }
  return { ok: false, error: lastError, throttled: lastThrottled }
}

/** 剥掉可能的 jsonp 外壳。 */
function unwrapJsonp(text) {
  const t = text.trim()
  if (t.startsWith('callback(')) return t.slice(9).replace(/\)\s*;?\s*$/, '')
  if (t.startsWith('MusicJsonCallback(')) return t.slice(18).replace(/\)\s*;?\s*$/, '')
  return t
}

/** 解码 QQ 歌词里的 HTML 实体（&#45; &#10; 之类）。 */
function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}

/**
 * 解析 LRC。
 * @param {string} text - LRC 原文
 * @returns {{ time: number, text: string }[]} 按时间升序
 */
export function parseLrc(text) {
  const out = []
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    // 一行可能有多个时间戳：[00:12.34][01:20.00] 歌词
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (stamps.length === 0) continue
    const content = line.replace(/\[[^\]]*\]/g, '').trim()
    if (content === '') continue
    for (const m of stamps) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const fracRaw = m[3] ?? '0'
      const frac = Number(fracRaw.length === 3 ? fracRaw : fracRaw.padEnd(2, '0')) / (fracRaw.length === 3 ? 1000 : 100)
      out.push({ time: min * 60 + sec + frac, text: content })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

/**
 * 判断一行是不是"歌曲信息字幕"（作词/作曲/编曲…）。
 *
 * 为什么要专门处理：QQ 音乐的 LRC 开头常有一串带时间戳的制作信息行，
 * 播放器把它们当前奏字幕显示，而人耳感知的"歌词"从正文才开始。
 * 不区分的话，前奏阶段浮层就开始滚字幕，看起来像"歌词提前了"。
 *
 * @param {string} text - 一行歌词文本
 * @returns {boolean}
 */
export function isCreditLine(text) {
  const t = String(text).trim()
  if (t === '') return true

  // 中文常见标签（词/曲/演唱/…）；用「标签 + 分隔符」判定，避免误伤歌词正文
  if (/^(作词|作曲|编曲|和声|合声|混音|母带|制作人|监制|企划|出品|发行|统筹|录音|吉他|贝斯|鼓|键盘|弦乐|演唱|原唱|翻唱|词|曲|OP|SP)\s*[:：]/.test(t)) return true
  // 英文常见标签
  if (/^(Lyrics?|Composed|Arranged|Produced|Mixed|Mastered|Written|Music|Producer|Songwriter|Label|Vocal|Guitar|Bass|Drum|Piano|Strings)\b\s*(by)?\s*[:：]/i.test(t)) return true
  // 版权声明 / 未授权提示（可能带各种括号）
  if (/^[（(【\[]?\s*(未经许可|版权所有|本作品|版权|未经著作权)/.test(t)) return true
  // 纯器乐提示
  if (/^[（(【\[]?\s*(Instrumental|Music|间奏|前奏|尾奏)\s*[)）】\]]?$/i.test(t)) return true
  // 首行的"歌名 - 歌手"标题行（LRC 常见，播放器当前奏字幕显示）
  if (/^.{1,40}\s+[-–—]\s+.{1,40}$/.test(t) && !/[，。！？、,.!?]/.test(t)) return true
  // 纯音乐占位文本（不是真歌词）
  if (/没有填词|纯音乐|请您欣赏|暂无歌词|无歌词/.test(t)) return true
  return false
}

/**
 * 从解析后的行里挑出"正文歌词"的下标。
 * 开头连续的信息字幕会被跳过；正文一旦开始就不再跳过后面的行
 * （避免把歌词里恰好出现的"词：xxx"误伤）。
 *
 * @param {{time:number,text:string}[]} lines
 * @returns {number} 第一个正文行的下标；全是字幕时返回 0
 */
export function firstRealLineIndex(lines) {
  let i = 0
  // 只在开头连续跳过；信息字幕一般集中在歌曲前 60 秒内
  while (i < lines.length && lines[i].time <= 60 && isCreditLine(lines[i].text)) i++
  return i >= lines.length ? 0 : i
}
/** 去掉 LRC 元信息行（[ti:][ar:]…）与空行，得到纯文本行。 */
export function plainLines(text) {
  return String(text)
    .split('\n')
    .map(l => l.replace(/\r$/, '').replace(/^\[[a-z]{2}:[^\]]*\]/i, '').trim())
    .filter(l => l !== '')
}

/**
 * 去掉标题里的版本标记，得到"主标题"。
 *
 * 播放器的曲名常带版本号（`Gotta Run (Phonk)`、`起风了 (Live)`、`xxx -Remix`），
 * 而曲库里存的是不带版本号的名字，导致完全同名匹配失败。
 *
 * @param {string} title
 * @returns {string} 去掉括号内容与 `- xxx` 后缀的主标题
 */
export function baseTitle(title) {
  return String(title ?? '')
    // 去英文/中文括号内容
    .replace(/[（(][^）)]*[）)]/g, '')
    // 去 " - xxx" / " – xxx" / "— xxx" 后缀
    .replace(/\s*[-–—]\s*[^-–—]{1,20}$/, '')
    .trim()
    .toLowerCase()
}

/** 搜索诊断记录（最近 30 条），供 /api/diagnostics 查看。 */
const diag = []
const DIAG_MAX = 30

function noteDiag(entry) {
  diag.push(entry)
  if (diag.length > DIAG_MAX) diag.shift()
}

/** 读诊断记录。 */
export function searchDiagnostics() {
  return diag.slice()
}

/**
 * 搜歌：歌名 + 歌手 → 最匹配的一条。
 *
 * 数据源有两个，**优先用新的 musicu 接口**：
 *   · 新：`u.y.qq.com/cgi-bin/musicu.fcg` —— 实测稳定（10/10），约 350ms
 *   · 旧：`c.y.qq.com/soso/fcgi-bin/client_search_cp` —— 2026-09 起恒返 500，仅兜底
 *
 * 匹配策略（从严到宽）：
 *   1. 歌名完全相同 + 歌手能对上 → 最佳
 *   2. 歌名完全相同（歌手对不上）→ 取第一条
 *   3. 主标题（去版本号）相同 + 歌手能对上 → 兜底
 *   4. 主标题相同（歌手对不上）→ 最后兜底，只在候选确实同名时才用
 * 歌手完全对不上且标题也不同 → 放弃（宁可没歌词，也不串歌）。
 *
 * @param {string} title
 * @param {string} artist
 * @param {number} [wantDuration] - 当前曲目时长（秒），用于同名候选里挑版本
 */
export async function searchSong(title, artist, wantDuration = 0) {
  if (!title) return null

  let list = []
  let source = 'none'
  let searchError = ''

  /** 试一轮：新接口 → （失败才）旧接口。 */
  async function attempt(queryTitle, queryArtist, label) {
    // 限流时给 4 次机会（内部退避 2s/5s/10s），比普通网络抖动更耐心
    const r1 = await retry(() => searchNew(queryTitle, queryArtist), 4, 350)
    if (r1.ok && r1.value.length > 0) return { list: r1.value, source: 'musicu', error: '', throttled: false }
    let err = r1.ok ? '' : r1.error
    const wasThrottled = r1.throttled === true

    // 新接口**报错**（不是返回 0 条）时才碰旧接口；但限流时旧接口也在同一限流域，跳过
    if (!r1.ok && !wasThrottled) {
      const r2 = await retry(() => searchOld(queryTitle, queryArtist), 1, 300)
      if (r2.ok && r2.value.length > 0) return { list: r2.value, source: 'client_search', error: '', throttled: false }
      if (err === '') err = r2.error
    }
    if (label) noteDiag({ at: Date.now(), title, artist, attempt: label, source: 'musicu', candidates: 0, error: err || undefined, result: wasThrottled ? '限流' : '无数据' })
    return { list: [], source: 'none', error: err, throttled: wasThrottled }
  }

  // 第一轮：歌名 + 歌手
  let r = await attempt(title, artist, '')
  list = r.list; source = r.source; searchError = r.error
  let throttledNow = r.throttled === true

  // 第二轮：接口正常应答但 0 条 → 只拿歌名再搜一次（歌手的写法常常对不上）
  if (list.length === 0 && searchError === '' && artist) {
    const r2 = await attempt(title, '', '仅歌名')
    if (r2.list.length > 0) { list = r2.list; source = r2.source + '(仅歌名)' }
    throttledNow = throttledNow || r2.throttled === true
  }

  // 第三轮：主标题（去版本号）只搜歌名
  if (list.length === 0 && searchError === '' && !throttledNow) {
    const base = baseTitle(title)
    if (base && base !== title.toLowerCase()) {
      const r3 = await attempt(base, '', '主标题')
      if (r3.list.length > 0) { list = r3.list; source = r3.source + '(主标题)' }
      throttledNow = throttledNow || r3.throttled === true
    }
  }

  const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase()
  const wantTitle = norm(title)
  const wantBase = baseTitle(title)
  const wantArtist = norm(artist)

  const singerOf = (s) => Array.isArray(s.singer) ? s.singer.map(x => x.name).join('/') : String(s.singer ?? '')
  const artistScore = (s) => {
    const joined = norm(singerOf(s))
    if (wantArtist === '') return 1
    if (joined === wantArtist) return 3
    if (joined.includes(wantArtist) || wantArtist.includes(joined)) return 2
    return 0
  }

  const exact = list.filter(s => norm(s.name) === wantTitle)
  const loose = list.filter(s => {
    const b = baseTitle(s.name)
    return b !== '' && (b === wantBase || b.startsWith(wantBase) || wantBase.startsWith(b))
  })

  let pool = exact.filter(s => artistScore(s) > 0)
  let how = 'exact+artist'
  if (pool.length === 0) { pool = exact; how = 'exact' }
  if (pool.length === 0) { pool = loose.filter(s => artistScore(s) > 0); how = 'base+artist' }
  if (pool.length === 0) { pool = loose; how = 'base' }

  if (pool.length === 0) {
    noteDiag({
      at: Date.now(), title, artist, source,
      candidates: list.length,
      names: list.slice(0, 6).map(s => s.name),
      error: searchError || undefined,
      result: list.length === 0 ? (throttledNow ? '限流' : '三轮都无数据') : '未命中',
    })
    return null
  }

  pool.sort((a, b) => artistScore(b) - artistScore(a))
  let best = pool[0]
  if (wantDuration > 0) {
    const withInterval = pool.filter(s => Number(s.interval) > 0)
    if (withInterval.length > 0) {
      withInterval.sort((a, b) =>
        Math.abs(Number(a.interval) - wantDuration) - Math.abs(Number(b.interval) - wantDuration))
      const cand = withInterval[0]
      if (Math.abs(Number(cand.interval) - wantDuration) <= 3) best = cand
    }
  }

  const mid = best.mid ?? best.songmid
  if (!mid) {
    noteDiag({ at: Date.now(), title, artist, source, candidates: list.length, result: '候选无 mid' })
    return null
  }

  noteDiag({
    at: Date.now(), title, artist, source,
    candidates: list.length, how,
    matched: `${best.name} - ${singerOf(best)}`,
    result: '命中',
  })

  // 专辑 mid → 封面图。SMTC 给的 Thumbnail 对 QQ 音乐是空流（实测 size=0），
  // 所以封面从搜索结果的 album.mid 拼，这条路稳定。
  const albumMid = best.album?.mid ?? ''
  const coverUrl = albumMid === ''
    ? null
    : `https://y.qq.com/music/photo_new/T002R500x500M000${albumMid}.jpg`

  return {
    songmid: mid,
    name: best.name ?? title,
    singer: singerOf(best) || artist || '',
    interval: Number(best.interval) || 0,
    albumMid,
    coverUrl,
  }
}

/**
 * 请求闸门：所有搜索请求排队，保证两次请求之间有最小间隔。
 *
 * 实测这个接口对**突发频率**很敏感（超了返 code=2001），而且一旦进限流，
 * 冷却期是分钟级的。3 秒的间隔下实测 12 连击全过；1.2 秒下会在第 10 次左右翻车。
 * 正常使用时一首歌才查一次，这点延迟完全无感。
 */
const MIN_GAP_MS = 3000
let lastRequestAt = 0
let queueTail = Promise.resolve()

function gate() {
  const next = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastRequestAt = Date.now()
  })
  queueTail = next.catch(() => {})
  return next
}

/**
 * 被限流的标记错误：调用方据此走长退避，而不是当成"搜不到"。
 */
class ThrottledError extends Error {
  constructor(code) {
    super(`接口限流 code=${code}`)
    this.name = 'ThrottledError'
    this.code = code
  }
}

/**
 * 限流后的整体冷却：一旦吃到 2001，所有请求停这么久。
 *
 * 为什么不是"重试几次"：实测越试越糟——冷却期内继续请求只会延长限流。
 * 现在是"发现限流 → 整体停表 → 到点再试一次"。
 */
let throttledUntil = 0
const THROTTLE_COOLDOWN_MS = 60_000

/** 是否仍在限流冷却期。 */
export function throttled() {
  return Date.now() < throttledUntil
}

/** 限流状态（排查用）。 */
export function throttleState() {
  return { cooling: throttled(), until: throttledUntil, remainingMs: Math.max(0, throttledUntil - Date.now()) }
}

/**
 * 新接口：musicu 搜索。
 *
 * **重要的坑**：这个接口被限流时不返 HTTP 错误，而是返
 * `{"req":{"code":2001,"data":null}}`——HTTP 200、body 正常、就是没数据。
 * 早先的代码把它当成"这首歌搜不到"，于是永久缓存 + 不重试，
 * 表现就是"经常显示不出歌词"。现在显式识别 2001 并抛 ThrottledError。
 *
 * @returns {Promise<object[]>} 候选列表（可能是空数组 = 确实搜不到）
 */
async function searchNew(title, artist) {
  const query = [title, artist].filter(Boolean).join(' ')
  const body = {
    comm: { ct: 19, cv: 1859 },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: 10, page_num: 1, query, search_type: 0 },
    },
  }
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(body))}`

  await gate()   // 排队限速：两次请求之间至少隔 MIN_GAP_MS

  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`响应非 JSON（${text.length} 字节）`) }

  const code = json?.req?.code
  if (code !== undefined && code !== 0) {
    throttledUntil = Date.now() + THROTTLE_COOLDOWN_MS
    throw new ThrottledError(code)
  }
  // code=0：正常应答。空数组 = 确实没这条，属于有效结果
  return json?.req?.data?.body?.song?.list ?? []
}

/** 旧接口：client_search_cp（2026-09 起恒 500，仅兜底）。 */
async function searchOld(title, artist) {
  const keyword = [title, artist].filter(Boolean).join(' ')
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=10&w=${encodeURIComponent(keyword)}&format=json&cr=1&new_json=1`
  const res = await fetchWithTimeout(url, 4000)   // 它挂的时候要等 5 秒，超时短一点
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = JSON.parse(unwrapJsonp(await res.text()))
  return json?.data?.song?.list ?? []
}

/**
 * 取歌词原文。
 * @param {string} songmid
 * @returns {Promise<{ lrc: string, trans: string } | null>}
 */
export async function fetchLyric(songmid) {
  if (!songmid) return null
  const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`
  const r = await retry(async () => {
    const res = await fetchWithTimeout(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = JSON.parse(unwrapJsonp(await res.text()))
    const lrc = decodeEntities(json?.lyric ?? '')
    if (lrc === '') return null
    return { lrc, trans: decodeEntities(json?.trans ?? '') }
  }, 3, 350)
  return r.ok ? r.value : null
}

/**
 * 一站式：曲目 → 歌词。
 * @param {{title: string, artist: string}} track
 * @returns {Promise<{
 *   kind: 'synced' | 'plain' | 'none',
 *   lines: { time: number, text: string }[],
 *   textLines: string[],
 *   trans: Map<number, string>,
 *   songmid: string | null,
 *   matched: string | null,
 * }>}
 */
export async function lyricsFor(track) {
  const key = `${track.title}\u0000${track.artist}`
  const hit = cache.get(key)
  if (hit !== undefined && hit.expiresAt > Date.now()) return hit.value

  const miss = { kind: 'none', lines: [], textLines: [], trans: new Map(), songmid: null, matched: null, creditUntil: 0, duration: 0 }

  // 熔断打开（或正在限流冷却）时直接放弃：每首都白等几秒，不如快速返回
  if (breakerOpen() || throttled()) return miss

  const song = await searchSong(track.title, track.artist, Number(track.duration) || 0)
  if (song === null) {
    // 失败不永久缓存：30 秒后允许重试（可能只是这一次没搜到）
    noteFailure()
    cache.set(key, { value: { ...miss, diag: 'search-miss' }, expiresAt: Date.now() + MISS_TTL_MS })
    return miss
  }
  noteSuccess()

  const raw = await fetchLyric(song.songmid)
  if (raw === null || raw.lrc === '') {
    cache.set(key, { value: miss, expiresAt: Date.now() + MISS_TTL_MS })
    return miss
  }

  const lines = parseLrc(raw.lrc)
  const trans = new Map()
  for (const t of parseLrc(raw.trans)) trans.set(Math.round(t.time * 10), t.text)

  // 全是字幕/占位文本（纯音乐、没有填词）时，当作"没有歌词"处理，别把占位文本当歌词显示
  const realLines = lines.filter(l => !isCreditLine(l.text))
  const coverOf = { coverUrl: song.coverUrl ?? null, albumMid: song.albumMid ?? '' }
  if (realLines.length === 0) {
    // 没有时间戳但确有正文 → 退化成纯文本；否则就是没有歌词
    const plain = plainLines(raw.lrc).filter(t => !isCreditLine(t))
    const value = plain.length > 0
      ? { kind: 'plain', lines: [], textLines: plain, trans: new Map(), songmid: song.songmid, matched: `${song.name} - ${song.singer}`, creditUntil: 0, duration: song.interval > 0 ? song.interval : 0, ...coverOf }
      : { ...miss, matched: `${song.name} - ${song.singer}`, duration: song.interval > 0 ? song.interval : 0, ...coverOf }
    cache.set(key, { value, expiresAt: Number.POSITIVE_INFINITY })
    return value
  }

  // 开头连续的制作信息字幕：正文开始前不显示，避免前奏阶段就"滚歌词"
  const firstReal = firstRealLineIndex(lines)
  const creditUntil = firstReal > 0 ? lines[firstReal].time : 0

  // 时长：优先用搜索接口给的 interval，比"歌词末行 + 8 秒"准
  const duration = song.interval > 0 ? song.interval : (lines.length > 0 ? lines[lines.length - 1].time + 8 : 0)

  const result = { kind: 'synced', lines, textLines: [], trans, songmid: song.songmid, matched: `${song.name} - ${song.singer}`, creditUntil, duration, coverUrl: song.coverUrl ?? null, albumMid: song.albumMid ?? '' }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, { value: result, expiresAt: Number.POSITIVE_INFINITY })
  return result
}

/** 清空缓存（排查用）。 */
export function clearLyricCache() {
  cache.clear()
}
