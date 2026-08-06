# 地铁停靠（Metro Stopping）

（语言 / Language： [English](README.en.md)）

一个基于浏览器的轻量地铁停靠模拟小游戏，核心游戏目标是在站台对位点精准停车。游戏包含多关卡、车辆解锁、成就系统与街机模式，希望你玩得开心。:)

## 主要特色

- 基于物理的停靠模拟（牵引、制动、摩擦、空气阻力、坡度、积水与风）
- 多关卡与车辆解锁系统
- 支持手动驾驶与 ATC 自动驾驶模式

## 快速开始

1. 在浏览器中打开 `index.html`（双击或通过本地静态服务器）
2. 在主界面点击 **开始驾驶** 开始游戏
3. 控制说明：
	- `↑` / `⬆`：加速（牵引）
	- `↓` / `⬇`：减速（制动）
	- `Space`：复位手柄
	- `R`：重置并返回主菜单
	- `M`：主菜单

## 开发说明

- 入口文件：`index.html`
- 本地调试服务器：`python scripts/serve.py`（零依赖，自动附加 `Cache-Control: no-cache`，避免旧模块缓存问题，行为与生产一致）
- 样式文件：`src/styles/main.css`
- 游戏逻辑与数据：`src/game/main.js`、`src/game/data.js`、`src/game/storage.js`
- 本地数据键（游戏数据）：`trainProgress`、`trainAchievements`（保存在 `localStorage`）
- 成就定义位于 `src/game/data.js` 的 `ACHIEVEMENTS` 对象；判定在 `checkAchievements(data)` 中实现

## 测试建议

- 在开发者工具（F12）查看控制台日志以捕获异常
- 在“关于”页面使用 `🗑️重置存档` 清除游戏存档数据
- 修改成就判定后在 `endGame()` 调用处打印 `state` 验证统计值
- 测试后门：在主菜单按`⬆⬆⬆⬆⬇⬇⬇⬇`可以解锁所有关卡与车辆

## 部署

本仓库为纯静态站点（无构建工具），可直接部署到 Pages托管。

以Cloudflare Pages为例：

1. 将仓库推送到 GitHub / GitLab
2. Cloudflare Dashboard → **Workers & Pages** → **Create → Pages → Connect to Git**，选择本仓库
3. 构建配置：
   - Framework preset：**None**
   - Build command：**留空**（无构建步骤）
   - Build output directory：**留空或 `/`**（`index.html` 在仓库根）
4. 仓库根的 `_headers` 文件已为所有资源设置 `Cache-Control: no-cache`，发版后用户普通刷新即可获取最新版本，无需硬刷新

部署后访问 `https://<项目名>.pages.dev`（可配置自定义域名）。

### 未来开发方向

**性能与渲染**
- 新增网页加载界面
- 高分屏适配：canvas 按 `devicePixelRatio` 缩放并监听 `resize`，提升高分屏清晰度
- 后台自动暂停：监听 `visibilitychange`，切后台时暂停游戏

**代码结构**
- 运行期字段封装为 `RunState`（`pos` / `speed` / `handle` 等），进一步收敛可变全局 `state`

**测试与工程化**
- CI：GitHub Actions 在 push / PR 时自动运行 `verify-physics.mjs` 与 `npm test`（低优先级）
- `verify-physics.mjs` 快照化：用可复现 PRNG 固化基线 JSON，消除 `refXxx` 双份维护与漂移风险（低优先级）

**玩法与体验**
- 新增设置菜单
- 音效：Web Audio 合成发车 / 制动 / 到站提示音 / VVVF电机声效
- 暂停功能（含键盘快捷键）
- 关卡星级展示细化：展示具体得分 / 星级数

## 贡献

欢迎贡献：Fork -> 创建分支 -> 提交 PR。请在 PR 中描述修改点与测试步骤。
