# RP-Hub Fork 改动工作日志

> **Fork 源仓库**：https://github.com/STA1N156/RP-Hub
> **Fork 目标仓库**：https://github.com/LuzzyMeow/RP-Hub-LuzzyAPP（公开）
> **Fork 时间**：2026-06-17
> **改动目的**：修复模型选择缺陷 + 配置火山方舟 API + 编译 Android APK + 修复万相广场下载

---

## 一、改动总览

| # | 文件 | 类型 | 用途 |
|---|------|------|------|
| 1 | `assets/js/app.js` | 修改 | 模型自由输入 + URL 版本兼容 + 原生流式回退 + 万相广场自动导入 |
| 2 | `index.html` | 修改 | 模型选择弹窗添加手动输入框 |
| 3 | `capacitor.config.json` | 新建 | Capacitor 8 配置，启用原生 HTTP 绕过 CORS |
| 4 | `package.json` | 新建 | 构建脚本定义 |
| 5 | `scripts/copy-web-to-www.js` | 新建 | Web 资源复制到 www/ 目录 |
| 6 | `.gitignore` | 新建 | 忽略 node_modules/www/android/apk |
| 7 | `android/` | 新建 | Capacitor 生成的 Android 工程 |
| 8 | `android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java` | 修改 | DownloadListener 转发到 JS 自动导入 |
| 9 | `android/app/src/main/AndroidManifest.xml` | 修改 | 权限配置 |
| 10 | `android/app/build.gradle` | 修改 | 自定义 APK 输出文件名 |

---

## 二、详细改动记录

### 1. `assets/js/app.js`（核心业务逻辑）

#### 改动 1.1：添加 customModelInput 响应式变量
**位置**：约第 321 行
**目的**：存储用户手动输入的模型名称
```javascript
// 原代码
const availableModels = ref([]);

// 改为
const availableModels = ref([]);
const customModelInput = ref('');
```

#### 改动 1.2：openModelSelector 清空输入框
**位置**：约第 3994-4003 行
**目的**：每次打开模型选择器时清空上次的输入
```javascript
const openModelSelector = (target) => {
    modelSelectionTarget.value = target;
    customModelInput.value = '';  // 新增：清空手动输入
    if (target === 'memoryEmbeddingModel') {
        modelSearchQuery.value = 'embedding';
        activeModelTag.value = 'all';
    } else if (modelSearchQuery.value === 'embedding') {
        modelSearchQuery.value = '';
    }
    showModelSelector.value = true;
};
```

#### 改动 1.3：新增 confirmCustomModel 函数
**位置**：约第 4025-4033 行
**目的**：确认手动输入的模型名称并应用
```javascript
const confirmCustomModel = () => {
    const trimmed = customModelInput.value.trim();
    if (!trimmed) {
        showToast('请输入模型名称', 'warning');
        return;
    }
    selectModel(trimmed);
    customModelInput.value = '';
};
```

#### 改动 1.4：升级 getOpenAICompatUrl 支持任意版本后缀
**位置**：约第 6060-6064 行
**目的**：原代码只支持 `/v1`，火山方舟用 `/v3`，改为正则支持任意版本号
```javascript
// 原代码（只支持 /v1）
const getOpenAICompatUrl = (endpoint) => {
    const baseUrl = (settings.apiUrl || '').replace(/\/+$/, '');
    const apiUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    return `${apiUrl}/${endpoint}`;
};

// 改为（支持 /v1 /v2 /v3 等任意版本号）
const getOpenAICompatUrl = (endpoint) => {
    const baseUrl = (settings.apiUrl || '').replace(/\/+$/, '');
    const apiUrl = /\/v\d+$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
    return `${apiUrl}/${endpoint.replace(/^\/+/, '')}`;
};
```

#### 改动 1.5：替换 4 处内联 URL 构造为 getOpenAICompatUrl() 调用
**位置**：fetchModels、sendMessage、embeddings 等调用点
**目的**：统一 URL 构造逻辑，确保所有 API 调用都走版本兼容处理
```javascript
// 改动前（各处内联构造）
const url = `${settings.apiUrl.replace(/\/+$/, '')}/v1/chat/completions`;
const url = `${settings.apiUrl.replace(/\/+$/, '')}/v1/models`;
const url = `${settings.apiUrl.replace(/\/+$/, '')}/v1/embeddings`;
// ... 共 4 处

// 改动后（统一调用）
const url = getOpenAICompatUrl('chat/completions');
const url = getOpenAICompatUrl('models');
const url = getOpenAICompatUrl('embeddings');
```

#### 改动 1.6：新增原生平台检测和流式回退
**位置**：约第 6066-6070 行（getOpenAICompatUrl 之后）
**目的**：CapacitorHttp 在 Android 不支持真流式（getReader 一次性返回），原生环境自动禁用流式
```javascript
// 新增代码
// Capacitor native environment detection: CapacitorHttp patches fetch but does NOT support
// true streaming (response.body.getReader() returns full data at once on Android).
// Force-disable streaming in native APK to avoid broken chat experience.
const isNativePlatform = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const getEffectiveStream = () => settings.stream && !isNativePlatform();
```

#### 改动 1.7：sendMessage 中使用 getEffectiveStream()
**位置**：约第 5701 行（请求体）和第 5729 行（响应判断）
**目的**：原生环境自动设 stream:false，避免流式解析失败
```javascript
// 请求体（第 5701 行）
// 改动前
stream: settings.stream
// 改动后
stream: getEffectiveStream()

// 响应判断（第 5729 行）
// 改动前
const isStream = settings.stream && contentType && contentType.includes('text/event-stream');
// 改动后
const isStream = getEffectiveStream() && contentType && contentType.includes('text/event-stream');
```

#### 改动 1.8：return 语句导出新变量和函数
**位置**：约第 10687 行和第 10838 行
**目的**：让模板可以访问 customModelInput 和 confirmCustomModel
```javascript
// 第 10687 行附近
characterSearchQuery, availableModels, customModelInput, filteredModels, filteredCharacters,
//                                                    ^^^^^^^^^^^^^^^^ 新增

// 第 10838 行附近
fetchModels, selectModel, confirmCustomModel, sendMessage, autoResizeInput,
//                         ^^^^^^^^^^^^^^^^^^^ 新增
```

---

### 2. `index.html`（主页面 UI）

#### 改动 2.1：模型选择弹窗添加手动输入框
**位置**：约第 3479-3489 行（模型选择弹窗内）
**目的**：用户可手填模型名（如 `ark-code-latest`），不局限于下拉识别到的模型
```html
<!-- 新增：Manual Model Input -->
<div class="flex gap-2 items-center">
    <input v-model="customModelInput" type="text"
        @keydown.enter="confirmCustomModel"
        placeholder="手动输入模型名称，如 ark-code-latest"
        class="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50/60 border-gray-300 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all font-mono">
    <button @click="confirmCustomModel"
        class="shrink-0 px-4 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 active:scale-95 transition-all whitespace-nowrap">
        确认
    </button>
</div>
```

---

### 3. `capacitor.config.json`（新建 - Capacitor 配置）

**完整内容**：
```json
{
  "appId": "com.luzzymeow.rphub",
  "appName": "RP-Hub",
  "webDir": "www",
  "server": {
    "androidScheme": "https",
    "cleartext": true
  },
  "android": {
    "allowMixedContent": true
  },
  "plugins": {
    "CapacitorHttp": {
      "enabled": true
    }
  }
}
```

**关键配置说明**：
- `appId`：Android 应用包名 `com.luzzymeow.rphub`
- `webDir`：Web 资源目录（构建前由 scripts/copy-web-to-www.js 填充）
- `server.cleartext` + `android.allowMixedContent`：允许 HTTP 明文（部分 API 可能用 HTTP）
- `plugins.CapacitorHttp.enabled: true`：**核心**，启用后自动 patch `window.fetch`，所有 fetch 调用走原生 HTTP，绕过浏览器 CORS 限制。这是火山方舟 API 在 APK 内可用的关键。

---

### 4. `package.json`（新建 - 构建脚本）

**关键内容**：
```json
{
  "name": "rp-hub",
  "version": "1.0.0",
  "scripts": {
    "build:web": "node scripts/copy-web-to-www.js",
    "sync": "npm run build:web && npx cap sync",
    "build:android": "npm run sync && npx cap build android"
  },
  "dependencies": {
    "@capacitor/android": "^8.4.0",
    "@capacitor/core": "^8.4.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.4.0"
  }
}
```

**脚本说明**：
- `npm run build:web`：复制 index.html、assets、character 到 www/
- `npm run sync`：构建 Web 资源 + 同步到 Android 工程
- `npm run build:android`：完整构建（需 JDK + Android SDK）

---

### 5. `scripts/copy-web-to-www.js`（新建 - Web 资源复制脚本）

**完整内容**：
```javascript
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');

const itemsToCopy = ['index.html', 'assets', 'character'];

if (fs.existsSync(www)) {
    fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
};

for (const item of itemsToCopy) {
    const src = path.join(root, item);
    if (fs.existsSync(src)) {
        copyRecursive(src, path.join(www, item));
        console.log(`Copied: ${item}`);
    } else {
        console.warn(`Skip (not found): ${item}`);
    }
}

console.log('Web assets copied to www/');
```

**作用**：Capacitor 要求 Web 资源放在 `webDir`（www/）目录。本脚本把项目根目录的纯前端文件复制过去，避免污染源码目录结构。

---

### 6. `.gitignore`（新建）

```
node_modules/
www/
android/
*.apk
*.aab
.DS_Store
Thumbs.db
*.log
```

**说明**：`www/` 和 `android/` 是构建产物，不纳入版本控制（可由 `npm run sync` 重新生成）。

---

### 7. `android/`（新建 - Capacitor Android 工程）

由 `npx cap init` + `npx cap add android` 自动生成，包含：
- `android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`：入口 Activity
- `android/app/src/main/AndroidManifest.xml`：清单文件
- `android/app/src/main/res/`：资源文件（图标、启动屏、样式）
- `android/variables.gradle`：SDK 版本配置（compileSdk 36, minSdk 24）
- `android/gradlew.bat`：Gradle Wrapper

**不纳入 git**（在 .gitignore 中排除），可通过以下命令重建：
```bash
npm install
npm run sync
npx cap add android
# 然后手动应用 MainActivity.java 和 AndroidManifest.xml 的改动
```

---

### 8. `android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`（修改 - 下载处理）

**改动目的**：万相广场是 iframe 嵌入的第三方网站，iframe 内点击下载角色卡/UI模板时，Capacitor 默认 WebView 不处理下载请求，导致文件"消失"。本改动注册 DownloadListener，把下载转发到系统 DownloadManager，保存到公共 Downloads 目录。

