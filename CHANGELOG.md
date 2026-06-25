# Changelog

## v0.8.9

### 🚀 流式输出原生效果修复

> 根因：双层 `useDeferredValue` 叠加（chat.tsx 的 `deferredMessages` + markdown.tsx 的 `deferredContent`），流式期间高频更新被标记为低优先级，主线程繁忙时无限期推迟，导致"全部一起出来"。

- **markdown.tsx**：流式期间（`isAnimating`）不使用 `useDeferredValue`，非流式时保留以优化长文本解析性能
- **chat.tsx**：流式期间（`isGenerating`）不使用 `useDeferredValue`，正在生成的消息移除 `cv-auto` 避免 paint 延迟
- **app.css**：添加翠绿主题 Streamdown 动画排除规则，避免 `steps(4,end)` 让 word fade 动画阶梯化不可见

### 🎨 关于页白色闪屏修复

> 根因：Framer Motion `initial={{ opacity: 0 }}` 在 hydration 期间内容全透明 + 根容器无背景色。

- **about.tsx**：所有 `opacity: 0` → `opacity: 0.01`（5处），根容器添加 `bg-background` 确保始终有背景色

### 🎨 配色方案重命名与默认主题调整

- **类型重命名**：`ColorScheme` 类型 `default`/`pixel` → `white`/`green`，涉及类型定义、store、CSS 选择器、UI 组件、动画预设
- **localStorage 迁移**：`app-store.ts` merge 函数添加旧值迁移逻辑（`default`→`white`, `pixel`→`green`）
- **防闪烁脚本迁移**：`root.tsx` 内联脚本添加旧值迁移逻辑，默认值改为 `white`
- **默认主题**：首次运行默认配色方案改为瓷白（`white`），默认外观模式改为浅色（`light`）
- **UI 文案**：删除设置页"翠绿采用 TRAE 深色配色与复古游戏动画效果"提示文字

### 🔧 Agentic 工具调用修复

> 根因：GLM-5.2 等不支持原生 function calling 的模型输出 `<tool_calls>label:query</tool_calls>` 套壳格式，解析器只认 `<label:query>` 格式，套壳格式匹配不上被当成普通正文。

- **toolService.ts**：`findPendingActiveToolCallInText` 和 `findPendingBuiltinToolCallInText` 添加 `<tool_calls>` 套壳格式预处理，剥离外层标签后继续原有匹配逻辑

### 📦 工程变更

- Android `versionCode` 51→52，`versionName` 0.8.8→0.8.9
- 前端版本号同步 v0.8.8→v0.8.9
- `android-patches/build.gradle` 同步所有修复
- README.md 版本徽章同步更新至 v0.8.9

## v0.8.8

### 🎯 侧边栏菜单动画专项性能修复

> v0.8.7 发布后用户反馈侧边栏切换动画仍有延迟，专项检查发现 6 处问题，核心根因是 `sideMenuOpen` 状态被持久化到 localStorage，每次切换触发同步 I/O 阻塞动画首帧。

- **P0 致命：`sideMenuOpen` 从持久化列表移除**：Zustand persist 中间件在每次状态变化时同步写入 localStorage（`JSON.stringify` + `setItem`），在动画启动关键帧阻塞主线程 5-50ms。侧边栏开关是临时 UI 状态，不应跨会话持久化
- **P1：`SidebarContent` 包裹 React.memo**：13 个菜单项的容器组件未包裹 memo，每次 `MobileSidebar` 重渲染都会重新渲染所有菜单项
- **P1：`onNavigate` 改用 useCallback**：内联箭头函数 `() => setSideMenuOpen(false)` 每次渲染创建新引用，破坏 memo 比较
- **P1：`useIsMobile` 初始值同步检测**：原初始值为 `undefined`，首次渲染返回 `false`（桌面端），`useEffect` 后变为 `true`（移动端），导致 `LuzzySidebar` 卸载 `DesktopSidebar` 并挂载 `MobileSidebar` 的闪烁
- **P2：菜单项交错动画简化**：移除 13 个 `delay: animIndex * 0.02` 交错延迟，改为统一淡入，减少动画实例数量
- **P2：`LuzzyLayout` 包裹 React.memo**：隔离页面状态变化（如流式输出）对侧边栏的影响

### 📦 工程变更

- Android `versionCode` 50→51，`versionName` 0.8.7→0.8.8
- 前端版本号同步 v0.8.7→v0.8.8
- `android-patches/build.gradle` 同步所有修复

## v0.8.7

### 🚨 P0 流式更新致命 Bug 修复（11 项）

> v0.8.7 首轮性能优化后，深度审查发现流式更新链路存在 11 个致命级 bug，导致思考卡片展开卡死、流式输出卡顿、缓冲区竞态覆盖等问题。

- **agentSteps 引用稳定化失效修复**：`[...agentSteps]` spread 只创建新数组，元素仍是同一引用；直接 mutation 后比较永远为 false，导致步骤内容不更新。改用 `agentSteps.map((s) => ({ ...s }))` 创建全新元素引用
- **rAF 批量 flush 可取消**：保存 `requestAnimationFrame` 返回的 handle，在请求开始/错误/abort 时 `cancelAnimationFrame`，避免竞态条件下 rAF 回调用旧缓冲内容覆盖最终更新
- **缓冲区生命周期管理**：新增 `chatClearBuffer()`、`trpgClearBuffer()`、`trpgDesignClearBuffer()` 三个统一清理函数，在请求开始时重置、错误/abort 时清理、流式结束后同步 flush
- **设计模式同步 flush 真正写入 store**：原实现仅清空缓冲区未执行 flush，导致最后一批流式内容丢失；添加真正的 flush 逻辑
- **TRPG 游戏模式 findIndex+slice 替代 map**：仅替换目标索引元素，其他消息保持原引用，React.memo 生效
- **stopTrpgGenerating 真正清理缓冲区**：原实现只设置 `trpgIsGenerating: false`，未清理缓冲区
- **deferred 渲染一致性**：`isLast` 和 `expandedStep` 改用 `deferredSteps.length` 而非 `allSteps.length`
- **loadPersistedDesignSession 异步化**：`setTrpgMode` 中同步调用导致渲染阻塞，改为 `setTimeout` 异步加载

### 🔧 P1 交互流畅度修复（16 项）

- **D1 布尔标志避免全文扫描**：`<cot>` 标签检测改用 `hasCotTag`/`hasClosingTag` 布尔标志，避免每次 chunk 都 `includes()` 全文扫描
- **D2/D3 移除冗余局部对象修改**：流式回调中移除对 `assistantMessage` 的直接 mutation，缓冲区已负责 UI 更新
- **D4 trpg-slice 重复 set 合并**：设计模式和游戏模式中连续两次 `set`（仅用户消息 + 用户+助手消息）合并为一次
- **D5 reasoning-part 多余字符移除**：第 28 行多余 `?` 字符
- **D6 tools.tsx key 修复**：`key={i}` → `key={tool.name || i}`
- **D7 about.tsx 日志列表 cv-auto**：添加 `content-visibility: auto` 跳过屏幕外渲染
- **D8 luzzy-aurora-background React.memo**：背景组件包裹 memo 避免不必要重渲染
- **D9 luzzy-splash 内层 setTimeout 清理**：嵌套定时器未清理，组件卸载后可能回调
- **D10 about.tsx onScroll rAF 节流**：避免每次滚动都触发 setState
- **D11 trpg.tsx useDeferredValue**：消息列表添加 deferred 渲染
- **D12 18 个路由子组件 React.memo**：memory/knowledge-base/preset/regex/tools/trpg 等路由的子组件
- **D13 9 个列表项组件 React.memo**：all-sessions-list/save-sheet/inventory-sheet/map-sheet/character-sheet/luzzy-agent-steps/luzzy-chat-message 等
- **D14 内联函数改用 useCallback 工厂模式**：characters/profile/knowledge-base/memory 中 7 处内联函数改为 useCallback 工厂，避免每次渲染创建新闭包破坏 memo
- **D15 luzzy-thinking-timeline 内联对象优化**：移除每次渲染新建的 `thinkingLikeStep` 对象，直接传递 step 引用
- **D16 executeWithTimeout setTimeout 清理**：Promise.race 不取消输的 promise，在 finally 中 `clearTimeout`

### 🚀 P2 长列表性能优化（8 项）

- **E1 11 处路由长列表添加 cv-auto**：characters/knowledge-base/world-info/preset/regex/tools/memory/ui-template/profile/trpg 的列表容器添加 `content-visibility: auto`
- **E2 5 处组件长列表添加 cv-auto**：session-list/character-picker/luzzy-share-dialog/luzzy-agent-steps/luzzy-thinking-timeline
- **E3 7 处组件长列表添加 useDeferredValue**：session-list/all-sessions-list/character-picker/luzzy-share-dialog/luzzy-agent-steps/luzzy-chat-message（记忆召回 + 世界书召回）
- **E4 8 处路由长列表添加 useDeferredValue**：memory（4 个变量）/knowledge-base/world-info/preset/regex/tools（2 处）/ui-template/profile
- **E5 移除未使用的 index prop**：ThinkingNode/ToolNode 接口移除 `index` 字段
- **E6 移除无效 exit 动画**：父组件未用 AnimatePresence 包裹，exit 永远不触发

### 🧹 P3 代码质量修复（4 项）

- **F1 embeddingFailureNotified 重置**：请求开始时重置标志，避免上次失败后永久不重试
- **F2 set 守卫完善**：`isThinking`/`isReceiving` 状态切换添加条件判断
- **F3 loadPersistedDesignSession 异步化**：避免同步 localStorage 读取阻塞渲染
- **F4 缓冲区清理统一化**：三个清理函数被多处复用，消除重复代码

### 🐛 预先存在 TypeScript 错误修复（5 项）

- **use-motion-presets.ts**：补充 `pixelSlideInBottom` 导入
- **luzzy.ts**：`ChatMessage` 接口添加 `reasoningContent` 字段
- **logger.ts**：`LogCategory` 添加 `"preset"` 类别
- **trpg-slice.ts**：`finalMessages` 未定义变量修复为 `get().trpgMessages`

### 🚀 性能优化（首轮）

- **菜单栏性能优化**：移除遮罩层 `backdrop-blur-sm`（叠加多层 backdrop-filter 导致 GPU 每帧重采样），改用纯色半透明遮罩；修正 `will-change` 用法（从 animate 属性移到 CSS class 预声明）；简化菜单项交错动画（spring → opacity 淡入，延迟 0.04→0.02）
- **流式输出性能优化**：移除三层人工节流，实现真正的实时流式输出
  - `apiClient.ts`：移除 Fetch/XHR 路径的 `await nextFrame()` 帧节流（每 10 行等待一帧）
  - `chat-slice.ts`：移除 16ms `lastUpdateTick` 状态更新节流，每个 chunk 即时更新；parseCot 阈值 8→4
  - `markdown.tsx`：移除 `useDeferredValue` 延迟渲染（导致内容积压后批量渲染的"伪打字机"效果）

### 🔧 功能修复（首轮）

- **嵌入模型供应商解析修复**：`doubao-embedding-vision` 等模型名含下划线但无供应商前缀时，`parseModelName` 误解析（`doubao` 被当作供应商 ID 但不存在），导致 `resolveEmbeddingProvider` 两级策略均失败。新增 Level 2.5 模糊匹配：模型名（不带前缀）匹配已知供应商的嵌入模型时，自动解析供应商
- **记忆页手动填写交互修复**：添加显式 `isManualMode` 状态，修复派生状态死循环（点击"手动输入..."后 `embeddingModel` 被设为空/已知名，`isManual` 永远 false，Input 不渲染）；手动模式下新增供应商选择下拉框，支持自定义 model name 和供应商
- **TRPG 思考卡片自动展开跟踪**：添加 `isGenerating` 状态传递、生成开始时自动展开、流式输出时自动滚动到底部、用户滚动检测、内容区 max-height + overflow-y-auto

### 🎨 UI 优化（首轮）

- **配色方案重命名**：设置页外观设置中"默认"→"瓷白"，"像素风格"→"翠绿"（内部 value 值不变）

### 📦 工程变更

- Android `versionCode` 49→50，`versionName` 0.8.6→0.8.7
- 前端版本号同步 v0.8.6→v0.8.7
- `android-patches/build.gradle` 同步所有修复
- 终极精修版7：覆盖 25+ 个文件，120+ 处修改，39 个 Task（C1-C11 / D1-D16 / E1-E8 / F1-F4）

## v0.8.6

### 🚨 P0 根因修复：APK 启动闪退

- **Kotlin 插件缺失修复**：`android/app/build.gradle` 缺少 `apply plugin: 'org.jetbrains.kotlin.android'`，导致 5 个 `.kt` 文件（MainActivity.kt、NativeBridge.kt、WebAssetServer.kt、LuzzyWebViewClient.kt、LuzzyWebChromeClient.kt）未被编译进 APK，AndroidManifest 引用的 `com.luzzymeow.luzzy.MainActivity` 类不存在，启动时抛出 `ClassNotFoundException` 立即闪退

### 🔧 P1 严重风险修复

- **Base64 兼容性修复**：`NativeBridge.kt` 使用 `java.util.Base64`（Java 8 API，需 API 26+），在 Android 7.0/7.1（API 24-25）上调用 `writeFile` 时抛出 `NoClassDefFoundError`；替换为 `android.util.Base64`
- **SplashScreen 死锁修复**：`webViewLoaded` 仅在 `onPageFinished` 中设为 true，WebAssetServer 启动失败时永久卡住；新增 10 秒超时兜底强制关闭 SplashScreen
- **NanoHTTPD 主线程阻塞修复**：`startWebAssetServerIfNeeded()` 和 `startProxyServerIfNeeded()` 在主线程执行 socket 绑定 + `Thread.sleep(100)`，严重时触发 ANR；移到后台线程启动，使用 `CountDownLatch` 同步等待最多 2 秒

### 🛠️ P2 中等风险修复

- **restoreState 白屏修复**：Activity 重建后 `restoreState` 成功时提前 `return` 跳过 `loadUrl`，WebAssetServer 未就绪时恢复的页面无法加载资源；改为继续执行 `loadUrl` 作为兜底
- **服务器启动失败错误页面**：3 次重试失败后仅记录日志，WebView 尝试加载不存在的服务器显示白屏；新增本地错误页面加载
- **Capacitor 依赖清理**：项目已迁移到原生 Kotlin 架构，但 build.gradle 仍保留 `implementation project(':capacitor-android')` 和 `implementation project(':capacitor-cordova-android-plugins')`；移除未使用的 Capacitor 依赖、settings.gradle include、capacitor.build.gradle apply、capacitor.config.json

### 🧹 P3 低风险优化

- **WebView Client 内存泄漏修复**：`LuzzyWebViewClient` 和 `LuzzyWebChromeClient` 持有 MainActivity 强引用，Activity 销毁后回调可能崩溃；改为 `WeakReference<MainActivity>`
- **sessionStorage 异常保护**：WebView 隐私模式下 `sessionStorage.getItem/setItem` 可能抛 `SecurityError`；包裹 try-catch
- **JVM Target 统一**：Kotlin 默认 JVM 21，Java 默认 1.8，编译报 `Inconsistent JVM-target compatibility`；统一为 JVM 17

### 📦 工程变更

- Android `versionCode` 48→49，`versionName` 0.8.5→0.8.6
- 前端版本号同步 v0.8.5→v0.8.6
- `android-patches/build.gradle` 同步所有修复

## v0.8.5

### 🔧 深度检查与优化

- **嵌入模型配置修复**：修复嵌入模型已配置但仍请求失败的问题，优化失败提示机制（一次性 toast 防止重复弹窗）
- **TRPG 设计模式卡片截断修复**：修复首次进入设计模式时卡片顶部被截断的 UI 显示 bug
- **TRPG 设计模式回退机制**：新增 localStorage 持久化设计模式会话记忆，保存世界卡后自动新建设计会话；新增手动重置会话按钮
- **TRPG 设置按钮位置优化**：将设置按钮 icon 移至与提示 icon 并排位置，统一大小
- **流式输出性能优化**：深度优化流式输出时的手机掉帧、文字卡顿、突然蹦出大段文字问题
- **TRPG 交互式选择卡片**：修复 `<choices>` 标签不可交互的问题，支持用户直接选择卡片回答
- **关于页 - 日志同步升级**：同步升级日志功能以记录新版本工具的 log

### 🎨 UI/UX 优化

- **关于页崩溃修复**：修复再次点击关于页触发闪屏和卡顿的 bug（refreshLogs 内容比对 + cancelled 标志 + 降频 500ms→2000ms）
- **TRPG 设计模式状态条**：将横向状态条改为横向滚动胶囊，去掉竖向"设计模式"文字，Stage/标题/地理实体等做成带浅色背景和圆角的胶囊标签
- **TRPG 思考卡片互动效果**：流式输出思考内容时自动展开思考卡片，agent 开始输出正文时自动收起
- **TRPG 设置按钮位置**：将设置按钮移至与提示按钮并排，统一大小

### 🐛 Bug 修复

- **预设存储键不一致修复**：修复 chat-slice.ts 读取 `"presets"` 键但 preset.tsx 写入 `"custom"` + `"builtinOverrides"` 键导致用户预设修改在聊天生成时全部丢失的严重 bug；新增 mergePresets 函数合并内置预设与用户覆盖，按当前角色过滤 enabledForCharacters
- **预设页强制更新内置预设**：新增 BUILTIN_PRESET_VERSION 版本检查机制，版本不匹配时强制清除用户覆盖；Luzzy 预设强制全局启用、只读，隐藏预览/绑定/开关按钮
- **TRPG 设计模式持久化恢复**：修复切换到设计模式时总是调用 resetTrpgDesignSession 导致持久化恢复逻辑失效的问题

