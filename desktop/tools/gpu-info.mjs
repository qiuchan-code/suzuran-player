/*
 * 查 Electron 实际用的哪个 GPU · gpu-info.mjs
 * -----------------------------------------
 * 这台机器有核显（AMD 780M，512MB）和独显（RTX 4060，4GB）。
 * 壁纸默认跑在核显上，把它占满了。先确认现状，再想办法切到独显。
 *
 * 用法：electron gpu-info.mjs
 */

import { app, BrowserWindow } from 'electron'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 400, height: 300, show: false })

  log('════ app.getGPUInfo("basic") ════')
  try {
    const basic = await app.getGPUInfo('basic')
    log(JSON.stringify(basic, null, 1))
  } catch (e) {
    log('  失败: ' + e.message)
  }

  log('\n════ 页面里读 WebGL 的 renderer ════')
  await win.loadURL('data:text/html,<canvas id=c></canvas>')
  const info = await win.webContents.executeJavaScript(`
    (() => {
      const out = {}
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info')
        out.webglVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
        out.webglRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
        out.version = gl.getParameter(gl.VERSION)
      } else {
        out.error = '拿不到 WebGL 上下文'
      }
      return JSON.stringify(out, null, 1)
    })()
  `)
  log(info)

  log('\n════ app.getGPUFeatureStatus() ════')
  try {
    log(JSON.stringify(app.getGPUFeatureStatus(), null, 1))
  } catch (e) {
    log('  失败: ' + e.message)
  }

  log('\n════ 汇总 ════')
  const g = JSON.parse(info)
  const r = (g.webglRenderer || '') + ' | ' + (g.webglVendor || '')
  log('  渲染器: ' + r)
  if (/nvidia|geforce|rtx/i.test(r)) log('  ✓ 已经在独显上')
  else if (/amd|radeon|780m/i.test(r)) log('  ✗ 在核显（AMD 780M）上 —— 需要切到独显')
  else log('  ? 无法判断')

  win.destroy()
  setTimeout(() => app.quit(), 500)
})

app.on('window-all-closed', () => app.quit())
