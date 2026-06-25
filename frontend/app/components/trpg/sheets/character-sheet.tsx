/**
 * 角色卡 Sheet（只读视图）
 *
 * 展示：
 * - 角色基本信息（名称/种族/职业/等级）
 * - 六维属性（str/dex/con/int/wis/cha）
 * - HP/AC/XP
 * - 18项技能（熟练项高亮，专精项特殊标记）
 * - 状态（conditions）
 * - 职业特性（classFeatures）
 * - 背景（background + alignment）
 *
 * 数据只读原则：不提供编辑功能
 * 动画：各区域 fadeSlide，属性卡片 cardAnimation
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconCharacter,
  IconLevel,
  IconHealth,
  IconShield,
  IconStar,
  IconHeart,
  IconSword,
  IconBook,
  IconInfo,
  IconExclamation,
  IconCrown,
  IconUserGroup,
  IconClose,
  IconLock,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { ScrollArea } from "~/components/ui/scroll-area";
import { springSoft } from "~/lib/motion-presets";
import type { AbilityName, SkillName, TrpgCharacter, GameNpc, NpcAttitude } from "~/types/trpg";

// ============================================================================
// 主组件
// ============================================================================

export function CharacterSheet() {
  const trpgSave = useAppStore((s) => s.trpgSave);
  const character = trpgSave?.character;
  const npcs = trpgSave?.gameState?.npcs ?? trpgSave?.npcs ?? [];

  const [tab, setTab] = React.useState<"self" | "npc">("self");
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);

  if (!trpgSave) {
    return <EmptyCharacter />;
  }

  const selectedNpc = npcs.find((n) => n.npcId === selectedNpcId) ?? null;

  return (
    <>
      {/* ===== Tab 切换 ===== */}
      <div className="flex gap-1 border-b border-border/20 px-3 pt-2">
        <TabButton
          active={tab === "self"}
          onClick={() => setTab("self")}
          icon={<IconCharacter className="size-3.5" />}
          label="自己"
        />
        <TabButton
          active={tab === "npc"}
          onClick={() => setTab("npc")}
          icon={<IconUserGroup className="size-3.5" />}
          label="NPC"
        />
      </div>

      {/* ===== 自己 Tab ===== */}
      {tab === "self" && character && (
        <ScrollArea className="flex-1">
          {/* ===== 角色头部 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSoft}
            className="flex flex-col items-center gap-2 p-4"
          >
            <div className="flex size-16 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/5">
              <IconCharacter className="size-8 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">{character.name}</h2>
              <p className="text-xs text-muted-foreground">
                {character.race} · {character.class} · Lv.{character.level}
              </p>
            </div>
          </motion.div>

          {/* ===== HP/AC/XP 状态条 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSoft, delay: 0.05 }}
            className="grid grid-cols-3 gap-2 px-4"
          >
            <StatusCard
              icon={<IconHeart className="size-3.5" />}
              label="HP"
              value={`${character.hp.current}/${character.hp.max}`}
              color="text-red-500"
            />
            <StatusCard
              icon={<IconShield className="size-3.5" />}
              label="AC"
              value={String(character.ac)}
              color="text-blue-500"
            />
            <StatusCard
              icon={<IconLevel className="size-3.5" />}
              label="XP"
              value={String(character.xp)}
              color="text-amber-500"
            />
          </motion.div>

          {/* ===== 六维属性 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSoft, delay: 0.1 }}
            className="space-y-2 p-4"
          >
            <SectionTitle icon={<IconStar className="size-3.5" />} title="六维属性" />
            <div className="grid grid-cols-3 gap-2">
              <AbilityCard name="str" label="力量" value={character.abilities.str} />
              <AbilityCard name="dex" label="敏捷" value={character.abilities.dex} />
              <AbilityCard name="con" label="体质" value={character.abilities.con} />
              <AbilityCard name="int" label="智力" value={character.abilities.int} />
              <AbilityCard name="wis" label="感知" value={character.abilities.wis} />
              <AbilityCard name="cha" label="魅力" value={character.abilities.cha} />
            </div>
          </motion.div>

          {/* ===== 技能 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSoft, delay: 0.15 }}
            className="space-y-2 px-4 pb-4"
          >
            <SectionTitle icon={<IconBook className="size-3.5" />} title="技能" />
            <div className="grid grid-cols-2 gap-1">
              {SKILL_LIST.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  proficient={character.proficientSkills.includes(skill.name)}
                  expertise={character.expertiseSkills.includes(skill.name)}
                  abilityValue={character.abilities[skill.ability]}
                />
              ))}
            </div>
          </motion.div>

          {/* ===== 状态 ===== */}
          {character.conditions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSoft, delay: 0.2 }}
              className="space-y-2 px-4 pb-4"
            >
              <SectionTitle icon={<IconExclamation className="size-3.5" />} title="状态" />
              <div className="flex flex-wrap gap-1.5">
                {character.conditions.map((cond) => (
                  <span
                    key={cond}
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {cond}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===== 职业特性 ===== */}
          {character.classFeatures.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSoft, delay: 0.25 }}
              className="space-y-2 px-4 pb-4"
            >
              <SectionTitle icon={<IconSword className="size-3.5" />} title="职业特性" />
              <div className="space-y-1">
                {character.classFeatures.map((feat, i) => (
                  <div
                    key={feat}
                    className="rounded-md border border-border/20 bg-muted/10 px-2.5 py-1.5 text-xs text-muted-foreground"
                  >
                    {feat}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===== 背景 ===== */}
          {(character.background || character.alignment) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSoft, delay: 0.3 }}
              className="space-y-2 px-4 pb-4"
            >
              <SectionTitle icon={<IconBook className="size-3.5" />} title="背景" />
              <div className="space-y-1.5 rounded-md border border-border/20 bg-muted/10 p-2.5">
                {character.alignment && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <IconCrown className="size-3 text-amber-500" />
                    <span className="text-muted-foreground">阵营:</span>
                    <span className="text-foreground">{character.alignment}</span>
                  </div>
                )}
                {character.background && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {character.background}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </ScrollArea>
      )}

      {/* ===== NPC Tab ===== */}
      {tab === "npc" && (
        <ScrollArea className="flex-1">
          <NpcListView npcs={npcs} onSelect={setSelectedNpcId} />
        </ScrollArea>
      )}

      {/* ===== NPC 详情弹层 ===== */}
      <AnimatePresence>
        {selectedNpc && (
          <NpcDetailModal
            key={selectedNpc.npcId}
            npc={selectedNpc}
            onClose={() => setSelectedNpcId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// 状态卡片（HP/AC/XP）
// ============================================================================

function StatusCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      whileTap={{ scale: 0.95, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      transition={springSoft}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-border/20 bg-background/40 p-2"
    >
      <div className={`flex items-center gap-1 ${color}`}>{icon}</div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </motion.div>
  );
}

// ============================================================================
// 属性卡片
// ============================================================================

function AbilityCard({ name, label, value }: { name: AbilityName; label: string; value: number }) {
  const modifier = Math.floor((value - 10) / 2);
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      whileTap={{ scale: 0.95, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      transition={springSoft}
      className="flex flex-col items-center gap-0.5 rounded-lg border border-border/20 bg-background/40 p-2"
    >
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-[10px] font-mono text-primary">{modStr}</span>
    </motion.div>
  );
}

// ============================================================================
// 技能行
// ============================================================================

function SkillRow({
  skill,
  proficient,
  expertise,
  abilityValue,
}: {
  skill: { name: SkillName; label: string; ability: AbilityName };
  proficient: boolean;
  expertise: boolean;
  abilityValue: number;
}) {
  const modifier = Math.floor((abilityValue - 10) / 2);
  // 熟练加值（简化：等级1-4为+2，5-8为+3，9-12为+4，13-16为+5，17-20为+6）
  // 这里只显示基础调整值，实际熟练加值由引擎计算

  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-xs ${
        expertise
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : proficient
            ? "bg-primary/5 text-primary"
            : "text-muted-foreground"
      }`}
    >
      {expertise ? (
        <IconStar className="size-3 fill-current" />
      ) : proficient ? (
        <IconStar className="size-3" />
      ) : (
        <span className="size-3" />
      )}
      <span className="min-w-0 flex-1 truncate">{skill.label}</span>
      <span className="font-mono text-[10px]">{modifier >= 0 ? `+${modifier}` : modifier}</span>
    </div>
  );
}

// ============================================================================
// 区块标题
// ============================================================================

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
      <span className="text-primary">{icon}</span>
      <span>{title}</span>
    </div>
  );
}

// ============================================================================
// 技能列表（18项）
// ============================================================================

const SKILL_LIST: { name: SkillName; label: string; ability: AbilityName }[] = [
  { name: "athletics", label: "运动", ability: "str" },
  { name: "acrobatics", label: "杂技", ability: "dex" },
  { name: "sleight_of_hand", label: "巧手", ability: "dex" },
  { name: "stealth", label: "隐匿", ability: "dex" },
  { name: "arcana", label: "奥秘", ability: "int" },
  { name: "history", label: "历史", ability: "int" },
  { name: "investigation", label: "调查", ability: "int" },
  { name: "nature", label: "自然", ability: "int" },
  { name: "religion", label: "宗教", ability: "int" },
  { name: "animal_handling", label: "驯兽", ability: "wis" },
  { name: "insight", label: "洞悉", ability: "wis" },
  { name: "medicine", label: "医药", ability: "wis" },
  { name: "perception", label: "察觉", ability: "wis" },
  { name: "survival", label: "求生", ability: "wis" },
  { name: "deception", label: "欺瞒", ability: "cha" },
  { name: "intimidation", label: "威吓", ability: "cha" },
  { name: "performance", label: "表演", ability: "cha" },
  { name: "persuasion", label: "说服", ability: "cha" },
];

// ============================================================================
// 空状态
// ============================================================================

function EmptyCharacter() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <IconCharacter className="size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">未加载存档</p>
      <p className="text-xs text-muted-foreground/60">请先创建或加载一个存档</p>
    </div>
  );
}

// ============================================================================
// Tab 按钮
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      transition={springSoft}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}

// ============================================================================
// NPC 态度信息（五级制）
// ============================================================================

const ATTITUDE_INFO: Record<NpcAttitude, { label: string; className: string }> = {
  hostile: { label: "敌对", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  unfriendly: {
    label: "不友善",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  neutral: { label: "中立", className: "bg-muted/30 text-muted-foreground" },
  friendly: {
    label: "友善",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  helpful: { label: "乐于助人", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
};

// ============================================================================
// NPC 列表视图
// ============================================================================

function NpcListView({ npcs, onSelect }: { npcs: GameNpc[]; onSelect: (id: string) => void }) {
  if (npcs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <IconUserGroup className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">暂无 NPC</p>
        <p className="text-xs text-muted-foreground/60">NPC 将在游戏进程中出现</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="space-y-2 p-3"
    >
      {npcs.map((npc, i) => (
        <NpcListItem
          key={npc.npcId}
          npc={npc}
          delay={i * 0.03}
          onClick={() => onSelect(npc.npcId)}
        />
      ))}
    </motion.div>
  );
}

// ============================================================================
// NPC 列表项
// ============================================================================

const NpcListItem = React.memo(function NpcListItem({
  npc,
  delay,
  onClick,
}: {
  npc: GameNpc;
  delay: number;
  onClick: () => void;
}) {
  const present = npc.presence === "present";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springSoft, delay }}
      whileHover={{ scale: 1.01, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      whileTap={{ scale: 0.98, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
      className="flex w-full items-center gap-3 rounded-lg border border-border/20 bg-background/40 p-2.5 text-left"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
        <IconCharacter className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{npc.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {npc.gender} · {npc.age}岁
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          present
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-muted/30 text-muted-foreground"
        }`}
      >
        {present ? "在场" : "离场"}
      </span>
    </motion.button>
  );
});

// ============================================================================
// NPC 详情弹层（渐进式解锁：未揭示字段显示 ???）
// ============================================================================

function NpcDetailModal({ npc, onClose }: { npc: GameNpc; onClose: () => void }) {
  const revealed = new Set(npc.revealedFields);
  const isRevealed = (key: string) => revealed.has(key);
  const attitude = ATTITUDE_INFO[npc.attitude] ?? ATTITUDE_INFO.neutral;
  const hpPct =
    npc.hp.max > 0 ? Math.max(0, Math.min(100, (npc.hp.current / npc.hp.max) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={springSoft}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={springSoft}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border border-border/30 bg-background p-4 shadow-md sm:max-w-md sm:rounded-2xl"
      >
        {/* 头部 */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/5">
              <IconCharacter className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{npc.name}</h3>
              <p className="text-[11px] text-muted-foreground">
                {isRevealed("gender") ? npc.gender : "???"} ·{" "}
                {isRevealed("age") ? `${npc.age}岁` : "???"}
              </p>
            </div>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            whileTap={{ scale: 0.9, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          >
            <IconClose className="size-4" />
          </motion.button>
        </div>

        {/* 在场 + 态度 徽章 */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              npc.presence === "present"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {npc.presence === "present" ? "在场" : "离场"}
          </span>
          {isRevealed("attitude") ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${attitude.className}`}
            >
              {attitude.label}
            </span>
          ) : (
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              ??? 态度
            </span>
          )}
        </div>

        {/* HP */}
        <div className="mb-3 rounded-md border border-border/20 bg-muted/10 p-2.5">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <IconHeart className="size-3 text-red-500" />
              生命值
            </span>
            <span className="font-mono font-medium text-foreground">
              {isRevealed("hp") ? `${npc.hp.current}/${npc.hp.max}` : "???/???"}
            </span>
          </div>
          {isRevealed("hp") && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${hpPct}%` }}
                transition={springSoft}
                className="h-full rounded-full bg-red-500"
              />
            </div>
          )}
        </div>

        {/* 自定义字段（渐进式解锁） */}
        {Object.keys(npc.customFields).length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <IconInfo className="size-3 text-primary" />
              <span>详情</span>
            </div>
            {Object.entries(npc.customFields).map(([key, value]) => {
              const revealedField = isRevealed(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border border-border/20 bg-muted/5 px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{key}</span>
                  {revealedField ? (
                    <span className="max-w-[60%] truncate text-foreground">{value}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <IconLock className="size-3" />
                      <span>???</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