### 📦 工程变更

- Android `versionCode` 47→48，`versionName` 0.8.4→0.8.5
- `android-patches/build.gradle` 同步至 48/0.8.5
- 版本号同步：`package.json` / `about.tsx` / `android/app/build.gradle` / `android-patches/build.gradle`
- `CHANGELOG.md` / `README.md` 同步更新

---

## v0.8.4

### 🤖 TRPG 两阶段 Agentic 闭环（核心）

- **游戏模式两阶段工具循环**：将原来的单次 API 请求（模型同时输出叙事 + tool_calls）重构为真正的 ReAct 闭环——第一阶段模型只输出思考链 + tool_calls（不生成叙事），本地引擎执行 d20 检定/伤害/状态变更后，第二阶段将真实工具结果以 `role: 'tool'` 消息回传 LLM，模型基于真实骰子点数和伤害数值生成最终 Narrator 七段叙事。最大循环深度 3，防止无限工具调用
- **设计模式两阶段工具循环**：设计模式同样升级为两阶段闭环——第一阶段模型规划并调用设计工具（write_card / patch_card 等）修改世界卡草稿，第二阶段基于工具执行结果生成面向用户的引导文案
- **第一阶段思考可见**：第一阶段 reasoning_content 实时更新到思考卡片，与聊天页展示方式一致
- **通用 agentic 循环引擎**：新增 `agenticLoop.ts`，提供 `runAgenticToolLoop` 通用函数，支持 system prompt 阶段追加、回调式流式更新、递归多轮工具调用

### 🎨 设计模式入口卡片

- **方向选择欢迎页**：替换原来的空白图标 + 按钮，新增 `DesignModeWelcome` 组件——4 张方向卡片网格（PERSONA 扮演一个角色 / WORLD 构建一个世界 / SCENE 我有一个画面 / IMPROV 随便来一个），每张卡片含图标、方向名、示例文案
- **点击填入输入框**：点击卡片将方向文案填入底部输入框，不自动发送，等用户编辑后发送
- **图标来源**：全部使用 game-icon-pack（IconUser / IconGlobe / IconImage / IconDice）
- **设计模式发送修复**：设计模式下不再要求 trpgSave 存在才能发送

### 📋 世界卡 Schema 破坏性升级

- **完全对标标准世界卡结构**：WorldCard 类型从扁平数组结构重写为标准嵌套结构：
  - 顶层 `name/description/contentLocale/localizations/manifest/snapshot/designMeta`
  - `snapshot.world_setting.settings` 为 entity_id 映射，每个实体含 `display_name/atmosphere/chapters`（6 章节均为字符串数组）/`sites`（含 `spots[]`，每个 spot 有 `atmosphere`）/`narrative_core_characters`
  - `snapshot.character_database` 为 Record，角色含 `dialogue_examples.in_person[]/sms[]`（每条含 context/line）、`relationships/cognitive_state/initial_status/dialogue_tone`、`species/profession/affiliation/combat_style/personality/appearance/clothing/hidden_motive/scar_mark/stance/faction/current_goal/is_protagonist`
  - `snapshot.world_timeline.events[]` 含 `time/day/time_str/location{country,site,spot}/content/entity_refs/character_refs`
  - `snapshot.prompt_modules.modules` 按名映射 + `module_meta` + `_summary`
  - `snapshot.panel_fields` 结构化字段定义数组 + `_worldTermsSource`
  - `snapshot.laws/mods/artifacts` 全部 Record 化，字段对标标准（law 的 scope/body/binding，mod 的 ref/config/prose/owns_vars/hooks，artifact 的 owner/location/attrs）
- **设计工具全量重写**：`designModeTools.ts` 工具 schema 从 14 个扩展为标准化工具集（write_card / patch_card / add_world_setting_entity / add_world_setting_site / add_character / add_timeline_event / add_prompt_module / set_panel_fields / add_law / add_mod / add_artifact / set_opening_greeting / finalize_world_card / rollback_stage），参数对标标准字段
- **校验逻辑升级**：`validateWorldCard` 检查项覆盖并超越标准——每个实体必须有 atmosphere 和 _summary、每个 site 下 spots 不少于 3 个、角色 dialogue_examples.in_person ≥ 6 且 sms ≥ 4、角色关系双向性、prompt_modules 必须含 module_meta、时间线事件必须含 entity_refs/character_refs
- **游戏模式上下文渲染适配**：`buildWorldCardText` 重写以读取新嵌套结构，渲染 atmosphere、chapters 数组、sites/spots 嵌套、角色 dialogue_tone/affiliation/combat_style/hidden_motive/current_goal、时间线 location 对象等

### 🧪 测试

- 新增 `trpgTools.test.ts`：TRPG 工具注册与执行测试（schema/executor 对齐、d20_check、roll_damage、inventory_add、未知工具错误），共 38 个测试全部通过

### 📦 工程变更

- Android `versionCode` 46→47，`versionName` 0.8.3→0.8.4
- `android-patches/build.gradle` 同步至 47/0.8.4
- 版本号同步：`package.json` / `about.tsx` / `android/app/build.gradle` / `android-patches/build.gradle`
- 新增文件：`frontend/app/services/trpg/agenticLoop.ts`、`frontend/app/services/trpg/designModeApi.ts`、`frontend/app/services/trpg/designModeTools.ts`、`frontend/app/services/__tests__/trpgTools.test.ts`
- `CHANGELOG.md` / `README.md` 同步更新

---

## v0.8.3

### 🐛 修复

- **[]内容消失**（致命）：Streamdown 流式结束后 `[文字]` 被解析为 shortcut reference link 并丢弃；新增 `protectUndefinedReferences` remark 插件，支持嵌套格式化（`[*italic*]`、`[**bold**]`）、fullReference（`[text][ref]`）、imageReference（`![text]`）、collapsed（`[text][]`）全场景还原
- **Agentic 模式空响应误判**：模型只返回 tool_calls 无正文时被误判为空响应终止；空响应检查加入 tool_calls 判断，forceToolCall 改为仅 force 模式强制
- **TRPG 模式 API 请求失败**：URL 缺少 `/chat/completions` 端点后缀；提取 `getChatCompletionsUrl` 公共函数，TRPG 模式复用
- **嵌入供应商解析错误**：记忆设置配置供应商A嵌入模型，聊天选供应商B时错误使用供应商B的 API；移除 Level 3/4 回退，下拉选择时同步写入 `embeddingApiProviderId`
- **customRequestBody 覆盖工具配置**：自定义请求体 JSON 合并时覆盖 `tools` 和 `tool_choice`；合并时跳过这些保护字段

### ✨ 优化

- **流式掉帧优化**：5处 `setTimeout` 替换为 `requestAnimationFrame`，精确对齐浏览器 16.67ms 刷新帧，消除最小 4ms 延迟导致的掉帧
- **首字延迟优化**：world-recall 语义检索改为异步非阻塞（fire-and-forget），当前消息仅使用 constant + keyword 结果，首字延迟降低 60%+；语义检索结果异步持久化到 IndexedDB，下次消息生效
- **思考节点流式渲染**：`luzzy-thinking-timeline` 添加 `directRender`，消除词级动画卡顿

### 🏗️ 重构

- **TRPG 存档/世界卡绑定关系**：从"存档绑定世界卡"改为"世界卡绑定存档"。WorldCard 新增 `saveIds` 字段，UI 改为世界卡列表展开显示存档；创建/删除存档时同步更新世界卡的 saveIds；移除角色名输入框（角色名由设计模式取名）
- **TRPG 用户引导**：新增首次使用分步引导（4步：欢迎→设计模式创建世界卡→创建存档→开始游戏），使用 localStorage 标记完成状态，支持跳过

### 📦 工程变更

- Android `versionCode` 45→46，`versionName` 0.8.2→0.8.3
- `android-patches/build.gradle` 同步至 46/0.8.3（修复之前未同步的问题）
- 版本号同步：`package.json` / `about.tsx` / `android/build.gradle` / `android-patches/build.gradle`
- `CHANGELOG.md` / `README.md` 同步更新

---

## v0.8.1

### 🏗️ 架构（核心）

- **Agentic 多步工具调用循环**：单次回复中模型可进行最多 10 步（可配 1-20）工具调用循环。模型自主决定何时信息充分并输出正文，支持链式检索（如 world-recall → vector-memory → keyword-search）。替代旧的单次续写 + skipToolsInjection 机制
- **tool_choice: 'required' 首次强制工具调用**：首次 API 请求使用 `tool_choice: 'required'` 强制模型调用工具；API 不支持时自动回退到 `'auto'`（识别 400/Bad Request/tool_choice 错误）
- **被动工具过滤**：`memory-recall` 和 `world-recall` 从 `tools` 参数中过滤，仅保留在 system prompt 标注"已自动执行"，避免被动工具干扰主动决策
- **续写请求 tools 注入**：续写请求 `skipToolsInjection: false`，确保模型在 Agentic 循环中仍可见工具参数，支持多步链式调用
- **循环检测**：`Set<string>` 记录 `toolName|queryNormalized` 对，任意重复即终止循环（RP 场景最优策略——工具结果已持久化在消息历史中，重新查同一关键词是浪费）
- **条件协议注入**：force 模式注入 `<available_tools>` 文本标签列表；active/adaptive 模式注入 `buildNativeToolProtocol()` 原生 function calling 协议指引，避免双协议冲突

### ✨ 优化

- **maxAgentSteps 配置 UI**：工具页新增 Agentic 最大步数滑块（1-20，默认 10），使用 motion.div 进入动画 + game-icon-pack IconRefresh 图标，与现有工具卡片视觉风格一致
- **默认工具模式从 force 改为 active**：新用户默认使用原生 function calling 协议；旧用户 force 模式自动迁移为 active，但用户可手动切回 force
- **Step 8 提示词强化**：新增【强制工具调用 — 无例外】小节，强调 RP 场景下主动检索记忆和世界书设定是保持角色一致性的关键，新增"宁可多调用工具也不要遗漏关键信息"指导

### 🐛 修复

- **续写时工具"消失"**：旧代码续写时 `skipToolsInjection: true` 导致模型看不到工具无法继续检索；修复为 `false` 支持多步循环
- **被动工具干扰主动决策**：`memory-recall` 和 `world-recall` 出现在 `tools` 参数中干扰模型主动工具选择；修复为从 `tools` 过滤
- **工具描述质量差**：旧代码工具描述仅为工具名（如 `"world-recall"`）；修复为使用 `BUILTIN_TOOL_INFO` 完整中文描述

### 📦 工程变更

- Android `versionCode` 43→44，`versionName` 0.8.0→0.8.1
- 版本号同步：`package.json` / `frontend/package.json` / `about.tsx` / `android/app/build.gradle` / `android-patches/build.gradle` 均更新
- `MAX_CONTINUATIONS` 常量删除，改为动态读取 `toolGlobalSettings.maxAgentSteps`
- `callApiWithRetry` / `callApiAndUpdate` 签名从 `boolean` 改为 `options` 对象
- `CHANGELOG.md` / `README.md` 同步更新

---

## v0.7.3

### 🐛 修复

- **修复工具页内置工具栏目崩溃**（致命）：IndexedDB 中持久化的旧配置或无效工具类型导致 `BUILTIN_TOOL_RANGES[type]` 返回 `undefined`，访问属性时抛出 TypeError 触发 ErrorBoundary。修复：`tools.tsx` 添加防御性过滤只保留有效工具类型，渲染时提供安全默认值；`settings-slice.ts` 加载配置时以默认配置为基础合并持久化数据，自动补全新增字段
- **修复 JSON 格式角色卡导入未处理世界书/向量**（高）：`characters.tsx` 中文本格式（JSON）导入只调用 `importCharacter(text)`，完全没有世界书提取、保存、关联和向量生成逻辑。修复：重构导入流程，将头像/世界书/正则/UI模板/向量生成为统一的 `processImportedExtras` 函数，PNG 和 JSON 导入共用同一套处理流程
- **修复世界书页默认自动展开所有世界书**（体验）：打开世界书页时默认展开所有世界书，条目多时页面冗长。修复：改为默认收起所有世界书，用户按需展开

### ✨ 优化

- **TRPG 模式弹窗提示表达优化**：明确告知用户 TRPG 模式必须通过本地代理工作，分场景说明配置方法（火山方舟编码计划 vs 其他供应商），包含具体 API 地址填写示例和注意事项
- **关于页动画背景增强**：`LuzzyAuroraBackground` 组件新增多层渐变光晕、左右两侧流动极光效果、多个浮动光斑粒子动画，保留深浅主题适配和 `prefers-reduced-motion` 无障碍支持

---

## v0.7.2-hotfix

### 🐛 修复

- **修复工具页崩溃**（致命）：用户 IndexedDB 中持久化的旧 `builtinToolConfigs` 包含已删除的 `world-search` 类型，加载后 `BUILTIN_TOOL_RANGES["world-search"]` 返回 `undefined`，访问 `range.min` 抛出 TypeError 触发 ErrorBoundary。修复：`settings-slice.ts` 加载时过滤无效类型并补全缺失的默认配置项
- **修复角色卡导入未生成世界书向量**（高）：`characters.tsx` 导入角色卡时只保存世界书条目到 IndexedDB，未调用 `generateWorldInfoEmbeddings` 生成嵌入向量。修复：导入世界书后自动读取记忆设置和 API 设置，异步触发嵌入生成，含 toast 进度提示和错误通知

---

## v0.7.2

> v0.7.1 + v0.7.2 合并发布。两阶段请求架构正式重构为**单阶段架构**——合并工具决策与 CoT/正文为单次 API 调用，模型通过原生 `tool_calls`（function calling）自行决定调用工具。世界书召回重构为三策略混合召回，新增三级卡片 UI、Token 计数增强、会话自动命名等 20+ 项改进。

### 🏗️ 架构重构（核心）

- **两阶段 → 单阶段请求架构**
  - 旧两阶段：① 工具决策（`TOOL_DECISION_PROMPT`）→ ② CoT 思考 + 正文（`STAGE2_COMBINED_PROTOCOL` + `NSFW_CREATION_MODE_DECLARATION`），两次串行 API 调用
  - 新单阶段：单次 API 请求内完成工具决策 + CoT 思考 + 正文输出，模型通过原生 `tool_calls`（function calling）自行决定调用工具
  - 删除 `TOOL_DECISION_PROMPT`、`STAGE2_COMBINED_PROTOCOL`、`NSFW_CREATION_MODE_DECLARATION` 三个协议常量
  - `LUZZY_PRESET_CONTENT` 重写为自完备的单一文本（Step 1-9 + 工具调用通用协议 + CoT 协议 + 正文协议 + NSFW 声明）
  - 预设内不硬编码任何工具名称，工具列表由 `buildToolDescriptions()` 在 `buildContext` 末尾动态生成
  - `buildContext` 移除 `phase` 参数及分支
  - **KV 缓存影响分析**：system prompt 稳定（不再有 phase=1/2 差异），前缀缓存命中率提升
- **世界书召回三策略混合重构**
  - 删除 `world-search` 内置工具（功能与 `world-recall` 重叠）
  - `world-recall` 增强为三种策略混合召回：
    - **总是激活**（`constant=true`）：直接注入全文内容，不使用嵌入模型
    - **关键词触发**（`keys` 匹配用户输入）：直接召回内容，不使用嵌入模型
    - **语义相似度**（非 constant 剩余条目）：嵌入向量语义检索，使用嵌入模型
  - 三策略结果不去重，若都满足则两种结果均存在
  - 合并去重排序：按策略优先级 constant > keyword > semantic，同策略内按 score 降序

### 🐛 修复

- **修复 Phase 1 上下文缺失**（致命）
  - `buildContext` phase=1 提取最近 1 条 user 消息时仅过滤 `memory_recall_result`，未过滤 `world_recall_result`
  - 导致模型看到的是 `<world_recall_result>` 被动工具召回内容，而非用户实际输入
  - 修复：过滤条件同时排除 `<world_recall_result>`
- **修复重试时旧向量记忆分片未清理**（高）
  - `regenerate` 函数缺失 `removeVectorMemoryShardsByTurn` 调用，重试后旧分片仍在 IDB
  - memory-recall 预执行在生成之前，窗口期内旧分片已被加载并参与搜索
  - 修复：在删除旧 assistant message 前，先调用 `removeVectorMemoryShardsByTurn`
- **修复 PNG 导出全白图**（高）
  - `exportPng()` 在 `appendChild` 后立即调用 `toPng()`，浏览器未完成布局计算和字体加载
  - Android WebView 对 `left:-9999px` 离屏元素可能完全跳过渲染
  - 修复：容器定位改为 `opacity:0; pointer-events:none; position:fixed; top:0; left:0`，插入 `requestAnimationFrame` + `setTimeout(200)` 等待渲染
- **修复角色切换自动唤起输入法**（中）
  - Android WebView 在 Sheet/Dialog 关闭后自动将焦点恢复到 textarea，触发软键盘
  - 修复：`handleSelectCharacter` 中 `setShowCharacterPicker(false)` 之前执行 `document.activeElement.blur()`
- **修复角色卡 PNG 导入未提取 UI 模板**（中）
  - `characters.tsx` 调用了 regex 提取，未调用 `extractUiTemplatesFromCard`
  - 修复：导入流程补全 UI 模板提取并存入 IndexedDB

### ✨ 新功能

