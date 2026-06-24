/**
 * TRPG 页面（v0.8.0 完整重写）
 *
 * 四区域布局（从上到下）：
 * 1. 顶部模式切换栏：游戏模式 / 设计模式 + 设置齿轮
 * 2. 中部剧情正文区：消息列表（Narrator 7 段渲染）
 * 3. 底部输入栏：文本输入 + 发送按钮
 * 4. 底部功能栏：存档/背包/角色/地图 4个图标按钮
 *
 * 动画：三态丝滑动画（进入/交互/退出），使用 motion/react
 * 图标：全部使用 game-icon-pack
 */

import * as React from "react";
import type { Route } from "./+types/trpg";
import { motion, AnimatePresence } from "motion/react";
import {
  IconDice,
  IconBook,
  IconSend,
  IconSave,
  IconBackpack,
  IconCharacter,
  IconMap,
  IconSettings,
  IconInfo,
  IconPlus,
  IconChevronRight,
  IconDownload,
  IconUpload,
  IconRefresh,
  IconSearch,
  IconUser,
  IconGlobe,
  IconImage,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import {
  springSoft,
  springSnappy,
  springGentle,
  easeFast,
  easeInOut,
  pressableSubtle,
  fadeSlide,
  slideInBottom,
} from "~/lib/motion-presets";
import { logger } from "~/services/logger";

import { SaveSheet } from "~/components/trpg/sheets/save-sheet";
import { InventorySheet } from "~/components/trpg/sheets/inventory-sheet";
import { CharacterSheet } from "~/components/trpg/sheets/character-sheet";
import { MapSheet } from "~/components/trpg/sheets/map-sheet";
import { TrpgSettingsPanel } from "~/components/trpg/trpg-settings-panel";
import { NarratorMessage } from "~/components/trpg/narrator-message";
import { TrpgOnboarding } from "~/components/trpg/trpg-onboarding";
import type { CombatState, GameNpc, TrpgCharacter } from "~/types/trpg";
import type { DesignSession } from "~/types/trpg";

export function meta(_: Route.MetaArgs) {
  return [{ title: "TRPG - LUZZY" }];
}

export default function TrpgPage() {
  // ===== Store 状态 =====
  const trpgMode = useAppStore((s) => s.trpgMode);
  const setTrpgMode = useAppStore((s) => s.setTrpgMode);
  const trpgMessages = useAppStore((s) => s.trpgMessages);
  const trpgIsGenerating = useAppStore((s) => s.trpgIsGenerating);
  const trpgInputDraft = useAppStore((s) => s.trpgInputDraft);
  const setTrpgInputDraft = useAppStore((s) => s.setTrpgInputDraft);
  const trpgSave = useAppStore((s) => s.trpgSave);
  const trpgActiveSheet = useAppStore((s) => s.trpgActiveSheet);
  const setTrpgActiveSheet = useAppStore((s) => s.setTrpgActiveSheet);
  const sendTrpgMessage = useAppStore((s) => s.sendTrpgMessage);
  const loadAllSaves = useAppStore((s) => s.loadAllSaves);
  const loadAllWorldCards = useAppStore((s) => s.loadAllWorldCards);
  const loadTrpgModel = useAppStore((s) => s.loadTrpgModel);

  // v0.8.2: 设计模式状态
  const trpgDesignSession = useAppStore((s) => s.trpgDesignSession);
  const resetTrpgDesignSession = useAppStore((s) => s.resetTrpgDesignSession);
  const saveDesignWorldCard = useAppStore((s) => s.saveDesignWorldCard);
  const exportDesignWorldCard = useAppStore((s) => s.exportDesignWorldCard);
  const importDesignWorldCard = useAppStore((s) => s.importDesignWorldCard);

  // ===== 本地状态 =====
  const [showInfo, setShowInfo] = React.useState(false);
  // v0.8.3: TRPG 用户引导
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [displayCount, setDisplayCount] = React.useState(40);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  // ===== 可见消息（分页加载） =====
  const visibleMessages = React.useMemo(() => {
    const source = trpgMode === "design" ? (trpgDesignSession?.messages ?? []) : trpgMessages;
    return source.slice(-displayCount);
  }, [trpgMode, trpgDesignSession?.messages, trpgMessages, displayCount]);

  // ===== 初始化 =====
  React.useEffect(() => {
    loadTrpgModel();
    void loadAllSaves();
    void loadAllWorldCards();
    // v0.8.3: 首次进入检测引导
    try {
      if (localStorage.getItem("trpg_onboarding_completed") !== "true") {
        setShowOnboarding(true);
      }
    } catch {
      // 忽略 localStorage 错误
    }
    logger.info("trpg", "TRPG 页面初始化");
  }, [loadTrpgModel, loadAllSaves, loadAllWorldCards]);

  // ===== 自动滚动到底部 =====
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trpgMessages]);

  // ===== 发送消息 =====
  const handleSend = React.useCallback(async () => {
    const input = trpgInputDraft.trim();
    if (!input || trpgIsGenerating) return;
    if (trpgMode === "game" && !trpgSave) {
      setTrpgActiveSheet("save");
      return;
    }
    await sendTrpgMessage(input);
  }, [trpgInputDraft, trpgIsGenerating, trpgMode, trpgSave, sendTrpgMessage, setTrpgActiveSheet]);

  // ===== 键盘事件 =====
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // ===== 滚动分页加载 =====
  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollTop < 50 && displayCount < trpgMessages.length && !isLoadingMore) {
        setIsLoadingMore(true);
        setTimeout(() => {
          setDisplayCount((prev) => Math.min(prev + 40, trpgMessages.length));
          setIsLoadingMore(false);
        }, 500);
      }
    },
    [displayCount, trpgMessages.length, isLoadingMore],
  );

  // ===== Sheet 开关 =====
  const openSheet = React.useCallback(
    (sheet: "save" | "inventory" | "character" | "map" | "settings") => {
      setTrpgActiveSheet(sheet);
    },
    [setTrpgActiveSheet],
  );

  const closeSheet = React.useCallback(() => {
    setTrpgActiveSheet(null);
  }, [setTrpgActiveSheet]);

  return (
    <LuzzyLayout
      title="TRPG"
      actions={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowInfo(true)}
          aria-label="TRPG 说明"
          {...pressableSubtle}
        >
          <IconInfo className="size-4" />
        </Button>
      }
      contentClassName="!overflow-hidden"
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* ===== 区域 1：顶部模式切换栏 ===== */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSnappy}
          className="flex shrink-0 items-center gap-2 border-b border-border/20 bg-background/40 px-3 py-2 backdrop-blur-sm"
        >
          <div className="flex rounded-lg border border-border/30 bg-muted/30 p-0.5">
            <motion.button
              type="button"
              onClick={() => {
                setTrpgMode("game");
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                trpgMode === "game"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <IconDice className="size-3.5" />
              游戏模式
            </motion.button>
            <motion.button
              type="button"
              onClick={() => {
                if (trpgMode !== "design") {
                  resetTrpgDesignSession();
                  setTrpgMode("design");
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                trpgMode === "design"
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <IconBook className="size-3.5" />
              设计模式
            </motion.button>
          </div>

          {/* 当前存档信息 */}
          {trpgSave && (
            <motion.div
              key={trpgSave.saveId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={springSoft}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <IconChevronRight className="size-3" />
              <span className="truncate max-w-[120px]">{trpgSave.title}</span>
            </motion.div>
          )}

          {/* 右侧设置齿轮 */}
          <div className="flex-1" />
          <motion.button
            type="button"
            onClick={() => openSheet("settings")}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              trpgActiveSheet === "settings"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="TRPG 设置"
          >
            <IconSettings className="size-4" />
          </motion.button>
        </motion.div>

        {/* ===== 设计模式进度条 ===== */}
        {trpgMode === "design" && trpgDesignSession && (
          <DesignModeIndicator session={trpgDesignSession} />
        )}

        {/* ===== 战斗状态栏 ===== */}
        {trpgMode === "game" &&
          trpgSave?.gameState.phase === "combat" &&
          trpgSave?.gameState.combat && (
            <CombatStatusBar
              combat={trpgSave.gameState.combat}
              npcs={trpgSave.gameState.npcs}
              character={trpgSave.character}
            />
          )}

        {/* ===== 区域 2：中部剧情正文区 ===== */}
        <div className="relative flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto px-4 py-3" onScroll={handleScroll}>
            {(
              trpgMode === "design"
                ? (trpgDesignSession?.messages.length ?? 0) === 0
                : trpgMessages.length === 0
            ) ? (
              trpgMode === "design" ? (
                <DesignModeWelcome onSelectDirection={(text) => setTrpgInputDraft(text)} />
              ) : (
                <EmptyState
                  onCreateSave={() => openSheet("save")}
                  onStartDesign={() => {
                    resetTrpgDesignSession();
                    setTrpgMode("design");
                  }}
                  mode={trpgMode}
                />
              )
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {isLoadingMore && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <IconDice className="size-3.5" />
                    </motion.div>
                    加载更多...
                  </motion.div>
                )}
                <AnimatePresence mode="popLayout">
                  {visibleMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={springSoft}
                    >
                      {msg.role === "user" ? (
                        <UserMessage content={msg.content} />
                      ) : (
                        <NarratorMessage
                          message={msg}
                          onSelectAction={(option) => setTrpgInputDraft(option.description)}
                        />
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {trpgIsGenerating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <IconDice className="size-3.5" />
                    </motion.div>
                    正在生成...
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ===== 区域 3：底部输入栏 ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSnappy}
          className="shrink-0 border-t border-border/20 bg-background/60 backdrop-blur-xl backdrop-saturate-150"
        >
          <div className="flex items-end gap-2 px-3 py-2">
            <Textarea
              value={trpgInputDraft}
              onChange={(e) => setTrpgInputDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                trpgMode === "design"
                  ? "描述你的想法，或回答助手的问题..."
                  : trpgSave
                    ? "输入你的行动..."
                    : "请先创建或加载存档..."
              }
              disabled={trpgIsGenerating}
              className="min-h-[40px] max-h-[120px] resize-none border-border/30 bg-muted/30 text-sm"
              rows={1}
            />
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!trpgInputDraft.trim() || trpgIsGenerating}
                className="size-10 shrink-0 rounded-full"
              >
                <IconSend className="size-4" />
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* ===== 区域 4：底部功能栏 ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSnappy}
          className="flex shrink-0 items-center justify-around border-t border-border/20 bg-background/40 px-2 py-1.5 backdrop-blur-sm"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {trpgMode === "design" ? (
            <>
              <ToolbarButton
                icon={<IconDownload className="size-5" />}
                label="导出"
                onClick={() => {
                  const json = exportDesignWorldCard();
                  if (!json) {
                    toast.error("没有可导出的世界卡");
                    return;
                  }
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `world_card_${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("世界卡已导出");
                }}
              />
              <ToolbarButton
                icon={<IconRefresh className="size-5" />}
                label="体检"
                onClick={() => {
                  const session = trpgDesignSession;
                  if (!session) return;
                  void import("~/services/trpg/designModeTools").then((m) => {
                    const report = m.validateWorldCard(session.draft);
                    const errorCount = report.checks.filter((c) => c.result === "error").length;
                    const warningCount = report.checks.filter((c) => c.result === "warning").length;
                    if (errorCount === 0 && warningCount === 0) {
                      toast.success("世界卡体检通过");
                    } else {
                      toast.warning(`体检：${errorCount} 项错误，${warningCount} 项警告`);
                    }
                  });
                }}
              />
              <ToolbarButton
                icon={<IconSearch className="size-5" />}
                label="预览"
                onClick={() => {
                  const session = trpgDesignSession;
                  if (!session) return;
                  const json = JSON.stringify(session.draft, null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  URL.revokeObjectURL(url);
                }}
              />
              <ToolbarButton
                icon={<IconSave className="size-5" />}
                label="保存"
                onClick={() => void saveDesignWorldCard()}
              />
              <ToolbarButton
                icon={<IconUpload className="size-5" />}
                label="导入"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".json,application/json";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const text = String(reader.result);
                      importDesignWorldCard(text);
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
              />
            </>
          ) : (
            <>
              <ToolbarButton
                icon={<IconSave className="size-5" />}
                label="存档"
                onClick={() => openSheet("save")}
                active={trpgActiveSheet === "save"}
              />
              <ToolbarButton
                icon={<IconBackpack className="size-5" />}
                label="背包"
                onClick={() => openSheet("inventory")}
                active={trpgActiveSheet === "inventory"}
                disabled={!trpgSave}
              />
              <ToolbarButton
                icon={<IconCharacter className="size-5" />}
                label="角色"
                onClick={() => openSheet("character")}
                active={trpgActiveSheet === "character"}
                disabled={!trpgSave}
              />
              <ToolbarButton
                icon={<IconMap className="size-5" />}
                label="地图"
                onClick={() => openSheet("map")}
                active={trpgActiveSheet === "map"}
                disabled={!trpgSave}
              />
            </>
          )}
        </motion.div>
      </div>

      {/* ===== 侧边 Sheet 面板（浮层，不属于四区域布局） ===== */}
      <Sheet open={trpgActiveSheet === "save"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconSave className="size-4 text-primary" />
              存档管理
            </SheetTitle>
            <SheetDescription>创建、加载或删除存档</SheetDescription>
          </SheetHeader>
          <SaveSheet />
        </SheetContent>
      </Sheet>

      <Sheet open={trpgActiveSheet === "inventory"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconBackpack className="size-4 text-primary" />
              背包
            </SheetTitle>
            <SheetDescription>查看和管理物品</SheetDescription>
          </SheetHeader>
          <InventorySheet />
        </SheetContent>
      </Sheet>

      <Sheet open={trpgActiveSheet === "character"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconCharacter className="size-4 text-primary" />
              角色卡
            </SheetTitle>
            <SheetDescription>查看角色属性和状态</SheetDescription>
          </SheetHeader>
          <CharacterSheet />
        </SheetContent>
      </Sheet>

      <Sheet open={trpgActiveSheet === "map"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconMap className="size-4 text-primary" />
              地图
            </SheetTitle>
            <SheetDescription>已知地标和位置</SheetDescription>
          </SheetHeader>
          <MapSheet />
        </SheetContent>
      </Sheet>

      <Sheet open={trpgActiveSheet === "settings"} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconSettings className="size-4 text-primary" />
              TRPG 设置
            </SheetTitle>
            <SheetDescription>配置模型和参数</SheetDescription>
          </SheetHeader>
          <TrpgSettingsPanel />
        </SheetContent>
      </Sheet>

      {/* 说明弹窗 */}
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconInfo className="size-5 text-primary" />
              TRPG 模式说明
            </SheetTitle>
            <SheetDescription>v0.8.0 原生 TRPG 引擎</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 overflow-y-auto px-1 pb-4 text-sm leading-relaxed">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="font-medium text-foreground">原生 TRPG 引擎</p>
              <p className="mt-1 text-xs text-muted-foreground">
                v0.8.0 版本已完全重写为原生 React TRPG 引擎，基于 D&D 5e SRD 5.2.1 规则，支持 d20
                检定、战斗裁决、社交互动、探索系统等完整功能。
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="font-medium text-foreground">快速开始</p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <li>1. 点击「存档」按钮创建新存档</li>
                <li>2. 在「设置」中选择 TRPG 模型</li>
                <li>3. 在输入框中描述你的行动</li>
                <li>4. 引擎会自动执行 d20 检定和规则裁决</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="font-medium text-amber-600 dark:text-amber-400">提示</p>
              <p className="mt-1 text-xs text-muted-foreground">
                TRPG
                模式使用独立的模型配置，请在设置面板中选择专用模型。所有数值计算由本地引擎执行，不信任
                LLM 的计算结果。
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* v0.8.3: TRPG 用户引导 */}
      <AnimatePresence>
        {showOnboarding && <TrpgOnboarding onComplete={() => setShowOnboarding(false)} />}
      </AnimatePresence>
    </LuzzyLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

/** 设计模式进度指示器 */
function DesignModeIndicator({ session }: { session: DesignSession }) {
  const stageNames = ["方向选择", "五维框架", "骨架生成", "审查交付"];
  const stage = session.currentStage;
  const draft = session.draft;

  const snap = draft.snapshot;
  const entityCount = Object.keys(snap.world_setting.settings).length;
  const moduleCount = Object.keys(snap.prompt_modules.modules).length;
  const charCount = Object.keys(snap.character_database).filter((k) => k !== "_summary").length;
  const eventCount = snap.world_timeline.events.length;

  const progressItems = [
    { label: "标题", done: draft.name && draft.name !== "未命名世界卡" },
    { label: "地理实体", done: entityCount >= 3, count: entityCount },
    { label: "Prompt模块", done: moduleCount >= 1, count: moduleCount },
    { label: "角色", done: charCount >= 1, count: charCount },
    { label: "时间线", done: eventCount >= 5, count: eventCount },
    { label: "开场白", done: !!snap.opening_greeting },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSnappy}
      className="shrink-0 border-b border-border/20 bg-background/40 px-3 py-2 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-primary">设计模式</span>
          <span className="text-xs text-muted-foreground">
            Stage {stage} · {stageNames[stage]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {progressItems.map((item) => (
            <span
              key={item.label}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                item.done ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"
              }`}
              title={item.label}
            >
              {item.label}
              {item.count !== undefined ? ` ${item.count}` : ""}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** 空状态 */
function EmptyState({
  onCreateSave,
  onStartDesign,
  mode,
}: {
  onCreateSave: () => void;
  onStartDesign: () => void;
  mode: "game" | "design";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springGentle}
      className="flex h-full flex-col items-center justify-center gap-4 text-center"
    >
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {mode === "design" ? (
          <IconBook className="size-16 text-primary/40" />
        ) : (
          <IconDice className="size-16 text-primary/40" />
        )}
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold">
          {mode === "design" ? "设计一张新世界卡" : "开始你的冒险"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "design"
            ? "从方向选择开始，逐步构建可游玩的 TRPG 世界"
            : "创建一个新存档，开启 TRPG 之旅"}
        </p>
      </div>
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button onClick={mode === "design" ? onStartDesign : onCreateSave} className="gap-2">
          <IconPlus className="size-4" />
          {mode === "design" ? "开始设计" : "创建存档"}
        </Button>
      </motion.div>
    </motion.div>
  );
}

/** 设计模式欢迎卡片 */
function DesignModeWelcome({ onSelectDirection }: { onSelectDirection: (text: string) => void }) {
  const directions = [
    {
      id: "PERSONA",
      number: "01",
      title: "扮演一个角色",
      subtitle: "PERSONA",
      icon: IconUser,
      example: "修仙弟子、高考刚结束的少年、末日里的一只猫……",
      prompt: "PERSONA：我想从扮演一个角色开始设计世界卡。",
    },
    {
      id: "WORLD",
      number: "02",
      title: "构建一个世界",
      subtitle: "WORLD",
      icon: IconGlobe,
      example: "修仙宇宙、雨夜的赛博朋克、停战翌日的边境小镇……",
      prompt: "WORLD：我想从构建一个世界开始设计世界卡。",
    },
    {
      id: "SCENE",
      number: "03",
      title: "我有一个画面",
      subtitle: "SCENE",
      icon: IconImage,
      example: "「偷看师傅秘诀被师兄撞见」——直接写出来即可",
      prompt: "SCENE：我有一个画面想作为世界卡起点。",
    },
    {
      id: "IMPROV",
      number: "04",
      title: "随便来一个",
      subtitle: "IMPROV",
      icon: IconDice,
      example: "暂无头绪？由引擎起头，边聊边定方向",
      prompt: "IMPROV：随便来一个，由你起头。",
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className="flex h-full flex-col items-center justify-center px-4 py-6 text-center"
    >
      <div className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">欢迎来到设计模式，你想从哪个角度出发？</h2>
        <p className="text-sm text-muted-foreground">
          在这里，你可以设计一张属于自己的世界卡。我会一步步引导你——先确立一个大方向，再围绕它逐层展开。
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {directions.map((dir) => {
          const Icon = dir.icon;
          return (
            <motion.button
              key={dir.id}
              type="button"
              onClick={() => onSelectDirection(dir.prompt)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group flex flex-col items-start rounded-xl border border-border/30 bg-muted/30 p-5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="mb-3 flex w-full items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{dir.number}</span>
                <Icon className="size-8 text-primary/70 transition-colors group-hover:text-primary" />
              </div>
              <h3 className="text-base font-semibold">{dir.title}</h3>
              <span className="mb-2 text-[10px] font-medium tracking-wider text-muted-foreground">
                {dir.subtitle}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">{dir.example}</p>
            </motion.button>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        或直接输入你的想法，粘贴已有设定、写出脑中画面，或随便聊聊
      </p>
    </motion.div>
  );
}

/** 用户消息 */
function UserMessage({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springSnappy}
      className="flex justify-end"
    >
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/20 bg-primary/10 px-3 py-2 text-sm">
        {content}
      </div>
    </motion.div>
  );
}

/** 工具栏按钮（底部功能栏专用：垂直布局，图标在上文字在下） */
function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.08, y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.92 }}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      } ${disabled ? "opacity-40" : ""}`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </motion.button>
  );
}

/** 战斗状态栏（可折叠） */
function CombatStatusBar({
  combat,
  character,
}: {
  combat: CombatState;
  npcs?: GameNpc[];
  character?: TrpgCharacter;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const currentTurnId = combat.turnOrder[combat.currentTurnIndex];
  const currentParticipant = currentTurnId ? combat.participants[currentTurnId] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={springSnappy}
      className="shrink-0 border-b border-red-500/20 bg-red-500/5"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-1.5"
      >
        <IconDice className="size-3.5 shrink-0 text-red-500" />
        <span className="text-xs font-medium text-foreground">战斗 · 第 {combat.round} 轮</span>
        {currentParticipant && (
          <span className="text-xs text-muted-foreground">
            当前回合: <span className="font-medium text-foreground">{currentParticipant.name}</span>
          </span>
        )}
        {character && (
          <span className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="text-red-500/80">
              HP {character.hp.current}/{character.hp.max}
            </span>
            <span className="text-blue-500/80">AC {character.ac}</span>
          </span>
        )}
        <IconChevronRight
          className={`size-3 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSoft}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {combat.turnOrder.map((id, idx) => {
                const p = combat.participants[id];
                if (!p) return null;
                const isCurrent = idx === combat.currentTurnIndex;
                return (
                  <span
                    key={id}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      isCurrent
                        ? "bg-red-500/20 font-medium text-red-600 dark:text-red-400"
                        : "bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {p.name}
                    {p.hp && (
                      <span className="ml-1 opacity-70">
                        {p.hp.current}/{p.hp.max}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
