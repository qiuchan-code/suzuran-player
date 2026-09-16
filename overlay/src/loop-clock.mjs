/*
 * 曲末判断（纯逻辑，可单测）· loop-clock.mjs
 * --------------------------------------
 * 为什么要单独一个文件：这段逻辑有几个容易搞错的边界
 * （时长估短了会把进度条提前拽回 0，比不归零更难受），
 * 抽出来配单测比塞在 server.mjs 里靠人工试要靠谱。
 *
 * 背景：QQ 音乐**不上报播放进度**（SMTC 的 Position/EndTime 恒为 0），
 * 所以位置是服务端用墙钟推算的，而时钟只在"歌名+歌手变了"时归零。
 * 单曲循环时曲目标识前后完全一样 → 永远不重置 →
 * 位置上冲到时长后被夹住 → 歌词停在最后一行、进度条不动。
 */

/** 曲末宽限（秒）的下限。偏长只会让归零晚一点，偏短会把没放完的歌打断。 */
export const LOOP_GRACE_S = 3

/** 宽限还按歌长比例放大（4%）：3 分钟的容忍 7 秒。 */
export const LOOP_GRACE_RATIO = 0.04

/** 短于这个长度的不参与曲末判断，防止时长估错时误触发。 */
export const LOOP_MIN_DURATION_S = 20

/** 歌词最后一行的起始时间；没有就返回 0。 */
export function lastLyricTime(lyrics) {
  const lines = lyrics?.lines
  return Array.isArray(lines) && lines.length ? lines[lines.length - 1].time : 0
}

/**
 * 这首歌大约多长（秒）。0 表示不知道。
 *
 * 来源有三个，**取最大值**：
 *   · SMTC 报的时长（QQ 音乐恒为 0）
 *   · 歌词接口的 interval
 *   · 歌词末行的时间
 *
 * 为什么取最大：曲末判断宁可比实际长一点。
 * 报短了会在歌还没放完时就把进度条拽回 0 —— 那比"不归零"更让人难受。
 */
export function effectiveEnd(track, lyrics) {
  return Math.max(
    Number(track?.duration) || 0,
    Number(lyrics?.duration) || 0,
    lastLyricTime(lyrics) || 0,
  )
}

/**
 * 这一轮是不是放完了。
 *
 * 宽限随时长缩放：固定的 3 秒对一首 8 分钟的歌太紧 ——
 * 时长只要估短 1% 就会提前打断。所以再按 4% 放大一次。
 *
 * @param {number} position 当前推算位置（秒）
 * @param {number} end      这首歌的大致长度（秒）
 * @returns {boolean}
 */
export function isLoopOverrun(position, end) {
  if (!(end >= LOOP_MIN_DURATION_S)) return false   // 时长不可信，不判断
  if (!(position > 0)) return false
  const grace = Math.max(LOOP_GRACE_S, end * LOOP_GRACE_RATIO)
  return position > end + grace
}
