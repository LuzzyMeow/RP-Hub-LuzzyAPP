/**
 * 存档管理 Sheet
 *
 * 功能：
 * - 创建新存档（可选世界卡 + 角色名）
 * - 加载存档
 * - 导出存档（JSON 下载）
 * - 删除存档（带确认）
 *
 * 动画：列表项 listItemAnimation，按钮 pressableSubtle
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconArrow,
  IconExport,
  IconTrash,
  IconBookmark,
  IconClock,
  IconCharacter,
  IconLevel,
  IconSave,
  IconChevronRight,
  IconBook,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { toast } from "sonner";
import { listItemAnimation, pressableSubtle, springSoft, easeFast } from "~/lib/motion-presets";
import { logger } from "~/services/logger";

// ============================================================================
// 主组件
// ============================================================================

export function SaveSheet() {
  const trpgAllSaves = useAppStore((s) => s.trpgAllSaves);
  const trpgAllWorldCards = useAppStore((s) => s.trpgAllWorldCards);
  const trpgSave = useAppStore((s) => s.trpgSave);
  const createTrpgSave = useAppStore((s) => s.createTrpgSave);
  const loadTrpgSave = useAppStore((s) => s.loadTrpgSave);
  const deleteTrpgSave = useAppStore((s) => s.deleteTrpgSave);
  const loadAllSaves = useAppStore((s) => s.loadAllSaves);
  const confirm = useConfirm();

  const [expandedWorldCard, setExpandedWorldCard] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // v0.8.3: 在世界卡下创建存档（角色名由设计模式取名，此处使用默认角色）
  const handleCreate = React.useCallback(
    async (worldCardId: string) => {
      setIsCreating(true);
      try {
        const saveId = await createTrpgSave(worldCardId);
        toast.success("存档创建成功");
        await loadAllSaves();
        logger.info("trpg", `创建存档: ${saveId}`);
      } catch (e) {
        logger.error("trpg", "创建存档失败: " + String(e));
        toast.error("创建存档失败");
      } finally {
        setIsCreating(false);
      }
    },
    [createTrpgSave, loadAllSaves],
  );

  // ===== 加载存档 =====
  const handleLoad = React.useCallback(
    async (saveId: string) => {
      try {
        await loadTrpgSave(saveId);
        toast.success("存档已加载");
      } catch (e) {
        logger.error("trpg", "加载存档失败: " + String(e));
        toast.error("加载存档失败");
      }
    },
    [loadTrpgSave],
  );

  // ===== 导出存档 =====
  const handleExport = React.useCallback((save: (typeof trpgAllSaves)[number]) => {
    try {
      const json = JSON.stringify(save, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${save.title}_${save.saveId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("存档已导出");
    } catch (e) {
      logger.error("trpg", "导出存档失败: " + String(e));
      toast.error("导出存档失败");
    }
  }, []);

  // ===== 删除存档 =====
  const handleDelete = React.useCallback(
    async (saveId: string, title: string) => {
      const ok = await confirm({
        title: "删除存档",
        description: `确定要删除存档「${title}」吗？此操作不可撤销。`,
        confirmText: "删除",
        cancelText: "取消",
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteTrpgSave(saveId);
        toast.success("存档已删除");
      } catch (e) {
        logger.error("trpg", "删除存档失败: " + String(e));
        toast.error("删除存档失败");
      }
    },
    [confirm, deleteTrpgSave],
  );

  // v0.8.3: 按世界卡分组存档
  const { worldCardSaves, orphanSaves } = React.useMemo(() => {
    const grouped = new Map<string, typeof trpgAllSaves>();
    const orphan: typeof trpgAllSaves = [];

    for (const save of trpgAllSaves) {
      if (save.worldCardId) {
        const existing = grouped.get(save.worldCardId) ?? [];
        existing.push(save);
        grouped.set(save.worldCardId, existing);
      } else {
        orphan.push(save);
      }
    }

    // 排序每个分组内的存档
    for (const [, saves] of grouped) {
      saves.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
    }
    orphan.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    return { worldCardSaves: grouped, orphanSaves: orphan };
  }, [trpgAllSaves]);

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-3 p-4">
        {/* v0.8.3: 世界卡列表 — 每张世界卡可展开显示其下的存档 */}
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <IconBook className="size-4 text-primary" />
          <span>世界卡与存档</span>
        </div>

        {trpgAllWorldCards.length === 0 && orphanSaves.length === 0 ? (
          <EmptySaveList />
        ) : (
          <div className="space-y-2">
            {/* 世界卡列表 */}
            <AnimatePresence mode="popLayout">
              {trpgAllWorldCards.map((card) => {
                const saves = worldCardSaves.get(card.manifest.card_id) ?? [];
                const isExpanded = expandedWorldCard === card.manifest.card_id;
                return (
                  <motion.div
                    key={card.manifest.card_id}
                    layout
                    variants={listItemAnimation}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="rounded-lg border border-border/30 bg-background/40"
                  >
                    {/* 世界卡头部 */}
                    <motion.button
                      type="button"
                      onClick={() =>
                        setExpandedWorldCard(isExpanded ? null : card.manifest.card_id)
                      }
                      className="flex w-full items-center gap-2 p-2.5 text-left"
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                    >
                      <IconBook className="size-4 shrink-0 text-primary" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-foreground">
                          {card.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{saves.length} 个存档</span>
                      </div>
                      <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={springSoft}>
                        <IconChevronRight className="size-4 text-muted-foreground" />
                      </motion.div>
                    </motion.button>

                    {/* 展开的存档列表 */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-border/20"
                        >
                          <div className="space-y-2 p-2.5">
                            {/* 新建存档按钮 */}
                            <motion.div {...pressableSubtle}>
                              <Button
                                onClick={() => handleCreate(card.manifest.card_id)}
                                disabled={isCreating}
                                className="w-full gap-2"
                                size="sm"
                                variant="outline"
                              >
                                <IconPlus className="size-3.5" />
                                {isCreating ? "创建中..." : "新建存档"}
                              </Button>
                            </motion.div>

                            {/* 存档列表 */}
                            {saves.length === 0 ? (
                              <div className="py-3 text-center text-xs text-muted-foreground">
                                暂无存档，点击上方按钮创建
                              </div>
                            ) : (
                              <AnimatePresence mode="popLayout">
                                {saves.map((save) => (
                                  <motion.div
                                    key={save.saveId}
                                    layout
                                    variants={listItemAnimation}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                  >
                                    <SaveCard
                                      save={save}
                                      isActive={trpgSave?.saveId === save.saveId}
                                      onLoad={() => handleLoad(save.saveId)}
                                      onExport={() => handleExport(save)}
                                      onDelete={() => handleDelete(save.saveId, save.title)}
                                    />
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* 无世界卡的存档 */}
            {orphanSaves.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconSave className="size-3.5" />
                  <span>无世界卡的存档</span>
                </div>
                <AnimatePresence mode="popLayout">
                  {orphanSaves.map((save) => (
                    <motion.div
                      key={save.saveId}
                      layout
                      variants={listItemAnimation}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      <SaveCard
                        save={save}
                        isActive={trpgSave?.saveId === save.saveId}
                        onLoad={() => handleLoad(save.saveId)}
                        onExport={() => handleExport(save)}
                        onDelete={() => handleDelete(save.saveId, save.title)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// 存档卡片
// ============================================================================

function SaveCard({
  save,
  isActive,
  onLoad,
  onExport,
  onDelete,
}: {
  save: {
    saveId: string;
    title: string;
    character: { name: string; level: number; race: string; class: string };
    updatedAt: number;
    pinned?: boolean;
  };
  isActive: boolean;
  onLoad: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const formattedTime = React.useMemo(() => {
    const date = new Date(save.updatedAt);
    const now = Date.now();
    const diff = now - save.updatedAt;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString("zh-CN");
  }, [save.updatedAt]);

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`rounded-lg border p-2.5 transition-colors ${
        isActive
          ? "border-primary/40 bg-primary/5"
          : "border-border/30 bg-background/40 hover:border-border/50"
      }`}
    >
      {/* 头部：标题 + 置顶 + 当前标记 */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {save.pinned && <IconBookmark className="size-3 shrink-0 text-amber-500" />}
          <span className="truncate text-sm font-medium text-foreground">{save.title}</span>
        </div>
        {isActive && (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            当前
          </span>
        )}
      </div>

      {/* 角色信息 */}
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <IconCharacter className="size-3" />
          {save.character.name}
        </span>
        <span className="flex items-center gap-1">
          <IconLevel className="size-3" />
          Lv.{save.character.level}
        </span>
        <span className="flex items-center gap-1">
          <IconClock className="size-3" />
          {formattedTime}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="mt-2 flex items-center gap-1">
        <motion.button
          type="button"
          onClick={onLoad}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary/10 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <IconArrow className="size-3" />
          加载
        </motion.button>
        <motion.button
          type="button"
          onClick={onExport}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center justify-center rounded-md bg-muted/40 p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="导出"
        >
          <IconExport className="size-3.5" />
        </motion.button>
        <motion.button
          type="button"
          onClick={onDelete}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center justify-center rounded-md bg-destructive/5 p-1.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="删除"
        >
          <IconTrash className="size-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// 空状态
// ============================================================================

function EmptySaveList() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="flex flex-col items-center justify-center gap-2 py-8 text-center"
    >
      <IconSave className="size-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">暂无存档</p>
      <p className="text-[10px] text-muted-foreground/60">在上方创建你的第一个存档</p>
    </motion.div>
  );
}
