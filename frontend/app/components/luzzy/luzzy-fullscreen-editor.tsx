/**
 * LUZZY 全屏编辑器组件
 *
 * v0.3.0 新增：
 * - 顶部工具栏：markdown 实时渲染开关 + 12 个格式工具 icon
 * - 中间：大文本编辑区（支持实时 markdown 渲染预览）
 * - 底部：关闭 + 发送按钮
 * - 进入动画：从底部滑入 + 淡入
 * - 退出动画：向下滑出 + 淡出
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Sigma,
  Code,
  CodeXml,
  Eye,
  EyeOff,
  Send,
  X,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import Markdown from "~/components/markdown/markdown";
import { pressable, pressableSubtle } from "~/lib/motion-presets";

interface LuzzyFullscreenEditorProps {
  /** 是否打开 */
  open: boolean;
  /** 开关回调 */
  onOpenChange: (open: boolean) => void;
  /** 文本值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 发送回调 */
  onSend: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/** 工具栏工具定义 */
interface ToolbarTool {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action: (text: string, textarea: HTMLTextAreaElement) => { text: string; selectionStart: number; selectionEnd: number };
}

/** 在选中文本前后包裹标记 */
function wrapSelection(text: string, textarea: HTMLTextAreaElement, prefix: string, suffix: string = prefix): { text: string; selectionStart: number; selectionEnd: number } {
  const { selectionStart, selectionEnd } = textarea;
  const selected = text.slice(selectionStart, selectionEnd);
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const newText = `${before}${prefix}${selected || "文本"}${suffix}${after}`;
  const newStart = selectionStart + prefix.length;
  const newEnd = newStart + (selected || "文本").length;
  return { text: newText, selectionStart: newStart, selectionEnd: newEnd };
}

/** 在行首添加标记 */
function prependLines(text: string, textarea: HTMLTextAreaElement, marker: string): { text: string; selectionStart: number; selectionEnd: number } {
  const { selectionStart, selectionEnd } = textarea;
  const selected = text.slice(selectionStart, selectionEnd) || "列表项";
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const lines = selected.split("\n").map((line) => `${marker}${line}`);
  const newText = `${before}${lines.join("\n")}${after}`;
  return { text: newText, selectionStart, selectionEnd: selectionStart + lines.join("\n").length };
}

/** 工具栏工具列表 */
const TOOLBAR_TOOLS: ToolbarTool[] = [
  {
    id: "bold",
    icon: Bold,
    title: "加粗",
    action: (text, ta) => wrapSelection(text, ta, "**"),
  },
  {
    id: "italic",
    icon: Italic,
    title: "斜体",
    action: (text, ta) => wrapSelection(text, ta, "*"),
  },
  {
    id: "underline",
    icon: Underline,
    title: "下划线",
    action: (text, ta) => wrapSelection(text, ta, "<u>", "</u>"),
  },
  {
    id: "strikethrough",
    icon: Strikethrough,
    title: "删除线",
    action: (text, ta) => wrapSelection(text, ta, "~~"),
  },
  {
    id: "unordered-list",
    icon: List,
    title: "无序列表",
    action: (text, ta) => prependLines(text, ta, "- "),
  },
  {
    id: "ordered-list",
    icon: ListOrdered,
    title: "有序列表",
    action: (text, ta) => prependLines(text, ta, "1. "),
  },
  {
    id: "task-list",
    icon: ListChecks,
    title: "任务列表",
    action: (text, ta) => prependLines(text, ta, "- [ ] "),
  },
  {
    id: "quote",
    icon: Quote,
    title: "引用",
    action: (text, ta) => prependLines(text, ta, "> "),
  },
  {
    id: "tex-formula",
    icon: Sigma,
    title: "TeX 公式",
    action: (text, ta) => wrapSelection(text, ta, "$$", "$$"),
  },
  {
    id: "inline-code",
    icon: Code,
    title: "行内代码",
    action: (text, ta) => wrapSelection(text, ta, "`"),
  },
  {
    id: "code-block",
    icon: CodeXml,
    title: "代码块",
    action: (text, ta) => wrapSelection(text, ta, "```\n", "\n```"),
  },
];

export function LuzzyFullscreenEditor({
  open,
  onOpenChange,
  value,
  onChange,
  onSend,
  disabled = false,
}: LuzzyFullscreenEditorProps) {
  const reduceMotion = useReducedMotion();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [enablePreview, setEnablePreview] = React.useState(false);

  /** 工具按钮点击 */
  const handleToolClick = (tool: ToolbarTool) => {
    if (!enablePreview) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = tool.action(value, textarea);
    onChange(result.text);
    // 延迟设置选区，等待 React 更新 DOM
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  /** 关闭编辑器 */
  const handleClose = () => {
    onOpenChange(false);
  };

  /** 发送 */
  const handleSend = () => {
    if (!disabled && value.trim()) {
      onSend();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col bg-background"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: "100%" }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: "100%" }}
          transition={reduceMotion ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 30 }}
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          {/* 顶部工具栏（长而窄） */}
          <div className="flex items-center gap-1 border-b border-border/20 px-2 py-1.5">
            {/* markdown 实时渲染开关 */}
            <Button
              variant={enablePreview ? "default" : "ghost"}
              size="sm"
              onClick={() => setEnablePreview(!enablePreview)}
              className="shrink-0 gap-1.5"
              title={enablePreview ? "关闭实时渲染" : "开启实时渲染"}
              {...pressableSubtle}
            >
              {enablePreview ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              <span className="text-xs">渲染</span>
            </Button>

            <div className="mx-1 h-5 w-px bg-border/30" />

            {/* 12 个格式工具 */}
            <div className="flex flex-1 items-center gap-0.5 overflow-x-auto">
              {TOOLBAR_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const isDisabled = !enablePreview;
                return (
                  <Button
                    key={tool.id}
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToolClick(tool)}
                    disabled={isDisabled}
                    className="size-8 shrink-0"
                    title={tool.title}
                    {...pressableSubtle}
                  >
                    <Icon className={cn("size-4", isDisabled && "opacity-30")} />
                  </Button>
                );
              })}
            </div>

            <div className="mx-1 h-5 w-px bg-border/30" />

            {/* 关闭按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="shrink-0"
              title="关闭"
              {...pressableSubtle}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* 中间：编辑区 + 预览区 */}
          <div className="flex flex-1 overflow-hidden">
            {/* 编辑区 */}
            <div className={cn("flex flex-col", enablePreview ? "w-1/2 border-r border-border/20" : "w-full")}>
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="输入消息内容..."
                disabled={disabled}
                className="flex-1 resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm focus-visible:ring-0"
                style={{ fontFamily: "AlibabaPuHuiTi-3, monospace" }}
              />
            </div>

            {/* 预览区（仅启用渲染时显示） */}
            {enablePreview && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="w-1/2 overflow-hidden"
              >
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {value.trim() ? (
                      <Markdown content={value} />
                    ) : (
                      <p className="text-sm text-muted-foreground">预览区域为空</p>
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </div>

          {/* 底部：发送按钮 */}
          <div
            className="flex items-center justify-end gap-2 border-t border-border/20 px-4 py-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            <Button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="gap-1.5"
              {...pressable}
            >
              <Send className="size-4" />
              发送
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
