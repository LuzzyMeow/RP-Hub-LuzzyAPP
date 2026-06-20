/**
 * 角色卡页面
 *
 * v0.2.0 功能：
 * - 图标迁移至 game-icon-pack
 * - 简化创建流程：名称/头像上传/背景与性格/对话示例(键值对)/世界书启用/初始消息/标签
 * - 标签分类查看/隐藏/排列/搜索
 * - 关键词搜索标签/姓名 + 语义搜索提示词/性格/背景（需嵌入模型）
 * - SillyTavern PNG 角色卡导入验证
 */

import * as React from "react";
import type { Route } from "./+types/characters";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconSearch,
  IconStar,
  IconUpload,
  IconDownload,
  IconEdit,
  IconTrash,
  IconUser,
  IconTag,
  IconImage,
  IconClose,
  IconCharacter,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import type { Character, WorldInfoEntry, RegexScriptGroup } from "~/types/luzzy";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import { Slider } from "~/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  springEnter,
  pressableSubtle,
  pressable,
} from "~/lib/motion-presets";
import { getItem, setItem } from "~/services/storage";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [{ title: "角色卡 - LUZZY" }];
}

/** 排列方式 */
type SortMode = "updated" | "name" | "created";

/** 搜索模式 */
type SearchMode = "keyword" | "semantic";

/** 创建空白角色卡 */
function createEmptyCharacter(): Character {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    uuid: crypto.randomUUID(),
    name: "",
    avatar: "",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    mesExample: "",
    alternateGreetings: [],
    tags: [],
    creator: "",
    characterVersion: "1.0",
    createdAt: now,
    updatedAt: now,
    favorite: false,
  };
}

/** 从 PNG 文件解析 SillyTavern 角色卡（tEXt chunk: chara） */
async function parsePngCharacterCard(file: File): Promise<unknown> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // PNG 签名 8 字节
  if (bytes.length < 8) throw new Error("无效的 PNG 文件");
  let offset = 8;
  while (offset < bytes.length) {
    const len =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    offset += 8;
    if (type === "tEXt") {
      const chunkData = bytes.subarray(offset, offset + len);
      // tEXt: keyword\0text
      const nul = chunkData.indexOf(0);
      if (nul >= 0) {
        const keyword = new TextDecoder().decode(chunkData.subarray(0, nul));
        if (keyword === "chara") {
          const b64 = new TextDecoder().decode(chunkData.subarray(nul + 1));
          const json = atob(b64);
          return JSON.parse(json);
        }
      }
    }
    offset += len + 4; // data + CRC
    if (type === "IEND") break;
  }
  throw new Error("PNG 中未找到角色卡数据");
}

/**
 * 从 SillyTavern 角色卡数据提取世界书条目
 * 兼容 data.character_book 和顶层 character_book 两种位置
 */
function extractWorldInfoFromCard(
  cardData: unknown,
  characterUuid: string,
): WorldInfoEntry[] {
  const data =
    cardData && typeof cardData === "object" && (cardData as Record<string, unknown>).data
      ? ((cardData as Record<string, unknown>).data as Record<string, unknown>)
      : (cardData as Record<string, unknown>) ?? {};
  const book = data.character_book as Record<string, unknown> | undefined;
  if (!book || typeof book !== "object") return [];
  const entries = book.entries as Record<string, unknown>[] | undefined;
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, idx) => ({
    id: `${characterUuid}-wi-${idx}-${Date.now()}`,
    name: String(entry.name ?? entry.comment ?? `条目 ${idx + 1}`),
    bookId: characterUuid,
    bookName: String(book.name ?? "角色卡世界书"),
    keys: Array.isArray(entry.key) ? entry.key.map(String) : [String(entry.key ?? "")].filter(Boolean),
    secondaryKeys: Array.isArray(entry.secondary_keys) ? entry.secondary_keys.map(String) : undefined,
    content: String(entry.content ?? ""),
    enabled: true,
    constant: Boolean(entry.constant ?? false),
    order: Number(entry.order ?? 0),
    position: Number(entry.position ?? 0),
    depth: Number(entry.depth ?? 0),
    probability: Number(entry.probability ?? 100),
    insertionOrder: idx,
    useRegex: Boolean(entry.use_regex ?? false),
    selective: Boolean(entry.selective ?? false),
  }));
}

/**
 * 从 SillyTavern 角色卡数据提取正则脚本
 * 兼容 data.extensions.regex_scripts 和顶层 extensions.regex_scripts
 * v0.3.0: 返回 RegexScriptGroup[] 结构（每个脚本作为一个含单条目的组）
 */
