/**
 * 正则脚本页面（v0.3.0 重构）
 *
 * 新结构：正则组（RegexScriptGroup）→ 组内条目（RegexScriptEntry）
 * - 一级列表：正则组列表
 * - 二级编辑：组内条目列表 + 条目编辑表单（8 字段）
 * - 正则助手：一键填写思维链/引用/旁白/markdown代码块/标签
 * - 正则测试：实时预览替换结果
 */

import * as React from "react";
import type { Route } from "./+types/regex";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCode,
  IconPlay,
  IconWand,
  IconCopyEdit,
  IconImport,
  IconBookmark,
  IconCheck,
  IconClose,
  IconUserGroup,
} from "~/components/luzzy/luzzy-icons";

import type {
  RegexScriptGroup,
  RegexScriptEntry,
  RegexScope,
  RegexTiming,
  RegexParamReplace,
} from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
// v0.4.1: 导入角色卡解析工具,支持从 PNG 角色卡导入正则脚本
import { parsePngCharacterCard, extractRegexScriptsFromCard } from "~/services/characterCardImport";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import { pressable, pressableSubtle } from "~/lib/motion-presets";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

export function meta(_: Route.MetaArgs) {
  return [{ title: "正则脚本 - LUZZY" }];
}

const STORAGE_STORE = "regexScripts";
const STORAGE_KEY = "regexGroups";

/** 作用范围标签 */
const SCOPE_LABELS: Record<RegexScope, string> = {
  user: "用户消息",
  character: "角色消息",
  thinking: "思维链",
  worldinfo: "世界书",
};

/** 执行时机标签 */
const TIMING_LABELS: Record<RegexTiming, string> = {
  display: "显示时",
  send: "发送时",
  send_display: "发送和显示时",
  receive: "接收时",
  receive_edit: "接收和改写时",
};

/** 参数替换标签 */
const PARAM_REPLACE_LABELS: Record<RegexParamReplace, string> = {
  none: "不替换",
  raw: "原文替换",
  escape: "转义替换",
};

/** 正则助手预设 */
const REGEX_PRESETS: Array<{ label: string; value: string; needsInput?: boolean }> = [
  {
    label: "思维链",
    value: "/<(think|thinking|reasoning)>([\\s\\S]*?)<\\/\\1>/g",
  },
  {
    label: "引用",
    value: '/^"([^\\n]+?)"|^"([^\\n]+?)"/gm',
  },
  {
    label: "旁白",
    value: "/\\*([^\\n]+?)\\*|\\(([^\\n]+?)\\)|（([^\\n]+?)）/g",
  },
  {
    label: "Markdown 代码块",
    value: "/```([^\\r\\n`]*)\\r?\\n([\\s\\S]*?)```/g",
  },
  {
    label: "标签",
    value: "",
    needsInput: true,
  },
];

/** 创建空白正则条目 */
function createEmptyEntry(): RegexScriptEntry {
  return {
    id: crypto.randomUUID(),
    name: "",
    findRegex: "",
    replaceString: "",
    scope: ["character"],
    timing: "display",
    paramReplace: "none",
    enabled: true,
  };
}

