/*
 * CDP 截图辅助 · shot helper
 * -------------------------
 * 踩过的坑：Page.captureScreenshot 默认 captureBeyondViewport: true，
 * 传 clip 时 Chrome 会去"视口之外"取图，坐标解释方式随之改变，
 * 结果截出一堆尺寸不对的小长条（用户发现我给的验证图有的是小竖条/小横条）。
 *
 * 这里统一：
 *   · 显式关掉 captureBeyondViewport
 *   · clip 先按视口尺寸夹紧，越界就报错而不是默默截错
 *
 * 用法：
 *   import { makeShot } from './cdp-shot.mjs'
 *   const shot = makeShot(call)                       // call = (method, params) => Promise
 *   await shot.file('out.png')                        // 整屏
 *   await shot.file('out.png', { clip: {...} })       // 指定区域（会校验）
 *   await shot.ofElement('out.png', '.left')          // 按元素截图
 */

import { writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * @param {(method: string, params?: object) => Promise<any>} call
 * @param {{width: number, height: number}} viewport
 */
export function makeShot(call, viewport) {
  /** 取当前视口尺寸（优先用实际值，回退到设定的）。 */
  async function currentViewport() {
    try {
      const r = await call('Runtime.evaluate', {
        expression: 'JSON.stringify({w: innerWidth, h: innerHeight})',
        returnByValue: true,
      })
      const v = JSON.parse(r.result.value)
      if (v.w > 0 && v.h > 0) return v
    } catch { /* 忽略，用回退值 */ }
    return viewport
  }

  /**
   * 截一张图。
   * @param {string} out 输出路径
   * @param {{clip?: {x:number,y:number,width:number,height:number,scale?:number}}} [opts]
   */
  async function file(out, opts = {}) {
    const params = { format: 'png', captureBeyondViewport: false }
    if (opts.clip) {
      const vp = await currentViewport()
      const c = opts.clip
      // 夹紧到视口内——越界会让 Chrome 改变解释方式，截出错位的条
      const x = Math.max(0, Math.min(c.x, Math.max(0, vp.w - 1)))
      const y = Math.max(0, Math.min(c.y, Math.max(0, vp.h - 1)))
      const width = Math.max(1, Math.min(c.width, vp.w - x))
      const height = Math.max(1, Math.min(c.height, vp.h - y))
      if (c.x + c.width > vp.w + 1 || c.y + c.height > vp.h + 1) {
        console.warn(`  [shot] clip 越出视口，已夹紧：请求 ${c.x},${c.y} ${c.width}x${c.height} → 实际 ${x},${y} ${width}x${height}（视口 ${vp.w}x${vp.h}）`)
      }
      params.clip = { x, y, width, height, scale: c.scale ?? 1 }
    }
    const shot = await call('Page.captureScreenshot', params)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    return out
  }

  /** 按元素位置截图（元素需已在视口内，内部会先 scrollIntoView）。 */
  async function ofElement(out, selector, scale = 2) {
    await call('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center', inline: 'center' })`,
    })
    await new Promise(r => setTimeout(r, 400))
    const r = await call('Runtime.evaluate', {
      expression: `(() => {
        const e = document.querySelector(${JSON.stringify(selector)})
        if (!e) return 'null'
        const b = e.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) })
      })()`,
      returnByValue: true,
    })
    if (r.result.value === 'null') throw new Error(`找不到元素：${selector}`)
    const b = JSON.parse(r.result.value)
    return file(out, { clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale } })
  }

  return { file, ofElement }
}