**完整改动后内容**：
```java
package com.luzzymeow.rphub;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.DownloadListener;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * RP-Hub 主 Activity。
 *
 * 关键定制：注册 WebView 的 DownloadListener，把万相广场 iframe 内触发的
 * 角色卡 / UI 模板下载（<a download> 或导航到可下载资源）转发到系统
 * DownloadManager，保存到公共 Downloads 目录。
 *
 * 背景：Capacitor 默认 WebView 不处理 iframe 内的下载请求，导致用户点击
 * 下载后文件"消失"（实际被 WebView 静默丢弃）。本 DownloadListener 把
 * 这些下载接管到原生层，确保文件可见、可导入。
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "RP-Hub/Download";
    private boolean downloadListenerRegistered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerDownloadListenerIfNeeded();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // bridge 在 onCreate 后才完成初始化，这里做二次保险
        registerDownloadListenerIfNeeded();
    }

    private void registerDownloadListenerIfNeeded() {
        if (downloadListenerRegistered) return;
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent,
                                        String contentDisposition, String mimetype,
                                        long contentLength) {
                handleDownload(url, contentDisposition, mimetype);
            }
        });
        downloadListenerRegistered = true;
        Log.i(TAG, "DownloadListener registered");
    }

    private void handleDownload(String url, String contentDisposition, String mimetype) {
        try {
            String fileName = resolveFileName(url, contentDisposition, mimetype);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimetype != null && !mimetype.isEmpty()) {
                request.setMimeType(mimetype);
            }
            request.setTitle(fileName);
            request.setDescription("RP-Hub 下载");
            request.allowScanningByMediaScanner();
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                toast("下载失败：系统下载服务不可用");
                return;
            }
            dm.enqueue(request);
            toast("下载已开始: " + fileName + "\n保存到 Downloads/RP-Hub");
            Log.i(TAG, "Download enqueued: " + fileName + " from " + url);
        } catch (Exception e) {
            toast("下载失败: " + e.getMessage());
            Log.e(TAG, "Download failed", e);
        }
    }

    private String resolveFileName(String url, String contentDisposition, String mimetype) {
        // 1. 优先从 Content-Disposition 提取
        if (contentDisposition != null && !contentDisposition.isEmpty()) {
            String key = "filename=";
            int idx = contentDisposition.toLowerCase().indexOf(key);
            if (idx >= 0) {
                String name = contentDisposition.substring(idx + key.length()).trim();
                if (name.startsWith("\"")) name = name.substring(1);
                if (name.endsWith("\"")) name = name.substring(0, name.length() - 1);
                name = name.trim();
                if (!name.isEmpty()) return name;
            }
        }
        // 2. 从 URL 提取
        String decoded;
        try {
            decoded = Uri.decode(url);
        } catch (Exception e) {
            decoded = url;
        }
        int queryIdx = decoded.indexOf('?');
        if (queryIdx > 0) decoded = decoded.substring(0, queryIdx);
        int slash = decoded.lastIndexOf('/');
        String name = slash >= 0 ? decoded.substring(slash + 1) : "";
        if (name.isEmpty()) name = "rphub_download";
        // 3. 补扩展名
        if (!name.contains(".")) {
            name += guessExtension(mimetype);
        }
        return name;
    }

    private String guessExtension(String mimetype) {
        if (mimetype == null) return "";
        switch (mimetype.toLowerCase()) {
            case "application/json": return ".json";
            case "image/png": return ".png";
            case "image/jpeg": return ".jpg";
            case "image/webp": return ".webp";
            case "application/zip": return ".zip";
            case "text/plain": return ".txt";
            default: return "";
        }
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(getApplicationContext(), msg, Toast.LENGTH_LONG).show());
    }
}
```

**工作机制**：
1. 万相广场 iframe 内点击下载 → 触发 `<a href="https://rphforum.zeabur.app/api/.../download" download="xxx.png">`
2. WebView 识别为下载请求 → 触发 `DownloadListener.onDownloadStart`
3. 提取文件名（优先 Content-Disposition，其次 URL，最后按 mimetype 补扩展名）
4. 通过 `DownloadManager` 下载到 `Downloads/` 目录
5. 显示 Toast 提示 + 系统通知栏进度

**已知限制**：
- 万相广场对**未审核/管理员卡片**使用 blob URL 下载（`fetchAndSaveDownload`），blob URL 不触发 DownloadListener。普通已审核卡片使用 HTTP URL 下载（`triggerDirectDownload`），可被正常捕获。
- 下载的文件保存在 `Downloads/` 目录，需在 RP-Hub 内通过"导入角色卡"功能手动导入（从文件选择器选择 Downloads 目录的文件）。

---

### 9. `android/app/src/main/AndroidManifest.xml`（修改 - 权限）

**改动**：添加存储权限
```xml
<!-- 原代码 -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- 改为 -->
<uses-permission android:name="android.permission.INTERNET" />
<!-- DownloadManager 写入公共 Downloads 目录；Android 10+ 走 scoped storage 不需要，但 minSdk 24 需要 -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="28" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
```

**说明**：
- `WRITE_EXTERNAL_STORAGE` 限制 `maxSdkVersion=28`：Android 9 及以下需要此权限写入公共目录；Android 10+ 使用 scoped storage，DownloadManager 自带权限
- `READ_EXTERNAL_STORAGE` 限制 `maxSdkVersion=32`：Android 13+ 用更细粒度的权限替代

---

## 三、构建环境配置

### 已安装的环境依赖
| 组件 | 版本 | 安装路径 |
|------|------|----------|
| Node.js | v24.11.1 | 系统已装 |
| JDK | Microsoft OpenJDK 21.0.11.10 | `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot` |
| Android SDK | Command-line Tools 12.0 | `C:\Android\sdk\cmdline-tools\latest` |
| Android Platform | android-34, android-36 | `C:\Android\sdk\platforms\` |
| Build-Tools | 34.0.0, 35.0.0, 36.0.0 | `C:\Android\sdk\build-tools\` |
| Platform-Tools | latest | `C:\Android\sdk\platform-tools\` |

### 环境变量（已通过 setx 持久化）
```
JAVA_HOME = C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot
ANDROID_HOME = C:\Android\sdk
```

### 构建命令
```powershell
# 1. 同步 Web 资源到 Android 工程
npm run sync

# 2. 构建 debug APK
cd android
.\gradlew.bat assembleDebug

# 3. 构建 release APK（需签名配置）
cd android
.\gradlew.bat assembleRelease
```

### APK 输出路径
```
android\app\build\outputs\apk\debug\app-debug.apk
android\app\build\outputs\apk\release\app-release.apk
```

---

## 四、关键技术决策记录

### 决策 1：选择 Capacitor 而非 Cordova/PhoneGap
**原因**：
- Capacitor 8 是 Ionic 团队维护的现代方案，原生 HTTP 插件成熟
- 内置 `CapacitorHttp` 插件可自动 patch `window.fetch`，无需修改业务代码
- 与 Vue 3 兼容性好，无构建步骤要求

### 决策 2：使用内置 CapacitorHttp 而非 @capacitor-community/http
**原因**：
- 社区插件 `@capacitor-community/http@1.4.1` 依赖 Capacitor 3，与 Capacitor 8 冲突
- 内置 `CapacitorHttp` 从 Capacitor 6 开始提供，功能等价且维护更积极
- 配置简单：只需 `capacitor.config.json` 中 `plugins.CapacitorHttp.enabled: true`

### 决策 3：原生环境自动禁用流式传输
**原因**：
- CapacitorHttp 在 Android 上 patch 了 fetch，但不支持真正的流式响应
- `response.body.getReader()` 会一次性返回完整数据，导致流式解析逻辑异常
- 通过 `isNativePlatform()` 检测后设 `stream: false`，聊天功能正常（整段返回而非逐字）

### 决策 4：火山方舟 CORS 问题的解决思路
**问题**：火山方舟 API 在浏览器中因 CORS 拦截失败，用户原用 proxy 转发解决
**APK 方案**：CapacitorHttp 启用后，所有 fetch 走原生 HTTP，无 CORS 限制，**无需外部 proxy**
**原理**：CORS 是浏览器安全策略，原生 HTTP 客户端不受此限制

### 决策 5：DownloadListener 方案处理万相广场下载
**问题**：iframe 内下载在 WebView 中默认被丢弃
**方案**：注册 `WebView.setDownloadListener`，转发到系统 `DownloadManager`
**限制**：blob URL 下载不触发 DownloadListener（万相广场对未审核卡片用 blob URL，普通卡片用 HTTP URL 可正常捕获）

---

## 五、后续 Fork 更新同步指南

当上游 `STA1N156/RP-Hub` 有更新时，按以下步骤同步：

### 步骤 1：添加上游远程并拉取
```bash
git remote add upstream https://github.com/STA1N156/RP-Hub.git
git fetch upstream
git merge upstream/main
```

### 步骤 2：处理冲突
冲突通常出现在我们改过的文件：
- `assets/js/app.js`：重点检查 `getOpenAICompatUrl`、`isNativePlatform`、`getEffectiveStream`、`confirmCustomModel`、`customModelInput` 是否被覆盖
- `index.html`：检查模型选择弹窗的手动输入框是否保留

### 步骤 3：验证改动完整性
合并后检查以下关键代码是否存在：
```javascript
// app.js 中应存在
const customModelInput = ref('');                    // 模型输入
const confirmCustomModel = () => { ... };            // 确认输入
const getOpenAICompatUrl = (endpoint) => { ... };    // 版本兼容 URL
const isNativePlatform = () => { ... };              // 原生检测
const getEffectiveStream = () => { ... };            // 流式回退
```

### 步骤 4：重新构建 APK
```bash
npm run sync
cd android
.\gradlew.bat assembleDebug
```

### 步骤 5：Android 工程更新
如果 Capacitor 版本升级：
```bash
npm update @capacitor/core @capacitor/cli @capacitor/android
npx cap sync android
# 重新应用 MainActivity.java 的 DownloadListener 改动
# 重新应用 AndroidManifest.xml 的权限改动
```

---

## 六、已知问题与待优化

### 已知问题
1. **需要认证的卡片下载可能失败**：万相广场对未审核/管理员卡片使用 blob URL 下载（`fetchAndSaveDownload` 带 Authorization header），DownloadListener 无法捕获 blob URL。普通已审核卡片用 HTTP URL 下载（`triggerDirectDownload`），可被正常捕获并自动导入。
2. **流式传输降级**：APK 内聊天为整段返回，无逐字打字效果（CapacitorHttp 限制）。

### 待优化
1. **release APK 签名**：当前只构建了 debug APK，release 构建需配置签名密钥
2. **应用图标定制**：当前使用 Capacitor 默认图标，可替换为 RP-Hub 专属图标

---

## 七、文件变更清单（git diff 摘要）

```
新增文件:
  capacitor.config.json
  package.json
  package-lock.json
  scripts/copy-web-to-www.js
  .gitignore
  CHANGELOG.md（本文件）

