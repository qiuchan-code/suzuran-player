/*
 * e2e 诊断版 · probe-e2e2.mjs
 * 每一步都打印，定位链路断在哪
 *
 * 用法：electron probe-e2e2.mjs
 */

import { app, BrowserWindow, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay()
  const W = Math.max(d.bounds.width, d.workArea.width)
  const H = Math.max(d.bounds.height, d.workArea.height)

  log('① 开播放器窗口')
  const player = new BrowserWindow({
    width: Math.round(W * 0.55), height: Math.round(H * 0.55),
    x: 30, y: 30, show: true, title: 'E2E2-Player',
    webPreferences: { backgroundThrottling: false },
  })
  await player.loadURL('http://127.0.0.1:7790/player-ui.html')
  await sleep(4500)

  const readState = async () => JSON.parse(await player.webContents.executeJavaScript(
    `JSON.stringify({ tier: currentTierIndex(), dark: scheme === 'dark', state: document.getElementById('tState').textContent })`
  ))
  log('   初始:', JSON.stringify(await readState()))

  log('\n② 开悬浮条')
  const { createControlBar } = await import('../control-bar.mjs')
  const got = []
  const bar = await createControlBar({
    layout: { x: 260, y: 260, w: 680 },
    onTier: async (i) => {
      got.push('tier:' + i)
      log(`   >>> onTier(${i}) 触发`)
      const before = await readState()
      log(`       播放器当前 tier=${before.tier}`)
      await player.webContents.executeJavaScript(`setTier(${i}, true); true`)
      await sleep(400)
      const after = await readState()
      log(`       调用后 tier=${after.tier}  state=${after.state}`)
    },
    onTheme: async () => {
      got.push('theme')
      log('   >>> onTheme() 触发')
      const dark = await player.webContents.executeJavaScript(`scheme === 'dark'`)
      log(`       当前 dark=${dark}，切到 ${!dark}`)
      await player.webContents.executeJavaScript(`switchScheme('${dark ? 'light' : 'dark'}'); true`)
    },
  })
  log('   悬浮条已建')

  log('\n③ 先直接打一条 console.log 验证桥还活着')
  await bar.win.webContents.executeJavaScript(`console.log('ACTION:tier:1'); true`)
  await sleep(1000)
  log('   收到的事件:', got.join(', ') || '(无)')

  log('\n④ 查悬浮条页面内部状态')
  const inner = await bar.win.webContents.executeJavaScript(`
    (() => {
      const track = document.getElementById('track')
      const r = track.getBoundingClientRect()
      return JSON.stringify({
        hasTrack: !!track,
        trackRect: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height),
        innerW: innerWidth, innerH: innerHeight,
        thumbLeft: document.getElementById('thumb').style.left,
        dshTier: typeof window.dsh?.tier,
      })
    })()
  `)
  log('   ' + inner)

  log('\n⑤ 派发 pointer 事件到滑块')
  const dispatch = await bar.win.webContents.executeJavaScript(`
    (() => {
      const track = document.getElementById('track')
      const r = track.getBoundingClientRect()
      const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }
      const results = []
      try {
        track.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: r.left + 3, clientY: r.top + 4 }))
        results.push('down ok')
      } catch (e) { results.push('down ERR: ' + e.message) }
      try {
        track.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: r.left + 3, clientY: r.top + 4 }))
        results.push('up ok')
      } catch (e) { results.push('up ERR: ' + e.message) }
      return JSON.stringify(results)
    })()
  `)
  log('   派发结果: ' + dispatch)
  await sleep(1500)
  log('   收到的事件:', got.join(', ') || '(无)')
  log('   播放器状态:', JSON.stringify(await readState()))

  log('\n⑥ 点明暗按钮')
  await bar.win.webContents.executeJavaScript(`document.getElementById('theme').click(); true`)
  await sleep(1500)
  log('   收到的事件:', got.join(', ') || '(无)')
  log('   播放器状态:', JSON.stringify(await readState()))

  log('\n════ 汇总 ════')
  log('  收到: ' + (got.join(', ') || '(无)'))

  bar.destroy(); player.destroy()
  setTimeout(() => app.quit(), 800)
})

app.on('window-all-closed', () => app.quit())
