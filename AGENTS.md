# AGENTS.md

个人博客 + 写作台。**先读 `README.md`**，架构、部署、Android 工具链都写在那边，这里只写必须遵守的约束，不重复文档。

## 硬规则

- 推之前先 `git fetch && git rebase origin/main`。**禁止 `git push --force`**：写作台发文会在远程产生提交，force 会直接删掉。
- 不改 `functions/_middleware.js` 的 fail-closed 行为：没配 `APP_PASS` 时必须返回 503，不能因为漏配就放行。
- 密码、GitHub token 一律不进仓库。它们只在 Cloudflare Pages 环境变量和浏览器 localStorage 里。
- 时间一律走 `src/lib/datetime.ts`（固定 `+08:00`）。禁止直接用 `date.getMonth()` / `getFullYear()`：构建机在 UTC，凌晨发的文章会被归到前一天。
- CSS 写 `body > header`，不要写 `header`：后者会命中文章正文里的 `<header>`。
- 改了 `app/` 要 `npx cap sync android` 再打包，否则 APK 里还是旧代码。
- `src/content/blog/*.md` 是用户写的文章，除非明确要求，不要改正文。

## 命令

| 用途 | 命令 |
| --- | --- |
| 站点构建 | `npm run build`（astro build + 把 `app/` 复制进 `dist/app`） |
| 测试 | `npm run test:app` / `test:auth` / `test:push` |
| 写作台本地预览 | `npm run app:serve` → <http://localhost:4600> |
| Android 打包 | `bash tools/build-apk.sh` |

Android 工具链固定在 `D:\android-dev`，不要往系统 PATH 或注册表里装东西。

## 验证

- 改完站点必须 `npm run build` 通过，且 `dist/` 里能看到对应改动。
- 线上 `https://datasickle-blog.pages.dev/`；`/app/` 有 Basic Auth，无凭据应当返回 **401**。
- 推送后 Cloudflare 约 1 分钟构建。「本地能打开」不等于已上线，要抓线上 HTML 确认。

## 现状

线上 5 篇文章。写作台支持插图、时间精确到秒、列表长按（手机）/ 悬停（桌面）删除；Android 1.2。

未做：图片固定宽高防跳版、上传前压缩、阅读位置记忆、连载目录。
