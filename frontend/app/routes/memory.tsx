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
  IconSearch,
  IconClock,
  IconInfo,
  IconRefresh,
} from "~/components/luzzy/luzzy-icons";

import type {
  MemorySettings,
  VectorMemoryShard,
  MemoryEntry,
  ApiSettings,
  ApiProvider,
  Character,
} from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { getItem, setItem } from "~/services/storage";
import { logger } from "~/services/logger";
import {
  loadVectorMemoryShards,
  loadLongTermMemory,
  searchAllMemory,
  type MemorySearchResult,
} from "~/services/memoryService";
import { useAppStore } from "~/stores";
import { parseModelName } from "~/services/providerService";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
          <div className="border-b border-border/50 px-4 py-3">
            <MemorySettingsCard
              settings={settings}
              providers={providers}
              characters={characters}
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
                {activeTab === "session" && <SessionMemoryTab settings={settings} />}
                {activeTab === "long-term" && (
                  <LongTermMemoryTab settings={settings} />
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
  /** v0.4.4: 角色卡列表(用于长期记忆的角色卡启用选择) */
  characters: Character[];
  onUpdate: <K extends keyof MemorySettings>(
    key: K,
    value: MemorySettings[K],
  ) => void;
  onSave: () => void | Promise<void>;
}

function MemorySettingsCard({
  settings,
  providers,
  characters,
  onUpdate,
  onSave,
}: MemorySettingsCardProps) {
  // v0.4.6: 记忆设置卡片默认展开,用户首次进入页面即可看到所有设置项
  const [expanded, setExpanded] = React.useState(true);
  // v0.3.3: 保存按钮加载状态动画
  const [saving, setSaving] = React.useState(false);
  const hasEmbeddingModel = Boolean(settings.embeddingModel?.trim());

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
              {/* 系统自动启用说明 */}
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <IconInfo className="mt-0.5 size-3.5 shrink-0" />
                <span>记忆系统在配置嵌入模型后自动启用</span>
              </div>

              {/* 嵌入模型（v0.3.4: 改为下拉框+手动输入） */}
              <div className="grid gap-2 min-w-0">
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

              {/* v0.4.4: 长期记忆角色卡启用选择 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  长期记忆启用角色卡
                  <span className="ml-2 text-xs text-muted-foreground">
                    {(settings.longTermMemoryCharacterIds ?? []).length === 0
                      ? "全部启用"
                      : `${(settings.longTermMemoryCharacterIds ?? []).length} 个角色卡`}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  选择要限制的角色卡（不选则全部角色卡均启用长期记忆）
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
}

function SessionMemoryTab({ settings: _settings }: SessionMemoryTabProps) {
  const characters = useAppStore((s) => s.characters);
  const sessions = useAppStore((s) => s.sessions);
  const currentCharacterUuid = useAppStore((s) => s.currentCharacterUuid);

  const [selectedUuid, setSelectedUuid] = React.useState<string>(
    currentCharacterUuid ?? "",
  );
  const [selectedSessionId, setSelectedSessionId] = React.useState<string>("");
  const [shards, setShards] = React.useState<VectorMemoryShard[]>([]);
  const [loaded, setLoaded] = React.useState(false);

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

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 p-4 pb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>向量记忆分片</span>
            <Badge variant="secondary" className="text-xs">
              {shards.length} 条
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {/* 角色选择 */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">选择角色卡</label>
              <Select value={selectedUuid} onValueChange={setSelectedUuid}>
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
            </div>

            {/* 会话选择（可选） */}
            {selectedUuid && characterSessions.length > 0 && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  选择会话（默认打开最近会话，可切换为全部会话）
                </label>
                <Select
                  value={selectedSessionId || "__all__"}
                  onValueChange={(v) =>
                    setSelectedSessionId(v === "__all__" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部会话（角色级）</SelectItem>
                    {characterSessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title || `会话 ${s.id.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 分片列表 */}
            {!selectedUuid ? (
              <EmptyState
                icon={<IconBook className="size-6" />}
                title="选择角色卡查看记忆"
                description="向量记忆按角色卡分别存储，选择后可查看对应分片"
              />
            ) : loaded && shards.length === 0 ? (
              <EmptyState
                icon={<IconBook className="size-6" />}
                title="暂无向量记忆分片"
                description="对话后将自动生成向量记忆"
              />
            ) : (
              <ScrollArea className="h-96 rounded-lg border">
                <div className="flex flex-col gap-2 p-2">
                  <AnimatePresence initial={false}>
                    {shards.map((s, idx) => (
                      <motion.div
                        key={s.id}
                        {...springEnter}
                        custom={idx}
                        className="rounded-md border bg-muted/30 p-2.5"
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
    </div>
  );
}

// ============================================================================
// 长期记忆 Tab
// ============================================================================

interface LongTermMemoryTabProps {
  settings: MemorySettings;
}

function LongTermMemoryTab({ settings }: LongTermMemoryTabProps) {
  const characters = useAppStore((s) => s.characters);
  const currentCharacterUuid = useAppStore((s) => s.currentCharacterUuid);
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const providers = React.useMemo(() => getAllProviders(), [getAllProviders]);
  const apiProviderKeys = useAppStore((s) => s.apiProviderKeys);

  const [selectedUuid, setSelectedUuid] = React.useState<string>(
    currentCharacterUuid ?? "",
  );
  const [entries, setEntries] = React.useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // 搜索状态
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchType, setSearchType] = React.useState<"keyword" | "semantic">(
    "keyword",
  );
  const [searchResults, setSearchResults] = React.useState<MemorySearchResult[] | null>(
    null,
  );
  const [searching, setSearching] = React.useState(false);

  /** 当 currentCharacterUuid 变化且尚未手动选择时同步 */
  React.useEffect(() => {
    if (currentCharacterUuid && !selectedUuid) {
      setSelectedUuid(currentCharacterUuid);
    }
  }, [currentCharacterUuid, selectedUuid]);

  /** 加载长期记忆 */
  React.useEffect(() => {
    if (!selectedUuid) {
      setEntries([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    void (async () => {
      try {
        const list = await loadLongTermMemory(selectedUuid);
        setEntries(list);
      } catch (e) {
        toast.error("加载长期记忆失败：" + (e as Error).message);
        setEntries([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, [selectedUuid]);

  /** 执行搜索 */
  const handleSearch = React.useCallback(async () => {
    if (!searchQuery.trim() || !selectedUuid) return;
    setSearching(true);
    try {
      const state = useAppStore.getState();
      // v0.3.4: enableThinking 从当前模型的 supportsReasoning 派生
      const allProviders = state.getAllProviders();
      const currentProvider = allProviders.find((p) => p.id === state.apiProviderId);
      const { providerId, modelName: actualModelName } = parseModelName(state.modelName);
      const targetProvider = providerId
        ? allProviders.find((p) => p.id === providerId)
        : currentProvider;
      const currentModel = targetProvider?.models?.find((m) => m.name === actualModelName);
      const enableThinking = !!currentModel?.supportsReasoning;
      const apiSettings: ApiSettings = {
        apiUrl: state.apiUrl,
        apiKey: state.apiKey,
        modelName: state.modelName,
        stream: state.stream,
        enableThinking,
        customRequestBody: state.customRequestBody,
      };
      const results = await searchAllMemory(
        searchQuery,
        searchType,
        selectedUuid,
        undefined,
        settings,
        apiSettings,
        providers,
        apiProviderKeys,
      );
      setSearchResults(results);
      if (results.length === 0) {
        toast.info("未找到匹配的记忆");
      }
    } catch (e) {
      toast.error("搜索失败：" + (e as Error).message);
    } finally {
      setSearching(false);
    }
  }, [
    searchQuery,
    searchType,
    selectedUuid,
    settings,
    providers,
    apiProviderKeys,
  ]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 p-4 pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>长期记忆</span>
              <Badge variant="secondary" className="text-xs">
                {entries.length} 条
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-xs text-muted-foreground">
              长期记忆为跨会话级别的记忆条目，由系统在对话中自动聚合生成，
              可通过下方搜索框进行关键词或语义检索。
            </p>

            {/* 角色选择 */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">选择角色卡</label>
              <Select value={selectedUuid} onValueChange={setSelectedUuid}>
                <SelectTrigger>
                  <SelectValue placeholder="选择角色卡查看长期记忆" />
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
            </div>

            {/* 搜索框 */}
            {selectedUuid && (
              <div className="grid gap-2 rounded-lg border p-3">
                <label className="text-sm font-medium">记忆检索</label>
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="输入关键词或语义查询..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleSearch();
                      }
                    }}
                  />
                  <Select
                    value={searchType}
                    onValueChange={(v: "keyword" | "semantic") =>
                      setSearchType(v)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">关键词</SelectItem>
                      <SelectItem value="semantic">语义</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => void handleSearch()}
                    disabled={searching || !searchQuery.trim()}
                    {...pressable}
                  >
                    <IconSearch className="size-4" />
                  </Button>
                </div>

                {/* 搜索结果 */}
                {searchResults !== null && (
                  <div className="mt-2 grid gap-1.5">
                    <div className="text-xs text-muted-foreground">
                      找到 {searchResults.length} 条结果
                    </div>
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="flex flex-col gap-1.5 p-2">
                        {searchResults.length === 0 ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">
                            无匹配结果
                          </div>
                        ) : (
                          searchResults.map((r, idx) => (
                            <div
                              key={idx}
                              className="rounded-md border bg-muted/30 p-2"
                            >
                              <div className="mb-1 flex items-center gap-1.5">
                                <Badge variant="outline" className="text-xs">
                                  {r.scope === "session"
                                    ? "会话"
                                    : r.scope === "long-term"
                                      ? "长期"
                                      : "全局"}
                                </Badge>
                                {r.turn !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    轮次 {r.turn}
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="text-xs">
                                  {r.score.toFixed(3)}
                                </Badge>
                              </div>
                              <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs">
                                {r.content}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {/* 长期记忆列表 */}
            {!selectedUuid ? (
              <EmptyState
                icon={<IconClock className="size-6" />}
                title="选择角色卡查看长期记忆"
                description="长期记忆按角色卡分别存储，跨会话聚合"
              />
            ) : loaded && entries.length === 0 ? (
              <EmptyState
                icon={<IconClock className="size-6" />}
                title="暂无长期记忆"
                description="系统将在多会话对话中自动聚合生成长期记忆"
              />
            ) : (
              <ScrollArea className="h-96 rounded-lg border">
                <div className="flex flex-col gap-2 p-2">
                  <AnimatePresence initial={false}>
                    {entries.map((e, idx) => (
                      <motion.div
                        key={e.id}
                        {...springEnter}
                        custom={idx}
                        className="rounded-md border bg-muted/30 p-2.5"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          {e.turn !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              轮次 {e.turn}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {e.embedding?.length ?? 0} 维
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(e.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs">
                          {e.content || "(空)"}
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}
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
