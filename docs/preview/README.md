# 预览图放这里

把界面截图放到这个目录（png / jpg 都行），然后在 README.md 顶部取消注释：

`markdown
![预览](docs/preview/ui.png)
`

## 怎么截图

启动播放器后：

``powershell
# 自动截当前界面（推荐，会顺便打印实时状态）
node src\tools\shots\verify-live-ui.mjs docs\preview\ui.png

# 暗色主题
# 先在浏览器里点右下角铃兰切到暗色，再跑上面的命令
``

或者直接用 Win + Shift + S 手动截。

## 注意

本目录**不在** .gitignore 里，图片会被正常提交。
而 docs/shots/（自动截图目录）是排除的 —— 那里的图带环境状态、容易过期。
