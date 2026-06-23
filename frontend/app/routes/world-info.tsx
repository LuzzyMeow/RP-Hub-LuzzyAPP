/**
 * 世界书页面（v0.2.0 重构）
 *
 * 功能：
 * 1. 世界书（一级）→ 条目（二级）两级架构
 * 2. 每个世界书下可添加多个条目
 * 3. 创建流程：世界书名称 → 条目名称 → 关键词/插入顺序/内容/常驻/选择性/正则
 * 4. 条件字段：
 *    - 常驻启用 → 隐藏关键词栏
 *    - 正则启用 → 隐藏选择性，关键词改为 /regex/flags 格式
 *    - 选择性启用 → 显示次要关键词栏（需同时匹配关键词与次要关键词）
 * 5. SillyTavern 世界书 JSON 导入（含格式校验与友好错误提示）
 * 6. 搜索（按世界书名/条目名/关键词/内容过滤）
 * 7. 启用/禁用、编辑、删除
 */

import * as React from "react";
import type { Route } from "./+types/world-info";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconBook,
  IconSearch,
  IconImport,
  IconExport,
  IconClose,
  IconCheck,
  IconChevronRight,
  IconKey,
  IconTag,
  IconExclamation,
  IconRefresh,
} from "~/components/luzzy/luzzy-icons";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { useBindingDeleteConfirm } from "~/components/luzzy/luzzy-binding-delete-dialog";

import type { WorldInfoEntry, Character, MemorySettings, ApiSettings, ApiProvider } from "~/types/luzzy";
import { useAppStore } from "~/stores";
import { BUILTIN_PROVIDERS } from "~/stores/slices/settings-slice";
import { getItem, setItem } from "~/services/storage";
import { generateWorldInfoEmbeddings } from "~/services/memoryService";
import { logger } from "~/services/logger";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
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
  DialogDescription,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import {
  springEnter,
  pressable,
  pressableSubtle,
  fadeSlide,
} from "~/lib/motion-presets";
import { toast } from "sonner";
// v0.4.5: 方案 D - 使用 NativeBridge 替代 Capacitor Filesystem/Share
import { isNativePlatform, writeFile, shareFile, mkdir } from "~/services/nativeBridge";

export function meta(_: Route.MetaArgs) {
  return [{ title: "世界书 - LUZZY" }];
}

/** position 取值对应的中文标签 */
const POSITION_LABELS: Record<number, string> = {
  0: "角色定义前",
  1: "角色定义后",
  2: "对话前",
  3: "对话后",
};

/** IndexedDB 存储键 */
const STORAGE_KEY = "worldInfo";

/** 创建空白世界书条目 */
function createEmptyEntry(bookId?: string, bookName?: string): WorldInfoEntry {
  return {
    id: crypto.randomUUID(),
    bookId,
    bookName,
    name: "",
    keys: [],
    secondaryKeys: [],
    content: "",
    enabled: true,
    constant: false,
    order: 100,
    position: 0,
    depth: 4,
    probability: 100,
    insertionOrder: undefined,
    useRegex: false,
    selective: false,
  };
}

/** 世界书分组结构 */
interface WorldBookGroup {
  bookId: string;
  bookName: string;
  entries: WorldInfoEntry[];
}

/** 将扁平条目列表按 bookId 分组 */
function groupByBook(entries: WorldInfoEntry[]): WorldBookGroup[] {
  const map = new Map<string, WorldBookGroup>();
  for (const e of entries) {
    const bookId = e.bookId ?? "__default__";
    const bookName = e.bookName ?? "未分组";
    if (!map.has(bookId)) {
      map.set(bookId, { bookId, bookName, entries: [] });
    }
    map.get(bookId)!.entries.push(e);
  }
  return Array.from(map.values());
}

