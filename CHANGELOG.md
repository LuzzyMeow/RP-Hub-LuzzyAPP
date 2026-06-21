# Changelog

## v0.3.3

### 🐛 Bug 修复

- **设置页/关于页溢出**：`luzzy-layout.tsx` 主内容区添加 `min-h-0`，修复嵌套 flex 容器内容超出屏幕范围
- **设置页/关于页二次溢出修复**：`textarea.tsx` 默认改为 `field-sizing-fixed` + `min-w-0`；`settings.tsx` 所有 `Card` 添加 `min-w-0`，自定义供应商列表改为 `grid-cols-[minmax(0,1fr)_auto]`；`about.tsx` 所有 `Card` 添加 `min-w-0 overflow-hidden`，系统信息表格改为固定列宽 `grid-cols-[4.5rem_minmax(0,1fr)]`，日志路径 `code` 改为 `block`，`ScrollArea` viewport 添加 `min-w-0`
- **503 API 配置错误**：`root.tsx` 新增 useEffect 在 apiUrl/apiKey 变化时推送配置到 `window.AndroidProxy.setApiConfig`，解决 TRPG 模式下 NanoHTTPD 代理 503 错误
- **聊天页复制功能**：`luzzy-chat-message.tsx` 使用 `copyTextToClipboard` 工具（execCommand fallback）替代 `navigator.clipboard.writeText`，修复 Android WebView 复制失败
- **会话持久化**：`app-store.ts` PERSIST_KEYS 新增 `currentCharacterUuid`、`currentSessionId`，`chat.tsx` 启动时恢复上次角色与会话消息，模型选择保持不变
- **翻译功能动画反馈**：`luzzy-chat-message.tsx` 新增 `translating` 状态 + `spinning` prop，翻译按钮显示旋转动画 + "翻译中"文字
- **创建分支无效**：`chat-slice.ts` `createBranch` 增强为截取消息 + 创建新会话 + 设置分支标题 + 切换到新会话
- **选择复制无效**：`luzzy-chat-message.tsx` 新增 `rawCopyDialogOpen` 二级弹窗 + `handleCopyRaw` 使用 `copyTextToClipboard`
- **关于页日志溢出**：`about.tsx` 日志容器改为 `max-h-[300px] overflow-auto` + `wordBreak: break-all` + `overflowWrap: anywhere`，长日志滑动预览
- **置底按钮不生效**：`chat.tsx` 移除 `LuzzyChatInput` 内旧按钮，新增浮动按钮在聊天区 `absolute bottom-24 right-4 z-30`，使用 `useStickToBottom` 的 `scrollToBottom()` + `isAtBottom` 状态

### ✨ 新增功能

- **滑动卡片组件**：`swipe-card.tsx` 新增可复用组件（左滑删除 + 右滑编辑），motion drag + useMotionValue + useTransform 丝滑动画
- **用户档案滑动交互**：`profile.tsx` 卡片改为 SwipeCard（左滑删除/右滑编辑），移除 hover-only 图标按钮
- **角色卡滑动交互**：`characters.tsx` 卡片改为 SwipeCard（左滑删除/右滑编辑），原"更多"按钮改为分享按钮（IconShare）
- **翻译功能设置**：`settings.tsx` 新增翻译功能卡片：启用开关 + 12 种主流语言快速选项 + 自定义语言输入 + 提示词模板编辑（含占位符校验）+ 恢复默认 + 保存动画
- **默认工具配置**：`settings-slice.ts` 默认工具全局模式改为 `force`，vector-memory/keyword-search/memory-recall 默认启用
- **嵌入模型提示**：`tools.tsx` vector-memory 工具启用但未配置嵌入模型时显示琥珀色警告横幅
- **记忆页滚动优化**：`memory.tsx` 整页包裹 ScrollArea，移除内层 ScrollArea，展开记忆设置后可正常滑动
- **记忆保存动画**：`memory.tsx` 保存按钮新增 loading 动画 + 未配置嵌入模型时文字提示

### 🚀 功能增强

- **翻译设置持久化**：翻译语言与提示词通过 `translationSettings` 持久化到 localStorage，跨启动保留
- **提示词占位符校验**：保存翻译提示词时校验必须包含 `{message}` 和 `{language}` 占位符
- **未保存修改提示**：翻译提示词有未保存修改时显示琥珀色"未保存的修改"文字
- **版本号升级**：v0.3.2 → v0.3.3（package.json + build.gradle versionCode 11 + about.tsx）

