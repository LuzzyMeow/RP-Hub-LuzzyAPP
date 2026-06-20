# Changelog

## v0.3.0

22 项优化/新增 + ACE 记忆机制重大升级 + 11 项工程约束 + 补充 Bug 修复。

### Bug 修复

- **思考深度"高"在内置供应商下生效**：`settings-slice.ts` 新增 `builtinThinkingDepthOverrides: Record<string, ThinkingDepth>` 覆盖映射，`setProviderThinkingDepth` 区分内置/自定义供应商分别存储，`getAllProviders` 合并 override 后返回，`extractPersistableData`/`loadFromStorage` 持久化覆盖映射。根因：内置供应商（DeepSeek 等）是 `BUILTIN_PROVIDERS` 不可变常量，原实现仅更新 `customApiProviders` 数组导致静默失败
- **思考深度扩展为 6 档**：`'minimal' | 'auto' | 'low' | 'medium' | 'high' | 'max'`，对应 UI 显示"关闭/自动/低/中等/高/极致"，`THINKING_DEPTH_TO_REASONING_EFFORT` 映射 OpenAI `reasoning_effort` 字段，`auto` 档位不发送 `reasoning_effort`（由模型自行决定）
- **聊天框切换页面变大**：`luzzy-chat-input.tsx` 挂载时重置 textarea 高度，切换页面再切回不再保留增高状态

### 新增功能

- **ACE 记忆机制**（Agentic Context Engineering，Phase I 重大升级）：
  - `AceSkill` / `AceSkillbook` / `AceReflection` / `AceExecutionTrace` 类型定义（`types/luzzy.ts`）
  - `aceSkillbookService.ts`：Skillbook JSON 持久化（`ace_skillbook` / `ace_skillbook_embeddings` 存储键）、`sortSkills` 确定性排序（active→score→updatedAt）、`tagSkill` 评分淘汰（auto 源策略连续 3 次 harmful 自动停用）、`deduplicateSkills` 嵌入去重（余弦相似度阈值 0.85）、`migrateFromLegacyGlobalMemory` 旧文本逐行迁移、`renderSkillbookForInjection` 渲染为 `- [category] content` 格式
  - `aceReflectorService.ts`：独立 `REFLECTOR_SYSTEM_PROMPT`（不注入 NSFW 预设内容，避免污染）、`buildReflectUserMessage` 格式化执行轨迹（200/300 字符摘要限制）、`parseReflectionJson` 剥离 markdown 代码块并校验 schema、`reflect` 调用 LLM 返回 `AceReflection`（失败返回空结果）
  - `aceSkillManagerService.ts`：`applyReflection` 执行 TAG→ADD→REMOVE 流程、`manualUpdateSkill`/`manualDeleteSkill` 手动操作、source='manual' 策略保护（不被自动移除/更新）、返回 `ApplyReflectionResult` 统计 taggedCount/addedCount/deactivatedCount
  - `chatService.ts` 注入逻辑改造：`BuildContextResult` 新增 `appliedSkillIds` 字段，section 3.6 ACE Skillbook 注入（空时回退旧 GlobalMemory），按策略逐条关键字匹配
  - `chat-slice.ts` 异步反思：extractMemory 后 `void (async () => {...})()` 非阻塞执行，构建执行轨迹→调用 reflector→应用 reflection 结果，全部 try/catch 失败静默
  - `memory.tsx` 卡片列表 UI：统计栏（总数/启用/停用）、`SkillCard` 组件（分类徽章+来源徽章+内容+评分显示+启用切换+编辑按钮）、`SkillEditDialog` 编辑面板（分类输入+内容 textarea+启用开关+统计+软删除/硬删除）、导出功能渲染为 markdown
