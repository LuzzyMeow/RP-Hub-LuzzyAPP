/**
 * 预设页面（v0.2.0 重构）
 *
 * 功能：
 * 1. 内置预设（可编辑，NSFW 内容完整保留）
 * 2. 自定义预设 CRUD
 * 3. 每个预设支持启用/禁用开关
 * 4. 角色卡绑定（空数组=全局启用）
 * 5. Markdown 语法渲染预览（原始/渲染切换）
 */

import * as React from "react";
import type { Route } from "./+types/preset";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconFile,
  IconSearch,
  IconClose,
  IconCheck,
  IconBookmark,
} from "~/components/luzzy/luzzy-icons";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";

import type { Preset } from "~/types/luzzy";
import {
  BUILTIN_PRESET_DEFAULTS,
  BUILTIN_PRESET_NAME_SET,
  BUILTIN_PRESET_VERSION,
  LUZZY_PRESET_NAME,
} from "~/services/presetContent";
import { getItem, setItem } from "~/services/storage";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { Checkbox } from "~/components/ui/checkbox";
import { ScrollArea } from "~/components/ui/scroll-area";
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
import Markdown from "~/components/markdown/markdown";
import { springEnter, pressable, pressableSubtle, fadeSlide } from "~/lib/motion-presets";
import { toast } from "sonner";

export function meta(_: Route.MetaArgs) {
  return [{ title: "预设 - LUZZY" }];
}

/** 内置预设项 */
interface BuiltinPreset {
  name: string;
  role: "system";
  content: string;
  enabled?: boolean;
}

type ViewMode = "raw" | "rendered";

