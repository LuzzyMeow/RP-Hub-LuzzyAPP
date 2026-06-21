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
import { LuzzySplash } from "./components/luzzy/luzzy-splash";
import { GlobalTrpgIframe } from "./components/luzzy/luzzy-global-trpg-iframe";
import { ConfirmProvider } from "./components/luzzy/luzzy-confirm";
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <Meta />
        <Links />
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
    return sessionStorage.getItem("luzzy-splash-shown") ? false : true;
  });

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
    const androidProxy = (window as unknown as { AndroidProxy?: { setApiConfig: (url: string, key: string) => void } }).AndroidProxy;
    if (androidProxy && typeof androidProxy.setApiConfig === "function") {
      androidProxy.setApiConfig(apiUrl ?? "", apiKey ?? "");
      logger.info("app", `已推送 API 配置到原生代理（url=${apiUrl ? "已设置" : "空"}）`);
    }
  }, [apiUrl, apiKey]);

  // v0.3.2: 路由变化时记录日志
  useEffect(() => {
    if (showSplash) return;
    const path = location.pathname;
    const routeName =
      path === "/" ? "聊天"
      : path.startsWith("/characters") ? "角色卡"
      : path.startsWith("/settings") ? "设置"
      : path.startsWith("/tools") ? "工具"
      : path.startsWith("/memory") ? "记忆"
      : path.startsWith("/trpg") ? "TRPG"
      : path.startsWith("/about") ? "关于"
      : path.startsWith("/preset") ? "预设"
      : path.startsWith("/world-info") ? "世界书"
      : path.startsWith("/knowledge-base") ? "知识库"
      : path.startsWith("/regex") ? "正则"
      : path.startsWith("/ui-template") ? "UI模板"
      : path.startsWith("/profile") ? "用户档案"
      : path.startsWith("/skill") ? "技能"
      : "未知";
    logger.info("user", `进入${routeName}页`);
  }, [location.pathname, showSplash]);

  return (
    <ThemeProvider defaultTheme="system">
      <ConfirmProvider>
        {showSplash ? (
          <LuzzySplash
            onComplete={() => {
              setShowSplash(false);
              sessionStorage.setItem("luzzy-splash-shown", "1");
            }}
          />
        ) : (
          <>
            <Outlet />
            <GlobalTrpgIframe />
            <Toaster position="top-center" />
          </>
        )}
      </ConfirmProvider>
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
    <div className="flex items-center justify-center h-screen w-screen bg-background">
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