- **关于页**（`/about`）：LOGO + 版本号 + 系统信息（设备型号/系统版本/WebView 版本/应用构建时间）+ 日志文件路径展示
- **日志系统**（`services/logger.ts`）：基于 Capacitor Filesystem，写入 `Directory.Documents/luzzy-logs/`，3 天自动清理，覆盖启动到关闭全过程，按级别（INFO/WARN/ERROR）分类
- **MCP 测试连接**：`mcpService.ts` 新增 `initializeMcpServer` + `listMcpTools`，设置页 MCP 配置项支持"测试连接"按钮，返回工具清单
- **自定义背景功能**：透明度滑块 + 模糊度滑块 + 切换同步（多设备）+ 导入默认背景，背景注入聊天页面
- **全屏编辑器**（`luzzy-fullscreen-editor.tsx`）：markdown 实时渲染预览 + 11 工具栏按钮（粗体/斜体/标题/列表/代码/引用/链接/分割线/表格/撤销/重做）
- **正则脚本组重构**：`RegexScriptGroup` → `RegexScriptEntry` 8 字段（scope/timing/paramReplace/depthRange/trimOut 等），正则助手 5 种一键填写模板，各时机（输入前/输出前/输出后）生效

### 功能增强

- **设置页优化**：
  - 供应商自定义显示名（20 字符限制）
  - 上下文长度支持 M/m 后缀（如 `128K` / `1M`）
  - 历史消息数限制 `historyMessageLimit`（Slider + Input，0=不限制）
  - 删除内置 Sta1N 供应商
  - 删除 API 地址"用户填什么就是什么"提示文字
  - JSON 配置优先于聊天栏思考深度（JSON 配置存在时聊天栏按钮置灰）
- **聊天页布局重构**：输入框自成一排，功能按钮第二排；回车不发送仅按钮发送；自动滚动附着 + 下箭头按钮
- **Agent 消息 Token 统计行**：生成中实时更新 + 完成定格，`luzzy-token-usage-bar.tsx` 组件
- **多提供商流式 usage 解析**：OpenAI（`usage.prompt_tokens`/`completion_tokens`）、Anthropic（`usage.input_tokens`/`output_tokens`）、Gemini（`usageMetadata.promptTokenCount`/`candidatesTokenCount`）三套解析逻辑
- **SKILL 导入完善**：GitHub 导入下载所有附属文件、ZIP 导入解析所有文件、YAML frontmatter `name` 字段识别
- **Agent 步骤二级卡片**：`luzzy-agent-steps.tsx` 渲染 `thinking | tool_call | tool_result | memory_inject | knowledge_call` 五种步骤类型，`running | completed | error` 三态
- **记忆召回同步全局记忆**：`chatService.ts` 记忆召回结果同步写入 GlobalMemory（ACE 模式下同步写入 Skillbook）
- **流式输出默认**：不支持流式的供应商降级为非流式
- **PNG 角色卡完整导入**：姓名 + 描述 + 初始消息 + 头像 + 世界书 + 正则脚本一次性导入
- **默认头像复制到项目内**：`public/avatars/luxi.png` 内置默认头像
- **TRPG iframe 缓存修复**：切换页面不刷新，`display: none/block` + `useLocation` 路由检测全局缓存
- **anysearch 官方链接**：工具页 anysearch 配置项添加官方文档链接

### UI 修复

- **图标尺寸协调**：侧边栏导航图标 `size-4` → `size-5`，正则页编辑/删除图标 `size-3` → `size-3.5`
- **启动屏简化**：`luzzy-splash.tsx` 移除猫咪 Logo（猫耳/猫头/眼睛/鼻子 SVG），仅保留 LUZZY 文字 + 呼吸光晕 + 粒子动画，文字 `text-4xl tracking-[0.2em]` → `text-5xl tracking-[0.3em]` 加 drop-shadow

### 工程约束

- NSFW 提示词原样保留（`presetContent.ts` git diff 为空）
- 用户数据不清空（迁移而非覆盖）
- 缓存高命中率（ACE 注入格式稳定：确定性排序 + 固定渲染格式 + 固定注入位置）
- liquid glass 设计 + game-icon-pack 图标
- AlibabaPuHuiTi-3 + AlibabaSans 字体
- 现代化丝滑动画（进入/交互/退出三态）
- typecheck + lint + build 零错误

### 静态审查

- **J1 代码审查**：typecheck 0 errors，lint 0 errors（6 个预存在 warnings）
- **J2 边界情况**：空 Skillbook → 不注入（优雅降级）；迁移失败 → 空 Skillbook；Reflector 失败 → 空结果；全部 try/catch 处理
- **J3 NSFW 保护**：`presetContent.ts` 未改动（git diff 空），ACE Reflector 使用独立 prompt 不含 NSFW 内容
- **J4 缓存命中保护**：ACE 注入格式稳定（确定性排序 + 固定渲染格式），注入位置固定在 systemPromptParts section 3.6

