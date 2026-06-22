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
import { useNavigate } from "react-router";
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
  IconInfo,
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
// v0.4.1: 角色卡解析与提取函数已抽取为公共服务
import {
  parsePngCharacterCard,
  extractWorldInfoFromCard,
  extractRegexScriptsFromCard,
} from "~/services/characterCardImport";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
// v0.3.4: PNG 角色卡导出 - Capacitor Filesystem 保存到相册
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

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
    // v0.3.4: 默认不启用世界书
    extensions: { worldInfoId: null },
  };
}

/**
 * v0.3.4: 检测文本是否包含非中英文 CJK 字符（日文/韩文等）
 * 当返回 true 时，应降级为系统默认字体以保证其他语言字体可见
 */
function detectNonCjkContent(text: string): boolean {
  if (!text) return false;
  // 日文平假名 \u3040-\u309F、片假名 \u30A0-\u30FF
  // 韩文 Hangul \uAC00-\uD7AF、Hangul Jamo \u1100-\u11FF、兼容字母 \u3130-\u318F
  const nonCjkRegex = /[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
  return nonCjkRegex.test(text);
}

/** v0.3.4: 非中英文内容降级字体样式 */
const NON_CJK_FONT_STYLE: React.CSSProperties = {
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", "Noto Sans CJK JP", "Noto Sans CJK KR", sans-serif',
};

// v0.4.1: parsePngCharacterCard / extractWorldInfoFromCard / extractRegexScriptsFromCard
// 已抽取到 ~/services/characterCardImport,此处不再保留本地副本

/** 将文件转为 data URL（用于头像上传） */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * v0.3.4: 头像裁剪为正方形（顶部居中区域）
 *
 * 读取原图后，计算 size = Math.min(width, height)，
 * 从坐标 (x=(width-size)/2, y=0) 裁切一个 1:1 的区域，
 * 确保取到人物的面部或上半身。
 */
function cropAvatarToSquare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const size = Math.min(width, height);
        const x = Math.floor((width - size) / 2); // 水平居中
        const y = 0; // 顶部对齐

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 上下文不可用"));
          return;
        }
        ctx.drawImage(img, x, y, size, size, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** v0.3.4: CRC32 计算（用于 PNG chunk） */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc ^ data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** v0.3.4: 在 PNG IHDR chunk 之后插入 tEXt chunk */
function writePngTextChunk(pngBytes: Uint8Array, keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0; // null separator
  chunkData.set(textBytes, keywordBytes.length + 1);

  const chunkType = new TextEncoder().encode("tEXt");
  const chunkLength = new Uint8Array(4);
  chunkLength[0] = (chunkData.length >>> 24) & 0xff;
  chunkLength[1] = (chunkData.length >>> 16) & 0xff;
  chunkLength[2] = (chunkData.length >>> 8) & 0xff;
  chunkLength[3] = chunkData.length & 0xff;

  // CRC32 覆盖 chunkType + chunkData
  const crcInput = new Uint8Array(chunkType.length + chunkData.length);
  crcInput.set(chunkType, 0);
  crcInput.set(chunkData, chunkType.length);
  const crc = crc32(crcInput);
  const crcBytes = new Uint8Array(4);
  crcBytes[0] = (crc >>> 24) & 0xff;
  crcBytes[1] = (crc >>> 16) & 0xff;
  crcBytes[2] = (crc >>> 8) & 0xff;
  crcBytes[3] = crc & 0xff;

  // IHDR chunk 结束位置：8（签名）+ 4（长度）+ 4（类型）+ 13（数据）+ 4（CRC）= 33
  const ihdrEnd = 33;
  const before = pngBytes.subarray(0, ihdrEnd);
  const after = pngBytes.subarray(ihdrEnd);
  const newPng = new Uint8Array(
    before.length + 4 + 4 + chunkData.length + 4 + after.length,
  );
  let offset = 0;
  newPng.set(before, offset);
  offset += before.length;
  newPng.set(chunkLength, offset);
  offset += 4;
  newPng.set(chunkType, offset);
  offset += 4;
  newPng.set(chunkData, offset);
  offset += chunkData.length;
  newPng.set(crcBytes, offset);
  offset += 4;
  newPng.set(after, offset);
  return newPng;
}

/**
 * v0.3.4: 将角色卡数据写入 PNG 图片（SillyTavern v2 格式）
 *
 * 使用角色头像作为 PNG 图片源，在 IHDR 之后插入 tEXt chunk，
 * keyword 为 "chara"，text 为 base64(JSON.stringify(cardData))。
 * 同步写入绑定的世界书到 character.data.character_book。
 */
async function writePngCharacterCard(
  avatarDataUrl: string,
  character: Character,
  boundWorldInfoEntries: WorldInfoEntry[],
): Promise<Blob> {
  // 1. 将头像 data URL 解码为 Uint8Array
  const base64Data = avatarDataUrl.split(",")[1] ?? "";
  const pngBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // 2. 构建 SillyTavern v2 格式角色卡 JSON
  const cardData = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: character.mesExample,
      alternate_greetings: character.alternateGreetings ?? [],
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      // 同步写入绑定的世界书
      character_book:
        boundWorldInfoEntries.length > 0
          ? {
              name: `${character.name}的世界书`,
              description: "",
              scan_depth: null,
              token_budget: null,
              recursive_scanning: false,
              extensions: {},
              entries: boundWorldInfoEntries.map((entry, idx) => ({
                keys: entry.keys,
                secondary_keys: entry.secondaryKeys ?? [],
                comment: entry.name,
                content: entry.content,
                constant: entry.constant,
                selective: entry.selective,
                insertion_order: entry.insertionOrder ?? idx,
                enabled: entry.enabled,
                position: entry.position,
                type: "constant",
                probability: entry.probability,
                depth: entry.depth,
                extensions: {},
                use_regex: entry.useRegex,
              })),
            }
          : undefined,
    },
  };

  // 3. base64 编码 JSON
  const jsonStr = JSON.stringify(cardData);
  const b64Json = btoa(unescape(encodeURIComponent(jsonStr)));

  // 4. 插入 tEXt chunk
  const newPngBytes = writePngTextChunk(pngBytes, "chara", b64Json);

  // 5. 返回 Blob
  return new Blob([newPngBytes as BlobPart], { type: "image/png" });
}

