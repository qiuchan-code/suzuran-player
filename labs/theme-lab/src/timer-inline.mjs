/*
 * 计时器模块 · 供浏览器内联使用
 * ----------------------------
 * 源码是 theme-lab/src/timer.mjs（纯逻辑、可测）。构建时把 export 关键字剥掉、
 * 在页面里包一层作用域，即可直接跑——不用打包器。
 *
 * 用法（构建脚本里）：
 *   import { timerModuleSource } from './src/timer-inline.mjs'
 *   <script>${timerModuleSource()}</script>
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'timer.mjs')

/**
 * 把 timer.mjs 变成可直接塞进 <script> 的代码块。
 * 结尾返回 { createTimer, formatDuration, formatDate, formatClockMark }。
 */
export function timerModuleSource() {
  const raw = readFileSync(SRC, 'utf8')
  const body = raw
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
  return `${body}
return { createTimer, formatDuration, formatDate, formatClockMark }`
}
