/**
 * 角色卡选择器组件
 *
 * 可折叠的角色卡列表，用于聊天页面侧边选择当前角色卡
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconSearch, IconUser } from "~/components/luzzy/luzzy-icons";

import type { Character } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { ScrollArea } from "~/components/ui/scroll-area";

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

  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase();
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [characters, searchQuery]);

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
                </div>
              </motion.button>
            ))}
          </AnimatePresence>

          {/* 空状态 */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <IconUser className="size-8" />
              <p className="text-xs">
                {searchQuery ? "未找到匹配的角色卡" : "暂无角色卡"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