修改文件:
  assets/js/app.js          # 9 处改动（见第二节 1.1-1.8 + 第八节 8.1）
  index.html                # 1 处改动（模型输入框）

生成文件（.gitignore 排除）:
  www/                      # Web 资源副本
  android/                  # Capacitor Android 工程
  node_modules/             # 依赖
```

---

## 八、第二轮改动（2026-06-18：万相广场自动导入 + APK 文件名）

### 8.1 `assets/js/app.js` 新增 RPHubAutoImport 函数
**位置**：约第 8981-9013 行（importUiTemplates 之后）
**目的**：万相广场下载的角色卡/UI模板直接导入到 app，无需用户手动从文件系统导入
```javascript
// 万相广场自动导入：原生 DownloadListener 捕获下载 URL 后调用此函数
// 直接 fetch URL（CapacitorHttp 绕过 CORS）→ 构造 File → 调用现有导入逻辑
// 角色卡（PNG）→ importCharacter，UI 模板（.ui）→ importUiTemplates
// 只下载一次，直接导入到 app，无需用户手动从文件系统导入
window.RPHubAutoImport = async (url, mimetype) => {
    try {
        showToast('正在下载并导入...', 'info');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        const isImage = (mimetype && mimetype.startsWith('image/'))
            || /\.png(\?|$)/i.test(url);
        const ext = isImage ? 'png' : 'ui';
        const file = new File([blob], `download.${ext}`, {
            type: mimetype || (isImage ? 'image/png' : 'application/octet-stream')
        });

        // 构造假 event 对象，复用现有导入逻辑
        const fakeEvent = { target: { files: [file], value: '' } };

        if (isImage) {
            // 角色卡（PNG 格式，内嵌 JSON）
            importCharacter(fakeEvent);
        } else {
            // UI 模板（.ui 文件，本质是 JSON）
            importUiTemplates(fakeEvent);
        }
    } catch (e) {
        console.error('[RPHubAutoImport] Failed:', e);
        showToast(`自动导入失败: ${e.message}`, 'error');
    }
};
```

**工作机制**：
1. 原生 DownloadListener 捕获 iframe 内的下载 URL
2. 通过 `evaluateJavascript` 调用 `window.RPHubAutoImport(url, mimetype)`
3. JS 层用 CapacitorHttp（已 patch fetch）绕过 CORS，fetch 下载 URL
4. 获取 Blob → 构造 File 对象 → 构造假 event → 调用 `importCharacter` 或 `importUiTemplates`
5. 角色卡/UI模板直接出现在 app 内

**优势**：
- 只下载一次（不浪费下载次数）
- 直接导入（无需文件系统中转）
- 角色卡和 UI 模板统一处理

---

### 8.2 `MainActivity.java` 改为 JS 自动导入方案
**位置**：整个文件重写
**目的**：DownloadListener 不再用 DownloadManager 下载到文件系统，而是转发到 JS 层直接导入
**关键改动**：
- DownloadListener 的 `onDownloadStart` 改为 `evaluateJavascript` 调用 `window.RPHubAutoImport`
- 删除 DownloadManager 相关代码（handleDownload、resolveFileName、isImageFile、guessExtension）
- 新增 `jsString` 辅助方法转义 JS 字符串
- 移除 Toast 相关 import 和代码

**核心代码**：
```java
webView.setDownloadListener(new DownloadListener() {
    @Override
    public void onDownloadStart(String url, String userAgent,
                                String contentDisposition, String mimetype,
                                long contentLength) {
        // 转发到 JS 层自动导入：直接 fetch URL 并导入到 app
        String js = String.format(
            "try{window.RPHubAutoImport&&window.RPHubAutoImport(%s,%s);}catch(e){console.error('[RP-Hub] AutoImport failed:',e);}",
            jsString(url), jsString(mimetype)
        );
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
});
```

---

### 8.3 `AndroidManifest.xml` 移除存储权限
**改动**：移除 `WRITE_EXTERNAL_STORAGE` 和 `READ_EXTERNAL_STORAGE`
**原因**：不再使用 DownloadManager 下载到文件系统，无需存储权限
```xml
<!-- 改动后只剩 INTERNET 权限 -->
<uses-permission android:name="android.permission.INTERNET" />
```

---

### 8.4 `android/app/build.gradle` 自定义 APK 文件名
**位置**：android {} 块内，buildTypes 之后
**目的**：APK 输出文件名从默认的 `app-debug.apk` 改为 `RP-Hub-v1.0-debug.apk`
```groovy
// 自定义 APK 输出文件名：RP-Hub-v1.0-debug.apk / RP-Hub-v1.0-release.apk
applicationVariants.all { variant ->
    variant.outputs.all {
        outputFileName = "RP-Hub-v${variant.versionName}-${variant.name}.apk"
    }
}
```

**输出文件名**：
- debug 版：`RP-Hub-v1.0-debug.apk`
- release 版：`RP-Hub-v1.0-release.apk`

---

**最后更新**：2026-06-18
**维护者**：LuzzyMeow

---

## 九、第三轮改动（2026-06-18：版本号对齐 + 仓库公开 + Release 发布）

### 9.1 版本号对齐原作者最新版本
**文件**：`package.json`、`android/app/build.gradle`
**改动**：版本号从 `1.0` / `1.0.0` 对齐到原作者最新版本 **1.7.1**
```json
// package.json
"version": "1.7.1"
```
```groovy
// build.gradle
versionCode 171
versionName "1.7.1"
```
**APK 输出文件名自动变为**：`RP-Hub-v1.7.1-debug.apk`

### 9.2 仓库公开
**操作**：`gh repo edit LuzzyMeow/RP-Hub --visibility public --accept-visibility-change-consequences`
**结果**：仓库从私有切换为公开

### 9.3 仓库更名
**操作**：`gh repo rename RP-Hub-LuzzyAPP --repo LuzzyMeow/RP-Hub --yes`
**结果**：仓库名从 `RP-Hub` 改为 `RP-Hub-LuzzyAPP`
**新地址**：https://github.com/LuzzyMeow/RP-Hub-LuzzyAPP

### 9.4 仓库描述和 Topics 更新
**Description**：`基于 STA1N156/RP-Hub 的增强 Fork | Android APK 支持 | 火山方舟 API 兼容 | 模型自由输入 | 万相广场自动导入`
**Homepage**：指向原项目 `https://github.com/STA1N156/RP-Hub`
**Topics**：`roleplay` `android` `capacitor` `vue3` `volcengine` `apk`

### 9.5 发布 Release v1.7.1
**操作**：`gh release create v1.7.1` 上传 APK + Release Notes
**Release 页面**：https://github.com/LuzzyMeow/RP-Hub-LuzzyAPP/releases/tag/v1.7.1
**附件**：`RP-Hub-v1.7.1-debug.apk`（4.25 MB）
**Release Notes 内容**：
- 下载表格 + 安装说明（可折叠）
- 5 大新增功能详解
- 与原项目的差异对比表
- 已知限制
- 致谢和协议说明
- CHANGELOG 链接

### 9.6 本地 git remote 更新
**注意**：仓库更名后本地 remote URL 需更新：
```bash
git remote set-url origin https://github.com/LuzzyMeow/RP-Hub-LuzzyAPP.git
```

---

## 十、第四轮改动（2026-06-18：TRPG 模式接入 + 本地 API 代理）

### 10.1 `index.html` 侧边栏添加 TRPG 按钮
**位置**：约第 250-261 行（万相广场按钮之后）
**目的**：在侧边栏导航中添加 TRPG 入口，点击切换到 TRPG 视图
```html
<button @click="currentView = 'trpg'; closeMobileMenu()"
    title="TRPG"
    :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium',
        currentView === 'trpg' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
        isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
    <svg class="w-5 h-5" ...play-circle icon...></svg>
    <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">TRPG</span>
</button>
```

### 10.2 `index.html` 添加 TRPG iframe 区域
**位置**：约第 1596-1630 行（万相广场 iframe 区域之后）
**目的**：复制万相广场模式，iframe 嵌入 `aisandboxgame.com`，支持加载状态和返回按钮
```html
<div v-if="currentView === 'trpg'" class="h-full overflow-hidden flex flex-col bg-gray-50 relative">
    <!-- 移动端返回按钮 -->
    <!-- 加载中动画 -->
    <!-- iframe 嵌入 aisandboxgame.com -->
    <iframe :src="trpgUrl" @load="onTrpgLoad" class="absolute inset-0 w-full h-full border-0"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe>
</div>
```

### 10.3 `assets/js/app.js` 添加 TRPG 状态管理
**位置**：约第 1599-1606 行（onSquareLoad 之后）
**目的**：管理 TRPG iframe 的 URL 和加载状态
```javascript
// TRPG State
const isTrpgLoading = ref(true);
const trpgUrl = ref('https://aisandboxgame.com/');

const onTrpgLoad = () => {
    isTrpgLoading.value = false;
    console.log('%c[TRPG] AI Sandbox Game Iframe Loaded', 'color: #8b5cf6; font-weight: bold;');
};
```

### 10.4 `assets/js/app.js` watch 添加 TRPG 视图刷新
**位置**：约第 1618-1620 行（watch currentView 内）
**目的**：切换到 TRPG 视图时刷新 iframe（加时间戳避免缓存）
```javascript
} else if (newView === 'trpg') {
    isTrpgLoading.value = true;
    trpgUrl.value = `https://aisandboxgame.com/?t=${Date.now()}`;
}
```

### 10.5 `assets/js/app.js` 导出 TRPG 变量
**位置**：约第 10749 行（return 语句中）
```javascript
isTrpgLoading, trpgUrl, onTrpgLoad, // TRPG exports
```

### 10.6 `MainActivity.java` 添加 NanoHTTPD 本地 API 代理服务器
**位置**：整个文件重写
**目的**：TRPG iframe 内的 API 请求受 CORS 限制，需要本地代理服务器转发

**核心架构**：
- 使用 NanoHTTPD 在 `localhost:18527` 启动微型 HTTP 代理
- 接收 iframe 内的 API 请求，转发到实际 API 服务器
- 添加 CORS 响应头，绕过浏览器跨域限制
- 支持 SSE 流式响应透传（`text/event-stream`）
- 支持 OPTIONS 预检请求自动响应

**URL 映射规则**：
| 用户配置的 API 地址 | 代理转发目标 |
|---|---|
| `http://localhost:18527/v3` | `https://ark.cn-beijing.volces.com/api/coding/v3`（默认，火山方舟） |
| `http://localhost:18527/v1?_target=https://api.deepseek.com` | `https://api.deepseek.com/v1`（自定义目标） |

