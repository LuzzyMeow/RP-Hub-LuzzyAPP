/**
 * 记忆页面（v0.2.0 重构）
 *
 * 三级架构 Tab：
 * 1. 会话记忆：当前会话的向量记忆分片查看（按角色 + 会话筛选）
 * 2. 长期记忆：跨会话级别记忆条目查看与检索
 * 3. 全局记忆：MEMORY.md 编辑与导出
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
  IconDownload,
  IconClock,
  IconGlobe,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconClose,
  IconPause,
} from "~/components/luzzy/luzzy-icons";

import type {
  MemorySettings,
  VectorMemoryShard,
  MemoryEntry,
  ApiSettings,
  AceSkill,
  AceSkillbook,
} from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
import {
  loadVectorMemoryShards,
  loadLongTermMemory,
  searchAllMemory,
  type MemorySearchResult,
} from "~/services/memoryService";
import {
  loadSkillbook,
  saveSkillbook,
  addSkill,
  updateSkill,
  removeSkill,
  hardDeleteSkill,
  getActiveSkills,
  sortSkills,
} from "~/services/aceSkillbookService";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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

/** 嵌入供应商「跟随聊天供应商」占位值 */
const FOLLOW_CHAT_PROVIDER = "__follow_chat__";

/** 默认记忆设置（v0.2.0 移除 maxMemories） */
const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: false,
  embeddingModel: "",
  embeddingApiProviderId: "",
  maxMemories: 100, // 保留字段以兼容旧数据，UI 不再展示
  recallDepth: 10,
  vectorTopK: 15,
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 20,
};

type TabKey = "session" | "long-term" | "global";

const TABS: { key: TabKey; label: string; icon: typeof IconBook }[] = [
  { key: "session", label: "会话记忆", icon: IconBook },
  { key: "long-term", label: "长期记忆", icon: IconClock },
  { key: "global", label: "全局记忆", icon: IconGlobe },
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
      await setItem("memory", MEMORY_SETTINGS_KEY, settings);
      toast.success("记忆设置已保存");
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, [settings]);

  return (
    <LuzzyLayout title="记忆">
      <div className="flex h-full flex-col">
        {/* 记忆设置卡片（固定顶部） */}
        <div className="border-b border-border/50 px-4 py-3">
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

        {/* Tab 内容 */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} {...fadeSlide} className="h-full">
              {activeTab === "session" && <SessionMemoryTab settings={settings} />}
              {activeTab === "long-term" && (
                <LongTermMemoryTab settings={settings} />
              )}
              {activeTab === "global" && <GlobalMemoryTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </LuzzyLayout>
  );
}

// ============================================================================
// 记忆设置卡片
// ============================================================================

interface MemorySettingsCardProps {
  settings: MemorySettings;
  providers: { id: string; name: string }[];
  onUpdate: <K extends keyof MemorySettings>(
    key: K,
    value: MemorySettings[K],
  ) => void;
  onSave: () => void;
}

