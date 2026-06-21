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
  IconEdit,
  IconTrash,
  IconUser,
  IconTag,
  IconImage,
  IconClose,
  IconCharacter,
  IconShare,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import type { Character, WorldInfoEntry, RegexScriptGroup } from "~/types/luzzy";
import { logger } from "~/services/logger";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { SwipeCard } from "~/components/luzzy/swipe-card";
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
import { useConfirm } from "~/components/luzzy/luzzy-confirm";

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

/** 从 PNG 文件解析 SillyTavern 角色卡（支持 tEXt/iTXt/zTXt chunk） */
async function parsePngCharacterCard(file: File): Promise<unknown> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // PNG 签名 8 字节
  if (bytes.length < 8) throw new Error("无效的 PNG 文件");
  // 支持的 keyword 列表
  const SUPPORTED_KEYWORDS = ["chara", "character", "ccv3"];
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
      // tEXt: keyword\0text (Latin-1)
      const chunkData = bytes.subarray(offset, offset + len);
      const nul = chunkData.indexOf(0);
      if (nul >= 0) {
        const keyword = new TextDecoder("latin1").decode(chunkData.subarray(0, nul));
        if (SUPPORTED_KEYWORDS.includes(keyword)) {
          const b64 = new TextDecoder("latin1").decode(chunkData.subarray(nul + 1));
          try {
            const json = atob(b64);
            return JSON.parse(json);
          } catch {
            // base64 解码失败,继续尝试其他 chunk
          }
        }
      }
    } else if (type === "iTXt") {
      // iTXt: keyword\0compressionFlag\0compressionMethod\0languageTag\0translatedKeyword\0text
      const chunkData = bytes.subarray(offset, offset + len);
      const nul1 = chunkData.indexOf(0);
      if (nul1 < 0) { offset += len + 4; continue; }
      const keyword = new TextDecoder().decode(chunkData.subarray(0, nul1));
      if (!SUPPORTED_KEYWORDS.includes(keyword)) { offset += len + 4; continue; }
      const compressionFlag = chunkData[nul1 + 1];
      // 跳过 compressionMethod(1字节)、languageTag(\0)、translatedKeyword(\0)
      let pos = nul1 + 3;
      const nul2 = chunkData.indexOf(0, pos);
      if (nul2 < 0) { offset += len + 4; continue; }
      pos = nul2 + 1;
      const nul3 = chunkData.indexOf(0, pos);
      if (nul3 < 0) { offset += len + 4; continue; }
      const textData = chunkData.subarray(nul3 + 1);
      try {
        let text: string;
        if (compressionFlag === 1) {
          // zlib 压缩,使用 DecompressionStream 解压
          const decompressed = await new Response(
            new Blob([textData]).stream().pipeThrough(new DecompressionStream("deflate")),
          ).text();
          text = decompressed;
        } else {
          text = new TextDecoder().decode(textData);
        }
        const json = atob(text);
        return JSON.parse(json);
      } catch {
        // 解码失败,继续尝试
      }
    } else if (type === "zTXt") {
      // zTXt: keyword\0compressionMethod\0compressedText (zlib)
      const chunkData = bytes.subarray(offset, offset + len);
      const nul = chunkData.indexOf(0);
      if (nul >= 0) {
        const keyword = new TextDecoder("latin1").decode(chunkData.subarray(0, nul));
        if (SUPPORTED_KEYWORDS.includes(keyword)) {
          // 跳过 compressionMethod(1字节)
          const compressedData = chunkData.subarray(nul + 2);
          try {
            const decompressed = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream("deflate")),
            ).text();
            const b64 = decompressed;
            const json = atob(b64);
            return JSON.parse(json);
          } catch {
            // 解压失败,继续
          }
        }
      }
    }
    offset += len + 4; // data + CRC
    if (type === "IEND") break;
  }
  throw new Error("PNG 中未找到角色卡数据（支持的 keyword: chara/character/ccv3）");
}