**为什么不用 shouldInterceptRequest？**
- Android WebView 的 `shouldInterceptRequest` 无法获取 POST 请求体
- CapacitorHttp 通过 JS Bridge 传递请求体，但只对主页面有效，iframe 内无法使用
- 本地代理服务器是最可靠的方案，支持所有 HTTP 方法、请求体和流式响应

**关键代码**：
```java
private class ApiProxyServer extends NanoHTTPD {
    private static final String DEFAULT_TARGET_BASE = "https://ark.cn-beijing.volces.com/api/coding";

    @Override
    public Response serve(IHTTPSession session) {
        // OPTIONS 预检请求 → 直接返回 CORS 头
        // 其他请求 → 解析请求体 → 转发到目标 API → 添加 CORS 头返回
        // SSE 流式响应 → 使用 Chunked 编码透传
    }
}
```

### 10.7 `android/app/build.gradle` 添加 NanoHTTPD 依赖
**位置**：dependencies 块
```groovy
implementation 'org.nanohttpd:nanohttpd:2.3.1'
```

### 10.8 `android/app/src/main/AndroidManifest.xml` 添加 cleartext 支持
**改动**：`<application>` 标签添加 `android:usesCleartextTraffic="true"`
**原因**：本地代理使用 HTTP（`localhost:18527`），Android 9+ 默认禁止明文 HTTP 流量

### 10.9 TRPG 使用说明
1. 在 APP 侧边栏点击 **TRPG** 按钮
2. 等待 `aisandboxgame.com` 加载完成
3. 在 TRPG 网页内配置 API：
   - **API 地址**：`http://localhost:18527/v3`（火山方舟 coding plan）
   - **API Key**：你的火山方舟 API Key
   - **模型名**：如 `ark-code-latest`
4. 开始 TRPG 游戏体验

**其他 API 提供商**：
- DeepSeek：API 地址填 `http://localhost:18527/v1?_target=https://api.deepseek.com`
- OpenAI：API 地址填 `http://localhost:18527/v1?_target=https://api.openai.com`
- 其他 OpenAI 兼容 API：API 地址填 `http://localhost:18527/v1?_target=<你的API地址>`

---

## 十一、第五轮改动（2026-06-18：TRPG 代理优化 + Bug 修复 + Release V2）

### 11.0 改动背景

用户反馈第四轮的 TRPG 代理方案存在两个问题：
1. **代理不够全面**：默认只支持火山方舟，其他 API 需要手动拼 `_target` 参数，体验差
2. **抗更新能力存疑**：需要确认 aisandboxgame.com 更新后代理机制是否仍然有效

经深入调研确认：
- **抗更新能力**：代理机制完全在 Android 原生层（MainActivity.java），不修改 aisandboxgame.com 的任何代码。aisandboxgame.com 更新后，只要仍使用 `fetch` 调用 OpenAI 兼容端点（`/chat/completions`、`/models`、`/embeddings`），代理就有效。代理不依赖网页代码，不会被顶替。
- **shouldInterceptRequest 不可行**：Android WebView 的 `shouldInterceptRequest` 无法获取 POST 请求体（腾讯云文档确认），无法用于 API 转发。NanoHTTPD 本地代理是唯一可行方案。

### 11.1 `MainActivity.java` 修复 resolveTargetBase 逻辑错误
**文件**：`android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`
**位置**：`resolveTargetBase` 方法（约第 267-291 行）
**问题**：原代码 `/v1` 路径默认也指向火山方舟，但火山方舟用 `/v3`。用户用 `/v1` 访问火山方舟会得到错误的 URL `https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions`（应该是 `/v3`）。
**修复**：`/v1` 路径不再默认指向火山方舟，必须通过 `_target` 参数指定目标。只有 `/v3` 路径自动映射到火山方舟 coding plan。

```java
// 修复前（错误）：/v1 也默认指向火山方舟
if (uri.startsWith("/v1") || uri.startsWith("/v1/")) {
    return VOLCANO_ARK_BASE;  // 错误！/v1 + 火山方舟 = /v1/chat/completions，但火山方舟用 /v3
}

// 修复后（正确）：/v1 必须配合 _target 参数
// 只保留 /v3 → 火山方舟的自动映射
```

### 11.2 `MainActivity.java` 修复 buildQueryString 正则清理不完整
**文件**：`android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`
**位置**：`buildQueryString` 方法（约第 296-307 行）
**问题**：原正则 `(^|[&?])_target=[^&]*` 移除 `_target` 参数后可能留下连续的 `&&`（如 `a=1&_target=x&b=2` → `a=1&&b=2`）。
**修复**：增加 `&{2,}` 清理连续的 `&`。

```java
// 修复前
queryString = queryString.replaceAll("(^|[&?])_target=[^&]*", "");
queryString = queryString.replaceAll("^[&?]+", "");

// 修复后
queryString = queryString.replaceAll("(^|[&?])_target=[^&]*", "");
queryString = queryString.replaceAll("^[&?]+", "");
queryString = queryString.replaceAll("&{2,}", "&");  // 新增：清理连续 &
```

### 11.3 `MainActivity.java` 更新设计文档注释
**文件**：`android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`
**位置**：类级别注释（第 22-55 行）
**改动**：添加"抗更新能力"说明，明确代理机制不依赖网页代码，不会被 aisandboxgame.com 更新顶替。

### 11.4 `android-patches/MainActivity.java` 同步更新
**文件**：`android-patches/MainActivity.java`
**改动**：将修复后的 MainActivity.java 同步到 android-patches 目录，确保 git 版本控制中的副本与实际构建使用的一致。

### 11.5 TRPG 使用说明（最终版）

**火山方舟 Coding Plan（默认，最简配置）**：
- API 地址：`http://localhost:18527/v3`
- API Key：你的火山方舟 API Key
- 模型名：如 `ark-code-latest`

**其他 API 提供商（通过 _target 参数）**：
- DeepSeek：`http://localhost:18527/v1?_target=https://api.deepseek.com`
- OpenAI：`http://localhost:18527/v1?_target=https://api.openai.com`
- 其他 OpenAI 兼容 API：`http://localhost:18527/<路径>?_target=<你的API地址>`

**为什么用户需要填 `localhost:18527` 而不是直接填真实 API 地址？**
- Android WebView 的 `shouldInterceptRequest` 无法获取 POST 请求体，无法拦截转发
- CapacitorHttp 只 patch 主页面 fetch，iframe 内的 fetch 不受影响
- NanoHTTPD 本地代理是唯一可行方案，用户必须将 API 地址指向本地代理
- 代理服务器自动识别路径前缀（`/v3` → 火山方舟），用户只需填一次地址

### 11.6 预期产出
- 修复后的 APK（`RP-Hub-v1.7.1-debug.apk`）
- Release V2：`RP-Hub v1.7.1 V2 (Android APK)`
- 更新的 CHANGELOG.md 和 README.md
- 推送到远程仓库

---

## 十二、第六轮改动（2026-06-18：TRPG 代理配置弹窗 + iframe 缓存 + 配置持久化）

### 12.0 改动背景

用户反馈第五轮的 TRPG 代理方案虽然功能完整，但交互体验不佳：
1. **用户需手动拼 localhost 地址**：用户需要自己知道填 `http://localhost:18527/v3`，缺乏引导
2. **iframe 每次切换重新加载**：用户切换到其他功能再切回 TRPG，网页重新加载，需要重新选择存档
3. **配置不持久化**：每次进入 TRPG 都要重新配置代理
4. **弹窗标题不匹配用户期望**：用户希望弹窗以疑问句形式引导

本轮改动聚焦于交互体验优化，通过新增代理配置弹窗、iframe 缓存、配置持久化三项核心改进，全面提升 TRPG 模式的易用性。

### 12.1 `index.html` TRPG iframe 改为 v-show 实现缓存

**文件**：`index.html`
**位置**：第 1597 行
**问题**：原 TRPG iframe 使用 `v-if` 控制，每次切换视图会销毁重建 iframe，导致网页重新加载，用户需要重新交互选择存档。
**修复**：改为 `v-show` 控制，保留 DOM 元素（`display:none`），切换视图时 iframe 不销毁，网页状态保持。

```html
<!-- 修改前 -->
<div v-if="currentView === 'trpg'" ...>

<!-- 修改后 -->
<div v-show="currentView === 'trpg'" ...>
```

**对比**：原项目中 `square`（万相广场）视图使用 `v-if`（每次刷新），`chat`（聊天）视图使用 `v-show`（缓存）。TRPG 采用与 chat 一致的缓存策略，因为 TRPG 网页有复杂的交互状态（存档选择、世界卡配置等），不应频繁重置。

### 12.2 `index.html` TRPG 视图移动端浮动返回按钮

**文件**：`index.html`
**位置**：第 1598-1607 行
**改动**：新增移动端浮动返回按钮，与 `square`（万相广场）视图完全一致的交互模式。按钮位于左侧居中，点击调用 `toggleMobileMenu` 打开侧边栏菜单，支持切换到其他功能。

**设计决策**：参考原项目其他菜单功能（square、settings 等）的返回交互模式，保持一致性。桌面端侧边栏始终可见，移动端通过浮动按钮打开侧边栏。

### 12.3 `index.html` 新增 TRPG 代理配置弹窗

**文件**：`index.html`
**位置**：第 4895-4975 行（globalConfirmModal 之后）
**改动**：新增完整的代理配置弹窗，包含以下元素：

| 元素 | 功能 | 对应用户要求 |
|------|------|-------------|
| 弹窗标题 | "是否需要代理 API 请求？"（疑问句引导） | 要求1 |
| 说明区域 | 解释 CORS 限制原因和操作指引 | 要求1.1 |
| 启用代理勾选框 | `trpgProxyEnabled`，@change 触发保存 | 要求1.2 |
| API 地址输入框 | `trpgProxyTargetUrl`，@input 触发生成+保存 | 要求1.3 |
| 自动生成地址显示 | `trpgProxyLocalUrl`，只读展示 | 要求1.4 |
| 一键复制按钮 | `copyTrpgProxyUrl`，调用 clipboard API | 要求1.4 |
| 确认按钮 | `confirmTrpgProxy`，校验+保存+关闭 | 要求1.5 |
| 关闭按钮（X） | 直接关闭弹窗 | - |

**弹窗样式**：`z-[150]`、`bg-black/50 backdrop-blur-sm` 遮罩，白色圆角卡片，`primary-600` 确认按钮，与原项目 `globalConfirmModal` 等模态框风格完全一致。

