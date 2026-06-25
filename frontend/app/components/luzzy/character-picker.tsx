/**
 * 角色卡选择器组件
 *
 * 可折叠的角色卡列表，用于聊天页面侧边选择当前角色卡
 * v0.3.5: 增加标签筛选功能
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconSearch,
  IconUser,
  IconArrowDown,
  IconArrowUp,
  IconInfo,
} from "~/components/luzzy/luzzy-icons";

import type { Character } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import Markdown from "~/components/markdown/markdown";

interface CharacterPickerProps {
  /** 角色卡列表 */
  characters: Character[];
  /** 当前选中的角色卡 UUID */
  currentUuid?: string;
  /** 选择角色卡回调 */
  onSelect: (uuid: string) => void;
  /** 额外样式 */
  className?: string;
}

/** 角色卡选择器 */
export function CharacterPicker({
  characters,
  currentUuid,
  onSelect,
  className,
}: CharacterPickerProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  // v0.3.6: 角色卡描述展开/收起状态（按 uuid 记录）
  const [expandedCards, setExpandedCards] = React.useState<Set<string>>(new Set());
  // v0.3.6: 详情弹窗
  const [detailCharacter, setDetailCharacter] = React.useState<Character | null>(null);

  /** 切换某张卡的展开状态 */
  const toggleExpand = (uuid: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  // v0.3.5: 提取所有不重复标签
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    characters.forEach((c) => c.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [characters]);

  // v0.3.5: 标签筛选 + 关键词搜索组合过滤
  const filtered = React.useMemo(() => {
    let result = characters;
    if (selectedTags.length > 0) {
      result = result.filter((c) => selectedTags.every((t) => c.tags?.includes(t)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [characters, selectedTags, searchQuery]);
  const deferredFiltered = React.useDeferredValue(filtered);

  /** v0.3.5: 切换标签选中状态 */
  const toggleTag = React.useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* 搜索框 */}
      <div className="border-b p-2">
        <div className="relative">
          <IconSearch className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索角色卡..."
            className="pl-8"
          />
        </div>
        {/* v0.3.5: 标签筛选条 */}
        {allTags.length > 0 && (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            <AnimatePresence>
              {allTags.map((tag) => {
                const isActive = selectedTags.includes(tag);
                return (
                  <motion.button
                    key={tag}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs transition-transform active:scale-95",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {tag}
                  </motion.button>
                );
              })}
            </AnimatePresence>
            {selectedTags.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setSelectedTags([])}
                className="shrink-0 rounded-full px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent active:scale-95"
              >
                清除
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* 角色卡列表 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          <AnimatePresence>
            {deferredFiltered.map((char) => (
              <motion.button
                key={char.uuid}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                onClick={() => onSelect(char.uuid)}
                className={cn(
                  "cv-auto flex items-center gap-2 rounded-lg p-2 text-left text-sm transition-transform",
                  "hover:bg-accent active:scale-[0.98]",
                  currentUuid === char.uuid ? "bg-primary/10 ring-1 ring-primary" : "",
                )}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={char.avatar} alt={char.name} />
                  <AvatarFallback className="text-xs">{char.name.charAt(0) || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{char.name}</div>
                  {char.description && (
                    <div className="mt-0.5">
                      <div
                        className={cn(
                          "text-xs text-muted-foreground whitespace-pre-wrap",
                          !expandedCards.has(char.uuid) && "line-clamp-3",
                          // v0.4.1-fix: 展开时限制最大高度,内容在容器内滚动
                          expandedCards.has(char.uuid) && "max-h-[200px] overflow-y-auto pr-1",
                        )}
                      >
                        {char.description}
                      </div>
                      {/* v0.4.6: 展开/收起 + 详情按钮 — 带图标和视觉边界，鹿溪角色禁用 */}
                      {char.description.length > 60 && char.creator !== "LUZZY" && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(char.uuid);
                            }}
                            className="flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] text-primary transition-colors hover:bg-muted"
                          >
                            {expandedCards.has(char.uuid) ? (
                              <IconArrowUp size={10} className="shrink-0" />
                            ) : (
                              <IconArrowDown size={10} className="shrink-0" />
                            )}
                            {expandedCards.has(char.uuid) ? "收起" : "展开"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailCharacter(char);
                            }}
                            className="flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] text-primary transition-colors hover:bg-muted"
                          >
                            <IconInfo size={10} className="shrink-0" />
                            详情
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* v0.3.5: 显示标签 */}
                  {char.tags && char.tags.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {char.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="shrink-0 px-1 py-0 text-[10px] leading-tight"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>

          {/* 空状态 */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <IconUser className="size-8" />
              <p className="text-xs">
                {searchQuery || selectedTags.length > 0 ? "未找到匹配的角色卡" : "暂无角色卡"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* v0.3.6: 角色卡详情弹窗 */}
      {/* v0.4.1-fix: 限制弹窗高度,内容在容器内滚动,支持长提示词 */}
      <Dialog open={!!detailCharacter} onOpenChange={(o) => !o && setDetailCharacter(null)}>
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-2xl flex flex-col gap-0">
          <DialogHeader className="shrink-0">
            <DialogTitle>{detailCharacter?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[70vh] pr-2">
            {detailCharacter?.description && <Markdown content={detailCharacter.description} />}
            {detailCharacter?.tags && detailCharacter.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {detailCharacter.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="shrink-0 px-1 py-0 text-[10px] leading-tight"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
