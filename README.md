# Roleplay Hub (LuzzyMeow Fork)

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vue.js)](https://vuejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

> **基于 [STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub) 的个人 Fork，新增 Android APK 构建支持、火山方舟 API 兼容、模型自由输入、万相广场自动导入等增强功能。仅供个人使用。**

---

## Fork 来源声明

本项目 Fork 自 **[STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)**，遵循原作者的 [CC BY-NC 4.0](./LICENSE) 协议。

- **原项目**：一款纯前端运行的本地角色扮演（Roleplay）对话和角色卡生成工具
- **Fork 时间**：2026-06-17
- **Fork 目的**：个人使用，增加 Android APK 支持、火山方舟 API 兼容性、模型自由输入、万相广场下载自动导入等功能
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

---

## 快速开始

### 方式一：浏览器使用（同原项目）

1. 下载或 clone 本仓库
2. 双击打开 `index.html`，在浏览器（推荐 Chrome / Edge）中启动
3. 在设置中填入 API URL、API Key，选择或输入模型名
4. 导入角色卡，开始 Roleplay

### 方式二：Android APK 使用

1. 从 [Releases](../../releases) 下载最新 `RP-Hub-v1.0-debug.apk`
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
# android/app/build/outputs/apk/debug/RP-Hub-v1.0-debug.apk
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
- **技术栈**：Vue 3、Tailwind CSS、Capacitor 8、Microsoft OpenJDK 21