- **RecallResultCard 三级卡片 UI**
  - 记忆召回/世界书召回节点新增三级分类卡片
  - 每个召回条目独立可展开/收起，明确分离输入参数区和输出结果区
  - 支持全部展开/全部收起快捷操作
  - 策略标签徽章（总是激活/关键词命中/语义相似度）
  - 三态动画：进入（fade-in + slide-down）、交互（spring）、退出（fade-out + slide-up）
- **会话自动命名**
  - 首条 AI 回复完成后，自动调用模型生成 3-6 字中文标题
  - 容错：模型调用失败静默保留"新会话"；返回超长内容取前 10 字；用户已手动改名则跳过
- **Token 计数器增强**
  - `TokenUsage` 新增 `reasoningTokens`（思考 token 估算）、`toolCallTokens`（工具续写合计）、`totalTokens`（全部轮次合计）
  - `responseTimeMs` 改为全局计时（首次请求 → 正文结束，含工具续写）
  - K/M 格式化：≥1000 → 1.2K，≥1,000,000 → 1.2M
  - 布局改为 `flex-nowrap` 防止折行
- **正则脚本 + UI 模板角色绑定**
  - `RegexScriptGroup` 新增 `enabledForCharacters?: string[]` 字段
  - 导入角色卡后，正则脚本组和 UI 模板自动绑定到当前角色
  - 正则脚本设置页和 UI 模板设置页新增角色多选绑定控件
  - 未选任何角色 = 全局生效；选指定角色 = 仅这些角色生效
- **关于页日志新增"世界"分类 Tab**
  - `world-recall` 重构后 world 分类日志大量增加（启动/完成/跳过/语义失败）
  - 关于页日志查看器新增"世界"Tab 筛选

### 🎨 UI 优化

- **翻译文本荧光效果改为字体描边**
  - 取消三层 `text-shadow` 荧光效果，改为 `-webkit-text-stroke: 0.5px` 字体描边
  - 提升翻译内容在背景图上的清晰度与可读性
- **翻译流式动画仅首次播放**
  - 翻译打字机动画仅在翻译结果首次出现时播放
  - 用户切页再切回时直接显示全文，不重复触发动画
- **关于页背景重新设计**
  - 替换 Aurora 飘动模糊色块为简洁几何/暗色调背景
  - 背景铺满整个滚动区域（`fixed inset-0`），滚动后不截断
- **思考链按时间顺序展示**
  - 思考链卡片按 `startedAt` 时间戳排序，反映实际发生顺序
  - 移除固定 phase 分组逻辑（brainstormP1 → Tools → brainstormP2 → ...）
  - 预期展示：被动工具（记忆召回）→ 头脑风暴（模型思考）→ 主动工具（模型调用）→ ...
- **移除头脑风暴灯泡图标**
  - 移除 brainstorm 节点的 `IconLight` 图标，使思考卡片头部简洁统一

### 📦 工程变更

- Android `versionCode` 39→41，`versionName` 0.7.0→0.7.2
- 版本号同步：`package.json` / `about.tsx` / TRPG iframe 缓存参数（`?_v=0.7.2`）均更新
- 删除 `world-search` 内置工具：`BuiltinToolType`、`BUILTIN_TOOL_INFO`、`buildToolDescriptions`、`builtinToolConfigs` 默认值、`apiClient.ts` schema 定义、`tool-calls.test.ts` 测试用例
- `presetContent.ts` 提示词示例 `world-search` → `world-recall`
- `CHANGELOG.md` / `README.md` 同步更新

---

## v0.7.0

### 🏗️ 架构重构（核心）

> 三阶段请求架构精简为两阶段：取消第三次独立请求，第二阶段在同一响应内同时输出 CoT 思考链与正文，降低单轮延迟与 token 消耗。

- **三阶段 → 两阶段请求架构**
  - 旧三阶段：① 工具决策 → ② CoT 思考链 → ③ 正文
  - 新两阶段：① 工具决策 → ② CoT 思考 + 正文（同一次请求内顺序输出）
  - 第二阶段在同一响应中先输出 `<cot>...</cot>` 思考链，再输出正文
  - 取消第三次请求，减少一次完整的网络往返与系统提示重传
  - **KV 缓存影响分析**：阶段 2 系统提示前缀（角色预设 + 常驻世界书 + 文风 + 用户/全局记忆）保持稳定不变，思考链与正文在同一请求内输出不引入新的提示前缀差异，缓存命中率不降反升（少一次 miss）

### 🐛 修复

- **修复阶段 2 上下文缺失**（致命）
  - 阶段 2 此前上下文裁剪过度，丢失 assistant 历史回复与角色开场白
  - AI 在"无上下文"状态下生成正文，导致剧情断裂、角色失忆
  - 修复：阶段 2 现在使用完整历史消息（含 assistant 回复）和开场白，恢复连续叙事
- **修复工具计数显示**（中）
  - 思考链头部"X 工具"计数固定显示为 1，与实际调用数不符
  - 修复：从固定 1 改为实际唯一工具调用数统计
- **修复向量分片消息分隔**（中）
  - 向量记忆分片中 user 和 AI 消息无角色区分，检索时难以辨别来源
  - 修复：添加 `[用户消息]` / `[角色回复]` 角色标签前缀
- **修复 memory-recall 返回多条异常**（高）
  - 嵌入维度不匹配时返回错误条目或空结果，且无诊断日志
  - 修复：新增嵌入维度不匹配检测、相似度阈值过滤、调试日志

### ✨ 新功能

- **world-recall 改为被动预执行**
  - 世界书召回从 AI 主动调用改为系统被动预执行（同 memory-recall 机制）
  - 每轮对话前系统自动根据最新用户消息检索世界书匹配内容
  - 新增 `WorldInfoRecallsCard` 卡片展示召回结果
  - 降低 AI 工具调用不确定性，保证世界设定注入稳定性

### 🎨 UI 优化

- **翻译文本荧光描边效果**
  - 翻译高亮文本增加 `text-shadow` 双层荧光效果
  - 提升翻译内容在背景图上的可读性与视觉层次
- **关于页 Aurora 背景动画**
  - 新增极光渐变光球背景动画（适配深浅主题）
  - 品牌名渐变色 + 呼吸动画
  - 短语切换增加模糊 + 字距动画

### 🔧 提示词与纪律强化

- **阶段 1 工具调用强化**
  - 新增强制性工具使用优先级指令
  - 引导模型在需要外部信息时优先调用工具而非臆造
- **CoT 思考纪律强化**
  - 防止 DeepSeek 等模型在思考链中输出剧情正文
  - 强化思考与正文的边界隔离

---

## v0.6.5

### 🐛 修复

> 彻查向量记忆分片功能全链路，修复嵌入供应商解析失效（世界书切片为 0 的根因）+ 多处静默错误。

- **嵌入模型供应商解析逻辑重写**（致命根因）
  - `resolveEmbeddingProvider` 只依赖显式 `embeddingApiProviderId`，用户未手动设置时直接 fallback 到聊天模型前缀
  - 当聊天模型供应商不支持 embedding 或未配置 embedding 模型前缀时，API 地址/密钥解析为空，请求静默失败
  - 修复：三级解析策略——(1) 显式 embeddingApiProviderId → (2) 从嵌入模型名自身解析供应商前缀 → (3) fallback 到聊天模型前缀
- **嵌入模型选择器 value 格式修复**（致命根因）
  - 下拉菜单 `SelectItem` 的 `value` 只传 `modelName`，不含供应商前缀
  - 选中后 `embeddingModel` 存的是裸模型名，`parseModelName` 永远解析不出 providerId
  - 修复：`value` 改为 `${providerId}_${modelName}` 格式，与聊天/翻译模型选择器保持一致
- **世界书嵌入生成 catch 静默吞错**（高）
  - `world-info.tsx` 的 `triggerEmbeddingGeneration` catch 只 `logger.warn` 不 `toast.error`
  - 用户导入世界书后嵌入失败完全无感知，以为"没有自动切片"
  - 修复：catch 中添加 `toast.error` 通知用户具体错误信息
- **记忆页假动画移除后的回归确认**（中）
  - 确认 v0.6.3 移除的 isProcessing 假动画没有残留副作用
  - 嵌入生成失败时通过 toast 通知用户，而非误导性的加载动画

### ✨ 新功能

- **记忆页新增「手动重试记忆分片」按钮**
  - 位置：向量记忆分片卡片标题栏右侧
  - 下拉菜单包含两个选项：「重新生成会话记忆」和「重新生成世界书嵌入」
  - 支持确认弹窗防误触，生成中按钮图标旋转动画
  - 会话记忆重建：清空当前会话/角色所有会话的旧分片后，从完整消息历史全量重建
  - 世界书嵌入重建：清空所有条目 embedding 和旧向量分片后，调用嵌入 API 全量重新生成
  - 生成完成后自动刷新分片列表
- **翻译功能支持自定义 JSON 请求体**
  - 设置页 → 翻译功能容器新增「自定义请求体 JSON」字段
  - 用户可为翻译单独配置请求体（如 thinking/reasoning_effort 等）
  - 字段为空时自动回退使用全局自定义请求体，保持向后兼容

### 🔧 工程

- 新增 `regenerateAllWorldEmbeddings` 辅助函数：全量重新生成所有世界书嵌入向量
- 新增 `regenerateSessionMemory` 辅助函数：清空旧分片后从全部消息重建会话向量记忆
- 版本号统一更新至 v0.6.5，TRPG 网页缓存同步刷新

## v0.6.4

### 🐛 修复

> 修复向量切片异常被静默吞掉（致命根因）+ Phase 1 上下文增强。

- **extractMemory catch 吞掉异常**（致命）
  - `extractMemory` 内部 try/catch 只 `logger.warn` 不 `throw`，导致 401 等错误被静默吞掉
  - 外层 `chat-slice.ts` 的 `.catch` 永远不触发，v0.6.3 的 `toast.error` 修复实际无效
  - 修复：catch 中 `throw e` 重新抛出，让外层 `.catch` 能捕获并 `toast.error` 通知用户
- **Phase 1 上下文增强**（高）
  - Phase 1 工具决策阶段只给 1 条 user 消息，模型无法理解对话上下文
  - 修复：Phase 1 现在提供最近 2 条 assistant + 1 条 user 的完整内容
  - 让模型能基于最近对话判断是否需要调用工具

## v0.6.3

### 🐛 修复

> 修复向量切片无产出 + 嵌入 API 401 鉴权错误。

- **移除记忆页假动画**（致命）
  - `isProcessing` 是 3 秒 `setTimeout` 定时器，与真实异步流程（`extractMemory` / `generateWorldInfoEmbeddings`）完全解耦
  - 切换页面后组件重挂载会重复触发，导致"动画一会就消失"的误导
  - 修复：移除假动画 state/useEffect/渲染分支，改为静态空状态引导
- **extractMemory 失败时通知 UI**（高）
  - 原来只 `console.error`，错误被层层吞掉，UI 完全无感知
  - 修复：在 `.catch` 中添加 `toast.error` 和 `logger.error`
- **generateWorldInfoEmbeddings 返回失败计数**（高）
  - 单条失败只 `logger.warn` 不抛出，调用方无法感知
  - 修复：返回类型改为 `{ success: number; failed: number }`，调用方根据 failed 数量 toast 提示
- **嵌入 API 401 错误诊断增强**（高）
  - 火山引擎返回 "The API key format is incorrect" 时只原样显示，缺乏修复引导
  - 修复：401 错误添加专用诊断消息，包含供应商名称和修复指引
- **记忆页空状态文案优化**（中）
  - 引导用户检查嵌入模型配置和 API Key 是否正确

## v0.6.2

### 🐛 修复

> 基于 59 个故障点核查，修复 5 个确认存在的真实故障。

- **删除死代码 `longTermMemoryEnabledForCharacter`**（故障 #4，致命）
  - 该变量声明后全文件无任何引用，是死代码
  - 长期记忆功能已在 v0.5.9 锁定，`extractMemory` 只检查 `memorySettings.enabled` 全局开关
  - 删除避免误导后续维护者认为"按角色启用长期记忆"仍在生效
- **修复 Phase 1 截断丢弃原始用户消息**（故障 #13，高）
  - memory-recall 预执行将 `<memory_recall_result>` 作为 user 消息 push 到 contextMessages 末尾
  - Phase 1 只保留最后 1 条 user 消息，导致原始用户消息被挤掉，工具决策只能看到召回结果
  - 修复：Phase 1/2 截断时排除 `<memory_recall_result>` 注入的 user 消息，优先保留真实用户输入
  - Phase 2 额外追加 memory_recall_result（CoT 推理需要召回素材）
- **修复 world-recall 懒加载不写入分片**（故障 #58，中）
  - world-recall 工具懒加载嵌入只写 worldInfo store，记忆页面看不到懒加载的嵌入
  - `generateWorldInfoEmbeddings` 批量函数会同时写两处，两条路径行为不一致
  - 修复：懒加载后同步更新 worldVectorMemory 分片，保持与批量函数行为一致
- **修复保存侧无 fallback 导致孤儿数据**（故障 #3，中）
  - 加载侧 `loadVectorMemoryShards` 有 fallback（会话级键为空时回退到角色级键）
  - 但保存侧 `saveVectorMemoryShards` 只写会话级键，旧角色级键的分片不会被清理
  - 修复：保存到会话级键后，检查并清理角色级键的旧数据
- **添加 currentCharacter 为 null 时的诊断日志**（故障 #1，高）
  - `currentCharacter` 为 null 时向量分片加载为空数组，整个 pipeline 静默停摆
  - 修复：添加 warn 日志，便于用户感知和诊断

### 🔍 故障点核查结论

59 个故障点核查结果：
- **确认存在 5 个**：#4、#13、#58、#3、#1（均已修复）
- **不存在/已修复约 15 个**：
  - #20-27（extractMemory early return 已有 logger.debug，v0.5.9 修复）
  - #33（buildVectorMemory 无模型时已是 warn 级别，v0.5.9 升级）
  - #48（embedding 缓存不会缓存空向量，requestEmbeddings 会抛错拦截）
- **部分存在 1 个**：#5（world-recall 懒加载只写 worldInfo，已通过修复 #58 解决）
- **行号定位有误但逻辑成立 1 个**：#13（buildContext 实际在 chatService.ts 而非 chat-slice.ts）
- 其余为低优先级设计行为或影响极小的边角竞态，暂不处理

## v0.6.1

### 🐛 修复

- **修复选择器层级结构**：世界书选择器从一级移到二级，与角色卡关联
  - 会话和世界书同为二级选择项，互斥选择（选会话清空世界书，选世界书清空会话）
  - 角色切换时重置会话和世界书选择
- **修复向量记忆分片无法显示**：`loadVectorMemoryShards` 添加向后兼容回退逻辑
  - 当带 session 的键返回空时，自动尝试不带 session 的角色级键
  - 解决旧版保存时 `currentSessionId` 为 null 导致分片存到角色级键，但加载时自动选择会话导致键不匹配的问题

## v0.6.0

### 🐛 重大修复

> 修复向量记忆分片完全失效问题，新增分片详情 Dialog、删除功能和处理动画。

- **修复向量记忆分片完全失效**：解除 `extractMemory` 闸门，会话向量记忆不再被 `longTermMemoryCharacterIds`（已锁定的长期记忆功能）阻挡，现在只受 `memorySettings.enabled` 控制
- **修复世界书单条保存覆盖整本分片**：`generateWorldInfoEmbeddings` 改为合并保存模式，按 content 去重，逐条编辑保存不再清空整本只剩当前 1 条

### ✨ 新功能

- **分片详情 Dialog**：点击分片列表项打开详情弹窗，查看完整内容、元数据（轮次/维度/创建时间）
- **分片删除功能**：详情 Dialog 内支持删除单个分片，带二次确认
- **处理动画指示器**：
  - 世界书页面：保存/导入条目时显示"正在生成向量记忆分片..."脉冲动画
  - 记忆页面：分片列表为空且嵌入模型已配置时显示处理中占位项
- **Skeleton 加载状态**：分片列表加载时显示骨架屏占位

### 🎨 UI 优化

- 分片列表项改为可点击，添加 `listItemAnimation` + `cursor-pointer` + `hover:bg-muted/50` 交互效果
- LongTermMemoryTab 文案更新：明确告知当前设置不影响会话向量记忆

### 🔧 技术改进

- 新增 `removeVectorMemoryShardById` / `removeWorldVectorMemoryShardById` 服务函数
- `handleDeleteShard` callback 区分 world/session 两个分支

## v0.5.9

### 🎯 记忆系统重构 + 向量分片修复 + 翻译高亮

> 修复向量记忆分片失效问题，重构记忆页面结构，增强嵌入引导，世界书预生成嵌入向量，翻译全文高亮。

#### 锁定长期记忆功能

- **`memory.tsx`**：`LongTermMemoryTab` 替换为锁定提示卡片（IconLock + "功能开发中，敬请期待"）
  - 保留 tab 入口但内容不可交互，约 280 行缩减为占位卡片
  - 角色卡启用选择保留在锁定卡片下方，供将来解锁后使用
- **`memoryService.ts`**：长期记忆后端代码全部用 `// v0.5.9-locked` 行注释标记
  - `LONG_TERM_MEMORY_STORAGE_KEY_PREFIX` 常量
  - `loadLongTermMemory` / `saveLongTermMemory` / `buildLongTermMemory` / `searchLongTermMemory` / `searchAllMemory`
  - `MemorySearchResult` 接口
- **`types/luzzy.ts`**：`MemoryScope` 和 `MemoryEntry` 类型用 `// v0.5.9-locked` 注释

#### longTermMemoryCharacterIds 逻辑反转

