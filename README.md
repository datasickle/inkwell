# datasickle's blog

Astro 静态博客 + 写作台（**inkwell editor**）。**内容只有一份真相：GitHub 仓库里的 Markdown 文件。**
站点由云端构建，写作台有网页版和 Android App 两个入口，写完点「发布」直接提交进仓库。

```
写作台（网页 / App）  ──GitHub API──▶  GitHub 仓库  ──自动构建──▶  Cloudflare Pages
```

> **许可**：本站代码采用 [MIT](LICENSE)；文章、碎片和站内自制图片采用 CC BY-NC-SA 4.0，**不在 MIT 范围内**。
> 详细的授权范围见站内 `/license/` 页。

## 线上地址

| 入口 | 地址 |
| --- | --- |
| 博客 | https://datasickle-blog.pages.dev/ |
| 写作台（网页版） | https://datasickle-blog.pages.dev/app/ |
| RSS | https://datasickle-blog.pages.dev/rss.xml |
| 仓库 | https://github.com/datasickle/inkwell |

托管在 Cloudflare Pages，域名由平台分配（`*.pages.dev`），**不随部署变化**，推送到 `main` 后约 1~2 分钟自动更新。免费、不用备案、不用买域名。

> 旧的 EdgeOne 项目仍保留着（`inkwell-unbc2szi.edgeone.dev`），可随时回退。但它的项目级域名对大陆访客不稳定（官方规则：大陆网络访问须用 3 小时有效的预览链接，超时 401），所以主力迁到了 Cloudflare。
>
> 若以后绑定自定义域名，记得同步改 `site.json` 里的 `url`，否则 RSS 与 canonical 会指向旧地址。

## 目录

| 路径 | 是什么 |
| --- | --- |
| `src/` | Astro 站点：首页、文章页、RSS、样式（Tailwind） |
| `src/content/blog/` | **所有文章（纯 Markdown，这是全部家当）** |
| `app/` | 写作台，纯静态，网页和 App 共用同一份代码 |
| `android/` | Capacitor 生成的原生壳（WebView 加载 `app/`） |
| `writer/` | 备用的本地写作台（跑在本机、用 git 推送，不需要 token） |
| `tools/` | 本地服务器、产物复制、分享卡生成（`make-og.py`） |
| `tests/` | 三套自测 |

## 站点样式

