/*
 * 按语种拆分歌单并导出 · export-split.mjs
 * ------------------------------------
 * 把歌单按"中文 / 西文"拆成两份，导成可导入 QQ 音乐的文本。
 *
 * QQ 音乐的歌单导入认这种格式（一行一首）：
 *     歌名 - 歌手
 * 它会拿这个去曲库匹配。
 *
 * 顺带做的事：
 *   · 去重（同一首歌出现多次只留一首）
 *   · 过滤掉曲名里带"已下架""无版权"之类的脏数据
 *   · 导出 songmid 清单（如果以后想用脚本而不是手动导入）
 *
 * 用法：node --use-system-ca overlay/tools/export-split.mjs <歌单> [输出目录]
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const REF = 'https://y.qq.com/'

const get = async (url) => (await fetch(url, { headers: { 'User-Agent': UA, Referer: REF }, signal: AbortSignal.timeout(25000) })).json()

/* ── 字符集判定（和 stats 一致） ── */
function scriptOf(text) {
  const c = { korean: 0, kana: 0, han: 0, latin: 0, other: 0 }
  for (const ch of (text || '')) {
    const cp = ch.codePointAt(0)
    if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)) c.korean++
    else if ((cp >= 0x3040 && cp <= 0x309F) || (cp >= 0x30A0 && cp <= 0x30FF) || (cp >= 0x31F0 && cp <= 0x31FF)) c.kana++
    else if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF)) c.han++
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) || (cp >= 0xC0 && cp <= 0x24F)) c.latin++
    else if (cp > 0x7F && (cp < 0x2000 || cp > 0x3000)) c.other++
  }
  return c
}

/**
 * 三分类：中文 / 日韩 / 西文。
 *
 * 之前写成"是中文 → 中文，否则 → 西文"，结果**韩语日语歌全跑进西文**了。
 * 比如「펑펑울었어 (嚎哭) - Stellar (스텔라)」明明是韩语歌。
 * 所以单独分出日韩这一类，由调用方决定往哪边并。
 */
function langOf(name, singers) {
  const n = scriptOf(name), s = scriptOf(singers)
  const korean = n.korean + s.korean
  const kana = n.kana + s.kana
  const han = n.han + s.han

  if (korean > 0) return '韩语'
  if (kana > 0) return '日语'
  if (han > 0) return '中文'
  return '西文'
}