- **`chat-slice.ts`**：`longTermMemoryEnabledForCharacter` 空列表语义从"全部启用"反转为"全部禁用"
  - 旧：`if (!ids || ids.length === 0) return true;`
  - 新：`if (!ids || ids.length === 0) return false;`（需手动勾选才能启用）
- **`memory.tsx`**：`longTermMemoryCharacterIds` 选择器从 `MemorySettingsCard` 移到 `LongTermMemoryTab`
  - 标签文案更新：空列表显示"全部禁用"，非空显示"N 个角色卡"
  - 提示文案："选择要启用长期记忆的角色卡（不选则全部禁用）"

#### 重构向量记忆选择器

- **`memory.tsx` `SessionMemoryTab`**：
  - 移除"全部会话（角色级）"选项（`SelectItem value="__all__"`）
  - 会话选择器缩进为角色选择器的二级选项（`ml-4` + `border-l` 视觉缩进 + 字号略小）
  - 默认自动选中最近会话（保持 v0.5.7 行为）
  - 新增"选择世界书"一级 `Select`，与角色卡平级
    - 数据源：从 `worldInfo` IndexedDB 提取唯一 `bookId`/`bookName` 并统计条目数
    - 选择后加载键 `vector_memory_world_<bookId>` 的分片
- **`memoryService.ts`**：新增 `loadWorldVectorMemoryShards` / `saveWorldVectorMemoryShards` 函数
  - 新增 `WORLD_VECTOR_MEMORY_STORAGE_KEY_PREFIX = 'vector_memory_world_'` 常量

#### 嵌入模型未配置时引导提示

- **`memory.tsx` `MemorySettingsCard`**：顶部添加 amber 色调醒目横幅
  - "⚠️ 请先配置嵌入模型以启用向量记忆和语义检索功能"
  - 横幅内含"前往配置"按钮，点击平滑滚动到嵌入模型选择器
  - 使用 `AnimatePresence` + `motion.div` 实现进入/退出动画
- **`memory.tsx` `SessionMemoryTab`**：无嵌入模型且无分片时显示空状态引导
  - "尚未配置嵌入模型" + "前往配置" 按钮
  - 替代原泛化的"暂无向量记忆分片"空状态

#### 世界书导入/创建时预生成嵌入向量

- **`memoryService.ts`**：新增 `generateWorldInfoEmbeddings` 函数
  - 批量调用 `getEmbedding`（复用现有缓存）
  - 写回 `entry.embedding` 字段并持久化到 IndexedDB
  - 按 `bookId` 分组保存为向量分片到 `vector_memory_world_<bookId>`
  - 仅处理无 embedding 或内容变更的条目
- **`world-info.tsx`**：
  - `handleSaveEntry`：保存条目后清除已有 embedding 并异步调用 `generateWorldInfoEmbeddings()`
  - `handleFileImport`：导入世界书后异步调用 `generateWorldInfoEmbeddings()`
  - 仅当 `memorySettings.embeddingModel` 已配置时触发
  - toast 提示："已开始为 N 条世界书条目生成嵌入向量..."

#### pipeline 诊断日志增强

- **`chatService.ts` `extractMemory`**：每个 early return 添加 `logger.debug` 诊断日志
  - `!memorySettings.enabled` → "记忆功能未启用"
  - `!character` → "无当前角色卡"
  - `messages.length < 2` → "消息不足 2 条"
  - `lastUserIndex === -1` → "未找到用户消息"
  - `lastUserIndex >= messages.length - 1` → "用户消息后无 assistant 消息"
  - `!userMessage || !assistantMessage` → "用户或 assistant 消息对象为空"
  - `assistantMessage.role !== 'assistant'` → "最后一条消息非 assistant"
  - `!userContent.trim() || !assistantContent.trim()` → "消息内容为空"
  - 入口/出口添加 `logger.info` 日志
- **`memoryService.ts` `buildVectorMemory`**：
  - `!embeddingModel` 从 `debug` 升级到 `warn`（便于诊断向量记忆失效问题）
  - 入口日志增加轮次信息：`buildVectorMemory: turns=N 分M 批请求嵌入`

#### 翻译文本全文高亮

- **`luzzy-chat-message.tsx` `TranslationCard`**：
  - 读取 `highlightSettings.enabled` 和 `highlightSettings.color`
  - 启用时翻译内容容器设置 `style={{ color: highlightSettings.color, fontWeight: 500 }}`
  - 翻译为独立样式，不受原文正则高亮干扰
  - `fontWeight: 500` 使其与原文视觉区分

#### 版本号更新

- `frontend/package.json`: `0.5.8` → `0.5.9`
- `android/app/build.gradle`: `versionCode 31` → `32`, `versionName "0.5.8"` → `"0.5.9"`
- `android-patches/build.gradle`: 同步更新
- `luzzy-global-trpg-iframe.tsx`: `?_v=0.5.8` → `?_v=0.5.9`（TRPG 模式缓存版本号同步）
- `about.tsx`: `APP_VERSION "v0.5.8"` → `"v0.5.9"`
- `README.md`: 版本徽章 `v0.5.8` → `v0.5.9`

---

## v0.5.8

### 🎯 用户需求闭环：15 项修复与增强

> 涵盖翻译模型选择、思考卡片吸附、正文流式直出、工具搜索增强、档案数据保护、日志吸附、动态文案等。

#### 翻译专用模型选择（问题 1）

- **`translationService.ts`**：新增 `resolveTranslationApi()` 函数，支持翻译专用模型配置
  - `TranslationSettings` 新增 `translationModelId` 字段（`providerId_modelName` 格式）
  - 空值 = 使用主模型（兼容旧行为），设置后使用指定供应商和模型
  - 支持跨供应商选择（自动匹配对应 API 地址和 Key）
- **`settings.tsx`**：翻译设置卡片新增模型选择下拉框（"使用主模型" + 所有供应商模型列表）
- **`chat-slice.ts`**：`translateMessage` 适配专用模型路由

#### 思考卡片内滚动吸附流式输出（问题 2）

- **`luzzy-thinking-timeline.tsx`**：`ThinkingNode` 新增滚动吸附逻辑
  - 流式输出时自动将内容区域滚动到底部（`scrollTop = scrollHeight`）
  - 用户手动向上滚动 > 30px 时解除吸附，恢复手动浏览
  - 滚回底部时自动恢复吸附

#### 正文流式直出（问题 4）

- **`markdown.tsx`**：禁用 Streamdown 词级淡入动画（`animated: false`）
  - 根因：`sep: "word"` + `duration: 150` 导致所有词同时淡入，产生"模拟打字机"效果
  - 修复：文字直接逐字渲染，AI 输出到第几个字就显示到第几个字

#### 工具搜索增强（问题 5）

- **`chat-slice.ts`**：
  - `world-search` / `world-recall` 降级模式：新增精准 key 匹配评分（完全匹配 = 5x，子串匹配 = 2x，内容匹配 = 1x）
  - `keyword-search`：重写为多关键词拆分匹配（按空格/标点拆分→各词独立评分→按匹配数排序）

#### 工具节点显示工具数量（问题 6）

- **`luzzy-thinking-timeline.tsx`**：工具聚合节点标题显示工具数量（如 `工具调用 (3)`）

#### 工具查询参数质量增强（问题 7）

- **`chatService.ts`**：重写 `TOOL_DECISION_PROMPT`
  - 新增「严格禁止使用的无效泛化词」列表（"当前" "地点" "设定" 等）
  - 新增「必须使用的具体实体词」指导（地名、人名、物品、事件、概念）
  - 新增「工具用途速查」表格
  - 升级所有示例，展示上下文推断关键词的完整做法

#### 关于页动态文案（问题 8）

- **`about.tsx`**：静态文本"AI 角色扮演与TRPG对话应用"改为 4 条文案轮播
  - "陪伴，夜晚，你" / "那天的阳光正好，是你来了" / "每次对话，都像一本有你的小说" / "我从不想念过去，因为现在，有你"
  - 使用 `AnimatePresence` + `motion.span` 实现淡入淡出切换（4.5 秒间隔）

#### README 更新（问题 9）

- 标语改为"每次对话，都像一本有你的小说"；删除 rikkahub 引用段落

#### 向量记忆分片修复（问题 10）

- **`chat-slice.ts`**：`longTermMemoryEnabledForCharacter` 逻辑修正
  - 空列表 = 全部启用（恢复 v0.5.5 行为），非空列表 = 仅启用列出的角色
  - **`memory.tsx`**：UI 标签从"全部禁用"改为"全部启用"

#### 默认档案数据丢失修复（问题 11）

- **`settings-slice.ts`**：新增 `defaultProfileData` 字段，保存默认档案的编辑内容
  - `setUser` 在默认档案激活时同步到 `defaultProfileData`
  - `switchProfile("default")` 和 `setDefaultProfileActive(true)` 从 `defaultProfileData` 恢复数据
- **`types.ts`**、**`app-store.ts`**：新增 `defaultProfileData` 类型和持久化

#### 用户档案默认名称优化（问题 13）

- **`settings-slice.ts`**：`DEFAULT_USER_PROFILE.name` 从"请前往设置自定义你的名称"改为空字符串

#### 日志查看器自动吸附（问题 14）

- **`about.tsx`**：日志列表新增自动滚动到底部
  - 新日志到达时自动吸附底部（`scrollTop = scrollHeight`）
  - 用户上滑 > 50px 解除吸附，显示"回到底部"浮动按钮
  - 点击按钮或滚回底部恢复吸附

#### TRPG 弹窗滚动修复（问题 15）

- **`trpg.tsx`**：Dialog 内容区域添加 `overflow-y-auto`，防止内容溢出遮挡按钮
- TRPG 代理（`MainActivity.java`）代码审查：逻辑正常，`resolveTargetBase()` 覆盖三种场景

### 📦 版本号统一

- 版本号 0.5.7 → 0.5.8（versionCode 30 → 31）
- 更新文件：`frontend/package.json`、`android/app/build.gradle`、`android-patches/build.gradle`、`luzzy-global-trpg-iframe.tsx`（缓存破坏参数）、`about.tsx`、`README.md`

---

## v0.5.7

### 🎯 用户需求闭环：CoT 卡片折叠、输入框对齐、记忆召回、工具提示词、世界书查询、流式输出

> 实际测试发现 6 个问题，逐一修复并优化。

#### CoT 思考卡片折叠 bug 修复（问题 1）

- **`luzzy-chat-message.tsx`**：修复 CotCard 组件 `useEffect` 逻辑缺陷
  - 根因：旧 `useEffect([isGenerating, isMainPhase])` 在 `isMainPhase=true` 时每次依赖变化都强制折叠，覆盖用户手动展开操作
  - 修复：使用 `useRef` 追踪 `isMainPhase` 上升沿（`false→true`）和 `isGenerating` 下降沿（`true→false`），仅在边沿变化时折叠一次，之后由用户完全控制
  - `AnimatePresence` 添加 `mode="wait"` 确保退出动画完成后卸载

#### 输入框按钮垂直对齐修复（问题 2）

- **`luzzy-chat-input.tsx`**：`flex items-end` → `flex items-center`
  - 根因：textarea `min-h-[44px]` 比按钮 `size-10`(40px) 高 4px，底部对齐导致按钮顶部低于 textarea 顶部
  - 修复：改为垂直居中对齐，全屏按钮、textarea、发送按钮三者在同一水平线上

#### 记忆召回工具卡片不显示修复（问题 3）

- **`chat-slice.ts`**：`longTermMemoryEnabledForCharacter` 仅控制记忆**写入**（`extractMemory`），不再阻止记忆**读取**（`memory-recall`、`vector-memory`）
  - 根因：v0.5.6 的 `longTermMemoryEnabledForCharacter` 同时控制了读取和写入，导致未配置长期记忆的角色无法召回已有记忆
  - 修复：从 `memory-recall` 预执行条件、`memory-recall` 工具执行条件、`vector-memory` 工具执行条件中移除 `longTermMemoryEnabledForCharacter`
  - 保留在 `extractMemory` 调用条件中——仅控制是否保存新记忆
  - 增强跳过日志：输出具体哪个条件未满足（`configEnabled`、`char`、`embeddingModel`、`shards`）

#### 记忆页默认打开最近会话（问题 3.1）

- **`memory.tsx`**：`SessionMemoryTab` 进入时自动选中 `updatedAt` 最新的会话
  - 根因：`selectedSessionId` 默认 `""`（角色级全部会话），用户期望默认打开最近会话
  - 修复：角色切换时自动选中最近会话；会话列表按 `updatedAt` 降序排序
  - 保留"全部会话（角色级）"选项供手动切换

#### Phase 1 工具决策提示词优化（问题 4）

- **`chatService.ts`**：重写 `TOOL_DECISION_PROMPT`
  - 根因：旧示例引导 AI 传自然语言短语（如 `world-recall:周围环境场景设定`），无法命中关键词匹配
  - 修复：新增「查询关键词拆分规则」，明确指示 AI 从用户消息+上下文提取关键实体词，空格分隔
  - 新增错误/正确做法对比示例
  - 同步更新 `BUILTIN_TOOL_INFO` 中 `vector-memory`、`keyword-search`、`world-recall`、`world-search` 的描述和参数说明
  - 同步更新 `apiClient.ts` 中 `buildToolSchema` 的参数描述

#### 世界书工具查询逻辑增强（问题 5）

- **`chat-slice.ts`**：
  - `world-recall`：无嵌入模型时自动降级为 `world-search` 关键词模式（此前直接跳过不返回结果）
  - `world-search`：单个中文长词（>2 字符）增加 2-gram 拆分（如"周围环境场景设定" → 拆分为"环境"、"场景"、"设定"等 2 字组合），大幅提升匹配率
  - 两个工具统一支持空格分隔多关键词查询

#### Android 流式输出帧率优化（问题 6）

- **`apiClient.ts`**：优化流式输出帧率控制
  - 根因：`setTimeout(resolve, 0)` 在 React 18 自动批处理下，同宏任务内多个 setState 被合并，导致"突然蹦出"
  - 修复：每帧最多处理 3 行 SSE 数据，达到上限后让出 16ms（约 60fps）帧时间
  - XHR 路径（`processIncrementalAsync`）：增加 `MAX_LINES_PER_FRAME` 限制
  - Fetch 路径（`sendStreamRequestViaFetch`）：增加 `FETCH_MAX_LINES_PER_FRAME` 限制和帧间让出
  - 非流式回退路径：`setTimeout(resolve, 0)` → `setTimeout(resolve, 16)`

---

## v0.5.6

### 🎯 用户需求闭环：ACE 记忆机制删除、长期记忆过滤、绑定删除弹窗

> 用户明确要求：删除 ACE 记忆机制及相关设置；长期记忆设置从"不选则全局启用"改为"不选则全部禁用"；
> 角色卡/世界书绑定时删除弹窗提示是否同步删除。

#### 删除 ACE 记忆机制（新增 4）

- **完整删除 ACE 三服务**：`aceSkillbookService.ts`（509 行）、`aceReflectorService.ts`（293 行）、`aceSkillManagerService.ts`（168 行）全部移除
- **chat-slice.ts**：移除 ACE 反思流程、`GlobalMemory` 类型导入、`globalMemoryCharacterIds` 默认值、`searchGlobalMemory` 变量计算、`globalMemory`/`searchGlobalMemory` 从 `buildContext` 调用中移除
- **chatService.ts**：移除 `GlobalMemory` 类型导入、`globalMemory`/`searchGlobalMemory` 从 `BuildContextParams` 接口和 `buildContext` 解构中移除
- **types/luzzy.ts**：移除 `GlobalMemory` 接口、`globalMemoryCharacterIds` 字段、`searchGlobalMemory` 字段、所有 ACE 类型定义（`AceSkillSource`、`AceSkillVerdict`、`AceSkill`、`AceSkillbook`、`AceSkillEvaluation`、`AceNewSkill`、`AceReflection`、`AceExecutionTrace`）
- **memoryService.ts**：移除 `GLOBAL_MEMORY_STORAGE_KEY`、`getGlobalMemory`/`setGlobalMemory` 函数、`searchAllMemory` 中的全局记忆关键词匹配和语义搜索分支
- **settings-slice.ts**：移除 6 个 `DEFAULT_BUILTIN_TOOL_CONFIGS` 中的 `searchGlobalMemory: false` 字段
- **memory.tsx**：移除 ACE 服务导入、全局记忆 Tab、`GlobalMemoryTab`/`SkillCard`/`SkillEditDialog` 三个组件定义（约 490 行）、`globalMemoryCharacterIds` 默认值
- **tools.tsx**：移除 `searchGlobalMemory` 开关 UI

#### 长期记忆设置变更（新增 5）

- **chat-slice.ts**：新增 `longTermMemoryEnabledForCharacter` 辅助变量，实现 `longTermMemoryCharacterIds` 过滤逻辑
  - 空列表 = 所有角色卡的向量记忆均不启用
  - 非空列表 = 仅启用列出的角色卡
  - 应用到 4 处调用点：memory-recall 预执行条件、memory-recall 工具执行、vector-memory 工具执行、extractMemory 调用
- **memory.tsx**：UI 文案修改 — 空列表显示"全部禁用"而非"全部角色卡"，提示文案改为"不选则全部角色卡均不启用"

#### 角色卡/世界书绑定删除弹窗（新增 6）

- **新建 `luzzy-binding-delete-dialog.tsx`**：基于 `luzzy-confirm.tsx` 的 Context + Hook 模式，扩展为三选一（取消 / 仅删除 / 同步删除）确认弹窗
  - 使用 glassmorphism 风格，图标来自 game-icon-pack（IconLink、IconExclamation、IconTrash、IconClose）
  - 三态丝滑动画：进入（spring scale + fade）、交互（pressable）、退出（fade out + scale down）
  - 在 `root.tsx` 中 `ConfirmProvider` 内嵌套 `BindingDeleteConfirmProvider`
