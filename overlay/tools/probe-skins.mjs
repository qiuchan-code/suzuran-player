/*
 * 探测铃兰的所有立绘文件 · probe suzuran skins
 * -----------------------------------------
 * GitHub contents API 分页不可靠（12000 个文件漏了 lisa），
 * 所以直接按鹰角命名规律拼 URL 逐个 HEAD 探测。
 *
 * 用法：node --use-system-ca lyric-overlay/tools/probe-skins.mjs
 */

const BASE = 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/charpack'

/** 鹰角皮肤后缀：_1 基础、_2 精二，其余是皮肤代号。 */
const SUFFIXES = [
  '1', '1+', '2', '2+',
  'epoque_1', 'epoque_2', 'epoque_3', 'epoque_4', 'epoque_5', 'epoque_6',
  'epoque_7', 'epoque_8', 'epoque_9', 'epoque_10', 'epoque_11', 'epoque_12',
  'epoque_13', 'epoque_14', 'epoque_15', 'epoque_16', 'epoque_17', 'epoque_18',
  'epoque_19', 'epoque_20', 'epoque_21', 'epoque_22', 'epoque_23', 'epoque_24',
  'epoque_25', 'epoque_26', 'epoque_27', 'epoque_28', 'epoque_29', 'epoque_30',
  'winter_1', 'winter_2', 'winter_3', 'winter_4', 'winter_5',
  'sale_1', 'sale_2', 'sale_3', 'sale_4', 'sale_5', 'sale_6', 'sale_7', 'sale_8',
  'sale_9', 'sale_10', 'sale_11', 'sale_12', 'sale_13', 'sale_14', 'sale_15',
  'sale_16', 'sale_17', 'sale_18', 'sale_19', 'sale_20', 'sale_21', 'sale_22',
  'sale_23', 'sale_24', 'sale_25', 'sale_26', 'sale_27', 'sale_28', 'sale_29', 'sale_30',
  'wild_1', 'wild_2', 'wild_3', 'wild_4', 'wild_5', 'wild_6', 'wild_7', 'wild_8',
  'lxh_1', 'lxh_2',
  'boc_1', 'boc_2', 'boc_3', 'boc_4', 'boc_5', 'boc_6',
  'nian_1', 'nian_2', 'nian_3', 'nian_4', 'nian_5',
  'obsidian_1', 'obsidian_2', 'obsidian_3',
  'cc_1', 'cc_2', 'cc_3', 'cc_4', 'cc_5', 'cc_6', 'cc_7', 'cc_8', 'cc_9', 'cc_10',
  'ita_1', 'ita_2', 'ita_3',
  'sd_1', 'sd_2', 'sd_3', 'sd_4', 'sd_5',
  'rg_1', 'rg_2', 'rg_3',
  'ghost_1', 'ghost_2',
  'slow_1', 'slow_2',
  'street_1', 'street_2',
  'campus_1', 'campus_2',
  'trial_1', 'trial_2',
  'test_1',
]

/** 带 b 后缀的是"背面/另一形态"（比如精二的动态拆层），也探一下。 */
const found = []
let checked = 0

/** 并发探测（限速，避免被 GitHub 拒）。 */
async function head(name) {
  checked++
  try {
    const res = await fetch(`${BASE}/${name}`, { method: 'HEAD', headers: { 'User-Agent': 'dsh-research' } })
    if (res.ok) {
      found.push({ name, size: Number(res.headers.get('content-length') ?? 0) })
      return true
    }
  } catch { /* 忽略 */ }
  return false
}

const CONCURRENCY = 6
const queue = []
for (const s of SUFFIXES) {
  queue.push(`char_358_lisa_${s}.png`)
  queue.push(`char_358_lisa_${s}b.png`)
}

console.log(`探测 ${queue.length} 个可能的文件名（并发 ${CONCURRENCY}）...`)
let i = 0
async function worker() {
  while (i < queue.length) {
    const idx = i++
    await head(queue[idx])
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

console.log(`\n检查了 ${checked} 个，找到 ${found.length} 个：`)
for (const f of found.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${(f.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${f.name}`)
}
