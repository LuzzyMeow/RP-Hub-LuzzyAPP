# Roleplay Hub (LuzzyMeow Fork)

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

> **基于 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub) 的增强 Fork，新增 Android APK 构建支持、火山方舟 API 兼容、模型自由输入、万相广场自动导入等增强功能。**

---

## Fork 来源声明

本项目 Fork 自 **[STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)**，遵循原作者的 [CC BY-NC 4.0](./LICENSE) 协议。

- **原项目**：一款纯前端运行的本地角色扮演（Roleplay）对话和角色卡生成工具
- **Fork 时间**：2026-06-17
- **Fork 目的**：增强功能，增加 Android APK 支持、火山方舟 API 兼容性、模型自由输入、万相广场下载自动导入等功能
- **许可协议**：继承原项目 CC BY-NC 4.0，**禁止任何形式的商业化使用**

**感谢原作者 STA1N156 的开源贡献。**

---

## 本 Fork 相对原项目的改动

详细改动记录请参见 [CHANGELOG.md](./CHANGELOG.md)，以下为功能概览：

### 1. Android APK 构建（Capacitor 8）
- 使用 Capacitor 8 将纯前端项目打包为 Android APK
- 内置 `CapacitorHttp` 插件自动 patch `window.fetch`，绕过浏览器 CORS 限制
- 原生环境自动禁用流式传输（CapacitorHttp 不支持真流式，避免解析异常）

### 2. 火山方舟 Coding Plan API 兼容
- `getOpenAICompatUrl` 改用正则 `/\/v\d+$/` 支持任意版本号后缀（原代码只支持 `/v1`）
- 火山方舟 API `https://ark.cn-beijing.volces.com/api/coding/v3` 可直接使用，APK 内无需外部 proxy

### 3. 模型名自由输入
- 在模型选择弹窗添加手动输入框 + 确认按钮
- 用户可手填任意模型名（如 `ark-code-latest`），不局限于 API 识别到的模型列表
- 同时适用于主模型和嵌入模型设置

### 4. 万相广场下载自动导入
- 原生层注册 `WebView.DownloadListener`，捕获万相广场 iframe 内的下载请求
- 通过 `evaluateJavascript` 调用 JS 层 `window.RPHubAutoImport(url, mimetype)`
- 直接 fetch 下载 URL → 构造 File 对象 → 调用现有 `importCharacter` / `importUiTemplates`
- **角色卡和 UI 模板直接导入到 app，无需用户手动从文件系统选择**
- 只下载一次，不浪费下载次数