- **characters.tsx**：删除角色卡时检查 `extensions.worldInfoId` 绑定，若有绑定则弹出绑定删除确认弹窗
  - 选择"仅删除"：仅删除角色卡，保留绑定世界书
  - 选择"同步删除"：删除角色卡 + 删除绑定的世界书条目
- **character-slice.ts**：`deleteCharacter` 新增 `options?: { syncDeleteWorldBook?: boolean }` 参数，仅当 `syncDeleteWorldBook` 为 true 时执行世界书条目删除
- **world-info.tsx**：删除世界书时检查是否有角色卡绑定此世界书，若有绑定则弹出绑定删除确认弹窗
  - 选择"仅删除"：仅删除世界书条目，清理角色卡的 `worldInfoId` 引用
  - 选择"同步删除"：删除世界书条目 + 删除绑定的角色卡

#### 流式输出验证（Fix 3）

- 经研究确认，流式输出修复实际已完整：
  - **apiClient.ts**：XHR 每行让出 + 非流式回退让出 + Fetch 优先 + XHR 回退
  - **markdown.tsx**：`useDeferredValue` 已存在（v0.5.4 添加）
  - **luzzy-chat-message.tsx**：`React.memo` 自定义比较函数已存在
- rikkahub 使用 Kotlin Flow + `mapLatest + flowOn(Dispatchers.Default)`，技术栈不同（Kotlin/Compose vs TypeScript/React），无法直接复制代码。设计模式已通过 React 18 `useDeferredValue` 移植，等价于 rikkahub 的后台 markdown 解析

#### 翻译 fail to fetch 修复（新增 1）

- **apiClient.ts**：新增 `sendRequestViaXHR` 和 `sendRequestViaFetch` 函数
  - Fetch 优先，XHR 回退（Android WebView 兼容）
  - 火山方舟 CodingPlan 供应商的翻译功能不再出现 fail to fetch

#### 输入框对齐修复（新增 2）

- **luzzy-chat-input.tsx**：移除全屏按钮的 `variant="ghost"`，使全屏按钮和发送按钮在同一水平线上

#### 向量记忆切片修复（新增 3）

- **chatService.ts**：移除 `parseCot` 调用，直接使用 `message.content` 进行向量记忆切片
  - 现在切片内容为 user 原始文本和 AI 回复的正文，不再包含思考步骤内的文本

---

## v0.5.5

### 🎯 用户需求闭环：流式输出、节点顺序、正文阶段滚动与折叠

> 用户明确要求：所有输出内容（卡片内、卡片外、每个节点内部、正文气泡）都必须是流式输出；
> 节点按顺序展示、未输出的节点不展示、到哪个步骤才蹦出哪个节点；
> 所有节点输出完毕进入正文阶段时，自动取消底部吸附，把用户视角放在正文气泡首字位置（在屏幕显示范围内即可，不强制定顶）；
> 自动折叠一级思考卡片；正文气泡也要从首字到尾字流式输出。

#### 每个节点内部从首字到尾字流式输出（已验证并强化）

- **`chat-slice.ts`**：`chunk.reasoningContent` 实时追加到 `accumulatedReasoning` 并同步更新 `brainstorm` 节点的 `content`；`chunk.content`（phase=cot）实时追加到 `accumulatedContent` 并同步更新 `cot_output` 节点的 `content`
- **`luzzy-thinking-timeline.tsx`**：`ThinkingNode` 直接渲染 `step.content`，`Markdown isAnimating={isRunning}` 启用 Streamdown 按词淡入动画，节点内容随 SSE chunk 从首字到尾字增长，零滞后
- **节点按顺序出现**：`brainstorm` / `cot_output` / `tool_call` / `tool_result` 等节点仅在对应 phase 收到第一个 chunk 时才 push 进 `agentSteps`，未输出的节点不会占位

#### 思考卡片顺序编排修复

- **`luzzy-thinking-timeline.tsx` 重写 `mergeSteps`**：此前使用 `splice(insertIndex, 0, toolStep)` 在已构建数组中插入工具节点，因后续空节点过滤导致索引错位，出现「头脑风暴→工具→头脑风暴→头脑风暴→CoT输出」的乱序
- 修复后严格按固定顺序 push：
  ```
  头脑风暴(p1) → 工具调用（聚合） → 头脑风暴(p2) → CoT输出(p2) → 头脑风暴(p3)
  ```
- 空节点（无 content）在最终过滤时被剔除，不占位

#### 正文阶段滚动与一级思考卡片折叠

- **`chat.tsx`**：
  - 新增 `prevMainPhaseRef`，监听 `isMainPhase` 从 `false → true` 触发正文阶段切换
  - 进入正文阶段时调用 `bubbleEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`，只保证正文气泡首字进入可视范围，不再强制定顶
  - 正文阶段取消底部吸附：消息变化时的自动滚底仅在 `!isMainPhase` 时生效
  - 非正文阶段（思考/工具阶段）仍保持底部吸附
- **`luzzy-chat-message.tsx` 的 `CotCard`**：
  - 读取 `isMainPhase` 状态，进入正文阶段立即 `setExpanded(false)` 折叠一级思考卡片
  - 生成完全结束后也保持折叠

#### 正文气泡流式输出强化

- **`luzzy-chat-message.tsx`**：移除 `message.content?.endsWith("*-- 生成已中止 --*")` 对流式动画的关闭判断，正文 `Markdown` 的 `isAnimating` 在生成中且为最后一条消息时始终保持 `true`，确保正文气泡从首字到尾字持续流式动画

---

### 🧠 CoT 阶段不听话续写剧情修复

> 用户反馈：即使经过 v0.5.4 修复，CoT 阶段模型仍会续写剧情，且思考卡片顺序混乱、气泡出现思考内容。
> 根因：phase=2 历史消息仍保留 assistant 剧情回复，模型会模仿续写；`finalCotForReturn` 把 `<cot>` 标签外的剧情正文也带给了请求 3；请求 3 末尾指令太像任务说明，模型复述英文内心独白。

#### 上下文隔离

- **`chatService.ts`**：`phase=2` 时聊天记录不再保留完整 assistant 剧情回复，仅保留最近 3 条 `user` 消息 + 工具结果，彻底消除模型可模仿的续写模板

#### CoT 输出严格过滤

- **`chat-slice.ts` 的 `finalCotForReturn`**：phase=cot 时只取 `<cot>` 标签内内容 或 `reasoning_content`，`<cot>` 标签外的剧情正文直接丢弃，防止污染请求 3

#### Prompt 强化

- **`chatService.ts` 的 `COT_OUTPUT_PROTOCOL`**：
  - 改为「绝对禁令」开头，明确告知本阶段只输出思考链、禁止输出任何剧情正文/角色对话/场景描写
  - 提供方式 A（`reasoning_content` 字段）和方式 B（`<cot>` 标签）的强制格式示例
  - 新增历史消息说明：assistant 回复仅供掌握剧情事实，不是让模型模仿续写
- **`chat-slice.ts` 的 phase=3 末尾 user 指令**：从「基于以上思考过程，现在请直接输出正文回复」改为「以上是你的内部思考过程，仅供参考。现在请直接延续剧情输出正文回复，不要复述任务、不要解释你在做什么、不要输出英文计划或‘用户想要我…’之类的内心独白」

#### 工具决策解析兼容

- **`chat-slice.ts` 的 `parseToolDecisions`**：模型可能输出 `<vector-memory:query|keyword-search:query>` 形式的标签，此前只识别 `<tool_calls>...</tool_calls>` 或 `NO_TOOLS`。修复后同时兼容两种格式，确保工具调用链不被中断

---

### 🧠 思考卡片层级与流式行为修复（v0.5.4 补丁）

#### 工具节点聚合为单一"工具调用"节点

- **`luzzy-thinking-timeline.tsx`**：扩展 `CombinedToolStep` 类型，新增 `subItems` 聚合子项
- **重写 `mergeSteps`**：两阶段处理（Phase 1 收集归类，Phase 2 固定顺序输出），严格按 `头脑风暴(p1) → 工具调用（聚合） → 头脑风暴(p2) → CoT 输出(p2) → 头脑风暴(p3)` 渲染
- **`ToolNode` 固定高度**：展开区高度从 `max-h-[320px]` 调整为 `max-h-[360px]`；存在 `subItems` 时遍历渲染每个工具的"调用参数 + 执行结果"子区块

#### 流式行为完整实现

- **`chat-slice.ts`**：新增 `isMainPhase` 状态，进入 phase=3（正文）时置为 `true`，生成完成后重置
- **`chat.tsx`**：`isReceiving` 从 `false → true` 时，若处于 `isMainPhase` 不再 `scrollToBottom()`，而是滚动到正文气泡首部（`data-luzzy-message-bubble`），实现"正文阶段脱底 + 视角切换"
- **`luzzy-chat-message.tsx`**：正文气泡容器新增 `data-luzzy-message-bubble` 属性用于定位

#### 请求1上下文污染修复

通过日志 `LUZZY-logs-2026-06-23T05-05-32` 根因分析：模型在 phase=1 时因 `firstMessage` 注入 + 完整历史对话上下文，形成 `assistant → user → (待回复)` 结构而惯性续写正文。

- **`chatService.ts`**：
  - `firstMessage` 注入增加 `phase !== 1` 守卫，工具决策阶段不再注入角色开场白
  - `phase === 1` 时聊天记录仅保留最后一条 `user` 消息，截断完整历史对话，消除"请续写"信号

#### 计数徽章修正

- **`luzzy-chat-message.tsx`**：`toolStepCount` 改为"有工具则 1"（聚合后最多 1）；`thinkingStepCount` 改为 `brainstorm + cot_output + thinking` 总数

---

### 🌊 流式输出深度修复（核心 — 解决"一次性全部蹦出"问题）

> 用户反馈流式输出始终无法实现（思考卡片和正文都一次性蹦出）。经 6 层根因分析，
> 定位到 Android XHR onprogress 批量触发为主因，辅以非流式回退、全量重渲染、
> Markdown 同步解析阻塞等问题。参考 rikkahub 的 `mapLatest + flowOn(Dispatchers.Default)`
> 后台解析模式，使用 React `useDeferredValue` 等价实现。

#### 6 层根因修复

- **C1 — XHR 异步队列处理**（`apiClient.ts`）：Android 平台 `onprogress` 因 NanoHTTPD 代理缓冲导致批量触发。新增 `pendingChunks` 队列 + `isProcessing` 标志 + `processIncrementalAsync` 异步处理函数，每 10 行让出主线程一次（`setTimeout(resolve, 0)`），允许浏览器在 chunk 之间重绘 UI
- **C2 — 非流式回退分批让出**（`apiClient.ts`）：content-type 非 event-stream 时的整体 JSON.parse 改为逐行 SSE 解析，每 10 行让出主线程
- **C3 — React.memo 避免全量重渲染**（`luzzy-chat-message.tsx`）：新增自定义比较函数，仅当 message.id/content/cot/loading/error/agentSteps/isGenerating/isLast/avatarUrl/avatarName 变化时重渲染，避免流式更新触发整个消息列表重渲染
- **C4 — parseThinkingSteps 始终缓存**（`luzzy-thinking-timeline.tsx`）：移除 `isGenerating` 限制，生成中也启用缓存（MAX=50，LRU 淘汰），避免每次流式更新全量正则解析
- **C6 — useDeferredValue 延迟 Markdown 解析**（`markdown.tsx`）：等价 rikkahub 的 `mapLatest + flowOn(Dispatchers.Default)` 后台解析模式，流式期间 content 高频变化时 React 优先处理 UI 交互，空闲时才解析 Markdown
- **C7 — 流式期间禁用文本选择**（`luzzy-chat-message.tsx`）：`userSelect: message.loading ? 'none' : 'text'`，避免内容追加导致选区错乱

#### rikkahub 源码复用分析

rikkahub 是 Kotlin/Compose Android 原生应用，与 RP-Hub（TypeScript/React/Capacitor）语言和运行时完全不同，**源码不可直接复用**。但其核心设计模式已等价移植：
- `mapLatest`（取消旧解析）→ `useDeferredValue`（React 18+ 原生支持）
- `flowOn(Dispatchers.Default)`（后台调度）→ `useDeferredValue` 自动延迟到低优先级
- `callbackFlow + EventSource`（SSE 接收）→ `XHR onprogress + 异步队列`

---

### 🏗️ 三请求架构修复

- **A1 — world-recall enabled 过滤修复**（`chat-slice.ts`）：移除 `executeToolByName` 中的 enabled 二次过滤（加载时已按 bookId 过滤，buildContext 已按 enabled 过滤），避免误删有效条目
- **A2 — embedding 懒加载**（`chat-slice.ts`）：对缺少 embedding 的 WorldInfoEntry 实时生成并持久化到 IndexedDB，修复 `WorldInfoEntry.embedding` 从未赋值导致语义检索退化为无序的问题
- **B2 — onChunk abort 检查**（`chat-slice.ts`）：onChunk 回调首行检查 `abortController?.signal.aborted`，避免向已卸载组件写入状态
- **B3 — Phase 3 后 abort 检查**（`chat-slice.ts`）：正文生成完成后、工具调用循环之前检查 abort，避免卸载后继续执行工具调用

---

### 🔧 三请求架构结构性缺陷修复

> 通过用户日志 `LUZZY-logs-2026-06-23T03-42-39` 溯源定位：三请求共享同一 contextMessages、输出写入不区分阶段、CoT 提取依赖标签等问题。

#### 缺陷A — 请求间结果传递（`chat-slice.ts`）

请求1的工具决策结果（`NO_TOOLS` 或 `tool_calls` 摘要）此前从未注入后续请求上下文，请求2/3完全看不到请求1发生了什么。修复：请求1完成后将规范化决策作为 `<tool_decision>` assistant 消息追加到 contextMessages，请求2/3即可见。

#### 缺陷B — phase=tool 输出隔离（`chat-slice.ts`）

此前 `phase !== "cot"` 的二分逻辑使 `phase=tool` 走 else 分支，将请求1返回的 `NO_TOOLS\n\n---\n正文` 直接写入 `message.content` 气泡。修复：流式/非流式/最终态三处写入逻辑改为 `tool`/`cot`/`main` 三分支严格隔离，`phase=tool` 仅更新 agentSteps，绝不触碰 content/cot。

#### 缺陷D — CoT 阶段设定隔离说明（`chatService.ts`）

请求2的角色设定/世界书段落此前无隔离说明，模型易混淆用途直接据此生成正文。修复：`phase=2` 时在 `[Character]` 和 `[World Info]` 段落前追加 `[以下设定内容仅为你的 CoT 推理参考素材，本阶段你只输出思考链，不输出正文]` 头部说明。

#### 提示词阶段独立性强化（`chatService.ts`）

- `TOOL_DECISION_PROMPT`：新增"不要续写对话"明确禁止模型作为角色输出正文
- `COT_OUTPUT_PROTOCOL`：重写为"本阶段唯一任务"开头，明确告知模型处于第2阶段、正文将在第3阶段独立生成，优先推荐 reasoning_content 字段输出（方式A），content 标签为备选（方式B）

---

### 📐 思考卡片层级重构（核心 — reasoning/content 分离显示）

> 通过用户日志 `LUZZY-logs-2026-06-23T04-07-58` 溯源定位：模型通过 `content` 字段返回思考内容（`reasoning_content` 为0），但 CoT 提取逻辑依赖 `<cot>` 标签导致思考卡片空白，且思考内容窜入气泡。
>
> **核心改造**：`reasoning_content` 和 `content` 是两个独立字段，必须分别创建独立的思考卡片节点，不再合并。

#### AgentStep 类型扩展（`luzzy.ts`）

新增两种节点类型：
- `brainstorm` — 头脑风暴（来自 `reasoning_content` 字段，模型原生思考）
- `cot_output` — CoT 输出（来自请求2的 `content` 字段）

#### 数据层重构（`chat-slice.ts`）

- `chunk.reasoningContent` → 创建 `brainstorm` 节点（标题"头脑风暴"），流式实时更新
- `chunk.content`（phase=cot）→ 创建 `cot_output` 节点（标题"CoT 输出"），流式实时更新
- `chunk.content`（phase=tool）→ 不创建节点（工具决策由外层解析处理）
- `chunk.content`（phase=main）→ 写入 `message.content` 正文气泡
- **phase=cot 不再写入 message.content**，彻底解决"思考内容窜入气泡"
- 删除旧的 `finalCot` 合并逻辑（reasoning 和 content 不再合并到同一个 thinking 节点）
- 删除未使用的 `THINKING_TITLES` 映射和 `parseCot` 对 reasoning 的二次提取

#### 渲染层重构（`luzzy-thinking-timeline.tsx`）

- 新增 `BrainstormStep`、`CotOutputStep` 类型，加入 `TimelineStep` 联合类型
- **重写 `mergeSteps` 函数**：不再过滤 `thinking` 类型，改为按 agentSteps 原始顺序遍历，将 `brainstorm`/`cot_output`/`tool_call`/`tool_result` 各自转换为对应节点
- 删除未使用的 `mergeAgentSteps` 函数（逻辑内联到 mergeSteps）
- **ThinkingNode 新增 `nodeType` 属性**：brainstorm 用琥珀色灯泡图标（`IconLight`），cot_output 用紫色消息图标（`IconMessage`），thinking 保持原样

#### 过滤移除（`luzzy-chat-message.tsx`）

移除了 `agentSteps?.filter((s) => !(s.type === "thinking" && message.cot))` 的二次过滤，直接传递所有 agentSteps 给 CotCard。

