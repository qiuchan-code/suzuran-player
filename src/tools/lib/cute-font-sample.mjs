/*
 * 样张文字 · 唯一出处
 * --------------------
 * build-cute-font-lab.mjs（渲染）和 check-font-coverage.mjs（查 cmap 覆盖）
 * 都从这里读，避免两边的样张文字悄悄跑偏。
 *
 * 三档字号对应播放器里的真实用途：
 *   big   38px  当前歌词
 *   mid   22px  下一句歌词
 *   small 14px  辅助信息（英文 / 数字 / 标点都塞在这行）
 */
export const SAMPLE = {
  big: '留此刻 与夏夜老去',
  mid: '街巷口跑过的女儿家 才把青梅嗅罢',
  small: 'Suzuran Player • Now Playing (Live) — 2026 • 18:41:18 • 98.6% • #1/24 • ¥128',
}

/*
 * 分隔符为什么用「•」不用「·」：
 *   普查了一遍（_probe-coverage.mjs），U+00B7「·」在 清松手寫體6 和 站酷庆科黄油体 里
 *   根本没有字形，U+30FB「・」更是过半字体没有 —— 用了就会单个字符掉回系统字体，
 *   看起来像"字体没生效"。U+2022「•」是 8 款全都有。样张用全覆盖的标点，看到的差异
 *   才能确定是字体本身，而不是 fallback。
 */

/** 样张里出现过的去重字符（不含空白） */
export function sampleChars() {
  return [...new Set(Object.values(SAMPLE).join(''))].filter(c => c.trim())
}
