/**
 * UI 模板页面（v0.2.0 重构）
 *
 * 功能：
 * 1. 模板列表 + 启用/禁用 + 新建/编辑/删除
 * 2. 角色卡绑定（空数组=全局启用）
 * 3. 注入类型选择（markdown/html/css）
 * 4. 背景注入说明：支持将 Markdown/HTML/CSS 注入到聊天画面背景中
 * 5. 统一 persist 模式（functional updater）
 * 6. loaded 状态避免空状态闪烁
 */

import * as React from "react";
import type { Route } from "./+types/ui-template";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconGrid,
  IconSearch,
  IconBookmark,
  IconCheck,
  IconClose,
  IconInfo,
  IconExpand,
  IconImport,
} from "~/components/luzzy/luzzy-icons";

import type { UiTemplate } from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
// v0.4.1: 导入角色卡解析工具,支持从 PNG 角色卡导入 UI 模板
import { parsePngCharacterCard, extractUiTemplatesFromCard } from "~/services/characterCardImport";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { LuzzyFullscreenEditor } from "~/components/luzzy/luzzy-fullscreen-editor";
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

export function meta(_: Route.MetaArgs) {
  return [{ title: "UI模板 - LUZZY" }];
}

/** 存储配置 */
const STORE_NAME = "uiTemplates";
const STORE_KEY = "uiTemplates";

/** 注入类型标签 */
const INJECTION_TYPE_LABELS: Record<NonNullable<UiTemplate["injectionType"]>, string> = {
  markdown: "Markdown",
  html: "HTML",
  css: "CSS",
};

/** 创建空白模板 */
function createEmptyTemplate(): UiTemplate {
  return {
    id: crypto.randomUUID(),
    name: "",
    content: "",
    enabled: false,
    enabledForCharacters: [],
    injectionType: "markdown",
  };
}

