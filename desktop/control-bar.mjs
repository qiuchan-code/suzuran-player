/*
 * 悬浮控件条 · control-bar.mjs
 * --------------------------
 * 壁纸模式下，桌面壁纸层收不到鼠标事件（SHELLDLL_DefView 把事件全吃了），
 * 所以状态滑块和明暗切换点不到。这个悬浮条补上这两个功能。
 *
 * 关键技术：setIgnoreMouseEvents(true, { forward: true })
 *   让窗口浮在最上层但**鼠标事件穿透到下面的桌面**，
 *   只有真正落在控件上的点击才被吃掉。
 *   实测窗口扩展样式会带上 WS_EX_TRANSPARENT(0x20) + WS_EX_TOPMOST(0x8)。
 *
 * 位置：贴在歌曲封面上方那块空白（由 layout() 动态量取，不写死坐标）。
 *
 * 用法（一般由 main.mjs 调用）：
 *   import { createControlBar } from './control-bar.mjs'
 *   const bar = await createControlBar({ onTier, onTheme, getState })
 */

import { BrowserWindow } from 'electron'

const BAR_H = 56
const GAP = 14          // 悬浮条和封面之间的间隙

/** 悬浮条页面。 */
function barHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;background:transparent;
    font-family:'KN Maiyuan','Microsoft YaHei',sans-serif;-webkit-user-select:none;cursor:default}
  .wrap{display:flex;align-items:center;gap:16px;height:100%;padding:0 20px;
    background:rgba(255,252,253,.9);border-radius:16px;
    box-shadow:0 6px 26px rgba(150,80,110,.22),inset 0 0 0 1px rgba(255,255,255,.8);
    backdrop-filter:blur(16px)}
  /* 明暗切换 */
  .theme{width:34px;height:34px;flex:none;border-radius:50%;border:0;cursor:pointer;
    background:linear-gradient(140deg,#ffd8e2,#ffb3c6);color:#8a3350;
    font-size:16px;line-height:34px;text-align:center;
    transition:transform .16s cubic-bezier(.34,1.4,.64,1),background .3s}
  .theme:hover{transform:scale(1.1)}
  .theme:active{transform:scale(.94)}
  /* 档位滑块 */
  .field{position:relative;flex:1;min-width:0;padding-top:15px}
  .names{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;
    font-size:9px;letter-spacing:.05em;color:#b096a0;pointer-events:none}
  .names span{transition:color .25s,opacity .25s;opacity:.55}
  .names span.on{color:var(--c,#ef7d9a);opacity:1}
  .track{position:relative;height:8px;border-radius:99px;cursor:pointer;
    background:linear-gradient(90deg,#d24b5b 0%,#d24b5b 8%,#d99a3c 36%,#4a9e74 64%,#ef7d9a 92%,#ef7d9a 100%);
    box-shadow:inset 0 0 0 .5px rgba(0,0,0,.08),0 1px 4px rgba(0,0,0,.08)}
  /* 扩大命中区：视觉 8px，实际上下各 15px */
  .track::before{content:'';position:absolute;left:0;right:0;top:-15px;bottom:-15px;border-radius:99px}
  .thumb{position:absolute;top:50%;width:20px;height:20px;border-radius:50%;
    transform:translate(-50%,-50%);background:#fff;
    border:3.5px solid var(--c,#ef7d9a);
    box-shadow:0 2px 8px color-mix(in srgb,var(--c,#ef7d9a) 50%,transparent);
    pointer-events:none;
    transition:left .28s cubic-bezier(.34,1.4,.64,1),border-color .25s,box-shadow .25s}
  body.dragging .thumb{transition:border-color .25s,box-shadow .25s;width:24px;height:24px}
  /* 当前状态文字 */
  .cur{font-size:13px;font-weight:600;flex:none;min-width:60px;text-align:right;
    color:var(--c,#ef7d9a);transition:color .25s}
  /* 收起的态 */
  body.collapsed .field,body.collapsed .cur{display:none}
  body.collapsed .wrap{padding:0 14px;gap:0}
  </style></head><body>
  <div class="wrap">
    <button class="theme" id="theme" title="切换明暗">◐</button>
    <div class="field">
      <div class="names" id="names"></div>
      <div class="track" id="track"><div class="thumb" id="thumb"></div></div>
    </div>
    <span class="cur" id="cur">学习ing</span>
  </div>
  <script>
    const TIERS = ['luna','terra','sol','astra']
    const CN = ['睡觉ing','外出ing','娱乐ing','学习ing']
    const COLORS = ['#d24b5b','#d99a3c','#4a9e74','#ef7d9a']
    const track = document.getElementById('track')
    const thumb = document.getElementById('thumb')
    const cur = document.getElementById('cur')
    const names = document.getElementById('names')
    let idx = 3, dragging = false

    TIERS.forEach((t, i) => {
      const s = document.createElement('span')
      s.dataset.n = t; s.textContent = t
      names.appendChild(s)
    })

    function paint(i) {
      idx = Math.max(0, Math.min(TIERS.length - 1, i))
      document.body.style.setProperty('--c', COLORS[idx])
      thumb.style.left = (idx * 33.333).toFixed(2) + '%'
      cur.textContent = CN[idx]
      for (const s of names.children) s.classList.toggle('on', s.dataset.n === TIERS[idx])
    }

    function posToIdx(x) {
      const r = track.getBoundingClientRect()
      return Math.round((x - r.left) / r.width * (TIERS.length - 1))
    }

    /*
     * 上报给主进程。
     *
     * 页面 → 主进程只有一条通路：console.log('ACTION:xxx')，
     * 主进程监听 console-message 解析（见 createControlBar 里的注释）。
     *
     * ⚠️ 曾经写成 window.dsh?.tier(i) —— 但从来没人定义 window.dsh，
     * 而可选链 ?. 遇到 undefined 会**静默什么都不做**：不报错、没日志，
     * 表现就是"浮条能拖、滑块也动，但播放器毫无反应"，极难查。
     * 所以这里统一走 console，且不留可选链。
     *
     * ⚠️ 另外注意：这段代码在 JS 模板字符串里，
     * 注释和字符串里**不能出现反引号**，否则会把外层模板截断（踩过）。
     */
    function send(msg) {
      try { console.log(msg) } catch (e) { /* 忽略 */ }
    }

    track.addEventListener('pointerdown', e => {
      dragging = true
      document.body.classList.add('dragging')
      try { track.setPointerCapture(e.pointerId) } catch (err) { /* 合成事件不支持捕获，忽略 */ }
      const t = (e.clientX - track.getBoundingClientRect().left) / track.getBoundingClientRect().width * 100
      thumb.style.left = Math.max(0, Math.min(100, t)).toFixed(2) + '%'
    })
    track.addEventListener('pointermove', e => {
      if (!dragging) return
      const t = (e.clientX - track.getBoundingClientRect().left) / track.getBoundingClientRect().width * 100
      thumb.style.left = Math.max(0, Math.min(100, t)).toFixed(2) + '%'
    })
    track.addEventListener('pointerup', e => {
      if (!dragging) return
      dragging = false
      document.body.classList.remove('dragging')
      const i = posToIdx(e.clientX)
      paint(i)
      send('ACTION:tier:' + i)
    })
    track.addEventListener('pointercancel', () => {
      dragging = false
      document.body.classList.remove('dragging')
      paint(idx)
    })

    document.getElementById('theme').addEventListener('click', () => send('ACTION:theme'))

    // 主进程通过这些方法更新画面
    window.__setTier = (i) => paint(i)
    window.__setTheme = (dark) => {
      const b = document.getElementById('theme')
      b.textContent = dark ? '☀' : '◐'
      b.title = dark ? '切到亮色' : '切到暗色'
      document.querySelector('.wrap').style.background = dark
        ? 'rgba(38,32,38,.88)' : 'rgba(255,252,253,.9)'
      document.querySelector('.wrap').style.boxShadow = dark
        ? '0 6px 26px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.12)'
        : '0 6px 26px rgba(150,80,110,.22),inset 0 0 0 1px rgba(255,255,255,.8)'
      cur.style.color = dark ? '#f0b8c8' : COLORS[idx]
      document.getElementById('names').style.color = dark ? '#7a6872' : '#b096a0'
    }
    window.__setCollapsed = (v) => document.body.classList.toggle('collapsed', !!v)

    /*
     * 上报"光标是否压在控件上"，主进程据此切换鼠标穿透。
     *
     * 这里能收到 pointermove，是因为主进程开了 forward: true；
     * 如果当时处于"不穿透"状态，事件本来就能收到 —— 两种情况都覆盖到了。
     *
     * 判定用 elementFromPoint 找最上层元素，看它是不是控件本体。
     * 只有 .wrap 自身和它的子元素算"控件"，body/html 算空白。
     */
    let lastHit = null
    function reportHit(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const over = !!(el && el !== document.body && el !== document.documentElement)
      if (over === lastHit) return
      lastHit = over
      send('HIT:' + (over ? 1 : 0))
    }
    document.addEventListener('pointermove', reportHit, { passive: true })
    // 光标移出窗口时也要复位
    document.addEventListener('pointerleave', () => {
      if (lastHit !== false) { lastHit = false; send('HIT:0') }
    })

    paint(3)
  </script></body></html>`
}

/**
 * 创建悬浮控件条。
 *
 * @param {object} o
 * @param {(i:number)=>void} o.onTier  档位变化（0=luna … 3=astra）
 * @param {()=>void} o.onTheme         点了明暗按钮
 * @param {object} o.layout            { x, y, w, h } 由调用方量好传进来
 * @returns {Promise<{win: BrowserWindow, setState: Function, reposition: Function, setCollapsed: Function, destroy: Function}>}
 */
export async function createControlBar({ onTier, onTheme, layout }) {
  const win = new BrowserWindow({
    x: layout.x, y: layout.y, width: layout.w, height: BAR_H,
    frame: false,
    transparent: true,
    alwaysOnTop: false,      // 普通窗口层级，别压住全屏应用；靠 moveTop() 压住壁纸
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      // 页面里的按钮通过这个对象回调主进程
      preload: undefined,
    },
  })

  /*
   * 层级取舍（踩过两次）：
   *
   *   'screen-saver'  最高，压住一切 —— 用浏览器跟你对话时浮条盖在上面，太霸道
   *   'floating'      仍然带 WS_EX_TOPMOST，照样压住全屏窗口
   *   'normal'        ← 用这个：普通窗口层级，全屏应用能盖住它
   *
   * 但 'normal' 有个风险：壁纸窗口也是普通层级，谁在上只看 z-order。
   * 所以建好之后再 moveTop() 一次，把它压到壁纸上面。
   * 之后别的普通窗口盖过来就会盖住它 —— 这正是想要的行为。
   */
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(barHtml()))

  /*
   * 页面 → 主进程的回调桥。
   *
   * executeJavaScript 没法直接传函数进去，所以页面里统一用
   * 页面里统一用 console.log('ACTION:xxx') 上报，主进程监听 console-message 解析。
   *
   * ⚠️ Electron 版本差异（踩过）：
   *   旧签名：('console-message', (event, level, message, line, sourceId) => ...)
   *   新签名：('console-message', (event) => ...)  ← 消息在 event.message
   *   Electron 39 已经是新签名，旧写法里第 3 个参数是 undefined，
   *   于是整条桥静默失效（界面看着正常，但点了没反应）。
   *   这里两种都兼容。
   */
  win.webContents.on('console-message', (...args) => {
    // 新签名：第一个参数是对象且带 message
    let msg
    if (args[0] && typeof args[0] === 'object' && typeof args[0].message === 'string') {
      msg = args[0].message
    } else if (typeof args[2] === 'string') {
      msg = args[2]
    } else {
      return
    }
    if (msg.startsWith('ACTION:tier:')) {
      const i = Number(msg.slice('ACTION:tier:'.length))
      if (Number.isFinite(i)) onTier?.(i)
    } else if (msg === 'ACTION:theme') {
      onTheme?.()
    } else if (msg === 'HIT:1') {
      setClickable(true)      // 光标在控件上 → 接收点击
    } else if (msg === 'HIT:0') {
      setClickable(false)     // 光标在空白处 → 点击穿到桌面
    }
  })

  win.showInactive()

  /*
   * ★ 鼠标穿透 —— 必须是**动态**的，不能一开了之。
   *
   * 踩过的坑：一开始直接 `setIgnoreMouseEvents(true, {forward:true})` 了事，
   * 以为 "forward" 能两全。实际语义是：
   *   · 整个窗口**永久**不接收点击，点击全部穿到下面
   *   · forward 只是把**移动**事件转发进来（为了还能做 hover 效果）
   * 结果就是滑块和按钮全都点不动。
   *
   * 正确做法：按光标位置切换
   *   · 光标压到控件上 → setIgnoreMouseEvents(false)，让点击落到控件
   *   · 光标在空白/透明处 → setIgnoreMouseEvents(true, forward)，点击穿到桌面
   * 页面里监听 pointermove（靠 forward 才能收到），把结果用
   * console.log('HIT:1' / 'HIT:0') 上报。
   */
  let clickable = false
  const setClickable = (v) => {
    if (v === clickable) return
    clickable = v
    win.setIgnoreMouseEvents(!v, { forward: true })
  }
  win.setIgnoreMouseEvents(true, { forward: true })

  return {
    win,
    /** 同步外部状态到悬浮条。 */
    async setState({ tierIndex, dark }) {
      try {
        await win.webContents.executeJavaScript(
          `window.__setTier(${Number(tierIndex)}); window.__setTheme(${!!dark}); true`
        )
      } catch { /* 窗口可能已销毁 */ }
    },
    /** 重新定位（分辨率变化时）。 */
    reposition(l) {
      if (win.isDestroyed()) return
      win.setBounds({ x: l.x, y: l.y, width: l.w, height: BAR_H })
    },
    /** 收起 / 展开。 */
    async setCollapsed(v) {
      try { await win.webContents.executeJavaScript(`window.__setCollapsed(${!!v}); true`) } catch {}
    },
    /** 供主进程在解析 HIT 消息时调用。 */
    setClickable,
    /**
     * 提到普通窗口层级的最前面。
     * 壁纸挂到 WorkerW 之后会占据 z-order 较低的位置，
     * 调一次这个保证浮条压在壁纸上（但仍在普通层级，全屏应用能盖住它）。
     */
    raise() {
      if (win.isDestroyed()) return
      win.moveTop()
    },
    destroy() { if (!win.isDestroyed()) win.destroy() },
    BAR_H,
  }
}

export { BAR_H, GAP }
