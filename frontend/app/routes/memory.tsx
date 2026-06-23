/**
 * 记忆页面（v0.2.0 重构）
 *
 * 两级架构 Tab：
 * 1. 会话记忆：当前会话的向量记忆分片查看（按角色 + 会话筛选）
 * 2. 长期记忆：跨会话级别记忆条目查看与检索
 *
 * 顶部固定记忆设置卡片（启用开关 / 嵌入模型 / 嵌入供应商 / 召回深度 /
 * 向量 Top-K / 相似度阈值 / 记忆压缩）。
 */

import * as React from "react";
import type { Route } from "./+types/memory";
import { motion, AnimatePresence } from "motion/react";
import {
  IconBook,
  IconSave,
  IconClock,
  IconInfo,
  IconRefresh,
  IconLock,
  IconExclamation,
  IconTrash,
} from "~/components/luzzy/luzzy-icons";

import type {
  MemorySettings,
  VectorMemoryShard,
  WorldInfoEntry,
  ApiProvider,
  Character,
} from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { getItem, setItem } from "~/services/storage";
import { logger } from "~/services/logger";
import {
  loadVectorMemoryShards,
  loadWorldVectorMemoryShards,
  removeVectorMemoryShardById,
  removeWorldVectorMemoryShardById,
  // v0.5.9-locked: 长期记忆功能锁定
  // loadLongTermMemory,
  // searchAllMemory,
  // type MemorySearchResult,
} from "~/services/memoryService";
import { useAppStore } from "~/stores";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";
import { Slider } from "~/components/ui/slider";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "~/components/ui/empty";
import {
  springEnter,
  pressable,
  pressableSubtle,
  fadeSlide,
  listItemAnimation,
} from "~/lib/motion-presets";
import { toast } from "sonner";

export function meta(_: Route.MetaArgs) {
  return [{ title: "记忆 - LUZZY" }];
}

// ============================================================================
// 常量
// ============================================================================

/** 记忆设置在 IndexedDB 中的存储键 */
const MEMORY_SETTINGS_KEY = "memorySettings";

/** 默认记忆设置（v0.2.0 移除 maxMemories） */
const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true, // 默认启用，无嵌入模型时自动禁用
  embeddingModel: "",
  embeddingApiProviderId: "",
  maxMemories: 100, // 保留字段以兼容旧数据，UI 不再展示
  recallDepth: 10, // 系统内置最优值
  vectorTopK: 15, // 系统内置最优值
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 20,
  longTermMemoryCharacterIds: [],
};

type TabKey = "session" | "long-term";

const TABS: { key: TabKey; label: string; icon: typeof IconBook }[] = [
  { key: "session", label: "会话记忆", icon: IconBook },
  { key: "long-term", label: "长期记忆", icon: IconClock },
];

/** 格式化时间戳 */
const formatTime = (ts: number): string => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ============================================================================
// 主组件
// ============================================================================