/**
 * 从 SillyTavern 角色卡数据提取世界书条目
 * 兼容 data.character_book 和顶层 character_book 两种位置
 * v0.3.2: 修正字段映射，兼容角色卡 v2 规范（keys 复数/insertion_order）和 SillyTavern 独立格式（key 单数/order）
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
  // 兼容数组格式（角色卡 v2）和对象格式（SillyTavern entries 以 uid 为 key）
  const rawEntries = book.entries;
  const entryList: Record<string, unknown>[] = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries && typeof rawEntries === "object"
      ? Object.values(rawEntries as Record<string, unknown>)
      : [];
  return entryList.map((entry, idx) => {
    // v0.3.2: 兼容两种字段名
    // 角色卡 v2: keys（复数）/ secondary_keys / insertion_order / position（字符串）
    // SillyTavern 独立: key（单数）/ keysecondary / order / position（数字）
    const rawKeys = entry.keys ?? entry.key;
    const rawSecondary = entry.secondary_keys ?? entry.keysecondary;
    const rawOrder = entry.insertion_order ?? entry.order;
    const rawPosition = entry.position;
    const position =
      typeof rawPosition === "string"
        ? positionStringToNumber(rawPosition)
        : Number(rawPosition ?? 0);
    return {
      id: `${characterUuid}-wi-${idx}-${Date.now()}`,
      name: String(entry.name ?? entry.comment ?? `条目 ${idx + 1}`),
      bookId: characterUuid,
      bookName: String(book.name ?? "角色卡世界书"),
      keys: Array.isArray(rawKeys) ? rawKeys.map(String) : [String(rawKeys ?? "")].filter(Boolean),
      secondaryKeys: Array.isArray(rawSecondary) ? rawSecondary.map(String) : undefined,
      content: String(entry.content ?? ""),
      enabled: true,
      constant: Boolean(entry.constant ?? false),
      order: Number(rawOrder ?? 0),
      position,
      depth: Number(entry.depth ?? 0),
      probability: Number(entry.probability ?? 100),
      insertionOrder: idx,
      useRegex: Boolean(entry.use_regex ?? false),
      selective: Boolean(entry.selective ?? false),
    };
  });
}

/**
 * v0.3.2: 角色卡 v2 字符串位置转数字
 * before_char(0) / after_char(1) / before_an(2) / after_an(3)
 */
