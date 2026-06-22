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
  IconArrowDown,
  IconArrowUp,
} from "~/components/luzzy/luzzy-icons";

import type { ChatMessage, MemoryRecall } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { copyTextToClipboard } from "~/lib/clipboard";
import { toast } from "sonner";
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
import { useAppStore } from "~/stores";
import { LuzzyAgentSteps } from "~/components/luzzy/luzzy-agent-steps";
import { LuzzyThinkingTimeline } from "~/components/luzzy/luzzy-thinking-timeline";
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
  /** 翻译回调（返回 Promise 以支持加载状态跟踪） */
  onTranslate?: (message: ChatMessage) => void | Promise<void>;
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

/** 思考链（CoT）可折叠卡片（v0.3.4: Timeline 节点 UI 重构） */
function CotCard({
  cot,
  isGenerating,
}: {
  cot: string;
  isGenerating: boolean;
}) {
  // v0.4.3: 生成中默认展开,生成完成后保持展开(仅用户手动点击才收起)
  const [expanded, setExpanded] = React.useState(true);

  /** 用户点击切换 */
  const handleToggle = () => {
    setExpanded((prev) => !prev);
  };

  // 截断预览（收起时显示前 80 字符）
  const preview = cot.length > 80 ? cot.slice(0, 80) + "..." : cot;

  return (
    <div className="w-full rounded-md border border-muted bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <IconLight className="size-3.5 shrink-0" />
        <span className="shrink-0">{isGenerating ? "思考中..." : "思考过程"}</span>
        {!expanded && !isGenerating && (
          <span className="ml-1 min-w-0 flex-1 truncate text-[11px] opacity-60">{preview}</span>
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
            <div className="border-t border-muted">
              <LuzzyThinkingTimeline cot={cot} isGenerating={isGenerating} />
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
  spinning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      {...pressableSubtle}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <Icon className={cn("size-4", spinning && "animate-spin text-blue-500")} />
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
        <IconChevronLeft className="size-4" />
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
        <IconChevronRight className="size-4" />
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

  // v0.3.7: 引号高亮设置
  const highlightSettings = useAppStore((s) => s.highlightSettings);

  // 更多弹窗状态
  const [moreDialogOpen, setMoreDialogOpen] = React.useState(false);
  // 选择复制（原始文本）二级弹窗
  const [rawCopyDialogOpen, setRawCopyDialogOpen] = React.useState(false);
  // 翻译加载状态（v0.3.3：前端动画提示）
  const [translating, setTranslating] = React.useState(false);

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

  /** 处理翻译（异步，跟踪加载状态用于动画反馈） */
  const handleTranslate = React.useCallback(async () => {
    if (translating || hasTranslation) return;
    setTranslating(true);
    try {
      await onTranslate?.(message);
    } finally {
      setTranslating(false);
    }
  }, [onTranslate, message, translating, hasTranslation]);

  /** 处理更多弹窗 */
  const handleMore = React.useCallback(() => {
    setMoreDialogOpen(true);
  }, []);

  /** 复制原始文本（不渲染 markdown） */
  const handleCopyRaw = React.useCallback(async () => {
    try {
      await copyTextToClipboard(message.content);
      setRawCopyDialogOpen(false);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
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

        {/* v0.4.3: 工具调用步骤合并到 CotCard 下方纵列(与思考卡片排成一列) */}
        {!isUser && message.agentSteps && message.agentSteps.length > 0 && (
          <LuzzyAgentSteps
            steps={message.agentSteps.filter(
              (s) => !(s.type === "thinking" && message.cot)
            )}
          />
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
          style={
            highlightSettings.enabled && !isUser
              ? { "--luzzy-highlight-color": highlightSettings.color } as React.CSSProperties
              : undefined
          }
        >
          {isLoading ? (
            <TypingIndicator />
          ) : message.content ? (
            // v0.4.3: isAnimating 动态化,生成中且为最后一条消息时启用流式动画
            <Markdown content={message.content} isAnimating={isGenerating && isLast && !message.content?.endsWith("*-- 生成已中止 --*")} />
          ) : isGenerating && isLast && message.cot ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconRefresh className="size-3 animate-spin" />
              <span>正在思考中，请查看上方思考卡片...</span>
            </div>
          ) : null}

          {/* 错误信息 */}
          {hasError && (
            <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
              {message.error}
            </pre>
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
            icon={translating ? IconRefresh : IconBook}
            label={translating ? "翻译中" : "翻译"}
            onClick={handleTranslate}
            disabled={isGenerating || hasTranslation || translating}
            spinning={translating}
          />
          <ActionButton
            icon={IconMenu}
            label="更多"
            onClick={handleMore}
          />
        </div>

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
        <DialogContent className="min-w-0 overflow-hidden max-w-xs">
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
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-2xl">
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