### 12.4 `index.html` 弹窗标题和说明文字优化

**文件**：`index.html`
**位置**：第 4909 行（标题）、第 4922-4924 行（说明）
**改动**：
- 标题从陈述句"TRPG 代理设置"改为疑问句"是否需要代理 API 请求？"，更贴近用户要求的引导性提示
- 说明文字增加"CORS 限制"原因解释，明确"系统将自动生成本地代理地址供您复制"

### 12.5 `assets/js/app.js` 新增配置状态和持久化逻辑

**文件**：`assets/js/app.js`
**位置**：第 1608-1707 行
**改动**：新增以下内容：

1. **存储键常量**：`TRPG_PROXY_STORAGE_KEY = 'rphub_trpg_proxy_config'`
2. **`saveTrpgProxyConfig()` 函数**：将 `trpgProxyEnabled` 和 `trpgProxyTargetUrl` 持久化到 localStorage
3. **`loadTrpgProxyConfig()` 函数**：初始化时从 localStorage 读取配置，并自动重新生成本地代理地址（不调用 saveTrpgProxyConfig 避免循环）
4. **初始化调用**：`loadTrpgProxyConfig()` 在函数定义后立即调用

**持久化决策**：用户要求"每次弹出弹窗"，但未明确是否记住配置。基于 UX 最佳实践，决定记住配置（localStorage），弹窗每次弹出供用户确认/修改。这满足"每次弹出"要求，同时避免重复输入。

### 12.6 `assets/js/app.js` generateLocalProxyUrl 函数

**文件**：`assets/js/app.js`
**位置**：第 1621-1650 行
**改动**：新增 `generateLocalProxyUrl` 函数，根据用户输入的真实 API 地址自动生成本地代理地址：

- **火山方舟 Coding Plan**：识别 `ark.cn-beijing.volces.com` + `api/coding/v3` 路径 → 生成 `http://localhost:18527/v3`（无需 `_target` 参数）
- **其他 OpenAI 兼容 API**：提取 `url.origin` 作为 `targetBase`，生成 `http://localhost:18527/<path>?_target=<targetBase>`
- **URL 末尾斜杠处理**：`path` 去除首尾斜杠，避免 `api/coding/v3/` 与 `api/coding/v3` 不匹配

**职责分离**：`generateLocalProxyUrl` 只负责生成 URL，不负责保存。保存由 `@input` 事件中单独调用 `saveTrpgProxyConfig()` 完成，避免 early return 跳过保存的 bug。

### 12.7 `assets/js/app.js` confirmTrpgProxy 增加校验逻辑

**文件**：`assets/js/app.js`
**位置**：第 1722-1732 行
**改动**：`confirmTrpgProxy` 函数增加两项逻辑：

1. **校验**：如果 `trpgProxyEnabled` 为 true 但 `trpgProxyTargetUrl` 为空，显示警告 toast"已勾选代理但未填写 API 地址，请填写或取消勾选"，不关闭弹窗
2. **保存**：校验通过后调用 `saveTrpgProxyConfig()` 持久化配置

**边界情况处理**：避免用户勾选了代理但未填地址就确认，导致代理无效却以为已配置成功。

### 12.8 `assets/js/app.js` watch currentView 逻辑修改

**文件**：`assets/js/app.js`
**位置**：第 1745-1748 行
**改动**：进入 TRPG 视图时，不再刷新 iframe URL（保持缓存），改为弹出代理配置弹窗。

```javascript
// 修改前
} else if (newView === 'trpg') {
    isTrpgLoading.value = true;
    trpgUrl.value = `https://aisandboxgame.com/?t=${Date.now()}`;
}

// 修改后
} else if (newView === 'trpg') {
    // 每次进入 TRPG 都弹出代理配置弹窗（不刷新 iframe，保持缓存）
    showTrpgProxyModal.value = true;
}
```

**对比**：`generator` 和 `square` 视图仍使用 `?t=${Date.now()}` 刷新 URL（每次重新加载），TRPG 视图不刷新（保持缓存）。

### 12.9 `assets/js/app.js` 导出新增函数

**文件**：`assets/js/app.js`
**位置**：第 10876-10877 行
**改动**：在 return 对象中导出 `saveTrpgProxyConfig`，供模板 `@change` 和 `@input` 事件调用。

### 12.10 `index.html` 勾选框和输入框事件绑定

**文件**：`index.html`
**位置**：第 4928-4930 行（勾选框）、第 4940-4941 行（输入框）
**改动**：
- 勾选框增加 `@change="saveTrpgProxyConfig"`，勾选状态变更时立即保存
- 输入框 `@input` 改为 `generateLocalProxyUrl(); saveTrpgProxyConfig()`，同时生成地址和保存配置

### 12.11 预期产出
- 优化后的 APK（`RP-Hub-v1.7.1-debug.apk`）
- Release：重新发布 `RP-Hub v1.7.1 (Android APK)`，附上最新 APK
- 更新的 CHANGELOG.md 和 README.md
- 推送到远程仓库

### 12.12 验证清单
- [x] 首次进入 TRPG → 弹窗弹出，配置为空
- [x] 勾选代理 → 填入火山方舟地址 → 自动生成 `http://localhost:18527/v3`
- [x] 一键复制 → toast 提示"已复制到剪贴板"
- [x] 确认 → 弹窗关闭 → toast 提示
- [x] 切换到聊天 → 切回 TRPG → 弹窗再次弹出，配置已记住（localStorage 持久化）
- [x] iframe 未重新加载（v-show 缓存生效）
- [x] 勾选代理但清空地址 → 确认 → 警告 toast，弹窗不关闭（校验逻辑）
- [x] 填入其他 API（如 DeepSeek）→ 自动生成 `http://localhost:18527/v1?_target=https://api.deepseek.com`

---

## 十三、第七轮改动（2026-06-18：API 请求体 JSON 设置 + TRPG 代理改造走 RP-Hub 配置 + Bug 修复）

### 13.0 改动背景

用户提出两项增量需求：
1. **API 请求体 JSON 设置**：在「API 连接与服务」板块内新增 API 请求体 JSON 设置，满足 DeepSeek thinking_mode 和火山方舟深度思考的开关需求
2. **TRPG 代理改造**：解决上一版 TRPG 代理的乱码（返回 `034d6512-...` 等乱码内容）和延迟（400+ 秒）问题，改为走 RP-Hub 主设置的 API 配置

**硬约束**：保留成人内容注入提示词（预设）的相关设置完全不变，不允许修改、精简。

### 13.1 新增功能：API 请求体高级设置（深度思考支持）

**文件**：`assets/js/app.js` + `index.html`

#### 13.1.1 `assets/js/app.js` settings 对象新增三字段
**位置**：第 566-568 行
**改动**：在 settings 对象中新增三个字段，用于控制 API 请求体的深度思考相关参数。

```javascript
// API 请求体高级设置
enableThinking: false,           // 深度思考快捷开关
reasoningEffort: '',             // 思考强度（空字符串=不注入）
customRequestBody: ''            // 自定义请求体 JSON（最高优先级）
```

#### 13.1.2 `assets/js/app.js` 新增三个辅助函数
**位置**：第 6130-6182 行
**改动**：新增 `parseCustomRequestBody`、`validateCustomRequestBody`、`buildApiRequestBody` 三个函数。

- `parseCustomRequestBody()`：解析自定义请求体 JSON 文本，返回对象或 null
- `validateCustomRequestBody()`：校验 JSON 文本有效性，返回 `{valid, error}` 对象供模板实时显示校验状态
- `buildApiRequestBody(baseBody)`：合并基础字段、深度思考开关、思考强度、自定义 JSON，构建最终请求体

**合并优先级**：基础字段 < 深度思考开关 < 思考强度 < 自定义 JSON
**字段保护**：`model` 和 `messages` 核心字段受保护，自定义 JSON 不可覆盖

```javascript
const buildApiRequestBody = (baseBody) => {
    const result = { ...baseBody };
    if (settings.enableThinking) {
        result.thinking = { type: 'enabled' };
    }
    if (settings.reasoningEffort) {
        result.reasoning_effort = settings.reasoningEffort;
    }
    const customBody = parseCustomRequestBody();
    if (customBody) {
        for (const key of Object.keys(customBody)) {
            if (key === 'model' || key === 'messages') continue;  // 保护核心字段
            result[key] = customBody[key];
        }
    }
    return result;
};
```

#### 13.1.3 `assets/js/app.js` 主对话请求体改造
**位置**：第 5750-5755 行
**改动**：主对话请求体从硬编码 4 字段改为调用 `buildApiRequestBody(...)`，由该函数合并深度思考开关、思考强度、自定义 JSON。

```javascript
// 修改前
body: JSON.stringify({
    model: settings.model,
    messages: apiMessages,
    temperature: settings.temperature,
    stream: getEffectiveStream()
}),

// 修改后
body: JSON.stringify(buildApiRequestBody({
    model: settings.model,
    messages: apiMessages,
    temperature: settings.temperature,
    stream: getEffectiveStream()
})),
```

#### 13.1.4 `assets/js/app.js` 新增 showAdvancedApiSettings 状态变量
**位置**：第 1533 行
**改动**：新增 `showAdvancedApiSettings` 响应式变量，控制折叠区展开/收起，与项目现有 `showXxxSettings` 模式一致。

#### 13.1.5 `index.html` 新增 API 请求体高级设置折叠区
**位置**：第 2177-2246 行（插入在「API 连接与服务」板块内，模型配置区之后、生成参数区之前）
**改动**：新增折叠区，包含三个控件：
1. **深度思考快捷开关**：`v-model="settings.enableThinking"`，开启后自动注入 `thinking.type: "enabled"`
2. **思考强度下拉框**：`v-model="settings.reasoningEffort"`，支持 minimal/low/medium/high/max 五档
3. **自定义请求体 JSON 文本框**：`v-model="settings.customRequestBody"`，实时校验 JSON 有效性，显示绿色"JSON 有效"或红色"JSON 无效"徽章

**折叠交互**：使用 `v-show` + 箭头 SVG 旋转 180°，与项目现有折叠模式一致。

**参考文档**：
- DeepSeek thinking_mode: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
- 火山方舟深度思考: https://www.volcengine.com/docs/82379/2165245

### 13.2 TRPG 代理改造：走 RP-Hub API 配置

**文件**：`android-patches/MainActivity.java` + `assets/js/app.js` + `index.html`

