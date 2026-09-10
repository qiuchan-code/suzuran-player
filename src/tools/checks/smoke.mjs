/*
 * 冒烟测试 · smoke.mjs
 * 检查服务是否起来、接口是否通、页面关键元素是否都在。
 * 用法：node src/tools/smoke.mjs
 */

const UI = 'http://127.0.0.1:7790'
const API = 'http://127.0.0.1:7788'

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`) }
}

console.log('=== 服务 ===')
for (const [label, url] of [['歌词服务 :7788', API + '/api/state'], ['界面服务 :7790', UI + '/player-ui.html']]) {
  try {
    const r = await fetch(url)
    ok(label, r.ok, 'HTTP ' + r.status)
  } catch (e) {
    ok(label, false, String(e.message).slice(0, 50))
  }
}

console.log('\n=== 接口 ===')
try {
  const j = await (await fetch(API + '/api/state')).json()
  ok('有 track 字段', 'track' in j)
  ok('有 kind 字段', typeof j.kind === 'string', j.kind)
  ok('有 lines 数组', Array.isArray(j.lines), typeof j.lines)
  ok('有 coverUrl 字段', 'coverUrl' in j)
  ok('track 有歌名', j.track === null || typeof j.track.title === 'string')
  console.log(`     当前：${j.track ? j.track.title + ' - ' + j.track.artist : '(无)'}  kind=${j.kind} lines=${j.lines.length}`)
} catch (e) { ok('接口可解析', false, e.message) }

console.log('\n=== CORS ===')
try {
  const r = await fetch(API + '/api/state')
  ok('access-control-allow-origin', r.headers.get('access-control-allow-origin') === '*', String(r.headers.get('access-control-allow-origin')))
} catch { ok('CORS', false) }

console.log('\n=== 代理（界面同源访问接口）===')
try {
  const r = await fetch(UI + '/api/state')
  ok('/api/state 经代理可用', r.ok, 'HTTP ' + r.status)
} catch (e) { ok('/api/state 经代理可用', false, e.message) }

console.log('\n=== 页面元素 ===')
const html = await (await fetch(UI + '/player-ui.html')).text()
// 界面上**应该有**的关键元素
for (const id of ['viz', 'mascot', 'barFill', 'barKnob', 'tState', 'tTime', 'tDate', 'tMark',
  'lyNow', 'lyPrev', 'lyNext', 'coverImg', 'stateSlider', 'ssTrack', 'ssThumb',
  'fx', 'reveal', 'hero', 'heroArt', 'bgDay', 'bgNight']) {
  ok(`id="${id}"`, html.includes(`id="${id}"`))
}
// 这些是**故意移除**的（设置面板、齿轮、素柔满、背景动效开关），存在反而是回归
for (const id of ['settingsPanel', 'settingsBtn', 'modeSeg', 'decorSeg', 'schemeSeg', 'fxSeg']) {
  ok(`已移除 id="${id}"`, !html.includes(`id="${id}"`))
}
// 三套字体必须都声明了
for (const [label, frag] of [
  ['黑糖话梅（歌名/歌手）', 'Black Sugar Plum Candy'],
  ['荆南波波黑（状态/时间）', 'KN Bobohei'],
  ['站酷快乐体（歌词）', 'ZCOOL KuaiLe'],
]) {
  ok(`字体已声明：${label}`, html.includes(frag))
}

console.log('\n=== 资源引用 ===')
for (const [label, path] of [
  ['白天壁纸', '/assets/wallpaper/suzuran_yukihare_34_day.mp4'],
  ['夜晚壁纸', '/assets/wallpaper/suzuran_yukihare_34_night.mp4'],
  ['睁眼表情', '/assets/character/expressions/open.gif'],
  ['闭眼表情', '/assets/character/expressions/closed.gif'],
  ['主字体', '/assets/fonts/theme/KNMaiyuan-Regular.ttf'],
]) {
  try {
    const r = await fetch(UI + path, { method: 'HEAD' })
    ok(label, r.ok, 'HTTP ' + r.status)
  } catch (e) { ok(label, false, e.message) }
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
