<div align="center">

<img src="frontend/public/brand-logos/deepseek.png" width="72" height="72" alt="DeepSeek" />&nbsp;&nbsp;&nbsp;
<img src="frontend/public/brand-logos/zai.png" width="72" height="72" alt="Z.ai · 智谱清言" />&nbsp;&nbsp;&nbsp;
<img src="frontend/public/brand-logos/luzzy.png" width="72" height="72" alt="LUZZY" />&nbsp;&nbsp;&nbsp;
<img src="frontend/public/brand-logos/kimi.png" width="72" height="72" alt="Kimi · 月之暗面" />&nbsp;&nbsp;&nbsp;
<img src="frontend/public/brand-logos/trae.png" width="72" height="72" alt="Trae" />

# LUZZY · 鹿溪

> **每次对话，都像一本有你的小说。**

[![Version](https://img.shields.io/badge/version-v0.8.2-9d4edd?style=flat-square)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-ffb703?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-219ebc?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119eff?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

[📦 下载 APK](https://github.com/LuzzyMeow/Luzzy-RpTRPG/releases/latest) · [📜 更新日志](./CHANGELOG.md) · [🐛 提交问题](https://github.com/LuzzyMeow/Luzzy-RpTRPG/issues)

</div>

---

## 关于 · About

**LUZZY** 是一款移动端 AI 角色扮演应用，将 LLM 的推理能力与 TRPG 规则引擎深度融合。玩家在 AI 主持人驱动的叙事中冒险，系统自动管理战斗检定、社交互动、记忆压缩与世界状态——所有游戏数据面板只读，变更通过叙事 → OOC 审查 → 引擎工具的管线流转。

> **LUZZY** is a mobile-first AI roleplay app that deeply fuses LLM reasoning with a TRPG rules engine. Players adventure in AI-Game-Master-driven narratives while the system manages combat checks, social interactions, memory compression, and world state — all game data panels are read-only; mutations flow through a narrative → OOC review → engine tool pipeline.

### 核心能力

| 能力 | 描述 |
|------|------|
| **TRPG 引擎** | D&D 5e 规则：攻击/施法/闪避/冲刺、社交检定（态度 DC ±2 漂移）、短休/长休（生命骰 + 法术位 + 力竭）、升级（职业骰 + ASI） |
| **三段推理** | 从 `reasoning_content` 解析 Think-1（情节分析）/ Think-2（行动规划）/ OOC 审查 JSON，合并 TS 端规则检查 |
| **OOC 审查** | 7 项检查：元游戏 / 知识越界 / 角色扮演（LLM 审查）+ 力竭 / 物品 / 安全（TS 审查）+ 内容分级（自动放行） |
| **三级摘要** | A 级每轮生成（≤50）/ B 级每 10 轮（≤10）/ C 级每 50 轮（永久） |
| **行为评分** | Think-4：公平性 0.35 + 一致性 0.25 + 后果 0.25 + 连贯性 0.15，≥6.0 通过 / ≥3.0 重试 / <3.0 警告 |
| **Agentic 工具** | 多步循环（≤20 步），首次 `tool_choice: 'required'` 强制调用，被动工具预执行过滤，`Set` 去重防环 |
| **角色卡生态** | SillyTavern PNG 导入/导出、世界书三策略召回、正则脚本、UI 模板、收藏 |
| **长期记忆** | ACE 三步循环（Execute → Reflect → Update）、向量相似度检索、嵌入去重与评分淘汰 |

### 14 个功能页面

`Chat` · `Characters` · `TRPG` · `Tools` · `Memory` · `Preset` · `World Info` · `Knowledge Base` · `Regex` · `UI Template` · `Profile` · `Settings` · `Skill` · `About`

---

## 技术栈 · Tech Stack

| 层 | 选型 |
|----|------|
| **框架** | React 19.2.4 · TypeScript 5.9.2 · React Router 7.13.0（SPA） |
| **样式** | Tailwind CSS v4（oklch）· tw-animate-css · 液态玻璃设计 |
| **组件** | shadcn/ui（New York）· Radix UI |
| **状态** | Zustand 5.0.11（9-slice 架构）· IndexedDB（`RPHubDB` v2，13 store） |
| **动画** | motion v12（Framer Motion）· motion-presets |
| **国际化** | i18next · react-i18next（中文 / English） |
| **构建** | Vite 7.1.7 · pnpm · vite-plugin-svgr |
| **Android** | Capacitor 8 · NanoHTTPD 本地代理（`localhost:18527`） |

### 服务层

15 个核心服务：`apiClient` · `chatService` · `storage` · `providerService` · `memoryService` · `toolService` · `presetContent` · `mcpService` · `markdownService` · `worldInfoService` · `knowledgeBaseService` · `sessionService` · `logger` · `aceSkillbookService` · `aceReflectorService` · `aceSkillManagerService`

- **双通道流式**：XHR 原生代理（Android）+ fetch ReadableStream（浏览器）
- **缓存**：响应缓存 30 min / Embedding 缓存 60 min
- **ACE 记忆**：Execute → Reflect → Update 三步循环，Skillbook JSON 持久化

---

## 快速开始 · Quick Start

### 环境要求

Node.js 18+ · pnpm 9+ · Android Studio（Android SDK）· MSVC++ Redistributable（Windows AAPT2）

### 前端开发

```bash
cd frontend
pnpm install
pnpm run typecheck   # 类型检查
pnpm run lint        # 代码检查
pnpm run dev         # 本地开发
pnpm run build       # 生产构建（自动同步到 android/assets）
```

### Android APK

```powershell
cd android
.\gradlew.bat assembleDebug
```

📦 **输出**：`android/app/build/outputs/apk/debug/LUZZY-v{version}-debug.apk`

---

## 项目结构

```text
RP-Hub/
├── frontend/app/
│   ├── components/    # UI 组件（luzzy / markdown / message / ui / workbench）
│   ├── routes/        # 14 个路由页面
│   ├── services/      # 15 个核心服务
│   ├── stores/        # Zustand store（9 slice）
│   ├── locales/       # zh-CN / en-US
│   └── app.css        # 全局样式 + 字体 + 明暗主题
├── android/           # Capacitor 8 原生工程
├── doc/               # 参考文档 · 字体 · D&D SRD · 品牌资源
│   └── brand-logos/   # 合作品牌 logo
└── scripts/           # 构建脚本
```

---

## 最新动态

### v0.8.2

移除从未启用的配色预设系统（claude / t3-chat / mono / bubblegum / custom），净减 753 行。`ThemeProvider` 227→92 行，`app.css` 766→274 行。修复 Sheet 关闭按钮刘海屏安全区适配。

### v0.8.1

Agentic 多步工具调用循环（≤20 步），`tool_choice: 'required'` 强制调用 + 自动回退，被动工具过滤，`Set` 去重防环。默认模式 force→active。

### v0.8.0

TRPG 模式：D&D 5e 引擎、Think-1/2/OOC 三段推理、A/B/C 三级摘要、Think-4 行为评分、战斗/社交/休息/升级规则、NPC 渐进式解锁。

### v0.7.2

单阶段架构重构：合并工具决策与 CoT/正文为单次 API 调用。世界书三策略混合召回。

[完整更新日志 →](./CHANGELOG.md)

---

## 鸣谢

<div align="center">

| 品牌 | 说明 |
|:---:|------|
| [**DeepSeek**](https://deepseek.com) | 深度求索 — reasoning 深度思考能力 |
| [**Z.ai · 智谱清言**](https://z.ai) | 智谱 AI — GLM 系列大模型 |
| [**Kimi · 月之暗面**](https://kimi.com) | Moonshot AI — 长上下文窗口支持 |
| [**Trae**](https://www.trae.ai/) | 字节跳动 — IDE 与 Work 开发工具 |

</div>

---

## 许可证

[CC BY-NC 4.0](./LICENSE)

---

<div align="center">

**Made with 💜 by LuzzyMeow**

</div>
