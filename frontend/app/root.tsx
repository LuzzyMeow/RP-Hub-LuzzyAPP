import { useState, useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Route } from "./+types/root";
import "./app.css";
import "./i18n";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./components/theme-provider";
import { TooltipProvider } from "./components/ui/tooltip";
import { LuzzySplash } from "./components/luzzy/luzzy-splash";
import { ConfirmProvider } from "./components/luzzy/luzzy-confirm";
import { BindingDeleteConfirmProvider } from "./components/luzzy/luzzy-binding-delete-dialog";
import { initLogger, logger } from "./services/logger";
import { useAppStore } from "./stores";

const queryClient = new QueryClient();

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "any" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <Meta />
        <Links />
        {/* v0.4.1: 提前设置主题 class,避免 hydration 阶段白屏闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('vite-ui-theme');var m=window.matchMedia('(prefers-color-scheme: dark)');var d=t==='dark'||((t==='system'||!t)&&m.matches);var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(d?'dark':'light');var s=localStorage.getItem('luzzy-settings');if(s){try{var p=JSON.parse(s);var cs=(p.state&&p.state.colorScheme)||p.colorScheme;r.setAttribute('data-theme',cs==='default'?'default':'pixel');}catch(e2){r.setAttribute('data-theme','pixel');}}else{r.setAttribute('data-theme','pixel');}}catch(e){document.documentElement.classList.add('light');document.documentElement.setAttribute('data-theme','pixel');}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AppContent() {
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(() => {
    // 本会话已显示过启动屏则跳过
    // v0.8.6-fix: 包裹 try-catch,避免 WebView 隐私模式下 sessionStorage 抛 SecurityError
    try {
      return sessionStorage.getItem("luzzy-splash-shown") ? false : true;
    } catch {
      return true;
    }
  });

  // v0.3.6: 修复从后台切回前台时白屏问题
  // 通过 visibilitychange 和 pageshow 事件触发重新渲染
  const [, setRefreshKey] = useState(0);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 触发重新渲染，修复白屏
        setRefreshKey((k) => k + 1);
      }
    };
    const handlePageShow = () => {
      // 从 bfcache 恢复时也触发重新渲染
      setRefreshKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // v0.3.2: 应用启动时初始化 logger
  useEffect(() => {
    void initLogger().then(() => {
      logger.info("app", "LUZZY 应用启动");
    });
  }, []);

  // v0.3.2: 推送 API 配置到 Android 原生代理（NanoHTTPD）
  // 解决 TRPG 模式下 503 "LUZZY API config not set" 错误
  const apiUrl = useAppStore((s) => s.apiUrl);
  const apiKey = useAppStore((s) => s.apiKey);
  useEffect(() => {
    const androidProxy = (
      window as unknown as { AndroidProxy?: { setApiConfig: (url: string, key: string) => void } }
    ).AndroidProxy;
    if (androidProxy && typeof androidProxy.setApiConfig === "function") {
      androidProxy.setApiConfig(apiUrl ?? "", apiKey ?? "");
      logger.info("app", `已推送 API 配置到原生代理（url=${apiUrl ? "已设置" : "空"}）`);
    }
  }, [apiUrl, apiKey]);

  // v0.4.5-fix: 推送高级设置到原生代理(修复 setAdvancedSettings 从未被调用的死代码 bug)
  // 影响:火山方舟 CodingPlan 的 customRequestBody(thinking)和 DeepSeek 的 reasoning_effort
  // 现在会正确注入到 TRPG iframe 的代理请求中
  const customRequestBody = useAppStore((s) => s.customRequestBody);
  const apiProviderId = useAppStore((s) => s.apiProviderId);
  const modelName = useAppStore((s) => s.modelName);
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const builtinModelOverrides = useAppStore((s) => s.builtinModelOverrides);
  useEffect(() => {
    const androidProxy = (
      window as unknown as {
        AndroidProxy?: { setAdvancedSettings: (thinking: string, body: string) => void };
      }
    ).AndroidProxy;
    if (!androidProxy || typeof androidProxy.setAdvancedSettings !== "function") return;

    // 派生 enableThinking:从当前模型的 supportsReasoning 属性(与 chat-slice.ts extractApiSettings 一致)
    const allProviders = getAllProviders();
    const currentProvider = allProviders.find((p) => p.id === apiProviderId);
    // parseModelName 逻辑:支持 "providerId/modelName" 格式
    const slashIdx = modelName.indexOf("/");
    const { providerId, modelName: actualModelName } =
      slashIdx >= 0
        ? {
            providerId: modelName.substring(0, slashIdx),
            modelName: modelName.substring(slashIdx + 1),
          }
        : { providerId: undefined, modelName };
    const targetProvider = providerId
      ? allProviders.find((p) => p.id === providerId)
      : currentProvider;
    const currentModel = targetProvider?.models?.find((m) => m.name === actualModelName);
    const enableThinking = !!currentModel?.supportsReasoning;

    androidProxy.setAdvancedSettings(enableThinking ? "true" : "false", customRequestBody ?? "");
    logger.info(
      "app",
      `已推送高级设置到原生代理（thinking=${enableThinking}, customBody=${customRequestBody ? "已设置" : "空"}）`,
    );
  }, [customRequestBody, apiProviderId, modelName, getAllProviders, builtinModelOverrides]);

  // v0.3.2: 路由变化时记录日志
  useEffect(() => {
    if (showSplash) return;
    const path = location.pathname;
    const routeName =
      path === "/"
        ? "聊天"
        : path.startsWith("/characters")
          ? "角色卡"
          : path.startsWith("/settings")
            ? "设置"
            : path.startsWith("/tools")
              ? "工具"
              : path.startsWith("/memory")
                ? "记忆"
                : path.startsWith("/trpg")
                  ? "TRPG"
                  : path.startsWith("/about")
                    ? "关于"
                    : path.startsWith("/preset")
                      ? "预设"
                      : path.startsWith("/world-info")
                        ? "世界书"
                        : path.startsWith("/knowledge-base")
                          ? "知识库"
                          : path.startsWith("/regex")
                            ? "正则"
                            : path.startsWith("/ui-template")
                              ? "UI模板"
                              : path.startsWith("/profile")
                                ? "用户档案"
                                : path.startsWith("/skill")
                                  ? "技能"
                                  : "未知";
    logger.info("user", `进入${routeName}页`);
  }, [location.pathname, showSplash]);

  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider delayDuration={300}>
        <ConfirmProvider>
          <BindingDeleteConfirmProvider>
            {showSplash ? (
              <LuzzySplash
                onComplete={() => {
                  setShowSplash(false);
                  // v0.8.6-fix: 包裹 try-catch,避免 WebView 隐私模式下 sessionStorage 抛 SecurityError
                  try {
                    sessionStorage.setItem("luzzy-splash-shown", "1");
                  } catch {
                    // ignore
                  }
                }}
              />
            ) : (
              <>
                <Outlet />
                <Toaster position="top-center" />
              </>
            )}
          </BindingDeleteConfirmProvider>
        </ConfirmProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-white dark:bg-black">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-3">
          <h1 className="text-6xl font-bold text-primary">{message}</h1>
          <p className="text-lg text-muted-foreground">{details}</p>
        </div>
        {stack && (
          <pre className="text-left text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
            <code className="text-muted-foreground">{stack}</code>
          </pre>
        )}
        <button
          onClick={() => (window.location.href = "/")}
          className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          Back to Home
        </button>
      </div>
    </main>
  );
}