function extractRegexScriptsFromCard(
  cardData: unknown,
  characterUuid: string,
): RegexScriptGroup[] {
  const data =
    cardData && typeof cardData === "object" && (cardData as Record<string, unknown>).data
      ? ((cardData as Record<string, unknown>).data as Record<string, unknown>)
      : (cardData as Record<string, unknown>) ?? {};
  const extensions = data.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];
  const scripts = extensions.regex_scripts as Record<string, unknown>[] | undefined;
  if (!Array.isArray(scripts)) return [];

  const now = Date.now();
  return scripts.map((script, idx) => {
    const scriptName = String(script.scriptName ?? `正则 ${idx + 1}`);
    const groupId = `${characterUuid}-regexgrp-${idx}-${now}`;
    // 旧 SillyTavern placement: 1=User, 2=AI, 3=both
    const placement = Number(script.placement ?? 2);
    let scope: RegexScriptGroup["entries"][number]["scope"] = ["character"];
    if (placement === 1) scope = ["user"];
    else if (placement === 2) scope = ["character"];
    else if (placement === 3) scope = ["user", "character"];

    // 旧 markdownOnly: true → 仅显示
    const markdownOnly = Number(script.markdownOnly ?? 0);
    const timing: RegexScriptGroup["entries"][number]["timing"] =
      markdownOnly === 1 ? "display" : "send_display";

    const minDepth = Number(script.minDepth ?? 0);
    return {
      id: groupId,
      name: scriptName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: `${groupId}-entry`,
          name: scriptName,
          findRegex: String(script.findRegex ?? ""),
          replaceString: String(script.replaceString ?? ""),
          scope,
          timing,
          paramReplace: "none" as const,
          depthRange: minDepth > 0 ? { min: minDepth, max: Number.MAX_SAFE_INTEGER } : undefined,
          enabled: true,
        },
      ],
    };
  });
}

