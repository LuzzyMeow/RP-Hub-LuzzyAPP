# LUZZY

AI 角色扮演与 TRPG 对话应用，专注移动端 Android 体验。前端基于 [rikkahub](https://github.com/lucky-rikkahub/rikkahub) web-ui 重构，保留全部后端业务逻辑。

## 技术栈

### 前端

- React 19.2.4 + TypeScript 5.9.2
- React Router 7.13.0（SPA 模式，ssr: false）
- Tailwind CSS v4 + tw-animate-css（oklch 色彩空间）
- shadcn/ui（New York 风格，Radix UI 基础）
- Zustand 5.0.11（9 slice 合并模式：Settings/Character/Chat/UI/ChatInput/Clock/Session/KnowledgeBase/Skill）
- motion v12（Framer Motion 动画，motion-presets 预设体系）
- i18next + react-i18next（中英双语）
- Vite 7.1.7 + pnpm
- vite-plugin-svgr 4.5.0（SVG 转 React 组件，game-icon-pack CC0 图标包）

### 后端服务层（完整保留）

- 15 个 service：apiClient / chatService / storage / providerService / memoryService / toolService / presetContent / mcpService / markdownService / worldInfoService / knowledgeBaseService / sessionService / logger / aceSkillbookService / aceReflectorService / aceSkillManagerService
- IndexedDB 本地持久化（DB_NAME='RPHubDB'，DB_VERSION=2，13 个 object store）
- 双通道流式请求（XHR 原生代理 + fetch 浏览器）
- KV 缓存层（通用响应缓存 + embedding 级缓存）
- ACE 记忆机制（Skillbook JSON 持久化 + 嵌入去重 + 评分淘汰 + 三步循环 Execute→Reflect→Update）
- 文件日志系统（Capacitor Filesystem，Directory.Documents，3 天自动清理）

### Android

- Capacitor 8（Android 原生封装）
- Android Gradle Plugin 8.9.1
- 最低 SDK / 目标 SDK 由 variables.gradle 配置
- NanoHTTPD 本地代理（TRPG 模式 localhost:18527）

## 核心功能

### 14 大功能页面

- **聊天**（`/`）：多轮对话，CoT 思考过程可折叠展示，工具调用卡片，记忆召回，流式输出，重试分支，翻译，消息操作，全屏编辑器（垂直分栏 + 同步滚动 + markdown 工具栏），Agent 步骤二级卡片，Token 统计行
- **角色卡**（`/characters`）：导入/编辑/删除，SillyTavern PNG 角色卡兼容（tEXt chunk + base64 JSON，完整导入姓名+描述+初始消息+头像+世界书+正则），PNG 导出（逆向导出 + 世界书同步写入 + 保存到相册），单击跳转聊天（自动切换最近会话/新建），头像点击预览大图，左滑删除/右滑编辑，世界书选择集成，收藏，对话示例注入提示词，非中英文内容字体降级
- **TRPG 模式**（`/trpg`）：独立菜单入口，内置 NanoHTTPD 本地代理解决 WebView CORS，iframe v-show 状态保持，切换页面不刷新
- **工具**（`/tools`）：内置工具配置（vector-memory/keyword-search/memory-recall/anysearch），工具全局模式（force/active/adaptive 纵向长条形排列），角色绑定，anysearch 官方链接 + token 配置，MCP JSON 导入（支持 Claude Desktop/Cursor 嵌套格式），MCP 测试连接
- **记忆**（`/memory`）：ACE Skillbook 卡片列表 UI（分类徽章+来源徽章+评分+启用切换+编辑面板），向量记忆分片，余弦相似度搜索，嵌入模型独立供应商配置，旧 GlobalMemory 自动迁移
- **预设**（`/preset`）：角色绑定，NSFW 预设内容原样保留，内置预设默认值（第三人称默认关闭），禁用预设不注入
- **世界书**（`/world-info`）：SillyTavern 世界书 JSON 兼容，条目 CRUD，关键字/二级关键字/常量/顺序/位置/深度/概率配置，字段一个一排布局
- **知识库**（`/knowledge-base`）：知识库 CRUD，文件导入（图片转 base64，md/txt 读取文本），手动新建 md 文件，关键词匹配或嵌入向量相似度检索
- **正则脚本**（`/regex`）：RegexScriptEntry 8 字段（scope/timing/paramReplace/depthRange/trimOut 等），正则助手 5 种一键填写模板，各时机生效
- **UI 模板**（`/ui-template`）：角色绑定，背景注入（markdown/html/css 注入类型），全屏编辑
- **用户档案**（`/profile`）：多档案管理，头像上传，描述导入导出，描述全屏编辑，名称和描述注入聊天
- **设置**（`/settings`）：供应商下拉框 + 多模型配置，API 类型选择，深度思考 6 档（关闭/自动/低/中等/高/极致），主题精简，MCP 测试连接，自定义背景，弹窗输入法适配
- **技能**（`/skill`）：技能系统管理，GitHub/ZIP 导入（自动解析 YAML name），YAML name 识别
- **关于**（`/about`）：LOGO + 版本号 + 系统信息 + 日志文件路径

### 多供应商架构

- 7 个内置供应商 + 自定义供应商
- `<providerId>_<modelName>` 前缀路由格式
- 4 种 API 类型：openai-compatible / google-gemini / anthropic-messages / openai-responses
- 每供应商独立 API Key 和自定义请求体 JSON
- 嵌入供应商独立性（URL 与 Key 同源）
- 供应商切换时自动保存/加载 customRequestBody

### CoT 思考链系统

- 可折叠 CoT 卡片（生成中默认展开/结束默认收起）
- 强制匹配 8 种标签变体：cot/think/thinking/reasoning/thought/thoughts/reflection/analysis
- 原生 reasoning_content + 内容标签双路解析
- AnimatePresence 平滑展开/收起动画
- 思考深度 6 档（关闭/自动/低/中等/高/极致），映射 OpenAI `reasoning_effort` 字段
- 内置供应商思考深度覆盖映射（`builtinThinkingDepthOverrides`）

### ACE 记忆机制

- **Skillbook JSON 持久化**：`ace_skillbook` / `ace_skillbook_embeddings` 存储键
- **三步循环**：Execute（注入 active 策略）→ Reflect（LLM 评估）→ Update（TAG/ADD/REMOVE）
- **评分淘汰**：auto 源策略连续 3 次 harmful 自动停用
- **嵌入去重**：余弦相似度阈值 0.85
- **数据迁移**：旧 GlobalMemory 逐行转换为 AceSkill 条目
- **manual 策略保护**：手动添加的策略不被自动移除/更新
- **独立运行不污染**：Reflector 使用独立 system prompt，不注入 NSFW 预设内容

### 缓存层

- **通用响应缓存**：apiClient.ts，TTL 30 分钟，最大 500 条目
- **Embedding 缓存**：memoryService.ts，TTL 60 分钟，最大 1000 条目，跨服务共享（knowledgeBaseService / sessionService）

### 主题系统

- 浅色 / 深色 / 跟随系统
- oklch 色彩空间
- 液态玻璃设计（glassmorphism）三态丝滑动画

### 字体

- **仅使用** AlibabaPuHuiTi-3（400/500/700）+ AlibabaSans（300/400/500/700/800/900）
- 9 个 @font-face 声明

### 图标

- game-icon-pack CC0 协议图标包，295 个 SVG
- 封装为 forwardRef React 组件（luzzy-icons.tsx）
- 所有业务页面已迁移至 game-icon-pack

## 构建

### 环境要求

- Node.js 18+
- pnpm 9+
- Android Studio（用于 Android SDK）
- Microsoft Visual C++ Redistributable（Windows AAPT2 依赖）

### 前端构建

```bash
cd frontend
pnpm install
pnpm run typecheck  # 类型检查
pnpm run lint       # 代码检查
pnpm run build      # 生产构建，输出 build/client/
```

### Android APK 构建

```powershell
# 1. 前端构建（重新生成 dist 带 hash）
cd frontend
pnpm run build

# 2. 同步到 www/ + Capacitor 同步
cd ..
npm run sync

# 3. 应用 android-patches（注意：不要直接复制整个目录，否则会覆盖根 build.gradle）
Copy-Item -Path "android-patches\MainActivity.java" -Destination "android\app\src\main\java\com\luzzymeow\luzzy\MainActivity.java" -Force
Copy-Item -Path "android-patches\AndroidManifest.xml" -Destination "android\app\src\main\AndroidManifest.xml" -Force
Copy-Item -Path "android-patches\build.gradle" -Destination "android\app\build.gradle" -Force

# 4. 编译 APK
cd android
.\gradlew.bat assembleDebug
```

**APK 输出**：`android/app/build/outputs/apk/debug/LUZZY-v0.3.3-debug.apk`

## 项目结构

```
RP-Hub/
├── frontend/                    # 前端源码
│   ├── app/
│   │   ├── components/
│   │   │   ├── luzzy/           # LUZZY 业务组件
│   │   │   ├── markdown/        # Markdown 渲染
│   │   │   ├── message/         # 消息组件
│   │   │   ├── ui/              # shadcn/ui 基础组件
│   │   │   └── workbench/       # 工作台
│   │   ├── routes/              # 14 个路由页面
│   │   ├── services/            # 15 个服务文件（含 ACE 三件套 + logger）
│   │   ├── stores/              # Zustand store（9 slice 合并）
│   │   ├── types/               # TypeScript 类型定义
│   │   ├── locales/             # i18n（zh-CN / en-US）
│   │   ├── hooks/               # React Hooks
│   │   ├── lib/                 # 工具库（motion-presets 等）
│   │   ├── app.css              # 全局样式 + 字体 + 主题变量
│   │   ├── routes.ts            # 路由配置
│   │   └── root.tsx             # 根组件
│   ├── public/fonts/            # Alibaba 字体文件
│   └── package.json
├── android/                     # Android 原生工程
├── android-patches/             # Android 补丁文件
├── doc/                         # 参考文档与源码
├── scripts/                     # 构建脚本
├── CHANGELOG.md
└── README.md
```

## 近期更新

### v0.3.3

9 项 Bug 修复 + 8 项新增功能 + 3 项功能增强。主要改动包括：设置页/关于页溢出修复（min-h-0）、503 API 配置错误修复（AndroidProxy 推送）、聊天页复制/置底按钮/翻译动画修复、会话跨启动持久化、滑动卡片组件（用户档案 + 角色卡左滑删除/右滑编辑）、翻译功能设置页（12 种主流语言快速选项 + 提示词编辑 + 占位符校验）、默认工具配置优化（force 模式 + 三个记忆工具默认启用）、记忆页滚动 + 保存动画优化。

详见 [CHANGELOG.md](./CHANGELOG.md)。

### v0.3.2

工具页 MCP 自动测试 + SKILL GitHub 修复；设置页 API Key 校验 + 内置 URL 持久化 + 溢出修复；聊天页会话左滑删除/右滑分享（MD/JSON/PNG）+ 全屏编辑器双向滚动 + 标题 H1/H2/H3；角色页字体降级 + 世界书自动关联；用户档案页多档案管理重构；全面日志系统 + TRPG WebView 缓存优化。

详见 [CHANGELOG.md](./CHANGELOG.md)。

### v0.3.1

13 项 Bug 修复 + 8 项新增功能 + 7 项功能增强 + 全局弹窗输入法适配 + ICON 一致性优化。主要改动包括：聊天页全屏编辑器垂直分栏、对话示例注入提示词、知识库新建 md 文件、UI 模板/用户档案全屏编辑、全局弹窗输入法适配（VisualViewport）、MCP JSON 多格式支持、预设注入过滤、ICON 大小一致性优化。

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

CC BY-NC 4.0
