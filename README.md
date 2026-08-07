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
	- `↑` / `W` / `⬆`：加速（牵引）
	- `↓` / `S` / `⬇`：减速（制动）
	- `Space`：复位手柄
	- `R`：重置并返回主菜单
	- `M`：主菜单

## 开发说明

- 入口文件：`index.html`（纯静态入口，仅引入样式与 `src/game/main.js`）
- 本地调试服务器：`python scripts/serve.py`（零依赖，自动附加 `Cache-Control: no-cache`，避免旧模块缓存问题，行为与生产一致）
- 样式文件：`src/styles/`（按序引入 `variables.css` → `base.css` → `layout.css` → `components.css` → `responsive.css`）
- 游戏逻辑：`src/game/` 下的 ES Modules（无构建工具）
  - 入口/编排：`main.js`、`flow.js`、`input.js`
  - 纯逻辑：`data.js`（常量/数据）、`physics.js`（物理）、`sim.js`（单帧编排）、`progress.js`（成就/进度）、`scoring.js`（评分）、`passenger.js`（乘客评价）、`stats.js`（运行统计）、`state.js`（共享状态）
  - 表现层：`ui.js`、`render.js`、`resultView.js`、`dom.js`
  - 环境与 ATC：`environment.js`、`atc.js`、`control.js`
- 本地数据键（游戏数据）：`trainProgress`、`trainAchievements`（保存在 `localStorage`）
- 成就定义位于 `src/game/data.js` 的 `ACHIEVEMENTS` 对象；判定在 `src/game/progress.js` 的 `checkAchievements(data)` 中实现（纯逻辑，返回本次新解锁的成就数组，toast 反馈由 `flow.js` 统一处理）

## 测试建议

- 自动化回归：`npm test`（单测）、`npm run test:e2e`（Playwright 冒烟）、`npm run test:all`（物理对拍 + 单测 + 冒烟）
- 在开发者工具（F12）查看控制台日志以捕获异常
- 在“关于”页面使用 `🗑️重置存档` 清除游戏存档数据
- 修改成就判定（`src/game/progress.js`）后在 `endGame()` 调用处打印 `state.stats` 验证统计值
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

## 未来开发方向

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
- 暂停功能（含键盘快捷键）
- 关卡星级展示细化：展示具体得分 / 星级数

## 贡献

欢迎贡献：Fork -> 创建分支 -> 提交 PR。请在 PR 中描述修改点与测试步骤。
