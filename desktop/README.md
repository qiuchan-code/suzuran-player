# 桌面壁纸模式

把播放器界面挂到 Windows 桌面层（`WorkerW`），**替代 Wallpaper Engine**。
壁纸在桌面图标**下面**，图标照常可见可点。

```
双击 launch-desktop.vbs          静默启动（不闪控制台窗口）
或运行 install-autostart.ps1     装成开机自启
```

---

## 它长什么样

```
┌──────────────────────────────────────────────────┐
│  [◐] luna──terra──sol──●astra      学习ing        │ ← 悬浮条（唯一可点区域）
│                                                  │
│  ┌────────┐  歌名                                 │
│  │ 专辑封面│  歌手                                 │
│  └────────┘  学习ing / +0:03:21                   │
│  21:47:43   2026/9/11                            │
│  ▁▃▅▇▅▃▁▃▅▇  律动频谱                            │
│  ▬▬▬▬▬▬●────────  进度条                          │
│  上一句 / 当前歌词（大字花字）/ 下一句              │
│                                      ┌────┐      │
│                                      │铃兰│      │
│                                      └────┘      │
└──────────────────────────────────────────────────┘
        ↑ 这一整块贴在桌面图标下面
        ↑ 桌面图标浮在它上面（Windows 的机制，抢不走）
```

---

## 文件

| 文件 | 作用 |
|---|---|
| `main.mjs` | 主进程：起服务 → 开窗口 → 挂桌面层 → 建悬浮条 → 托盘 |
| `control-bar.mjs` | 悬浮控件条（状态滑块 + 明暗切换） |
| `log.mjs` | 日志（同时写控制台和 `logs/desktop.log`） |
| `attach-desktop.ps1` | 把窗口 `SetParent` 到桌面壁纸层 |
| `launch-desktop.vbs` | 静默启动器（纯 ASCII，见下方"坑"） |
| `install-autostart.ps1` | 安装/卸载/查看开机自启 |
| `tools/` | 验证与测量脚本 |
| `logs/desktop.log` | 运行日志 |

## 常用命令

```powershell
cd D:\suzuran-player\desktop

# 启动（三种方式，效果一样）
npx electron .                  # 前台跑，能看到日志
wscript launch-desktop.vbs      # 静默
wscript launch-desktop.vbs 15   # 延迟 15 秒再启动

# 调试
npx electron . --windowed       # 开成普通窗口，不挂桌面层
npx electron . --no-bar         # 不要悬浮条
npx electron . --no-serve       # 不自动拉服务（服务已在别处跑）

# 端到端测试（悬浮条 → 播放器）
npx electron tools/probe-e2e2.mjs

# 验证桌面图标没被盖住
npx electron tools/verify-icons.mjs

# 内存测量
npx electron tools/bench-min.mjs      # 增量：空白 → 渐变 → 视频 → 遮罩 → 模糊
npx electron tools/bench-size.mjs     # GPU 内存与窗口面积的关系

# 开机自启
powershell -File install-autostart.ps1            # 安装
powershell -File install-autostart.ps1 -Status    # 查看
powershell -File install-autostart.ps1 -Remove    # 卸载
```

## 退出

托盘图标右键 → 退出。（壁纸模式没有窗口可点，托盘是唯一出口。）

托盘菜单还有：重新挂载、显示/隐藏悬浮条、重新定位悬浮条、打开普通窗口、看内存占用。

---

## 它是怎么挂上去的

### 桌面窗口层级（Win11 24H2 实测）

```
Progman  (标题 "Program Manager")
├── SHELLDLL_DefView          ← 桌面图标视图，负责响应鼠标
│   └── SysListView32
└── WorkerW                   ← 动态壁纸挂这里
    └── 我们的窗口
```

`SHELLDLL_DefView` **永远在 `WorkerW` 上面**。资源管理器只从它那里取鼠标事件，
所以壁纸不可能盖住图标，也不可能抢到点击。Wallpaper Engine 用的是同一个位置。

### 挂载步骤

1. `FindWindow('Progman', 'Program Manager')` 找到桌面窗口
2. 给 Progman 发未公开消息 `0x052C`，让 Explorer 准备好 `WorkerW`
3. `FindWindowEx(progman, ..., 'WorkerW', ...)` 拿到壁纸层
4. `SetParent(我们的窗口, WorkerW)`
5. `SetWindowPos` 铺满屏幕

### 悬浮条的鼠标穿透

壁纸层收不到任何鼠标事件，所以状态滑块和明暗切换点不到 —— 用一个浮在上面的小条补回来。

难点在于**穿透必须是动态的**：

```
光标压到控件上  → setIgnoreMouseEvents(false)           → 点击落到控件
光标在空白/透明 → setIgnoreMouseEvents(true, {forward}) → 点击穿到桌面
```

