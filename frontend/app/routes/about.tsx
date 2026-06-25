/**
 * 关于页面（v0.3.0 新增，v0.4.6 日志系统增强）
 *
 * 显示应用信息：LOGO、版本号、系统信息、日志路径
 * 日志查看增强：
 * - 分类 Tab 筛选（全部 / 流式 / API / 工具 / 记忆 等）
 * - 日志级别过滤（debug / info / warn / error）
 * - 实时自动刷新（每 500ms）
 * - 最多显示 2000 条（受内存缓冲区限制）
 * - 点击条目展开完整内容
 */

import * as React from "react";
import type { Route } from "./+types/about";
import { motion, AnimatePresence } from "motion/react";
import {
  IconInfo,
  IconLink,
  IconCopyEdit,
  IconArrowDown,
  IconShare,
  // v0.8.11: 新增 IconToolKit 用于日志查看器标题图标（game-icon-pack 封装）
  IconToolKit,
} from "~/components/luzzy/luzzy-icons";

// v0.8.11: 移除 LuzzyAuroraBackground 动画背景，改为与主题色同步的静态背景
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { toast } from "sonner";
import { copyTextToClipboard } from "~/lib/clipboard";
import {
  getLogFilePath,
  getBufferedLogs,
  logger,
  type LogEntry,
  type LogCategory,
  type LogLevel,
} from "~/services/logger";

export function meta(_: Route.MetaArgs) {
  return [{ title: "关于 - LUZZY" }];
}

/** 应用版本号 */
const APP_VERSION = "v0.8.13";

/** v0.5.8: 关于页动态文案轮播 */
const ABOUT_PHRASES = [
  "陪伴，夜晚，你",
  "那天的阳光正好，是你来了",
  "每次对话，都像一本有你的小说",
  "我从不想念过去，因为现在，有你",
];
const PHRASE_INTERVAL = 4500;

/** 日志分类 Tab 配置 */
const CATEGORY_TABS: { key: LogCategory | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "stream", label: "流式" },
  { key: "api", label: "API" },
  { key: "tool", label: "工具" },
  { key: "memory", label: "记忆" },
  { key: "world", label: "世界" },
  { key: "chat", label: "聊天" },
  { key: "agent", label: "Agent" },
  { key: "trpg", label: "TRPG" },
  // v0.8.11: 新增工具版本分类，用于记录内置工具/SKILL/MCP 的版本变更
  { key: "tool_version", label: "工具版本" },
];

/** 日志级别选项 */
const LEVEL_OPTIONS: { key: LogLevel | "all"; label: string }[] = [
  { key: "all", label: "全部级别" },
  { key: "debug", label: "Debug" },
  { key: "info", label: "Info" },
  { key: "warn", label: "Warn" },
  { key: "error", label: "Error" },
];