export default function MemoryPage() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("session");

  // 记忆设置
  const [settings, setSettings] = React.useState<MemorySettings>(
    DEFAULT_MEMORY_SETTINGS,
  );

  // store 数据
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const providers = React.useMemo(() => getAllProviders(), [getAllProviders]);
  const characters = useAppStore((s) => s.characters);

  // v0.5.9: 记忆设置卡片 ref，用于子组件滚动跳转
  const settingsCardRef = React.useRef<HTMLDivElement>(null);
  const scrollToSettings = React.useCallback(() => {
    settingsCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  /** 页面加载时读取记忆设置 */
  React.useEffect(() => {
    void (async () => {
      try {
        const data = await getItem<MemorySettings>(
          "memory",
          MEMORY_SETTINGS_KEY,
        );
        if (data) setSettings({ ...DEFAULT_MEMORY_SETTINGS, ...data });
      } catch (e) {
        toast.error("加载记忆设置失败：" + (e as Error).message);
      }
    })();
  }, []);

  /** 更新设置字段 */
  const updateField = React.useCallback(
    <K extends keyof MemorySettings>(key: K, value: MemorySettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** 保存记忆设置 */
  const handleSaveSettings = React.useCallback(async () => {
    try {
      // 系统内置最优值：enabled 由嵌入模型是否存在自动决定，recallDepth/vectorTopK 固定
      const persisted: MemorySettings = {
        ...settings,
        enabled: true,
        recallDepth: 10,
        vectorTopK: 15,
      };
      await setItem("memory", MEMORY_SETTINGS_KEY, persisted);
      logger.info("user", "保存记忆设置");
      toast.success("记忆设置已保存");
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, [settings]);

  return (
    <LuzzyLayout title="记忆">
      <ScrollArea className="h-full w-full">
        <div className="flex min-w-0 flex-col">
          {/* 记忆设置卡片（可展开，展开后页面整体可滚动） */}
          <div ref={settingsCardRef} className="border-b border-border/50 px-4 py-3 scroll-mt-2">
            <MemorySettingsCard
              settings={settings}
              providers={providers}
              onUpdate={updateField}
              onSave={handleSaveSettings}
            />
          </div>

          {/* Tab 导航 */}
          <div className="flex items-center gap-1 border-b border-border/50 px-4 pb-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <motion.button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  {...pressableSubtle}
                >
                  <Icon className="size-4" />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="memory-tab-indicator"
                      className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Tab 内容（v0.3.3：移除 overflow-hidden，改为随页面整体滚动） */}
          <div className="min-h-[50vh]">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} {...fadeSlide}>
                {activeTab === "session" && (
                  <SessionMemoryTab
                    settings={settings}
                    onScrollToSettings={scrollToSettings}
                  />
                )}
                {activeTab === "long-term" && (
                  <LongTermMemoryTab
                    settings={settings}
                    characters={characters}
                    onUpdate={updateField}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>
    </LuzzyLayout>
  );
}

// ============================================================================
// 记忆设置卡片
// ============================================================================

interface MemorySettingsCardProps {
  settings: MemorySettings;
  providers: ApiProvider[];
  onUpdate: <K extends keyof MemorySettings>(
    key: K,
    value: MemorySettings[K],
  ) => void;
  onSave: () => void | Promise<void>;
}

function MemorySettingsCard({
  settings,
  providers,
  onUpdate,
  onSave,
}: MemorySettingsCardProps) {
  // v0.4.6: 记忆设置卡片默认展开,用户首次进入页面即可看到所有设置项
  const [expanded, setExpanded] = React.useState(true);
  // v0.3.3: 保存按钮加载状态动画
  const [saving, setSaving] = React.useState(false);
  const hasEmbeddingModel = Boolean(settings.embeddingModel?.trim());
  // v0.5.9: 嵌入模型选择器 ref，用于横幅快捷跳转
  const embeddingModelRef = React.useRef<HTMLDivElement>(null);

  /** v0.5.9: 滚动到嵌入模型选择器 */
  const scrollToEmbeddingModel = React.useCallback(() => {
    if (!expanded) setExpanded(true);
    // 等待展开动画完成后滚动
    setTimeout(() => {
      embeddingModelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 250);
  }, [expanded]);

  /** 保存设置（带加载动画 + 嵌入模型空值提示） */
  const handleSave = React.useCallback(async () => {
    if (saving) return;
    // v0.3.3: 未配置嵌入模型时文字提示
    if (!hasEmbeddingModel) {
      toast.warning("未配置嵌入模型，向量记忆将降级为关键词匹配。如需语义检索，请填写嵌入模型名称。");
    }
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }, [saving, hasEmbeddingModel, onSave]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          {...pressableSubtle}
        >
          <CardTitle className="flex items-center gap-2">
            <IconBook className="size-4" />
            记忆设置
            <Badge variant={hasEmbeddingModel ? "default" : "secondary"}>
              {hasEmbeddingModel ? "已启用" : "未启用"}
            </Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {expanded ? "收起" : "展开"}
          </span>
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CardContent className="grid gap-4 pt-0">
              {/* v0.5.9: 嵌入模型未配置时的醒目横幅 */}
              <AnimatePresence>
                {!hasEmbeddingModel && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
                  >
                    <motion.div
                      initial={{ scale: 0, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    >
                      <IconExclamation className="size-4" />
                    </motion.div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        请先配置嵌入模型
                      </span>
                      <span className="text-xs text-amber-600/80 dark:text-amber-400/80">
                        以启用向量记忆和语义检索功能
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={scrollToEmbeddingModel}
                      className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                      {...pressable}
                    >
                      前往配置
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 系统自动启用说明 */}
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <IconInfo className="mt-0.5 size-3.5 shrink-0" />
                <span>记忆系统在配置嵌入模型后自动启用</span>
              </div>

              {/* 嵌入模型（v0.3.4: 改为下拉框+手动输入） */}
              <div ref={embeddingModelRef} className="grid gap-2 min-w-0 scroll-mt-4">
                <label className="text-sm font-medium">嵌入模型</label>
                {(() => {
                  // v0.3.4: 从所有供应商中筛选 supportsEmbedding=true 的模型
                  const embeddingModels = providers.flatMap((p) =>
                    (p.models ?? [])
                      .filter((m) => m.supportsEmbedding)
                      .map((m) => ({ providerId: p.id, providerName: p.displayName ?? p.name, modelName: m.name })),
                  );
                  const MANUAL_VALUE = "__manual__";
                  const isManual =
                    settings.embeddingModel &&
                    !embeddingModels.some((m) => m.modelName === settings.embeddingModel);
                  const selectValue = isManual ? MANUAL_VALUE : (settings.embeddingModel || "");

                  return (
                    <>
                      <Select
                        value={selectValue}
                        onValueChange={(v) => {
                          if (v === MANUAL_VALUE) {
                            // 切换到手动输入模式，保留当前值或清空
                            onUpdate("embeddingModel", isManual ? settings.embeddingModel : "");
                          } else {
                            onUpdate("embeddingModel", v);
                          }
                        }}
                      >
                        {/* v0.4.6: w-full + min-w-0 避免长模型名/供应商名撑爆父容器导致页面横向溢出 */}
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue placeholder="选择嵌入模型或手动输入" />
                        </SelectTrigger>
                        <SelectContent>
                          {embeddingModels.length === 0 && (
                            <SelectItem value="__none__" disabled>
                              暂无支持嵌入的模型，请手动输入
                            </SelectItem>
                          )}
                          {embeddingModels.map((m) => (
                            <SelectItem key={`${m.providerId}_${m.modelName}`} value={m.modelName}>
                              {m.modelName}（{m.providerName}）
                            </SelectItem>
                          ))}
                          <SelectItem value={MANUAL_VALUE}>手动输入...</SelectItem>
                        </SelectContent>
                      </Select>
                      {isManual && (
                        <Input
                          className="w-full min-w-0"
                          value={settings.embeddingModel}
                          onChange={(e) =>
                            onUpdate("embeddingModel", e.target.value)
                          }
                          placeholder="例如：text-embedding-3-small"
                        />
                      )}
                    </>
                  );
                })()}
                {/* v0.3.3: 未配置嵌入模型时的提示 */}
                {!hasEmbeddingModel && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <IconInfo className="size-3 shrink-0" />
                    未配置嵌入模型，向量记忆将降级为关键词匹配
                  </motion.p>
                )}
              </div>

              {/* 相似度阈值 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  相似度阈值
                  <span className="ml-2 text-xs text-muted-foreground">
                    {settings.similarityThreshold.toFixed(2)}
                  </span>
                </label>
                <Slider
                  value={[settings.similarityThreshold]}
                  onValueChange={([v]) =>
                    onUpdate("similarityThreshold", v)
                  }
                  min={0}
                  max={1}
                  step={0.01}
                />
              </div>

              {/* v0.5.9: 长期记忆角色卡选择已移至 LongTermMemoryTab */}

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} {...pressable}>
                  {saving ? (
                    <>
                      <IconRefresh className="mr-2 size-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <IconSave className="mr-2 size-4" />
                      保存设置
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ============================================================================
// 会话记忆 Tab
// ============================================================================

interface SessionMemoryTabProps {
  settings: MemorySettings;
  /** v0.5.9: 滚动到记忆设置卡片的回调（嵌入模型未配置时引导跳转） */
  onScrollToSettings?: () => void;
}

function SessionMemoryTab({
  settings,
  onScrollToSettings,
}: SessionMemoryTabProps) {
  const characters = useAppStore((s) => s.characters);
  const sessions = useAppStore((s) => s.sessions);
  const currentCharacterUuid = useAppStore((s) => s.currentCharacterUuid);

  const hasEmbeddingModel = Boolean(settings.embeddingModel?.trim());

  const [selectedUuid, setSelectedUuid] = React.useState<string>(
    currentCharacterUuid ?? "",
  );
  const [selectedSessionId, setSelectedSessionId] = React.useState<string>("");
  const [shards, setShards] = React.useState<VectorMemoryShard[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // v0.5.9: 世界书选择器状态
  const [worldBooks, setWorldBooks] = React.useState<
    Array<{ bookId: string; bookName: string; count: number }>
  >([]);
  const [selectedBookId, setSelectedBookId] = React.useState<string>("");
  const [worldShards, setWorldShards] = React.useState<VectorMemoryShard[]>([]);
  const [worldLoaded, setWorldLoaded] = React.useState(false);
  /** 当前激活的数据源：session | world（最近操作的选择器优先显示） */
  const [activeSource, setActiveSource] = React.useState<"session" | "world">(
    "session",
  );

  // v0.6.0: 分片详情 Dialog 状态 + 删除确认
  const [selectedShard, setSelectedShard] = React.useState<VectorMemoryShard | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // v0.6.0: 处理中动画状态（分片为空且嵌入模型已配置时显示）
  const [isProcessing, setIsProcessing] = React.useState(false);
  const confirm = useConfirm();

  /** v0.6.0: 删除单个分片（会话或世界书） */
  const handleDeleteShard = React.useCallback(async () => {
    if (!selectedShard) return;
    const ok = await confirm({
      title: "删除分片",
      description: "确定删除该向量记忆分片吗？此操作不可撤销。",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      if (activeSource === "world") {
        await removeWorldVectorMemoryShardById(selectedBookId, selectedShard.id);
        setWorldShards((prev) => prev.filter((s) => s.id !== selectedShard.id));
      } else {
        await removeVectorMemoryShardById(
          selectedUuid,
          selectedShard.id,
          selectedSessionId || undefined,
        );
        setShards((prev) => prev.filter((s) => s.id !== selectedShard.id));
      }
      toast.success("分片已删除");
      setSelectedShard(null);
    } catch (e) {
      toast.error("删除失败：" + (e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [selectedShard, activeSource, selectedBookId, selectedUuid, selectedSessionId, confirm]);

  /** 当前角色的会话列表（按最近更新排序） */
  const characterSessions = React.useMemo(() => {
    if (!selectedUuid) return [];
    return sessions
      .filter((s) => s.characterId === selectedUuid)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, selectedUuid]);

  /** 当 currentCharacterUuid 变化且尚未手动选择时同步 */
  React.useEffect(() => {
    if (currentCharacterUuid && !selectedUuid) {
      setSelectedUuid(currentCharacterUuid);
    }
  }, [currentCharacterUuid, selectedUuid]);

  /** 角色切换时自动选择最近会话 */
  React.useEffect(() => {
    if (!selectedUuid) {
      setSelectedSessionId("");
      return;
    }
    const charSessions = sessions.filter((s) => s.characterId === selectedUuid);
    if (charSessions.length === 0) {
      setSelectedSessionId("");
      return;
    }
    // v0.5.7: 默认打开最近会话（按 updatedAt 降序）
    const mostRecent = [...charSessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    setSelectedSessionId(mostRecent.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUuid]);

  /** 加载向量记忆分片 */
  React.useEffect(() => {
    if (!selectedUuid) {
      setShards([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    void (async () => {
      try {
        const list = await loadVectorMemoryShards(
          selectedUuid,
          selectedSessionId || undefined,
        );
        setShards(list);
      } catch (e) {
        toast.error("加载向量记忆失败：" + (e as Error).message);
        setShards([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, [selectedUuid, selectedSessionId]);

  /** v0.5.9: 加载世界书列表（从 IndexedDB 提取唯一 bookId/bookName） */
  React.useEffect(() => {
    void (async () => {
      try {
        const allEntries = await getItem<WorldInfoEntry[]>(
          "worldInfo",
          "worldInfo",
        );
        if (!allEntries || allEntries.length === 0) {
          setWorldBooks([]);
          return;
        }
        // 提取唯一 bookId 并统计条目数
        const bookMap = new Map<string, { bookName: string; count: number }>();
        for (const entry of allEntries) {
          const bid = entry.bookId?.trim();
          if (!bid) continue;
          const existing = bookMap.get(bid);
          if (existing) {
            existing.count += 1;
          } else {
            bookMap.set(bid, {
              bookName: entry.bookName?.trim() || bid,
              count: 1,
            });
          }
        }
        const books = Array.from(bookMap.entries()).map(([bookId, info]) => ({
          bookId,
          bookName: info.bookName,
          count: info.count,
        }));
        setWorldBooks(books);
      } catch (e) {
        logger.warn(
          "memory",
          "加载世界书列表失败：" + (e as Error).message,
        );
        setWorldBooks([]);
      }
    })();
  }, []);

  /** v0.5.9: 加载世界书向量分片 */
  React.useEffect(() => {
    if (!selectedBookId) {
      setWorldShards([]);
      setWorldLoaded(true);
      return;
    }
    setWorldLoaded(false);
    void (async () => {
      try {
        const list = await loadWorldVectorMemoryShards(selectedBookId);
        setWorldShards(list);
      } catch (e) {
        toast.error("加载世界书向量记忆失败：" + (e as Error).message);
        setWorldShards([]);
      } finally {
        setWorldLoaded(true);
      }
    })();
  }, [selectedBookId]);

  /** 当前显示的分片列表和状态（根据 activeSource 切换） */
  const displayShards =
    activeSource === "world" ? worldShards : shards;
  const displayLoaded =
    activeSource === "world" ? worldLoaded : loaded;

  // v0.6.0: 分片列表为空且嵌入模型已配置时，短暂显示"正在处理"动画
  // 实际向量生成是异步的（extractMemory / generateWorldInfoEmbeddings），此处仅作 UX 提示
  React.useEffect(() => {
    if (!displayLoaded) return;
    const hasSelection = activeSource === "world" ? !!selectedBookId : !!selectedUuid;
    if (hasEmbeddingModel && hasSelection && displayShards.length === 0) {
      setIsProcessing(true);
      const timer = setTimeout(() => setIsProcessing(false), 3000);
      return () => clearTimeout(timer);
    }
    setIsProcessing(false);
  }, [displayLoaded, displayShards.length, hasEmbeddingModel, activeSource, selectedBookId, selectedUuid]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 p-4 pb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>向量记忆分片</span>
            <Badge variant="secondary" className="text-xs">
              {displayShards.length} 条
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {/* 角色卡选择（一级） */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">选择角色卡</label>
            <Select
              value={selectedUuid}
              onValueChange={(v) => {
                setSelectedUuid(v);
                // v0.6.1: 角色切换时重置会话和世界书选择
                setSelectedSessionId("");
                setSelectedBookId("");
                setActiveSource("session");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择角色卡查看向量记忆" />
              </SelectTrigger>
              <SelectContent>
                {characters.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    暂无角色卡
                  </SelectItem>
                ) : (
                  characters.map((c) => (
                    <SelectItem key={c.uuid} value={c.uuid}>
                      <span className="truncate">{c.name}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* v0.6.1: 会话选择（二级缩进，与世界书互斥） */}
            {selectedUuid && characterSessions.length > 0 && (
              <div className="ml-4 grid gap-2 border-l border-border/40 pl-3">
                <label className="text-xs font-medium text-muted-foreground">
                  选择会话
                </label>
                <Select
                  value={selectedSessionId}
                  onValueChange={(v) => {
                    setSelectedSessionId(v);
                    // v0.6.1: 互斥 - 选择会话时清空世界书
                    setSelectedBookId("");
                    setActiveSource("session");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="选择会话" />
                  </SelectTrigger>
                  <SelectContent>
                    {characterSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title || `会话 ${s.id.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* v0.6.1: 世界书选择（二级缩进，与会话互斥） */}
            {selectedUuid && worldBooks.length > 0 && (
              <div className="ml-4 grid gap-2 border-l border-border/40 pl-3">
                <label className="text-xs font-medium text-muted-foreground">
                  选择世界书
                </label>
                <Select
                  value={selectedBookId}
                  onValueChange={(v) => {
                    setSelectedBookId(v);
                    // v0.6.1: 互斥 - 选择世界书时清空会话
                    setSelectedSessionId("");
                    setActiveSource("world");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="选择世界书查看向量分片" />
                  </SelectTrigger>
                  <SelectContent>
                    {worldBooks.map((b) => (
                      <SelectItem key={b.bookId} value={b.bookId}>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{b.bookName}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] leading-none"
                          >
                            {b.count}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 分片列表 */}
          {!displayLoaded ? (
            // v0.6.0: 加载中状态 - Skeleton 占位
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : !hasEmbeddingModel && (activeSource === "session" ? !selectedUuid || (displayLoaded && displayShards.length === 0) : !selectedBookId || (displayLoaded && displayShards.length === 0)) ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 py-8 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                className="flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
              >
                <IconExclamation className="size-6" />
              </motion.div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  尚未配置嵌入模型
                </span>
                <span className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  向量记忆和语义检索功能需要嵌入模型支持
                </span>
              </div>
              {onScrollToSettings && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onScrollToSettings}
                  className="border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                  {...pressable}
                >
                  前往配置
                </Button>
              )}
            </motion.div>
          ) : isProcessing ? (
            // v0.6.0: 处理中动画 - 分片为空且嵌入模型已配置时显示
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="shrink-0"
              >
                <IconRefresh className="size-4 text-primary" />
              </motion.div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-primary">
                  正在生成向量记忆分片...
                </span>
                <span className="text-xs text-primary/70">
                  系统正在分析并构建向量索引，请稍候
                </span>
              </div>
            </motion.div>
          ) : activeSource === "session" && !selectedUuid ? (
            <EmptyState
              icon={<IconBook className="size-6" />}
              title="选择角色卡查看记忆"
              description="向量记忆按角色卡分别存储，选择后可查看对应分片"
            />
          ) : activeSource === "session" && displayLoaded && displayShards.length === 0 ? (
            <EmptyState
              icon={<IconBook className="size-6" />}
              title="暂无向量记忆分片"
              description="对话后将自动生成向量记忆"
            />
          ) : activeSource === "world" && !selectedBookId ? (
            <EmptyState
              icon={<IconBook className="size-6" />}
              title="选择世界书查看分片"
              description="世界书条目导入后将自动生成向量分片"
            />
          ) : activeSource === "world" && displayLoaded && displayShards.length === 0 ? (
            <EmptyState
              icon={<IconBook className="size-6" />}
              title="暂无世界书向量分片"
              description="导入或创建世界书条目后将自动生成嵌入向量"
            />
          ) : (
            <ScrollArea className="h-96 rounded-lg border">
              <div className="flex flex-col gap-2 p-2">
                <AnimatePresence initial={false}>
                  {displayShards.map((s, idx) => (
                    <motion.div
                      key={s.id}
                      layout
                      {...listItemAnimation}
                      custom={idx}
                      onClick={() => setSelectedShard(s)}
                      className="cursor-pointer rounded-md border bg-muted/30 p-2.5 transition-colors hover:bg-muted/50"
                      {...pressableSubtle}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          轮次 {s.turn}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {s.embedding.length} 维
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(s.createdAt)}
                        </span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs">
                        {s.content || "(空)"}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* v0.6.0: 分片详情 Dialog */}
      <Dialog open={!!selectedShard} onOpenChange={(o) => !o && setSelectedShard(null)}>
        <DialogContent className="max-h-[85vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <IconBook className="size-4" />
              分片详情
            </DialogTitle>
            <DialogDescription>
              {selectedShard &&
                `轮次 ${selectedShard.turn} · ${selectedShard.embedding.length} 维 · ${formatTime(selectedShard.createdAt)}`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-2">
            <div className="flex flex-col gap-3 pb-2">
              {/* 元数据 */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  轮次 {selectedShard?.turn}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {selectedShard?.embedding.length ?? 0} 维
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {formatTime(selectedShard?.createdAt ?? 0)}
                </Badge>
              </div>
              {/* 完整内容 */}
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="whitespace-pre-wrap break-words text-sm">
                  {selectedShard?.content || "(空)"}
                </p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0 gap-2">
            <Button variant="outline" onClick={() => setSelectedShard(null)}>
              关闭
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteShard}
              disabled={deleting}
            >
              <IconTrash className="size-4" />
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 长期记忆 Tab（v0.5.9: 功能锁定，仅保留角色卡启用选择）
// ============================================================================

interface LongTermMemoryTabProps {
  settings: MemorySettings;
  characters: Character[];
  onUpdate: <K extends keyof MemorySettings>(
    key: K,
    value: MemorySettings[K],
  ) => void;
}

function LongTermMemoryTab({ settings, characters, onUpdate }: LongTermMemoryTabProps) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 p-4 pb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconLock className="size-4 text-muted-foreground" />
            长期记忆
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* 锁定提示卡片 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-muted/30 py-8 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <IconLock className="size-6" />
            </motion.div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">功能开发中，敬请期待</span>
              <span className="text-xs text-muted-foreground">
                长期记忆功能正在重构中，暂不可用。当前会话向量记忆不受此设置影响
              </span>
            </div>
          </motion.div>

          {/* 角色卡启用选择（保留设置项供将来解锁后使用） */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">
              长期记忆启用角色卡
              <span className="ml-2 text-xs text-muted-foreground">
                {(settings.longTermMemoryCharacterIds ?? []).length === 0
                  ? "全部禁用"
                  : `${(settings.longTermMemoryCharacterIds ?? []).length} 个角色卡`}
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              此设置将在长期记忆功能解锁后生效，当前不影响会话向量记忆
            </p>
            <div className="flex flex-wrap gap-2">
              {characters.length === 0 ? (
                <span className="text-xs text-muted-foreground">暂无角色卡</span>
              ) : (
                characters.map((c) => {
                  const selected = (settings.longTermMemoryCharacterIds ?? []).includes(c.uuid);
                  return (
                    <button
                      key={c.uuid}
                      type="button"
                      onClick={() => {
                        const current = settings.longTermMemoryCharacterIds ?? [];
                        const next = selected
                          ? current.filter((id) => id !== c.uuid)
                          : [...current, c.uuid];
                        onUpdate("longTermMemoryCharacterIds", next);
                      }}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// 通用空状态组件
// ============================================================================

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
