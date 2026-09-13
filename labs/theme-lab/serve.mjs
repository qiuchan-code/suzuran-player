/*
 * 极简静态服务 · 给字体样张 / 播放器界面用
 * --------------------------------------
 * file:// 下 Chrome 会拦 fetch / 字体 / 视频请求，所以样张走 http://。
 *
 * 额外功能：把 /api/* 反向代理到歌词服务（默认本机 7788）。
 * 这样播放器界面和歌词接口同源，不用处理跨域，一个地址就能用。
 *
 * 用法：node theme-lab/serve.mjs [port] [rootDir] [apiTarget]
 *   例：node theme-lab/serve.mjs 7790 D:\deepseek_harness\theme-lab http://127.0.0.1:7788
 */

import { createServer, request as httpRequest } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] ?? 7790)
const root = resolve(process.argv[3] ?? HERE)
/** 歌词服务地址；/api/* 的请求转发到这里。 */
const apiTarget = process.argv[4] ?? 'http://127.0.0.1:7788'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

/** 把请求原样转发到歌词服务（含 SSE，不能缓冲）。 */
function proxy(req, res) {
  const target = new URL(apiTarget)
  const upstream = httpRequest({
    hostname: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers)
    up.pipe(res)          // 流式转发，SSE 才能实时到达
  })
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end('歌词服务不可达：' + String(err.message ?? err))
  })
  req.pipe(upstream)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  // /api/* → 歌词服务
  if (url.pathname.startsWith('/api/')) { proxy(req, res); return }

  try {
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    const target = join(root, normalize(pathname).replace(/^([/\\])+/, ''))
    if (!target.startsWith(root)) { res.writeHead(403).end('forbidden'); return }
    const info = await stat(target)
    if (!info.isFile()) { res.writeHead(404).end('not found'); return }
    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      // 字体跨源加载需要，虽然同源其实不需要，加上更保险
      'access-control-allow-origin': '*',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.message ?? err))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`静态服务：http://127.0.0.1:${port}/  (root=${root})`)
  console.log(`API 代理：/api/* → ${apiTarget}`)
})