/** 解析关键词字符串（支持中英文逗号） */
function parseKeys(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * 解析 SillyTavern 世界书 JSON
 *
 * SillyTavern 世界书格式：
 * {
 *   "entries": {
 *     "0": { "uid": 0, "key": [...], "keysecondary": [...], "content": "...", "constant": false, "order": 100, "position": 0, "disable": false, "probability": 100, "useProbability": true, "depth": 4, "group": "", "groupOverride": false, "groupWeight": 0, "scanDepth": null, "caseSensitive": null, "matchWholeWords": null, "automationId": "", "role": null, "sticky": null, "cooldown": null, "delay": null, "logicalOperator": "AND", "selectiveLogic": 0, "comment": "", "addMemo": true, "excludeRecursion": false, "displayIndex": 0, "preventRecursion": false, "delayUntilRecursion": false, "probability": 100 }
 *   },
 *   "originalData": { ... }
 * }
 */
function parseSillyTavernWorldBook(json: unknown): {
  name: string;
  entries: WorldInfoEntry[];
} {
  if (typeof json !== "object" || json === null) {
    throw new Error("文件内容不是有效的 JSON 对象");
  }
  const obj = json as Record<string, unknown>;
  const rawEntries = obj.entries;
  if (typeof rawEntries !== "object" || rawEntries === null) {
    throw new Error("缺少 entries 字段或格式不正确");
  }
  const entriesObj = rawEntries as Record<string, Record<string, unknown>>;
  const bookId = crypto.randomUUID();
  const bookName =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : `导入的世界书 ${new Date().toLocaleString("zh-CN")}`;

  const entries: WorldInfoEntry[] = [];
  for (const [key, raw] of Object.entries(entriesObj)) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    // SillyTavern 字段映射
    const rawKeys = r.key;
    const keys: string[] = Array.isArray(rawKeys)
      ? rawKeys.map((k) => String(k ?? "").trim()).filter(Boolean)
      : typeof rawKeys === "string"
        ? parseKeys(rawKeys)
        : [];
    const rawSecondary = r.keysecondary;
    const secondaryKeys: string[] = Array.isArray(rawSecondary)
      ? rawSecondary.map((k) => String(k ?? "").trim()).filter(Boolean)
      : [];
    const content = typeof r.content === "string" ? r.content : "";
    const comment = typeof r.comment === "string" ? r.comment : "";
    const name = comment || `条目 ${key}`;
    const constant = r.constant === true;
    const disable = r.disable === true;
    const order = typeof r.order === "number" ? r.order : 100;
    // SillyTavern position: 0=before_char, 1=after_char, 2=before_an, 3=after_an, 4=at_depth
    const rawPos = typeof r.position === "number" ? r.position : 0;
    const position = rawPos >= 0 && rawPos <= 3 ? rawPos : 0;
    const depth = typeof r.depth === "number" ? r.depth : 4;
    const probability = typeof r.probability === "number" ? r.probability : 100;
    // selectiveLogic: 0=AND, 1=NOT, 2=OR
    const selectiveLogic = typeof r.selectiveLogic === "number" ? r.selectiveLogic : 0;
    const selective = selectiveLogic === 0 && secondaryKeys.length > 0;

    entries.push({
      id: crypto.randomUUID(),
      bookId,
      bookName,
      name,
      keys,
      secondaryKeys,
      content,
      enabled: !disable,
      constant,
      order,
      position,
      depth,
      probability,
      useRegex: false,
      selective,
    });
  }

  if (entries.length === 0) {
    throw new Error("世界书中没有有效条目");
  }
  return { name: bookName, entries };
}

