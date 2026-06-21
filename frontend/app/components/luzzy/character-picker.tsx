/**
 * 角色卡选择器组件
 *
 * 可折叠的角色卡列表，用于聊天页面侧边选择当前角色卡
 * v0.3.5: 增加标签筛选功能
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconSearch, IconUser } from "~/components/luzzy/luzzy-icons";

import type { Character } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";

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
      result = result.filter((c) =>
        selectedTags.every((t) => c.tags?.includes(t)),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [characters, selectedTags, searchQuery]);

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
            <AnimatePresence mode="popLayout">
              {allTags.map((tag) => {
                const isActive = selectedTags.includes(tag);
                return (
                  <motion.button
                    key={tag}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs transition-all active:scale-95",
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
                layout
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
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((char) => (
              <motion.button
                key={char.uuid}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                onClick={() => onSelect(char.uuid)}
                className={cn(
                  "flex items-center gap-2 rounded-lg p-2 text-left text-sm transition-all",
                  "hover:bg-accent active:scale-[0.98]",
                  currentUuid === char.uuid
                    ? "bg-primary/10 ring-1 ring-primary"
                    : "",
                )}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={char.avatar} alt={char.name} />
                  <AvatarFallback className="text-xs">
                    {char.name.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{char.name}</div>
                  {char.description && (
                    <div className="truncate text-xs text-muted-foreground">
                      {char.description}
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
                {searchQuery || selectedTags.length > 0
                  ? "未找到匹配的角色卡"
                  : "暂无角色卡"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
