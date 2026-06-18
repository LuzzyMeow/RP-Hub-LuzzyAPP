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

**最后更新**：2026-06-18
**维护者**：LuzzyMeow