export default function WorldInfoPage() {
  const [entries, setEntries] = React.useState<WorldInfoEntry[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedBooks, setExpandedBooks] = React.useState<Set<string>>(
    new Set(),
  );

  // 编辑状态
  const [editingEntry, setEditingEntry] = React.useState<WorldInfoEntry | null>(
    null,
  );
  const [isNewEntry, setIsNewEntry] = React.useState(false);
  const [editingBook, setEditingBook] = React.useState<{
    bookId: string;
    bookName: string;
  } | null>(null);
  const [isNewBook, setIsNewBook] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const confirmBindingDelete = useBindingDeleteConfirm();
  const deleteCharacter = useAppStore((s) => s.deleteCharacter);

  // v0.5.9: store 访问，用于世界书嵌入向量预生成
  const apiUrl = useAppStore((s) => s.apiUrl);
  const apiKey = useAppStore((s) => s.apiKey);
  const modelName = useAppStore((s) => s.modelName);
  const stream = useAppStore((s) => s.stream);
  const customRequestBody = useAppStore((s) => s.customRequestBody);
  const customApiProviders = useAppStore((s) => s.customApiProviders);
  const apiProviderKeys = useAppStore((s) => s.apiProviderKeys);

  // v0.6.0: 嵌入向量生成中状态（用于显示处理动画）
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = React.useState(false);

  /** v0.5.9: 触发世界书条目嵌入向量预生成（异步，不阻塞 UI） */
  const triggerEmbeddingGeneration = React.useCallback(
    (entriesToProcess: WorldInfoEntry[]) => {
      void (async () => {
        try {
          // 读取记忆设置
          const memorySettings = await getItem<MemorySettings>(
            "memory",
            "memorySettings",
          );
          if (!memorySettings || !memorySettings.embeddingModel?.trim()) {
            logger.debug("world", "嵌入模型未配置，跳过预生成");
            return;
          }
          // 构建 ApiSettings
          const allProviders: ApiProvider[] = [
            ...BUILTIN_PROVIDERS,
            ...customApiProviders,
          ];
          const apiSettings: ApiSettings = {
            apiUrl,
            apiKey,
            modelName,
            stream,
            enableThinking: false,
            customRequestBody,
          };
          const count = entriesToProcess.filter(
            (e) => e.content?.trim() && (!e.embedding || e.embedding.length === 0),
          ).length;
          if (count > 0) {
            toast.info(`已开始为 ${count} 条世界书条目生成嵌入向量...`);
            // v0.6.0: 设置生成中状态，显示处理动画
            setIsGeneratingEmbeddings(true);
          }
          await generateWorldInfoEmbeddings(
            entriesToProcess,
            memorySettings,
            apiSettings,
            allProviders,
            apiProviderKeys,
          );
        } catch (e) {
          logger.warn("world", "世界书嵌入预生成失败: " + (e as Error).message);
        } finally {
          // v0.6.0: 无论成功或失败都关闭处理动画
          setIsGeneratingEmbeddings(false);
        }
      })();
    },
    [apiUrl, apiKey, modelName, stream, customRequestBody, customApiProviders, apiProviderKeys],
  );

  /** 页面加载时从 IndexedDB 读取 */
  React.useEffect(() => {
    void (async () => {
      try {
        const data = await getItem<WorldInfoEntry[]>("worldInfo", STORAGE_KEY);
        if (data) {
          setEntries(data);
          // 默认展开所有世界书
          const groups = groupByBook(data);
          setExpandedBooks(new Set(groups.map((g) => g.bookId)));
        }
      } catch (e) {
        toast.error("加载世界书失败：" + (e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /** 持久化到 IndexedDB */
  const persist = React.useCallback(async (list: WorldInfoEntry[]) => {
    try {
      await setItem("worldInfo", STORAGE_KEY, list);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 同步更新 state 与 storage */
  const updateEntries = React.useCallback(
    (updater: (prev: WorldInfoEntry[]) => WorldInfoEntry[]) => {
      setEntries((prev) => {
        const next = updater(prev);
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 切换世界书展开/折叠 */
  const toggleBookExpand = React.useCallback((bookId: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }, []);

  /** 切换条目启用状态 */
  const handleToggleEnabled = React.useCallback(
    (id: string, enabled: boolean) => {
      updateEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, enabled } : e)),
      );
    },
    [updateEntries],
  );

  /** 新建世界书 */
  const handleNewBook = React.useCallback(() => {
    setEditingBook({ bookId: "", bookName: "" });
    setIsNewBook(true);
  }, []);

  /** 编辑世界书名称 */
  const handleEditBook = React.useCallback(
    (bookId: string, bookName: string) => {
      setEditingBook({ bookId, bookName });
      setIsNewBook(false);
    },
    [],
  );

  /** 保存世界书 */
  const handleSaveBook = React.useCallback(() => {
    if (!editingBook) return;
    if (!editingBook.bookName.trim()) {
      toast.warning("请输入世界书名称");
      return;
    }
    if (isNewBook) {
      const bookId = crypto.randomUUID();
      // 创建一个空白常驻条目作为占位（避免空世界书）
      const placeholder = createEmptyEntry(bookId, editingBook.bookName.trim());
      placeholder.name = "首个条目";
      placeholder.content = "";
      placeholder.constant = true;
      updateEntries((prev) => [...prev, placeholder]);
      setExpandedBooks((prev) => new Set(prev).add(bookId));
      toast.success("世界书已创建");
    } else {
      updateEntries((prev) =>
        prev.map((e) =>
          e.bookId === editingBook.bookId
            ? { ...e, bookName: editingBook.bookName.trim() }
            : e,
        ),
      );
      toast.success("世界书已重命名");
    }
    setEditingBook(null);
  }, [editingBook, isNewBook, updateEntries]);

  /** 删除世界书（含其下所有条目） */
  const handleDeleteBook = React.useCallback(
    async (bookId: string, bookName: string) => {
      // v0.5.6: 检查是否有角色卡绑定此世界书
      let bindingCharacters: Character[] = [];
      try {
        const charactersData = await getItem<Character[]>("characters", "characters");
        bindingCharacters = (charactersData ?? []).filter(
          (c) => (c.extensions?.worldInfoId as string) === bookId,
        );
      } catch {
        // 忽略查询失败，按无绑定处理
      }

      if (bindingCharacters.length > 0) {
        const bindingName = bindingCharacters.map((c) => c.name).join("、");
        const action = await confirmBindingDelete({
          title: "删除世界书",
          description: `确定删除世界书「${bookName}」及其所有条目吗？此操作不可撤销。`,
          bindingName,
          bindingType: "角色卡",
        });

        if (action === "cancel") return;
        updateEntries((prev) => prev.filter((e) => e.bookId !== bookId));

        if (action === "syncDelete") {
          // 同步删除绑定的角色卡
          for (const c of bindingCharacters) {
            await deleteCharacter(c.uuid);
          }
          toast.success(`已删除世界书及 ${bindingCharacters.length} 个绑定角色卡`);
        } else {
          // 仅删除世界书，清理角色卡的 worldInfoId 引用
          try {
            const charactersData = await getItem<Character[]>("characters", "characters");
            const updated = (charactersData ?? []).map((c) =>
              (c.extensions?.worldInfoId as string) === bookId
                ? { ...c, extensions: { ...c.extensions, worldInfoId: null } }
                : c,
            );
            await setItem("characters", "characters", updated);
          } catch (e) {
            console.error("[WorldInfo] 清理角色卡绑定引用失败:", e);
          }
          toast.success("世界书已删除，已清理角色卡绑定");
        }
        return;
      }

      // 无绑定，走原有流程
      const ok = await confirm({
        title: "操作确认",
        description: `确定删除世界书「${bookName}」及其所有条目吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      updateEntries((prev) => prev.filter((e) => e.bookId !== bookId));
      toast.success("世界书已删除");
    },
    [updateEntries, confirm, confirmBindingDelete, deleteCharacter],
  );

  /** 新建条目（指定世界书） */
  const handleNewEntry = React.useCallback(
    (bookId: string, bookName: string) => {
      setEditingEntry(createEmptyEntry(bookId, bookName));
      setIsNewEntry(true);
    },
    [],
  );

  /** 编辑条目 */
  const handleEditEntry = React.useCallback((e: WorldInfoEntry) => {
    setEditingEntry({ ...e });
    setIsNewEntry(false);
  }, []);

  /** 保存条目 */
  const handleSaveEntry = React.useCallback(() => {
    if (!editingEntry) return;
    // 常驻条目不需要关键词；非常驻条目需要关键词或正则
    if (!editingEntry.constant) {
      if (editingEntry.keys.length === 0) {
        toast.warning("请填写关键词（常驻条目除外）");
        return;
      }
    }
    if (!editingEntry.content.trim()) {
      toast.warning("请填写提示词内容");
      return;
    }
    const saved = editingEntry;
    // v0.5.9: 内容变更时清除已有 embedding，触发重新生成
    const entryToSave: WorldInfoEntry = { ...saved, embedding: undefined };
    if (isNewEntry) {
      updateEntries((prev) => [...prev, entryToSave]);
      toast.success("条目已创建");
    } else {
      updateEntries((prev) =>
        prev.map((e) => (e.id === saved.id ? entryToSave : e)),
      );
      toast.success("条目已更新");
    }
    setEditingEntry(null);
    // v0.5.9: 异步预生成嵌入向量
    triggerEmbeddingGeneration([entryToSave]);
  }, [editingEntry, isNewEntry, updateEntries, triggerEmbeddingGeneration]);

  /** 删除条目 */
  const handleDeleteEntry = React.useCallback(
    async (e: WorldInfoEntry) => {
      const ok = await confirm({
        title: "操作确认",
        description: `确定删除条目「${e.name || e.keys.join(", ") || "未命名"}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      updateEntries((prev) => prev.filter((item) => item.id !== e.id));
      toast.success("已删除");
    },
    [updateEntries, confirm],
  );

  /** 编辑表单字段更新 */
  const updateEntryField = React.useCallback(
    <K extends keyof WorldInfoEntry>(key: K, value: WorldInfoEntry[K]) => {
      setEditingEntry((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** 导入 SillyTavern 世界书 */
  const handleImportClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** 处理文件导入 */
  const handleFileImport = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (!file.name.toLowerCase().endsWith(".json")) {
          throw new Error("仅支持 .json 格式的世界书文件");
        }
        const text = await file.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error("JSON 解析失败，文件格式不正确");
        }
        const result = parseSillyTavernWorldBook(json);
        updateEntries((prev) => [...prev, ...result.entries]);
        setExpandedBooks((prev) => new Set(prev).add(result.entries[0].bookId!));
        toast.success(`已导入世界书「${result.name}」（${result.entries.length} 条）`);
        // v0.5.9: 异步预生成嵌入向量
        triggerEmbeddingGeneration(result.entries);
      } catch (err) {
        toast.error("导入失败：" + (err as Error).message);
      } finally {
        // 重置 input 以便重复选择同一文件
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [updateEntries, triggerEmbeddingGeneration],
  );

  /** 导出世界书为 SillyTavern 兼容 JSON */
  const handleExportBook = React.useCallback(
    async (group: WorldBookGroup) => {
      const entriesObj: Record<string, unknown> = {};
      group.entries.forEach((e, i) => {
        entriesObj[String(i)] = {
          uid: i,
          key: e.keys,
          keysecondary: e.secondaryKeys ?? [],
          content: e.content,
          constant: e.constant,
          order: e.order,
          position: e.position,
          disable: !e.enabled,
          probability: e.probability,
          useProbability: true,
          depth: e.depth,
          selectiveLogic: e.selective ? 0 : 2,
          comment: e.name ?? "",
          addMemo: true,
          displayIndex: i,
        };
      });
      const exportData = {
        entries: entriesObj,
        name: group.bookName,
        originalData: null,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const fileName = `${group.bookName || "worldbook"}.json`;

      // v0.4.5: 方案 D - 原生平台使用 NativeBridge 写入临时文件后唤起系统分享面板
      if (isNativePlatform()) {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64Data = btoa(binary);
          // 确保 LUZZY 目录存在
          await mkdir("EXTERNAL", "LUZZY", true).catch(() => {});
          const { uri } = await writeFile("EXTERNAL", `LUZZY/${fileName}`, base64Data, true);
          if (uri) {
            await shareFile(uri, group.bookName || '世界书', '导出世界书');
            toast.success('已唤起分享');
          }
          return;
        } catch (err) {
          console.error("[WorldInfo] 原生导出失败,降级到 Web 下载:", err);
          // fall through 到 Web 下载
        }
      }

      // Web 平台或原生降级:浏览器下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已导出：${fileName}`);
    },
    [],
  );

  /** 按搜索词过滤 */
  const filteredGroups = React.useMemo(() => {
    const groups = groupByBook(entries);
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        entries: g.entries.filter(
          (e) =>
            e.name?.toLowerCase().includes(q) ||
            e.keys.some((k) => k.toLowerCase().includes(q)) ||
            e.content.toLowerCase().includes(q) ||
            e.secondaryKeys?.some((k) => k.toLowerCase().includes(q)),
        ),
      }))
      .filter(
        (g) =>
          g.bookName.toLowerCase().includes(q) || g.entries.length > 0,
      );
  }, [entries, searchQuery]);

  return (
    <LuzzyLayout
      title="世界书"
      actions={
        <>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleImportClick}
            {...pressableSubtle}
          >
            <IconImport className="size-4" />
          </Button>
          <Button size="icon" onClick={handleNewBook} {...pressable}>
            <IconPlus className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleFileImport(e)}
          />
        </>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        {/* 搜索栏 */}
        {entries.length > 0 && (
          <div className="relative shrink-0">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索世界书、条目、关键词或内容..."
              className="pl-9"
            />
            {searchQuery && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                onClick={() => setSearchQuery("")}
              >
                <IconClose className="size-4" />
              </Button>
            )}
          </div>
        )}

        {/* v0.6.0: 嵌入向量生成中处理动画 */}
        <AnimatePresence>
          {isGeneratingEmbeddings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="flex shrink-0 items-center gap-2 overflow-hidden rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="shrink-0"
              >
                <IconRefresh className="size-3.5" />
              </motion.div>
              <span>正在生成向量记忆分片...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {loaded && entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBook className="size-6" />
                </EmptyMedia>
                <EmptyTitle>还没有世界书</EmptyTitle>
                <EmptyDescription>
                  世界书用于在对话中按关键词注入背景设定。可新建或导入
                  SillyTavern 格式世界书。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex gap-2">
                  <Button onClick={handleNewBook} {...pressable}>
                    <IconPlus className="mr-2 size-4" />
                    新建世界书
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleImportClick}
                    {...pressable}
                  >
                    <IconImport className="mr-2 size-4" />
                    导入
                  </Button>
                </div>
              </EmptyContent>
            </Empty>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <IconExclamation className="size-8 opacity-50" />
              <span>未找到匹配的世界书</span>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-3 pb-4">
              <AnimatePresence mode="popLayout">
                {filteredGroups.map((group, gi) => {
                  const expanded = expandedBooks.has(group.bookId);
                  const enabledCount = group.entries.filter(
                    (e) => e.enabled,
                  ).length;
                  return (
                    <motion.div
                      key={group.bookId}
                      layout
                      {...springEnter}
                      custom={gi}
                    >
                      <Card className="overflow-hidden p-0">
                        {/* 世界书标题栏（一级） */}
                        <div className="flex items-center gap-2 border-b border-border/30 p-3">
                          <button
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => toggleBookExpand(group.bookId)}
                          >
                            <motion.div
                              animate={{ rotate: expanded ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="shrink-0"
                            >
                              <IconChevronRight className="size-4 text-muted-foreground" />
                            </motion.div>
                            <IconBook className="size-4 shrink-0 text-primary" />
                            <h3 className="truncate font-medium">
                              {group.bookName}
                            </h3>
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {enabledCount}/{group.entries.length}
                            </Badge>
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleNewEntry(group.bookId, group.bookName)}
                              title="新建条目"
                              {...pressableSubtle}
                            >
                              <IconPlus className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleEditBook(group.bookId, group.bookName)}
                              title="重命名"
                              {...pressableSubtle}
                            >
                              <IconEdit className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleExportBook(group)}
                              title="导出"
                              {...pressableSubtle}
                            >
                              <IconExport className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive"
                              onClick={() =>
                                handleDeleteBook(group.bookId, group.bookName)
                              }
                              title="删除世界书"
                              {...pressableSubtle}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {/* 条目列表（二级） */}
                        <AnimatePresence initial={false}>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              {group.entries.length === 0 ? (
                                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                  此世界书暂无条目
                                </div>
                              ) : (
                                /* v0.4.1: 条目较多时支持滚动,避免撑开页面导致无法滑动 */
                                <div className="max-h-[50vh] divide-y divide-border/20 overflow-y-auto">
                                  <AnimatePresence mode="popLayout">
                                    {group.entries.map((e, ei) => (
                                      <motion.div
                                        key={e.id}
                                        layout
                                        {...fadeSlide}
                                        custom={ei}
                                        className={`flex items-start gap-3 p-3 transition-colors hover:bg-muted/30 ${
                                          !e.enabled ? "opacity-60" : ""
                                        }`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <h4 className="truncate text-sm font-medium">
                                              {e.name ||
                                                e.keys.join(", ") ||
                                                "未命名条目"}
                                            </h4>
                                            {e.constant && (
                                              <Badge
                                                variant="secondary"
                                                className="shrink-0 text-xs"
                                              >
                                                常驻
                                              </Badge>
                                            )}
                                            {e.useRegex && (
                                              <Badge
                                                variant="outline"
                                                className="shrink-0 text-xs"
                                              >
                                                正则
                                              </Badge>
                                            )}
                                            {e.selective && (
                                              <Badge
                                                variant="outline"
                                                className="shrink-0 text-xs"
                                              >
                                                选择性
                                              </Badge>
                                            )}
                                          </div>
                                          {!e.constant && e.keys.length > 0 && (
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                              <IconKey className="size-3 text-muted-foreground" />
                                              {e.keys.slice(0, 4).map((k, i) => (
                                                <Badge
                                                  key={i}
                                                  variant="outline"
                                                  className="text-xs font-normal"
                                                >
                                                  {k}
                                                </Badge>
                                              ))}
                                              {e.keys.length > 4 && (
                                                <span className="text-xs text-muted-foreground">
                                                  +{e.keys.length - 4}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          {e.selective &&
                                            e.secondaryKeys &&
                                            e.secondaryKeys.length > 0 && (
                                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <IconTag className="size-3 text-muted-foreground" />
                                                {e.secondaryKeys
                                                  .slice(0, 3)
                                                  .map((k, i) => (
                                                    <Badge
                                                      key={i}
                                                      variant="outline"
                                                      className="text-xs font-normal"
                                                    >
                                                      {k}
                                                    </Badge>
                                                  ))}
                                                {e.secondaryKeys.length > 3 && (
                                                  <span className="text-xs text-muted-foreground">
                                                    +{e.secondaryKeys.length - 3}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                            {e.content || "暂无内容"}
                                          </p>
                                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <Badge
                                              variant="outline"
                                              className="text-xs font-normal"
                                            >
                                              {POSITION_LABELS[e.position] ?? "未知"}
                                            </Badge>
                                            <Badge
                                              variant="outline"
                                              className="text-xs font-normal"
                                            >
                                              深度 {e.depth}
                                            </Badge>
                                            <Badge
                                              variant="outline"
                                              className="text-xs font-normal"
                                            >
                                              顺序 {e.order}
                                            </Badge>
                                            {e.probability < 100 && (
                                              <Badge
                                                variant="outline"
                                                className="text-xs font-normal"
                                              >
                                                {e.probability}%
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-2">
                                          <Switch
                                            checked={e.enabled}
                                            onCheckedChange={(v) =>
                                              handleToggleEnabled(e.id, v)
                                            }
                                          />
                                          <div className="flex gap-0.5">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="size-7"
                                              onClick={() => handleEditEntry(e)}
                                              {...pressableSubtle}
                                            >
                                              <IconEdit className="size-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="size-7 text-destructive"
                                              onClick={() => handleDeleteEntry(e)}
                                              {...pressableSubtle}
                                            >
                                              <IconTrash className="size-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </motion.div>
                                    ))}
                                  </AnimatePresence>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 世界书新建/重命名弹窗 */}
      <Dialog
        open={!!editingBook}
        onOpenChange={(o) => !o && setEditingBook(null)}
      >
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle>{isNewBook ? "新建世界书" : "重命名世界书"}</DialogTitle>
            <DialogDescription>
              {isNewBook
                ? "创建一个新的世界书分组，可在其中添加多个条目"
                : "修改世界书名称"}
            </DialogDescription>
          </DialogHeader>
          {editingBook && (
            <div className="grid gap-2 py-2">
              <label className="text-sm font-medium">世界书名称</label>
              <Input
                value={editingBook.bookName}
                onChange={(e) =>
                  setEditingBook({
                    ...editingBook,
                    bookName: e.target.value,
                  })
                }
                placeholder="例如：魔法世界设定"
                autoFocus
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBook(null)}>
              取消
            </Button>
            <Button onClick={handleSaveBook} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 条目新建/编辑弹窗 */}
      <Dialog
        open={!!editingEntry}
        onOpenChange={(o) => !o && setEditingEntry(null)}
      >
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isNewEntry ? "新建条目" : "编辑条目"}
              {editingEntry?.bookName && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {editingEntry.bookName}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              设置关键词、内容与注入位置，对话中将按规则触发
            </DialogDescription>
          </DialogHeader>
          {editingEntry && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                {/* 条目名称 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">条目名称</label>
                  <Input
                    value={editingEntry.name ?? ""}
                    onChange={(e) =>
                      updateEntryField("name", e.target.value)
                    }
                    placeholder="例如：魔法学院背景"
                  />
                </div>

                {/* 常驻开关（启用后隐藏关键词） */}
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">常驻</div>
                    <div className="text-xs text-muted-foreground">
                      无需关键词即可注入
                    </div>
                  </div>
                  <Switch
                    checked={editingEntry.constant}
                    onCheckedChange={(v) => updateEntryField("constant", v)}
                  />
                </div>

                {/* 关键词（非常驻时显示） */}
                {!editingEntry.constant && (
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      {editingEntry.useRegex
                        ? "正则表达式（每行一个，格式 /pattern/flags）"
                        : "关键词（中英文逗号分隔）"}
                    </label>
                    {editingEntry.useRegex ? (
                      <Textarea
                        value={editingEntry.keys.join("\n")}
                        onChange={(e) =>
                          updateEntryField(
                            "keys",
                            e.target.value
                              .split("\n")
                              .map((k) => k.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder={"/魔法|法术/i\n/剑士/i"}
                        rows={3}
                        className="font-mono text-xs"
                      />
                    ) : (
                      <Input
                        value={editingEntry.keys.join(", ")}
                        onChange={(e) =>
                          updateEntryField("keys", parseKeys(e.target.value))
                        }
                        placeholder="关键词1, 关键词2，关键词3"
                      />
                    )}
                  </div>
                )}

                {/* 正则表达式开关 */}
                {!editingEntry.constant && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">使用正则表达式</div>
                      <div className="text-xs text-muted-foreground">
                        启用后关键词改为正则匹配（格式 /regex/flags）
                      </div>
                    </div>
                    <Switch
                      checked={!!editingEntry.useRegex}
                      onCheckedChange={(v) => {
                        updateEntryField("useRegex", v);
                        // 启用正则时关闭选择性
                        if (v) updateEntryField("selective", false);
                      }}
                    />
                  </div>
                )}

                {/* 选择性开关（正则启用时隐藏） */}
                {!editingEntry.constant && !editingEntry.useRegex && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">选择性模式</div>
                      <div className="text-xs text-muted-foreground">
                        需同时匹配关键词与次要关键词
                      </div>
                    </div>
                    <Switch
                      checked={!!editingEntry.selective}
                      onCheckedChange={(v) =>
                        updateEntryField("selective", v)
                      }
                    />
                  </div>
                )}

                {/* 次要关键词（选择性启用时显示） */}
                {!editingEntry.constant &&
                  !editingEntry.useRegex &&
                  editingEntry.selective && (
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">
                        次要关键词（中英文逗号分隔）
                      </label>
                      <Input
                        value={(editingEntry.secondaryKeys ?? []).join(", ")}
                        onChange={(e) =>
                          updateEntryField(
                            "secondaryKeys",
                            parseKeys(e.target.value),
                          )
                        }
                        placeholder="次要关键词1, 次要关键词2"
                      />
                    </div>
                  )}

                {/* 内容 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">提示词内容</label>
                  <Textarea
                    value={editingEntry.content}
                    onChange={(e) =>
                      updateEntryField("content", e.target.value)
                    }
                    placeholder="命中关键词时注入的背景设定"
                    rows={5}
                  />
                </div>

                {/* 注入位置与深度 */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">注入位置</label>
                    <Select
                      value={String(editingEntry.position)}
                      onValueChange={(v) =>
                        updateEntryField("position", Number(v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">角色定义前</SelectItem>
                        <SelectItem value="1">角色定义后</SelectItem>
                        <SelectItem value="2">对话前</SelectItem>
                        <SelectItem value="3">对话后</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">深度</label>
                    <Input
                      type="number"
                      min={0}
                      value={editingEntry.depth}
                      onChange={(e) =>
                        updateEntryField("depth", Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                {/* 顺序与插入顺序 */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">顺序</label>
                    <Input
                      type="number"
                      value={editingEntry.order}
                      onChange={(e) =>
                        updateEntryField("order", Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">
                      插入顺序（越高影响力越大）
                    </label>
                    <Input
                      type="number"
                      value={editingEntry.insertionOrder ?? ""}
                      onChange={(e) =>
                        updateEntryField(
                          "insertionOrder",
                          e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        )
                      }
                      placeholder="留空使用默认"
                    />
                  </div>
                </div>

                {/* 触发概率 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">触发概率</label>
                    <span className="text-sm text-muted-foreground">
                      {editingEntry.probability}%
                    </span>
                  </div>
                  <Slider
                    value={[editingEntry.probability]}
                    onValueChange={([v]) => updateEntryField("probability", v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              取消
            </Button>
            <Button onClick={handleSaveEntry} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}
