// playwright.config.js — Playwright 冒烟测试配置
// 运行：npx playwright test（= npm run test:e2e）
// webServer 自动启动 scripts/serve.py（与生产 _headers 行为一致：Cache-Control: no-cache）
import { defineConfig } from '@playwright/test';

const PORT = 8000;

export default defineConfig({
  testDir: './e2e',
  // 冒烟用例共享同一本地服务器；单 worker 串行最稳（避免 localStorage/端口互相干扰）
  fullyParallel: false,
  workers: 1,
  // 本地快速反馈：冒烟失败即暴露，不自动重试
  retries: 0,
  reporter: 'list',
  // ATC 用例从发车到自动停靠约需 20s+，留足余量
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    // 失败时保留 trace，便于本地排查
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `python scripts/serve.py ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // 兼容已有后台任务/残留进程占用 8000 的场景（复用而非重复起进程）
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