#### 思考卡片层级设计规范（用户明确需求）

三请求架构的每个阶段会产生两类内容，必须在思考卡片中以**独立的二级节点**分开显示：

```
一级思考卡片（顶层容器）
├── 📌 头脑风暴          ← 请求1 的 reasoning_content（模型原生思考）
├── 🔧 工具调用           ← 请求1 的 content（工具决策/调用，输入+输出合并）
├── 📌 头脑风暴          ← 请求2 的 reasoning_content（模型原生思考）
├── 🧠 CoT 输出          ← 请求2 的 content（CoT 思考链）
├── 📌 头脑风暴          ← 请求3 的 reasoning_content（模型原生思考）
└── 💬 正文              ← 请求3 的 content（最终气泡，非卡片节点）
```

关键规则：
- `reasoning_content` 和 `content` 是**两个独立的字段**，必须分别创建节点，不可合并
- 当 reasoning_content 为空（模型不支持思考字段，如 `thinking=false`）时，跳过「头脑风暴」节点，不创建空节点
- 当请求1的 content 为 `NO_TOOLS` 时，跳过「工具调用」节点
- 每个节点的内容随其阶段 SSE chunk 流式实时增长

---

### 🔧 日志溯源修复（`LUZZY-logs-2026-06-23T04-33-26`）

> 通过第二轮用户日志溯源，定位 4 个残留问题并修复。

#### P0 — 思考卡片消失 + 气泡显示"生成已中止"

- **`finalCotCombined` 为空**（`chat-slice.ts`）：请求2（CoT阶段）返回的 `cot` 字段依赖 `parseCot` 提取 `<cot>` 标签，但模型不使用标签时为空 → 请求3不注入 CoT 上下文 → 模型异常 → 触发 AbortError → 显示"生成已中止"。修复：`phase=cot` 时直接用 `accumulatedContent`（完整输出）作为返回值，不再依赖标签提取
- **`agentSteps: undefined` 覆盖**（`chat-slice.ts`）：5 处 `agentSteps: agentSteps.length > 0 ? [...agentSteps] : undefined` 在局部数组为空时，`undefined` 通过浅合并覆盖已有的 brainstorm/cot_output 节点。修复：改为条件展开 `...(agentSteps.length > 0 ? { agentSteps: [...agentSteps] } : {})`
- **phase=main 最终更新缺 agentSteps**（`chat-slice.ts`）：正文阶段最终更新只写 content，不写 agentSteps，导致后续 usage 更新的空数组覆盖。修复：补充条件展开的 agentSteps
- **预览过滤器不匹配新类型**（`luzzy-chat-message.tsx`）：预览过滤 `type === "thinking"` 不匹配 `brainstorm`/`cot_output`。修复：扩展过滤条件

#### P0 — 重试消息仍召回旧剧情（重大bug）

- **`retryMessage` 未清理向量分片**（`chat-slice.ts` + `memoryService.ts`）：重试时只做了内存中消息替换，IndexedDB 中 oldAssistant 对应的向量记忆分片未清理 → 记忆召回预执行搜索到旧内容 → 污染 newAssistant 生成。修复：`memoryService.ts` 新增 `removeVectorMemoryShardsByTurn` 函数；`retryMessage` 在调用 `generateResponse` 之前按 turn 号删除旧分片

#### P1 — 请求1模型续写正文

- **`TOOL_DECISION_PROMPT` 约束不足**（`chatService.ts`）：模型仍作为角色续写正文。强化提示词：新增「绝对禁止」清单 + 「重要提醒」明确告知模型不要写小说/描写场景

#### P2 — 流式输出按段落批量蹦出

- **让出阈值过高**（`apiClient.ts`）：Android XHR `onprogress` 批量触发时，每 10 行让出主线程导致多个 chunk 在一次重绘中渲染。修复：让出阈值从每 10 行降至每 3 行，更频繁重绘 UI

---

### 🗑️ 数据完整性

- **B1 — 组件卸载中止生成**（`chat.tsx`）：unmount cleanup useEffect 中检查 `abortController`，存在则调用 `stop()` 中止生成
- **B4 — 角色卡级联删除**（`character-slice.ts`）：`deleteCharacter` 扩展为级联删除 6 类关联数据：聊天记录、关联会话、向量记忆分片、长期记忆、世界书条目、正则脚本组、UI 模板绑定（知识库/技能/内置工具的 enabledForCharacters）

### 📦 版本号统一

更新 6 处版本号定义：`frontend/package.json`、`package.json`、`android/app/build.gradle`（versionCode 27）、`about.tsx`、`luzzy-global-trpg-iframe.tsx`（`?_v=0.5.4`）、`README.md` 徽章

---

## v0.5.1

### 🏗️ 三请求架构（核心需求 — 用户明确要求实现）

> 此架构为用户明确提出的设计方案：将单次 AI 对话拆分为三个独立 API 请求阶段，
> 分别处理工具决策、思考链生成和正文输出。每个阶段有独立的系统提示构建逻辑。

#### 架构设计

```
请求 1 — 工具决策（phase=1）
  系统提示: TOOL_DECISION_PROMPT + <available_tools>
  输入: 对话上下文（history + user message）
  输出: NO_TOOLS 或 <tool_calls>name:query|name2:query2</tool_calls>
  流式: chunk.content → message.content（工具决策文本）
  thinking 节点: "工具决策分析"（phase=1）

请求 2 — CoT 思考链（phase=2）
  系统提示: 角色预设 + 角色定义 + 常驻世界书 + 文风 + 用户/全局记忆 + COT_OUTPUT_PROTOCOL + <available_tools>
  输入: 对话上下文 + 请求1输出 + 工具执行结果
  输出: <cot>**Step 1：...**\n...\n</cot>
  流式: chunk.content → parseCot → message.cot（思考卡片）
  thinking 节点: "深度推理"（phase=2）

请求 3 — 正文（phase=3）
  系统提示: 角色预设 + 角色定义 + 常驻世界书 + 文风 + 用户/全局记忆 + <available_tools>（无输出协议）
  输入: 对话上下文 + 请求1输出 + 工具结果 + 请求2输出 + "请输出正文"指令
  输出: 角色扮演正文
  流式: chunk.content + chunk.reasoningContent → message.content（正文气泡）
  thinking 节点: "组织回复"（phase=3）
```

#### 实现要点

- **`chatService.ts`** — `buildContext` 新增 `phase` 参数（1/2/3）。phase=1 时跳过角色预设/世界书/文风/角色定义段落，注入 `TOOL_DECISION_PROMPT`。phase=3 时跳过 `COT_OUTPUT_PROTOCOL`（避免与末尾 user 指令冲突）
- **`chat-slice.ts`** — `callApiAndUpdate` 内 `buildContext` 调用传入 `phase: phaseNumber`。删除旧的 `TOOL_DECISION_PROTOCOL` 正则替换块（已由 buildContext 内部处理）
- **`parseToolDecisions`** — 解析 AI 工具决策输出，支持 `<tool_calls>...</tool_calls>` 和 `NO_TOOLS` 格式
- **请求 1 极简系统提示** — 仅含工具决策指令 + 可用工具列表，不含任何角色扮演内容。从根本上解决模型进入角色扮演模式而忽略工具调用指令的问题
- **请求 3 系统提示优化** — 去掉 CoT 输出协议，避免系统提示要求输出 `<cot>` 而末尾 user 消息要求"不要用 cot 标签"的矛盾

#### KV 缓存分析

| 请求 | 系统提示 | 缓存 |
|------|---------|------|
| 1 | 极简（~500字符） | Miss（首个请求） |
| 2 | 完整（含角色预设+CoT协议） | Miss（与请求1提示不同） |
| 3 | 完整（无CoT协议） | Hit（与请求2前缀匹配） |

#### 工具决策边界处理

| 情况 | 处理 |
|------|------|
| AI 输出 NO_TOOLS | `parseToolDecisions` 返回 `[]` → 跳过工具执行 |
| AI 输出无效格式 | 返回 `[]` → 日志记录原始回复 → 跳过 |
| AI 输出角色扮演 | 返回 `[]` → 日志警告 → 角色扮演文本不注入上下文 |
| AI 返回空响应 | `toolDecisionRaw.trim()` 为空 → 跳过解析 |
| 工具执行失败 | catch 块记录 warn 日志，不阻塞请求 2 |
| 用户中止 | `abortController.abort()` 在任何 phase 生效 |

### 🧠 三阶段思考节点分离

`chat-slice.ts` thinking 步骤按 phase（1/2/3）独立创建，不再用 `find(type==="thinking")` 覆盖：

- phase=1 → "工具决策分析"节点
- phase=2 → "深度推理"节点
- phase=3 → "组织回复"节点

每个节点的内容随其阶段的 SSE 流式数据实时增长。

### 🔧 系统提示 phase 感知

`chatService.ts` `BuildContextParams` 新增 `phase?: 1 | 2 | 3`。

### ❌ 删除系统强制预执行

删除所有工具的 force 模式预执行（~400 行）。保留 memory-recall 被动召回。

### 🎬 动画优化 + 📐 卡片裁剪 + ⚡ 流式 + 🧹 工具页 + 🏠 LUZZY

（详见上方 v0.5.1 之前的记录）

### 🏗️ 版本号

- v0.5.0 → v0.5.1

## v0.5.0

### 🎨 思考链 UI 完全重构（重点）

- **卡片化设计**：`luzzy-thinking-timeline.tsx` 将所有二级节点改为独立卡片：`rounded-lg` + `bg-card/60` + `backdrop-blur-sm` + 阴影，节点之间用细线连接，生成中节点带 `border-primary/30` 高亮与脉冲状态图标
- **工具调用合并**：新增 `CombinedToolStep` 类型与 `mergeAgentSteps` 逻辑，把相邻的 `tool_call` 与 `tool_result` 合并为单个节点卡片；调用参数、执行结果、错误信息分块显示（蓝/绿/红三色区分）
- **工具卡片宽度修复**：为 `motion.div` 与外层容器添加 `w-full`，解决 Framer Motion `layout` 动画在初始阶段按内容 intrinsic 宽度收缩的问题
- **展开/收起优化**：`luzzy-chat-message.tsx` 中 CotCard 生成完成后自动收起；一级思考卡片使用 glassmorphism 风格（`rounded-xl` + `bg-card/50` + `backdrop-blur-md`），显示步骤数徽章与最后一步预览

### 🌈 聊天页玻璃拟态沉浸体验

- **顶部标题栏透明化**：`chat.tsx` 给 `LuzzyLayout` 传入 `headerClassName`：`bg-gradient-to-b from-background/85 via-background/55 to-transparent`，与底部输入区渐变镜像对称；顶部功能按钮统一为 `size-10 rounded-full border border-border/10 bg-background/40 backdrop-blur-sm hover:bg-background/60`，间距加大为 `gap-2`
- **底部输入区透明化**：`luzzy-chat-input.tsx` 保持 `bg-gradient-to-t from-background/85 via-background/55 to-transparent`；第一排间距加大为 `gap-3`，发送按钮改为圆角玻璃拟态主色调（`border-primary/20 bg-primary/10 text-primary hover:bg-primary/20`）并替换图标为 `IconSend`，与左侧全屏按钮风格统一
- **工具栏统一**：`luzzy-chat-input.tsx` 第二排模型/思考深度/更多按钮统一为 `size-9 rounded-full border border-border/10 bg-background/40 backdrop-blur-sm hover:bg-background/60`，状态指示器改为居中药丸胶囊（`rounded-full border border-border/10 bg-background/40`），解决右侧排版拥挤并提升视觉层次
- **可读性保证**：所有功能按钮保留足够对比度，背景图片只是隐约可见而不会让功能按键不可见

### 🔧 工具系统深度修复（本 session 重点）

- **记忆召回修正确数据源**：`memory-recall` 预执行从搜索空库 `longTermMemory` 改为搜索会话级向量记忆分片 `searchVectorMemoryWithScore`，使用最新用户消息自动匹配历史对话轮次。移除对 `longTermMemoryCharacterIds` 的依赖，改为检查 `memorySettings.embeddingModel`
- **世界书召回默认开启**：`world-recall` 的 `DEFAULT_BUILTIN_TOOL_CONFIGS` 中 `enabled: false` → `true`，首次启动即为开启状态
- **关键词检索数据源统一**：`executeToolByName` 中 keyword-search 优先搜索 `vectorMemoryShards`（会话级记忆），无分片时回退到原始 `get().messages`，与预执行路径保持一致
- **工具描述全面重写**：`BUILTIN_TOOL_INFO` 中 6 个内置工具的描述增加具体使用场景和参数说明（如 `vector-memory`：当需要回忆之前对话的细节时调用；`keyword-search`：当需要查找特定关键词出现过的对话时使用），`memory-recall` 标记为被动触发不暴露给 AI
- **重复召回去重**：移除 `buildContext` 3.7 节中重复的 `searchVectorMemory` 调用（已由 memory-recall 预执行覆盖），减少双倍嵌入 API 消耗
- **MemoryRecallsCard 去重**：记忆召回结果统一在时间线内用 ToolNode 展示，不再重复渲染独立卡片

### 👤 用户档案生效（重点）

- **档案注入 API 请求**：`chat-slice.ts` `callApiAndUpdate` 中 `user: DEFAULT_USER` 改为从 store 动态读取当前激活的用户档案（`activeProfileId` → `userProfiles` → 回退 `user` → 最终回退 `DEFAULT_USER`）。用户填写的 name 和 description 现在会出现在每次 API 请求的 `[User Info]` 区块中

### 🚀 流式输出精修

- **parseCot 流式不提取未闭合标签**：`parseCot` 新增 `includeUnclosed` 参数（默认 `true`），流式 `onChunk` 中传 `false`，仅提取已闭合 `<cot>...</cot>` 标签内容；最终态兜底 `includeUnclosed=true` 不丢未闭合内容
- **正文推理模型兼容**：phase="main" 时 `chunk.reasoningContent` 也计入 `accumulatedContent`，解决 DeepSeek-R1/doubao-thinking 等模型正文输出在 reasoning 字段导致的空白问题
- **agentSteps 继承**：请求 2 的 `thinkingStepAdded` 从 `hasExistingThinking` 初始化，不再重置为 `false`，避免请求 2 的 reasoning 输出追加重复的 thinking 步骤

### 📊 日志系统全面升级

- **流式诊断日志**：`chat-slice.ts` 新增 5 处流式关键路径日志（chunk 大小、updateMessage 参数、请求完成状态、请求前后 agentSteps 对比），logger 新增 `stream` 类别
- **记忆全链路日志**：`memoryService.ts` 6 处 `console.log` 升级为 `logger`，覆盖 `buildVectorMemory` 入口/跳过/完成、`searchVectorMemory` 入口/完成、`loadVectorMemoryShards`、`saveVectorMemoryShards`
- **工具预执行跳过原因日志**：`memory-recall` 和 `keyword-search` 在条件不满足时输出具体跳过原因（enabled/memorySettings/shards 状态）
- **About 页日志查看器增强**：分类 Tab 筛选（全部/流式/API/工具/记忆/聊天/Agent）、级别过滤（debug/info/warn/error）、实时自动刷新开关（500ms）、最多 1000 条、点击展开完整详情、一键复制筛选后日志
- **日志导出分享**：新增分享按钮，导出全部日志为 JSON（含版本号和时间戳），Android 唤出系统分享面板，Web 自动下载文件

### 🏗️ 版本号

- v0.4.6 → v0.5.0（package.json + frontend/package.json + build.gradle versionCode 25 + about.tsx）

## v0.4.6

### 🔧 工具系统修复（重点）

- **统一标签格式**：`toolService.ts` 新增 `findPendingBuiltinToolCallInText` 函数，扫描 `<memory-recall:query>` 等 kebab-case 标签，与系统提示教 AI 的格式一致。文本标签路径同时扫描用户工具和内置工具
- **内置工具与用户工具数据打通**：`chat-slice.ts` `activeToolsForRequest` 合并 `builtinToolConfigs`；`executeToolByName` 提升到 if 块之前，供原生 tool_calls 路径和文本标签路径共用，先查找内置工具（按 type 匹配），支持所有 6 种内置工具类型
- **原生 tool_calls 结果持久化**：工具结果作为 `role:'user'` + XML 标签消息持久化到 store，设置 `metadata: { toolCallId, toolName, isToolResult: true }`；续写请求从 `get().messages` 取（已包含工具结果），不追加 cotContent
- **buildContext 兼容 role:tool**：`ApiMessage` 接口扩展 `role: MessageRole | 'tool'`、`tool_call_id?`、`tool_calls?`；`buildContext` 消息遍历识别 `metadata.isToolResult` 转换为 OpenAI 的 `role:'tool'` 格式，识别 `msg.toolCalls` 输出 `tool_calls` 数组
- **内置工具注入 API tools 参数**：`apiClient.ts` `buildToolSchema` 添加 6 个内置工具的 JSON Schema 映射表；`chat-slice.ts` `activeToolsForRequest` 合并内置工具，支持 function calling 的模型在 API 层面可见内置工具
- **工具描述格式增强**：`chatService.ts` `BUILTIN_TOOL_INFO` 添加 `parameters` 字段（JSON Schema）；`buildToolDescriptions` 函数签名扩展为 `(builtinConfigs, activeTools)`，同时列出内置工具和用户工具
- **循环保护**：`chat-slice.ts` 新增 `MAX_CONTINUATIONS = 3` 常量，文本标签路径迭代上限从 5 降至 3；原生 tool_calls 续写路径通过 `skipToolsInjection: true` 在 API 层面阻止模型再次发起 tool_calls
- **续写请求不注入 tools**：`callApiWithRetry` 和 `callApiAndUpdate` 新增 `skipToolsInjection` 参数，续写时设为 `true`，防止模型再次发起 tool_calls 导致无限循环

