/*
 * 图库 API 探测 · booru probe
 * --------------------------
 * 找能直接拿到高清原图的图库。Danbooru / Konachan / yande.re 都有公开 API。
 *
 * 用法：node --use-system-ca lyric-overlay/tools/probe-booru.mjs
 */

const UA = 'dsh-research/1.0 (personal music player overlay)'

async function tryJson(label, url, pick) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    const text = await res.text()
    if (!res.ok) { console.log(`  ✗ ${label.padEnd(22)} HTTP ${res.status}`); return null }
    let j
    try { j = JSON.parse(text) } catch { console.log(`  ✗ ${label.padEnd(22)} 非 JSON（${text.length}B）`); return null }
    const items = Array.isArray(j) ? j : (j.posts ?? j.results ?? [])
    console.log(`  ✓ ${label.padEnd(22)} ${items.length} 条`)
    if (pick && items.length > 0) {
      const s = pick(items[0])
      console.log(`      样例：${s.w}x${s.h}  ${s.size}  ${s.url.slice(0, 100)}`)
    }
    return items
  } catch (e) {
    console.log(`  ✗ ${label.padEnd(22)} ${e.message.slice(0, 50)}`)
    return null
  }
}

const TAG = 'suzuran_(arknights)'

console.log('=== Danbooru ===')
await tryJson('posts.json', `https://danbooru.donmai.us/posts.json?tags=${encodeURIComponent(TAG)}&limit=5`,
  p => ({ w: p.image_width, h: p.image_height, size: p.file_size, url: p.file_url ?? p.large_file_url }))

console.log('\n=== Konachan ===')
await tryJson('post.json', `https://konachan.com/post.json?tags=${encodeURIComponent(TAG)}&limit=5`,
  p => ({ w: p.width, h: p.height, size: p.file_size, url: p.file_url }))

console.log('\n=== yande.re ===')
await tryJson('post.json', `https://yande.re/post.json?tags=${encodeURIComponent(TAG)}&limit=5`,
  p => ({ w: p.width, h: p.height, size: p.file_size, url: p.file_url }))

console.log('\n=== Safebooru ===')
await tryJson('post.json', `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(TAG)}&limit=5`,
  p => ({ w: p.width, h: p.height, size: p.file_size, url: p.image }))