## v0.3.2

### 🐛 Bug 修复

- **工具页**：MCP 工具导入后自动测试连接，卡片显示连接状态徽章
- **工具页**：SKILL GitHub URL 导入修复，保存按钮 loading 状态，错误明确提示
- **设置页**：API Key 空值校验，内置供应商 URL 修改后持久化保存（builtinUrlOverrides）
- **设置页/关于页**：URL 输入框和日志路径溢出修复（font-mono + maxLength + min-w-0）
- **聊天页**：模型选择弹窗框选修复（onOpenAutoFocus preventDefault）
- **聊天页**：底部 4 个 icon 尺寸统一为 size-5
- **全屏编辑器**：换行符生效（remark-breaks import 修复）+ 双向同步滚动
- **角色页**：世界书字段映射修复（keys/insertion_order vs key/order 兼容）
- **角色页**：非中英文文本字体降级（CJK 回退字体链：Noto Sans CJK SC/KR/JP + Malgun Gothic + Yu Gothic）
- **markdown**：remark-breaks import 缺失修复
- **chat-slice**：API Key/URL 空值校验返回类型修复（isStreaming → isGenerating）

### ✨ 新增功能

- **聊天页**：会话列表左滑删除、右滑分享（motion drag 手势动画，阈值 80px）
- **聊天页**：会话分享支持 MD/JSON/PNG 三种格式（html-to-image 长截图，动态 import）
- **聊天页**：分享前可勾选消息（全选/全不选/单条勾选），两步式分享对话框
- **全屏编辑器**：标题工具支持 H1/H2/H3 循环切换
- **全屏编辑器**：全屏 icon 靠右居中
- **全面日志**：应用启动 + 路由变化 + 关键操作（发送/删除/切换/导入/保存/测试连接）日志记录
- **内置 URL 持久化**：内置供应商 URL 修改后自动保存应用

### 🚀 功能增强

- **TRPG 页**：WebView 缓存模式 LOAD_DEFAULT + iframe srcSet localStorage 持久化，避免冷启动重新下载
- **角色页**：世界书导入后自动关联角色（extensions.worldInfoId）
- **角色页**：聊天时按角色过滤世界书条目（仅加载当前角色关联的 + 全局无 bookId 的）
- **用户档案页**：多档案管理重构（默认档案激活开关 + 新增档案置灰逻辑 + 删除最后一个档案自动回退默认）

### 📦 技术债务

- 修复 settings-slice.ts 缺少 builtinUrlOverrides 初始值
- 修复 luzzy-chat-input.tsx 两个 icon 尺寸未统一
- logger 全局初始化迁移至 root.tsx，about.tsx 移除冗余 initLogger 调用
- 修复 chat.tsx/settings.tsx/tools.tsx/characters.tsx 缺少 logger import 导致 typecheck 失败

## v0.3.1

13 项 Bug 修复 + 8 项新增功能 + 7 项功能增强 + 全局弹窗输入法适配 + ICON 一致性优化。

### Bug 修复

- **设置页删除按钮可见性**：`settings.tsx` 移除 `opacity-0 group-hover:opacity-100`，移动端无 hover 也能始终显示删除按钮；按钮尺寸从 `size-7` 调整为 `size-8`，图标从 `size-3.5` 调整为 `size-4`
- **角色卡删除确认**：`characters.tsx` 原生 `confirm()` 替换为 `useConfirm()` AlertDialog，统一全局弹窗风格
- **聊天页置底箭头**：`chat.tsx` 改用直接 `scrollRef.current.scrollTo({ top: scrollHeight, behavior: "smooth" })`，修复 `useStickToBottom` API 不生效问题
- **聊天页发送按钮布局**：`luzzy-chat-input.tsx` 发送按钮移至第一排与聊天框同行，全屏按钮嵌入聊天框内右侧，发送 icon 从 `IconSend` 更换为 `IconPlane`（game-icon-pack）
- **聊天页未配置 API 提示**：`chat.tsx` 新增居中卡片式提示（`IconExclamation` + "前往设置"按钮 + Motion 动画），替代原有 toast
- **聊天页全屏编辑器分栏**：`luzzy-fullscreen-editor.tsx` 从水平分栏改为垂直分栏（上下各 `h-1/2`），添加同步滚动，工具栏新增标题工具（`IconFont`）和分割线工具（`IconMinus`）
- **聊天页右上角删除按钮**：`chat.tsx` 移除无用的"清空消息"按钮（`IconTrash`）
- **全局 confirm() 替换**：13 个文件 17 处原生 `confirm()` 全部替换为 `useConfirm()` AlertDialog（characters/regex/tools/chat/profile/ui-template/knowledge-base/world-info/preset/all-sessions-list）
- **预设注入过滤**：`chatService.ts` 新增 `p.enabled !== false` 过滤条件，禁用的预设不再注入模型消息
- **MCP JSON 导入格式适配**：`mcpService.ts` 新增 `parseMcpImportJsonMulti` 支持 `{mcpServers: {name: {url}}}` Claude Desktop/Cursor 嵌套格式，stdio 格式检测并提示

