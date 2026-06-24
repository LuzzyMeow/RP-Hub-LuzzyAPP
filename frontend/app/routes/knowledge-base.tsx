/**
 * 知识库页面（v0.2.0 完整实现）
 *
 * 功能：
 * 1. 知识库（文件夹）列表 + 标签分类 + 关键词搜索
 * 2. 点击进入文件夹查看文件列表
 * 3. 支持上传图片（png/jpg/jpeg/gif/webp）、md、txt 文件
 * 4. 文件预览（图片直接显示，文本类显示内容）
 * 5. 角色卡启用配置（同预设/世界书模式）
 * 6. 嵌入模型依赖提示：必须在记忆系统内设置嵌入模型才可正常使用
 * 7. 知识库 CRUD、文件删除
 */

import * as React from "react";
import type { Route } from "./+types/knowledge-base";
import { motion, AnimatePresence } from "motion/react";
import {
  IconFolder,
  IconFile,
  IconImage,
  IconPlus,
  IconTrash,
  IconEdit,
  IconSearch,
  IconClose,
  IconCheck,
  IconChevronLeft,
  IconBookmark,
  IconExclamation,
  IconUpload,
  IconTag,
} from "~/components/luzzy/luzzy-icons";

import type { KnowledgeBase, KnowledgeBaseFile } from "~/types/luzzy";
import { getItem } from "~/services/storage";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
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
import { springEnter, pressable, pressableSubtle, fadeSlide } from "~/lib/motion-presets";
import { toast } from "sonner";

export function meta(_: Route.MetaArgs) {
  return [{ title: "知识库 - LUZZY" }];
}

/** 记忆设置存储键（用于检测嵌入模型是否已配置） */
const MEMORY_SETTINGS_KEY = "memorySettings";