### 🚀 流式输出优化（重点）

- **思考卡片完全流式输出**：移除 `luzzy-thinking-timeline.tsx` 中的 `useTypewriter` 打字机延迟 hook（原每帧 8-16 字符追加导致显示滞后），`ThinkingNode` 组件直接渲染 `step.content`，`isAnimating={isRunning}` 启用 Markdown 流式动画。参考 rikkahub 实现：直接渲染数据层累加的完整字符串，"逐字显示"由 SSE chunk 频率驱动，零滞后
- **parseCot 阈值 3→1**：`chat-slice.ts` parseCot 调用节流阈值从 3 降至 1，实现真正逐字流式思考卡片解析
- **useDeferredValue 背压机制**：`luzzy-thinking-timeline.tsx` 添加 `useDeferredValue(cot)`，`markdown.tsx` 添加 `useDeferredValue(content)`，React 18+ 内置背压机制避免高频流式更新导致渲染卡顿，浏览器空闲时更新实现丝滑流式效果
- **两次请求架构保持不变**：Request 1 (phase="cot") → 流式更新 message.cot → Request 2 (phase="main") → 流式更新 message.content，KV 缓存机制零影响

### ✨ 新增功能

- **继续剧情按钮**：AI 消息气泡下新增"继续剧情"按钮（IconPlay），点击后追加 user 消息"请继续剧情的发展，请勿重复上一轮的剧情内容和言行。"并触发生成。末尾追加不破坏 KV 缓存前缀一致性
- **API 设置弹窗扩展**：新增自定义提供商弹窗内增加 API Key 和模型配置字段（模型 ID/显示名称/上下文长度/推理能力开关），避免用户新增后还需在外部填写。ID 限制 25 字符

### 🐛 Bug 修复

- **分享功能修复**：`NativeBridge.kt` `shareFile` 使用 `ClipData.newUri` + `Handler(Looper.getMainLooper())` 主线程调用 + `FLAG_GRANT_READ_URI_PERMISSION` 确保权限传递；`shareText` 同样使用主线程 Handler；`luzzy-share-dialog.tsx` 和 `profile.tsx` 添加原生平台 `shareFile` 调用
- **角色卡导入修复**：`LuzzyWebChromeClient.kt` 重写 `onShowFileChooser` 支持 `<input type="file">` 点击；`MainActivity.kt` 添加 `onActivityResult` 处理文件选择结果，`FILE_CHOOSER_REQUEST_CODE=10001`，Activity 重建时取消选择
- **白屏修复**：`MainActivity.kt` 添加完整 WebView 生命周期（onPause/onStop/onStart/onResume/onSaveInstanceState），SplashScreen `setKeepOnScreenCondition { !webViewLoaded }` 在 WebView 加载完成前保持显示，`LuzzyWebViewClient.onPageFinished` 设置 `webViewLoaded=true`，WebAssetServer 启动添加 3 次重试
- **取消 [] 高亮**：`markdown.tsx` `QUOTE_HIGHLIGHT_REGEX` 移除方括号，其他括号对保持不变
- **角色卡侧边栏按钮可见性**：`character-picker.tsx` 展开/详情按钮添加图标和边框样式，增强视觉提示性；鹿溪角色禁用展开/详情按钮
- **详情弹窗滑动修复**：`app.css` 移除 `[data-radix-scroll-area-viewport] > div` 的 `max-height: 100%` 限制
- **Markdown 排版间距**：`markdown.css` 为 h3-h6 添加 `first:mt-0`，首个标题无顶部间距

### 🏗️ 版本号

- v0.4.5 → v0.4.6（package.json + frontend/package.json + build.gradle versionCode 24 + about.tsx）

## v0.4.5

### 🏗️ 架构重构

