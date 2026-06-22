/**
 * 所有会话列表组件
 *
 * 显示所有会话，支持时间分类（今天/昨天/本周/更早）和搜索。
 * 从上往下排列每次会话的标题。
 */

import * as React from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "motion/react";
import {
  IconSearch,
  IconClose,
  IconGrid,
  IconClock,
  IconTrash,
  IconPlus,
  IconShare,
} from "~/components/luzzy/luzzy-icons";

import type { Session } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "~/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "~/components/ui/dialog";
import { springEnter, pressableSubtle } from "~/lib/motion-presets";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";

interface AllSessionsListProps {
  /** 所有会话列表 */
  sessions: Session[];
  /** 当前会话 ID */
  currentSessionId: string | null;
  /** 是否支持语义搜索 */
  semanticSearchEnabled: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 切换会话回调 */
  onSwitchSession: (id: string) => void;
  /** 新建会话回调 */
  onCreateSession: () => void;
  /** 删除会话回调 */
  onDeleteSession: (id: string) => void;
  /** 重命名会话回调 */
  onRenameSession: (id: string, title: string) => void;
  /** v0.3.2: 右滑分享会话回调 */
  onShareSession: (id: string) => void;
}

/** 时间分类 */
type TimeGroup = "today" | "yesterday" | "thisWeek" | "earlier";

/** 时间分组标签 */
const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
  today: "今天",
  yesterday: "昨天",
  thisWeek: "本周",
  earlier: "更早",
};

/** 时间分组顺序 */
const TIME_GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "thisWeek", "earlier"];

