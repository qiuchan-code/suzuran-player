/*
 * 在浏览器上下文里探测 QQ 音乐接口 · probe-qq-api.mjs
 * ------------------------------------------------
 * 为什么不抓包：加歌的 POST 走的是 keepalive / Service Worker，
 * CDP 的 Network 域抓不全，试了两次都没抓到。
 *
 * 改成直接在 y.qq.com 页面里 fetch —— 同源、自动带 cookie、
 * 而且**能看到请求和响应的完整内容**，迭代快得多。
 *
 * 用法：node --use-system-ca overlay/tools/probe-qq-api.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  let page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!page) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?https://y.qq.com/`, { method: 'PUT' })
    page = await r.json()
    await new Promise(r => setTimeout(r, 4000))
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  let id = 1
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) } }
  })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = id++
    pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result))
    ws.send(JSON.stringify({ id: n, method, params }))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 40000)
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
    return r.result.value
  }
  return { ws, evalJs, close: () => ws.close() }
}

const { ws, evalJs, close } = await connect()

/** 在页面里 fetch 并把结果带回来。 */
async function call(url, opts = {}) {
  const expr = `(async () => {
    try {
      const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify({ credentials: 'include', ...opts })})
      const text = await r.text()
      return JSON.stringify({ status: r.status, len: text.length, body: text.slice(0, ${opts.__cut ?? 700}) })
    } catch (e) { return JSON.stringify({ error: String(e) }) }
  })()`
  const raw = await evalJs(expr)
  try { return JSON.parse(raw) } catch { return { raw } }
}

const NEW_PLAYLISTS = {
  Chinese: { dirId: 13, tid: 9777202419 },
  English: { dirId: 14, tid: 9777202653 },
  others: { dirId: 15, tid: 9777202742 },
}

console.log('════════ ① 确认「晴天」加进去没有 ════════\n')
for (const [name, p] of Object.entries(NEW_PLAYLISTS)) {
  const r = await call(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${p.tid}&format=json`, { __cut: 3000 })
  try {
    const j = JSON.parse(r.body)
    const cd = j.cdlist?.[0]
    const songs = cd?.songlist ?? []
    console.log(`  ${name.padEnd(9)} tid=${p.tid}  曲目 ${cd?.songnum ?? '?'}`)
    for (const s of songs.slice(0, 3)) {
      console.log(`      ${s.songname} — ${(s.singer ?? []).map(x => x.name).join('/')}   mid=${s.songmid}`)
    }
  } catch {
    console.log(`  ${name.padEnd(9)} 解析失败: ${r.body?.slice(0, 120)}`)
  }
}

console.log('\n════════ ② 探测「加歌」接口（用 Chinese 试，加一首已知的歌）════════\n')

/* 拿一首已知的歌当试验品：用搜索拿个 mid，避免手写错 */
const searchRaw = await call(
  'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=1&w=' + encodeURIComponent('晴天 周杰伦'),
  { __cut: 4000 }
)
let testMid = '0039MnYb0qxYhV'   // 晴天（周杰伦）—— 已知 mid，作为兜底
try {
  const sj = JSON.parse(searchRaw.body)
  const s0 = sj.data?.song?.list?.[0]
  if (s0?.songmid) testMid = s0.songmid
  console.log(`  试验用歌曲：${s0?.songname ?? '?'} — ${(s0?.singer ?? []).map(x => x.name).join('/')}  mid=${testMid}`)
} catch {
  console.log(`  搜索解析失败，用兜底 mid=${testMid}`)
}

/* 试探几种可能的接口形态 */
const candidates = [
  {
    name: 'A. musicu / PlaylistWrite.AddSongToPlaylist (dirId)',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'music.musicasset.PlaylistWrite',
        method: 'AddSongToPlaylist',
        param: { dirId: NEW_PLAYLISTS.Chinese.dirId, v_songInfo: [{ songMid: testMid, songType: 0 }] },
      },
    })),
  },
  {
    name: 'B. musicu / PlaylistDetailServer.AddSong (tid)',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'music.musicasset.PlaylistDetailServer',
        method: 'AddSong',
        param: { tid: NEW_PLAYLISTS.Chinese.tid, songMid: [testMid] },
      },
    })),
  },
  {
    name: 'C. 老 fcg / fcg_add_song_to_diss (dirid + songmid)',
    url: 'https://c.y.qq.com/qzone/fcg-bin/fcg_add_song_to_diss.fcg?format=json&dirid=' + NEW_PLAYLISTS.Chinese.dirId + '&songmid=' + testMid,
  },
  {
    name: 'D. musicu / PlaylistWrite.AddSongToPlaylist (tid + songMid 数组)',
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: {
        module: 'music.musicasset.PlaylistWrite',
        method: 'AddSongToPlaylist',
        param: { tid: NEW_PLAYLISTS.Chinese.tid, songMid: [testMid], songType: [0] },
      },
    })),
  },
]

for (const c of candidates) {
  const r = await call(c.url, { __cut: 500 })
  console.log(`── ${c.name}`)
  console.log(`   HTTP ${r.status ?? '-'}   ${r.body ?? r.error ?? r.raw}`)
  console.log('')
  await new Promise(r => setTimeout(r, 800))   // 别打太急
}

console.log('════════ ③ 加完再查一次歌单，看哪条生效了 ════════\n')
await new Promise(r => setTimeout(r, 2000))
const after = await call(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${NEW_PLAYLISTS.Chinese.tid}&format=json`, { __cut: 3000 })
try {
  const j = JSON.parse(after.body)
  const cd = j.cdlist?.[0]
  console.log(`  Chinese 现在 ${cd?.songnum ?? '?'} 首：`)
  for (const s of (cd?.songlist ?? []).slice(0, 5)) {
    console.log(`      ${s.songname} — ${(s.singer ?? []).map(x => x.name).join('/')}`)
  }
  const n = cd?.songnum ?? 0
  console.log(n > 1 ? `\n  ✓ 有接口生效了（从 1 首变成 ${n} 首）` : '\n  ✗ 都没生效，得继续找接口')
} catch {
  console.log('  解析失败: ' + after.body?.slice(0, 200))
}

close()
process.exit(0)
