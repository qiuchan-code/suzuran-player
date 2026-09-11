/*
 * 测试官方导入页 · test-import.mjs
 * ------------------------------
 * 页面：https://y.qq.com/y/static/mymusic/songlist_import.html
 * 结构：
 *   textarea#id_songtext   ← 粘贴歌曲文本
 *   按钮「匹配歌曲」         ← 点了之后去曲库匹配
 *
 * 这一版只粘 20 首测试，验证：
 *   1. textarea 能不能通过 CDP 填进去
 *   2. 「匹配歌曲」点了之后有没有反应
 *   3. 匹配结果长什么样
 *
 * 用法：node --use-system-ca overlay/tools/test-import.mjs [行数]
 */

import { readFileSync } from 'node:fs'

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)
const N = Number(process.argv[2] ?? 20)
const FILE = process.argv[3] ?? 'C:\\Users\\56851\\Desktop\\歌单拆分\\素材_中文_3063首_2026-09-11.txt'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/* 读清单前 N 行 */
const lines = readFileSync(FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
const sample = lines.slice(0, N)
console.log(`从 ${FILE.split('\\').pop()} 取前 ${sample.length} 首：`)
for (const l of sample.slice(0, 5)) console.log('  ' + l)
if (sample.length > 5) console.log(`  …（共 ${sample.length} 首）`)

const text = sample.join('\n')
console.log(`\n待粘贴文本：${text.length} 字符\n`)

/* 连页面 */
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const page = list.find(t => t.type === 'page' && /songlist_import/.test(t.url))
if (!page) throw new Error('导入页没开着。先跑：\n  node --use-system-ca overlay/tools/inspect-import.mjs --nav "https://y.qq.com/y/static/mymusic/songlist_import.html"')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let id = 1
const pending = new Map()
const errors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push((m.params.exceptionDetails?.exception?.description ?? '').split('\n')[0])
  }
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

await send('Runtime.enable')

/* ① 把 textarea 前的 "导入虾米音乐库" 标签页切到"酷狗"试试（说不定别的方式更宽松）*/
console.log('════════ ① 看有几个标签页 ════════\n')
console.log(await evalJs(`(() => {
  return JSON.stringify([...document.querySelectorAll('a[id^=tab_]')].map(a => ({
    id: a.id, text: (a.innerText||'').trim(), cls: a.className,
  })), null, 1)
})()`))

/* ② 填 textarea —— 用原生 setter + 触发 input 事件（兼容 React/Vue 受控组件）*/
console.log('\n════════ ② 往 textarea 填内容 ════════\n')
const filled = await evalJs(`(() => {
  const ta = document.getElementById('id_songtext')
  if (!ta) return 'no textarea'
  const text = ${JSON.stringify(text)}
  // 受控组件要用原生 setter，直接赋 value 有时不触发框架的 onChange
  const proto = Object.getPrototypeOf(ta)
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(ta, text); else ta.value = text
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.dispatchEvent(new Event('change', { bubbles: true }))
  return JSON.stringify({ len: ta.value.length, head: ta.value.slice(0, 40) })
})()`)
console.log('  ' + filled)

await sleep(600)

/* ③ 找「匹配歌曲」按钮并点它 */
console.log('\n════════ ③ 找「匹配歌曲」按钮 ════════\n')
const btnInfo = await evalJs(`(() => {
  const cands = [...document.querySelectorAll('a, button, input[type=button], input[type=submit], [class*=btn]')]
    .filter(e => /匹配歌曲|匹配/.test((e.innerText || e.value || '').trim()))
  return JSON.stringify(cands.map(e => {
    const r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(), id: e.id || '', cls: String(e.className).slice(0,50),
      text: ((e.innerText || e.value || '') + '').trim().slice(0, 20),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      visible: r.width > 0 && r.height > 0,
    }
  }), null, 1)
})()`)
console.log(btnInfo)

/* 用真实鼠标点击（比 click() 可靠，能过框架的事件系统）*/
const btns = JSON.parse(btnInfo)
const target = btns.find(b => b.visible) ?? btns[0]
if (target && target.rect[2] > 0) {
  const cx = Math.round(target.rect[0] + target.rect[2] / 2)
  const cy = Math.round(target.rect[1] + target.rect[3] / 2)
  console.log(`\n在 (${cx}, ${cy}) 真实点击「${target.text}」…`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none' })
  await sleep(100)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 })
  await sleep(80)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 })
} else {
  console.log('\n按钮不可见，试直接 dispatchEvent')
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('a,button')].find(e => /匹配/.test(e.innerText||''))
    if (b) { b.click(); return 'clicked' } return 'not found'
  })()`)
}

/* ④ 等结果 */
console.log('\n════════ ④ 等匹配结果（最多 40 秒）════════\n')
let last = ''
for (let i = 1; i <= 20; i++) {
  await sleep(2000)
  const st = await evalJs(`(() => {
    const body = (document.body.innerText || '')
    // 找结果区
    const hits = [...document.querySelectorAll('[class*=result], [class*=match], [class*=list] li, .xiami__result')]
      .map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 6)
    return JSON.stringify({
      url: location.href,
      tail: body.slice(-400).replace(/\\n{2,}/g, ' | '),
      hits,
    })
  })()`)
  if (st !== last) {
    console.log(`  [${i * 2}s] ${st.slice(0, 500)}`)
    last = st
  }
  if (/匹配完成|识别|首歌曲|选择|导入歌单/.test(st) && i > 3) {
    console.log('  （看起来出结果了）')
    break
  }
}

if (errors.length) {
  console.log('\n页面异常：')
  for (const e of errors.slice(0, 5)) console.log('  ' + e)
}

console.log('\n════════ 结论 ════════')
console.log('  看 Edge 窗口：应该显示匹配出的歌曲列表。')
console.log('  如果有列表 → 说明这条路通，我写批量脚本。')

ws.close()
process.exit(0)