### 构建产物

- APK 文件：`android/app/build/outputs/apk/debug/LUZZY-v0.3.0-debug.apk`（24.21 MB）
- versionCode: 8, versionName: 0.3.0

## v0.2.0

全面功能升级：16 个领域深度完善，新增知识库/技能系统/用户档案/多供应商管理，性能优化与 CoT 思考链增强。

### 新增功能

- **知识库页面**（`/knowledge-base`）：知识库 CRUD、文件导入（图片转 base64，md/txt 读取文本）、基于关键词匹配或嵌入向量相似度检索
- **用户档案页面**（`/profile`）：多档案管理（新建/切换/删除）、头像上传（2MB 限制）、描述导入导出（.md 文件，系统分享优先）、名称和描述注入聊天 `[User Info]` 区块
- **设置页面重构**：供应商下拉框一级入口 + 二级详细配置、每供应商独立 API Key 和自定义请求体 JSON、API 类型选择（openai-compatible/google-gemini/anthropic-messages/openai-responses）、多模型配置（上下文长度/输出长度/能力开关）、模型长度支持数字和 K/M 后缀格式
- **多供应商路由**：`<providerId>_<modelName>` 前缀格式，`parseModelName`/`getApiUrlForModel`/`getApiKeyForModel`/`getActualModelName` 四个核心函数，供应商切换时自动保存/加载 customRequestBody

### 功能增强

- **角色卡页面**：SillyTavern PNG 角色卡兼容（tEXt chunk + base64 JSON）、世界书选择集成、角色卡编辑功能完善
- **TRPG 模式**：独立菜单栏入口、本地代理服务器（NanoHTTPD on localhost:18527）、iframe v-show 状态保持
- **工具页面重构**：内置工具配置（vector-memory/keyword-search/memory-recall/anysearch）、工具全局模式（force/active/adaptive）、角色绑定
- **记忆系统升级**：向量记忆分片、余弦相似度搜索、记忆压缩（保留最近 N 楼）、嵌入模型独立供应商配置
- **预设页面**：角色绑定、NSFW 预设内容原样保留、内置预设默认值
- **世界书页面**：SillyTavern 世界书 JSON 兼容、条目 CRUD、关键字/二级关键字/常量/顺序/位置/深度/概率配置
- **UI 模板页面**：角色绑定、背景注入（markdown/html/css 注入类型）、启用/禁用控制

### 性能与技术优化

- **帧率优化**：全局动画预设添加 `will-change` 提示（transform/opacity/height），侧边栏抽屉和遮罩层添加 `will-change`，菜单项入场动画添加 `will-change`
- **CoT 思考卡片**：可折叠组件，生成中默认展开/生成结束默认收起，用户手动切换后不再自动调整，收起时显示前 80 字符预览，AnimatePresence 平滑展开/收起动画，箭头图标指示状态
- **CoT 强制**：扩展 `parseCot` 标签匹配模式，支持 cot/think/thinking/reasoning/thought/thoughts/reflection/analysis 八种标签变体，确保所有模型的思考链都能被提取
- **KV 缓存层**：
  - `apiClient.ts` 新增通用响应缓存（`generateCacheKey`/`getCachedResponse`/`setCachedResponse`/`clearResponseCache`/`sendRequestWithCache`），TTL 30 分钟，最大 500 条目
  - `memoryService.ts` 新增 embedding 级缓存（`getCachedEmbedding`/`setCachedEmbedding`/`clearEmbeddingCache`），TTL 60 分钟，最大 1000 条目
  - `knowledgeBaseService.ts` 和 `sessionService.ts` 的 `getEmbeddingSimple` 集成 embedding 缓存

### 静态审查与收尾

- **图标迁移**：`regex.tsx`、`character-picker.tsx`、`code-block.tsx` 的 lucide-react 导入迁移至 game-icon-pack
- **TypeScript**：typecheck 零错误
- **Lint**：oxlint 零警告零错误
- **Build**：Vite 构建成功，31 chunks，~280KB gzip

