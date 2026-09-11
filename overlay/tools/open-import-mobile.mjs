/*
 * 用移动端 UA 打开歌单导入页 · open-import-mobile.mjs
 * -------------------------------------------------
 * 桌面版没有导入入口（/n/ryqq/import → notfound）。
 * 你截图那个「歌单导入」是手机版页面，要走移动端 UA。
 *
 * 这个脚本：
 *   1. 用 CDP 把 UA 设成手机
 *   2. 打开移动版导入页
 *   3. 报告页面结构（找粘贴框和导入按钮）
 *
 * 用法：node --use-system-ca overlay/tools/open-import-mobile.mjs [url]
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** 候选 URL —— 从你截图看是「歌单导入」，逐个试。 */
const CANDIDATES = [
  'https://y.qq.com/n/ryqq_v2/importSong',
  'https://y.qq.com/n/ryqq_v2/import',
  'https://y.qq.com/n/ryqq_v2/transferSong',
  'https://y.qq.com/n/ryqq_v2/songImport',
  'https://i.y.qq.com/n2/m/import/index.html',
  'https://i.y.qq.com/n2/m/transfer/index.html',
  'https://y.qq.com/m/import/index.html',
]

const target = process.argv[2] ?? CANDIDATES[0]
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
if (!page) throw new Error('没有 y.qq.com 页面')

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
  pending.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 60000)
})
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
  return r.result.value
}

/* 设成手机 + 手机尺寸 */
await send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA })
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
})

/** 打开一个候选 URL 并看结果。 */
async function tryUrl(url) {
  await send('Page.enable')
  await send('Page.navigate', { url })
  await sleep(6500)
  const info = JSON.parse(await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input, textarea, [contenteditable]')].map(e => {
      const r = e.getBoundingClientRect()
      return { tag: e.tagName.toLowerCase(), ph: e.placeholder || '', cls: String(e.className).slice(0,50),
               rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
    })
    const btns = [...document.querySelectorAll('button, div, a, span')]
      .filter(e => /导入|粘贴|确定|提交/.test((e.textContent||'').trim()) && (e.textContent||'').trim().length <= 12)
      .slice(0, 6)
      .map(e => ({ tag: e.tagName.toLowerCase(), text: (e.textContent||'').trim(), cls: String(e.className).slice(0,50) }))
    return JSON.stringify({
      url: location.href,
      title: document.title.slice(0, 50),
      bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 220),
      inputs, buttons: btns,
    }, null, 1)
  })()`))
  return info
}

console.log(`用移动端 UA 试：${target}\n`)
const info = await tryUrl(target)
console.log(JSON.stringify(info, null, 1))

const looksRight = /导入/.test(info.bodyText) && info.inputs.length > 0
if (looksRight) {
  console.log('\n✓ 看起来就是导入页')
} else {
  console.log('\n✗ 不是导入页，试其他候选…\n')
  for (const u of CANDIDATES.slice(1)) {
    const i = await tryUrl(u)
    const ok = /导入/.test(i.bodyText) && i.inputs.length > 0
    console.log(`${ok ? '✓' : '✗'} ${u}`)
    console.log(`    → ${i.url}`)
    console.log(`    ${i.bodyText.slice(0, 120)}`)
    if (ok) {
      console.log('\n找到了！结构：')
      console.log(JSON.stringify({ inputs: i.inputs, buttons: i.buttons }, null, 1))
      break
    }
    await sleep(500)
  }
}

close()
process.exit(0)
