/*
 * 日志 · log.mjs
 * ------------
 * 同时写控制台和文件。
 *
 * 为什么要写文件：用 `Start-Process -WindowStyle Hidden` 后台启动时
 * stdout 拿不到，出问题只能靠文件回溯（这次排查就卡在这儿）。
 *
 * ⚠️ 注意：这个函数内部只能用 `console.log`，**不能**写成 `log(...)`，
 * 否则无限递归爆栈。之前我用脚本批量替换 `console.log(` → `log(`
 * 时就把这里也换了，整个应用静默启动失败，查了半天。
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const LOG_DIR = join(HERE, 'logs')
export const LOG_FILE = join(LOG_DIR, 'desktop.log')

try { mkdirSync(LOG_DIR, { recursive: true }) } catch { /* 忽略 */ }

/** 写一行日志（控制台 + 文件）。 */
export function log(...args) {
  const line = args
    .map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()))
    .join(' ')
  // ↓↓↓ 必须是 console.log，不是 log
  console.log(line)
  try { appendFileSync(LOG_FILE, '[' + new Date().toISOString() + '] ' + line + '\n') } catch { /* 忽略 */ }
}
