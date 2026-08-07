// 版本号同步脚本：读取 package.json 的 version，写入 src/game/version.js
// 由 `npm version` 的 "version" 生命周期钩子自动调用（发版时），也可手动运行：
//   node scripts/sync-version.mjs
// 版本单一来源 = package.json；src/game/version.js 为浏览器端可导入的生成文件。
import { readFileSync, writeFileSync } from 'node:fs';

const SEMVER = /^\d+\.\d+\.\d+$/;

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

if (!SEMVER.test(version)) {
    console.error(`✗ 非法 SemVer 版本号: ${version}`);
    process.exit(1);
}

const content = `// 由 scripts/sync-version.mjs 自动生成，请勿手改（版本单一来源 = package.json）\nexport const APP_VERSION = '${version}';\n`;
writeFileSync('src/game/version.js', content);
console.log(`✓ 已同步 src/game/version.js → v${version}`);
