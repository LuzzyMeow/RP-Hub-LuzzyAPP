package com.luzzymeow.rphub;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.DownloadListener;

import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * RP-Hub 主 Activity。
 *
 * 关键定制：
 * 1. DownloadListener：万相广场 iframe 内下载（角色卡/UI模板）转发到 JS 层自动导入
 * 2. ApiProxyServer：本地 HTTP 代理服务器，为 TRPG iframe 内的 API 请求绕过 CORS
 *
 * === ApiProxyServer 设计原理 ===
 *
 * 问题背景：
 * - TRPG 模式通过 iframe 嵌入 aisandboxgame.com（在线纯前端页面）
 * - iframe 内的 fetch 调用外部 API（如火山方舟）会被浏览器 CORS 策略拦截
 * - CapacitorHttp 只 patch 主页面的 fetch，iframe 内的 fetch 不受影响
 * - shouldInterceptRequest 无法获取 POST 请求体，无法用于 API 转发
 *
 * 解决方案：
 * - 在 localhost:18527 启动 NanoHTTPD 微型 HTTP 代理服务器
 * - 用户在 TRPG 网页内配置 API 地址为 http://localhost:18527
 * - 代理服务器接收请求，转发到实际 API 服务器，添加 CORS 头
 *
 * URL 映射规则（自动识别，用户无需手动指定目标）：
 * - /v3/* → https://ark.cn-beijing.volces.com/api/coding/v3/*（火山方舟 coding plan）
 * - /v1/* → 需要通过 _target 参数指定目标，或默认火山方舟
 * - /<其他>/* → 需要通过 _target 参数指定目标
 *
 * 自定义目标（支持任意 OpenAI 兼容 API）：
 * - http://localhost:18527/v1/chat/completions?_target=https://api.deepseek.com
 *   → https://api.deepseek.com/v1/chat/completions
 *
 * 抗更新能力：
 * - 代理机制完全在 Android 原生层，不依赖 aisandboxgame.com 的代码
 * - aisandboxgame.com 更新后，只要仍使用 fetch 调用 OpenAI 兼容端点，代理就有效
 * - 不修改 aisandboxgame.com 的任何代码，只通过本地代理转发请求
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "RP-Hub";
    private static final int PROXY_PORT = 18527;
    private boolean downloadListenerRegistered = false;
    private ApiProxyServer proxyServer;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerDownloadListenerIfNeeded();
        startProxyServerIfNeeded();
    }

    @Override
    public void onResume() {
        super.onResume();
        registerDownloadListenerIfNeeded();
        startProxyServerIfNeeded();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopProxyServer();
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
                String js = String.format(
                    "try{window.RPHubAutoImport&&window.RPHubAutoImport(%s,%s);}catch(e){console.error('[RP-Hub] AutoImport failed:',e);}",
                    jsString(url), jsString(mimetype)
                );
                webView.post(() -> webView.evaluateJavascript(js, null));
                Log.i(TAG, "Download forwarded to JS: " + url);
            }
        });
        downloadListenerRegistered = true;
        Log.i(TAG, "DownloadListener registered");
    }

    private void startProxyServerIfNeeded() {
        if (proxyServer != null && proxyServer.isAlive()) return;
        try {
            proxyServer = new ApiProxyServer();
            proxyServer.start();
            Log.i(TAG, "API Proxy Server started on port " + PROXY_PORT);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start API Proxy Server", e);
        }
    }

    private void stopProxyServer() {
        if (proxyServer != null) {
            proxyServer.stop();
            proxyServer = null;
            Log.i(TAG, "API Proxy Server stopped");
        }
    }

    /**
     * 本地 HTTP 代理服务器。
     *
     * 自动识别 API 路径前缀，转发到对应的目标 API 服务器：
     * - /v3/* → 火山方舟 coding plan（ark.cn-beijing.volces.com/api/coding/v3）
     * - /v1/* + _target 参数 → 自定义目标
     * - 其他 + _target 参数 → 自定义目标
     *
     * 用户在 TRPG 网页内配置：
     * - 火山方舟：API 地址填 http://localhost:18527/v3
     * - DeepSeek：API 地址填 http://localhost:18527/v1?_target=https://api.deepseek.com
     * - 其他：API 地址填 http://localhost:18527/<路径>?_target=<目标地址>
     */
    private class ApiProxyServer extends NanoHTTPD {

        // 火山方舟 coding plan API 基础地址
        private static final String VOLCANO_ARK_BASE = "https://ark.cn-beijing.volces.com/api/coding";

        public ApiProxyServer() {
            super(PROXY_PORT);
        }

        @Override
        public Response serve(IHTTPSession session) {
            // OPTIONS 预检请求直接返回 CORS 头
            if (session.getMethod() == Method.OPTIONS) {
                Response response = newFixedLengthResponse(Response.Status.OK, "text/plain", "");
                addCorsHeaders(response);
                return response;
            }

            try {
                String uri = session.getUri();
                Method method = session.getMethod();

                // 解析请求体（POST/PUT/PATCH 的 body）
                Map<String, String> params = new HashMap<>();
                session.parseBody(params);

                // 确定目标 API 基础地址
                String targetBase = resolveTargetBase(session, uri);
                if (targetBase == null) {
                    Response errResp = newFixedLengthResponse(Response.Status.BAD_REQUEST,
                        "application/json",
                        "{\"error\":\"Cannot determine API target. Use /v3 for Volcano Ark, or add _target parameter.\"}");
                    addCorsHeaders(errResp);
                    return errResp;
                }

                // 构建目标 URL（移除 _target 参数）
                String targetUrl = targetBase + uri;
                String queryString = buildQueryString(session);

                if (queryString != null && !queryString.isEmpty()) {
                    targetUrl += "?" + queryString;
                }

                Log.i(TAG, "Proxy: " + method + " " + uri + " -> " + targetUrl);

                // 转发请求
                URL url = new URL(targetUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod(method.name());
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(180000); // 3 分钟超时，适配长对话
                conn.setDoInput(true);

                // 复制请求头（排除不需要转发的头）
                for (Map.Entry<String, String> header : session.getHeaders().entrySet()) {
                    String key = header.getKey().toLowerCase();
                    if ("host".equals(key) || "connection".equals(key) ||
                        "content-length".equals(key) || "accept-encoding".equals(key) ||
                        "origin".equals(key) || "referer".equals(key)) {
                        continue;
                    }
                    conn.setRequestProperty(header.getKey(), header.getValue());
                }

                // 写入请求体（POST/PUT/PATCH）
                if (method == Method.POST || method == Method.PUT || method == Method.PATCH) {
                    conn.setDoOutput(true);
                    String postData = params.get("postData");
                    if (postData != null && !postData.isEmpty()) {
                        byte[] body = postData.getBytes("UTF-8");
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(body);
                            os.flush();
                        }
                    }
                }

                // 读取响应
                int responseCode = conn.getResponseCode();
                String contentType = conn.getContentType();
                if (contentType == null) contentType = "application/json";

                InputStream inputStream = responseCode >= 400 ? conn.getErrorStream() : conn.getInputStream();

                // 检测是否为 SSE 流式响应
                boolean isSSE = contentType != null &&
                    (contentType.contains("text/event-stream") || contentType.contains("application/stream"));

                Log.i(TAG, "Proxy response: " + responseCode + " type=" + contentType +
                    " sse=" + isSSE + " for " + targetUrl);

                if (isSSE) {
                    // SSE 流式响应：使用 Chunked 编码透传
                    final InputStream proxyInput = inputStream;
                    Response response = newChunkedResponse(
                        Response.Status.lookup(responseCode),
                        contentType,
                        proxyInput
                    );
                    addCorsHeaders(response);
                    copyResponseHeaders(conn, response);
                    return response;
                } else {
                    // 普通响应：读取完整内容
                    String responseBody = readFully(inputStream);
                    Response response = newFixedLengthResponse(
                        Response.Status.lookup(responseCode),
                        contentType,
                        responseBody
                    );
                    addCorsHeaders(response);
                    copyResponseHeaders(conn, response);
                    conn.disconnect();
                    return response;
                }

            } catch (Exception e) {
                Log.e(TAG, "Proxy error: " + e.getMessage(), e);
                Response errorResponse = newFixedLengthResponse(
                    Response.Status.INTERNAL_ERROR,
                    "application/json",
                    "{\"error\":\"Proxy failed: " + e.getMessage().replace("\"", "\\\"") + "\"}"
                );
                addCorsHeaders(errorResponse);
                return errorResponse;
            }
        }

        /**
         * 根据请求路径和参数确定目标 API 基础地址。
         *
         * 优先级：
         * 1. _target 参数（最高优先级，支持任意 API）
         * 2. /v3 路径前缀（火山方舟 coding plan）
         * 3. /v1 路径前缀（通用 OpenAI 兼容，需 _target 指定目标）
         */
        private String resolveTargetBase(IHTTPSession session, String uri) {
            // 1. 检查 _target 参数（最高优先级）
            String targetParam = getParam(session, "_target");
            if (targetParam != null && !targetParam.isEmpty()) {
                // 去除末尾斜杠
                return targetParam.replaceAll("/+$", "");
            }

            // 2. /v3 路径 → 火山方舟 coding plan
            if (uri.startsWith("/v3") || uri.startsWith("/v3/")) {
                return VOLCANO_ARK_BASE;
            }

            // 3. /v1 路径 → 无 _target 时无法确定目标，返回 null 触发错误提示
            //    （因为 /v1 是通用版本号，不能假设是哪个 API 提供商）
            return null;
        }

        /**
         * 构建转发到目标 API 的 query string（移除 _target 参数）
         */
        private String buildQueryString(IHTTPSession session) {
            String queryString = session.getQueryParameterString();
            if (queryString == null || queryString.isEmpty()) {
                return "";
            }
            // 移除 _target 参数及其可能带的前导 & 或 ?
            queryString = queryString.replaceAll("(^|[&?])_target=[^&]*", "");
            // 清理开头和连续的多余 & 或 ?
            queryString = queryString.replaceAll("^[&?]+", "");
            queryString = queryString.replaceAll("&{2,}", "&");
            return queryString;
        }

        private void addCorsHeaders(Response response) {
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            response.addHeader("Access-Control-Allow-Headers", "*");
            response.addHeader("Access-Control-Max-Age", "86400");
        }

        private void copyResponseHeaders(HttpURLConnection conn, Response response) {
            for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
                if (entry.getKey() != null &&
                    !"Content-Type".equalsIgnoreCase(entry.getKey()) &&
                    !"Content-Length".equalsIgnoreCase(entry.getKey()) &&
                    !"Transfer-Encoding".equalsIgnoreCase(entry.getKey())) {
                    for (String value : entry.getValue()) {
                        response.addHeader(entry.getKey(), value);
                    }
                }
            }
        }

        private String getParam(IHTTPSession session, String name) {
            List<String> values = session.getParameters().get(name);
            return (values != null && !values.isEmpty()) ? values.get(0) : null;
        }

        private String readFully(InputStream inputStream) throws Exception {
            if (inputStream == null) return "";
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
            char[] buffer = new char[8192];
            int bytesRead;
            while ((bytesRead = reader.read(buffer)) != -1) {
                sb.append(buffer, 0, bytesRead);
            }
            return sb.toString();
        }
    }

    /**
     * 转义字符串为 JS 字符串字面量（含双引号），用于 evaluateJavascript
     */
    private String jsString(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\")
                       .replace("\"", "\\\"")
                       .replace("\n", "\\n")
                       .replace("\r", "\\r")
                       .replace("\u2028", "\\u2028")
                       .replace("\u2029", "\\u2029") + "\"";
    }
}