### 5. TRPG 模式（AI 沙盒游戏）
- 侧边栏新增 TRPG 入口，iframe 嵌入 [AI Sandbox Game](https://aisandboxgame.com/)
- **iframe 缓存**：使用 `v-show` 控制，切换到其他功能再切回 TRPG，网页状态保持不变（不重新加载）
- **走 RP-Hub API 配置**：TRPG 模式自动使用 RP-Hub 主设置的 API 配置（`apiUrl` + `apiKey`）发起请求，无需在 TRPG 网页内单独配置真实 API
  - 通过 `WebView.addJavascriptInterface` 注册 `AndroidProxy` JavascriptInterface，JS 层调用 `setApiConfig(apiUrl, apiKey)` 推送 RP-Hub 主设置到原生层
  - NanoHTTPD 代理使用 `cachedApiUrl` 构建目标 URL，用 `cachedApiKey` 替换 Authorization 头，请求体原样转发（保留 model 字段）
  - **模型名自由设置**：TRPG 网页内的模型商名称、API、APIKey 仅作占位符，真正生效的是模型名
- **TRPG 模式说明弹窗**：每次进入 TRPG 模式自动弹出（可勾选"本次不再提示"）
  - 标题："TRPG 模式说明"
  - 提示用户在 TRPG 网页内配置自定义供应商，API 地址填 `http://localhost:18527/v1`
  - "本次不再提示"勾选框：内存变量，App 重启后恢复提示
- **内置 NanoHTTPD 本地 API 代理服务器**（`localhost:18527`），解决 iframe 内 CORS 限制
- 统一流式透传（`newChunkedResponse`），支持 SSE 响应
- **抗更新**：代理机制在 Android 原生层，不修改网页代码，aisandboxgame.com 更新不影响代理
- **使用方法**：
  1. 在 RP-Hub 主设置中配置好 API 地址和 API Key
  2. 进入 TRPG 模式 → 自动弹出"TRPG 模式说明"弹窗
  3. 阅读说明（如不需重复提示，勾选"本次不再提示"）→ 点击"我已了解，开始游戏"
  4. 在 TRPG 网页的 API 设置中添加自定义供应商：
     - API 地址填：`http://localhost:18527/v1`
     - API Key 随便填（占位符，实际使用 RP-Hub 的 Key）
     - 模型名自由设置（如 DeepSeek-V4-Pro，无需在 RP-Hub 预先配置）
  5. 开始 TRPG 游戏体验

### 6. API 请求体高级设置（深度思考支持）
- 在「API 连接与服务」板块内新增「API 请求体高级设置」折叠区，支持深度思考（thinking mode）开关
- **深度思考快捷开关**：一键注入 `thinking.type: "enabled"`，兼容 DeepSeek thinking_mode 和火山方舟深度思考
- **思考强度下拉框**：支持 minimal/low/medium/high/max 五档（空字符串=不注入）
  - `minimal`/`low`/`medium`：火山方舟深度思考支持
  - `high`：通用推荐（DeepSeek 和火山方舟均支持）
  - `max`：DeepSeek 专用
- **自定义请求体 JSON 文本框**：最高优先级合并到请求体，实时校验 JSON 有效性
  - 合并优先级：基础字段 < 深度思考开关 < 思考强度 < 自定义 JSON
  - **字段保护**：`model` 和 `messages` 核心字段受保护，自定义 JSON 不可覆盖
  - 示例：`{"thinking":{"type":"enabled"},"reasoning_effort":"high","max_completion_tokens":8192}`
- **参考文档**：
  - DeepSeek thinking_mode: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
  - 火山方舟深度思考: https://www.volcengine.com/docs/82379/2165245
- **作用域限定**：高级设置**仅作用于 RP-Hub 主聊天 chat/completions 请求**；不作用于 UI 模板分析、向量嵌入、模型列表、TRPG iframe 内 aisandboxgame 自身发起的请求。用户若需在 TRPG 模式启用深度思考，需在 aisandbox 网页内的 API 设置或 system prompt 中自行配置。

### 7. MCP HTTP 工具导入
- 在工具面板新增「+ 添加 MCP 工具」按钮，支持通过 JSON 形式导入 MCP（Model Context Protocol）远程工具服务器
- **传输协议**：MCP Streamable HTTP transport（2025-03-26 规范，单端点 POST 返回 JSON 或 SSE）
- **支持两种 JSON 输入格式**：

#### ① 扁平格式（HTTP transport）
```json
{
  "url": "https://my-mcp-server.example.com/mcp",
  "headers": {
    "Authorization": "Bearer <token>"
  },
  "protocolVersion": "2025-03-26"
}
```
- `url`（必填）：MCP server 端点
- `headers`（可选）：自定义头，如鉴权 token
- `protocolVersion`（可选）：默认 `2025-03-26`

#### ② mcpServers 嵌套格式（Claude Desktop / Cursor 通用）
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://my-mcp-server.example.com/mcp",
        "--header",
        "Authorization: Bearer <token>"
      ]
    }
  }
}
```
- 自动识别 HTTP transport（有 `url` 字段）或 mcp-remote 桥接（`command`+`args` 含 `mcp-remote`）
- 从 `mcp-remote` 的 args 中自动提取 URL 和 `--header` 头
- 纯 stdio 本地命令（无 mcp-remote 桥接）不支持
- `${VAR}` 环境变量语法当字面值处理（浏览器无环境变量）

- **导入流程**：填入 JSON → 点击「测试连接」验证可达 → 点击「导入工具」执行 `initialize` + `tools/list` 拉取工具清单 → 工具卡显示包含的子工具数量
- **AI 调用机制**：复用现有 `<tool_*>` 标签协议，AI 在正文输出 `<tool_mcp_<serverShortId>_<toolName>:argsJSON>` 标签触发 `tools/call`，结果注入下一轮上下文
- **作用范围**：**仅 RP-Hub 主聊天生效**，TRPG 模式不生效（TRPG iframe 跨 origin 无法注入工具说明 prompt）
- **持久化**：MCP 工具配置随 `activeTools` 数组存入 IndexedDB，启动时不主动拉取 `tools/list`（避免开机就发请求），用户在工具卡上手动点「↻ 刷新」按需触发

---

## 快速开始

### 方式一：浏览器使用（同原项目）

1. 下载或 clone 本仓库
2. 双击打开 `index.html`，在浏览器（推荐 Chrome / Edge）中启动
3. 在设置中填入 API URL、API Key，选择或输入模型名
4. 导入角色卡，开始 Roleplay

### 方式二：Android APK 使用

1. 从 [Releases](../../releases) 下载最新 `RP-Hub-v1.7.1-debug.apk`
2. 在 Android 手机上安装（需允许"安装未知来源应用"）
3. 打开 RP-Hub，在设置中配置 API（火山方舟 API 可直接使用，无需 proxy）
4. 进入万相广场下载角色卡/UI模板，会自动导入到 app

---

## 构建指南

### 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | 18+ |
| JDK | 21（Microsoft OpenJDK 21 测试通过） |
| Android SDK | Command-line Tools + Platform android-36 + Build-Tools 36.0.0 |

### 环境变量

```
JAVA_HOME = <JDK 21 路径>
ANDROID_HOME = <Android SDK 路径>
```

### 构建命令

```bash
# 安装依赖
npm install

