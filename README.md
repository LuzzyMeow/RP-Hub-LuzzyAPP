<div align="center">

<img src="frontend/public/icons/icon-192.png" width="120" height="120" alt="LUZZY Logo" />

# LUZZY · 鹿溪

> **每次对话，都像一本有你的小说。**
> 
> *Every conversation feels like a novel with you in it.*

[![Version](https://img.shields.io/badge/version-v0.6.1-9d4edd?style=flat-square)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-ffb703?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-219ebc?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119eff?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

[📦 下载 APK](https://github.com/LuzzyMeow/Luzzy-RpTRPG/releases/latest) · [📜 更新日志](./CHANGELOG.md) · [🐛 提交问题](https://github.com/LuzzyMeow/Luzzy-RpTRPG/issues)

</div>

---

## ✨ 关于 LUZZY · About

**LUZZY** 是一款面向 **AI 角色扮演（AI Roleplay）** 与 **TRPG 桌面角色扮演** 的移动端对话应用，专注 Android 原生体验，同时支持浏览器运行。

> **LUZZY** is a mobile-first conversation app for **AI roleplay** and **TRPG tabletop role-playing**, optimized for Android and also runnable in browsers.

围绕移动端交互、主题系统、角色卡生态与记忆机制进行了深度定制。

> Deeply customized for mobile interaction, theming, character cards, and memory systems.

---

## 🌟 核心亮点 · Highlights

<div align="center">

| 💬 沉浸式聊天 | 🎭 角色卡生态 | 🧠 长期记忆 | 🛠️ 工具系统 |
|:---:|:---:|:---:|:---:|
| CoT 思考链可视化（卡片化节点）<br>聊天页玻璃拟态沉浸背景<br>流式输出 · 翻译 · 重试分支 | SillyTavern PNG 导入/导出<br>世界书 · 正则脚本 · 收藏<br>滑动操作 · 头像预览 | ACE 三步循环记忆<br>向量相似度检索<br>嵌入去重与评分淘汰 | MCP / SKILL 扩展<br>内置记忆/搜索工具<br>多工具全局模式 |

</div>

### 14 个完整功能页面 · 14 Fully-Featured Pages

聊天 `Chat` · 角色卡 `Characters` · TRPG 模式 `TRPG` · 工具 `Tools` · 记忆 `Memory` · 预设 `Preset` · 世界书 `World Info` · 知识库 `Knowledge Base` · 正则脚本 `Regex` · UI 模板 `UI Template` · 用户档案 `Profile` · 设置 `Settings` · 技能 `Skill` · 关于 `About`

---

## 🏗️ 技术架构 · Tech Stack

### 前端 Frontend

- **Framework**: React 19.2.4 + TypeScript 5.9.2 + React Router 7.13.0（SPA）
- **Styling**: Tailwind CSS v4 + `tw-animate-css`（oklch 色彩空间）+ 液态玻璃设计
- **UI Kit**: shadcn/ui（New York）+ Radix UI
- **State**: Zustand 5.0.11（9-slice 架构）
- **Animation**: motion v12（Framer Motion）+ motion-presets
- **I18n**: i18next + react-i18next（中文 / English）
- **Build**: Vite 7.1.7 + pnpm + vite-plugin-svgr

### 服务层 Services

15 个核心服务覆盖完整业务：
`apiClient` · `chatService` · `storage` · `providerService` · `memoryService` · `toolService` · `presetContent` · `mcpService` · `markdownService` · `worldInfoService` · `knowledgeBaseService` · `sessionService` · `logger` · `aceSkillbookService` · `aceReflectorService` · `aceSkillManagerService`

- **本地持久化**: IndexedDB（`RPHubDB` v2，13 个 object store）
- **流式请求**: 双通道架构 — XHR 原生代理（Android）+ fetch ReadableStream（浏览器）
- **缓存层**: 通用响应缓存 30 min / Embedding 缓存 60 min
- **ACE 记忆**: Execute → Reflect → Update 三步循环，Skillbook JSON 持久化

### Android 原生 Android

- **Capacitor 8** 原生封装
- **NanoHTTPD** 本地代理（`localhost:18527`）解决 WebView CORS 与 POST body 拦截限制
- **最低/目标 SDK**: 由 `variables.gradle` 统一管理

---

## 🚀 快速开始 · Quick Start

### 环境要求 · Requirements

- Node.js 18+
- pnpm 9+
- Android Studio（Android SDK）
- Microsoft Visual C++ Redistributable（Windows AAPT2 依赖）

### 前端开发 · Frontend Dev

```bash
cd frontend
pnpm install
pnpm run typecheck   # 类型检查
pnpm run lint        # 代码检查
pnpm run dev         # 本地开发
pnpm run build       # 生产构建
```

### Android APK 构建 · Build APK

```powershell
# 1. 同步构建产物到 android/
npm run sync

# 2. 应用 Android 补丁（纯 Kotlin 架构，无需复制 MainActivity）
Copy-Item -Path "android-patches\AndroidManifest.xml" -Destination "android\app\src\main\AndroidManifest.xml" -Force
Copy-Item -Path "android-patches\build.gradle" -Destination "android\app\build.gradle" -Force

# 3. 编译 APK
cd android
.\gradlew.bat assembleDebug
```

📦 **输出路径**: `android/app/build/outputs/apk/debug/LUZZY-v0.5.9-debug.apk`

---

## 📂 项目结构 · Project Structure

```text
RP-Hub/
├── frontend/              # 前端源码
│   ├── app/
│   │   ├── components/    # UI 组件（luzzy / markdown / message / ui / workbench）
│   │   ├── routes/        # 14 个路由页面
│   │   ├── services/      # 业务服务层
│   │   ├── stores/        # Zustand store（9 slice）
│   │   ├── locales/       # 国际化
│   │   └── app.css        # 全局样式 + 字体 + 主题
│   └── public/fonts/      # Alibaba 字体
├── android/               # Android 原生工程
├── android-patches/       # Android 补丁文件
├── doc/                   # 参考文档与源码
├── scripts/               # 构建脚本
├── CHANGELOG.md
└── README.md
```

---

## 📰 最新动态 · What's New

### v0.5.7

CoT 思考卡片折叠 bug 修复（useRef 边沿检测替代 effect 覆盖）；输入框按钮垂直居中对齐；记忆召回工具解耦长期记忆设置（仅控制写入不阻止读取）；记忆页默认打开最近会话；Phase 1 工具决策提示词重写（多关键词拆分）；世界书工具增强（无嵌入模型降级为关键词搜索 + 中文 2-gram 拆分）；Android 流式输出帧率优化（每帧最多 3 行 + 16ms 帧间隔）。

> CoT card collapse fix (useRef edge detection replaces effect override); input button vertical centering; memory-recall tool decoupled from long-term memory setting (write-only gating); memory page defaults to most recent session; Phase 1 tool decision prompt rewritten (multi-keyword splitting); world info tool enhancements (no-embedding fallback to keyword search + Chinese 2-gram splitting); Android streaming frame rate optimization (max 3 lines per frame + 16ms frame interval).

### v0.5.4

流式输出深度修复：解决 Android 平台"一次性全部蹦出"问题。新增 XHR 异步队列处理（pendingChunks + 每 10 行让出主线程）、React.memo 避免全量重渲染、useDeferredValue 延迟 Markdown 解析（等价 rikkahub 的 mapLatest + flowOn(Default) 后台解析模式）、parseThinkingSteps 始终缓存。三请求架构修复：world-recall enabled 过滤、embedding 懒加载、abort 生命周期、parseCot reasoning 字段兼容。角色卡删除级联清理 6 类关联数据。

> Deep fix for streaming output: resolves Android "all-at-once" issue. Adds XHR async queue processing (pendingChunks + yield main thread every 10 lines), React.memo to prevent full re-renders, useDeferredValue for deferred Markdown parsing (equivalent to rikkahub's mapLatest + flowOn(Default)), and always-on parseThinkingSteps cache. Three-request architecture fixes: world-recall enabled filter, embedding lazy-load, abort lifecycle, parseCot reasoning field compatibility. Character card deletion now cascades to clean 6 categories of related data.

### v0.5.0

思考链卡片 UI 完全重构：二级节点改为独立玻璃卡片，工具调用与结果合并为单个节点，生成中节点脉冲高亮；修复工具卡片初始宽度收缩问题。聊天页顶部/底部升级为高级透明玻璃拟态，在保留自定义背景隐约可见的同时，功能按钮通过半透明胶囊容器保持清晰可点。

> Thinking chain cards fully rebuilt: secondary nodes become standalone glass cards, tool calls and results merge into single nodes, running nodes pulse-highlight; fixed initial tool-card width shrink. Chat page header/footer upgraded to advanced transparent glassmorphism, keeping custom backgrounds faintly visible while ensuring all action buttons remain clearly visible via semi-transparent capsule containers.

### v0.4.6

思考卡片完全流式输出（移除打字机延迟，参考 rikkahub 实现直接渲染完整字符串）；新增"继续剧情"按钮和 API 设置弹窗扩展（API Key + 模型配置）；修复分享功能（NativeBridge ClipData + 主线程 Handler）、角色卡导入（onShowFileChooser）、应用恢复白屏（WebView 生命周期 + SplashScreen）、取消 [] 高亮、角色卡侧边栏按钮可见性、详情弹窗滑动、Markdown 排版间距等问题。

> Thinking cards now fully stream output (removed typewriter delay, referencing rikkahub's approach of rendering complete strings directly); added "Continue Story" button and expanded API settings dialog (API Key + model config); fixed share functionality (NativeBridge ClipData + main thread Handler), character card import (onShowFileChooser), app resume white screen (WebView lifecycle + SplashScreen), removed [] highlight, character card sidebar button visibility, detail dialog scrolling, Markdown spacing, and more.

### v0.4.2

修复 TRPG 模式火山方舟 API 转发失败问题（`MainActivity.java` 正确使用 `resolveTargetBase()` 路由目标地址），新增代理回退死循环防护与火山方舟 Authorization 注入优化。重写 TRPG 说明弹窗，明确支持三种 API 配置场景：火山方舟自动转发、其他供应商需转发（`_target` 参数）、其他供应商直连。

> Fixes TRPG mode Volcano Ark API forwarding failure (`MainActivity.java` now correctly uses `resolveTargetBase()` to route target addresses), adds proxy fallback loop protection and Volcano Ark Authorization injection optimization. Rewrites TRPG notice dialog to clearly support three API configuration scenarios: Volcano Ark auto-forward, other providers needing forwarding (`_target` param), and other providers direct connection.

### v0.4.1

修复开场白不显示、流式输出正文空白、会话导出失败、世界书导入/滑动/导出 BUG、角色卡内 UI 模板/正则无法导入、导入角色卡未自动启用世界书等问题。新增两次独立 API 请求架构（CoT + 正文，KV 缓存保护）、会话分支动画、高亮颜色预览优化、日志记录增强等功能。

> Fixes opening message not displaying, streaming output empty content, session export failure, world info import/slide/export bugs, UI template/regex import from character card, and auto-enable world info on character card import. Adds two independent API request architecture (CoT + main content, KV cache protection), session branch animation, highlight color preview optimization, and log recording enhancement.

[查看完整更新日志 · See full changelog →](./CHANGELOG.md)

---

## 🤝 参与贡献 · Contributing

欢迎通过 [Issues](https://github.com/LuzzyMeow/Luzzy-RpTRPG/issues) 提交 Bug 反馈或功能建议。

> Bug reports and feature suggestions are welcome via [Issues](https://github.com/LuzzyMeow/Luzzy-RpTRPG/issues).

---

## 📄 许可证 · License

本项目采用 [CC BY-NC 4.0](./LICENSE) 许可协议。

> This project is licensed under [CC BY-NC 4.0](./LICENSE).

---

<div align="center">

**Made with 💜 by LuzzyMeow**

</div>