视觉基调来自 [Astro Nano](https://github.com/markhorn-dev/astro-nano)（MIT）：stone 灰阶、单列窄栏、大留白、页头毛玻璃。只搬了外观，内容层原样保留 —— `src/content/blog/` 的结构和 frontmatter（`title` / `date` / `tags` / `draft` / `summary`）还是自己的定义，写作台产出的就是这套字段，所以换主题不用动写作台。

| 文件 | 作用 |
| --- | --- |
| `tailwind.config.mjs` | 字体栈、prose 正文排版细节 |
| `postcss.config.mjs` | 让 Astro 用 PostCSS 处理 Tailwind |
| `src/styles/global.css` | 全局基调、深色模式、Shiki 双主题、淡入动画 |
| `src/components/` | 页头、页脚、文章卡片、返回/回顶按钮 |

与 Nano 原版刻意不同的三处：

1. **字体**：原版内嵌 Inter / Lora，两者都没有中文字形，中文会 fallback 成浏览器默认。这里改用系统中文栈，顺带省掉四个 woff2。
2. **正文不用衬线**：原版给正文加了 `prose-p:font-serif`，中文对应宋体，Windows 小字号下发虚，所以去掉，靠行高和留白撑呼吸感。
3. **淡入改用 CSS 动画**：原版靠 JS 加 `.show` 类，脚本一旦报错整页内容都是透明的；改成 `@keyframes` 后不依赖 JS。

深色模式是 `html.dark` 类 + localStorage 三态（浅色 / 深色 / 跟随系统），切换逻辑内联在 `Head.astro` 的 `<head>` 里，避免深色用户每次打开先闪一下白。

## 阅读体验

| 功能 | 实现 | 说明 |
| --- | --- | --- |
| 文章目录 | `[...id].astro` 里读 `headings` | 只收二级、三级；少于 2 条不显示 |
| 目录跟随高亮 | 滚动时找最后一个越过判定线的标题，加 `.is-active` 并移动滑块 | 判定线 96px，与 CSS 的 `scroll-margin-top` 一致 |
| 阅读进度条 | 顶部 2px 细线，`scaleX` 按滚动比例缩放 | 从正文越过判定线开始，页面滚到底满格 |
| 上一篇 / 下一篇 | `getStaticPaths` 里按时间排序取邻位 | 列表是新→旧，所以 `i-1` 更新、`i+1` 更早 |
| 代码复制 | 运行时给每个 `pre` 套 `.code-block` 并插按钮 | 先试异步剪贴板，**被拒再退回 `execCommand`**（页面未聚焦时前者会 reject） |
| 图片放大 | 点正文图片弹出遮罩，Esc 或点任意处关闭 | 小于 200px 的图不放大；打开时锁背景滚动 |
| 分享按钮 | 文章底部，`navigator.share` 可用就调系统面板，否则复制链接 | 按钮文案由能力决定，无 JS 时不显示 |
| 分享卡 | `public/og.png`，1200×630 | 见下 |

以上都是渐进增强：脚本没跑，正文、代码块和图片照样能看，只是少了按钮、高亮和进度。

目录在宽屏（≥1100px）会被抽到正文右侧固定，因为行内目录在正文一长时先滚出视口，高亮就看不到了；窄屏横向没空间，保持行内位置，滚动回顶部仍能看到当前小节。

> **分享按钮 ≠ 分享卡**。按钮是页面上的 UI，管「我怎么把这篇发出去」；分享卡是 `og:image`，管「别人在微信里看到这个链接时显示什么图」。两者互不替代，通常都要有。

### 分享卡为什么是一张固定的图

原来 `og:image` 指向 `favicon.svg`，微信、Twitter、Facebook 都不接受 SVG，分享出去**完全没有预览图**。

按文章标题动态出图需要中文字体，而 Cloudflare 的构建镜像是 Linux，没有中文字体；把字体（约 17MB）提交进仓库只为一个分享图不划算。所以做成一张统一的品牌卡，本地生成后提交：

```bash
python tools/make-og.py     # 需要本机有 C:\Windows\Fonts\msyh.ttc
```

改了站名或简介后重跑一次，然后提交 `public/og.png`。卡片是位图，所以标签里带 `og:image:type` 和宽高，`twitter:card` 用 `summary_large_image`。

## 第一次配置

### 1. 建仓库

GitHub 上新建一个仓库（私有公开都行），然后：

```bash
git init -b main
git add -A
git commit -m "init"
git remote add origin git@github.com:你的账号/仓库名.git
git push -u origin main
```

### 2. 生成 Token

打开 https://github.com/settings/personal-access-tokens/new

- **Repository access** 只选这一个仓库（不要给 All repositories）
- **Permissions → Contents** 选 **Read and write**，其余全部留空
- 有效期按需要设，过期后重新生成、在写作台里换掉即可

得到的 `github_pat_…` 只存在设备本地，不会上传到任何地方。

### 3. 部署站点

Cloudflare Dashboard → Workers & Pages → **Create application** → 页面最底部的 `Continue to Pages`（legacy 入口）→ **Import an existing Git repository** → 选中本仓库。

构建配置：

| 字段 | 值 |
| --- | --- |
| Framework preset | `Astro` |
| Build command | `npm install --include=dev && npm run build` |
| Build output directory | `dist` |
| 环境变量 | `NODE_VERSION` = `22.22.2`<br>`APP_PASS` = 写作台密码（见下节） |

`--include=dev` 不能省：Tailwind、typography、astro 都在 devDependencies，云端按 production 模式安装会缺包。

站点地址是 `datasickle-blog.pages.dev`，写作台在 **`/app/`** 路径下（构建时自动复制进产物）。

> 别走 Workers 那条新入口：它的地址是 `*.workers.dev`，在大陆被 DNS 污染，基本打不开。

## 写作台访问控制

`/app/` 默认**不公开**，由一个 Pages Function 中间件（`functions/_middleware.js`）挡住，用 HTTP Basic Auth 校验。博客、文章、标签、归档、搜索、RSS 全部照常公开，只有写作台需要登录。

密码来自环境变量，不进仓库：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `APP_PASS` | 是 | 访问密码。**未设置时写作台一律返回 503**，不会因为漏配而放行 |
| `APP_USER` | 否 | 用户名，默认 `datasickle` |

改完变量要**重新部署一次**才生效（Deployments → 最新一条 → Retry deployment），环境变量是在部署时注入的。

本地跑测试不用起运行时：

```bash
npm run test:auth    # 54 条：路径判定、凭据解析、放行/拦截、漏配密码
```

注意事项：

- 用户名和密码请用 **ASCII**，Basic Auth 的解码不做多字节处理。
- 手机 App 是本地打包的，不经过网络，因此**不受影响**；只有浏览器打开 `/app/` 时才会弹一次登录框。
- 这层保护挡的是「界面被陌生人打开」。写作台没有后端，GitHub Token 只存在浏览者自己的浏览器里，所以即便有人绕过界面，也拿不到你的发布权限。
- 想换更强的方案（邮箱验证码、GitHub 登录）可以改用 Cloudflare Access，但它作用于整个主机名，博客会被一起挡住，还得绑定自有域名，因此这里没用。


## 写作台怎么用

```bash
npm run app:dev      # 本地试用（假 GitHub，数据在内存，重启即恢复）
npm run app:serve    # 直接预览写作台 → http://localhost:4600
```

- 第一次打开会让你填 `owner/repo`、分支、文章目录、Token
- 左边列表，中间写，右边实时预览（渲染规则和站点一致，含表格）
- 顶栏 `↻` 重新拉取，`⚙` 改配置
- 手机上会变成单栏，「写作 / 预览」用标签切换

### 插图

三个入口，都会把图直接传到仓库的 `public/images/`，并回填 `![说明](/images/文件名)`：

| 入口 | 用法 |
| --- | --- |
| 工具栏的图片按钮 | 点一下，选文件（手机上是系统相册 / 文件选择器，可多选） |
| 粘贴 | 截图后直接 `Ctrl+V` |
| 拖拽 | 把图片拖进编辑区 |

- **自动压缩**：长边超过 1600 的转成 JPEG（质量 0.82），手机原图 4~8MB 通常压到 300KB 左右；超过 900KB 会再降一档到 1200/0.72
- **PNG 小图保留原格式**：300KB 以内的 PNG 原样上传，避免透明底被填白
- **GIF 不压缩**：压了会丢动画，上限 5MB
- **文件名自动生成**：`20261124-4c524c.jpg`，带随机后缀，不会撞车，也不会出现中文路径
- **预览立即可见**：本会话上传的图用本地 blob 显示，不用等云端构建

图片是**独立提交**的，和文章的发布分开。插入后即使不发布文章，图片也已经在仓库里了；反之删掉文章里的引用不会自动删图，需要的话去 GitHub 上手动删 `public/images/` 下的文件。

App 里预览走的是线上地址（`SITE_ORIGIN` 常量在 `app/index.html`），因为 App 是本地打包、`/images/` 指向设备本地。**换域名时要同步改这个常量**，否则 App 里的历史文章预览会裂图。

### 格式工具条

正文上方有一排按钮，**选中文字点按钮**就套上格式，再点一次取消。不用自己敲 `**` `#` `>` 这些符号。

| 按钮 | 作用 | 按钮 | 作用 |
| --- | --- | --- | --- |
| `B` | 粗体 | `H2` `H3` | 二 / 三级标题 |
| `I` | 斜体 | `”` | 引用 |
| `S` | 删除线 | `1.` | 有序列表 |
| `•≡` | 无序列表 | `🔗` | 链接（选中文字即可） |
| `<>` | 行内代码 | `[<>]` | 代码块 |
| 表格 | 插入 2×2 空表并选中首个表头 | 图片 | 插入 `![说明](地址)` |
| `—` | 分割线 | | |

正文里不给 `H1`：文章标题由上面的标题栏决定，正文里再出现一级标题会打乱层级。

两个顺手的细节：

- **回车自动续列表**：在 `- 一项` 后面回车会自动补 `- `；在空条目上回车则退出列表。有序列表会递增编号。
- **改动可在编辑器里撤销**：格式操作走浏览器的编辑命令，`Ctrl+Z` 能一步撤回，不会把整段替换掉。

| 操作 | 快捷键 |
| --- | --- |
| 存草稿（只存本机） | `Ctrl/Cmd + S` |
| 发布（提交进仓库） | `Ctrl/Cmd + Enter` |
| 粗体 / 斜体 / 链接 / 删除线 | `Ctrl/Cmd + B` / `+ I` / `+ K` / `+ Shift + X` |
| 有序 / 无序列表 | `Ctrl/Cmd + Shift + 7` / `+ Shift + 8` |

**草稿和发布是两件事。** 草稿只存在浏览器本机，用来防止误关页面；只有「发布」才会写进 GitHub。
换设备、清缓存、卸载 App 都会丢草稿——**真正可靠的备份只有仓库里的已发布内容。**

## Android App

两条路，选一条走到底，别混着装（签名不同，互相覆盖不了）。

### A. 本机构建（已装好，一条命令）

```bash
bash tools/build-apk.sh
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`，同时复制一份到 `D:\android-dev\out\inkwell-<版本号>-debug.apk`。文件名跟随 `android/app/build.gradle` 里的 `versionName`（当前 `1.2`），不用手改脚本。
传手机安装即可（需允许「安装未知来源应用」）。增量构建十几秒，全量约 8 分钟。

工具链全在 D 盘，没动系统环境：

| 位置 | 内容 | 占用 |
| --- | --- | --- |
| `D:\android-dev\jdk21` | Temurin JDK 21.0.13 | 330M |
| `D:\android-dev\sdk` | Android SDK 36 + build-tools 36.0.0 + platform-tools | 577M |
| `D:\android-dev\gradle-home` | Gradle 8.14.3 + 依赖缓存 + `init.d/mirrors.gradle` | 1G |
| `D:\android-dev\android-home` | debug.keystore（签名密钥固定在这里） | 4K |

三个网络坑，脚本里已经处理好：

1. `dl.google.com` 国内直连 TLS 握手就断 → Android SDK 走腾讯云镜像（`SDK_TEST_BASE_URL`）
2. Gradle 依赖里的 `google()` 被写死在项目和 `node_modules/@capacitor/android` 里，改不动 → 用 `gradle-home/init.d/mirrors.gradle` 在 Gradle 初始化阶段把阿里云镜像插到最前面
3. Gradle 发行包官方源只有 1.5MB/s → 预置到缓存，指向仍是官方地址，CI 不受影响

### B. GitHub Actions 构建（不在本机编译）

1. 推到 `main` 分支（或手动触发 Actions 里的「打包 Android App」）
2. Actions 跑完 → 该次运行页面底部 **Artifacts** → 下载 `inkwell-apk`
3. 解压得到 `app-debug.apk`，传到手机安装

改动 `app/` 或 `android/` 会自动触发构建。已实测通过（2026-11-24，全程约 1 分 43 秒，产物 `inkwell-apk` 3.6 MB，保留 90 天）。

**两条路的 APK 签名不同，别混装。** 本机构建用的是固定密钥，能覆盖升级；Actions 每次用 runner 现场生成的密钥，签名每次都变。混装的结果是系统拒绝安装，只能卸载——草稿一起没。

**必须知道的坑：**

- 都是 **debug 版**。本机构建的签名固定在 `D:\android-dev\android-home`，重装能覆盖；**Actions 构建的签名由 runner 现场生成，每次可能不同**，覆盖安装会被拒，只能先卸载——而卸载会清空 App 里的本地草稿。所以重要的东西一定先点「发布」。
- 想以后加 iOS，同一套 `app/` 代码加个 iOS 工程就行，但需要 Mac + Apple 开发者账号（$99/年）。

## 写文章的另一种方式

不用写作台也可以，直接在 `src/content/blog/` 放 `.md`：

```markdown
---
title: 标题
date: 2026-11-23
tags: 标签一, 标签二
draft: false
---

正文。
```

文件名就是 URL 路径。`draft: true` 不上站点，写作台里仍能编辑。

## 迁移和备份

文章是纯文本，开头只有 `title / date / tags / draft` 四个通用字段，**任何框架都认**。

| 情况 | 怎么办 |
| --- | --- |
| 换框架（Hugo / Hexo / 什么） | 只把 `src/content/blog/*.md` 搬走，文章一个字不用改 |
| 换电脑 | `git clone` 完事，`npm install` 一次 |
| 换托管平台 | 新平台关联同一个仓库，配置改两行 |
| 不想建站了 | Markdown 直接扔进 Obsidian / 备忘录 |
| 整台电脑都不想要 | 删掉 `blog` 文件夹。内容在 GitHub 上，一条命令拉回来 |

`dist/` 是构建产物，可以随时删；**别把它当备份。**

## 自测

```bash
npm run test:app     # 写作台核心：Markdown、frontmatter、slug、发布链路（打本地假 GitHub）
npm run test:auth    # 写作台访问控制：路径判定、Basic Auth 解析、放行/拦截
npm test             # 本地写作台接口
npm run test:push    # git 推送链路（在临时目录里跑，不碰当前仓库）
npm run build        # 站点构建
```

## 关于公司电脑

没有全局命令、没有改 `PATH`、没有注册表、没有管理员权限、没有服务自启。所有东西都在两个文件夹里：

| 位置 | 用途 | 怎么清 |
| --- | --- | --- |
| `D:\workbuddy_data\...\blog` | 项目本体 | 删掉即可（内容在 GitHub 上，`git clone` 回来） |
| `D:\android-dev` | Android 构建工具链，1.9G | 删掉即可，想再构建就重装（README 上一节有清单） |

C 盘只剩工具自己写的缓存：`C:\Users\AVS17500\.android`（sdkmanager 的 XML 缓存，几 MB，删了会自动重建）。

Node 版本：Astro 6 要求 >= 22.12，Capacitor 8 要求 >= 22.0，本机 22.22.2 够用。
不要升 Astro 7（要求 >= 22.23.4，会直接拒绝构建）。