/** 支持的文件类型 */
const ACCEPTED_FILE_TYPES = ".png,.jpg,.jpeg,.gif,.webp,.md,.txt";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** 文件类型图标 */
function FileTypeIcon({ type }: { type: KnowledgeBaseFile["type"] }) {
  if (type === "image") return <IconImage className="size-4 text-primary" />;
  return <IconFile className="size-4 text-muted-foreground" />;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 读取文件为文本 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

/** 读取文件为 data URL（图片） */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function KnowledgeBasePage() {
  const characters = useAppStore((s) => s.characters);
  const knowledgeBases = useAppStore((s) => s.knowledgeBases);
  const loadKnowledgeBases = useAppStore((s) => s.loadKnowledgeBases);
  const addKnowledgeBase = useAppStore((s) => s.addKnowledgeBase);
  const updateKnowledgeBase = useAppStore((s) => s.updateKnowledgeBase);
  const removeKnowledgeBase = useAppStore((s) => s.removeKnowledgeBase);
  const saveKnowledgeBases = useAppStore((s) => s.saveKnowledgeBases);
  const confirm = useConfirm();

  const [loaded, setLoaded] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);

  // 当前查看的文件夹（知识库 ID）
  const [currentKbId, setCurrentKbId] = React.useState<string | null>(null);

  // 编辑状态
  const [editingKb, setEditingKb] = React.useState<KnowledgeBase | null>(null);
  const [isNewKb, setIsNewKb] = React.useState(false);
  const [showCharDialog, setShowCharDialog] = React.useState<KnowledgeBase | null>(null);

  // 文件预览
  const [previewFile, setPreviewFile] = React.useState<KnowledgeBaseFile | null>(null);

  // 新建 md 文件
  const [newFileDialog, setNewFileDialog] = React.useState<{
    name: string;
    content: string;
  } | null>(null);

  // 嵌入模型是否已配置
  const [hasEmbeddingModel, setHasEmbeddingModel] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadKbIdRef = React.useRef<string | null>(null);

  /** 加载知识库与记忆设置 */
  React.useEffect(() => {
    void (async () => {
      await loadKnowledgeBases();
      try {
        const memSettings = await getItem<{
          embeddingModel?: string;
          enabled?: boolean;
        }>("memory", MEMORY_SETTINGS_KEY);
        setHasEmbeddingModel(!!memSettings?.embeddingModel?.trim() && !!memSettings?.enabled);
      } catch {
        setHasEmbeddingModel(false);
      }
      setLoaded(true);
    })();
  }, [loadKnowledgeBases]);

  /** 当前查看的知识库 */
  const currentKb = React.useMemo(
    () => knowledgeBases.find((kb) => kb.id === currentKbId) ?? null,
    [knowledgeBases, currentKbId],
  );

  /** 所有标签集合 */
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    knowledgeBases.forEach((kb) => kb.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [knowledgeBases]);

  /** 过滤后的知识库列表 */
  const filteredKbs = React.useMemo(() => {
    let list = knowledgeBases;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (kb) =>
          kb.name.toLowerCase().includes(q) || kb.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (selectedTags.length > 0) {
      list = list.filter((kb) => selectedTags.every((t) => kb.tags.includes(t)));
    }
    return list;
  }, [knowledgeBases, searchQuery, selectedTags]);

  /** 新建知识库 */
  const handleNew = React.useCallback(() => {
    const now = Date.now();
    setEditingKb({
      id: crypto.randomUUID(),
      name: "",
      tags: [],
      files: [],
      enabledForCharacters: [],
      createdAt: now,
      updatedAt: now,
    });
    setIsNewKb(true);
  }, []);

  /** 编辑知识库 */
  const handleEdit = React.useCallback((kb: KnowledgeBase) => {
    setEditingKb({ ...kb });
    setIsNewKb(false);
  }, []);

  /** 保存知识库 */
  const handleSave = React.useCallback(async () => {
    if (!editingKb) return;
    if (!editingKb.name.trim()) {
      toast.warning("请输入知识库名称");
      return;
    }
    if (isNewKb) {
      addKnowledgeBase(editingKb);
      toast.success("知识库已创建");
    } else {
      updateKnowledgeBase(editingKb.id, editingKb);
      toast.success("知识库已更新");
    }
    await saveKnowledgeBases();
    setEditingKb(null);
  }, [editingKb, isNewKb, addKnowledgeBase, updateKnowledgeBase, saveKnowledgeBases]);

  /** 删除知识库 */
  const handleDelete = React.useCallback(
    async (kb: KnowledgeBase) => {
      const ok = await confirm({
        title: "删除知识库",
        description: `确定删除知识库「${kb.name}」及其所有文件吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      removeKnowledgeBase(kb.id);
      await saveKnowledgeBases();
      if (currentKbId === kb.id) setCurrentKbId(null);
      toast.success("已删除");
    },
    [removeKnowledgeBase, saveKnowledgeBases, currentKbId, confirm],
  );

  /** 点击上传文件 */
  const handleUploadClick = React.useCallback((kbId: string) => {
    uploadKbIdRef.current = kbId;
    fileInputRef.current?.click();
  }, []);

  /** 处理文件上传 */
  const handleFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const kbId = uploadKbIdRef.current;
      const files = e.target.files;
      if (!kbId || !files || files.length === 0) return;
      const kb = knowledgeBases.find((k) => k.id === kbId);
      if (!kb) return;

      const newFiles: KnowledgeBaseFile[] = [];
      for (const file of Array.from(files)) {
        try {
          if (file.size > MAX_FILE_SIZE) {
            toast.warning(`文件「${file.name}」超过 10MB 限制，已跳过`);
            continue;
          }
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          let type: KnowledgeBaseFile["type"];
          let content: string;
          if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
            type = "image";
            content = await readFileAsDataURL(file);
          } else if (ext === "md" || ext === "txt") {
            type = ext === "md" ? "md" : "txt";
            content = await readFileAsText(file);
          } else {
            toast.warning(`不支持的文件类型：${file.name}`);
            continue;
          }
          newFiles.push({
            id: crypto.randomUUID(),
            name: file.name,
            type,
            content,
            size: file.size,
            uploadedAt: Date.now(),
          });
        } catch (err) {
          toast.error(`上传「${file.name}」失败：${(err as Error).message}`);
        }
      }

      if (newFiles.length > 0) {
        updateKnowledgeBase(kbId, {
          files: [...kb.files, ...newFiles],
        });
        await saveKnowledgeBases();
        toast.success(`已上传 ${newFiles.length} 个文件`);
      }

      // 重置 input
      if (fileInputRef.current) fileInputRef.current.value = "";
      uploadKbIdRef.current = null;
    },
    [knowledgeBases, updateKnowledgeBase, saveKnowledgeBases],
  );

  /** 删除文件 */
  const handleDeleteFile = React.useCallback(
    async (kb: KnowledgeBase, fileId: string) => {
      const ok = await confirm({
        title: "删除文件",
        description: "确定删除此文件吗？此操作不可撤销。",
        destructive: true,
      });
      if (!ok) return;
      updateKnowledgeBase(kb.id, {
        files: kb.files.filter((f) => f.id !== fileId),
      });
      await saveKnowledgeBases();
      setPreviewFile(null);
      toast.success("文件已删除");
    },
    [updateKnowledgeBase, saveKnowledgeBases, confirm],
  );

  /** 切换标签筛选 */
  const toggleTag = React.useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  /** 打开新建 md 文件弹窗 */
  const handleOpenNewFile = React.useCallback(() => {
    setNewFileDialog({ name: "", content: "" });
  }, []);

  /** 保存新建 md 文件 */
  const handleSaveNewFile = React.useCallback(async () => {
    if (!newFileDialog) return;
    if (!currentKb) return;
    const trimmedName = newFileDialog.name.trim();
    if (!trimmedName) {
      toast.warning("请输入文件名称");
      return;
    }
    // 自动补 .md 后缀
    const fileName = trimmedName.endsWith(".md") ? trimmedName : `${trimmedName}.md`;
    const content = newFileDialog.content;
    const newFile: KnowledgeBaseFile = {
      id: crypto.randomUUID(),
      name: fileName,
      type: "md",
      content,
      size: new Blob([content]).size,
      uploadedAt: Date.now(),
    };
    updateKnowledgeBase(currentKb.id, {
      files: [...currentKb.files, newFile],
    });
    await saveKnowledgeBases();
    setNewFileDialog(null);
    toast.success(`已创建文件：${fileName}`);
  }, [newFileDialog, currentKb, updateKnowledgeBase, saveKnowledgeBases]);

  /** 保存角色卡绑定 */
  const handleSaveCharacters = React.useCallback(
    async (kb: KnowledgeBase, charUuids: string[]) => {
      updateKnowledgeBase(kb.id, { enabledForCharacters: charUuids });
      await saveKnowledgeBases();
      setShowCharDialog(null);
      toast.success("角色卡绑定已更新");
    },
    [updateKnowledgeBase, saveKnowledgeBases],
  );

  // ============================================================================
  // 文件夹内文件列表视图
  // ============================================================================
  if (currentKb) {
    return (
      <LuzzyLayout
        title={currentKb.name}
        actions={
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCurrentKbId(null)}
              {...pressableSubtle}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleOpenNewFile}
              title="新建文件"
              {...pressableSubtle}
            >
              <IconPlus className="size-4" />
            </Button>
            <Button size="icon" onClick={() => handleUploadClick(currentKb.id)} {...pressable}>
              <IconUpload className="size-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              multiple
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
          </>
        }
      >
        <div className="flex h-full flex-col gap-3 p-4">
          {/* 嵌入模型依赖提示 */}
          {!hasEmbeddingModel && (
            <motion.div
              {...fadeSlide}
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
            >
              <IconExclamation className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">嵌入模型未配置</p>
                <p className="mt-0.5 opacity-90">
                  知识库检索依赖向量嵌入。请前往「记忆系统」页面设置并启用嵌入模型，否则知识库功能无法正常使用。
                </p>
              </div>
            </motion.div>
          )}

          {/* 角色卡绑定信息 */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconBookmark className="size-3.5" />
            <span>
              {currentKb.enabledForCharacters.length === 0
                ? "全局启用（所有角色）"
                : `已绑定 ${currentKb.enabledForCharacters.length} 个角色卡`}
            </span>
            <Badge variant="outline" className="text-xs">
              {currentKb.files.length} 文件
            </Badge>
          </div>

          {currentKb.files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconFile className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>此知识库暂无文件</EmptyTitle>
                  <EmptyDescription>
                    支持上传图片（png/jpg/gif/webp）、Markdown、文本文件
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => handleUploadClick(currentKb.id)} {...pressable}>
                    <IconUpload className="mr-2 size-4" />
                    上传文件
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-3xl space-y-2 pb-4">
                <AnimatePresence mode="popLayout">
                  {currentKb.files.map((file, i) => (
                    <motion.div key={file.id} layout {...springEnter} custom={i}>
                      <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/30">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted/50">
                          <FileTypeIcon type={file.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-medium">{file.name}</h4>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatSize(file.size)}</span>
                            <span>·</span>
                            <span>{new Date(file.uploadedAt).toLocaleString("zh-CN")}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setPreviewFile(file)}
                            {...pressableSubtle}
                          >
                            <IconSearch className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => void handleDeleteFile(currentKb, file.id)}
                            {...pressableSubtle}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* 文件预览弹窗 */}
        <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
          <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
            <DialogHeader>
              <DialogTitle className="truncate">{previewFile?.name}</DialogTitle>
              <DialogDescription>{previewFile && formatSize(previewFile.size)}</DialogDescription>
            </DialogHeader>
            {previewFile && (
              <ScrollArea className="flex-1 min-h-0">
                {previewFile.type === "image" ? (
                  <div className="flex justify-center p-2">
                    <img
                      src={previewFile.content}
                      alt={previewFile.name}
                      className="max-h-[60vh] max-w-full rounded-md object-contain"
                    />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words p-2 font-mono text-xs leading-relaxed">
                    {previewFile.content}
                  </pre>
                )}
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewFile(null)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建 md 文件弹窗 */}
        <Dialog open={!!newFileDialog} onOpenChange={(o) => !o && setNewFileDialog(null)}>
          <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
            <DialogHeader>
              <DialogTitle>新建 Markdown 文件</DialogTitle>
              <DialogDescription>
                在当前知识库内创建一个新的 .md 文件，支持 Markdown 语法
              </DialogDescription>
            </DialogHeader>
            {newFileDialog && (
              <ScrollArea className="flex-1 min-h-0 pr-2">
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">文件名称</label>
                    <Input
                      value={newFileDialog.name}
                      onChange={(e) =>
                        setNewFileDialog((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev,
                        )
                      }
                      placeholder="例如：角色设定笔记（自动添加 .md 后缀）"
                      autoFocus
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">文件内容</label>
                    <Textarea
                      value={newFileDialog.content}
                      onChange={(e) =>
                        setNewFileDialog((prev) =>
                          prev ? { ...prev, content: e.target.value } : prev,
                        )
                      }
                      placeholder="支持 Markdown 格式，例如：&#10;# 标题&#10;&#10;正文内容..."
                      rows={12}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewFileDialog(null)}>
                取消
              </Button>
              <Button onClick={() => void handleSaveNewFile()} {...pressable}>
                <IconCheck className="mr-2 size-4" />
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </LuzzyLayout>
    );
  }

  // ============================================================================
  // 知识库列表视图
  // ============================================================================
  return (
    <LuzzyLayout
      title="知识库"
      actions={
        <Button size="icon" onClick={handleNew} {...pressable}>
          <IconPlus className="size-4" />
        </Button>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        {/* 嵌入模型依赖提示 */}
        {!hasEmbeddingModel && loaded && (
          <motion.div
            {...fadeSlide}
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
          >
            <IconExclamation className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">嵌入模型未配置</p>
              <p className="mt-0.5 opacity-90">
                知识库检索依赖向量嵌入。请前往「记忆系统」页面设置并启用嵌入模型。
              </p>
            </div>
          </motion.div>
        )}

        {/* 搜索栏 */}
        {knowledgeBases.length > 0 && (
          <div className="relative shrink-0">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索知识库名称或标签..."
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

        {/* 标签筛选 */}
        {allTags.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <IconTag className="size-3.5 text-muted-foreground" />
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selectedTags.includes(tag)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                清除
              </button>
            )}
          </div>
        )}

        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconFolder className="size-6" />
                </EmptyMedia>
                <EmptyTitle>还没有知识库</EmptyTitle>
                <EmptyDescription>
                  知识库用于存储角色卡相关资料（图片、文档），配合嵌入模型实现语义检索
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleNew} {...pressable}>
                  <IconPlus className="mr-2 size-4" />
                  新建知识库
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : filteredKbs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <IconExclamation className="size-8 opacity-50" />
              <span>未找到匹配的知识库</span>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-3 pb-4">
              <AnimatePresence mode="popLayout">
                {filteredKbs.map((kb, i) => {
                  const isGlobal = !kb.enabledForCharacters || kb.enabledForCharacters.length === 0;
                  return (
                    <motion.div key={kb.id} layout {...springEnter} custom={i}>
                      <Card className="gap-2 p-4 transition-all hover:shadow-md">
                        <div
                          className="flex cursor-pointer items-start gap-3"
                          onClick={() => setCurrentKbId(kb.id)}
                        >
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <IconFolder className="size-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate font-medium">{kb.name}</h3>
                              <Badge variant="outline" className="text-xs">
                                {kb.files.length} 文件
                              </Badge>
                              {isGlobal ? (
                                <Badge variant="outline" className="text-xs">
                                  全局
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  {kb.enabledForCharacters.length} 角色
                                </Badge>
                              )}
                            </div>
                            {kb.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {kb.tags.map((t) => (
                                  <Badge
                                    key={t}
                                    variant="secondary"
                                    className="text-xs font-normal"
                                  >
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              更新于 {new Date(kb.updatedAt).toLocaleString("zh-CN")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => handleUploadClick(kb.id)}
                            title="上传文件"
                            {...pressableSubtle}
                          >
                            <IconUpload className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => setShowCharDialog(kb)}
                            title="角色卡绑定"
                            {...pressableSubtle}
                          >
                            <IconBookmark className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => handleEdit(kb)}
                            title="编辑"
                            {...pressableSubtle}
                          >
                            <IconEdit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-destructive"
                            onClick={() => void handleDelete(kb)}
                            title="删除"
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

      {/* 隐藏的文件上传 input（列表视图也保留一个，用于列表页直接上传） */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
      />

      {/* 知识库新建/编辑弹窗 */}
      <Dialog open={!!editingKb} onOpenChange={(o) => !o && setEditingKb(null)}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle>{isNewKb ? "新建知识库" : "编辑知识库"}</DialogTitle>
            <DialogDescription>知识库作为文件夹，可上传图片、Markdown、文本文件</DialogDescription>
          </DialogHeader>
          {editingKb && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={editingKb.name}
                  onChange={(e) => setEditingKb({ ...editingKb, name: e.target.value })}
                  placeholder="例如：魔法世界资料库"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">标签（中英文逗号分隔）</label>
                <Input
                  value={editingKb.tags.join(", ")}
                  onChange={(e) =>
                    setEditingKb({
                      ...editingKb,
                      tags: e.target.value
                        .split(/[,，]/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="标签1, 标签2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKb(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 角色卡绑定弹窗 */}
      <Dialog open={!!showCharDialog} onOpenChange={(o) => !o && setShowCharDialog(null)}>
        <DialogContent className="max-h-[80vh] min-w-0 overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle>角色卡绑定</DialogTitle>
            <DialogDescription>选择启用此知识库的角色卡（不选则全局启用）</DialogDescription>
          </DialogHeader>
          {showCharDialog && (
            <CharBindingContent
              kb={showCharDialog}
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
  kb: KnowledgeBase;
  characters: { uuid: string; name: string }[];
  onSave: (kb: KnowledgeBase, charUuids: string[]) => void;
  onCancel: () => void;
}

function CharBindingContent({ kb, characters, onSave, onCancel }: CharBindingContentProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(kb.enabledForCharacters ?? []),
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
            <Button onClick={() => onSave(kb, Array.from(selected))} {...pressable}>
              <IconCheck className="mr-2 size-4" />
              确定
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  );
}
