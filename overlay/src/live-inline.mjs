/*
 * 内联 live.mjs · 供浏览器直接跑的代码块
 * ------------------------------------
 * 和 timer-inline.mjs 一个思路：源码是 ES module（可测），构建时剥掉 export
 * 关键字，包一层作用域塞进页面。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'live.mjs')

/** 返回可直接放进 <script> 的代码，结尾 return { createLive, fmtTime }。 */
export function liveModuleSource() {
  const raw = readFileSync(SRC, 'utf8')
  const body = raw
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
  return `${body}
return { createLive, fmtTime }`
}