/** 判断会话属于哪个时间分组 */
function getTimeGroup(timestamp: number): TimeGroup {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  if (timestamp >= todayStart) return "today";
  if (timestamp >= yesterdayStart) return "yesterday";
  if (timestamp >= weekStart) return "thisWeek";
  return "earlier";
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

export function AllSessionsList({
  sessions,
  currentSessionId,
  semanticSearchEnabled,
  onClose,
  onSwitchSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  onShareSession,
}: AllSessionsListProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<"keyword" | "semantic">(
    "keyword",
  );
  const [renamingSession, setRenamingSession] = React.useState<Session | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const confirm = useConfirm();

  /** 过滤后的会话 */
  const filteredSessions = React.useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.characterName.toLowerCase().includes(query),
    );
  }, [sessions, searchQuery]);

  /** 按时间分组 */
  const groupedSessions = React.useMemo(() => {
    const groups: Record<TimeGroup, Session[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      earlier: [],
    };
    for (const session of filteredSessions) {
      const group = getTimeGroup(session.updatedAt);
      groups[group].push(session);
    }
    // 每组内按更新时间倒序
    for (const key of Object.keys(groups) as TimeGroup[]) {
      groups[key].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return groups;
  }, [filteredSessions]);

  /** 打开重命名弹窗 */
  const handleOpenRename = (session: Session) => {
    setRenamingSession(session);
    setRenameTitle(session.title);
  };

  /** 确认重命名 */
  const handleConfirmRename = () => {
    if (renamingSession && renameTitle.trim()) {
      onRenameSession(renamingSession.id, renameTitle.trim());
    }
    setRenamingSession(null);
    setRenameTitle("");
  };

  return (
    <motion.div
      {...springEnter}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl"
    >
      {/* 顶部栏 */}
      <header
        className="flex shrink-0 items-center gap-2 border-b border-border/20 bg-background/40 px-4 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(2.75rem + env(safe-area-inset-top))" }}
      >
        <IconGrid className="size-5 text-muted-foreground" />
        <h1 className="flex-1 text-base font-semibold">所有会话</h1>
        <Button variant="ghost" size="icon" onClick={onCreateSession} {...pressableSubtle}>
          <IconPlus className="size-4" />
        </Button>
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
            placeholder="搜索会话标题或角色名..."
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

      {/* 会话列表 */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3">
          {filteredSessions.length === 0 ? (
            <motion.div
              {...springEnter}
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
            >
              <IconGrid className="mb-2 size-8 opacity-40" />
              <p className="text-sm">
                {searchQuery ? "未找到匹配的会话" : "暂无会话记录"}
              </p>
            </motion.div>
          ) : (
            TIME_GROUP_ORDER.map((group) => {
              const groupSessions = groupedSessions[group];
              if (groupSessions.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-2">
                  <div className="px-1 text-xs font-medium text-muted-foreground/60">
                    {TIME_GROUP_LABELS[group]}（{groupSessions.length}）
                  </div>
                  <AnimatePresence mode="popLayout">
                    {groupSessions.map((session) => (
                      <SessionSwipeItem
                        key={session.id}
                        session={session}
                        isActive={session.id === currentSessionId}
                        onSwitch={onSwitchSession}
                        onRename={handleOpenRename}
                        onDelete={async (id) => {
                          const ok = await confirm({
                            title: "操作确认",
                            description: `确定删除会话「${session.title || "未命名"}」吗？此操作不可撤销。`,
                            destructive: true,
                          });
                          if (ok) {
                            onDeleteSession(id);
                          }
                        }}
                        onShare={onShareSession}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* 重命名弹窗 */}
      <Dialog open={!!renamingSession} onOpenChange={(open) => !open && setRenamingSession(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-xs">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>为会话设置一个新的标题</DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="会话标题"
            autoFocus
            className="max-w-full"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingSession(null)}>
              取消
            </Button>
            <Button onClick={handleConfirmRename}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/**
 * v0.3.2: 可滑动的会话项
 *
 * 左滑超过 80px 触发删除，右滑超过 80px 触发分享。
 * 使用 motion drag + useMotionValue + useTransform 实现丝滑动画。
 */
interface SessionSwipeItemProps {
  session: Session;
  isActive: boolean;
  onSwitch: (id: string) => void;
  onRename: (session: Session) => void;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

function SessionSwipeItem({
  session,
  isActive,
  onSwitch,
  onRename,
  onDelete,
  onShare,
}: SessionSwipeItemProps) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-120, -60], [1, 0]);
  const shareOpacity = useTransform(x, [60, 120], [0, 1]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* 背景层：左删除 + 右分享 */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <motion.div
          style={{ opacity: deleteOpacity }}
          className="flex items-center gap-2 text-destructive"
        >
          <IconTrash className="size-5" />
          <span className="text-sm font-medium">删除</span>
        </motion.div>
        <motion.div
          style={{ opacity: shareOpacity }}
          className="flex items-center gap-2 text-primary"
        >
          <span className="text-sm font-medium">分享</span>
          <IconShare className="size-5" />
        </motion.div>
      </div>
      {/* 前景层：原会话内容 */}
      <motion.div
        layout
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.15}
        style={{ x }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) {
            // v0.4.3: 先回弹到原位,再触发 onDelete,避免会话保持左滑状态
            animate(x, 0, {
              duration: 0.3,
              onComplete: () => onDelete(session.id),
            });
          } else if (info.offset.x > 80) {
            // v0.4.3: 先回弹再触发分享
            animate(x, 0, { duration: 0.3, onComplete: () => onShare(session.id) });
          } else {
            // v0.3.5: 确保未触发删除/分享时回弹到原位，避免删除状态保持
            animate(x, 0, { duration: 0.3 });
          }
        }}
        {...springEnter}
        className={cn(
          "group flex items-center gap-3 rounded-xl border border-border/20 bg-card/50 p-3 transition-colors",
          isActive ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50",
        )}
      >
        <button
          className="flex flex-1 flex-col gap-1 text-left"
          onClick={() => onSwitch(session.id)}
        >
          <div className="flex items-center justify-between gap-2">
            {/* v0.3.5: 仅点击标题文字触发重命名，停止冒泡避免触发切换 */}
            <span
              className="truncate text-sm font-medium hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onRename(session);
              }}
            >
              {session.title}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/70">
              <IconClock className="size-3" />
              {formatTime(session.updatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{session.characterName}</span>
            <span>·</span>
            <span>{session.messages.length} 条消息</span>
          </div>
        </button>
        {/* v0.3.7: 显式删除按钮，避免用户难以发现左滑删除 */}
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.id);
          }}
          aria-label="删除会话"
        >
          <IconTrash className="size-4" />
        </button>
      </motion.div>
    </div>
  );
}