页面里监听 `pointermove`（靠 `forward: true` 才收得到），用 `elementFromPoint`
判断光标在不在控件上，然后 `console.log('HIT:1' / 'HIT:0')` 上报主进程切换。

---

## 坑（都踩过，别重犯）

### 挂载相关

| 现象 | 根因 | 正确做法 |
|---|---|---|
| `FindWindow('Progman', null)` 返回 0 | Win11 上必须给标题 | 用 `'Program Manager'` |
| 找不到 `WorkerW` | 老教程说它是"含 DefView 的顶层窗口的下一个兄弟" | 那是 Win10 结构；Win11 24H2 是 **Progman 的直接子窗口** |
| 脚本卡住永不返回 | **`spawnSync` 阻塞了 Electron 主线程**，而 `SetParent` 需要目标窗口线程处理同步消息 | 必须用**异步** `spawn` |
| 尺寸改不动 | 用了 `SWP_ASYNCWINDOWPOS`，只投递请求不生效 | 改**同步** `SetWindowPos` |
| 窗口底部差一条任务栏 | `screen.getPrimaryDisplay().bounds` 返回的其实是**工作区** | 用 `Math.max(bounds, workArea)` |
| 挂上了但被当成失败 | 中文匹配失败 | Node 按 utf8 解码子进程 stdout，而 PowerShell 5.1 的 `-File` 输出是 GBK → 用 **ASCII 标记行** `RESULT=OK` |
| `Cannot convert null to IntPtr` | C# 返回的 `IntPtr.Zero` 在 PowerShell 某些调用路径下变成真 `$null`，`$null -eq [IntPtr]::Zero` 判断不可靠 | 用显式空值判断 |

### 悬浮条相关

| 现象 | 根因 | 正确做法 |
|---|---|---|
| 控件全都点不动 | `setIgnoreMouseEvents(true, {forward:true})` 是**整个窗口**永久穿透，`forward` 只转发移动事件 | 按光标位置**动态切换** |
| 压住浏览器 / 全屏应用 | `setAlwaysOnTop(true, 'screen-saver')` 是最高层级；`'floating'` 也仍带 `WS_EX_TOPMOST` | 用 `setAlwaysOnTop(false)`（普通层级）+ `moveTop()` |
| 点了没反应，且**不报错** | 页面里写的是 `window.dsh?.tier(i)`，而 `window.dsh` 从未定义；**可选链遇到 undefined 会静默跳过** | 跨进程桥接**不要用可选链兜底**，宁可让它抛错 |
| 桥接静默失效 | Electron 39 改了 `console-message` 签名：新签名只传一个对象，消息在 `event.message`，旧写法的第 3 个参数是 `undefined` | 两种签名都兼容 |

### 启动器相关

| 现象 | 根因 | 正确做法 |
|---|---|---|
| `.vbs` 完全不执行 | VBScript 按 **ANSI(GBK)** 解码，UTF-8 中文注释变乱码，**乱码字节把换行也吞了**，代码和注释粘成一行 | **`.vbs` 必须纯 ASCII**（注释用英文）+ CRLF |
| 壁纸压根不显示 | 用 `Start-Process -WindowStyle Hidden` 避免闪框 | 那会连 `BrowserWindow` 一起隐藏；改用 `.vbs` + `shell.Run(..., 0, ...)` |
| 服务互相杀 | `launcher.ps1` 启动时会**强杀**占用 7788/7790 的进程 | 自启只留桌面壁纸版（它自己会拉服务） |

---

## 内存现状（**未解决**）

| 方案 | 实测 |
|---|---|
| Wallpaper Engine | 617 MB（关掉壁纸只留后台时的值，实际更高） |
| **本方案（完整界面）** | **1500-1600 MB**，其中 GPU 约 1.2 GB |
| 极简壁纸（仅视频 + 色团，无界面） | **367 MB** |

增量测量结论（`tools/bench-min.mjs`）：

```
空白页                286 MB
+ 静态渐变             299 MB  (+13)
+ 壁纸视频 810p        297 MB  ( -3)   ← 视频几乎不花钱
+ 椭圆遮罩             340 MB  (+44)
+ 模糊色团             367 MB  (+27)
完整播放器界面        1337 MB  (+970)  ← 多出来的全在界面
```

已排除的原因：

- **不是泄漏**：90 秒时间序列 1595 → 1315 MB，JS 堆恒定 1.5 MB，DOM 节点恒定 231
- **不是某个特性**：关掉落雪 / 表情 / 频谱 / 视频，仍有 1282 MB
- **与窗口面积线性**：`GPU ≈ 0.53 MB/百万像素 + 743 MB 固定开销`，缩到 25% 大小仍有 750 MB

744 MB 的固定开销来源**未定位**。怀疑是全屏合成 + 30 多个元素各自成层，
也可能是 Chromium 在这台 AMD 机器上的 GPU 内存会计口径问题。

**如果内存是首要目标，应该做"极简壁纸模式"（367 MB）而不是搬整个界面过来。**