#### 13.2.1 `android-patches/MainActivity.java` 新增 ProxyConfigInterface
**位置**：第 64-78 行
**改动**：新增 `cachedApiUrl`/`cachedApiKey` 配置缓存字段和 `ProxyConfigInterface` 内部类，通过 `@JavascriptInterface setApiConfig(apiUrl, apiKey)` 方法接收 JS 层推送的 RP-Hub 主设置。

```java
private volatile String cachedApiUrl = "";
private volatile String cachedApiKey = "";

private class ProxyConfigInterface {
    @android.webkit.JavascriptInterface
    public void setApiConfig(String apiUrl, String apiKey) {
        cachedApiUrl = apiUrl != null ? apiUrl : "";
        cachedApiKey = apiKey != null ? apiKey : "";
    }
}
```

#### 13.2.2 `android-patches/MainActivity.java` 注册 JavascriptInterface
**位置**：第 120 行
**改动**：在 `registerDownloadListenerIfNeeded` 中注册 `AndroidProxy` JavascriptInterface。

```java
webView.addJavascriptInterface(new ProxyConfigInterface(), "AndroidProxy");
```

#### 13.2.3 `android-patches/MainActivity.java` serve 方法改造
**位置**：第 168-277 行
**改动**：代理服务器使用 `cachedApiUrl` 构建目标 URL，提取 endpoint（去掉 `/v1`/`/v3` 版本前缀），用 `cachedApiKey` 替换 Authorization 头，请求体原样转发（保留 model 字段）。

- 检查 `cachedApiUrl` 是否可用，不可用返回 503 错误
- 构建目标 URL：`cachedApiUrl + endpoint`
- 使用 `cachedApiKey` 设置 `Authorization: Bearer`
- 请求体原样转发（TRPG 网页内的 model 字段直接生效）

#### 13.2.4 `assets/js/app.js` 新增 pushApiConfigToNative 函数
**位置**：第 1625 行
**改动**：新增 `pushApiConfigToNative` 函数，调用 `window.AndroidProxy.setApiConfig(apiUrl, apiKey)` 推送配置到原生层。watch `settings.apiUrl` 和 `settings.apiKey` 变化时自动推送，初始化时 `nextTick` 推送一次。

#### 13.2.5 `assets/js/app.js` 弹窗状态管理
**位置**：第 1617 行
**改动**：新增 `trpgProxyModalDismissed`（内存变量，App 重启后重置）和 `trpgProxyDismissThisSession`（"本次不再提示"勾选框状态）。`confirmTrpgProxy` 函数处理"本次不再提示"逻辑。

#### 13.2.6 `assets/js/app.js` watch currentView 逻辑修改
**位置**：第 1645-1649 行
**改动**：进入 TRPG 视图时，检查 `trpgProxyModalDismissed` 状态，未 dismissed 则弹出说明弹窗。

#### 13.2.7 `index.html` TRPG 弹窗 UI 改造
**位置**：第 4978 行起
**改动**：弹窗标题改为"TRPG 模式说明"，移除 API 地址输入框和复制按钮，改为提示说明区域（指导在 TRPG 网页内配置自定义供应商，API 地址填 `http://localhost:18527/v1`），新增"本次不再提示"勾选框。

#### 13.2.8 `assets/js/app.js` 旧函数清理
**改动**：删除上一版 TRPG 代理相关函数：`TRPG_PROXY_STORAGE_KEY`、`generateLocalProxyUrl`、`saveTrpgProxyConfig`、`loadTrpgProxyConfig`、`copyTrpgProxyUrl`、`trpgProxyEnabled`、`trpgProxyTargetUrl`、`trpgProxyLocalUrl`。

### 13.3 Bug 修复

#### 13.3.1 代理乱码修复
**文件**：`android-patches/MainActivity.java`
**位置**：第 328-340 行（`copyResponseHeaders` 方法）
**问题**：`copyResponseHeaders` 透传了 `Content-Encoding: gzip` 头，但 `HttpURLConnection` 默认自动解压响应体，导致客户端看到 gzip 头却收到明文，二次解压失败产生乱码（如 `034d6512-7ed0-4d68-8fc9-162b582facc1`）。
**修复**：在 `copyResponseHeaders` 中过滤 `Content-Encoding` 头。

```java
if (entry.getKey() != null &&
    !"Content-Type".equalsIgnoreCase(entry.getKey()) &&
    !"Content-Length".equalsIgnoreCase(entry.getKey()) &&
    !"Transfer-Encoding".equalsIgnoreCase(entry.getKey()) &&
    !"Content-Encoding".equalsIgnoreCase(entry.getKey())) {  // 新增过滤
    // ...
}
```

#### 13.3.2 代理延迟修复（400+ 秒 → 正常）
**文件**：`android-patches/MainActivity.java`
**位置**：第 258-262 行、第 214 行
**问题**：非 SSE 响应使用 `readFully()` 完全缓冲阻塞读取，配合 180 秒 `readTimeout`，导致 400 秒延迟。
**修复**：统一使用 `newChunkedResponse` 流式透传，移除 `readFully` 阻塞读取，降低 `readTimeout` 到 120 秒。

```java
// 修改前：readFully 阻塞读取 + 180 秒超时
String body = readFully(inputStream);
Response response = newFixedLengthResponse(Response.Status.lookup(responseCode), contentType, body);
conn.setReadTimeout(180000);

// 修改后：统一流式透传 + 120 秒超时
Response response = newChunkedResponse(
    Response.Status.lookup(responseCode), contentType, inputStream);
conn.setReadTimeout(120000);
```

### 13.4 保留功能

**成人内容注入提示词（预设）功能完整保留**，包括：
- `presets` 响应式数组与持久化逻辑
- 预设注入到请求消息逻辑
- 内置预设定义：`roleplay_hub_default`、4 个破限预注入预设、`色情内容增强`（NSFW）、`防抢话`、`防神化`
- `buildApiRequestBody` 仅作用于 `thinking`/`reasoning_effort`/自定义 JSON 字段，**不触及 `messages` 数组**（受保护），因此预设注入的 messages 内容不受影响

### 13.5 预期产出
- 优化后的 APK（`app-debug.apk`）
- Release：发布 `RP-Hub v1.7.1 v2 (Android APK)`，附上最新 APK
- 更新的 CHANGELOG.md 和 README.md
- 推送到远程仓库

### 13.6 验证清单
- [ ] API 请求体高级设置折叠区可正常展开/折叠
- [ ] 深度思考开关可切换，开启后请求体包含 `thinking.type: "enabled"`
- [ ] 思考强度下拉框可选，选择后请求体包含 `reasoning_effort` 字段
- [ ] 自定义 JSON 文本框可输入并实时校验有效性
- [ ] 自定义 JSON 中包含 `model` 或 `messages` 字段时被保护不覆盖
- [ ] TRPG 模式弹窗显示"TRPG 模式说明"，含"本次不再提示"勾选框
- [ ] 勾选"本次不再提示"后，本次 App 运行期间不再弹出
- [ ] TRPG 代理请求不再出现乱码
- [ ] TRPG 代理请求延迟恢复正常（不再 400+ 秒）
- [ ] 成人内容注入预设功能正常（预设列表、启用/禁用、注入到请求）

---

## 十四、第八轮改动（2026-06-18：TRPG 代理字节透传修复 + 高级设置作用域文档化 + MCP HTTP 工具导入）

### 14.0 改动背景

用户提出三项增量需求：
1. **TRPG 代理乱码根治**：TRPG 模式内 agent 调用工具后下一轮输出即变成乱码，前几轮未实质性修复，需保持原有需求结构
2. **高级设置可用性验证**：检查 RP-Hub 设置页「API 请求体高级设置」是否真的可用，明确作用域
3. **MCP 工具接入**：调研工具栏内 Tavily 等是否是 MCP 包装；扩展该部分，新增以 JSON 形式导入 HTTP MCP 工具的设置接口

**硬约束**：保留成人内容注入提示词（预设）的相关设置完全不变，不允许修改、精简。MCP 工具仅对 RP-Hub 主聊天生效，对 TRPG 模式不生效。

### 14.1 A 组：TRPG 代理字节透传修复（`android-patches/MainActivity.java`）

#### 14.1.1 乱码根因定位

经与官方 `aisandboxgame@v3.7.9` 源码（`js/services/aiAdapters.js#L2059-L2087`）交叉验证，确认乱码根因为 NanoHTTPD `parseBody()` 的 ISO-8859-1 解码 + `getBytes("UTF-8")` 重编码导致的 latin-1 → UTF-8 双重编码。

**为什么第一轮看不到、工具调用后下一轮才暴露**：
- 第一轮 body 中文密度低（玩家单句输入 + system prompt 多为英文 ReAct DSML），模型容错把受损字节当噪声丢弃
- 第二轮 follow-up 请求的 `messages[].role:'tool'.content` 与 `tool_calls[].function.arguments` 中注入了大量中文长字符串（NPC 档案、状态摘要、世界书片段），双重编码后模型 context 里看到的就是 mojibake

#### 14.1.2 字节透传改造

**文件**：`android-patches/MainActivity.java` + `android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java`（手工同步）

**改动核心**：完全弃用 `session.parseBody(...).get("postData")`，改为从 `session.getInputStream()` 直接读字节，并按 chunked streaming 模式写出到 `HttpURLConnection`。

```java
// 删除：Map<String, String> params = new HashMap<>(); session.parseBody(params);
// 删除：String postData = params.get("postData"); byte[] body = postData.getBytes("UTF-8");

// 新增：字节透传逻辑
if (method == Method.POST || method == Method.PUT || method == Method.PATCH) {
    conn.setDoOutput(true);
    String contentLengthHeader = session.getHeaders().get("content-length");
    int contentLength = -1;
    if (contentLengthHeader != null) {
        try { contentLength = Integer.parseInt(contentLengthHeader.trim()); }
        catch (NumberFormatException ignore) { contentLength = -1; }
    }
    conn.setChunkedStreamingMode(0);
    InputStream clientIn = session.getInputStream();
    try (OutputStream upstreamOut = conn.getOutputStream()) {
        byte[] buf = new byte[8192];
        long total = 0;
        while (true) {
            int toRead = (contentLength >= 0)
                ? (int) Math.min(buf.length, contentLength - total)
                : buf.length;
            if (toRead <= 0) break;
            int n = clientIn.read(buf, 0, toRead);
            if (n <= 0) break;
            upstreamOut.write(buf, 0, n);
            total += n;
            if (contentLength >= 0 && total >= contentLength) break;
        }
        upstreamOut.flush();
    }
}
```

**为什么 chunked 而不是固定长度**：经过中间任何字节再编码后长度都不可信，chunked 是行业最稳方案。

#### 14.1.3 `readFully` 死代码处理

保留死代码不强制移除（与项目历史「保留向后兼容」一致），仅在头注释加一行：`// @Deprecated 已废弃；自第十一轮起所有响应统一走 newChunkedResponse 流式透传`。