function MemorySettingsCard({
  settings,
  providers,
  onUpdate,
  onSave,
}: MemorySettingsCardProps) {
  const [expanded, setExpanded] = React.useState(false);

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
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "已启用" : "未启用"}
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
              {/* 启用开关 */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">启用记忆系统</div>
                  <div className="text-xs text-muted-foreground">
                    开启后将在对话中自动召回与压缩记忆
                  </div>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => onUpdate("enabled", v)}
                />
              </div>

              {/* 嵌入模型 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">嵌入模型</label>
                <Input
                  value={settings.embeddingModel}
                  onChange={(e) =>
                    onUpdate("embeddingModel", e.target.value)
                  }
                  placeholder="例如：text-embedding-3-small"
                />
              </div>

              {/* 嵌入供应商 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">嵌入供应商</label>
                <Select
                  value={
                    settings.embeddingApiProviderId || FOLLOW_CHAT_PROVIDER
                  }
                  onValueChange={(v) =>
                    onUpdate(
                      "embeddingApiProviderId",
                      v === FOLLOW_CHAT_PROVIDER ? "" : v,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FOLLOW_CHAT_PROVIDER}>
                      跟随聊天供应商
                    </SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  嵌入供应商独立于聊天供应商，可单独指定
                </p>
              </div>

              {/* 数值参数 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">召回深度</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.recallDepth}
                    onChange={(e) =>
                      onUpdate("recallDepth", Number(e.target.value))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">向量 Top-K</label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.vectorTopK}
                    onChange={(e) =>
                      onUpdate("vectorTopK", Number(e.target.value))
                    }
                  />
                </div>
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
              </div>

              {/* 压缩设置 */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">启用记忆压缩</div>
                  <div className="text-xs text-muted-foreground">
                    保留最近 N 条消息，其余由向量记忆覆盖
                  </div>
                </div>
                <Switch
                  checked={settings.compressionEnabled}
                  onCheckedChange={(v) =>
                    onUpdate("compressionEnabled", v)
                  }
                />
              </div>

              {settings.compressionEnabled && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">保留最近消息数</label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.compressionKeepRecent}
                    onChange={(e) =>
                      onUpdate(
                        "compressionKeepRecent",
                        Number(e.target.value),
                      )
                    }
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={onSave} {...pressable}>
                  <IconSave className="mr-2 size-4" />
                  保存设置
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

  /** 当前角色的会话列表 */
  const characterSessions = React.useMemo(() => {
    if (!selectedUuid) return [];
    return sessions.filter((s) => s.characterId === selectedUuid);
  }, [sessions, selectedUuid]);

  /** 当 currentCharacterUuid 变化且尚未手动选择时同步 */
  React.useEffect(() => {
    if (currentCharacterUuid && !selectedUuid) {
      setSelectedUuid(currentCharacterUuid);
    }
  }, [currentCharacterUuid, selectedUuid]);

  /** 角色切换时重置会话选择 */
  React.useEffect(() => {
    setSelectedSessionId("");
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
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-8">
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
                        {c.name}
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
                  选择会话（可选，不选则查看角色级记忆）
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
    </ScrollArea>
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
      const apiSettings: ApiSettings = {
        apiUrl: state.apiUrl,
        apiKey: state.apiKey,
        modelName: state.modelName,
        stream: state.stream,
        enableThinking: state.enableThinking,
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
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-8">
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
                        {c.name}
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
    </ScrollArea>
  );
}

// ============================================================================
// 全局记忆 Tab（v0.3.0 ACE Skillbook 卡片列表）
// ============================================================================

function GlobalMemoryTab() {
  const [skillbook, setSkillbook] = React.useState<AceSkillbook | null>(null);
  const [editingSkill, setEditingSkill] = React.useState<AceSkill | null>(null);
  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  /** 加载 Skillbook */
  React.useEffect(() => {
    void (async () => {
      try {
        const book = await loadSkillbook();
        setSkillbook(book);
      } catch (e) {
        toast.error("加载全局记忆失败：" + (e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /** 保存 Skillbook */
  const handleSave = React.useCallback(async (book: AceSkillbook) => {
    try {
      await saveSkillbook(book);
      setSkillbook({ ...book });
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 新增策略 */
  const handleAddNew = React.useCallback(() => {
    setIsAddingNew(true);
    setEditingSkill(null);
  }, []);

  /** 编辑策略 */
  const handleEdit = React.useCallback((skill: AceSkill) => {
    setEditingSkill(skill);
    setIsAddingNew(false);
  }, []);

  /** 保存编辑（新增或更新） */
  const handleSaveEdit = React.useCallback(
    async (data: { category: string; content: string; active: boolean }) => {
      if (!skillbook) return;
      const book = { ...skillbook, skills: [...skillbook.skills] };
      if (isAddingNew) {
        addSkill(book, data.content, data.category, "manual");
        toast.success("已新增策略");
      } else if (editingSkill) {
        updateSkill(book, editingSkill.id, {
          category: data.category,
          content: data.content,
          active: data.active,
        });
        toast.success("已保存");
      }
      await handleSave(book);
      setEditingSkill(null);
      setIsAddingNew(false);
    },
    [skillbook, isAddingNew, editingSkill, handleSave],
  );

  /** 切换启用/停用 */
  const handleToggleActive = React.useCallback(
    async (skill: AceSkill) => {
      if (!skillbook) return;
      const book = { ...skillbook, skills: [...skillbook.skills] };
      updateSkill(book, skill.id, { active: !skill.active });
      await handleSave(book);
    },
    [skillbook, handleSave],
  );

  /** 软删除 */
  const handleSoftDelete = React.useCallback(
    async (skill: AceSkill) => {
      if (!skillbook) return;
      const book = { ...skillbook, skills: [...skillbook.skills] };
      removeSkill(book, skill.id);
      await handleSave(book);
      setEditingSkill(null);
      toast.success("已停用策略");
    },
    [skillbook, handleSave],
  );

  /** 硬删除 */
  const handleHardDelete = React.useCallback(
    async (skill: AceSkill) => {
      if (!skillbook) return;
      const book = { ...skillbook, skills: [...skillbook.skills] };
      hardDeleteSkill(book, skill.id);
      await handleSave(book);
      setEditingSkill(null);
      toast.success("已删除策略");
    },
    [skillbook, handleSave],
  );

  /** 导出全部策略为 markdown */
  const handleExport = React.useCallback(async () => {
    if (!skillbook) return;
    const active = getActiveSkills(skillbook);
    const text = active.map((s) => `- [${s.category}] ${s.content}`).join("\n");
    const blob = new Blob([text || "# (空)"], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MEMORY.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("已导出 MEMORY.md");
  }, [skillbook]);

  const sortedSkills = React.useMemo(
    () => (skillbook ? sortSkills(skillbook.skills) : []),
    [skillbook],
  );
  const activeCount = sortedSkills.filter((s) => s.active).length;
  const inactiveCount = sortedSkills.length - activeCount;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 pb-8">
        {/* 顶部统计栏 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <IconGlobe className="size-4" />
                全局记忆
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport()}
                  disabled={sortedSkills.length === 0}
                  {...pressable}
                >
                  <IconDownload className="mr-1.5 size-3.5" />
                  导出
                </Button>
                <Button size="sm" onClick={handleAddNew} {...pressable}>
                  <IconPlus className="mr-1.5 size-3.5" />
                  新增
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                全部策略{" "}
                <span className="font-semibold text-foreground">
                  {sortedSkills.length}
                </span>{" "}
                条
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span>
                启用{" "}
                <span className="font-semibold text-green-500">
                  {activeCount}
                </span>
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span>
                停用{" "}
                <span className="font-semibold text-muted-foreground">
                  {inactiveCount}
                </span>
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              全局记忆将注入到所有对话的系统提示中。v0.3.0
              升级为 ACE 策略手册，支持分类、评分与自动反思。
            </p>
          </CardContent>
        </Card>

        {/* 策略卡片列表 */}
        {sortedSkills.length === 0 ? (
          <EmptyState
            icon={<IconGlobe className="size-8" />}
            title="暂无全局记忆策略"
            description="点击右上角「新增」添加第一条策略，或在聊天中由 ACE 自动反思生成。"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sortedSkills.map((skill, idx) => (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.2 }}
              >
                <SkillCard
                  skill={skill}
                  onEdit={() => handleEdit(skill)}
                  onToggleActive={() => void handleToggleActive(skill)}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* 编辑/新增 Dialog */}
        <SkillEditDialog
          open={isAddingNew || editingSkill !== null}
          skill={editingSkill}
          isAddingNew={isAddingNew}
          onSave={handleSaveEdit}
          onClose={() => {
            setEditingSkill(null);
            setIsAddingNew(false);
          }}
          onSoftDelete={editingSkill ? () => void handleSoftDelete(editingSkill) : undefined}
          onHardDelete={editingSkill ? () => void handleHardDelete(editingSkill) : undefined}
        />
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// 策略卡片组件
// ============================================================================

interface SkillCardProps {
  skill: AceSkill;
  onEdit: () => void;
  onToggleActive: () => void;
}

function SkillCard({ skill, onEdit, onToggleActive }: SkillCardProps) {
  const score = skill.helpfulCount - skill.harmfulCount;
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        !skill.active ? "opacity-60" : ""
      }`}
      onClick={onEdit}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {skill.category}
              </Badge>
              {skill.source === "manual" ? (
                <Badge variant="outline" className="text-xs">
                  手动
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-blue-500">
                  自动
                </Badge>
              )}
              {!skill.active && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  已停用
                </Badge>
              )}
            </div>
            <p className="text-sm leading-relaxed">{skill.content}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <IconCheck className="size-3 text-green-500" />
                {skill.helpfulCount}
              </span>
              <span className="flex items-center gap-0.5">
                <IconClose className="size-3 text-red-500" />
                {skill.harmfulCount}
              </span>
              <span className="flex items-center gap-0.5">
                <IconPause className="size-3" />
                {skill.neutralCount}
              </span>
              {score !== 0 && (
                <span
                  className={`font-medium ${score > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  分数 {score > 0 ? "+" : ""}
                  {score}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleActive();
              }}
              title={skill.active ? "停用" : "启用"}
            >
              {skill.active ? (
                <IconPause className="size-3.5" />
              ) : (
                <IconCheck className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <IconEdit className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 策略编辑 Dialog
// ============================================================================

interface SkillEditDialogProps {
  open: boolean;
  skill: AceSkill | null;
  isAddingNew: boolean;
  onSave: (data: { category: string; content: string; active: boolean }) => void;
  onClose: () => void;
  onSoftDelete?: () => void;
  onHardDelete?: () => void;
}

function SkillEditDialog({
  open,
  skill,
  isAddingNew,
  onSave,
  onClose,
  onSoftDelete,
  onHardDelete,
}: SkillEditDialogProps) {
  const [category, setCategory] = React.useState("");
  const [content, setContent] = React.useState("");
  const [active, setActive] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      if (skill) {
        setCategory(skill.category);
        setContent(skill.content);
        setActive(skill.active);
      } else {
        setCategory("general");
        setContent("");
        setActive(true);
      }
    }
  }, [open, skill]);

  const handleSave = () => {
    if (!content.trim()) {
      toast.error("策略内容不能为空");
      return;
    }
    onSave({ category: category.trim() || "general", content: content.trim(), active });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isAddingNew ? "新增策略" : "编辑策略"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">分类</label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如：tone, format, safety, context"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">策略内容</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="可复用的策略描述，将注入到所有对话的系统提示中..."
              rows={5}
              className="resize-y"
            />
          </div>
          {!isAddingNew && skill && (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">启用状态</span>
                  <span className="text-xs text-muted-foreground">
                    停用后不再注入，但保留数据
                  </span>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
              <div className="flex items-center gap-4 rounded-lg border p-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <IconCheck className="size-3 text-green-500" />
                  有帮助 {skill.helpfulCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <IconClose className="size-3 text-red-500" />
                  有害 {skill.harmfulCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <IconPause className="size-3" />
                  中性 {skill.neutralCount}
                </span>
                {skill.source && (
                  <span>来源：{skill.source === "manual" ? "手动" : "自动"}</span>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div className="flex gap-1">
            {!isAddingNew && skill && onSoftDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onSoftDelete}
                disabled={!skill.active}
              >
                <IconPause className="mr-1 size-3.5" />
                停用
              </Button>
            )}
            {!isAddingNew && skill && onHardDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onHardDelete}
              >
                <IconTrash className="mr-1 size-3.5" />
                删除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={handleSave}>
              <IconSave className="mr-1.5 size-3.5" />
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
