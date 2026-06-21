/**
 * v0.3.2: 会话分享对话框
 *
 * 两步式分享流程：
 * 1. 格式选择：MD / JSON / PNG 三种格式
 * 2. 消息勾选预览：全选/全不选/单条勾选
 *
 * 导出方式：
 * - MD：Markdown 纯文本，Blob 下载
 * - JSON：含会话元数据的结构化数据，Blob 下载
 * - PNG：html-to-image 长截图，动态 import 减小初始包体积
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconFile,
  IconCode,
  IconImage,
  IconCheck,
  IconShare,
  IconDownload,
  IconUser,
  IconCat,
} from "~/components/luzzy/luzzy-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Checkbox } from "~/components/ui/checkbox";
import { springEnter, pressable } from "~/lib/motion-presets";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import type { Session, ChatMessage } from "~/types/luzzy";
import { useAppStore } from "~/stores/app-store";
import { isNativePlatform } from "~/services/apiClient";

type ShareFormat = "md" | "json" | "png";
type ShareStep = "format" | "select";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  messages: ChatMessage[];
}

/** 格式选项配置 */
const FORMAT_OPTIONS: Array<{
  value: ShareFormat;
  label: string;
  description: string;
  icon: typeof IconFile;
}> = [
  {
    value: "md",
    label: "Markdown",
    description: "纯文本格式，适合复制到文档",
    icon: IconFile,
  },
  {
    value: "json",
    label: "JSON",
    description: "结构化数据，含会话元信息",
    icon: IconCode,
  },
  {
    value: "png",
    label: "PNG 长图",
    description: "渲染为图片，适合分享展示",
    icon: IconImage,
  },
];