/** 日志级别对应颜色 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-blue-600 dark:text-blue-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
};

/** 格式化单条日志为文本 */
function formatLogEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`;
}

export default function AboutPage() {
  const [systemInfo, setSystemInfo] = React.useState<Record<string, string>>({});
  const [logPath, setLogPath] = React.useState<string | null>(null);
  const [allLogs, setAllLogs] = React.useState<LogEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = React.useState<LogCategory | "all">("all");
  const [levelFilter, setLevelFilter] = React.useState<LogLevel | "all">("all");
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const phraseTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [phraseIndex, setPhraseIndex] = React.useState(0);
  const logContainerRef = React.useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = React.useState(false);
  // v0.8.10-urgent-fix: 用 ref 镜像 userScrolledUp，避免 effect 依赖 userScrolledUp。
  // 原实现 effect 依赖 [displayLogs.length, userScrolledUp]，用户滑回顶部时 userScrolledUp
  // 从 true→false 触发 effect 执行 el.scrollTop = el.scrollHeight，强制把页面拉回底部，
  // 与用户滑到顶部的操作冲突，造成白屏闪屏。
  const userScrolledUpRef = React.useRef(false);
  React.useEffect(() => {
    userScrolledUpRef.current = userScrolledUp;
  }, [userScrolledUp]);
  // v0.8.7-urgent: D10 onScroll rAF 节流 ref
  const scrollRafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // v0.5.8: 关于页动态文案轮播
  React.useEffect(() => {
    phraseTimerRef.current = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % ABOUT_PHRASES.length);
    }, PHRASE_INTERVAL);
    return () => {
      if (phraseTimerRef.current) {
        clearInterval(phraseTimerRef.current);
        phraseTimerRef.current = null;
      }
    };
  }, []);

  /** 刷新日志列表 */
  const refreshLogs = React.useCallback(() => {
    const logs = getBufferedLogs();
    // v0.8.5: 内容比对，日志无变化时跳过 re-render，避免定时器导致的全量重渲染卡顿
    setAllLogs((prev) => {
      if (prev.length !== logs.length) return logs;
      if (prev.length === 0) return prev; // 双方都为空，跳过
      const last = prev.length - 1;
      if (
        prev[last].timestamp === logs[last].timestamp &&
        prev[last].message === logs[last].message
      ) {
        return prev;
      }
      return logs;
    });
  }, []);

  React.useEffect(() => {
    // v0.8.5: 增加 cancelled 标志，组件卸载后中断异步操作
    let cancelled = false;
    void (async () => {
      logger.info("user", "进入关于页");

      // 获取系统信息
      const info: Record<string, string> = {};
      info["应用版本"] = APP_VERSION;
      info["User Agent"] = navigator.userAgent;
      info["平台"] = navigator.platform;
      info["语言"] = navigator.language;
      info["屏幕分辨率"] = `${window.screen.width} × ${window.screen.height}`;
      info["视口大小"] = `${window.innerWidth} × ${window.innerHeight}`;

      try {
        const { getDeviceInfo } = await import("~/services/nativeBridge");
        if (cancelled) return;
        const deviceInfo = await getDeviceInfo();
        if (cancelled) return;
        if (deviceInfo.platform !== "web") {
          info["操作系统"] = deviceInfo.platform;
          info["系统版本"] = deviceInfo.osVersion;
          info["设备型号"] = deviceInfo.model;
          info["设备名称"] = deviceInfo.name || "未知";
          info["制造商"] = deviceInfo.manufacturer || "未知";
        } else {
          info["操作系统"] = "Web 浏览器";
        }
      } catch {
        info["操作系统"] = "Web 浏览器";
      }

      if (cancelled) return;
      setSystemInfo(info);

      // 获取日志路径
      const path = await getLogFilePath();
      if (cancelled) return;
      setLogPath(path);

      // 初始加载日志
      refreshLogs();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLogs]);

  // 自动刷新
  React.useEffect(() => {
    if (autoRefresh) {
      // v0.8.5: 降频 500ms → 2000ms，配合内容比对，性能影响可忽略
      refreshTimerRef.current = setInterval(refreshLogs, 2000);
    } else {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    }
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, refreshLogs]);

  const handleLogScroll = React.useCallback(() => {
    // v0.8.7-urgent: D10 rAF 节流，避免每次滚动都触发 setState
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = logContainerRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      setUserScrolledUp(!atBottom);
    });
  }, []);

  const scrollLogToBottom = React.useCallback(() => {
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUserScrolledUp(false);
  }, []);

  // 筛选日志
  const filteredLogs = React.useMemo(() => {
    let logs = allLogs;
    if (categoryFilter !== "all") {
      logs = logs.filter((l) => l.category === categoryFilter);
    }
    if (levelFilter !== "all") {
      logs = logs.filter((l) => l.level === levelFilter);
    }
    return logs.slice(-2000);
  }, [allLogs, categoryFilter, levelFilter]);

  // v0.8.7-urgent: useDeferredValue 让 React 在空闲时处理日志列表渲染，避免阻塞流式
  // v0.8.10-fix: allLogs 为空时跳过 deferred，避免首次进入关于页时空白一闪
  // 注意：保持 useDeferredValue 始终调用以遵守 React hooks 规则（hooks 顺序必须稳定），
  // 用 displayLogs 派生变量在渲染层跳过 deferred 结果
  // v0.8.10-urgent-fix: useMemo 包裹 displayLogs 避免每次 re-render 创建新引用，
  // 防止父组件 re-render（phraseIndex 轮播 / userScrolledUp 变化）导致日志列表全量 reconcile
  const deferredLogs = React.useDeferredValue(filteredLogs);
  const displayLogs = React.useMemo(
    () => (allLogs.length === 0 ? [] : deferredLogs),
    [allLogs.length, deferredLogs],
  );

  // v0.5.8: 日志自动吸附底部
  // v0.8.10-urgent-fix: 依赖改为 [displayLogs.length]（仅日志数量增加时吸附），
  // 用 userScrolledUpRef 读取当前滚动状态，避免 userScrolledUp 在依赖中导致
  // 滑回顶部时 true→false 触发强制滚动到底部造成闪屏。
  React.useEffect(() => {
    const el = logContainerRef.current;
    if (!el || userScrolledUpRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [displayLogs.length]);

  // 格式化后的文本（用于复制）
  const formattedLogsText = React.useMemo(
    () => filteredLogs.map(formatLogEntry).join("\n"),
    [filteredLogs],
  );

  /** 一键复制日志 */
  const handleCopyLogs = React.useCallback(async () => {
    if (filteredLogs.length === 0) {
      toast.warning("暂无日志可复制");
      return;
    }
    try {
      await copyTextToClipboard(formattedLogsText);
      toast.success(`已复制 ${filteredLogs.length} 条日志到剪贴板`);
    } catch {
      toast.error("复制失败");
    }
  }, [filteredLogs, formattedLogsText]);

  /** 导出全部日志为 JSON 并分享 */
  const handleExportLogs = React.useCallback(async () => {
    if (allLogs.length === 0) {
      toast.warning("暂无日志可导出");
      return;
    }
    try {
      const exportData = {
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        totalCount: allLogs.length,
        logs: allLogs,
      };
      const jsonStr = JSON.stringify(exportData, null, 2);
      const filename = `LUZZY-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

      // 尝试原生分享
      try {
        const { writeFile, shareFile, mkdir } = await import("~/services/nativeBridge");
        await mkdir("DOCUMENTS", "exports", true).catch(() => {});
        const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
        const result = await writeFile("DOCUMENTS", `exports/${filename}`, base64, true);
        if (result.uri) {
          shareFile(result.uri, filename, "分享 LUZZY 日志");
          toast.success(`已导出 ${allLogs.length} 条日志`);
          return;
        }
      } catch {
        // 原生分享不可用，回退
      }

      // Web 回退：下载文件
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${allLogs.length} 条日志`);
    } catch (e) {
      toast.error("导出失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }, [allLogs]);

  /** 复制日志路径 */
  const handleCopyLogPath = React.useCallback(async () => {
    if (!logPath) {
      toast.warning("日志路径不可用（Web 环境）");
      return;
    }
    try {
      await copyTextToClipboard(logPath);
      toast.success("日志路径已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }, [logPath]);

  /** 切换条目展开 */
  const toggleExpand = React.useCallback((idx: number) => {
    setExpandedId((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <LuzzyLayout title="关于">
      <div className="relative h-full w-full overflow-hidden bg-background">
        {/* v0.8.11: 移除 LuzzyAuroraBackground 动画背景，改为与主题色同步的静态背景。
            原因：动画背景在主题切换时与 CSS transition 冲突，导致关于页持续闪屏。
            现在背景色由 bg-background CSS 变量驱动，自动跟随主题切换。
            禁止在此处恢复动画背景组件。 */}
        <div className="absolute inset-0 bg-background" aria-hidden="true" />
        {/* 内容层：relative z-10 可滚动，置于背景之上 */}
        <div className="relative z-10 h-full w-full overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full min-w-0 max-w-2xl space-y-6 overflow-x-hidden p-4">
            {/* LOGO 和版本信息 */}
            <motion.div
              initial={{ opacity: 0.01, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-w-0 flex-col items-center gap-3 py-8"
            >
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl shadow-lg">
                <img src="/icons/icon-192.png" alt="LUZZY" className="size-full object-cover" />
              </div>
              <div className="text-center">
                <motion.h1
                  className="text-2xl font-bold tracking-tight"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    LUZZY
                  </span>
                </motion.h1>
                <p className="mt-1 h-5 text-sm text-muted-foreground">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={phraseIndex}
                      initial={{
                        opacity: 0,
                        y: 8,
                        letterSpacing: "0.3em",
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        letterSpacing: "0.05em",
                      }}
                      exit={{
                        opacity: 0,
                        y: -8,
                        letterSpacing: "0.3em",
                      }}
                      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {ABOUT_PHRASES[phraseIndex]}
                    </motion.span>
                  </AnimatePresence>
                </p>
                <p className="mt-2 text-xs font-mono text-muted-foreground">{APP_VERSION}</p>
              </div>
            </motion.div>

            {/* 系统信息 */}
            <motion.div
              initial={{ opacity: 0.01, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="min-w-0"
            >
              <Card className="min-w-0 overflow-hidden p-4">
                <div className="mb-3 flex items-center gap-2">
                  <IconInfo className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">系统信息</h2>
                </div>
                <div className="grid gap-2">
                  {Object.entries(systemInfo).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex min-w-0 items-start gap-3 border-b border-border/30 py-1.5 last:border-0"
                    >
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{key}</span>
                      <span
                        className="min-w-0 flex-1 break-all text-xs font-medium"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* 日志路径 */}
            <motion.div
              initial={{ opacity: 0.01, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="min-w-0"
            >
              <Card className="min-w-0 overflow-hidden p-4">
                <div className="mb-3 flex items-center gap-2">
                  <IconLink className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">日志路径</h2>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="block min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">
                    {logPath || "/Documents/LUZZY/logs/YYYYMMDD.log (Web 环境不可用)"}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={handleCopyLogPath}
                    title="复制路径"
                  >
                    <IconCopyEdit className="size-4" />
                  </Button>
                </div>
              </Card>
            </motion.div>

            {/* 日志查看器 */}
            <motion.div
              initial={{ opacity: 0.01, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="min-w-0"
            >
              <Card className="min-w-0 overflow-hidden p-4">
                {/* 标题栏 */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {/* v0.8.11: 日志查看器标题图标改用 IconToolKit（game-icon-pack 封装） */}
                    <IconToolKit className="size-4 shrink-0 text-primary" />
                    <h2 className="text-sm font-semibold">
                      日志查看器（{filteredLogs.length}/{allLogs.length} 条）
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 自动刷新开关 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">实时</span>
                      <Switch
                        checked={autoRefresh}
                        onCheckedChange={setAutoRefresh}
                        className="scale-75"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={handleCopyLogs}
                      title="一键复制筛选后日志"
                    >
                      <IconCopyEdit className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={handleExportLogs}
                      title="导出全部日志 JSON 并分享"
                    >
                      <IconShare className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* 分类 Tab — v0.8.11: motion.button 三态动画（进入/交互/退出） */}
                <div className="mb-2 flex flex-wrap gap-1">
                  {CATEGORY_TABS.map((tab) => (
                    <motion.button
                      key={tab.key}
                      type="button"
                      onClick={() => setCategoryFilter(tab.key)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        categoryFilter === tab.key
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {tab.label}
                    </motion.button>
                  ))}
                </div>

                {/* 级别过滤 — v0.8.11: motion.button 三态动画（进入/交互/退出） */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {LEVEL_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.key}
                      type="button"
                      onClick={() => setLevelFilter(opt.key)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        levelFilter === opt.key
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {opt.label}
                    </motion.button>
                  ))}
                </div>

                {/* 日志列表 */}
                <div className="relative">
                  <div
                    ref={logContainerRef}
                    onScroll={handleLogScroll}
                    className="max-h-[600px] overflow-auto rounded-md border bg-muted/30" // v0.8.10-urgent-fix: 移除 cv-auto，避免滑回顶部时视口外内容不渲染导致白屏闪屏
                  >
                    {displayLogs.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        暂无匹配日志。去聊一句触发流式诊断吧。
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {displayLogs.map((entry, idx) => {
                          const isExpanded = expandedId === idx;
                          const colorClass = LEVEL_COLORS[entry.level];
                          return (
                            <div
                              key={`${entry.timestamp}-${idx}`}
                              className="border-b border-border/20 last:border-0"
                            >
                              <button
                                type="button"
                                onClick={() => toggleExpand(idx)}
                                className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left hover:bg-muted/50 transition-colors"
                              >
                                <motion.div
                                  animate={{ rotate: isExpanded ? 0 : -90 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <IconArrowDown className="size-2.5 shrink-0 text-muted-foreground" />
                                </motion.div>
                                <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                                  {entry.timestamp.slice(-12)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="shrink-0 px-1 py-0 text-[9px] leading-none"
                                >
                                  {entry.category}
                                </Badge>
                                <span
                                  className={`min-w-0 flex-1 truncate text-[11px] font-mono leading-relaxed ${colorClass}`}
                                >
                                  {entry.message}
                                </span>
                              </button>
                              {/* v0.8.11: 日志条目展开/折叠 AnimatePresence + motion.div 高度动画 */}
                              <AnimatePresence initial={false}>
                                {isExpanded && (
                                  <motion.div
                                    key="expand-content"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                                      opacity: { duration: 0.15 },
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-border/20 bg-muted/20 px-6 py-2">
                                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
                                        <span>时间: {entry.timestamp}</span>
                                        <span>级别: {entry.level.toUpperCase()}</span>
                                        <span>分类: {entry.category}</span>
                                      </div>
                                      <pre className="mt-1.5 whitespace-pre-wrap break-all text-[11px] font-mono leading-relaxed">
                                        {entry.message}
                                      </pre>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* v0.5.8: 回到底部浮动按钮（在滚动容器外，relative 容器内） */}
                  {userScrolledUp && displayLogs.length > 0 && (
                    <div className="absolute bottom-3 right-3 z-10">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-8 rounded-full shadow-md opacity-80 hover:opacity-100"
                        onClick={scrollLogToBottom}
                        title="回到底部"
                      >
                        <IconArrowDown className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* 版权信息 */}
            <motion.div
              initial={{ opacity: 0.01 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="min-w-0 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center"
            >
              <p className="text-xs text-muted-foreground">© 2026 LUZZY. All rights reserved.</p>
            </motion.div>
          </div>
        </div>
      </div>
    </LuzzyLayout>
  );
}