### 构建产物

- APK 文件：`android/app/build/outputs/apk/debug/LUZZY-v0.2.0-debug.apk`（23.63 MB）
- versionCode: 6, versionName: 0.2.0

## v0.1.0

前端完全重构：基于 rikkahub web-ui 彻底重写全部 UI 层，保留全部后端业务逻辑。

### 重构内容

- **前端基础架构迁移**：从 @lobehub/ui + antd 6 迁移至 rikkahub web-ui 范式（React Router 7 SPA + Tailwind v4 + shadcn/ui New York + Radix UI）
- **技术栈升级**：
  - React 19.2.4 + TypeScript 5.9.2
  - React Router 7.13.0（SPA 模式，ssr: false）
  - Tailwind CSS v4 + tw-animate-css（oklch 色彩空间）
  - shadcn/ui（New York 风格，Radix UI 基础）
  - Zustand 5.0.11（合并 slice 模式，单一 app-store.ts）
  - ky 1.14.3（HTTP 客户端 + SSE）
  - motion v12（Framer Motion，动画体系）
  - i18next + react-i18next（中英双语）
  - Vite 7.1.7 + pnpm
- **10 大功能页面**：
  - `/` 聊天（chat.tsx）
  - `/characters` 角色卡（characters.tsx）
  - `/trpg` TRPG 模式（trpg.tsx）
  - `/tools` 工具（tools.tsx）
  - `/mine` 我的（mine.tsx）
  - `/memory` 记忆系统（memory.tsx）
  - `/preset` 预设管理（preset.tsx）
  - `/world-info` 世界书（world-info.tsx）
  - `/regex` 正则脚本（regex.tsx）
  - `/ui-template` UI 模板（ui-template.tsx）
  - `/settings` 设置（settings.tsx）
- **状态管理**：6 个 Zustand slice（Settings/Character/Chat/UI/ChatInput/Clock）合并为单一 app-store.ts
- **服务层**：10 个 service 文件完整保留（apiClient/chatService/storage/providerService/memoryService/toolService/presetContent/mcpService/markdownService/worldInfoService）
- **字体约束**：仅使用 AlibabaPuHuiTi-3（400/500/700）+ AlibabaSans（300/400/500/700/800/900），9 个 @font-face 声明，12 处 --font-* 变量替换
- **主题系统**：5 套预设主题（default/claude/t3-chat/mono/bubblegum）+ 自定义主题（CustomThemeDialog）
- **动画体系**：
  - 侧边栏 spring 物理滑入（luzzy-sidebar.tsx）
  - 菜单项 stagger 依次入场
  - 页面切换 AnimatePresence（luzzy-layout.tsx）
  - `prefers-reduced-motion: reduce` 全局降级
- **i18n**：zh-CN / en-US 双语，page.json 覆盖 10 大页面标题

### 静态审查优化

- **Lint 清理**：清理 7 个文件共 17 个 lint 警告（未使用导入/变量/参数），最终 0 警告 0 错误
- **可访问性**：添加 `@media (prefers-reduced-motion: reduce)` 全局规则，尊重用户系统减弱动态效果偏好
- **移动端适配**：添加 `env(safe-area-inset-top/bottom)` 安全区 padding，适配刘海屏/底部指示条
- **边界审查**：13 项边界情况全部核对通过（空状态/加载状态/错误状态/长文本截断/暗色模式对比度/API 错误处理/流式中断/IndexedDB 异常/内存泄漏/XSS 防护/路由 404）

### 关键修复

- **修复 APK 启动白屏**：`frontend/vite.config.ts` 的 `base` 由 `"./"` 改为 `"/"`。原相对 base 在 Capacitor Android WebView（`https://localhost/`）中，导致 React Router 7 SPA 模式的动态路由模块被解析为 `/assets/assets/xxx.js` 的重复路径而 404，应用永远卡在 HydrateFallback 加载动画。改为绝对 base 后，所有资源与动态 chunk 均使用 `/assets/xxx.js`，可正常解析。

### 保留项（18 项业务逻辑约束）