function positionStringToNumber(pos: string): number {
  switch (pos) {
    case "before_char":
      return 0;
    case "after_char":
      return 1;
    case "before_an":
      return 2;
    case "after_an":
      return 3;
    default:
      return 0;
  }
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
  const confirm = useConfirm();

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
      const ok = await confirm({
        title: "删除角色卡",
        description: `确定删除角色卡「${c.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteCharacter(c.uuid);
        toast.success("已删除");
      } catch (e) {
        toast.error("删除失败：" + (e as Error).message);
      }
    },
    [deleteCharacter, confirm],
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
                // v0.3.2: 自动关联世界书到角色（bookId 已设为 characterUuid）
                const updatedCharacters = useAppStore.getState().characters.map(c =>
                  c.uuid === latestCharacter.uuid
                    ? { ...c, extensions: { ...c.extensions, worldInfoId: latestCharacter.uuid } }
                    : c
                );
                useAppStore.setState({ characters: updatedCharacters });
                await useAppStore.getState().saveCharacters();
                toast.success(`已自动关联 ${worldInfoEntries.length} 条世界书`);
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
        const latestChar = useAppStore.getState().characters.slice(-1)[0];
        logger.info("user", `导入角色卡: ${latestChar?.name ?? "未知"}`);
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
                <IconClose className="mr-1 size-4" />
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
          <ScrollArea className="w-full flex-1">
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
                    <SwipeCard
                      onSwipeLeft={() => void handleDelete(c)}
                      onSwipeRight={() => handleEdit(c)}
                      leftIcon={<IconTrash className="size-5" />}
                      rightIcon={<IconEdit className="size-5" />}
                    >
                      <Card className="gap-3 rounded-xl p-3 transition-all">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => handleExport(c)}
                            title="分享/导出"
                            {...pressableSubtle}
                          >
                            <IconShare className="size-4" />
                          </Button>
                        </div>
                      </Card>
                    </SwipeCard>
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

              {/* 对话示例（气泡样式，v0.3.1 新增） */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">对话示例</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const examples = [...(editing.dialogueExamples ?? [])];
                      examples.push({ agent: "", user: "" });
                      updateField("dialogueExamples", examples);
                    }}
                  >
                    <IconPlus className="mr-1.5 size-4" />
                    新增对话组
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  左侧为角色（agent）回复，右侧为用户（user）输入。对话示例会注入到提示词中供模型参考
                </p>
                {(editing.dialogueExamples ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                    暂无对话示例。点击「新增对话组」添加示例对话
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(editing.dialogueExamples ?? []).map((ex, idx) => (
                      <div key={idx} className="space-y-1.5 rounded-lg border border-border/20 bg-card/30 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">对话组 {idx + 1}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-destructive"
                            onClick={() => {
                              const examples = [...(editing.dialogueExamples ?? [])];
                              examples.splice(idx, 1);
                              updateField("dialogueExamples", examples);
                            }}
                          >
                            <IconClose className="size-4" />
                          </Button>
                        </div>
                        {/* Agent 气泡（左） */}
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-primary/10 px-3 py-2">
                            <div className="mb-1 text-xs font-medium text-primary">角色</div>
                            <textarea
                              value={ex.agent}
                              onChange={(e) => {
                                const examples = [...(editing.dialogueExamples ?? [])];
                                examples[idx] = { ...examples[idx], agent: e.target.value };
                                updateField("dialogueExamples", examples);
                              }}
                              placeholder="角色的回复示例..."
                              rows={2}
                              className="w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/50"
                            />
                          </div>
                        </div>
                        {/* User 气泡（右） */}
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-muted px-3 py-2">
                            <div className="mb-1 text-right text-xs font-medium text-muted-foreground">用户</div>
                            <textarea
                              value={ex.user}
                              onChange={(e) => {
                                const examples = [...(editing.dialogueExamples ?? [])];
                                examples[idx] = { ...examples[idx], user: e.target.value };
                                updateField("dialogueExamples", examples);
                              }}
                              placeholder="用户的输入示例..."
                              rows={2}
                              className="w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

              {/* 自定义背景（v0.3.1 移至最下方，全宽预览） */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">自定义背景</label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => backgroundInputRef.current?.click()}
                    >
                      <IconImage className="mr-1.5 size-4" />
                      选择背景
                    </Button>
                    {editing.customBackground?.image && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive"
                        onClick={() => updateField("customBackground", undefined)}
                      >
                        移除背景
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  为聊天页设置专属背景图。留空则使用默认背景
                </p>
                {/* 全宽预览区，保持图片比例 */}
                <div className="relative w-full overflow-hidden rounded-lg border bg-muted" style={{ minHeight: "120px" }}>
                  {editing.customBackground?.image ? (
                    <img
                      src={editing.customBackground.image}
                      alt="背景预览"
                      className="w-full object-contain"
                      style={{
                        opacity: (editing.customBackground.opacity ?? 80) / 100,
                        filter: `blur(${editing.customBackground.blur ?? 0}px)`,
                        maxHeight: "240px",
                      }}
                    />
                  ) : (
                    <div className="flex h-[120px] w-full items-center justify-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-1.5">
                        <IconImage className="size-8" />
                        <span className="text-xs">未设置背景</span>
                      </div>
                    </div>
                  )}
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBackgroundUpload}
                />
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

