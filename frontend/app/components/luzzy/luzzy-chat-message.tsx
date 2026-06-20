/**
 * LUZZY 聊天消息组件
 *
 * 接收 LUZZY 的 ChatMessage 类型，复用 rikkahub 的 Markdown 渲染。
 * - 用户消息右对齐，AI 消息左对齐 + 角色头像
 * - 渲染 cot（思考链）字段
 * - 渲染 toolCalls（工具调用）
 * - 渲染 memoryRecalls（记忆召回）
 * - 消息操作：附着按钮组（复制/重试/翻译/更多）
 * - 重试分支切换（左右箭头）
 * - 翻译结果折叠展示
 * - 更多弹窗（选择复制/编辑/分享/创建分支/删除）
 * - 加载状态：TypingIndicator
 * - 错误状态：红色边框
 */

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconCopyEdit,
  IconRefresh,
  IconBook,
  IconMenu,
  IconEdit,
  IconShare,
  IconBranch,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconLight,
  IconToolKit,
  IconCheck,
  IconExclamation,
  IconClock,
  IconArrowDown,
  IconArrowUp,
} from "~/components/luzzy/luzzy-icons";

import type { ChatMessage, ToolCall, MemoryRecall } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "~/components/ui/dialog";
import { TypingIndicator } from "~/components/ui/typing-indicator";
import Markdown from "~/components/markdown/markdown";
import { LuzzyTokenUsageBar } from "~/components/luzzy/luzzy-token-usage-bar";
import { LuzzyAgentSteps } from "~/components/luzzy/luzzy-agent-steps";
import { pressableSubtle } from "~/lib/motion-presets";

interface LuzzyChatMessageProps {
  message: ChatMessage;
  /** 角色卡头像 URL */
  avatarUrl?: string;
  /** 角色卡名称 */
  avatarName?: string;
  /** 是否为最后一条消息 */
  isLast?: boolean;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 复制回调 */
  onCopy?: (message: ChatMessage) => void;
  /** 编辑回调 */
  onEdit?: (message: ChatMessage) => void;
  /** 删除回调 */
  onDelete?: (message: ChatMessage) => void;
  /** 重新生成回调（agent 消息重试上一条 user 请求） */
  onRegenerate?: (message: ChatMessage) => void;
  /** 重试回调（user 消息重试=根据当前 user 重新生成；agent 消息重试上一条 user） */
  onRetry?: (message: ChatMessage) => void;
  /** 翻译回调 */
  onTranslate?: (message: ChatMessage) => void;
  /** 分享回调 */
  onShare?: (message: ChatMessage) => void;
  /** 创建分支回调 */
  onCreateBranch?: (message: ChatMessage) => void;
  /** 切换重试版本 */
  onSwitchRetryVersion?: (message: ChatMessage, direction: "prev" | "next") => void;
  /** 重试版本总数 */
  retryVersionCount?: number;
  /** 当前重试版本索引 */
  retryCurrentIndex?: number;
}

/** 工具调用状态图标 */
function ToolCallStatusIcon({ status }: { status: ToolCall["status"] }) {
  switch (status) {
    case "completed":
      return <IconCheck className="size-3.5 text-green-500" />;
    case "error":
      return <IconExclamation className="size-3.5 text-destructive" />;
    case "running":
    case "receiving":
    case "queued":
    case "continuing":
      return <IconRefresh className="size-3.5 animate-spin text-blue-500" />;
    default:
      return <IconClock className="size-3.5 text-muted-foreground" />;
  }
}