- 双通道流式请求（XHR 原生代理 + fetch 浏览器）
- API 请求体保护（model/messages 不可覆盖）
- SSE 推理内容兼容（7 种字段命名）
- /v3/embeddings 端点
- 嵌入供应商独立性
- PROTECTION_PATTERN（保护 HTML/CoT/代码块）
- 文风优先级提示
- 工具调用循环（最多 5 次迭代）
- 工具调用标签格式（<callLabel:query>）
- SillyTavern 角色卡兼容
- 9 个 IndexedDB object store（DB_NAME='RPHubDB'）
- 7 个内置供应商（sta1n 默认）
- 3 个内置预设（**NSFW 内容完整保留**）
- MCP Streamable HTTP 协议（2025-03-26 规范）
- CoT 标签解析（支持未闭合标签）
- DOMPurify 配置（FORBID_ATTR: [/^on/i]）
- 记忆压缩（保留最近 N 楼）
- 数据库自动重连（最多 3 次）

### 构建产物

- 前端生产构建成功（Vite 约 11s，输出 build/client/ + www/）
- 已应用 android-patches（MainActivity.java / app/build.gradle / AndroidManifest.xml），注意避免覆盖根目录 `android/build.gradle`
- Android Gradle Plugin 升级至 8.9.1（支持 androidx.activity:1.11.0）
- 编译输出：`android/app/build/outputs/apk/debug/LUZZY-v0.1.0-debug.apk`（约 24.97 MB）

## v0.0.4

侧边菜单栏改造、UI 错位修复与 5 个功能页面拆分为独立菜单项。

### 新增内容

- **侧边抽屉菜单**：移除底部固定 TabBar，改为左侧滑出抽屉式导航（`SideMenu.tsx`）。spring 物理动画滑入，半透明遮罩淡入，菜单项 stagger 依次入场。支持 ESC 关闭、遮罩点击关闭、导航后自动关闭
- **菜单按钮全覆盖**：所有 10 个页面 `AppHeader` 左侧新增菜单按钮（`onMenu` prop），点击展开侧边抽屉
- **5 个独立功能页面**：从「我的」页面拆出 5 个 Section 为独立路由页面，通过侧边菜单「高级功能」分组访问
  - `/memory` 记忆系统（`MemoryPage.tsx`）
  - `/preset` 预设管理（`PresetPage.tsx`）
  - `/world-info` 世界书（`WorldInfoPage.tsx`）
  - `/regex` 正则脚本（`RegexPage.tsx`）
  - `/ui-template` UI 模板（`UiTemplatePage.tsx`）
- **共享样式常量**：新建 `sharedPageStyles.ts`，提取 6 个页面共用的 `pageStyle`/`fieldColStyle`/`fieldLabelStyle` 等样式常量，避免重复
- **UI 状态 Store**：新建 `useUIStore.ts`（Zustand），管理侧边菜单开/关状态

### 修复内容

- **Switch thumb 垂直错位**：深度思考等开关的 thumb 圆点垂直偏移。根因是 CSS `transform: translateY(-50%)` 被 motion 的 `animate: { x }` 覆盖。修复方式：将垂直居中迁移到 motion 的 `y: '-50%'` 属性，并设置 `transition: { y: { duration: 0 } }` 避免 y 轴动画
- **CardGroupItem 图标错位**：leading 容器无固定尺寸，不同图标大小导致文字起始位置偏移。修复：添加 `width: 24, height: 24`
- **ChatPage 滚动按钮位置**：`bottom: 72`（为旧 TabBar 预留）改为 `calc(var(--safe-area-bottom) + 16px)`，贴合输入区上方
- **ChatPage 消息列表 padding**：水平 padding `12px` 改为 `16px`，与其他页面一致
- **MobileLayout 重复 SafeArea**：移除 AppTabBar 后底部 SafeArea 重复，已合并为单一 SafeArea

### 删除内容

- **AppTabBar.tsx**：底部固定导航栏组件，已被 SideMenu 替代，无任何引用

### 构建产物

- 前端生产构建成功（Vite 约 21s，31 个 chunk，gzip 总计约 280KB）
- Web 资源已同步到 `www/` 与 Android 工程
- 已应用 `android-patches`（MainActivity.java / build.gradle / AndroidManifest.xml）
- 编译输出：`android/app/build/outputs/apk/debug/LUZZY-v0.0.4-debug.apk`（20.13 MB）