export default function UiTemplatePage() {
  const characters = useAppStore((s) => s.characters);
  const confirm = useConfirm();

  const [templates, setTemplates] = React.useState<UiTemplate[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState<UiTemplate | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [showCharDialog, setShowCharDialog] = React.useState<UiTemplate | null>(
    null,
  );
  const [viewing, setViewing] = React.useState<UiTemplate | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  // v0.4.1: 从角色卡导入 UI 模板
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /** 页面加载时从 storage 读取 */
  React.useEffect(() => {
    void (async () => {
      try {
        const data = await getItem<UiTemplate[]>(STORE_NAME, STORE_KEY);
        if (data) setTemplates(data);
      } catch (e) {
        toast.error("加载失败：" + (e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /** 持久化 */
  const persist = React.useCallback(async (next: UiTemplate[]) => {
    setTemplates(next);
    try {
      await setItem(STORE_NAME, STORE_KEY, next);
    } catch (e) {
      toast.error("保存失败：" + (e as Error).message);
    }
  }, []);

  /** 同步更新 state 与 storage */
  const updateTemplates = React.useCallback(
    (updater: (prev: UiTemplate[]) => UiTemplate[]) => {
      setTemplates((prev) => {
        const next = updater(prev);
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  /** 打开新建弹窗 */
  const handleNew = React.useCallback(() => {
    setEditing(createEmptyTemplate());
    setIsNew(true);
  }, []);

  /** 打开编辑弹窗 */
  const handleEdit = React.useCallback((t: UiTemplate) => {
    setEditing({ ...t });
    setIsNew(false);
  }, []);

  /** 查看预览 */
  const handleView = React.useCallback((t: UiTemplate) => {
    setViewing(t);
  }, []);

  /** 保存 */
  const handleSave = React.useCallback(() => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.warning("请输入模板名称");
      return;
    }
    const saved = editing;
    if (isNew) {
      updateTemplates((prev) => [...prev, saved]);
      toast.success("模板已创建");
    } else {
      updateTemplates((prev) =>
        prev.map((t) => (t.id === saved.id ? saved : t)),
      );
      toast.success("模板已更新");
    }
    setEditing(null);
  }, [editing, isNew, updateTemplates]);

  /** 删除 */
  const handleDelete = React.useCallback(
    async (t: UiTemplate) => {
      const ok = await confirm({
        title: "删除模板",
        description: `确定删除模板「${t.name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      updateTemplates((prev) => prev.filter((item) => item.id !== t.id));
      toast.success("已删除");
    },
    [updateTemplates, confirm],
  );

  /** 切换启用状态 */
  const handleToggle = React.useCallback(
    (id: string, enabled: boolean) => {
      updateTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, enabled } : t)),
      );
    },
    [updateTemplates],
  );

  /** 编辑表单字段更新 */
  const updateField = React.useCallback(
    <K extends keyof UiTemplate>(key: K, value: UiTemplate[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  /** 保存角色卡绑定 */
  const handleSaveCharacters = React.useCallback(
    (template: UiTemplate, charUuids: string[]) => {
      updateTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id
            ? { ...t, enabledForCharacters: charUuids }
            : t,
        ),
      );
      setShowCharDialog(null);
      toast.success("角色卡绑定已更新");
    },
    [updateTemplates],
  );

  /** v0.4.1: 从 PNG 角色卡导入 UI 模板 */
  const handleImportFromCard = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const cardData = await parsePngCharacterCard(file);
        // 使用临时 UUID 关联角色卡(若用户希望绑定到具体角色,可在编辑界面修改)
        const tempUuid = crypto.randomUUID();
        const imported = extractUiTemplatesFromCard(cardData, tempUuid);
        if (imported.length === 0) {
          toast.warning("该角色卡中未检测到 UI 模板");
          return;
        }
        updateTemplates((prev) => [...prev, ...imported]);
        toast.success(`已导入 ${imported.length} 个 UI 模板`);
      } catch (err) {
        toast.error("导入失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [updateTemplates],
  );

  return (
    <LuzzyLayout
      title="UI模板"
      actions={
        <>
          {/* v0.4.1: 从角色卡导入 UI 模板 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="从角色卡导入"
            {...pressableSubtle}
          >
            <IconImport className="size-4" />
          </Button>
          <Button size="icon" onClick={handleNew} {...pressable}>
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
        {/* 背景注入说明 */}
        <motion.div
          {...fadeSlide}
          className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
        >
          <IconInfo className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">背景注入说明</p>
            <p className="mt-0.5 opacity-90">
              UI 模板支持将 Markdown / HTML / CSS
              内容注入到聊天画面背景中，用于自定义界面显示样式。可为每个模板绑定角色卡，实现角色专属界面。
            </p>
          </div>
        </motion.div>

        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconGrid className="size-6" />
                </EmptyMedia>
                <EmptyTitle>还没有 UI 模板</EmptyTitle>
                <EmptyDescription>
                  新建一个模板来定制界面显示样式，支持 Markdown/HTML/CSS 注入
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleNew} {...pressable}>
                  <IconPlus className="mr-2 size-4" />
                  新建模板
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-3 pb-4">
              <AnimatePresence mode="popLayout">
                {templates.map((t, i) => {
                  const isGlobal =
                    !t.enabledForCharacters ||
                    t.enabledForCharacters.length === 0;
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      {...springEnter}
                      custom={i}
                    >
                      <Card className="gap-2 p-4 transition-all hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate font-medium">
                                {t.name || "未命名"}
                              </h3>
                              {t.enabled && (
                                <Badge variant="secondary" className="text-xs">
                                  已启用
                                </Badge>
                              )}
                              {t.injectionType && (
                                <Badge variant="outline" className="text-xs">
                                  {INJECTION_TYPE_LABELS[t.injectionType]}
                                </Badge>
                              )}
                              {isGlobal ? (
                                <Badge variant="outline" className="text-xs">
                                  全局
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  {t.enabledForCharacters!.length} 角色
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {t.content || "暂无内容"}
                            </p>
                          </div>
                          <Switch
                            checked={t.enabled}
                            onCheckedChange={(checked) =>
                              handleToggle(t.id, checked)
                            }
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => handleView(t)}
                            title="预览"
                            {...pressableSubtle}
                          >
                            <IconSearch className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => setShowCharDialog(t)}
                            title="角色卡绑定"
                            {...pressableSubtle}
                          >
                            <IconBookmark className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => handleEdit(t)}
                            title="编辑"
                            {...pressableSubtle}
                          >
                            <IconEdit className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-destructive"
                            onClick={() => handleDelete(t)}
                            title="删除"
                            {...pressableSubtle}
                          >
                            <IconTrash className="size-3.5" />
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

      {/* 新建/编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建模板" : "编辑模板"}</DialogTitle>
            <DialogDescription>
              编辑 UI 模板的名称、注入类型与内容
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">名称</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="模板名称"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">注入类型</label>
                    <Select
                      value={editing.injectionType ?? "markdown"}
                      onValueChange={(v) =>
                        updateField(
                          "injectionType",
                          v as UiTemplate["injectionType"],
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="css">CSS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2 rounded-md border p-3">
                      <Switch
                        checked={editing.enabled}
                        onCheckedChange={(checked) =>
                          updateField("enabled", checked)
                        }
                      />
                      <label className="text-sm">启用此模板</label>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      内容（支持{" "}
                      {INJECTION_TYPE_LABELS[editing.injectionType ?? "markdown"]}{" "}
                      语法）
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setFullscreenOpen(true)}
                      title="全屏编辑"
                      {...pressableSubtle}
                    >
                      <IconExpand className="mr-1 size-3.5" />
                      全屏
                    </Button>
                  </div>
                  <Textarea
                    value={editing.content}
                    onChange={(e) => updateField("content", e.target.value)}
                    placeholder={
                      editing.injectionType === "css"
                        ? "/* 例如：body { background: linear-gradient(...); } */"
                        : editing.injectionType === "html"
                          ? "<!-- 例如：<div class='bg-overlay'>...</div> -->"
                          : "例如：# 标题\n\n正文内容..."
                    }
                    rows={16}
                    className="min-h-[300px] font-mono text-xs"
                  />
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={handleSave} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览弹窗 */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing?.name}
              {viewing?.injectionType && (
                <Badge variant="outline" className="text-xs">
                  {INJECTION_TYPE_LABELS[viewing.injectionType]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>模板内容预览</DialogDescription>
          </DialogHeader>
          {viewing && (
            <ScrollArea className="flex-1 min-h-0">
              <pre className="whitespace-pre-wrap break-words p-2 font-mono text-xs leading-relaxed">
                {viewing.content || "（空模板）"}
              </pre>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              <IconClose className="mr-2 size-4" />
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 角色卡绑定弹窗 */}
      <Dialog
        open={!!showCharDialog}
        onOpenChange={(o) => !o && setShowCharDialog(null)}
      >
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle>角色卡绑定</DialogTitle>
            <DialogDescription>
              选择启用此 UI 模板的角色卡（不选则全局启用）
            </DialogDescription>
          </DialogHeader>
          {showCharDialog && (
            <CharBindingContent
              template={showCharDialog}
              characters={characters}
              onSave={handleSaveCharacters}
              onCancel={() => setShowCharDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 全屏编辑器 */}
      {editing && (
        <LuzzyFullscreenEditor
          open={fullscreenOpen}
          onOpenChange={setFullscreenOpen}
          value={editing.content}
          onChange={(v) => updateField("content", v)}
          onSend={() => setFullscreenOpen(false)}
        />
      )}
    </LuzzyLayout>
  );
}

// ============================================================================
// 角色卡绑定内容组件
// ============================================================================

interface CharBindingContentProps {
  template: UiTemplate;
  characters: { uuid: string; name: string }[];
  onSave: (template: UiTemplate, charUuids: string[]) => void;
  onCancel: () => void;
}

function CharBindingContent({
  template,
  characters,
  onSave,
  onCancel,
}: CharBindingContentProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(template.enabledForCharacters ?? []),
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
            <div className="py-4 text-center text-xs text-muted-foreground">
              暂无角色卡
            </div>
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
            {selected.size === 0
              ? "全局启用（所有角色）"
              : `已选 ${selected.size} 个角色`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button
              onClick={() => onSave(template, Array.from(selected))}
              {...pressable}
            >
              <IconCheck className="mr-2 size-4" />
              确定
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
}
