/**
 * 关于页面（v0.3.0 新增）
 *
 * 显示应用信息：LOGO、版本号、系统信息、日志路径
 */

import * as React from "react";
import type { Route } from "./+types/about";
import { motion } from "motion/react";
import { IconInfo, IconLink, IconCopyEdit } from "~/components/luzzy/luzzy-icons";

import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { toast } from "sonner";
import { copyTextToClipboard } from "~/lib/clipboard";
import { getLogFilePath, getBufferedLogs, logger } from "~/services/logger";

export function meta(_: Route.MetaArgs) {
  return [{ title: "关于 - LUZZY" }];
}

/** 应用版本号 */
const APP_VERSION = "v0.4.3";

export default function AboutPage() {
  const [systemInfo, setSystemInfo] = React.useState<Record<string, string>>({});
  const [logPath, setLogPath] = React.useState<string | null>(null);
  const [recentLogs, setRecentLogs] = React.useState<string[]>([]);

  React.useEffect(() => {
    void (async () => {
      // v0.3.2: logger 已由 root.tsx 全局初始化，此处无需重复调用
      logger.info("user", "进入关于页");

      // 获取系统信息
      const info: Record<string, string> = {};
      info["应用版本"] = APP_VERSION;
      info["User Agent"] = navigator.userAgent;
      info["平台"] = navigator.platform;
      info["语言"] = navigator.language;
      info["屏幕分辨率"] = `${window.screen.width} × ${window.screen.height}`;
      info["视口大小"] = `${window.innerWidth} × ${window.innerHeight}`;

      // 尝试获取 Capacitor 设备信息
      try {
        const { Device } = await import("@capacitor/device");
        const deviceInfo = await Device.getInfo();
        info["操作系统"] = deviceInfo.platform;
        info["系统版本"] = deviceInfo.osVersion;
        info["设备型号"] = deviceInfo.model;
        info["设备名称"] = deviceInfo.name || "未知";
        info["制造商"] = deviceInfo.manufacturer || "未知";
      } catch {
        info["操作系统"] = "Web 浏览器";
      }

      setSystemInfo(info);

      // 获取日志路径
      const path = await getLogFilePath();
      setLogPath(path);

      // 获取最近日志
      const logs = getBufferedLogs();
      // v0.4.1: 增加显示条数到 200,覆盖更多调试场景
      setRecentLogs(logs.slice(-200).map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`));
    })();
  }, []);

  /** v0.4.1: 一键复制最近日志到剪贴板 */
  const handleCopyLogs = React.useCallback(async () => {
    if (recentLogs.length === 0) {
      toast.warning("暂无日志可复制");
      return;
    }
    try {
      await copyTextToClipboard(recentLogs.join('\n'));
      toast.success(`已复制 ${recentLogs.length} 条日志到剪贴板`);
    } catch {
      toast.error("复制失败");
    }
  }, [recentLogs]);

  /** 复制日志路径到剪贴板 */
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

  return (
    <LuzzyLayout title="关于">
      {/* v0.4.0: 替换 radix ScrollArea 为原生 div，修复 Viewport display:table 导致的宽度溢出 */}
      <div className="h-full w-full overflow-y-auto overflow-x-hidden">
        <div className="mx-auto w-full min-w-0 max-w-2xl space-y-6 overflow-x-hidden p-4">
          {/* LOGO 和版本信息 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 flex-col items-center gap-3 py-8"
          >
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl shadow-lg">
              <img src="/icons/icon-192.png" alt="LUZZY" className="size-full object-cover" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">LUZZY</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                AI 角色扮演与 TRPG 对话应用
              </p>
              <p className="mt-2 text-xs font-mono text-muted-foreground">
                {APP_VERSION}
              </p>
            </div>
          </motion.div>

          {/* 系统信息 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
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
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {key}
                    </span>
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
            initial={{ opacity: 0, y: 12 }}
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
              <p className="mt-2 text-xs text-muted-foreground">
                日志文件按日期存储，仅保留近 3 天。点击复制按钮可复制路径
              </p>
            </Card>
          </motion.div>

          {/* 最近日志 */}
          {recentLogs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="min-w-0"
            >
              <Card className="min-w-0 overflow-hidden p-4">
                {/* v0.4.1: 标题栏增加一键复制按钮 */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconInfo className="size-4 shrink-0 text-primary" />
                    <h2 className="text-sm font-semibold">最近日志（{recentLogs.length} 条）</h2>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={handleCopyLogs}
                    title="一键复制日志"
                  >
                    <IconCopyEdit className="size-4" />
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-auto rounded-md border bg-muted/30">
                  <div className="space-y-0.5 p-2">
                    {recentLogs.map((line, i) => (
                      <p
                        key={i}
                        className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed"
                        style={{ wordBreak: "break-all", overflowWrap: "anywhere" }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* 版权信息 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="min-w-0 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center"
          >
            <p className="text-xs text-muted-foreground">
              © 2026 LUZZY. All rights reserved.
            </p>
          </motion.div>
        </div>
      </div>
    </LuzzyLayout>
  );
}