## v0.0.3

全交互元素现代化动画补全与 v0.0.3 APK 构建。

### 新增内容

- **TRPG 页面动画**：Header 设置/帮助/刷新按钮统一为 `HeaderAction`；刷新图标点击旋转 360°；加载/错误状态切换使用 `AnimatePresence` 淡入淡出；配置/帮助弹窗增加 scale/slide 进入退出动画；弹窗按钮改为 `Pressable`
- **页面切换动画**：`App.tsx` 路由外层包裹 `AnimatePresence`，新页面从右滑入、旧页面向左滑出
- **全局可访问性动画降级**：`global.css` 新增 `@media (prefers-reduced-motion: reduce)` 规则，系统开启「减弱动态效果」时禁用 scale/位移动画
- **共享组件动画增强**：`components.css` 输入框 focus 加外发光，主/次按钮 active 下沉 scale，图标按钮 hover/active 背景过渡

### 构建产物

- 前端生产构建成功（Vite 约 24s）
- Web 资源已同步到 `www/` 与 Android 工程
- 已应用 `android-patches`（MainActivity.java / build.gradle / AndroidManifest.xml）
- 编译输出：`android/app/build/outputs/apk/debug/LUZZY-v0.0.3-debug.apk`

## v0.0.2

前端显示问题修复、可访问性增强、静态审查优化与 v0.0.2 APK 构建。

### 修复内容

- **按钮默认提交行为**：为所有非提交按钮统一添加 `type="button"`，避免在表单内误触提交导致页面刷新或状态异常
- **CoT 思考卡片键盘支持**：为思考卡片补充 `onKeyDown` 事件，支持 Enter / Space 展开或折叠
- **模态框 Escape 关闭**：新增 `useEscapeKey` Hook，并在消息菜单、角色编辑器、工具编辑器、TRPG 配置/帮助弹窗、预设/世界书/正则/UI 模板编辑器等所有覆盖层组件中接入
- **动态版本号**：关于页版本号改为从 `package.json` 实时读取，避免手动硬编码不同步
- **Android 构建版本**：`android-patches/build.gradle` 更新为 `versionCode 2` / `versionName "0.0.2"`

### 静态审查优化

- **依赖完整性**：将 `lucide-react` 显式写入 `frontend/package.json` 依赖，避免干净安装时因传递依赖缺失导致构建失败
- **ErrorCard 定时器稳定性**：使用 ref 缓存 `onClose` 引用，防止父组件重渲染导致自动消失定时器被反复重置
- **ChatPage 滚动性能**：移除流式输出滚动 effect 中多余的 `messages` 依赖，避免每次消息内容更新都触发滚动
- **CoT 可访问性**：补充 `aria-expanded` 与 `aria-label`，提升屏幕阅读器体验

### 构建产物

- 前端生产构建成功（Vite 约 37s）
- Web 资源已同步到 `www/` 与 Android 工程
- 已应用 `android-patches`（MainActivity.java / build.gradle / AndroidManifest.xml）
- 已重新生成 5 密度 Android 图标
- 编译输出：`android/app/build/outputs/apk/debug/LUZZY-v0.0.2-debug.apk`（约 20.1 MB）

## v0.0.1

前端彻底重构版本。

### 重构内容

- **设计系统**：采用 rikkahub Sakura 暖色 Material 3 视觉语言，CSS 变量驱动主题 token
- **UI 组件库**：全面迁移至 @lobehub/ui 5.15.17（mobile/TabBar、chat/ChatList、Markdown 等）
- **字体**：仅使用 AlibabaPuHuiTi-3 + AlibabaSans
- **页面**：5 个页面全部重写（Chat / Characters / TRPG / Tools / Mine）
- **通用组件**：CardGroup / CardGroupItem / Tag / Switch / ErrorCard（rikkahub 范式复刻）
- **业务逻辑层**：完整保留 services/ + store/ + types/，零改动
- **工作区清理**：删除旧 Vue3 残留（assets/、character/、根 index.html）
- **版本号**：统一回退到 v0.0.1