/** 工具调用卡片 */
function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-md border border-muted bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <IconToolKit className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{toolCall.toolName}</span>
        {toolCall.mcpSubToolName && (
          <span className="text-xs text-muted-foreground">
            / {toolCall.mcpSubToolName}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <ToolCallStatusIcon status={toolCall.status} />
          <span className="text-xs text-muted-foreground">{toolCall.status}</span>
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-muted px-3 py-2">
          {toolCall.reason && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">原因：</span>
              <p className="text-xs text-muted-foreground">{toolCall.reason}</p>
            </div>
          )}
          <div>
            <span className="text-xs font-medium text-muted-foreground">查询：</span>
            <code className="block rounded bg-background/50 p-1.5 text-xs">
              {toolCall.query}
            </code>
          </div>
          {toolCall.result && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">结果：</span>
              <pre className="max-h-40 overflow-auto rounded bg-background/50 p-1.5 text-xs whitespace-pre-wrap">
                {toolCall.result}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <span className="text-xs font-medium text-destructive">错误：</span>
              <p className="text-xs text-destructive">{toolCall.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 记忆召回折叠区 */
function MemoryRecallsCard({ recalls }: { recalls: MemoryRecall[] }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-md border border-muted bg-muted/20 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/40"
        onClick={() => setExpanded(!expanded)}
      >
        <IconLight className="size-3.5" />
        <span>记忆召回（{recalls.length}）</span>
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-muted px-3 py-2">
          {recalls.map((recall) => (
            <div key={recall.id} className="rounded bg-background/50 p-1.5 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  相似度 {(recall.score * 100).toFixed(1)}%
                </Badge>
                <span className="text-muted-foreground">第 {recall.turn} 轮</span>
              </div>
              <p className="text-muted-foreground">{recall.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 思考链（CoT）可折叠卡片 */
function CotCard({
  cot,
  isGenerating,
}: {
  cot: string;
  isGenerating: boolean;
}) {
  // 生成中默认展开，生成结束默认收起
  const [expanded, setExpanded] = React.useState(isGenerating);
  // 用户手动切换标记
  const [userToggled, setUserToggled] = React.useState(false);

  // 生成状态变化时自动调整（仅当用户未手动操作过）
  React.useEffect(() => {
    if (!userToggled) {
      setExpanded(isGenerating);
    }
  }, [isGenerating, userToggled]);

  /** 用户点击切换 */
  const handleToggle = () => {
    setUserToggled(true);
    setExpanded((prev) => !prev);
  };

  // 截断预览（收起时显示前 80 字符）
  const preview = cot.length > 80 ? cot.slice(0, 80) + "..." : cot;

  return (
    <div className="w-full rounded-md border border-muted bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <IconLight className="size-3.5" />
        <span>{isGenerating ? "思考中..." : "思考过程"}</span>
        {!expanded && !isGenerating && (
          <span className="ml-1 truncate text-[11px] opacity-60">{preview}</span>
        )}
        <span className="ml-auto shrink-0">
          {expanded ? (
            <IconArrowUp className="size-3.5" />
          ) : (
            <IconArrowDown className="size-3.5" />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="cot-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-muted px-3 py-2 text-sm text-muted-foreground">
              <Markdown content={cot} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 附着操作按钮（单个） */
function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      {...pressableSubtle}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </motion.button>
  );
}

/** 重试版本切换器 */
function RetryVersionSwitcher({
  current,
  total,
  onSwitch,
}: {
  current: number;
  total: number;
  onSwitch: (direction: "prev" | "next") => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <motion.button
        type="button"
        onClick={() => onSwitch("prev")}
        disabled={current <= 0}
        {...pressableSubtle}
        className="rounded-md p-1 transition-colors hover:bg-accent disabled:opacity-30"
        aria-label="上一个版本"
      >
        <IconChevronLeft className="size-3.5" />
      </motion.button>
      <span>
        {current + 1} / {total}
      </span>
      <motion.button
        type="button"
        onClick={() => onSwitch("next")}
        disabled={current >= total - 1}
        {...pressableSubtle}
        className="rounded-md p-1 transition-colors hover:bg-accent disabled:opacity-30"
        aria-label="下一个版本"
      >
        <IconChevronRight className="size-3.5" />
      </motion.button>
    </div>
  );
}

/** 翻译结果折叠卡片 */
function TranslationCard({
  translatedContent,
  language,
}: {
  translatedContent: string;
  language?: string;
}) {
  const [expanded, setExpanded] = React.useState(true);
  return (
    <div className="w-full rounded-md border border-primary/20 bg-primary/5 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-primary/10"
        onClick={() => setExpanded(!expanded)}
      >
        <IconBook className="size-3.5" />
        <span>翻译（{language || "简体中文"}）</span>
      </button>
      {expanded && (
        <div className="border-t border-primary/20 px-3 py-2 text-foreground">
          <Markdown content={translatedContent} />
        </div>
      )}
    </div>
  );
}

/** LUZZY 聊天消息 */
export function LuzzyChatMessage({
  message,
  avatarUrl,
  avatarName,
  isLast,
  isGenerating,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
  onRetry,
  onTranslate,
  onShare,
  onCreateBranch,
  onSwitchRetryVersion,
  retryVersionCount,
  retryCurrentIndex,
}: LuzzyChatMessageProps) {
  const isUser = message.role === "user";
  const isLoading = message.loading && !message.content;
  const hasError = Boolean(message.error);
  const hasTranslation = Boolean(message.translatedContent);
  const hasRetryVersions = (retryVersionCount ?? 0) > 1;

  // 更多弹窗状态
  const [moreDialogOpen, setMoreDialogOpen] = React.useState(false);
  // 选择复制（原始文本）二级弹窗
  const [rawCopyDialogOpen, setRawCopyDialogOpen] = React.useState(false);

  /** 处理复制 */
  const handleCopy = React.useCallback(() => {
    onCopy?.(message);
  }, [onCopy, message]);

  /** 处理重试 */
  const handleRetry = React.useCallback(() => {
    // user 消息：重试=根据当前 user 重新生成
    // agent 消息：重试上一条 user 的请求（由父组件处理）
    if (isUser) {
      onRetry?.(message);
    } else {
      onRegenerate?.(message);
    }
  }, [isUser, onRetry, onRegenerate, message]);

  /** 处理翻译 */
  const handleTranslate = React.useCallback(() => {
    onTranslate?.(message);
  }, [onTranslate, message]);

  /** 处理更多弹窗 */
  const handleMore = React.useCallback(() => {
    setMoreDialogOpen(true);
  }, []);

  /** 复制原始文本（不渲染 markdown） */
  const handleCopyRaw = React.useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setRawCopyDialogOpen(false);
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        "flex w-full gap-3 px-4 py-2",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* 头像 */}
      {!isUser && (
        <Avatar className="size-8 shrink-0">
          <AvatarImage src={avatarUrl} alt={avatarName} />
          <AvatarFallback className="text-xs">
            {avatarName?.charAt(0) || "AI"}
          </AvatarFallback>
        </Avatar>
      )}

      {/* 消息内容 */}
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* 思考链 */}
        {!isUser && message.cot && (
          <CotCard cot={message.cot} isGenerating={Boolean(isGenerating && isLast)} />
        )}

        {/* 工具调用 */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex w-full flex-col gap-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* 记忆召回 */}
        {!isUser && message.memoryRecalls && message.memoryRecalls.length > 0 && (
          <MemoryRecallsCard recalls={message.memoryRecalls} />
        )}

        {/* 消息正文 */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "bg-primary/90 text-primary-foreground [&_.markdown]:!text-primary-foreground [&_.markdown_a]:!text-primary-foreground/80 [&_.markdown_code]:!text-primary-foreground"
              : "bg-muted text-foreground",
            hasError && "border-2 border-destructive",
          )}
        >
          {isLoading ? (
            <TypingIndicator />
          ) : message.content ? (
            <Markdown content={message.content} isAnimating={isGenerating && isLast} />
          ) : null}

          {/* 错误信息 */}
          {hasError && (
            <div className="mt-2 text-xs text-destructive">{message.error}</div>
          )}

          {/* 生成中止标记 */}
          {message.content?.endsWith("*-- 生成已中止 --*") && (
            <div className="mt-1 text-xs text-muted-foreground">（已中止）</div>
          )}
        </div>

        {/* 翻译结果展示 */}
        {hasTranslation && (
          <TranslationCard
            translatedContent={message.translatedContent!}
            language={message.translationLanguage}
          />
        )}

        {/* 重试版本切换器 */}
        {hasRetryVersions && (
          <RetryVersionSwitcher
            current={retryCurrentIndex ?? 0}
            total={retryVersionCount ?? 1}
            onSwitch={(dir) => onSwitchRetryVersion?.(message, dir)}
          />
        )}

        {/* 消息元信息 + 附着操作按钮组 */}
        <div
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          {/* 生成耗时 */}
          {message.generationTime && (
            <span className="mr-1">{(message.generationTime / 1000).toFixed(1)}s</span>
          )}

          {/* 附着操作按钮组：复制/重试/翻译/更多 */}
          <ActionButton
            icon={IconCopyEdit}
            label="复制"
            onClick={handleCopy}
          />
          <ActionButton
            icon={IconRefresh}
            label="重试"
            onClick={handleRetry}
            disabled={isGenerating}
          />
          <ActionButton
            icon={IconBook}
            label="翻译"
            onClick={handleTranslate}
            disabled={isGenerating || hasTranslation}
          />
          <ActionButton
            icon={IconMenu}
            label="更多"
            onClick={handleMore}
          />
        </div>

        {/* Agent 执行步骤卡片（v0.3.0 新增，仅 Agent 消息显示） */}
        {!isUser && message.agentSteps && message.agentSteps.length > 0 && (
          <LuzzyAgentSteps steps={message.agentSteps} />
        )}

        {/* Token 使用统计行（v0.3.0 新增，仅 Agent 消息显示） */}
        {!isUser && message.tokenUsage && (
          <LuzzyTokenUsageBar
            usage={message.tokenUsage}
            isGenerating={!!message.loading}
          />
        )}
      </div>

      {/* 更多弹窗 */}
      <Dialog open={moreDialogOpen} onOpenChange={setMoreDialogOpen}>
        <DialogContent className="max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>更多操作</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {/* 选择复制（原始文本） */}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setMoreDialogOpen(false);
                setRawCopyDialogOpen(true);
              }}
            >
              <IconCopyEdit className="mr-2 size-4" />
              选择复制（原始文本）
            </Button>
            {/* 编辑 */}
            {onEdit && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setMoreDialogOpen(false);
                  onEdit(message);
                }}
              >
                <IconEdit className="mr-2 size-4" />
                编辑
              </Button>
            )}
            {/* 分享 */}
            {onShare && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setMoreDialogOpen(false);
                  onShare(message);
                }}
              >
                <IconShare className="mr-2 size-4" />
                分享
              </Button>
            )}
            {/* 创建分支 */}
            {onCreateBranch && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setMoreDialogOpen(false);
                  onCreateBranch(message);
                }}
              >
                <IconBranch className="mr-2 size-4" />
                创建分支
              </Button>
            )}
            {/* 删除 */}
            {onDelete && (
              <Button
                variant="ghost"
                className="justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  setMoreDialogOpen(false);
                  onDelete(message);
                }}
              >
                <IconTrash className="mr-2 size-4" />
                删除
              </Button>
            )}
          </div>
          <DialogClose asChild>
            <Button variant="outline" className="mt-2 w-full">
              关闭
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      {/* 选择复制（原始文本）二级弹窗 */}
      <Dialog open={rawCopyDialogOpen} onOpenChange={setRawCopyDialogOpen}>
        <DialogContent className="max-h-[80vh] max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>原始文本</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto rounded-md bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap break-words text-sm text-foreground">
              {message.content}
            </pre>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setRawCopyDialogOpen(false)}>
              关闭
            </Button>
            <Button className="flex-1" onClick={handleCopyRaw}>
              <IconCopyEdit className="mr-2 size-4" />
              复制全部
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
