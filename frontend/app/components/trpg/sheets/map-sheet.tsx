/**
 * 地图 Sheet（只读视图）
 *
 * 展示：
 * - 当前位置高亮
 * - 所有地标按状态分组（当前/已访问/未探索/敌对/已归档）
 * - 每个地标卡片：图标 + 名称 + 探索度进度条
 *
 * 数据只读原则：不提供编辑功能
 * 动画：列表项 listItemAnimation
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconMap,
  IconCompass,
  IconLocation,
  IconFlag,
  IconBookmark,
  IconExclamation,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { ScrollArea } from "~/components/ui/scroll-area";
import { listItemAnimation, springSoft } from "~/lib/motion-presets";
import type { GameLocation, LocationStatus } from "~/types/trpg";

// ============================================================================
// 主组件
// ============================================================================

export function MapSheet() {
  const trpgSave = useAppStore((s) => s.trpgSave);
  const locations = trpgSave?.gameState.locations ?? [];
  const currentLocation = trpgSave?.gameState.currentLocation;

  // 按状态分组
  const groupedLocations = React.useMemo(() => {
    const groups: Record<LocationStatus, GameLocation[]> = {
      current: [],
      visited: [],
      unexplored: [],
      hostile: [],
      archived: [],
    };
    for (const loc of locations) {
      const status = loc.status ?? "unexplored";
      if (!groups[status]) groups[status] = [];
      groups[status].push(loc);
    }
    return groups;
  }, [locations]);

  if (!trpgSave) {
    return <EmptyMap />;
  }

  return (
    <ScrollArea className="flex-1">
      {/* ===== 当前位置 ===== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSoft}
        className="p-4"
      >
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <IconCompass className="size-4 text-primary" />
          <span>当前位置</span>
        </div>
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
            <IconLocation className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {currentLocation || "未知地点"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              第 {trpgSave.gameState.roundNumber} 轮
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* ===== 分隔线 ===== */}
      <div className="mx-4 border-t border-border/20" />

      {/* ===== 地标列表 ===== */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <IconMap className="size-4 text-primary" />
            <span>已知地标</span>
          </div>
          <span className="text-xs text-muted-foreground">{locations.length} 个地点</span>
        </div>

        {locations.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">尚未发现任何地点</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {/* 当前位置（排除已在上方显示的） */}
            {groupedLocations.current.filter((loc) => loc.name !== currentLocation).length > 0 && (
              <LocationGroup
                key="current"
                icon={<IconCompass className="size-3.5 text-primary" />}
                title="当前位置"
                locations={groupedLocations.current.filter((loc) => loc.name !== currentLocation)}
                variant="current"
              />
            )}

            {/* 已访问 */}
            {groupedLocations.visited.length > 0 && (
              <LocationGroup
                key="visited"
                icon={<IconLocation className="size-3.5 text-green-500" />}
                title="已访问"
                locations={groupedLocations.visited}
                variant="visited"
              />
            )}

            {/* 未探索 */}
            {groupedLocations.unexplored.length > 0 && (
              <LocationGroup
                key="unexplored"
                icon={<IconFlag className="size-3.5 text-muted-foreground" />}
                title="未探索"
                locations={groupedLocations.unexplored}
                variant="unexplored"
              />
            )}

            {/* 敌对 */}
            {groupedLocations.hostile.length > 0 && (
              <LocationGroup
                key="hostile"
                icon={<IconExclamation className="size-3.5 text-red-500" />}
                title="敌对区域"
                locations={groupedLocations.hostile}
                variant="hostile"
              />
            )}

            {/* 已归档 */}
            {groupedLocations.archived.length > 0 && (
              <LocationGroup
                key="archived"
                icon={<IconBookmark className="size-3.5 text-amber-500" />}
                title="已归档"
                locations={groupedLocations.archived}
                variant="archived"
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// 地标分组
// ============================================================================

function LocationGroup({
  icon,
  title,
  locations,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  locations: GameLocation[];
  variant: "current" | "visited" | "unexplored" | "hostile" | "archived";
}) {
  return (
    <motion.div
      layout
      variants={listItemAnimation}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-1.5"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground/60">({locations.length})</span>
      </div>
      <div className="space-y-1">
        {locations.map((loc) => (
          <LocationCard key={loc.locationId} location={loc} variant={variant} />
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// 地标卡片
// ============================================================================

function LocationCard({
  location,
  variant,
}: {
  location: GameLocation;
  variant: "current" | "visited" | "unexplored" | "hostile" | "archived";
}) {
  const variantStyles = {
    current: "border-primary/30 bg-primary/5",
    visited: "border-border/20 bg-background/40",
    unexplored: "border-border/20 bg-muted/10 opacity-60",
    hostile: "border-red-500/30 bg-red-500/5",
    archived: "border-amber-500/20 bg-amber-500/5 opacity-70",
  };

  const iconStyles = {
    current: "text-primary",
    visited: "text-green-500",
    unexplored: "text-muted-foreground",
    hostile: "text-red-500",
    archived: "text-amber-500",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={`rounded-md border p-2 transition-colors ${variantStyles[variant]}`}
    >
      <div className="flex items-center gap-2">
        <IconLocation className={`size-3.5 shrink-0 ${iconStyles[variant]}`} />
        <span
          className={`min-w-0 flex-1 truncate text-xs font-medium ${
            variant === "unexplored" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {location.name}
        </span>
        {location.exploredRatio != null && location.exploredRatio > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {Math.round(location.exploredRatio * 100)}%
          </span>
        )}
      </div>

      {/* 探索度进度条 */}
      {location.exploredRatio != null && location.exploredRatio > 0 && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${location.exploredRatio * 100}%` }}
            transition={{ ...springSoft, delay: 0.1 }}
            className={`h-full rounded-full ${
              variant === "hostile"
                ? "bg-red-500/60"
                : variant === "archived"
                  ? "bg-amber-500/60"
                  : "bg-primary/60"
            }`}
          />
        </div>
      )}

      {/* 归档原因 */}
      {location.archiveReason && (
        <p className="mt-1 text-[10px] text-muted-foreground/70">{location.archiveReason}</p>
      )}
    </motion.div>
  );
}

// ============================================================================
// 空状态
// ============================================================================

function EmptyMap() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <IconMap className="size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">未加载存档</p>
      <p className="text-xs text-muted-foreground/60">请先创建或加载一个存档</p>
    </div>
  );
}
