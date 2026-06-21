<div align="center">

<img src="frontend/public/icons/icon-192.png" width="120" height="120" alt="LUZZY Logo" />

# LUZZY · 鹿溪

> **让每一次对话，都像翻开一本新的角色扮演小说。**
> 
> *Every conversation feels like opening a fresh role-playing novel.*

[![Version](https://img.shields.io/badge/version-v0.3.8-9d4edd?style=flat-square)](./CHANGELOG.md)
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

前端基于 [rikkahub]([https://github.com/lucky-rikkahub/rikkahub](https://github.com/rikkahub/rikkahub)) Web UI 重构，完整保留其成熟的后端业务逻辑，并在此基础上围绕移动端交互、主题系统、角色卡生态与记忆机制进行了深度定制。

> The frontend is rebuilt from [rikkahub]([https://github.com/lucky-rikkahub/rikkahub](https://github.com/rikkahub/rikkahub)) Web UI, preserving its proven backend logic while deeply customizing mobile interaction, theming, character cards, and memory systems.

---

## 🌟 核心亮点 · Highlights

<div align="center">

| 💬 沉浸式聊天 | 🎭 角色卡生态 | 🧠 长期记忆 | 🛠️ 工具系统 |
|:---:|:---:|:---:|:---:|
| CoT 思考链可视化<br>流式输出 · 翻译 · 重试分支<br>全屏 Markdown 编辑器 | SillyTavern PNG 导入/导出<br>世界书 · 正则脚本 · 收藏<br>滑动操作 · 头像预览 | ACE 三步循环记忆<br>向量相似度检索<br>嵌入去重与评分淘汰 | MCP / SKILL 扩展<br>内置记忆/搜索工具<br>多工具全局模式 |

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

# 2. 应用 Android 补丁
Copy-Item -Path "android-patches\MainActivity.java" -Destination "android\app\src\main\java\com\luzzymeow\luzzy\MainActivity.java" -Force
Copy-Item -Path "android-patches\AndroidManifest.xml" -Destination "android\app\src\main\AndroidManifest.xml" -Force
Copy-Item -Path "android-patches\build.gradle" -Destination "android\app\build.gradle" -Force

# 3. 编译 APK
cd android
.\gradlew.bat assembleDebug
```

📦 **输出路径**: `android/app/build/outputs/apk/debug/LUZZY-v0.3.8-debug.apk`

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

### v0.3.8

修复原生平台 API 请求失败、弹窗与设置页/角色编辑/关于页溢出等移动端显示问题。

> Fixes native API request failures and mobile overflow issues across dialogs, settings, character editor, and about page.

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