export default function PresetPage() {
  const characters = useAppStore((s) => s.characters);

  const [customPresets, setCustomPresets] = React.useState<Preset[]>([]);
  const [builtinOverrides, setBuiltinOverrides] = React.useState<Record<string, Preset>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState<Preset | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [viewing, setViewing] = React.useState<Preset | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("rendered");
  const [showCharDialog, setShowCharDialog] = React.useState<Preset | null>(null);
  const confirm = useConfirm();
  // v0.8.7-urgent: E4 useDeferredValue 让 React 在空闲时处理列表更新，避免阻塞输入
  const deferredCustomPresets = React.useDeferredValue(customPresets);

  /** 加载自定义预设与内置预设覆盖 */
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // v0.8.5: 内置预设版本检查 — 版本不匹配时强制清除用户覆盖
        const storedVersion = await getItem<number>("presets", "builtinVersion");
        if (cancelled) return;
        if (storedVersion !== BUILTIN_PRESET_VERSION) {
          await setItem("presets", "builtinOverrides", {});
          await setItem("presets", "builtinVersion", BUILTIN_PRESET_VERSION);
          if (cancelled) return;
          setBuiltinOverrides({});
        }

        const [customData, overrideData] = await Promise.all([
          getItem<Preset[]>("presets", "custom"),
          getItem<Record<string, Preset>>("presets", "builtinOverrides"),
        ]);
        if (cancelled) return;
        setCustomPresets(customData ?? []);
        setBuiltinOverrides(overrideData ?? {});
      } catch (e) {
        if (cancelled) return;
        toast.error("加载预设失败：" + (e as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 持久化自定义预设 */
  const persistCustom = React.useCallback(async (next: Preset[]) => {
    setCustomPresets(next);
    try {
      await setItem("presets", "custom", next);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 持久化内置预设覆盖 */
  const persistOverrides = React.useCallback(async (next: Record<string, Preset>) => {
    setBuiltinOverrides(next);
    try {
      await setItem("presets", "builtinOverrides", next);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 获取内置预设（合并用户覆盖） */
  const getBuiltinPreset = React.useCallback(
    (builtin: BuiltinPreset): Preset => {
      // v0.8.5: Luzzy 预设强制启用、全局、只读，不接受用户覆盖
      if (builtin.name === LUZZY_PRESET_NAME) {
        return {
          id: `builtin_${builtin.name}`,
          name: builtin.name,
          content: builtin.content,
          isBuiltin: true,
          isReadonly: true,
          enabled: true,
          enabledForCharacters: [],
          createdAt: 0,
          updatedAt: 0,
        };
      }
      const override = builtinOverrides[builtin.name];
      if (override) {
        return {
          ...override,
          name: builtin.name,
          isBuiltin: true,
        };
      }
      return {
        id: `builtin_${builtin.name}`,
        name: builtin.name,
        content: builtin.content,
        isBuiltin: true,
        isReadonly: false,
        enabled: builtin.enabled ?? true,
        enabledForCharacters: [],
        createdAt: 0,
        updatedAt: 0,
      };
    },
    [builtinOverrides],
  );

  /** 新建 */
  const handleNew = React.useCallback(() => {
    const now = Date.now();
    setEditing({
      id: crypto.randomUUID(),
      name: "",
      content: "",
      isBuiltin: false,
      enabled: true,
      enabledForCharacters: [],
      createdAt: now,
      updatedAt: now,
    });
    setIsNew(true);
  }, []);

  /** 编辑预设（内置或自定义） */
  const handleEdit = React.useCallback((p: Preset) => {
    setEditing({ ...p });
    setIsNew(false);
  }, []);

  /** 查看预设内容 */
  const handleView = React.useCallback((p: Preset) => {
    setViewing(p);
    setViewMode("rendered");
  }, []);

  /** 保存 */
  const handleSave = React.useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.warning("请输入预设名称");
      return;
    }

    // 内置预设保存到覆盖表
    if (editing.isBuiltin) {
      if (!BUILTIN_PRESET_NAME_SET.has(editing.name)) {
        toast.warning("内置预设名称不匹配");
        return;
      }
      const next = {
        ...builtinOverrides,
        [editing.name]: {
          ...editing,
          updatedAt: Date.now(),
        },
      };
      await persistOverrides(next);
      setEditing(null);
      toast.success("内置预设已更新");
      return;
    }

    // 自定义预设
    if (BUILTIN_PRESET_NAME_SET.has(editing.name)) {
      toast.warning("不能与内置预设同名");
      return;
    }
    const exists = customPresets.some((p) => p.id === editing.id);
    const next = exists
      ? customPresets.map((p) => (p.id === editing.id ? { ...editing, updatedAt: Date.now() } : p))
      : [...customPresets, editing];
    await persistCustom(next);
    setEditing(null);
    toast.success(isNew ? "预设已创建" : "预设已更新");
  }, [editing, customPresets, isNew, persistCustom, builtinOverrides, persistOverrides]);

  /** 切换启用状态 */
  const handleToggleEnabled = React.useCallback(
    async (p: Preset) => {
      if (p.isBuiltin) {
        const override = builtinOverrides[p.name];
        const updated: Preset = {
          ...(override ?? {
            id: p.id,
            name: p.name,
            content: p.content,
            isBuiltin: true,
            isReadonly: false,
            enabled: true,
            enabledForCharacters: [],
            createdAt: 0,
            updatedAt: 0,
          }),
          enabled: !p.enabled,
          updatedAt: Date.now(),
        };
        await persistOverrides({
          ...builtinOverrides,
          [p.name]: updated,
        });
      } else {
        const next = customPresets.map((x) =>
          x.id === p.id ? { ...x, enabled: !x.enabled, updatedAt: Date.now() } : x,
        );
        await persistCustom(next);
      }
    },
    [customPresets, persistCustom, builtinOverrides, persistOverrides],
  );

  /** 删除（仅自定义预设） */
  const handleDelete = React.useCallback(
    async (p: Preset) => {
      if (p.isBuiltin) {
        // 内置预设：重置为默认（删除覆盖）
        const ok = await confirm({
          title: "操作确认",
          description: `确定重置内置预设「${p.name}」为默认内容吗？此操作不可撤销。`,
          destructive: true,
        });
        if (!ok) return;
        const next = { ...builtinOverrides };
        delete next[p.name];
        await persistOverrides(next);
        toast.success("已重置为默认");
        return;
      }
      const ok = await confirm({
        title: "操作确认",
        description: `确定删除预设「${p.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      await persistCustom(customPresets.filter((x) => x.id !== p.id));
      toast.success("已删除");
    },
    [customPresets, persistCustom, builtinOverrides, persistOverrides, confirm],
  );

  /** 保存角色卡绑定 */
  const handleSaveCharacters = React.useCallback(
    async (preset: Preset, charUuids: string[]) => {
      const updated: Preset = {
        ...preset,
        enabledForCharacters: charUuids,
        updatedAt: Date.now(),
      };
      if (preset.isBuiltin) {
        await persistOverrides({
          ...builtinOverrides,
          [preset.name]: {
            ...updated,
            isBuiltin: true,
          },
        });
      } else {
        await persistCustom(customPresets.map((x) => (x.id === preset.id ? updated : x)));
      }
      setShowCharDialog(null);
      toast.success("角色卡绑定已更新");
    },
    [customPresets, persistCustom, builtinOverrides, persistOverrides],
  );

  /** 渲染预设卡片 */
  const renderPresetCard = React.useCallback(
    (preset: Preset, index: number) => {
      const isGlobal = !preset.enabledForCharacters || preset.enabledForCharacters.length === 0;
      return (
        <motion.div key={preset.id} {...springEnter} custom={index}>
          <Card className="gap-2 p-4 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-medium">{preset.name}</h3>
                  {preset.isBuiltin && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      内置
                    </Badge>
                  )}
                  {!preset.enabled && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      已禁用
                    </Badge>
                  )}
                  {isGlobal ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      全局
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {preset.enabledForCharacters!.length} 角色
                    </Badge>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {preset.content.slice(0, 100) || "（空预设）"}
                  {preset.content.length > 100 ? "..." : ""}
                </p>
              </div>
              {/* v0.8.5: Luzzy 预设强制启用，隐藏开关 */}
              {preset.name !== LUZZY_PRESET_NAME && (
                <Switch
                  checked={preset.enabled}
                  onCheckedChange={() => void handleToggleEnabled(preset)}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* v0.8.5: Luzzy 预设不可交互，隐藏预览/编辑/绑定/删除按钮 */}
              {preset.name !== LUZZY_PRESET_NAME && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => handleView(preset)}
                    {...pressableSubtle}
                  >
                    <IconSearch className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => handleEdit(preset)}
                    {...pressableSubtle}
                  >
                    <IconEdit className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => setShowCharDialog(preset)}
                    {...pressableSubtle}
                  >
                    <IconBookmark className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0 text-destructive"
                    onClick={() => void handleDelete(preset)}
                    {...pressableSubtle}
                  >
                    {preset.isBuiltin ? (
                      <IconClose className="size-4" />
                    ) : (
                      <IconTrash className="size-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </motion.div>
      );
    },
    [handleToggleEnabled, handleView, handleEdit, handleDelete],
  );

  return (
    <LuzzyLayout
      title="预设"
      actions={
        <Button size="icon" onClick={handleNew} {...pressable}>
          <IconPlus className="size-4" />
        </Button>
      }
    >
      <div className="h-full p-4">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-3xl space-y-6 pb-4">
              {/* 内置预设 */}
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <IconFile className="size-3.5" />
                  内置预设
                </h2>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {BUILTIN_PRESET_DEFAULTS.map((p, i) =>
                      renderPresetCard(getBuiltinPreset(p), i),
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* 自定义预设 */}
              <section>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">自定义预设</h2>
                {customPresets.length === 0 ? (
                  <Card className="p-4">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <IconFile className="size-6" />
                        </EmptyMedia>
                        <EmptyTitle>还没有自定义预设</EmptyTitle>
                        <EmptyDescription>新建一个预设来自定义系统提示</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={handleNew} {...pressable}>
                          <IconPlus className="mr-2 size-4" />
                          新建预设
                        </Button>
                      </EmptyContent>
                    </Empty>
                  </Card>
                ) : (
                  <div className="cv-auto grid gap-3">
                    <AnimatePresence>
                      {deferredCustomPresets
                        .filter((p) => p.name !== LUZZY_PRESET_NAME)
                        .map((p, i) => renderPresetCard(p, i))}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.isBuiltin
                ? `编辑内置预设：${editing.name}`
                : isNew
                  ? "新建预设"
                  : "编辑预设"}
            </DialogTitle>
            <DialogDescription>自定义系统提示预设</DialogDescription>
          </DialogHeader>
          {editing && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                {!editing.isBuiltin && (
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">名称</label>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="预设名称"
                      className="max-w-full"
                    />
                  </div>
                )}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">内容</label>
                  <Textarea
                    value={editing.content}
                    onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                    placeholder="预设内容（系统提示）"
                    rows={16}
                    className="max-w-full font-mono text-xs"
                  />
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

      {/* 查看弹窗（Markdown 渲染 / 原始切换） */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing?.name}
              {viewing?.isBuiltin && (
                <Badge variant="secondary" className="text-xs">
                  内置
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>预设内容预览（支持 Markdown 渲染）</DialogDescription>
          </DialogHeader>
          {viewing && (
            <>
              <div className="flex shrink-0 items-center gap-1 border-b border-border/50 pb-2">
                <motion.button
                  onClick={() => setViewMode("rendered")}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "rendered"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  {...pressableSubtle}
                >
                  渲染视图
                  {viewMode === "rendered" && (
                    <motion.div
                      layoutId="preset-view-indicator"
                      className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )}
                </motion.button>
                <motion.button
                  onClick={() => setViewMode("raw")}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "raw"
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  {...pressableSubtle}
                >
                  原始文本
                  {viewMode === "raw" && (
                    <motion.div
                      layoutId="preset-view-indicator"
                      className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )}
                </motion.button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  <motion.div key={viewMode} {...fadeSlide} className="min-w-0 p-1">
                    {viewMode === "rendered" ? (
                      <Markdown content={viewing.content} />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                        {viewing.content}
                      </pre>
                    )}
                  </motion.div>
                </AnimatePresence>
              </ScrollArea>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 角色卡绑定弹窗 */}
      <Dialog open={!!showCharDialog} onOpenChange={(o) => !o && setShowCharDialog(null)}>
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle>角色卡绑定</DialogTitle>
            <DialogDescription>选择启用此预设的角色卡（不选则全局启用）</DialogDescription>
          </DialogHeader>
          {showCharDialog && (
            <CharBindingContent
              preset={showCharDialog}
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
// 角色卡绑定内容组件
// ============================================================================

interface CharBindingContentProps {
  preset: Preset;
  characters: { uuid: string; name: string }[];
  onSave: (preset: Preset, charUuids: string[]) => void;
  onCancel: () => void;
}

const CharBindingContent = React.memo(function CharBindingContent({ preset, characters, onSave, onCancel }: CharBindingContentProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(preset.enabledForCharacters ?? []),
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
            <div className="py-4 text-center text-xs text-muted-foreground">暂无角色卡</div>
          ) : (
            characters.map((c) => (
              <label
                key={c.uuid}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.has(c.uuid)}
                  onCheckedChange={() => handleToggle(c.uuid)}
                />
                <span className="text-sm">{c.name}</span>
              </label>
            ))
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
              取消
            </Button>
            <Button onClick={() => onSave(preset, Array.from(selected))} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              确定
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
});