export function LuzzyShareDialog({
  open,
  onOpenChange,
  session,
  messages,
}: ShareDialogProps) {
  const [shareFormat, setShareFormat] = React.useState<ShareFormat>("md");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [step, setStep] = React.useState<ShareStep>("format");
  const [exporting, setExporting] = React.useState(false);

  // v0.3.5: 获取用户名和角色名用于占位符替换
  const userName = useAppStore((s) => s.user.name) || "用户";
  const characterName = session?.characterName || "AI";

  // v0.3.5: 解析占位符 {user} 和 {character}
  const resolvePlaceholders = React.useCallback(
    (text: string): string => {
      return text
        .replace(/\{user\}/g, userName)
        .replace(/\{character\}/g, characterName);
    },
    [userName, characterName],
  );

  // 打开时全选 + 重置步骤
  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set(messages.map((m) => m.id)));
      setStep("format");
      setExporting(false);
    }
  }, [open, messages]);

  const toggleAll = React.useCallback(
    (select: boolean) => {
      setSelectedIds(
        select ? new Set(messages.map((m) => m.id)) : new Set(),
      );
    },
    [messages],
  );

  const toggleOne = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectedMessages = React.useMemo(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [messages, selectedIds],
  );

  /** 下载 Blob 文件 */
  const downloadBlob = React.useCallback(
    async (content: string | Blob, fileName: string, mime: string) => {
      const blob =
        typeof content === "string"
          ? new Blob([content], { type: mime })
          : content;

      // v0.3.5: 原生平台使用 Capacitor Filesystem API 保存文件
      if (isNativePlatform()) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          // 将 Blob 转 base64
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Data = btoa(binary);

          // 确保 LUZZY 目录存在
          try {
            await Filesystem.mkdir({
              path: 'LUZZY',
              directory: Directory.Documents,
              recursive: true,
            });
          } catch {
            // 目录已存在，忽略
          }

          // 写入文件
          await Filesystem.writeFile({
            path: `LUZZY/${fileName}`,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
          });

          // 获取文件 URI 用于提示
          const uriResult = await Filesystem.getUri({
            path: `LUZZY/${fileName}`,
            directory: Directory.Documents,
          });
          toast.success(`已导出到：${uriResult.uri}`);
        } catch (err) {
          console.error("[ShareDialog] 原生导出失败:", err);
          toast.error("导出失败：" + (err as Error).message);
        }
        return;
      }

      // Web 平台：浏览器下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已导出：${fileName}`);
    },
    [],
  );

  /** 导出 Markdown */
  const exportMd = React.useCallback(async () => {
    if (!session) return;
    const lines: string[] = [
      `# ${session.title}`,
      "",
      `> 角色：${session.characterName}`,
      `> 导出时间：${new Date().toLocaleString("zh-CN")}`,
      `> 消息数：${selectedMessages.length}`,
      "",
      "---",
      "",
    ];
    for (const msg of selectedMessages) {
      // v0.3.5: 使用占位符 {user}/{character}，导出时解析为实际名称
      const role =
        msg.role === "user" ? "{user}" : msg.role === "assistant" ? "{character}" : "系统";
      lines.push(`## ${resolvePlaceholders(role)}`);
      lines.push("");
      lines.push(msg.content || "（空消息）");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    const fileName = `${session.title || "session"}-${Date.now()}.md`;
    await downloadBlob(lines.join("\n"), fileName, "text/markdown");
  }, [session, selectedMessages, downloadBlob, resolvePlaceholders]);

  /** 导出 JSON */
  const exportJson = React.useCallback(async () => {
    if (!session) return;
    const data = {
      session: {
        id: session.id,
        title: session.title,
        characterId: session.characterId,
        characterName: session.characterName,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      exportedAt: new Date().toISOString(),
      messageCount: selectedMessages.length,
      messages: selectedMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        generationTime: m.generationTime,
        tokenUsage: m.tokenUsage,
      })),
    };
    const fileName = `${session.title || "session"}-${Date.now()}.json`;
    await downloadBlob(JSON.stringify(data, null, 2), fileName, "application/json");
  }, [session, selectedMessages, downloadBlob]);

  /** 导出 PNG 长截图 */
  const exportPng = React.useCallback(async () => {
    if (!session) return;
    setExporting(true);
    try {
      // 构建渲染容器
      const container = document.createElement("div");
      container.style.cssText =
        "position:absolute;left:-9999px;top:0;width:420px;padding:24px;background:#ffffff;font-family:'AlibabaPuHuiTi-3','AlibabaSans',sans-serif;box-sizing:border-box;";

      // 标题区
      const header = document.createElement("div");
      header.style.cssText =
        "padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #e5e7eb;";
      header.innerHTML = `
        <div style="font-size:20px;font-weight:600;color:#111827;margin-bottom:8px;">${escapeHtml(session.title)}</div>
        <div style="font-size:12px;color:#6b7280;">角色：${escapeHtml(session.characterName)} · 消息数：${selectedMessages.length} · 导出时间：${new Date().toLocaleString("zh-CN")}</div>
      `;
      container.appendChild(header);

      // 消息列表
      for (const msg of selectedMessages) {
        const isUser = msg.role === "user";
        const msgEl = document.createElement("div");
        msgEl.style.cssText = `margin-bottom:16px;padding:12px 14px;border-radius:12px;${isUser ? "background:#eff6ff;border:1px solid #dbeafe;" : "background:#f9fafb;border:1px solid #f3f4f6;"}`;
        // v0.3.5: 使用占位符 {user}/{character}，导出时解析为实际名称
        const roleLabel = isUser ? "{user}" : msg.role === "assistant" ? "{character}" : "系统";
        msgEl.innerHTML = `
          <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:500;">${escapeHtml(resolvePlaceholders(roleLabel))}</div>
          <div style="font-size:14px;color:#111827;white-space:pre-wrap;word-break:break-word;line-height:1.6;">${escapeHtml(msg.content || "（空消息）")}</div>
        `;
        container.appendChild(msgEl);
      }

      // 页脚
      const footer = document.createElement("div");
      footer.style.cssText =
        "margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;";
      footer.textContent = "由 LUZZY 导出";
      container.appendChild(footer);

      document.body.appendChild(container);
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(container, {
          quality: 0.95,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
        });
        const fileName = `${session.title || "session"}-${Date.now()}.png`;
        // 转为 Blob 下载
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        downloadBlob(blob, fileName, "image/png");
      } finally {
        document.body.removeChild(container);
      }
    } catch (err) {
      console.error("[ShareDialog] PNG 导出失败:", err);
      toast.error("PNG 导出失败：" + (err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [session, selectedMessages, downloadBlob, resolvePlaceholders]);

  /** 执行导出 */
  const handleExport = React.useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.warning("请至少选择一条消息");
      return;
    }
    if (shareFormat === "md") {
      await exportMd();
    } else if (shareFormat === "json") {
      await exportJson();
    } else if (shareFormat === "png") {
      await exportPng();
    }
  }, [selectedIds.size, shareFormat, exportMd, exportJson, exportPng]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <AnimatePresence mode="wait">
          {step === "format" ? (
            <motion.div key="format" {...springEnter}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <IconShare className="size-4" />
                  分享会话 - 选择格式
                </DialogTitle>
                <DialogDescription>
                  选择导出格式，下一步可选择要分享的消息
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = shareFormat === opt.value;
                  return (
                    <motion.button
                      key={opt.value}
                      type="button"
                      onClick={() => setShareFormat(opt.value)}
                      {...pressable}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50",
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <Icon
                          className={cn(
                            "size-6",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        {selected && (
                          <IconCheck className="size-4 text-primary" />
                        )}
                      </div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.description}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  取消
                </Button>
                <Button onClick={() => setStep("select")}>
                  下一步：选择消息
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.div key="select" {...springEnter}>
              <DialogHeader>
                <DialogTitle>选择要分享的消息</DialogTitle>
                <DialogDescription>
                  已选 {selectedIds.size} / {messages.length} 条消息
                </DialogDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAll(true)}
                  >
                    全选
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAll(false)}
                  >
                    全不选
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStep("format")}
                  >
                    返回
                  </Button>
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[50vh]">
                <div className="flex flex-col gap-2 py-2">
                  {messages.map((m) => {
                    const checked = selectedIds.has(m.id);
                    const isUser = m.role === "user";
                    return (
                      <motion.label
                        key={m.id}
                        layout
                        {...springEnter}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-lg border p-2 transition-colors",
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:bg-accent/50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOne(m.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          {/* v0.3.5: 使用 icon 替代 Emoji，显示用户名/角色名 */}
                          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            {isUser ? (
                              <IconUser className="size-3" />
                            ) : (
                              <IconCat className="size-3" />
                            )}
                            <span className="truncate">
                              {isUser ? userName : characterName}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-sm">
                            {m.content || "（空消息）"}
                          </div>
                        </div>
                      </motion.label>
                    );
                  })}
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setStep("format")}
                >
                  返回
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={exporting || selectedIds.size === 0}
                >
                  {exporting ? (
                    "导出中..."
                  ) : (
                    <>
                      <IconDownload className="mr-2 size-4" />
                      导出 {selectedIds.size} 条消息
                    </>
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

/** HTML 转义，防止 PNG 渲染时 XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
