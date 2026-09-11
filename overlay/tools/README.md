# overlay/tools

歌词服务的配套工具。按用途分三组。

## playlist/ — 歌单工具（能实际用的）

| 脚本 | 作用 |
|---|---|
| `playlist.mjs` | 读公开歌单 / 随机抽歌 / 按 mid 查歌词 |
| `playlist-stats.mjs` | 语种分布统计（按曲名歌手的字符集推断） |
| `export-split.mjs` | 按语种拆分导出成「歌名 - 歌手」文本 |
| `make-slices.mjs` | 把清单切成可粘贴的小片（手机版导入框限 1000 字符） |
| `resolve-share.mjs` | 解析 QQ 音乐分享短链拿到 disstid |

```powershell
# 例：读一个分享歌单并随机抽一首
node --use-system-ca overlay/tools/playlist/playlist.mjs shuffle "https://c6.y.qq.com/base/fcgi-bin/u?__=xxxx"
```

> 都需要 `--use-system-ca`（这台机器的证书链问题）

## api/ — 接口排查（接口出问题时用）

| 脚本 | 作用 |
|---|---|
| `probe-apis.mjs` | ★ 诊断搜索接口可用性，**区分「限流」和「故障」** |
| `stress-switch.mjs` | ★ 快速切歌压测，看接口扛不扛得住 |
| `qq-session.mjs` | 从调试 Edge 里取登录态（cookie 不是 httpOnly，读得到） |
| `launch-debug-edge.ps1` | 起一个带调试端口的独立 Edge |

```powershell
# 接口感觉不对时先跑这个
node --use-system-ca overlay/tools/api/probe-apis.mjs

# 压测
node --use-system-ca overlay/tools/api/stress-switch.mjs 10
```

**重要**：两个搜索接口的限流表现不同 —— `client_search_cp` 返 HTTP 500，
`musicu.fcg` 返 `code=2001`。把 500 当成「接口挂了」会得出错误结论。

## api/_archive/ — 归档

定位接口、逆加密、抓包那轮的中间产物。**现在不需要跑**，
留着是为了以后再碰类似问题（比如接口又改版）时能参考思路。

## 根目录

| 脚本 | 作用 |
|---|---|
| `session-watch.ps1` | 常驻 SMTC 监视器（服务运行时靠它读播放状态） |
| `now-playing.ps1` | 读一次当前播放（被 session-watch 调用） |
| `probe-ratelimit.mjs` | 限流行为排查 |
| `tidy.mjs` | 整理本目录（一次性，已用完） |
| `fix-paths.mjs` | 修路径引用（一次性，已用完） |
