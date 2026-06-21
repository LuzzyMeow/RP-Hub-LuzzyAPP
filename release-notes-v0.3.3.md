# v0.3.3

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
