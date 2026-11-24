# 大帝手记

Astro 静态博客 + 写作台。**内容只有一份真相：GitHub 仓库里的 Markdown 文件。**
站点由云端构建，写作台有网页版和 Android App 两个入口，写完点「发布」直接提交进仓库。

```
写作台（网页 / App）  ──GitHub API──▶  GitHub 仓库  ──自动构建──▶  EdgeOne 站点
```

## 目录

| 路径 | 是什么 |
| --- | --- |
| `src/` | Astro 站点：首页、文章页、RSS、样式 |
| `src/content/blog/` | **所有文章（纯 Markdown，这是全部家当）** |
| `app/` | 写作台，纯静态，网页和 App 共用同一份代码 |
| `android/` | Capacitor 生成的原生壳（WebView 加载 `app/`） |
| `writer/` | 备用的本地写作台（跑在本机、用 git 推送，不需要 token） |
| `tools/` | 本地服务器、产物复制 |
| `tests/` | 三套自测 |

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

EdgeOne 控制台关联仓库 → 构建命令 `npm run build` → 输出目录 `dist`。
构建完会得到 `xxx.edgeone.site`，写作台在 **`/app/`** 路径下（构建时自动复制进产物）。

## 写作台怎么用

```bash
npm run app:dev      # 本地试用（假 GitHub，数据在内存，重启即恢复）
npm run app:serve    # 直接预览写作台 → http://localhost:4600
```

- 第一次打开会让你填 `owner/repo`、分支、文章目录、Token
- 左边列表，中间写，右边实时预览（渲染规则和站点一致，含表格）
- 顶栏 `↻` 重新拉取，`⚙` 改配置
- 手机上会变成单栏，「写作 / 预览」用标签切换

| 操作 | 快捷键 |
| --- | --- |
| 存草稿（只存本机） | `Ctrl/Cmd + S` |
| 发布（提交进仓库） | `Ctrl/Cmd + Enter` |

**草稿和发布是两件事。** 草稿只存在浏览器本机，用来防止误关页面；只有「发布」才会写进 GitHub。
换设备、清缓存、卸载 App 都会丢草稿——**真正可靠的备份只有仓库里的已发布内容。**

## Android App

两条路，选一条走到底，别混着装（签名不同，互相覆盖不了）。

### A. 本机构建（已装好，一条命令）

```bash
bash tools/build-apk.sh
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`，同时复制一份到 `D:\android-dev\out\inkwell-1.0-debug.apk`。
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