/** 将文件转为 data URL（用于头像上传） */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function CharactersPage() {
  const characters = useAppStore((s) => s.characters);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const getFilteredCharacters = useAppStore((s) => s.getFilteredCharacters);
  const loadCharacters = useAppStore((s) => s.loadCharacters);
  const addCharacter = useAppStore((s) => s.addCharacter);
  const updateCharacter = useAppStore((s) => s.updateCharacter);
  const deleteCharacter = useAppStore((s) => s.deleteCharacter);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const importCharacter = useAppStore((s) => s.importCharacter);
  const importCharacterFromCard = useAppStore((s) => s.importCharacterFromCard);
  const exportCharacter = useAppStore((s) => s.exportCharacter);
  const searchCharacters = useAppStore((s) => s.searchCharacters);

  const [editing, setEditing] = React.useState<Character | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement>(null);

  // 标签筛选与排列状态
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [sortMode, setSortMode] = React.useState<SortMode>("updated");
  const [searchMode, setSearchMode] = React.useState<SearchMode>("keyword");

  // 世界书列表（用于编辑时选择）
  const [worldInfoEntries, setWorldInfoEntries] = React.useState<WorldInfoEntry[]>([]);

  React.useEffect(() => {
    void loadCharacters();
    // 加载世界书列表
    void getItem<WorldInfoEntry[]>("worldInfo", "worldInfo").then((data) => {
      setWorldInfoEntries(data ?? []);
    });
  }, [loadCharacters]);

  /** 所有可用标签（从所有角色卡中收集） */
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    characters.forEach((c) => c.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [characters]);

  /** 过滤+排序后的角色卡列表 */
  const filtered = React.useMemo(() => {
    let result = searchQuery ? getFilteredCharacters() : characters;

    // 标签筛选
    if (selectedTags.length > 0) {
      result = result.filter((c) =>
        selectedTags.every((tag) => c.tags.includes(tag)),
      );
    }

    // 排序
    result = [...result].sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "created") return b.createdAt - a.createdAt;
      // updated（默认）
      return b.updatedAt - a.updatedAt;
    });

    // 收藏优先
    return [...result].sort((a, b) => {
      const fa = a.favorite ? 1 : 0;
      const fb = b.favorite ? 1 : 0;
      return fb - fa;
    });
  }, [searchQuery, characters, getFilteredCharacters, selectedTags, sortMode]);

  /** 打开新建弹窗 */
  const handleNew = React.useCallback(() => {
    setEditing(createEmptyCharacter());
    setIsNew(true);
  }, []);

  /** 打开编辑弹窗 */
  const handleEdit = React.useCallback((c: Character) => {
    setEditing(c);
    setIsNew(false);
  }, []);

  /** 保存（新建或编辑） */
  const handleSave = React.useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.warning("请输入角色卡名称");
      return;
    }
    try {
      if (isNew) {
        await addCharacter({ ...editing, updatedAt: Date.now() });
        toast.success("角色卡已创建");
      } else {
        await updateCharacter(editing.uuid, { ...editing, updatedAt: Date.now() });
        toast.success("角色卡已更新");
      }
      setEditing(null);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, [editing, isNew, addCharacter, updateCharacter]);

  /** 删除 */
  const handleDelete = React.useCallback(
    async (c: Character) => {
      if (!confirm(`确定删除角色卡「${c.name}」吗？`)) return;
      try {
        await deleteCharacter(c.uuid);
        toast.success("已删除");
      } catch (e) {
        toast.error("删除失败：" + (e as Error).message);
      }
    },
    [deleteCharacter],
  );

  /** 导出 JSON */
  const handleExport = React.useCallback(
    (c: Character) => {
      try {
        const json = exportCharacter(c.uuid);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${c.name || "character"}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("已导出");
      } catch (e) {
        toast.error("导出失败：" + (e as Error).message);
      }
    },
    [exportCharacter],
  );

  /** 导入文件（PNG 或 JSON） */
  const handleImportFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.name.toLowerCase().endsWith(".png")) {
          const cardData = await parsePngCharacterCard(file);

          // v0.3.0 新增：PNG 图片本身作为角色头像
          // 先导入角色卡获取 uuid，再更新头像
          await importCharacterFromCard(cardData);

          // 获取刚导入的角色（最后一个）
          const latestCharacter = useAppStore.getState().characters.slice(-1)[0];
          if (latestCharacter) {
            // 将 PNG 文件转为 data URL 作为头像
            try {
              const avatarDataUrl = await fileToDataUrl(file);
              useAppStore.getState().updateCharacter(latestCharacter.uuid, {
                avatar: avatarDataUrl,
                // v0.3.0 新增：PNG 默认作为聊天页背景（透明度 80，模糊 0）
                customBackground: {
                  image: avatarDataUrl,
                  opacity: 80,
                  blur: 0,
                },
              });
              await useAppStore.getState().saveCharacters();
            } catch (avatarErr) {
              console.warn("[Characters] 头像设置失败:", avatarErr);
            }

            // 提取并保存世界书条目
            const worldInfoEntries = extractWorldInfoFromCard(cardData, latestCharacter.uuid);
            if (worldInfoEntries.length > 0) {
              try {
                const existing = (await getItem<WorldInfoEntry[]>("worldInfo", "worldInfo")) ?? [];
                await setItem("worldInfo", "worldInfo", [...existing, ...worldInfoEntries]);
              } catch (wiErr) {
                console.warn("[Characters] 世界书导入失败:", wiErr);
              }
            }

            // 提取并保存正则脚本（v0.3.0: 使用 RegexScriptGroup[] 结构）
            const regexGroups = extractRegexScriptsFromCard(cardData, latestCharacter.uuid);
            if (regexGroups.length > 0) {
              try {
                const existing = (await getItem<RegexScriptGroup[]>("regexScripts", "regexGroups")) ?? [];
                await setItem("regexScripts", "regexGroups", [...existing, ...regexGroups]);
              } catch (regexErr) {
                console.warn("[Characters] 正则脚本导入失败:", regexErr);
              }
            }
          }
        } else {
          const text = await file.text();
          await importCharacter(text);
        }
        toast.success("角色卡导入成功");
      } catch (err) {
        toast.error("导入失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [importCharacter, importCharacterFromCard],
  );

  /** 头像上传 */
  const handleAvatarUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editing) return;
      try {
        // 限制 2MB
        if (file.size > 2 * 1024 * 1024) {
          toast.warning("头像文件不能超过 2MB");
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        setEditing((prev) => (prev ? { ...prev, avatar: dataUrl } : prev));
        toast.success("头像已上传");
      } catch (err) {
        toast.error("头像上传失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [editing],
  );

  /** 自定义背景上传（v0.3.0 新增） */
  const handleBackgroundUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editing) return;
      try {
        // 限制 5MB（背景图允许更大）
        if (file.size > 5 * 1024 * 1024) {
          toast.warning("背景图片不能超过 5MB");
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        setEditing((prev) =>
          prev
            ? {
                ...prev,
                customBackground: {
                  image: dataUrl,
                  opacity: prev.customBackground?.opacity ?? 80,
                  blur: prev.customBackground?.blur ?? 0,
                },
              }
            : prev,
        );
        toast.success("背景图片已上传");
      } catch (err) {
        toast.error("背景图片上传失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [editing],
  );

  /** 更新自定义背景字段（opacity/blur） */
  const updateBackgroundField = React.useCallback(
    (key: "opacity" | "blur", value: number) => {
      setEditing((prev) => {
        if (!prev) return prev;
        const current = prev.customBackground ?? {
          image: "",
          opacity: 80,
          blur: 0,
        };
        return {
          ...prev,
          customBackground: { ...current, [key]: value },
        };
      });
    },
    [],
  );

  /** 编辑表单字段更新 */
  const updateField = React.useCallback(
    <K extends keyof Character>(key: K, value: Character[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** 切换标签筛选 */
  const toggleTagFilter = React.useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  /** 清空标签筛选 */
  const clearTagFilter = React.useCallback(() => {
    setSelectedTags([]);
  }, []);

  return (
    <LuzzyLayout
      title="角色卡"
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="导入角色卡"
            {...pressableSubtle}
          >
            <IconUpload className="size-4" />
          </Button>
          <Button size="icon" onClick={handleNew} title="新建角色卡" {...pressable}>
            <IconPlus className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        {/* 搜索框 + 搜索模式切换 */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={
                searchMode === "keyword"
                  ? "搜索标签、姓名..."
                  : "语义搜索提示词、性格、背景（需嵌入模型）"
              }
              value={searchQuery}
              onChange={(e) => searchCharacters(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={searchMode} onValueChange={(v) => setSearchMode(v as SearchMode)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">关键词</SelectItem>
              <SelectItem value="semantic">语义</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 标签筛选栏 + 排列选项 */}
        {allTags.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <IconTag className="size-3.5 text-muted-foreground" />
            {allTags.map((tag) => (
              <motion.button
                key={tag}
                {...springEnter}
                {...pressableSubtle}
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  selectedTags.includes(tag)
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/40 bg-card/50 text-muted-foreground hover:bg-accent/50",
                )}
              >
                {tag}
              </motion.button>
            ))}
            {selectedTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearTagFilter}
              >
                <IconClose className="mr-1 size-3" />
                清除
              </Button>
            )}
            <div className="ml-auto">
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">最近更新</SelectItem>
                  <SelectItem value="name">按名称</SelectItem>
                  <SelectItem value="created">创建时间</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* 列表 */}
        {filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCharacter className="size-6" />
                </EmptyMedia>
                <EmptyTitle>
                  {searchQuery || selectedTags.length > 0
                    ? "未找到匹配的角色卡"
                    : "还没有角色卡"}
                </EmptyTitle>
                <EmptyDescription>
                  {searchQuery || selectedTags.length > 0
                    ? "尝试其他关键词或清除筛选"
                    : "新建一个角色卡或导入现有角色卡"}
                </EmptyDescription>
              </EmptyHeader>
              {!searchQuery && selectedTags.length === 0 && (
                <EmptyContent>
                  <Button onClick={handleNew} {...pressable}>
                    <IconPlus className="mr-2 size-4" />
                    新建角色卡
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((c, i) => (
                  <motion.div
                    key={c.uuid}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                  >
                    <Card className="group gap-3 p-3 transition-all hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <Avatar className="size-12 shrink-0 rounded-lg">
                          <AvatarImage src={c.avatar} alt={c.name} />
                          <AvatarFallback className="rounded-lg">
                            {c.name.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate font-medium">{c.name || "未命名"}</h3>
                            {c.favorite && (
                              <IconStar className="size-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                            )}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {c.description || "暂无描述"}
                          </p>
                        </div>
                      </div>
                      {c.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                          {c.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{c.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => void toggleFavorite(c.uuid)}
                          {...pressableSubtle}
                        >
                          <IconStar
                            className={`size-4 ${
                              c.favorite
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <IconEdit className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(c)}>
                              <IconEdit className="mr-2 size-4" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(c)}>
                              <IconDownload className="mr-2 size-4" />
                              导出 JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => void handleDelete(c)}
                            >
                              <IconTrash className="mr-2 size-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建角色卡" : "编辑角色卡"}</DialogTitle>
            <DialogDescription>
              填写角色卡信息，支持 SillyTavern 兼容格式
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              {/* 名称 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={editing.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="角色名称"
                />
              </div>

              {/* 头像上传（呼出文件管理） */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">头像</label>
                <div className="flex items-center gap-3">
                  <Avatar className="size-16 shrink-0 rounded-lg">
                    <AvatarImage src={editing.avatar} alt={editing.name} />
                    <AvatarFallback className="rounded-lg">
                      <IconUser className="size-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <IconImage className="mr-2 size-4" />
                      选择头像
                    </Button>
                    {editing.avatar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => updateField("avatar", "")}
                      >
                        移除头像
                      </Button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
              </div>

              {/* 自定义背景（v0.3.0 新增） */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">自定义背景</label>
                <p className="text-xs text-muted-foreground">
                  为聊天页设置专属背景图。留空则使用默认背景
                </p>
                <div className="flex items-center gap-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {editing.customBackground?.image ? (
                      <img
                        src={editing.customBackground.image}
                        alt="背景预览"
                        className="size-full object-cover"
                        style={{
                          opacity: (editing.customBackground.opacity ?? 80) / 100,
                          filter: `blur(${editing.customBackground.blur ?? 0}px)`,
                        }}
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <IconImage className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => backgroundInputRef.current?.click()}
                    >
                      <IconImage className="mr-2 size-4" />
                      选择背景
                    </Button>
                    {editing.customBackground?.image && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => updateField("customBackground", undefined)}
                      >
                        移除背景
                      </Button>
                    )}
                  </div>
                  <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBackgroundUpload}
                  />
                </div>
                {editing.customBackground?.image && (
                  <div className="grid gap-3 pt-1">
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">透明度</span>
                        <span className="text-xs font-mono">
                          {editing.customBackground.opacity ?? 80}%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[editing.customBackground.opacity ?? 80]}
                        onValueChange={(vals) =>
                          updateBackgroundField("opacity", vals[0] ?? 80)
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">模糊度</span>
                        <span className="text-xs font-mono">
                          {editing.customBackground.blur ?? 0}px
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={20}
                        step={1}
                        value={[editing.customBackground.blur ?? 0]}
                        onValueChange={(vals) =>
                          updateBackgroundField("blur", vals[0] ?? 0)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 背景与性格（提示词） */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">背景与性格（提示词）</label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="角色的背景设定、性格特征、行为规范等"
                  rows={6}
                />
              </div>

              {/* 对话示例（键值对填写方式） */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">对话示例（键值对）</label>
                <p className="text-xs text-muted-foreground">
                  每行一对，格式：角色:内容 或 用户:内容
                </p>
                <Textarea
                  value={editing.mesExample}
                  onChange={(e) => updateField("mesExample", e.target.value)}
                  placeholder={"{{user}}:你好\n{{char}}:嗯，你好"}
                  rows={4}
                />
              </div>

              {/* 世界书启用选项 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">世界书启用</label>
                <Select
                  value={editing.extensions?.worldInfoId as string ?? "none"}
                  onValueChange={(v) =>
                    updateField("extensions", {
                      ...editing.extensions,
                      worldInfoId: v === "none" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不启用世界书" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不启用世界书</SelectItem>
                    {worldInfoEntries.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name || w.keys.join(", ") || "未命名条目"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 初始消息（默认为空） */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">初始消息（默认为空）</label>
                <Textarea
                  value={editing.firstMessage}
                  onChange={(e) => updateField("firstMessage", e.target.value)}
                  placeholder="角色的第一条消息（留空则不发送）"
                  rows={3}
                />
              </div>

              {/* 标签 */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">标签（逗号分隔）</label>
                <Input
                  value={editing.tags.join(", ")}
                  onChange={(e) =>
                    updateField(
                      "tags",
                      e.target.value
                        .split(/[,，]/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="标签1, 标签2"
                />
              </div>

              {/* 创作者与版本 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">创作者</label>
                  <Input
                    value={editing.creator}
                    onChange={(e) => updateField("creator", e.target.value)}
                    placeholder="创作者名称"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">版本</label>
                  <Input
                    value={editing.characterVersion}
                    onChange={(e) => updateField("characterVersion", e.target.value)}
                    placeholder="1.0"
                  />
                </div>
              </div>

              {/* 收藏开关 */}
              <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 p-3">
                <div className="flex items-center gap-2">
                  <IconStar className="size-4 text-yellow-400" />
                  <span className="text-sm font-medium">收藏</span>
                </div>
                <Switch
                  checked={!!editing.favorite}
                  onCheckedChange={(v) => updateField("favorite", v)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} {...pressable}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}