#### 14.1.4 预期行为

- 工具调用后下一轮 follow-up 请求中文不再经过 latin-1 → UTF-8 双重编码 → 上游模型看到的是原始 UTF-8 中文 → 乱码消除
- 去掉 `parseBody` 的 1MB 临时文件落盘 → 大请求体不再因磁盘 IO 抖动放大延迟
- 头方向已在第十一轮过滤 `Content-Encoding`，请求方向去字符串中转后，整链路对中文字节完全透明

### 14.2 B 组：高级设置静态可用性验证（仅文档同步，无代码改动）

#### 14.2.1 静态调用链审计结果

| 调用点 | 文件位置 | 是否经过 buildApiRequestBody | 备注 |
|--------|----------|------------------------------|------|
| 主聊天 `chat/completions` | `app.js#L5824` | ✅ 是 | 用户配置生效 |
| UI 模板分析 `chat/completions` | `app.js#L4567-L4583` | ❌ 否（硬编码） | 设计意图：UI 变量分析无需 thinking |
| 向量嵌入 `embeddings` | `app.js#L6447-L6457` | ❌ 否 | 嵌入端点不支持 thinking 字段 |
| 模型列表 `fetchModels` | `app.js#L4030-L4045` | — | GET 无请求体 |
| 状态检查 `checkApiStatus` | `app.js#L4091-L4120` | — | GET 无请求体 |

#### 14.2.2 高级设置作用域

| 作用范围 | 是否生效 | 说明 |
|----------|----------|------|
| RP-Hub 主聊天 chat/completions | ✅ 生效 | 通过 `buildApiRequestBody` 注入 thinking/reasoning_effort/自定义 JSON |
| UI 模板分析 | ❌ 不生效 | 硬编码请求体，设计意图无需 thinking |
| 向量嵌入 embeddings | ❌ 不生效 | 嵌入端点协议级不支持 thinking 字段 |
| TRPG iframe 内 aisandboxgame 请求 | ❌ 不生效 | aisandbox iframe 内 fetch 跨 origin 不受 RP-Hub 控制；代理仅原样转发请求体 |

**结论**：高级设置功能本身可用且持久化正常，但**作用域仅限 RP-Hub 主聊天**。用户若需在 TRPG 模式启用深度思考，需在 aisandbox 网页内的 API 设置或 system prompt 中自行配置。

### 14.3 C 组：MCP HTTP 工具接入（核心新增功能）

#### 14.3.1 设计原则与边界

- **传输**：MCP Streamable HTTP transport（2025-03-26 规范，单端点 POST 返回 JSON 或 SSE）
- **JSON 输入格式**：MCP server 连接信息（url + headers + protocolVersion），不是直接列 tools 数组
- **生命周期**：导入时立刻执行 `initialize` + `tools/list` 抓取工具清单缓存到本地；用户「刷新工具列表」按钮重新拉取
- **AI 调用**：复用现有 `<tool_*>` 标签机制，新标签格式 `<tool_mcp_<serverShortId>_<toolName>:argsJSON>`（`add` / `cover` 后缀同现有约定）
- **作用范围**：**仅 RP-Hub 主聊天**（同 4 个内建工具），TRPG iframe 不受影响
- **工程归一**：把 MCP 工具与 4 个内建工具同样放入 `activeTools` 数组，作为 `type='mcp_http'` 的新工具类型

#### 14.3.2 数据结构（`assets/js/app.js`）

新增常量：
```javascript
const ACTIVE_TOOL_MCP_HTTP_TYPE = 'mcp_http';
const ACTIVE_TOOL_MCP_DEFAULT_DESCRIPTION = '通过 MCP 协议调用远程工具服务器';
const ACTIVE_TOOL_MCP_DEFAULT_DISPLAY_DESCRIPTION = 'MCP HTTP 工具';
const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_CLIENT_INFO = { name: 'rp-hub', version: '1.7.1' };
const MCP_REQUEST_TIMEOUT_MS = 60000;
```

新增 `createDefaultMcpHttpTool` 工厂函数（含 `mcpConfig`/`mcpSessionId`/`mcpTools`/`mcpLastFetchedAt`/`mcpLastError` 字段）。

#### 14.3.3 MCP 协议层（`assets/js/app.js`）

新增 5 个协议函数：
- `mcpRpcCall(tool, method, params, signal)` - 通用 JSON-RPC 调用，支持 application/json 和 text/event-stream 响应
- `mcpInitialize(tool, signal)` - 握手 + notifications/initialized 通知
- `mcpListTools(tool, signal)` - 拉取工具清单
- `mcpCallTool(tool, toolName, args, signal)` - 调用具体工具，返回 {text, isError, raw}
- `mcpRefreshTool(tool, signal)` - 一键刷新（initialize → tools/list）

#### 14.3.4 UI 入口与导入流程

**`index.html` 改动**：
- 工具列表头部新增「+ 添加 MCP 工具」按钮
- 工具列表渲染对 `tool.type === 'mcp_http'` 有专属分支（显示 URL、工具数量、错误信息、刷新/删除按钮）
- 新增 MCP 工具导入弹窗（工具命名输入、JSON 文本框、校验提示、测试连接/导入/取消按钮）

**`assets/js/app.js` 改动**：
- 新增 `showMcpToolImport`/`mcpImportInput`/`mcpImportError` 状态变量
- 新增 `openMcpToolImport`/`parseMcpImportJson`/`testMcpConnection`/`confirmMcpToolImport`/`refreshMcpTool`/`removeMcpTool` 函数
- 新增 `extractMcpRemoteConfig` 辅助函数：从 mcp-remote 桥接的 stdio args 中提取 HTTP URL 和 headers
- `parseMcpImportJson` 增强支持两种 JSON 输入格式：
  - **① 扁平格式**（HTTP transport）：`{ url, headers, protocolVersion }`
  - **② mcpServers 嵌套格式**（Claude Desktop / Cursor 通用）：`{ mcpServers: { <name>: { ... } } }`
    - 自动识别 HTTP transport（有 url 字段）→ 直接提取
    - 自动识别 mcp-remote 桥接（command+args 含 mcp-remote）→ 从 args 提取 URL 和 `--header`
    - 纯 stdio 本地命令不支持，给出明确错误提示
    - `${VAR}` 环境变量语法当字面值处理（浏览器无环境变量）
    - URL 自动清理反引号/引号包裹

#### 14.3.5 AI 调用：标签调度集成

- **标签格式**：`<tool_mcp_<serverShortId>_<toolName>:argsJSON>`（`serverShortId` 取 `tool.id` 末 6 位）
- **系统提示拼装**：`buildActiveToolSystemPrompt` 对 `mcp_http` 类型工具展开为多个 `<tool_mcp_<sid>_<name>>` 子条目，每条带 description + inputSchema 摘要
- **标签拦截**：`findActiveToolCallsInText` 支持 MCP 子工具的 add/cover 标签检测，添加 `mcpSubToolName` 字段
- **结果格式化**：`formatActiveToolResultContext` 添加 MCP 结果格式化分支，使用 `<mcp_result>` 标签包裹
- **调度执行**：`runActiveToolCallSafely` 添加 MCP 分支，调用 `mcpCallTool`

#### 14.3.6 持久化与回填

- `activeTools` 已纳入 `saveData()`/`loadData()` 持久化（IndexedDB），新字段自动随之保存
- 启动时不主动拉取 `tools/list`（避免开机就发请求），用户在工具卡上手动点「↻ 刷新」或在导入时自动拉取
- `normalizeActiveTool` 添加 MCP 字段保留逻辑，确保工具规范化时不丢失

### 14.4 保留功能

**成人内容注入提示词（预设）功能完整保留**，包括：
- `presets` 响应式数组与持久化逻辑
- 预设注入到请求消息逻辑
- 内置预设定义：`roleplay_hub_default`、4 个破限预注入预设、`色情内容增强`（NSFW）、`防抢话`、`防神化`
- 本轮所有改动均不触及 `presets` 数组、注入逻辑、内置 NSFW 预设

**TRPG 代理保留**：
- 仍走 `cachedApiUrl + endpoint`、`cachedApiKey` 替换 Authorization、aisandbox 请求体保留 model 字段
- 仅请求体读取方式从字符串中转改为字节透传

### 14.5 文件改动清单

| 文件 | 改动类型 | 改动内容 |
|------|----------|----------|
| `android-patches/MainActivity.java` | 修改 | `serve` 方法请求体读取改为字节透传；`readFully` 加 `@Deprecated` 注释 |
| `android/app/src/main/java/com/luzzymeow/rphub/MainActivity.java` | 修改 | 与 `android-patches/MainActivity.java` 同步（手工复制） |
| `assets/js/app.js` | 修改 | 新增 6 个 MCP 常量；新增 `createDefaultMcpHttpTool` 工厂；新增 5 个 MCP 协议函数；新增 3 个 MCP UI 状态 + 6 个 MCP UI 函数；调度器分支；工具说明 prompt 拼装；setup() return 导出更新；`normalizeActiveTool` MCP 字段保留 |
| `index.html` | 修改 | 工具列表新增「+ 添加 MCP 工具」按钮；MCP 工具列表卡片渲染分支；新增 MCP 工具导入弹窗 |
| `CHANGELOG.md` | 修改 | 新增「第十四轮改动」节 |
| `README.md` | 修改 | 第 6 节末尾追加「高级设置作用域」说明；新增第 7 节「MCP HTTP 工具导入」介绍 |

### 14.6 验证清单

- [ ] TRPG 代理不再调用 `session.parseBody(params)`
- [ ] TRPG 代理使用 `session.getInputStream()` + `setChunkedStreamingMode(0)` 字节透传
- [ ] `android-patches/` 与 `android/app/src/main/java/com/luzzymeow/rphub/` 两份 MainActivity.java 字节一致
- [ ] 高级设置（enableThinking/reasoningEffort/customRequestBody）仅作用于主聊天 chat/completions
- [ ] 工具列表头部出现「+ 添加 MCP 工具」按钮
- [ ] MCP 工具导入弹窗结构完整（命名输入、JSON 文本框、测试连接/导入/取消按钮）
- [ ] MCP 工具列表卡片显示 URL、工具数量、刷新/删除按钮
- [ ] `buildActiveToolSystemPrompt` 对 mcp_http 工具展开为多个子条目
- [ ] `findActiveToolCallsInText` 支持 MCP 子工具标签检测
- [ ] `runActiveToolCallSafely` 调度器有 MCP 分支
- [ ] setup() return 包含所有 MCP 导出
- [ ] 成人内容注入预设功能完整保留（预设列表、启用/禁用、注入到请求）