async function toDisstid(input) {
  const s = String(input).trim().replace(/^["']|["']$/g, '')
  if (/^\d+$/.test(s)) return s
  const d = /[?&](?:id|disstid)=(\d+)/.exec(s) ?? /playlist\/(\d+)/.exec(s)
  if (d) return d[1]
  const r = await fetch(s, { headers: { 'User-Agent': UA, Referer: REF }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  const m = /playlist\/(\d+)/.exec(r.url) ?? /[?&](?:id|disstid)=(\d+)/.exec(r.url)
  if (!m) throw new Error('解析不出歌单 id：' + r.url)
  return m[1]
}

/** 分页拉完整歌单。 */
async function fetchAll(disstid) {
  const all = []
  let meta = {}
  let page = 0
  while (true) {
    const j = await get(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${disstid}&format=json&song_begin=${page * 500}&song_num=500`)
    if (j.code !== 0 || !j.cdlist?.length) throw new Error(`code=${j.code}（可能限流，等 1 分钟再试）`)
    const cd = j.cdlist[0]
    meta = { name: cd.dissname, creator: cd.nickname, total: cd.songnum }
    const b = cd.songlist ?? []
    all.push(...b)
    process.stderr.write(`\r  拉取 ${all.length}/${meta.total}`)
    if (!b.length || all.length >= meta.total) break
    page++
    if (page > 40) break
    await new Promise(r => setTimeout(r, 400))
  }
  process.stderr.write('\n')
  return { meta, songs: all }
}

/* ── 主流程 ── */

const input = process.argv[2]
const outDir = process.argv[3] ?? join(process.env.USERPROFILE ?? '.', 'Desktop')

if (!input) {
  console.log('用法：node --use-system-ca overlay/tools/export-split.mjs <歌单> [输出目录]')
  console.log('  <歌单> 可以是纯数字 id、完整链接、或分享短链')
  process.exit(1)
}

const disstid = await toDisstid(input)
const { meta, songs: raw } = await fetchAll(disstid)

console.log(`\n《${meta.name}》  创建者：${meta.creator}  共 ${raw.length} 首\n`)

/* 归一化 + 去重 + 分类 */
const seen = new Set()
const buckets = { 中文: [], 日语: [], 韩语: [], 西文: [] }
const skipped = []

for (const s of raw) {
  const name = (s.songname ?? '').trim()
  const singers = Array.isArray(s.singer) ? s.singer.map(x => x.name).filter(Boolean).join('/') : ''
  const mid = (s.songmid ?? '').trim()
  const album = (s.albumname ?? '').trim()
  const interval = s.interval ?? 0

  if (!name) { skipped.push({ reason: '无曲名', name, singers }); continue }

  // 脏数据：明显是下架占位符
  if (/^(该歌曲|此歌曲|暂无)/.test(name)) { skipped.push({ reason: '占位符', name, singers }); continue }

  // 去重：曲名 + 歌手
  const key = (name + '|' + singers).toLowerCase().replace(/\s+/g, '')
  if (seen.has(key)) { skipped.push({ reason: '重复', name, singers }); continue }
  seen.add(key)

  buckets[langOf(name, singers)].push({ name, singers, album, mid, interval })
}

/*
 * 合并成几份。
 *
 * JPKR_TO 决定日韩（约 223 首）往哪去：
 *   'west' 并入西文    → 两份：中文 / 西文
 *   'cn'   并入中文    → 两份
 *   'own'  单独一份    → **三份：中文 / 西文 / 日韩** ← 当前选择
 *
 * 选 'own' 的理由：日语（初音未来、milet 那些）和韩语（T-ara、Brave Girls）
 * 跟歌单里的中文、西文风格明显不同，混在一起以后想找反而麻烦。
 */
const JPKR_TO = 'own'

const cn = [...buckets.中文]
const jpkr = [...buckets.日语, ...buckets.韩语]
const west = [...buckets.西文]

if (JPKR_TO === 'west') west.push(...jpkr)
else if (JPKR_TO === 'cn') cn.push(...jpkr)

/* 导出 */
mkdirSync(outDir, { recursive: true })
const safeName = meta.name.replace(/[\\/:*?"<>|]/g, '_')
const stamp = new Date().toISOString().slice(0, 10)

/** 生成"歌名 - 歌手"文本（QQ音乐导入格式）。 */
const toText = (list) => list.map(s => `${s.name} - ${s.singers}`).join('\n')

/** 生成 songmid 清单（备用）。 */
const toMids = (list) => list.map(s => `${s.mid}\t${s.name}\t${s.singers}`).join('\n')

const files = [
  [`${safeName}_中文_${cn.length}首_${stamp}.txt`, toText(cn)],
  [`${safeName}_西文_${west.length}首_${stamp}.txt`, toText(west)],
  [`${safeName}_中文_mid_${stamp}.txt`, toMids(cn)],
  [`${safeName}_西文_mid_${stamp}.txt`, toMids(west)],
]
if (JPKR_TO === 'own') {
  files.push([`${safeName}_日韩_${jpkr.length}首_${stamp}.txt`, toText(jpkr)])
  files.push([`${safeName}_日韩_mid_${stamp}.txt`, toMids(jpkr)])
}

console.log('════════ 分类明细 ════════\n')
console.log(`  中文        ${String(buckets.中文.length).padStart(5)} 首`)
console.log(`  ├ 日语      ${String(buckets.日语.length).padStart(5)} 首  ┐`)
console.log(`  └ 韩语      ${String(buckets.韩语.length).padStart(5)} 首  ┘ 合 ${jpkr.length} 首`)
console.log(`  西文        ${String(buckets.西文.length).padStart(5)} 首`)
console.log(`  跳过        ${String(skipped.length).padStart(5)} 首`)
console.log(`  ─────────────────────`)
console.log(`  原始合计    ${String(raw.length).padStart(5)} 首`)

console.log(`\n  日韩那 ${jpkr.length} 首：${JPKR_TO === 'west' ? '已并入「西文」' : JPKR_TO === 'cn' ? '已并入「中文」' : '单独出文件'}`)
console.log(`  （想改的话，脚本里改 JPKR_TO 常量）`)

console.log(`\n════════ 最终${JPKR_TO === 'own' ? '三' : '两'}份 ════════\n`)
console.log(`  中文  ${String(cn.length).padStart(5)} 首`)
if (JPKR_TO === 'own') console.log(`  日韩  ${String(jpkr.length).padStart(5)} 首`)
console.log(`  西文  ${String(west.length).padStart(5)} 首`)
console.log(`  ─────────────────`)
const finalTotal = cn.length + west.length + (JPKR_TO === 'own' ? jpkr.length : 0)
console.log(`  合计  ${String(finalTotal).padStart(5)} 首`)

if (skipped.length) {
  const byReason = {}
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1
  console.log(`\n  跳过原因：`)
  for (const [r, n] of Object.entries(byReason)) console.log(`    ${r}  ${n} 首`)
}

console.log(`\n════════ 已导出到 ${outDir} ════════\n`)
for (const [f, content] of files) {
  writeFileSync(join(outDir, f), content, 'utf8')
  const lines = content.split('\n').length
  console.log(`  ${f}`)
  console.log(`      ${lines} 行，${(Buffer.byteLength(content, 'utf8') / 1024).toFixed(0)} KB`)
}

console.log(`\n════════ 怎么用 ════════

QQ 音乐里新建歌单 → 导入外部歌单 → 选对应文件

格式是「歌名 - 歌手」，一行一首，QQ 音乐会自己去曲库匹配。
匹配不上的会被跳过（常见于翻唱、Live、冷门曲）。

mid 那两份是备用：每行「songmid \\t 歌名 \\t 歌手」，
以后如果想用脚本处理（而不是手动导入）会用到。
`)