/** 创建空白正则组 */
function createEmptyGroup(): RegexScriptGroup {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "",
    entries: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** 测试正则替换 */
function testRegex(
  text: string,
  findRegex: string,
  replaceString: string,
): { result: string; error?: string } {
  if (!findRegex) return { result: text };
  try {
    let regexPattern = findRegex;
    let flags = "g";

    // 解析 /pattern/flags 格式
    if (regexPattern.startsWith("/") && regexPattern.lastIndexOf("/") > 0) {
      const lastSlash = regexPattern.lastIndexOf("/");
      const potentialFlags = regexPattern.substring(lastSlash + 1);
      if (/^[gimsuy]*$/.test(potentialFlags)) {
        flags = potentialFlags;
        regexPattern = regexPattern.substring(1, lastSlash);
      }
    }

    const re = new RegExp(regexPattern, flags);
    let replacement = replaceString || "";
    // 支持 {{match}} 作为 $0 别名
    replacement = replacement.replace(/\{\{match\}\}/g, "$0");

    if (replacement.includes("$0")) {
      return {
        result: text.replace(re, (match, ...groups) => {
          return replacement.replace(/\$0/g, match).replace(/\$(\d+)/g, (_, n) => {
            const idx = parseInt(n, 10);
            return idx <= groups.length ? String(groups[idx - 1] ?? "") : "";
          });
        }),
      };
    }
    return { result: text.replace(re, replacement) };
  } catch (e) {
    return { result: text, error: (e as Error).message };
  }
}

export default function RegexPage() {
  const characters = useAppStore((s) => s.characters);
  const [groups, setGroups] = React.useState<RegexScriptGroup[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<RegexScriptGroup | null>(null);
  const [editingEntry, setEditingEntry] = React.useState<RegexScriptEntry | null>(null);
  const [entryIndex, setEntryIndex] = React.useState<number>(-1);
  const [isNewGroup, setIsNewGroup] = React.useState(false);
  const [isNewEntry, setIsNewEntry] = React.useState(false);
  const [testText, setTestText] = React.useState("");
  const [showRegexHelper, setShowRegexHelper] = React.useState(false);
  const [showCharDialog, setShowCharDialog] = React.useState<RegexScriptGroup | null>(null);
  const confirm = useConfirm();
  // v0.8.7-urgent: E4 useDeferredValue 让 React 在空闲时处理列表更新，避免阻塞输入
  const deferredGroups = React.useDeferredValue(groups);
  // v0.4.1: 从角色卡导入正则脚本
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /** 页面加载时从 storage 读取 */
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getItem<RegexScriptGroup[]>(STORAGE_STORE, STORAGE_KEY);
        if (cancelled) return;
        if (data) setGroups(data);
      } catch (e) {
        if (cancelled) return;
        toast.error("加载失败：" + (e as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 变更时保存到 storage */
  const persist = React.useCallback(async (next: RegexScriptGroup[]) => {
    try {
      await setItem(STORAGE_STORE, STORAGE_KEY, next);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 打开新建组弹窗 */
  const handleNewGroup = React.useCallback(() => {
    setEditingGroup(createEmptyGroup());
    setIsNewGroup(true);
  }, []);

  /** 打开编辑组弹窗 */
  const handleEditGroup = React.useCallback((g: RegexScriptGroup) => {
    setEditingGroup({ ...g, entries: [...g.entries] });
    setIsNewGroup(false);
  }, []);

  /** 保存组（新建或编辑） */
  const handleSaveGroup = React.useCallback(async () => {
    if (!editingGroup) return;
    if (!editingGroup.name.trim()) {
      toast.warning("请输入正则组名称");
      return;
    }
    const now = Date.now();
    const finalGroup = { ...editingGroup, updatedAt: now };
    const next = isNewGroup
      ? [...groups, finalGroup]
      : groups.map((g) => (g.id === finalGroup.id ? finalGroup : g));
    setGroups(next);
    await persist(next);
    toast.success(isNewGroup ? "正则组已创建" : "正则组已更新");
    setEditingGroup(null);
  }, [editingGroup, isNewGroup, groups, persist]);

  /** 删除组 */
  const handleDeleteGroup = React.useCallback(
    async (g: RegexScriptGroup) => {
      const ok = await confirm({
        title: "删除正则组",
        description: `确定删除正则组「${g.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      const next = groups.filter((x) => x.id !== g.id);
      setGroups(next);
      await persist(next);
      toast.success("已删除");
    },
    [groups, persist, confirm],
  );

  /** 切换组启用/禁用 */
  const handleToggleGroup = React.useCallback(
    async (g: RegexScriptGroup, enabled: boolean) => {
      const next = groups.map((x) =>
        x.id === g.id ? { ...x, enabled, updatedAt: Date.now() } : x,
      );
      setGroups(next);
      await persist(next);
    },
    [groups, persist],
  );

  /** 保存角色卡绑定（更新 enabledForCharacters 并持久化） */
  const handleSaveCharacters = React.useCallback(
    async (group: RegexScriptGroup, charUuids: string[]) => {
      const next = groups.map((x) =>
        x.id === group.id ? { ...x, enabledForCharacters: charUuids, updatedAt: Date.now() } : x,
      );
      setGroups(next);
      await persist(next);
      setShowCharDialog(null);
      toast.success("角色卡绑定已更新");
    },
    [groups, persist],
  );

  /** 组内：新建条目 */
  const handleNewEntry = React.useCallback(() => {
    setEditingEntry(createEmptyEntry());
    setEntryIndex(-1);
    setIsNewEntry(true);
    setTestText("");
  }, []);

  /** 组内：编辑条目 */
  const handleEditEntry = React.useCallback((entry: RegexScriptEntry, index: number) => {
    setEditingEntry({ ...entry });
    setEntryIndex(index);
    setIsNewEntry(false);
    setTestText("");
  }, []);

  /** 组内：保存条目 */
  const handleSaveEntry = React.useCallback(() => {
    if (!editingEntry || !editingGroup) return;
    if (!editingEntry.name.trim()) {
      toast.warning("请输入条目名称");
      return;
    }
    const updatedEntries = isNewEntry
      ? [...editingGroup.entries, editingEntry]
      : editingGroup.entries.map((e, i) => (i === entryIndex ? editingEntry : e));
    setEditingGroup({ ...editingGroup, entries: updatedEntries });
    setEditingEntry(null);
  }, [editingEntry, editingGroup, isNewEntry, entryIndex]);

  /** 组内：删除条目 */
  const handleDeleteEntry = React.useCallback(
    async (index: number) => {
      if (!editingGroup) return;
      const ok = await confirm({
        title: "删除正则条目",
        description: `确定删除条目「${editingGroup.entries[index]?.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      setEditingGroup({
        ...editingGroup,
        entries: editingGroup.entries.filter((_, i) => i !== index),
      });
    },
    [editingGroup, confirm],
  );

  /** 组内：切换条目启用 */
  const handleToggleEntry = React.useCallback(
    (index: number, enabled: boolean) => {
      if (!editingGroup) return;
      setEditingGroup({
        ...editingGroup,
        entries: editingGroup.entries.map((e, i) => (i === index ? { ...e, enabled } : e)),
      });
    },
    [editingGroup],
  );

  /** 更新组字段 */
  const updateGroupField = React.useCallback(
    <K extends keyof RegexScriptGroup>(key: K, value: RegexScriptGroup[K]) => {
      setEditingGroup((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** 更新条目字段 */
  const updateEntryField = React.useCallback(
    <K extends keyof RegexScriptEntry>(key: K, value: RegexScriptEntry[K]) => {
      setEditingEntry((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** 切换 scope 多选 */
  const toggleScope = React.useCallback((scope: RegexScope) => {
    setEditingEntry((prev) => {
      if (!prev) return prev;
      const has = prev.scope.includes(scope);
      return {
        ...prev,
        scope: has ? prev.scope.filter((s) => s !== scope) : [...prev.scope, scope],
      };
    });
  }, []);

  /** 正则助手：一键填写 */
  const applyRegexPreset = React.useCallback(
    (preset: { label: string; value: string; needsInput?: boolean }) => {
      if (preset.needsInput) {
        // 标签：需要用户输入标签名
        const tagName = prompt("请输入标签名称（如：cot、think、reasoning）");
        if (!tagName) return;
        const value = `/<${tagName}>([\\s\\S]*?)<\\/${tagName}>/g`;
        updateEntryField("findRegex", value);
        toast.success(`已填写标签正则：${tagName}`);
      } else {
        updateEntryField("findRegex", preset.value);
        toast.success(`已填写${preset.label}正则`);
      }
      setShowRegexHelper(false);
    },
    [updateEntryField],
  );

  /** 实时测试预览结果 */
  const preview = React.useMemo(() => {
    if (!editingEntry) return null;
    return testRegex(testText, editingEntry.findRegex, editingEntry.replaceString);
  }, [editingEntry, testText]);

  /** v0.4.1: 从 PNG 角色卡导入正则脚本 */
  const handleImportFromCard = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const cardData = await parsePngCharacterCard(file);
        // 使用临时 UUID 关联角色卡
        const tempUuid = crypto.randomUUID();
        const imported = extractRegexScriptsFromCard(cardData, tempUuid);
        // v0.7.1: 直接导入时无关联角色，设为全局生效
        imported.forEach((g) => {
          g.enabledForCharacters = [];
        });
        if (imported.length === 0) {
          toast.warning("该角色卡中未检测到正则脚本");
          return;
        }
        const next = [...groups, ...imported];
        setGroups(next);
        await persist(next);
        toast.success(`已导入 ${imported.length} 个正则组`);
      } catch (err) {
        toast.error("导入失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [groups, persist],
  );

  return (
    <LuzzyLayout
      title="正则脚本"
      actions={
        <>
          {/* v0.4.1: 从角色卡导入正则脚本 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="从角色卡导入"
          >
            <IconImport className="size-4" />
          </Button>
          <Button size="icon" onClick={handleNewGroup}>
            <IconPlus className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png"
            className="hidden"
            onChange={handleImportFromCard}
          />
        </>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        {/* 空状态 */}
        {loaded && groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCode className="size-6" />
                </EmptyMedia>
                <EmptyTitle>还没有正则组</EmptyTitle>
                <EmptyDescription>
                  新建一个正则组，对消息文本进行查找替换。每个组可包含多条正则条目
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleNewGroup}>
                  <IconPlus className="mr-2 size-4" />
                  新建正则组
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          /* 正则组列表 */
          <ScrollArea className="flex-1">
            <div className="cv-auto grid grid-cols-1 gap-3 pb-4 lg:grid-cols-2">
              <AnimatePresence>
                {deferredGroups.map((g, i) => {
                  const isGlobal = !g.enabledForCharacters || g.enabledForCharacters.length === 0;
                  return (
                    <motion.div
                      key={g.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                    >
                      <Card className="group gap-3 p-3 transition-shadow hover:shadow-md">
                        <div className="flex items-start gap-3 px-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate font-medium">{g.name || "未命名组"}</h3>
                              {g.enabled ? (
                                <Badge variant="secondary" className="text-xs">
                                  启用
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  禁用
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {g.entries.length} 条
                              </Badge>
                              {isGlobal ? (
                                <Badge variant="outline" className="text-xs">
                                  全局
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  {g.enabledForCharacters!.length} 角色
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {g.entries.length > 0
                                ? g.entries.map((e) => e.name || "未命名").join("、")
                                : "暂无条目"}
                            </p>
                          </div>
                          <Switch
                            checked={g.enabled}
                            onCheckedChange={(v) => void handleToggleGroup(g, v)}
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1 px-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => setShowCharDialog(g)}
                            title="角色卡绑定"
                            {...pressableSubtle}
                          >
                            <IconBookmark className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => handleEditGroup(g)}
                            {...pressableSubtle}
                          >
                            <IconEdit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-destructive"
                            onClick={() => void handleDeleteGroup(g)}
                            {...pressableSubtle}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 正则组编辑弹窗 */}
      <Dialog open={!!editingGroup} onOpenChange={(o) => !o && setEditingGroup(null)}>
        <DialogContent className="max-h-[85vh] min-w-0 overflow-hidden max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isNewGroup ? "新建正则组" : "编辑正则组"}</DialogTitle>
            <DialogDescription>
              管理正则组及其条目。每个条目可配置作用范围、执行时机等参数
            </DialogDescription>
          </DialogHeader>
          {editingGroup && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                {/* 组名称 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">正则组名称</label>
                  <Input
                    value={editingGroup.name}
                    onChange={(e) => updateGroupField("name", e.target.value)}
                    placeholder="例如：格式化输出组"
                  />
                </div>

                {/* 组内条目列表 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">组内条目</label>
                    <Button variant="outline" size="sm" onClick={handleNewEntry}>
                      <IconPlus className="mr-1 size-4" />
                      添加条目
                    </Button>
                  </div>
                  {editingGroup.entries.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      暂无条目，点击「添加条目」创建
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {editingGroup.entries.map((entry, idx) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-2 rounded-lg border p-2"
                        >
                          <Switch
                            checked={entry.enabled}
                            onCheckedChange={(v) => handleToggleEntry(idx, v)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{entry.name || "未命名"}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-xs">
                                {TIMING_LABELS[entry.timing]}
                              </Badge>
                              {entry.scope.map((s) => (
                                <Badge key={s} variant="outline" className="text-xs">
                                  {SCOPE_LABELS[s]}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0"
                            onClick={() => handleEditEntry(entry, idx)}
                          >
                            <IconEdit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-destructive"
                            onClick={() => handleDeleteEntry(idx)}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveGroup()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 条目编辑弹窗 */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNewEntry ? "新建条目" : "编辑条目"}</DialogTitle>
            <DialogDescription>
              配置正则查找替换规则，支持捕获组（$1、$2）和 {"{{match}}"} 变量
            </DialogDescription>
          </DialogHeader>
          {editingEntry && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                {/* 1. 条目名称 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">条目名称</label>
                  <Input
                    value={editingEntry.name}
                    onChange={(e) => updateEntryField("name", e.target.value)}
                    placeholder="例如：移除思维链"
                  />
                </div>

                {/* 2. 正则表达式 + 助手按钮 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">正则表达式 (Find Regex)</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowRegexHelper(true)}
                    >
                      <IconWand className="mr-1 size-4" />
                      正则助手
                    </Button>
                  </div>
                  <Input
                    value={editingEntry.findRegex}
                    onChange={(e) => updateEntryField("findRegex", e.target.value)}
                    placeholder="/pattern/flags 或直接输入正则"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    支持 /pattern/flags 格式或直接输入正则。内联修饰符 (?s)(?i)(?m) 兼容
                  </p>
                </div>

                {/* 3. 替换内容 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">替换内容 (Replace With)</label>
                  <Textarea
                    value={editingEntry.replaceString}
                    onChange={(e) => updateEntryField("replaceString", e.target.value)}
                    placeholder="例如：$1 或 {{match}}（支持捕获组 $1 $2 和 {{match}} 变量）"
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    支持 $1、$2 捕获组引用，{"{{match}}"} 或 $0 表示完整匹配，{"{{user}}"}{" "}
                    替换为用户名
                  </p>
                </div>

                {/* 4. 替换前修剪 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">替换前修剪 (Trim Out)</label>
                  <Textarea
                    value={editingEntry.trimOut ?? ""}
                    onChange={(e) => updateEntryField("trimOut", e.target.value)}
                    placeholder="每行一个正则，替换前从文本中移除匹配内容（可选）"
                    rows={2}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    在执行主替换前，先移除文本中匹配这些正则的内容。每行一个正则
                  </p>
                </div>

                {/* 5. 作用范围（多选） */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">作用范围</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(SCOPE_LABELS) as RegexScope[]).map((s) => {
                      const active = editingEntry.scope.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleScope(s)}
                          className={cn(
                            "rounded-md border px-3 py-1.5 text-xs transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted",
                          )}
                        >
                          {SCOPE_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    选择正则作用于哪些消息类型。可多选
                  </p>
                </div>

                {/* 6. 执行时机 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">执行时机</label>
                  <Select
                    value={editingEntry.timing}
                    onValueChange={(v) => updateEntryField("timing", v as RegexTiming)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIMING_LABELS) as RegexTiming[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIMING_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    显示时：仅影响前端显示；发送时：影响发送给 AI 的内容；接收时：影响 AI 回复处理
                  </p>
                </div>

                {/* 7. 参数替换 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">参数替换</label>
                  <Select
                    value={editingEntry.paramReplace}
                    onValueChange={(v) => updateEntryField("paramReplace", v as RegexParamReplace)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PARAM_REPLACE_LABELS) as RegexParamReplace[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PARAM_REPLACE_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    不替换：正常使用 $1 等捕获组；原文替换：$1 作为字面量输出；转义替换：对匹配内容
                    HTML 转义
                  </p>
                </div>

                {/* 8. 消息深度 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">消息深度范围</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={editingEntry.depthRange?.min ?? ""}
                      onChange={(e) => {
                        const min = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        const max = editingEntry.depthRange?.max;
                        updateEntryField(
                          "depthRange",
                          min !== undefined || max !== undefined
                            ? { min: min ?? 0, max: max ?? Number.MAX_SAFE_INTEGER }
                            : undefined,
                        );
                      }}
                      placeholder="最小"
                      className="w-24"
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="number"
                      min={0}
                      value={
                        editingEntry.depthRange?.max === Number.MAX_SAFE_INTEGER ||
                        editingEntry.depthRange?.max === undefined
                          ? ""
                          : editingEntry.depthRange.max
                      }
                      onChange={(e) => {
                        const max = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        const min = editingEntry.depthRange?.min ?? 0;
                        updateEntryField(
                          "depthRange",
                          max !== undefined ? { min, max } : { min, max: Number.MAX_SAFE_INTEGER },
                        );
                      }}
                      placeholder="最大（留空不限制）"
                      className="w-40"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    仅对指定深度范围内的消息生效。留空则不限制
                  </p>
                </div>

                {/* 正则测试预览 */}
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <IconPlay className="size-4" />
                    正则测试
                  </div>
                  <Input
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="输入测试文本..."
                  />
                  {testText && preview && (
                    <div className="grid gap-1">
                      {preview.error ? (
                        <p className="text-xs text-destructive">正则错误：{preview.error}</p>
                      ) : (
                        <div className="rounded-md border bg-background p-2">
                          <p className="mb-1 text-xs text-muted-foreground">结果</p>
                          <p className="whitespace-pre-wrap break-words font-mono text-xs">
                            {preview.result || "(空)"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSaveEntry()}>保存条目</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 正则助手 Sheet */}
      <Sheet open={showRegexHelper} onOpenChange={setShowRegexHelper}>
        <SheetContent side="bottom" className="max-h-[60vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconWand className="size-4" />
              正则助手
            </SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 p-4">
            <p className="text-sm text-muted-foreground">选择一个预设，一键填入正则表达式</p>
            {REGEX_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyRegexPreset(preset)}
                className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-sm font-medium">{preset.label}</p>
                  {preset.value && (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{preset.value}</p>
                  )}
                  {preset.needsInput && (
                    <p className="mt-0.5 text-xs text-muted-foreground">点击后输入标签名称</p>
                  )}
                </div>
                <IconCopyEdit className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 角色卡绑定弹窗 */}
      <Dialog open={!!showCharDialog} onOpenChange={(o) => !o && setShowCharDialog(null)}>
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconUserGroup className="size-4" />
              角色卡绑定
            </DialogTitle>
            <DialogDescription>选择启用此正则组的角色卡（不选则全局启用）</DialogDescription>
          </DialogHeader>
          {showCharDialog && (
            <RegexCharBindingContent
              group={showCharDialog}
              characters={characters}
              onSave={handleSaveCharacters}
              onCancel={() => setShowCharDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}

// ============================================================================
// 角色卡绑定内容组件（玻璃态容器 + 三态动画）
// ============================================================================

interface RegexCharBindingContentProps {
  group: RegexScriptGroup;
  characters: { uuid: string; name: string }[];
  onSave: (group: RegexScriptGroup, charUuids: string[]) => void;
  onCancel: () => void;
}

const RegexCharBindingContent = React.memo(function RegexCharBindingContent({
  group,
  characters,
  onSave,
  onCancel,
}: RegexCharBindingContentProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(group.enabledForCharacters ?? []),
  );

  const handleToggle = React.useCallback((uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  }, []);

  return (
    <>
      <ScrollArea className="flex-1 min-h-0 pr-2">
        <div className="grid gap-2 py-2">
          {characters.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="py-4 text-center text-xs text-muted-foreground"
            >
              暂无角色卡
            </motion.div>
          ) : (
            <AnimatePresence>
              {characters.map((c, idx) => {
                const checked = selected.has(c.uuid);
                return (
                  <motion.label
                    key={c.uuid}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ delay: idx * 0.02, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    whileHover={{ scale: 1.01, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
                    whileTap={{ scale: 0.99, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/10 bg-muted/50 p-2 transition-colors hover:bg-muted/50"
                  >
                    <motion.div transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}>
                      <Checkbox checked={checked} onCheckedChange={() => handleToggle(c.uuid)} />
                    </motion.div>
                    <span className="text-sm">{c.name}</span>
                  </motion.label>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      <DialogFooter>
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size === 0 ? "全局启用（所有角色）" : `已选 ${selected.size} 个角色`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              <IconClose className="mr-1 size-3.5" />
              取消
            </Button>
            <Button onClick={() => onSave(group, Array.from(selected))} {...pressable}>
              <IconCheck className="mr-1 size-3.5" />
              确定
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
});