/** v0.3.4: Blob 转 base64（去除 data URL 前缀，供 Capacitor Filesystem 使用） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Blob 读取失败"));
    reader.readAsDataURL(blob);
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
  const searchCharacters = useAppStore((s) => s.searchCharacters);
  const confirm = useConfirm();
  const navigate = useNavigate();

  // v0.3.4: 单击角色卡跳转聊天所需 store actions
  const setCurrentCharacterUuid = useAppStore((s) => s.setCurrentCharacterUuid);
  const setCurrentCharacter = useAppStore((s) => s.setCurrentCharacter);
  const sessions = useAppStore((s) => s.sessions);
  const createSession = useAppStore((s) => s.createSession);
  const switchSession = useAppStore((s) => s.switchSession);
  const setMessages = useAppStore((s) => s.setMessages);

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

  // v0.3.4: 左滑右滑操作提示（仅首次显示）
  const [showSwipeHint, setShowSwipeHint] = React.useState(false);

  // v0.3.4: 头像预览大图
  const [previewAvatar, setPreviewAvatar] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadCharacters();
    // 加载世界书列表
    void getItem<WorldInfoEntry[]>("worldInfo", "worldInfo").then((data) => {
      setWorldInfoEntries(data ?? []);
    });
    // v0.3.4: 读取左滑右滑提示是否已关闭
    try {
      const dismissed = localStorage.getItem("luzzy_swipe_hint_dismissed");
      if (!dismissed) setShowSwipeHint(true);
    } catch {
      setShowSwipeHint(true);
    }
  }, [loadCharacters]);

  /** v0.3.4: 关闭左滑右滑提示并持久化 */
  const dismissSwipeHint = React.useCallback(() => {
    setShowSwipeHint(false);
    try {
      localStorage.setItem("luzzy_swipe_hint_dismissed", "1");
    } catch {
      // localStorage 不可用时忽略
    }
  }, []);

  /** 所有可用标签（从所有角色卡中收集） */
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    characters.forEach((c) => c.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [characters]);

  /** v0.4.1: 世界书按 bookId 分组,用于角色编辑界面的"世界书启用"选择器 */
  const worldInfoBooks = React.useMemo(() => {
    const map = new Map<string, { bookId: string; bookName: string; count: number }>();
    worldInfoEntries.forEach((e) => {
      const bookId = e.bookId ?? "__default__";
      const bookName = e.bookName ?? "未分组";
      const existing = map.get(bookId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(bookId, { bookId, bookName, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [worldInfoEntries]);

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

  /** v0.3.4: 导出 PNG 角色卡（SillyTavern v2 格式 + 世界书同步写入 + 保存到相册） */
  const handleExport = React.useCallback(
    async (c: Character) => {
      try {
        // 1. 获取角色头像（若为空使用 1x1 透明 PNG 占位图）
        const avatarDataUrl =
          c.avatar ||
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

        // 2. 通过 extensions.worldInfoId 过滤关联的世界书条目
        const worldInfoId = c.extensions?.worldInfoId as
          | string
          | null
          | undefined;
        const boundWorldInfoEntries = worldInfoId
          ? worldInfoEntries.filter((e) => e.bookId === worldInfoId)
          : [];

        // 3. 调用 writePngCharacterCard 生成 PNG Blob
        const pngBlob = await writePngCharacterCard(
          avatarDataUrl,
          c,
          boundWorldInfoEntries,
        );

        // 4. 根据运行环境选择保存方式
        if (Capacitor.isNativePlatform()) {
          // Android: 使用 Capacitor Filesystem 写入相册目录
          const base64Data = await blobToBase64(pngBlob);
          const fileName = `${c.name || "character"}.png`;
          await Filesystem.writeFile({
            path: `Pictures/LUZZY/${fileName}`,
            data: base64Data,
            directory: Directory.External,
            recursive: true,
          });
          toast.success(`已保存到相册 Pictures/LUZZY/${fileName}`);
        } else {
          // Web: 回退到 <a download> 下载
          const url = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${c.name || "character"}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("已下载角色卡 PNG");
        }
      } catch (e) {
        toast.error("导出失败：" + (e as Error).message);
      }
    },
    [worldInfoEntries],
  );

  /** v0.3.4: 单击角色卡跳转聊天页 */
  const handleCardClick = React.useCallback(
    (c: Character) => {
      setCurrentCharacterUuid(c.uuid);
      setCurrentCharacter(c);
      // 查找该角色的最近会话
      const charSessions = sessions
        .filter((s) => s.characterId === c.uuid)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (charSessions.length > 0) {
        // 切换到最近会话
        switchSession(charSessions[0].id);
        setMessages(charSessions[0].messages);
      } else {
        // 无会话则自动新建（v0.3.5: 注入角色卡开场白）
        createSession(c.uuid, c.name, c.firstMessage);
        // 同步消息列表（开场白已由 createSession 预置）
        const newSession = useAppStore.getState().sessions.find(
          (s) => s.characterId === c.uuid && s.messages.length > 0
        );
        setMessages(newSession?.messages ?? []);
      }
      navigate("/");
    },
    [setCurrentCharacterUuid, setCurrentCharacter, sessions, switchSession, setMessages, createSession, navigate],
  );

  /** v0.3.4: 点击头像预览大图 */
  const handleAvatarClick = React.useCallback(
    (e: React.MouseEvent, c: Character) => {
      e.stopPropagation();
      if (c.avatar) {
        setPreviewAvatar(c.avatar);
      }
    },
    [],
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
            // v0.4.1: 传入角色名,使世界书名称默认为 `${characterName}的世界书`
            const worldInfoEntries = extractWorldInfoFromCard(cardData, latestCharacter.uuid, latestCharacter.name);
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

  /** 头像上传（v0.3.4: 裁剪为顶部居中正方形） */
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
        // v0.3.4: 裁剪为顶部居中正方形，避免变形
        const dataUrl = await cropAvatarToSquare(file);
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
            {/* v0.3.4: 左滑右滑操作提示（仅首次显示） */}
            <AnimatePresence>
              {showSwipeHint && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                >
                  <IconInfo className="size-3.5 shrink-0 text-primary" />
                  <span>左滑删除角色卡，右滑编辑角色卡</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-xs"
                    onClick={dismissSwipeHint}
                    {...pressableSubtle}
                  >
                    知道了
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
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
                      <Card
                        className="cursor-pointer gap-3 rounded-xl p-3 transition-all"
                        onClick={() => handleCardClick(c)}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            className="size-12 shrink-0 rounded-lg"
                            onClick={(e) => handleAvatarClick(e, c)}
                          >
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
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleFavorite(c.uuid);
                            }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExport(c);
                            }}
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
        <DialogContent className="max-h-[85vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建角色卡" : "编辑角色卡"}</DialogTitle>
            <DialogDescription>
              填写角色卡信息，支持 SillyTavern 兼容格式
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
            <div className="grid min-w-0 gap-4 py-2">
              {/* 名称 */}
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={editing.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="角色名称"
                  className="max-w-full"
                />
              </div>

              {/* 头像上传（呼出文件管理） */}
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">头像</label>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-16 shrink-0 rounded-lg">
                    <AvatarImage src={editing.avatar} alt={editing.name} />
                    <AvatarFallback className="rounded-lg">
                      <IconUser className="size-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col gap-2">
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
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">背景与性格（提示词）</label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="角色的背景设定、性格特征、行为规范等"
                  rows={6}
                  className="max-w-full"
                  style={detectNonCjkContent(editing.description) ? NON_CJK_FONT_STYLE : undefined}
                />
              </div>

              {/* 对话示例（气泡样式，v0.3.1 新增） */}
              <div className="grid min-w-0 gap-2">
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
                  上方为用户（user）输入，下方为角色（agent）回复。对话示例会注入到提示词中供模型参考
                </p>
                {(editing.dialogueExamples ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                    暂无对话示例。点击「新增对话组」添加示例对话
                  </div>
                ) : (
                  <div className="min-w-0 space-y-3">
                    {(editing.dialogueExamples ?? []).map((ex, idx) => (
                      <div key={idx} className="min-w-0 space-y-1.5 rounded-lg border border-border/20 bg-card/30 p-3">
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
                        {/* v0.3.4: User 气泡在上（符合对话时序：先用户提问） */}
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
                              className="w-full min-w-0 resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/50"
                            />
                          </div>
                        </div>
                        {/* v0.3.4: Agent 气泡在下（角色回复） */}
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
                              className="w-full min-w-0 resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/50"
                              style={detectNonCjkContent(ex.agent) ? NON_CJK_FONT_STYLE : undefined}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 世界书启用选项 */}
              <div className="grid min-w-0 gap-2">
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
                    {/* v0.4.1: 按 bookId 分组列出世界书,而非单个条目 */}
                    {worldInfoBooks.map((b) => (
                      <SelectItem key={b.bookId} value={b.bookId}>
                        {b.bookName} ({b.count} 条)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 初始消息（默认为空） */}
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">初始消息（默认为空）</label>
                <Textarea
                  value={editing.firstMessage}
                  onChange={(e) => updateField("firstMessage", e.target.value)}
                  placeholder="角色的第一条消息（留空则不发送）"
                  rows={3}
                  className="max-w-full"
                  style={detectNonCjkContent(editing.firstMessage) ? NON_CJK_FONT_STYLE : undefined}
                />
              </div>

              {/* 标签 */}
              <div className="grid min-w-0 gap-2">
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
                  className="max-w-full"
                />
              </div>

              {/* 创作者与版本 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">创作者</label>
                  <Input
                    value={editing.creator}
                    onChange={(e) => updateField("creator", e.target.value)}
                    placeholder="创作者名称"
                    className="max-w-full"
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">版本</label>
                  <Input
                    value={editing.characterVersion}
                    onChange={(e) => updateField("characterVersion", e.target.value)}
                    placeholder="1.0"
                    className="max-w-full"
                  />
                </div>
              </div>

              {/* 收藏开关 */}
              <div className="flex min-w-0 items-center justify-between rounded-lg border border-border/20 bg-card/50 p-3">
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
              <div className="grid min-w-0 gap-2">
                <div className="flex min-w-0 items-center justify-between">
                  <label className="text-sm font-medium">自定义背景</label>
                  <div className="flex min-w-0 gap-2">
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
                <div className="relative w-full min-w-0 overflow-hidden rounded-lg border bg-muted" style={{ minHeight: "120px" }}>
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
                  <div className="grid min-w-0 gap-3 pt-1">
                    <div className="grid min-w-0 gap-1.5">
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
            </ScrollArea>
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

      {/* v0.3.4: 全屏头像预览弹窗 */}
      <Dialog open={!!previewAvatar} onOpenChange={(o) => !o && setPreviewAvatar(null)}>
        <DialogContent
          className="min-w-0 max-w-[calc(100%-2rem)] overflow-hidden border-0 bg-black/90 p-0"
          onClick={() => setPreviewAvatar(null)}
        >
          {previewAvatar && (
            <img
              src={previewAvatar}
              alt="头像预览"
              className="max-h-[85vh] max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}

