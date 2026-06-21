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
import Markdown from "~/components/markdown/markdown";
import { pressable, pressableSubtle } from "~/lib/motion-presets";
import { IconMinus, IconFont } from "~/components/luzzy/luzzy-icons";

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

/** v0.4.0: 规范化换行符，确保预览区换行数与输入一致
 *
 * remarkBreaks 已将单个 \n 转为 <br>，但 3+ 连续 \n 会被 Markdown 压缩为单个段落分隔。
 * 此函数将 3+ 连续 \n 转为 \n\n（段落分隔）+ 显式 <br> 标签，确保每个换行符都可见。
 * Markdown 组件使用 rehypeRaw，支持渲染原始 HTML 标签。
 */
function normalizeNewlines(text: string): string {
  return text.replace(/\n{3,}/g, (match) => {
    const extraBreaks = match.length - 2;
    return '\n\n' + '<br>\n'.repeat(extraBreaks);
  });
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
    id: "heading",
    icon: IconFont,
    title: "标题",
    action: (text, ta) => {
      const { selectionStart, selectionEnd } = ta;
      const selected = text.slice(selectionStart, selectionEnd) || "标题";
      const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = text.slice(lineStart, selectionStart);
      const headingMatch = currentLine.match(/^(#{1,3})\s/);

      if (headingMatch) {
        // v0.3.2: 已有标题，循环切换 H1→H2→H3→H1
        const currentLevel = headingMatch[1].length;
        const nextLevel = currentLevel >= 3 ? 1 : currentLevel + 1;
        const newPrefix = "#".repeat(nextLevel) + " ";
        const beforeLine = text.slice(0, lineStart);
        const afterPrefix = text.slice(lineStart + headingMatch[0].length);
        const newText = `${beforeLine}${newPrefix}${selected}${afterPrefix}`;
        const newStart = lineStart + newPrefix.length;
        const newEnd = newStart + selected.length;
        return { text: newText, selectionStart: newStart, selectionEnd: newEnd };
      }

      // v0.3.2: 无标题，添加 H1
      const before = text.slice(0, lineStart);
      const after = text.slice(lineStart);
      const newText = `${before}# ${selected}${after}`;
      const newStart = lineStart + 2;
      const newEnd = newStart + selected.length;
      return { text: newText, selectionStart: newStart, selectionEnd: newEnd };
    },
  },
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
    id: "divider",
    icon: IconMinus,
    title: "分割线",
    action: (text, ta) => {
      const { selectionStart } = ta;
      const before = text.slice(0, selectionStart);
      const after = text.slice(selectionStart);
      const newText = `${before}\n---\n${after}`;
      const newCursor = selectionStart + 5;
      return { text: newText, selectionStart: newCursor, selectionEnd: newCursor };
    },
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
  const previewRef = React.useRef<HTMLDivElement>(null);
  const isSyncing = React.useRef(false);
  const [enablePreview, setEnablePreview] = React.useState(false);

  /** v0.3.2: 同步滚动（双向）— 编辑区滚动时同步预览区
   *  v0.4.0: 修复比例计算，添加边界检查，使用 flex-1 替代 h-1/2 确保容器正确尺寸
   */
  const handleEditorScroll = () => {
    if (isSyncing.current) return;
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const editorMaxScroll = textarea.scrollHeight - textarea.clientHeight;
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    // v0.4.0: 边界检查 — 任一区域不可滚动时跳过
    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return;

    isSyncing.current = true;
    const ratio = textarea.scrollTop / editorMaxScroll;
    preview.scrollTop = ratio * previewMaxScroll;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  /** v0.3.2: 同步滚动（双向）— 预览区滚动时同步编辑区
   *  v0.4.0: 修复比例计算，添加边界检查
   */
  const handlePreviewScroll = () => {
    if (isSyncing.current) return;
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;

    const editorMaxScroll = textarea.scrollHeight - textarea.clientHeight;
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    if (editorMaxScroll <= 0 || previewMaxScroll <= 0) return;

    isSyncing.current = true;
    const ratio = preview.scrollTop / previewMaxScroll;
    textarea.scrollTop = ratio * editorMaxScroll;
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

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

          {/* 中间：编辑区 + 预览区（上下分栏） */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* 编辑区（上） */}
            {/* v0.4.0: 使用 flex-1 替代 h-1/2 确保在 flex 容器中正确分配高度 */}
            <div className={cn("flex flex-col", enablePreview ? "flex-1 border-b border-border/20" : "h-full")}>
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleEditorScroll}
                placeholder="输入消息内容..."
                disabled={disabled}
                className="flex-1 resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm focus-visible:ring-0"
                style={{ fontFamily: "AlibabaPuHuiTi-3, monospace", whiteSpace: "pre-wrap" }}
              />
            </div>

            {/* 预览区（下，仅启用渲染时显示） */}
            {/* v0.4.0: 使用 flex-1 替代 h-1/2 确保与编辑区等高分配 */}
            {enablePreview && (
              <motion.div
                ref={previewRef}
                onScroll={handlePreviewScroll}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-y-auto overflow-x-hidden"
              >
                <div className="p-4">
                  {value.trim() ? (
                    <Markdown content={normalizeNewlines(value)} />
                  ) : (
                    <p className="text-sm text-muted-foreground">预览区域为空</p>
                  )}
                </div>
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
