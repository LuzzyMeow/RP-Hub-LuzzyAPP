/**
 * 背包 Sheet（只读视图）
 *
 * 展示：
 * - 装备槽（武器/护甲/盾牌）
 * - 背包物品（按类型分组：武器/护甲/消耗品/任务物品/杂物）
 *
 * 数据只读原则：不提供编辑功能
 * 动画：列表项 listItemAnimation，卡片 cardAnimation
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconBackpack,
  IconSword,
  IconShield,
  IconPotion,
  IconKey,
  IconCoin,
  IconChest,
  IconExclamation,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { ScrollArea } from "~/components/ui/scroll-area";
import { listItemAnimation, springSoft } from "~/lib/motion-presets";
import type { InventoryItem, DamageType } from "~/types/trpg";

// ============================================================================
// 主组件
// ============================================================================

export function InventorySheet() {
  const trpgSave = useAppStore((s) => s.trpgSave);

  const character = trpgSave?.character;
  const inventory = character?.inventory ?? [];
  const equipment = character?.equipment;

  // 按类型分组
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {
      weapon: [],
      armor: [],
      consumable: [],
      quest: [],
      misc: [],
    };
    for (const item of inventory) {
      const type = item.type ?? "misc";
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    }
    return groups;
  }, [inventory]);

  if (!character) {
    return <EmptyInventory />;
  }

  return (
    <ScrollArea className="flex-1">
      {/* ===== 装备槽 ===== */}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <IconShield className="size-4 text-primary" />
          <span>已装备</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <EquipmentSlot
            icon={<IconSword className="size-4" />}
            label="武器"
            value={equipment?.weapon}
          />
          <EquipmentSlot
            icon={<IconShield className="size-4" />}
            label="护甲"
            value={equipment?.armor}
          />
          <EquipmentSlot
            icon={<IconShield className="size-4" />}
            label="盾牌"
            value={equipment?.shield}
          />
        </div>
      </div>

      {/* 货币 */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-2">
        {(['cp', 'sp', 'gp', 'pp'] as const).map((cur) => {
          const value = (trpgSave?.gameState.world?.[cur] as number) ?? 0;
          const labels = { cp: '铜币', sp: '银币', gp: '金币', pp: '铂币' };
          return (
            <div key={cur} className="flex flex-col items-center rounded-md border border-border/20 bg-muted/10 p-1.5">
              <IconCoin className="size-3 text-amber-500/70" />
              <span className="text-[9px] text-muted-foreground">{labels[cur]}</span>
              <span className="text-xs font-bold text-foreground">{value}</span>
            </div>
          );
        })}
      </div>

      {/* ===== 分隔线 ===== */}
      <div className="mx-4 border-t border-border/20" />

      {/* ===== 背包物品 ===== */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <IconBackpack className="size-4 text-primary" />
            <span>背包</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {inventory.length} 件物品
          </span>
        </div>

        {inventory.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            背包空空如也
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {/* 武器 */}
            {groupedItems.weapon?.length > 0 && (
              <ItemGroup
                key="weapon"
                icon={<IconSword className="size-3.5" />}
                title="武器"
                items={groupedItems.weapon}
              />
            )}
            {/* 护甲 */}
            {groupedItems.armor?.length > 0 && (
              <ItemGroup
                key="armor"
                icon={<IconShield className="size-3.5" />}
                title="护甲"
                items={groupedItems.armor}
              />
            )}
            {/* 消耗品 */}
            {groupedItems.consumable?.length > 0 && (
              <ItemGroup
                key="consumable"
                icon={<IconPotion className="size-3.5" />}
                title="消耗品"
                items={groupedItems.consumable}
              />
            )}
            {/* 任务物品 */}
            {groupedItems.quest?.length > 0 && (
              <ItemGroup
                key="quest"
                icon={<IconKey className="size-3.5" />}
                title="任务物品"
                items={groupedItems.quest}
              />
            )}
            {/* 杂物 */}
            {groupedItems.misc?.length > 0 && (
              <ItemGroup
                key="misc"
                icon={<IconCoin className="size-3.5" />}
                title="杂物"
                items={groupedItems.misc}
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// 装备槽
// ============================================================================

function EquipmentSlot({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center ${
        value
          ? "border-primary/20 bg-primary/5"
          : "border-border/20 bg-muted/10"
      }`}
    >
      <div className={value ? "text-primary" : "text-muted-foreground/40"}>
        {icon}
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`line-clamp-1 text-xs font-medium ${
          value ? "text-foreground" : "text-muted-foreground/40"
        }`}
      >
        {value || "未装备"}
      </span>
    </motion.div>
  );
}

// ============================================================================
// 物品分组
// ============================================================================

function ItemGroup({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: InventoryItem[];
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
        <span className="text-muted-foreground/60">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// 物品卡片
// ============================================================================

function ItemCard({ item }: { item: InventoryItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasDetails = item.description || item.damageDice || item.acBonus || item.effect;

  return (
    <motion.div
      whileHover={hasDetails ? { scale: 1.01 } : undefined}
      className={`rounded-md border p-2 transition-colors ${
        item.isQuestItem
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/20 bg-background/40"
      }`}
    >
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 text-left ${
          hasDetails ? "cursor-pointer" : "cursor-default"
        }`}
        disabled={!hasDetails}
      >
        {/* 图标 */}
        <span className="shrink-0">
          <ItemIcon type={item.type} />
        </span>
        {/* 名称 + 数量 */}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {item.name}
          {item.quantity > 1 && (
            <span className="ml-1 text-muted-foreground">×{item.quantity}</span>
          )}
        </span>
        {/* 任务物品标记 */}
        {item.isQuestItem && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
            <IconKey className="size-2.5" />
            任务
          </span>
        )}
      </button>

      {/* 展开详情 */}
      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSoft}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1 border-t border-border/20 pt-1.5">
              {item.damageDice && (
                <div className="flex items-center gap-1 text-[11px]">
                  <IconSword className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">伤害:</span>
                  <span className="font-mono text-foreground">
                    {item.damageDice}
                    {item.damageType && ` (${getDamageTypeName(item.damageType)})`}
                  </span>
                </div>
              )}
              {item.acBonus != null && item.acBonus !== 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <IconShield className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">AC:</span>
                  <span className="font-mono text-foreground">
                    +{item.acBonus}
                  </span>
                </div>
              )}
              {item.effect && (
                <div className="flex items-start gap-1 text-[11px]">
                  <IconExclamation className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{item.effect}</span>
                </div>
              )}
              {item.description && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// 物品图标
// ============================================================================

function ItemIcon({ type }: { type: InventoryItem["type"] }) {
  switch (type) {
    case "weapon":
      return <IconSword className="size-3.5 text-red-500/70" />;
    case "armor":
      return <IconShield className="size-3.5 text-blue-500/70" />;
    case "consumable":
      return <IconPotion className="size-3.5 text-green-500/70" />;
    case "quest":
      return <IconKey className="size-3.5 text-amber-500/70" />;
    default:
      return <IconCoin className="size-3.5 text-muted-foreground/70" />;
  }
}

// ============================================================================
// 伤害类型名称
// ============================================================================

function getDamageTypeName(type: DamageType): string {
  const names: Record<DamageType, string> = {
    slashing: "挥砍",
    piercing: "穿刺",
    bludgeoning: "钝击",
    fire: "火焰",
    cold: "寒冷",
    lightning: "闪电",
    thunder: "雷鸣",
    poison: "毒素",
    acid: "强酸",
    force: "力场",
    radiant: "光耀",
    necrotic: "死灵",
    psychic: "心灵",
  };
  return names[type] ?? type;
}

// ============================================================================
// 空状态
// ============================================================================

function EmptyInventory() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <IconChest className="size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">未加载存档</p>
      <p className="text-xs text-muted-foreground/60">
        请先创建或加载一个存档
      </p>
    </div>
  );
}
