/**
 * 当前会话轮次列表组件
 *
 * 显示当前会话的所有对话轮次，从上往下排列每轮对话的第一句话。
 * 支持关键词搜索和语义搜索（需配置嵌入模型）。
 * 点击轮次可跳转到对应位置。
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconSearch, IconClose, IconMessage, IconClock } from "~/components/luzzy/luzzy-icons";

import type { ChatMessage } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { springEnter, pressableSubtle } from "~/lib/motion-presets";

interface SessionListProps {
  /** 当前会话的消息列表 */
  messages: ChatMessage[];
  /** 是否支持语义搜索（已配置嵌入模型） */
  semanticSearchEnabled: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 跳转到指定消息回调 */
  onJumpToMessage: (messageId: string) => void;
}

/** 对话轮次 */
interface ConversationTurn {
  userMessage: ChatMessage;
  assistantMessage?: ChatMessage;
  turnIndex: number;
}

/** 将消息列表按轮次分组 */
function groupMessagesByTurns(messages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;
  let turnIndex = 0;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        userMessage: msg,
        turnIndex: turnIndex++,
      };
    } else if (msg.role === "assistant" && currentTurn) {
      currentTurn.assistantMessage = msg;
    }
  }
  if (currentTurn) turns.push(currentTurn);
  return turns;
}

/** 格式化时间戳 */
const formatTime = (ts: number): string => {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** 截取文本前 N 个字符 */
const truncate = (text: string, max: number = 60): string => {
  const clean = text.replace(/<[^>]*>/g, "").trim();
  return clean.length > max ? clean.slice(0, max) + "..." : clean;
};

export function SessionList({
  messages,
  semanticSearchEnabled,
  onClose,
  onJumpToMessage,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<"keyword" | "semantic">("keyword");

  const turns = React.useMemo(() => groupMessagesByTurns(messages), [messages]);

  const filteredTurns = React.useMemo(() => {
    if (!searchQuery.trim()) return turns;
    const query = searchQuery.toLowerCase();
    return turns.filter((turn) => {
      const userText = turn.userMessage.content.toLowerCase();
      const assistantText = turn.assistantMessage?.content.toLowerCase() ?? "";
      return userText.includes(query) || assistantText.includes(query);
    });
  }, [turns, searchQuery]);
  const deferredFilteredTurns = React.useDeferredValue(filteredTurns);

  return (
    <motion.div
      {...springEnter}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* 顶部栏 */}
      <header
        className="flex shrink-0 items-center gap-2 border-b border-border/20 bg-background/80 px-4"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(2.75rem + env(safe-area-inset-top))",
        }}
      >
        <IconMessage className="size-5 text-muted-foreground" />
        <h1 className="flex-1 text-base font-semibold">当前会话</h1>
        <Button variant="ghost" size="icon" onClick={onClose} {...pressableSubtle}>
          <IconClose className="size-4" />
        </Button>
      </header>

      {/* 搜索区 */}
      <div className="shrink-0 space-y-2 border-b border-border/20 p-3">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话内容..."
            className="pl-9"
          />
        </div>
        {semanticSearchEnabled && (
          <ToggleGroup
            type="single"
            value={searchMode}
            onValueChange={(v) => v && setSearchMode(v as "keyword" | "semantic")}
            className="justify-start"
          >
            <ToggleGroupItem value="keyword" size="sm">
              关键词搜索
            </ToggleGroupItem>
            <ToggleGroupItem value="semantic" size="sm">
              语义搜索
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* 轮次列表 */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          <AnimatePresence>
            {filteredTurns.length === 0 ? (
              <motion.div
                {...springEnter}
                className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              >
                <IconMessage className="mb-2 size-8 opacity-40" />
                <p className="text-sm">{searchQuery ? "未找到匹配的对话" : "暂无对话记录"}</p>
              </motion.div>
            ) : (
              deferredFilteredTurns.map((turn) => (
                <motion.button
                  key={turn.userMessage.id}
                  {...springEnter}
                  {...pressableSubtle}
                  onClick={() => onJumpToMessage(turn.userMessage.id)}
                  className={cn(
                    "cv-auto flex flex-col gap-1 rounded-xl border border-border/20 bg-card/50 p-3 text-left",
                    "transition-colors hover:bg-accent/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      第 {turn.turnIndex + 1} 轮
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                      <IconClock className="size-3" />
                      {formatTime(turn.userMessage.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">
                    {truncate(turn.userMessage.content)}
                  </p>
                  {turn.assistantMessage && (
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {truncate(turn.assistantMessage.content, 80)}
                    </p>
                  )}
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