- **剔除 Capacitor 框架,从零搭建安卓原生 Kotlin 架构(方案 D)**:移除 `@capacitor/android`、`@capacitor/cli`、`@capacitor/core`、`@capacitor/device`、`@capacitor/filesystem`、`@capacitor/share` 共 6 个 npm 依赖;删除 `capacitor.config.json`、`capacitor.plugins.json`、`config.xml`、`capacitor-cordova-android-plugins` 目录;构建脚本移除 `npx cap sync`,改为 `pnpm build + gradle` 直通流程
- **MainActivity.kt 原生翻译**:从 `MainActivity.java` 完整翻译为 Kotlin(478 行),保留全部功能:WebViewAssetLoader(https://appassets.androidplatform.net 协议加载 assets)、DownloadListener(万相广场 iframe 下载转发 JS 自动导入)、ApiProxyServer(NanoHTTPD localhost:18527 本地代理,绕过 CORS)、ProxyConfigInterface(JavascriptInterface 推送 API 配置和高级设置)
- **NativeBridge.kt JavascriptInterface**:替代 `@capacitor/device`、`@capacitor/filesystem`、`@capacitor/share` 的全部功能,共 10 个 `@JavascriptInterface` 方法:`isNativePlatform`、`getDeviceInfo`、`writeFile`、`appendFile`、`mkdir`、`readdir`、`deleteFile`、`getUri`、`shareFile`、`shareText`,每个方法含 Web 平台降级
- **LuzzyWebViewClient.kt**:WebViewAssetLoader 配置,将 `/assets/` 路径映射到 assets 目录
- **LuzzyWebChromeClient.kt**:console.log 转发到 Logcat,便于调试

### 🐛 Bug 修复

- **死代码 bug:`setAdvancedSettings` 从未被前端调用**:火山方舟/DeepSeek 的 `customRequestBody`(thinking、reasoning_effort 等)从未注入代理请求。`root.tsx` 新增 `setAdvancedSettings` 推送逻辑(行 102-130),在 API 配置变更时同步推送 `enableThinking` 和 `customRequestBody` 到原生层
- **Kotlin KDoc 嵌套注释编译错误**:Kotlin 块注释支持嵌套,KDoc 内部的 `/v3/*`、`/v1/*` 等路径表示被编译器当作嵌套块注释开始标记,导致 "Unclosed comment"。改为 `/v3/...`、`/v1/...` 表示通配路径
- **Gradle pluginManagement 缺失**:`android/settings.gradle` 缺少 `pluginManagement` 块,导致 Android Gradle Plugin 无法解析,新增 google()、mavenCentral()、gradlePluginPortal() 三个仓库
- **Android 颜色资源缺失**:`styles.xml` 引用 `@color/colorPrimary` 等颜色但缺少 `colors.xml`,新建 `res/values/colors.xml` 定义 colorPrimary(#8B5CF6)、colorPrimaryDark(#7C3AED)、colorAccent(#A78BFA)

### 🔄 前端适配

- **6 个前端文件从 Capacitor 切换到 nativeBridge**:
  - `characters.tsx`:角色卡导出从 `Filesystem.writeFile` + `Share.share` 改为 `writeFile("EXTERNAL", ...)` + `shareFile(uri, ...)`
  - `about.tsx`:设备信息从 `Device.getInfo()` 改为 `getDeviceInfo()`,含 Web 平台降级
  - `logger.ts`:日志写入从 `Filesystem.appendFile/mkdir/writeFile` 改为 nativeBridge 对应方法,使用 `btoa(unescape(encodeURIComponent(line)))` 处理 UTF-8 中文
  - `world-info.tsx`:世界书导出从 `Filesystem.mkdir/writeFile/getUri` + `Share.share` 改为 nativeBridge 对应方法
  - `chat-slice.ts`:消息分享从 `Share.share` 改为 `shareText()`,含 navigator.share 和 clipboard 降级
  - `luzzy-share-dialog.tsx`:Blob 下载从 `Filesystem.mkdir/writeFile` 改为 nativeBridge `mkdir/writeFile`
- **apiClient.ts 简化**:移除 Capacitor 类型声明和死代码,XHR 直接使用(方案 D 无 CapacitorHttp patch)
- **copy.ts 目标目录**:从 `../www` 改为 `../android/app/src/main/assets/public`

### 🚀 功能增强

- **版本号升级**:v0.4.4 → v0.4.5(package.json + frontend/package.json + build.gradle versionCode 23 + about.tsx)

## v0.4.4

### 🐛 Bug 修复

- **内置工具模型不知道可以调用（重点任务）**：实现混合工具调用方案。`apiClient.ts` 新增 `buildToolSchema` 函数为各工具类型生成 JSON Schema,`buildApiRequestBody` 注入 `tools` 和 `tool_choice` 参数;`SSEChunkData` 接口新增 `toolCalls` 字段,`parseSSEChunk` 解析 `delta.tool_calls`;`chat-slice.ts` 新增 `accumulatedToolCalls` 流式增量合并(按 index/id 累积),`executeWithTimeout`(30s 超时保护)和 `executeToolByName` 执行原生 tool_calls,工具结果截断到 2000 字符,JSON.parse 失败时回退原始字符串。优先原生 tool_calls,回退文本标签解析模式
- **嵌入模型配置了不起作用（重点任务）**：`memoryService.ts` `buildVectorMemory` 和 `searchVectorMemoryWithScore` 新增 `if (!settings.embeddingModel) return []` 早返回,记忆系统启用判断从 `enabled` 字段改为 `embeddingModel` 是否存在;`getEmbedding` 添加日志打印模型名和文本长度,`buildVectorMemory` 和 `searchVectorMemory` 添加启动/完成日志
- **三大记忆功能失效（重点任务）**：`chatService.ts` 向量记忆召回判断从 `memorySettings?.enabled` 改为 `memorySettings?.embeddingModel`,与会话记忆/长期记忆/全局记忆(ACE Skillbook)的启用逻辑一致
- **Android 真机流式输出完全失效（重点任务）**：`apiClient.ts` 模块顶部保存原始 fetch/XMLHttpRequest 引用(带 Node.js 环境安全检测),XHR 构造函数三级回退策略(CapacitorWebXMLHttpRequest.fullObject → 原始 XHR → XMLHttpRequest);`MainActivity.java` 代理请求添加 `Accept-Encoding: identity` 禁用 gzip,响应头添加 `Cache-Control: no-cache` 和 `X-Accel-Buffering: no` 禁用缓冲;`onprogress` 添加诊断日志
- **工具卡片时序 bug（重点任务）**：`chat-slice.ts` `callApiAndUpdate` 函数内 `agentSteps` 初始化改为读取已有消息的 agentSteps(`existingMsg?.agentSteps ? [...existingMsg.agentSteps] : []`),继承 force 预执行阶段的 tool_call/tool_result 步骤,避免流式 CoT 更新时覆盖
- **会话切换滚动问题**：`chat.tsx` `handleSwitchSession` 添加 `setTimeout(() => scrollToBottom(), 300)`,等待 AnimatePresence 动画完成后滚动到底部
- **输入法自动唤出**：`settings.tsx` 移除自定义目标语言弹窗的 `autoFocus`,API 地址输入框添加 `inputMode="url"`,上下文长度/输出长度/历史消息数限制添加 `inputMode="numeric"`;`characters.tsx` 名称/标签/创作者/版本输入框添加 `inputMode="text"`
- **两个思考卡片并存 bug**：`luzzy-chat-message.tsx` 移除独立的 `LuzzyAgentSteps` 渲染分支,统一为单个 `CotCard`。即使 `cot` 为空(force 预执行阶段)也渲染 CotCard,让工具节点始终落在卡内,避免"工具卡片闪现 → 消失 → 被吸入新 CoT 卡片"的视觉跳跃
- **火山方舟思考深度按钮被置灰**：`luzzy-chat-input.tsx` `thinkingDepthLockedByJson` 检测逻辑修正,仅当 `reasoning_effort` 存在(真正指定了深度档位)时才置灰,`thinking` 键(如火山方舟的 `{"thinking": {"type": "enabled"}}` 仅是开关)不置灰
- **嵌入模型端点硬编码 /v3 导致多数供应商 404**：`memoryService.ts`/`sessionService.ts`/`knowledgeBaseService.ts` 的 `buildEmbeddingUrl` 不再硬编码版本号,改为"用户填什么就是什么"——baseUrl 已含版本路径(`/v1`、`/v3` 等)直接追加 `/embeddings`,不含则回退到 OpenAI 标准 `/v1/embeddings`。对齐 RP-Hub-main 的 `getOpenAICompatUrl` 实现

### ✨ 新增功能

- **20 轮分页**：`chat.tsx` 新增 `PAGE_SIZE=40`(20 轮 = 40 条消息)、`displayCount`、`isLoadingMore` 状态;切换会话时重置分页;`visibleMessages` 仅渲染最后 `displayCount` 条消息;`handleScroll` 在 scrollTop < 50 时加载更多,500ms 动画,保持滚动位置;顶部加载指示器(IconRefresh animate-spin)。仅前端分页,后端保留完整会话
- **火山方舟 CodingPlan 供应商**：`settings-slice.ts` 新增 `ArkCodingPlan` 供应商(id: "ArkCodingPlan", apiUrl: "https://ark.cn-beijing.volces.com/api/coding/v3", customRequestBody: '{"thinking": {"type": "enabled"}}'),内置 3 个模型:glm-5.2(1024K 上下文/128K 输出/推理)、deepseek-v4-pro(1024K/384K/推理)、doubao-embedding-vision(视觉+嵌入)
- **DeepSeek 供应商 customRequestBody**：`settings-slice.ts` DeepSeek 供应商添加 `apiType: "openai-compatible"`、`customRequestBody: '{"reasoning_effort": "max"}'`,模型 contextLength 改为 1048576,outputLength 改为 393216
- **角色卡鹿溪保护**：`characters.tsx` 导入 `LUXI_CHARACTER_NAME`,新增 `isLuxiCharacter` 判断函数;SwipeCard 对鹿溪禁用滑动(`disabled={isLuxiCharacter(c)}`);分享按钮对鹿溪条件渲染(`!isLuxiCharacter(c)`);`handleCardClick` 鹿溪提前返回
- **工具卡片作为思考节点**：`luzzy-thinking-timeline.tsx` 新增 `ToolStep` 接口和 `TimelineStep` 联合类型,`isToolStep` 类型守卫,`mergeSteps` 函数(工具步骤与思考步骤合并);`ToolNode` 组件渲染 tool_call(蓝色 IconToolKit)/tool_result(绿色 IconCheck)/memory_inject(紫色 IconBook)/knowledge_call(琥珀色 IconSearch);`LuzzyThinkingTimeline` 接受 `agentSteps` 参数;`luzzy-chat-message.tsx` `CotCard` 传递 `agentSteps`
- **长期记忆/全局记忆的角色卡启用设置**：`MemorySettings` 类型新增 `longTermMemoryCharacterIds` 和 `globalMemoryCharacterIds` 字段(空数组表示对所有角色卡启用,保持向后兼容);`memory.tsx` MemorySettingsCard 新增两个角色卡多选器(标签式选择,选中高亮);`chatService.ts` 全局记忆注入前检查 `globalMemoryCharacterIds`,`chat-slice.ts` 长期记忆(memory-recall 工具)预执行前检查 `longTermMemoryCharacterIds`

### 🚀 功能增强

- **历史消息 token 级截断**：`chatService.ts` 新增 `truncateByTokens` 函数(1 token ≈ 2 字符保守估算,预留 4096 token 给 system prompt 和输出),在 `historyMessageLimit` 条数级截断后追加 token 级保护,从最新消息向前保留,丢弃最早消息(由记忆召回/向量记忆工具补充)
- **记忆设置 UI 简化**：`memory.tsx` `DEFAULT_MEMORY_SETTINGS.enabled` 改为 `true`;移除启用开关、召回深度配置、向量 Top-K 配置;保留嵌入模型选择器和相似度阈值滑块;顶部添加说明"记忆系统在配置嵌入模型后自动启用";Badge 状态判断改为基于 `hasEmbeddingModel`;保存逻辑强制 `enabled: true, recallDepth: 10, vectorTopK: 15`
- **自动化测试脚本**：新增 `vitest.config.ts` 配置;新增 3 个测试文件:`streaming.test.ts`(12 个测试,SSE 解析/tool_calls 增量合并)、`tool-calls.test.ts`(11 个测试,buildToolSchema/原生 tool_calls 解析)、`memory.test.ts`(11 个测试,cosineSimilarity/buildVectorMemory 早返回/searchVectorMemory 早返回);`package.json` 添加 `test` 和 `test:watch` 脚本
- **版本号升级**：v0.4.3 → v0.4.4(package.json + frontend/package.json + build.gradle versionCode 22 + about.tsx + README.md 徽章)

## v0.4.3

### 🐛 Bug 修复

- **工具调用概率低（重点任务）**：`chatService.ts` 新增 `buildToolDescriptions` 函数,将已启用工具的描述注入 system prompt 末尾(在 COT_OUTPUT_PROTOCOL 之后),提升模型主动调用工具的概率。工具描述采用 `<available_tools>` 标签包裹,列出 callLabel 和 description,模型按 `<callLabel:query>` 格式输出工具调用。工具描述追加到 system prompt 末尾,不破坏前缀(KV 缓存友好)
- **高亮显示仅支持中文弯引号（重点任务）**：`markdown.tsx` `QUOTE_HIGHLIGHT_REGEX` 扩展支持多种括号:`“”` `""` `「」` `【】` `〔〕` `『』` `{}` `[]` `()`。替换逻辑使用 3 个捕获组(左括号、内容、右括号),保留原括号字符并高亮内容
- **供应商显示比例失衡**：`settings.tsx` 自定义供应商列表中,供应商名称改为 `flex-1 truncate`(占大部分空间),URL 改为 `max-w-[40%] shrink-0 truncate`(限制宽度并截断),让用户更容易看到供应商名字

### ✨ 新增功能

- **世界书召回工具（重点任务）**：新增内置工具 `world-recall`,使用嵌入模型在当前角色卡绑定的世界书中语义检索匹配内容。需配置嵌入模型,默认关闭。工具执行流程:获取最新 user 消息作为 query → 调用 getEmbedding 获取 query 向量 → 遍历世界书条目获取内容向量 → 用 cosineSimilarity 计算相似度 → 返回 Top-K 条目 → 注入 contextMessages 作为 `<world_recall_result>` user 消息 → 添加 agentSteps/toolCalls 二级思考卡片
- **世界书检索工具（重点任务）**：新增内置工具 `world-search`,在当前角色卡启用的世界书中按关键词搜索匹配内容,无需嵌入模型。默认开启。工具执行流程:获取最新 user 消息作为 query → 分词后匹配 entry.keys 和 entry.content → keys 匹配 score+=2,content 匹配 score+=1 → 返回 Top-K 条目 → 注入 contextMessages 作为 `<world_search_result>` user 消息 → 添加 agentSteps/toolCalls 二级思考卡片

### 🚀 功能增强

- **日志系统增强（重点任务）**：`chat-slice.ts` 新增 13 处 logger 调用,覆盖 api/chat/tool/memory/world 五个类别:
  - `api` 类别:API 请求阶段1(CoT)、API 响应阶段1、API 请求阶段2(正文)、API 响应阶段2、上下文构建完成
  - `chat` 类别:消息发送、消息接收完成
  - `tool` 类别:关键词检索工具启动
  - `memory` 类别:记忆召回工具启动、向量记忆检索工具启动、ACE 记忆注入
  - `world` 类别:世界书加载、世界书召回工具启动、世界书检索工具启动
- **工具描述注入 system prompt**：`chatService.ts` `BuildContextParams` 接口新增 `builtinToolConfigs` 字段,`buildContext` 函数在 `COT_OUTPUT_PROTOCOL` 之后调用 `buildToolDescriptions` 注入工具描述,提升模型主动调用工具的概率
- **版本号升级**：v0.4.2 → v0.4.3(package.json + frontend/package.json + build.gradle versionCode 21 + about.tsx + README.md 徽章)

## v0.4.2

### 🐛 Bug 修复

- **TRPG 模式火山方舟 API 转发失败（重点任务）**：`MainActivity.java` `serve()` 方法正确使用 `resolveTargetBase()` 确定目标 API 基础地址，修复之前直接用 `cachedApiUrl`（占位符）作为 baseUrl 导致请求发到错误地址的 Bug。现在三种路径前缀正确路由：
  - `/v3/*` 无 `_target` → 火山方舟 coding plan（硬编码 `VOLCANO_ARK_BASE`）
  - `/v1/*` 或其他 + `_target` → 自定义目标（支持任意 OpenAI 兼容 API）
  - `/v1/*` 或其他 无 `_target` → 回退到 `cachedApiUrl`（仅当非占位符时）
- **代理回退死循环防护**：`MainActivity.java` 检测到 `cachedApiUrl` 包含 `localhost:18527` 或 `127.0.0.1:18527`（占位符）时，返回 400 错误提示用户正确配置 TRPG 网页内的 API 地址，避免代理转发给自己导致死循环
- **火山方舟 Authorization 注入优化**：`MainActivity.java` 检测到目标是火山方舟（`ark.cn-beijing.volces.com`）且 `cachedApiKey` 是占位符时，跳过 `Authorization` 头注入。火山方舟编码计划使用 coding plan 认证，不需要 API Key

### ✨ 新增功能

- **TRPG 说明弹窗重写（重点任务）**：`trpg.tsx` 说明弹窗明确支持三种 API 配置场景：
  - 场景一：火山方舟编码计划（自动转发）— 用户在 TRPG 网页配置 `http://localhost:18527/v3`，代理自动转发至火山方舟 API
  - 场景二：其他供应商需转发（绕过 CORS）— 用户在 TRPG 网页配置 `http://localhost:18527/v1?_target=https://供应商地址`，支持任意 OpenAI 兼容 API
  - 场景三：其他供应商无需转发（直连）— 用户在 TRPG 网页直接填写供应商真实 API 地址，绕过本地代理
  - 弹窗改为 `max-w-md max-h-[85vh]` 三段式 flex 布局，`ScrollArea` 限制 `max-h-[65vh]`，支持长内容滚动
  - 三个场景卡片使用统一的 `rounded-lg border border-primary/20 bg-primary/5` 样式 + 圆形数字序号徽章

### 🚀 功能增强

- **版本号升级**：v0.4.1 → v0.4.2（package.json + frontend/package.json + build.gradle versionCode 20 + about.tsx + README.md 徽章）

## v0.4.1-patch1

### 🐛 Bug 修复

- **思考内容重复显示（重点）**：`chat-slice.ts` phase="main" 阶段第二次请求的 `accumulatedReasoning` 不再追加到 `existingCot`，三处（流式更新、非流式更新、最终更新）均移除追加逻辑，避免与第一次 CoT 内容重复
- **流式输出始终未成功（重点）**：`markdown.tsx` 移除 Streamdown `animated={{ sep: 'char', duration: 80 }}` 配置（动画队列与流式更新冲突导致内容积压无法渲染）；`luzzy-chat-message.tsx` `isAnimating` 固定为 `false`；`luzzy-thinking-timeline.tsx` 思考节点 Markdown 也禁用动画。流式逐字效果由 API 流式输出本身提供
- **高亮预览色块空心边框**：`settings.tsx` `input[type=color]` 添加 `opacity: 0` 完全透明，移除浏览器原生 color picker 的空心边框残留
- **429 错误重试**：`chat-slice.ts` 新增 `callApiWithRetry` 包装函数，最多重试 3 次，退避间隔递增（2s/4s/8s），重试期间显示"服务器繁忙"提示，支持用户中止
- **非鹿溪角色卡设定未应用（重点）**：`chatService.ts` `buildContext` 中，当 `currentCharacter.name !== '鹿溪'` 时，鹿溪预设仅注入 `## 角色扮演通用 CoT 推理框架` 及之后部分（NSFW CoT 框架），不注入身份锚定，避免覆盖其他角色卡的设定
- **工具调用/向量记忆/强制工具未生效（重点）**：`chat-slice.ts` 内置工具预执行添加 `agentSteps` 和 `toolCalls`，显示为二级思考卡片：
  - `memory-recall` 预执行：添加 `tool_call` + `tool_result` 步骤，更新 `toolCalls` 和 `agentSteps`
  - `vector-memory` 预执行（新增）：force 模式下主动调用 `searchVectorMemory`，结果注入上下文并添加二级思考卡片
  - `keyword-search` 预执行（新增）：force 模式下主动从向量记忆分片中按关键词匹配，结果注入上下文并添加二级思考卡片
- **角色卡预览弹窗滑动容器限制**：`character-picker.tsx` 详情弹窗 `DialogContent` 改为 `flex flex-col gap-0`，`DialogHeader` 添加 `shrink-0`，`ScrollArea` 添加 `max-h-[70vh]`；侧边栏展开角色卡内容添加 `max-h-[200px] overflow-y-auto`，限制展开内容在容器内滚动

## v0.4.1

### 🐛 Bug 修复

- **开场白不显示（重点任务）**：`chat.tsx` 首次启动时若历史为空且角色有开场白，自动创建默认会话显示开场白；修复 useEffect 回调中 `await` 语法错误（`.then(() => {` → `.then(async () => {`）
- **流式输出正文空白（重点任务）**：`markdown.tsx` Streamdown `animated` 配置改为 `sep: 'char', duration: 80, stagger: 0` 实现逐字流式；`markdownService.ts` `parseCot` Pass 2 正则修复，避免主内容被字面 `<tag>` 字符吞掉；`chat-slice.ts` 流式结束后的 finalize 逻辑强制用 `accumulatedContent` 重新解析更新；`luzzy-thinking-timeline.tsx` 移除打字机动画，直接同步流式更新
- **会话导出失败**：`luzzy-share-dialog.tsx` 原生平台 Filesystem 失败时 fall through 到 Web Blob 下载，避免导出无响应
- **世界书导入名称不跟随角色名**：`characters.tsx` `extractWorldInfoFromCard` 新增 `characterName` 参数，默认世界书名称改为 `${characterName}的世界书`
- **世界书条目滑动卡死**：`world-info.tsx` 条目列表 div 添加 `max-h-[50vh] overflow-y-auto`，避免展开动画期间阻止内部滚动
- **世界书导出失败**：`world-info.tsx` `handleExportBook` 改为 async，添加原生平台 Filesystem 优先 + Web 下载 fallback
- **角色卡内 UI 模板/正则无法导入（重点任务）**：新建 `characterCardImport.ts` 公共服务（`parsePngCharacterCard` / `extractWorldInfoFromCard` / `extractRegexScriptsFromCard` / `extractUiTemplatesFromCard`），`ui-template.tsx` 和 `regex.tsx` 添加"从角色卡导入"按钮与 handler；`characters.tsx` 移除本地副本改用公共服务导入
- **导入角色卡未自动启用世界书（重点任务）**：`characters.tsx` 角色编辑 UI 世界书选择器改为按 `bookId` 分组列出"书"而非单个条目；`chat-slice.ts` 世界书过滤逻辑改用 `extensions.worldInfoId` 而非 `currentCharacterId`，使手动创建的世界书也能生效
- **启动动画白屏**：`root.tsx` 内联主题脚本提前设置 `--background` CSS 变量；`luzzy-splash.tsx` 背景改为 `bg-white dark:bg-black` 硬编码兜底
- **置底箭头位置遮挡输入栏**：`luzzy-chat-input.tsx` ResizeObserver 追踪输入栏高度，通过 CSS 变量 `--chat-input-height` 暴露给置底箭头
- **角色卡侧边栏无法滚动**：`character-picker.tsx` 添加 `min-h-0 flex-1` 确保弹性布局正确
- **输出时长重复显示**：`luzzy-chat-message.tsx` 删除工具按钮行左侧时长，仅保留思考卡片内时长
- **弹窗按钮重叠**：`dialog.tsx` `DialogHeader` 添加 `shrink-0` 匹配 `DialogFooter`；`app.css` radix ScrollArea viewport 添加高度约束

### ✨ 新增功能

- **两次独立 API 请求架构（重点任务）**：`chat-slice.ts` 每次聊天改为两次独立 API 请求——第一次输出 CoT 思考（流式更新思考卡片），第二次基于 CoT 输出正文（流式更新正文气泡）。KV 缓存保护：两次请求的 `system_prompt + history + current_user_msg` 前缀完全一致，第二次仅在 messages 末尾追加 `assistant(CoT) + user(指令)`，缓存自然命中
- **工具调用二级思考卡片**：`chat-slice.ts` force 模式下工具调用循环适配两次请求架构，生成二级思考卡片
- **会话分支动画**：`chat.tsx` 消息列表外层包裹 `AnimatePresence mode="wait"` + `motion.div key={currentSessionId}`，会话切换/分支创建时淡入淡出 + 滑动过渡
- **高亮颜色预览优化**：`settings.tsx` 预设颜色改为 `size-4 rounded-md` 统一圆角方形；自定义颜色用容器包裹 `input[type=color]`，`appearance: none` + `padding: 0` + `overflow: hidden` 让颜色填满
- **默认用户名优化**：`chatService.ts` `DEFAULT_USER.name` 改为空字符串；`profile.tsx` 占位符显示"未设置"
- **日志记录增强**：`logger.ts` `LogCategory` 新增 `memory` / `world` / `tool` 类别；`about.tsx` 日志显示条数从 50 增至 200，新增一键复制按钮
- **鹿溪提示词更新**：`presetContent.ts` 附录1 鹿溪身份锚定内容已注入，NSFW CoT 框架原样保留

### 🚀 功能增强

- **深度调研验证**：tokens 计数逻辑正确（Anthropic usage 合并使用展开运算符）、内置工具逻辑链完整、世界书/UI模板/正则/知识库逻辑链完整、记忆功能逻辑链完整（默认 `enabled: false` 是设计决策）
- **版本号升级**：v0.4.0 → v0.4.1（package.json + frontend/package.json + build.gradle versionCode 19 + about.tsx + README.md 徽章）

## v0.4.0

### 🐛 Bug 修复

- **思考卡片严重 BUG 修复（重点任务）**：`chat-slice.ts` `onChunk` 中 `parseCot` 启用流式模式（`useCache=false`），避免缓存永不命中导致正文空白；移除冗余 `cotResult.cot` 思考步骤添加逻辑，思考内容统一由 CotCard + LuzzyThinkingTimeline 渲染；`luzzy-chat-message.tsx` 完全过滤 thinking 类型步骤，确保两层卡片结构（外层 CotCard 可折叠 + 内层 Timeline 节点）正确显示
- **思考深度无法应用**：`luzzy-chat-input.tsx` `allProviders` memo 添加 `builtinThinkingDepthOverrides` 依赖，修复内置供应商思考深度修改后 memo 未重算导致回退为"中"
- **模型显示名称不生效**：`displayModelName` 改用 `ModelConfig.displayName`，查找 provider.models 中对应模型，优先返回用户自定义显示名称
- **全屏输入同步滚动**：`luzzy-fullscreen-editor.tsx` 修复比例计算边界检查，使用 `flex-1` 替代 `h-1/2` 确保容器正确尺寸，添加 `overflow-x-hidden` 防止横向溢出
- **全屏输入换行符检测**：添加 `normalizeNewlines` 函数，将 3+ 连续换行符转为段落分隔 + 显式 `<br>` 标签，确保预览区换行数与输入一致；textarea 添加 `white-space: pre-wrap` 样式
- **弹窗按钮重叠**：`memory.tsx` `DialogFooter` 移除 `flex-row` 强制覆盖，恢复移动端默认 `flex-col-reverse` 布局
- **关于页超出屏幕右侧（重点任务）**：`about.tsx` 替换 radix `ScrollArea` 为原生 `div`（修复 Viewport `display:table` 导致的宽度溢出），移除系统信息值 `text-right`（长文本左对齐避免撑出容器）

### 🚀 功能增强

- **流式输出优化（重点任务）**：`parseCot` 流式模式禁用缓存；`updateMessage` 使用 `findIndex + slice` 替代 `map` 减少对象创建；`parseThinkingSteps` 添加完成态结果缓存（限制 20 条），避免重复解析相同内容
- **版本号升级**：v0.3.9 → v0.4.0（package.json + build.gradle versionCode 18 + about.tsx）


## v0.0.1 ~ v0.3.9 — 项目早期迭代汇总

> 以下为 LUZZY 项目从 v0.0.1 到 v0.3.9 的关键里程碑摘要。
> 详细变更记录已归档，此处仅保留核心节点。

### 前端重构与基础建设（v0.0.1 ~ v0.1.0）
- v0.0.1：基于 rikkahub web-ui 范式完全重写前端（React Router 7 SPA + Tailwind v4 + shadcn/ui + Zustand）。10 大功能页面（Chat/Characters/TRPG/Tools/Memory/Preset/WorldInfo/Regex/UITemplate/Settings）。AlibabaPuHuiTi-3 + AlibabaSans 字体约束。双通道流式请求（XHR 原生代理 + fetch）。SillyTavern PNG 角色卡兼容。7 个内置 API 供应商
- v0.0.2 ~ v0.0.4：侧边抽屉菜单替换底部 TabBar。全交互元素动画补全（motion spring + AnimatePresence）。5 个高级功能页拆分为独立路由。CoT 思考卡片可折叠。Android APK 构建流程建立

### TRPG 模式与记忆系统（v0.2.0 ~ v0.3.0）
- TRPG 模式：内嵌 aisandboxgame.com 在线网页（iframe）。NanoHTTPD 本地代理（localhost:18527）解决 WebView CORS
- 记忆系统：向量记忆分片 + 余弦相似度搜索 + 记忆压缩。嵌入模型独立供应商配置。知识库 + 技能系统（SKILL）+ 用户档案页面
- ACE 三步循环记忆机制（Execute → Reflect → Update）+ Skillbook JSON 持久化

### 多供应商与 KV 缓存（v0.3.0 ~ v0.3.5）
- 多供应商路由（`providerId_modelName` 格式）+ 每供应商独立 API Key + 自定义请求体 JSON
- KV 缓存层：通用响应缓存 30min + Embedding 缓存 60min
- CoT 强制解析扩展（8 种标签变体）+ CoT 输出协议指令
- 工具调用循环（最多 5 次迭代）+ `<callLabel:query>` 标签格式

### Android 原生重构（v0.4.5）
- 剔除 Capacitor 框架，从零搭建 Kotlin 原生架构（方案 D）。MainActivity.kt + NativeBridge.kt + NanoHTTPD 代理。WebView 生命周期 + SplashScreen 白屏修复

### 工具系统与两请求架构（v0.4.1 ~ v0.4.6）
- v0.4.1：两次独立 API 请求架构（phase=cot + phase=main）。KV 缓存保护。流式输出优化
- v0.4.4：原生 tool_calls 支持（OpenAI function calling）。内置工具注入。20 轮分页。DeepSeek 供应商
- v0.4.6：思考卡片完全流式输出。继续剧情按钮。工具系统双轨统一（内置+用户）。MCP/SKILL 工具支持

### 🏗️ 版本演进
v0.0.1 → v0.0.4 → v0.1.0 → v0.2.0 → v0.3.0 → v0.3.9 → v0.4.0 → v0.4.6 → v0.5.0 → v0.5.1