### 新增功能

- **对话示例注入**：`chatService.ts` 新增 `dialogueExamples` 注入逻辑，角色卡的对话示例以 `<example>` 标签格式注入提示词，确保 agent 可见并生效
- **anysearch token 配置**：`tools.tsx` 新增 anysearch API token 输入框（`Input type="password"`），`toolService.ts` 新增 `executeAnysearchSearch` 函数调用 `https://api.anysearch.com/v1/search`，支持 Bearer token 认证和匿名访问
- **知识库新建 md 文件**：`knowledge-base.tsx` 文件列表页新增"新建文件"按钮，支持输入文件名（自动补 .md 后缀）和内容，保存到 IndexedDB
- **UI 模板全屏编辑**：`ui-template.tsx` 编辑弹窗增宽至 `sm:max-w-3xl`，Textarea 增高至 `rows=16 + min-h-[300px]`，新增全屏按钮复用 `LuzzyFullscreenEditor`
- **用户档案描述全屏编辑**：`profile.tsx` 编辑弹窗增宽至 `sm:max-w-2xl`，描述 Textarea 增高至 `rows=12 + min-h-[200px]`，新增全屏按钮复用 `LuzzyFullscreenEditor`
- **全局弹窗输入法适配**：`dialog.tsx` 新增 VisualViewport 监听 useEffect，弹窗高度随输入法弹出自适应；`app.css` 新增移动端 `@media (max-width: 768px)` 规则，弹窗使用 `100dvh` 高度
- **默认预设状态调整**：`presetContent.ts` 第三人称预设默认 `enabled: false`，仅 Luzzy 和第二人称默认开启
- **内置工具全局模式纵向排列**：`tools.tsx` 全局模式从 `grid grid-cols-3` 改为 `flex flex-col gap-2`，长条形纵向排列

### 功能增强

- **SKILL 导入简化**：`tools.tsx` GitHub 导入仅显示 URL 输入，ZIP 导入仅显示文件选择器，自动从 SKILL.md YAML 解析 name/description，无需用户手动填写
- **MCP 仅保留 JSON 导入**：`tools.tsx` 移除"新建 MCP"按钮，仅保留 JSON 导入入口
- **世界书字段布局**：`world-info.tsx` 注入位置/深度、顺序/插入顺序从 `grid-cols-2` 改为 `grid-cols-1`，每个字段独占一行
- **记忆页去重**：`memory.tsx` 移除"启用记忆压缩"开关和"保留最近消息数"输入（与设置页"历史消息数"功能重复），保留 store 字段向后兼容
- **ICON 大小一致性**：10 个文件共 48 处操作按钮图标从 `size-3`/`size-3.5` 调整为 `size-4`，保留装饰性/状态指示图标不变
- **静态审查优化**：修复 6 个 lint 警告（未使用导入/变量），包括 `LUXI_CHARACTER_DESCRIPTION`、`AnimatePresence`、`cn`、`parseModelName`、`handleNew`（MCP）等
- **关于页版本号**：`about.tsx` `APP_VERSION` 从 `"v0.3.0"` 更新为 `"v0.3.1"`

### 工程约束

- NSFW 提示词原样保留（`presetContent.ts` 中 `LUZZY_PRESET_CONTENT` 未修改）
- 用户数据不清空（`compressionEnabled`/`compressionKeepRecent` 字段保留，仅隐藏 UI）
- 缓存高命中率（预设/系统提示词注入顺序保持稳定，ACE 注入格式确定性排序）
- 仅使用 game-icon-pack 图标包和 AlibabaPuHuiTi-3/AlibabaSans 字体
- 所有新增交互具备进入/交互/退出三态丝滑动画

---

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