# 同步 Web 资源到 Android 工程
npm run sync

# 构建 debug APK
cd android
.\gradlew.bat assembleDebug       # Windows
./gradlew assembleDebug           # Linux/Mac

# APK 输出路径
# android/app/build/outputs/apk/debug/RP-Hub-v1.7.1-debug.apk
```

### 重新构建（修改代码后）

```bash
npm run sync && cd android && .\gradlew.bat assembleDebug
```

---

## 目录结构

```text
RP-Hub/
├── index.html                # 主程序
├── character/                # 角色工坊辅助页面
│   └── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js            # 核心业务逻辑（含本 Fork 改动）
│       ├── card-utils.js     # 角色卡工具
│       ├── ui-select.js      # 自定义选择器
│       └── utils.js          # 工具函数
├── capacitor.config.json     # Capacitor 配置（本 Fork 新增）
├── package.json              # 构建脚本（本 Fork 新增）
├── scripts/
│   └── copy-web-to-www.js    # Web 资源复制脚本（本 Fork 新增）
├── android/                  # Capacitor Android 工程（构建时生成，.gitignore 排除）
├── www/                      # Web 资源副本（构建时生成，.gitignore 排除）
├── CHANGELOG.md              # 详细改动日志（本 Fork 新增）
└── README.md                 # 本文件
```

---

## 从上游同步更新

当原项目 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub) 有更新时：

```bash
# 添加上游远程
git remote add upstream https://github.com/STA1N156/RP-Hub.git

# 拉取并合并
git fetch upstream
git merge upstream/main

# 处理冲突后，重新构建
npm run sync
cd android && .\gradlew.bat assembleDebug
```

合并冲突通常出现在 `assets/js/app.js` 和 `index.html`，详见 [CHANGELOG.md](./CHANGELOG.md) 第五节"后续 Fork 更新同步指南"。

---

## 协议与许可

本项目继承原项目的 **[CC BY-NC 4.0](./LICENSE)** 协议：

- **署名**：必须保留原作者 STA1N156 的署名
- **非商业性使用**：禁止任何形式的商业化使用
- 详细条款见 [LICENSE](./LICENSE) 文件

---

## 致谢

- **原作者**：[STA1N156](https://github.com/STA1N156) —— 感谢开源 RP-Hub 项目
- **AI Sandbox Game**：[hayowei/aisandboxgame](https://github.com/hayowei/aisandboxgame) —— TRPG 模式来源，感谢开源 AI 沙盒游戏项目
- **技术栈**：Vue 3、Tailwind CSS、Capacitor 8、Microsoft OpenJDK 21