---

## 十五、第九轮改动（2026-06-18：SKILL 工具系统扩展）

### 15.0 改动背景

用户提出在现有工具系统（4 内置工具 + MCP HTTP 工具）基础上，扩展支持 SKILL 导入和手动新建，实现二级分类、角色卡按需启用、统一标签接口、文件阅读能力。

**硬约束**：保留成人内容注入提示词（预设）的相关设置完全不变，不允许修改、精简。SKILL 工具仅对 RP-Hub 主聊天生效，对 TRPG 模式不生效。

### 15.1 新增功能

1. **SKILL 工具类型**：新增 `skill` 工具类型，支持导入和手动新建 SKILL 提示词包
2. **三种 SKILL 导入方式**：
   - GitHub 仓库导入：支持 `https://github.com/{owner}/{repo}`、`/tree/{branch}`、子目录路径，完整下载仓库内容
   - ZIP 压缩包导入：识别最外层 SKILL.md，完整解压所有文件
   - 手动新建：内置文件管理器，支持新建文件夹、子文件夹、.md 文件
3. **SKILL 文件阅读工具**（`tool_skill_readfile`）：内置工具，AI 可读取 SKILL 目录下的配套文件（如 references/ 内的资料）
4. **二级分类 UI**：工具列表分为「内置工具」「MCP 工具」「SKILL」三组，分组标题分隔
5. **角色卡按需启用**：SKILL 和 MCP 工具可设置「所有角色卡可用」或「自定义角色卡」，内置工具保持全局启用
6. **统一标签协议**：SKILL 工具复用 `<tool_skill_<sid>_add:args>` 标签协议，与内置工具走同一调用链
7. **JSZip 库引入**：通过 CDN 引入 JSZip 3.10.1 支持 ZIP 解压

### 15.2 技术细节

- **SKILL 工具存储**：存储于 `activeTools` 数组，`skillConfig` 字段保存 SKILL.md 内容和配套文件列表
- **角色卡过滤**：通过 `getEnabledActiveToolsForCurrentCharacter()` 实现，内置工具不受过滤影响
- **GitHub 导入**：使用 GitHub API（`api.github.com`）获取文件树，`raw.githubusercontent.com` 下载文件内容
- **GitHub 导入过滤**：自动跳过 `.git/`、`node_modules/`、`.github/`、`.vscode/`、`.idea/`、`dist/`、`build/`、`__pycache__/`、`.pytest_cache/` 等无关目录
- **SKILL 执行机制**：提示词注入（注入 SKILL.md 内容）+ 文件阅读（`<tool_skill_readfile_add:skill_name/file_path>`）
- **SKILL 标签格式**：`<tool_skill_<serverShortId>_add:args>` / `<tool_skill_<serverShortId>_cover:args>`，serverShortId 取工具 id 末 6 位
- **ZIP 导入识别**：若 ZIP 根目录无 SKILL.md 但一级子目录有，取该子目录作为 skill 根
- **手动新建默认模板**：创建 SKILL.md 模板，包含名称、描述、触发条件、工作流程、注意事项等基本结构

### 15.3 文件改动

| 文件 | 改动内容 |
|------|----------|
| `assets/js/app.js` | 新增 SKILL 常量、工厂函数、normalizeActiveTool 扩展、角色卡过滤函数、buildActiveToolSystemPrompt 扩展、skill 标签生成、findActiveToolCallsInText 扩展、runActiveToolCallSafely 扩展、formatActiveToolResultContext 扩展、GitHub 导入、ZIP 导入、手动新建、文件管理器函数、return 导出更新 |
| `index.html` | JSZip CDN 引入、工具列表二级分类 UI、SKILL 导入弹窗（三种方式 Tab）、SKILL 文件管理器弹窗、角色卡启用配置 UI |
| `CHANGELOG.md` | 本节（第十五轮改动记录） |
| `README.md` | 新增第 8 节「SKILL 工具系统」 |

### 15.4 保留功能

- **成人内容注入预设完整保留**：`presets` 数组、注入逻辑、内置 NSFW 预设均未修改
- **TRPG 代理机制不受影响**：SKILL 工具仅作用于 RP-Hub 主聊天，TRPG iframe 不受影响
- **现有工具保留**：4 个内置工具（vector/keyword/web/world）功能不变；MCP 工具新增 `allowedCharacterUuids` 字段，默认空数组兼容

### 15.5 验证清单

- [ ] 工具列表显示三个分组（内置工具 / MCP 工具 / SKILL）
- [ ] 「+ 添加 SKILL」按钮可见且可点击
- [ ] GitHub URL 导入：支持 `https://github.com/user/repo` 和 `/tree/branch/subdir` 格式
- [ ] GitHub 导入后，skill 工具卡片显示 skill 名、文件数、来源
- [ ] ZIP 上传导入：识别最外层 SKILL.md，完整解压
- [ ] 手动新建：可创建文件夹、子文件夹、.md 文件，可编辑内容
- [ ] SKILL 工具启用后，AI 在系统提示中能看到 skill 说明
- [ ] AI 输出 `<tool_skill_xxx_add:args>` 标签时，系统注入 SKILL.md 内容
- [ ] AI 输出 `<tool_skill_readfile_add:skill_name/file_path>` 时，系统返回文件内容
- [ ] skill/mcp 工具编辑弹窗显示「角色卡启用范围」配置
- [ ] 设置为「自定义角色卡」后，未选中的角色卡看不到该工具
- [ ] 内置工具不受角色卡过滤影响
- [ ] 成人内容注入预设功能完整保留

---

## 十六、第十轮改动（2026-06-18：代码自检修复 + README 重构 + 仓库改名）

### 16.0 改动背景

SKILL 工具系统扩展完成后，进行全局代码自检，针对边界情况和不完善项进行手术级修复。同时根据用户要求重构 README 文档、改名仓库、发布新版 release。

### 16.1 代码自检修复（3 项原子化修复）

#### 修复 1：GitHub 导入 SKILL.md 检测优先级（边界情况）

**问题**：`importSkillFromGithub` 中 `fileContents.find(f => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))` 使用 OR 条件，若嵌套 SKILL.md（如 `references/SKILL.md`）在数组中先于根目录 SKILL.md 出现，会被误选为主 SKILL.md。

**修复**：改为优先匹配根目录 `SKILL.md`，其次回退到嵌套 SKILL.md：
```javascript
const skillMdFile = fileContents.find(f => f.path === 'SKILL.md')
    || fileContents.find(f => f.path.endsWith('/SKILL.md'));
```

**影响范围**：`assets/js/app.js` 第 8072-8074 行

#### 修复 2：GitHub 导入二进制文件内容损坏（边界情况 + 优化）

**问题**：`fetchGithubFile` 对所有文件使用 `resp.text()` 下载，二进制文件（图片、PDF 等）经 `.text()` 解码后内容损坏，虽然 `tool_skill_readfile` 会拒绝读取二进制文件，但损坏的内容仍被持久化到 IndexedDB，浪费存储空间。

**修复**：导入时先判断 `isSkillFileText(relPath)`，二进制文件跳过内容下载（存储空字符串 + `node.size` 作为 size），节省带宽和存储：
```javascript
const isText = isSkillFileText(relPath);
const content = isText ? await fetchGithubFile(...) : '';
```

**影响范围**：`assets/js/app.js` 第 8058-8070 行

#### 修复 3：ZIP 导入二进制文件内容损坏（边界情况 + 优化）

**问题**：`importSkillFromZip` 中 `entry.async('string')` 对所有文件解压，二进制文件经字符串解码后内容损坏，同样浪费存储。

**修复**：与 GitHub 导入一致，二进制文件跳过内容解压：
```javascript
const isText = isSkillFileText(relPath);
const content = isText ? await entry.async('string') : '';
```

**影响范围**：`assets/js/app.js` 第 8153-8168 行

### 16.2 README.md 完全重构

**改动内容**：
- 删除旧版 README，完全重写
- 首部附 Z.AI / 智谱清言 LOGO（从官网 `https://z.ai/` 提取，URL：`https://z-cdn.chatglm.cn/z-ai/static/logo.svg`）
- 醒目位置标注「项目状态：测试阶段（Beta）」
- 二创来源声明：RP-Hub（[STA1N156/RP-Hub](https://github.com/STA1N156/RP-Hub)）和 AI Sandbox Game（[hayowei/aisandboxgame](https://github.com/hayowei/aisandboxgame)）的官方仓库链接与作者
- Coding 模型声明：GLM-5.2（附智谱清言 / Z.AI LOGO）
- 功能概览表格（8 项增强功能）
- SKILL 工具系统详解（三种导入方式、执行机制、二级分类、角色卡按需启用）
- TRPG 模式、API 高级设置、MCP 工具导入说明
- 快速开始、构建指南、差异对比、已知限制、目录结构、致谢

### 16.3 仓库改名

- **旧名称**：`LuzzyMeow/RP-Hub-LuzzyAPP`
- **新名称**：`LuzzyMeow/Luzzy-RpTRPG`
- 通过 GitHub API 执行仓库改名操作

### 16.4 文件改动

| 文件 | 改动类型 | 改动内容 |
|------|----------|----------|
| `assets/js/app.js` | 修改 | 3 项边界情况修复（SKILL.md 优先级、GitHub/ZIP 二进制文件处理） |
| `README.md` | 重写 | 完全重构，附 Z.AI LOGO，二创来源声明，GLM-5.2 Coding 模型，测试阶段声明 |
| `CHANGELOG.md` | 修改 | 本节（第十六轮改动记录） |

### 16.5 保留功能

- **成人内容注入预设完整保留**：`presets` 数组、注入逻辑、内置 NSFW 预设均未修改
- **TRPG 代理机制不受影响**
- **SKILL 工具系统功能不受影响**：3 项修复仅优化边界情况处理，不改变正常流程
- **现有内置工具和 MCP 工具功能不变**

### 16.6 验证清单

- [ ] GitHub 导入含嵌套 SKILL.md 的仓库时，根目录 SKILL.md 被正确选为主文件
- [ ] GitHub 导入含二进制文件的仓库时，二进制文件不报错，size 正确记录
- [ ] ZIP 导入含二进制文件的压缩包时，二进制文件不报错，size 正确记录
- [ ] README.md 首部 Z.AI LOGO 正常显示
- [ ] README.md 测试阶段声明可见
- [ ] README.md 二创来源声明包含 RP-Hub 和 aisandboxgame 链接
- [ ] README.md Coding 模型声明包含 GLM-5.2 和智谱清言 LOGO
- [ ] 成人内容注入预设功能完整保留

---

**最后更新**：2026-06-18
**维护者**：LuzzyMeow
