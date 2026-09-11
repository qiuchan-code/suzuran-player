/*
 * 读壁纸界面上实际显示的歌名 · probe-wallpaper-dom.mjs
 * -------------------------------------------------
 * 服务崩了再起来之后，壁纸到底有没有重连？光看日志看不出来
 * （日志里根本没报错，只是收不到新帧）。
 *
 * 办法：拿 Wallpaper Engine 那种思路不行 —— 得直接问那个 Electron 的渲染进程。
 * 用 --remote-debugging-port 起壁纸就能连；没起的话就只能比对"接口返回"
 * 和"界面上显示的"是否一致。
 *
 * 用法：
 *   node --use-system-ca desktop/tools/probe-wallpaper-dom.mjs [调试端口]
 */

const PORT = Number(process.argv[2] ?? 9333)

/** 拿接口里的当前曲目。 */
async function apiTrack() {
  try {
    const j = await (await fetch('http://127.0.0.1:7788/api/state', { signal: AbortSignal.timeout(5000) })).json()
    return j.track ? `${j.track.title} — ${j.track.artist}` : '(无)'
  } catch (e) { return '(接口不通: ' + e.message + ')' }
}

console.log('接口返回：' + await apiTrack())

/* 试连 CDP */
try {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  const page = list.find(t => t.type === 'page' && /player-ui/.test(t.url))
  if (!page) {
    console.log(`\n调试端口 ${PORT} 上没有 player-ui 页面。现有：`)
    for (const t of list) console.log('  ' + t.url.slice(0, 90))
    process.exit(1)
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  let id = 1
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) } }
  })
  const evalJs = (expr) => new Promise((res, rej) => {
    const n = id++
    pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result.result.value))
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error('超时')) } }, 15000)
  })

  const dom = await evalJs(`JSON.stringify({
    title: document.getElementById('trackTitle')?.textContent,
    artist: document.getElementById('trackArtist')?.textContent,
    state: document.getElementById('tState')?.textContent,
    lyric: document.getElementById('lyNow')?.textContent,
    staleSec: typeof liveSeenAt !== 'undefined' ? Math.round((Date.now() - liveSeenAt)/1000) : null,
  })`)

  console.log('\n界面上显示：')
  const d = JSON.parse(dom)
  console.log(`  歌名：${d.title}`)
  console.log(`  歌手：${d.artist}`)
  console.log(`  状态：${d.state}`)
  console.log(`  歌词：${d.lyric}`)
  console.log(`  距上次收到数据：${d.staleSec} 秒前`)

  console.log('\n判读：')
  if (d.staleSec !== null && d.staleSec < 5) console.log('  ✓ 界面数据是新鲜的（看护正常工作）')
  else if (d.staleSec !== null) console.log(`  ⚠ 界面数据已经 ${d.staleSec} 秒没更新了`)
  else console.log('  ? 读不到 liveSeenAt（页面可能是旧版本）')

  ws.close()
} catch (e) {
  console.log(`\n连不上调试端口 ${PORT}：${e.message}`)
  console.log('\n壁纸不是用调试端口起的。想用这个脚本，得这样启动：')
  console.log('  在 desktop/main.mjs 里加一行（或临时用手动命令）：')
  console.log('    npx electron . --remote-debugging-port=9333')
  console.log('\n或者直接看壁纸界面：歌名有没有跟着 QQ 音乐变。')
}
