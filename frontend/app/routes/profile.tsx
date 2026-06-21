/**
 * 用户档案页面（v0.2.0 完整实现）
 *
 * 功能：
 * 1. 多档案管理（新建/切换/删除）
 * 2. 头像上传（data URL，仅本地展示）
 * 3. 名称输入
 * 4. 描述编辑
 * 5. 导入描述（.md 文件）
 * 6. 导出描述（.md 文件下载 + 系统分享）
 * 7. 注入聊天验证：名称和描述通过 chatService.buildContext 注入
 */

import * as React from "react";
import type { Route } from "./+types/profile";
import { motion, AnimatePresence } from "motion/react";
import {
  IconUser,
  IconUserAdd,
  IconUpload,
  IconDownload,
  IconEdit,
  IconSave,
  IconTrash,
  IconClose,
  IconCheck,
  IconInfo,
  IconChevronRight,
  IconExpand,
} from "~/components/luzzy/luzzy-icons";

import type { UserProfile } from "~/types/luzzy";
import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { LuzzyFullscreenEditor } from "~/components/luzzy/luzzy-fullscreen-editor";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";
import { SwipeCard } from "~/components/luzzy/swipe-card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
} from "~/components/ui/empty";
import {
  springEnter,
  pressable,
  pressableSubtle,
  fadeSlide,
} from "~/lib/motion-presets";
import { toast } from "sonner";

export function meta(_: Route.MetaArgs) {
  return [{ title: "用户档案 - LUZZY" }];
}

/** 读取文件为 data URL（用于头像） */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** 读取文件为文本（用于导入描述） */
function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

export default function ProfilePage() {
  const user = useAppStore((s) => s.user);
  const userProfiles = useAppStore((s) => s.userProfiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const defaultProfileActive = useAppStore((s) => s.defaultProfileActive);
  const setUser = useAppStore((s) => s.setUser);
  const addProfile = useAppStore((s) => s.addProfile);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const removeProfile = useAppStore((s) => s.removeProfile);
  const setDefaultProfileActive = useAppStore((s) => s.setDefaultProfileActive);
  const confirm = useConfirm();

  // 编辑状态
  const [editing, setEditing] = React.useState<UserProfile | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [descFullscreenOpen, setDescFullscreenOpen] = React.useState(false);
  // 头像上传 input ref
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  // 导入描述 input ref
  const importDescInputRef = React.useRef<HTMLInputElement>(null);

  /** 打开编辑当前档案 */
  const handleEditCurrent = React.useCallback(() => {
    setEditing({ ...useAppStore.getState().user });
    setIsNew(false);
  }, []);

  /** 新建档案 */
  const handleNew = React.useCallback(() => {
    addProfile();
    // v0.3.2: 默认档案激活时，新增档案不自动激活，仅提示
    if (defaultProfileActive) {
      toast.info("已新增档案，关闭「默认档案」开关后可激活");
      return;
    }
    // addProfile 会把新档案设为激活，editing 直接基于新档案
    setIsNew(true);
    // 使用 setTimeout 确保 store 已更新
    setTimeout(() => {
      const state = useAppStore.getState();
      setEditing({ ...state.user });
    }, 0);
  }, [addProfile, defaultProfileActive]);

  /** 保存编辑 */
  const handleSave = React.useCallback(() => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.warning("请输入名称");
      return;
    }
    setUser({
      name: editing.name.trim(),
      description: editing.description,
      avatar: editing.avatar,
      person: editing.person,
    });
    setEditing(null);
    toast.success(isNew ? "已创建新档案" : "档案已保存");
  }, [editing, setUser, isNew]);

  /** 取消编辑 */
  const handleCancel = React.useCallback(() => {
    setEditing(null);
  }, []);

  /** 头像上传 */
  const handleAvatarUpload = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editing) return;
      try {
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

  /** 移除头像 */
  const handleRemoveAvatar = React.useCallback(() => {
    setEditing((prev) => (prev ? { ...prev, avatar: "" } : prev));
  }, []);

  /** 导入描述（.md 文件） */
  const handleImportDesc = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editing) return;
      try {
        if (!file.name.toLowerCase().endsWith(".md")) {
          toast.warning("仅支持 .md 文件");
          return;
        }
        if (file.size > 1 * 1024 * 1024) {
          toast.warning("描述文件不能超过 1MB");
          return;
        }
        const text = await fileToText(file);
        setEditing((prev) => (prev ? { ...prev, description: text } : prev));
        toast.success(`已导入描述：${file.name}`);
      } catch (err) {
        toast.error("导入失败：" + (err as Error).message);
      } finally {
        e.target.value = "";
      }
    },
    [editing],
  );

  /** 触发导入描述文件选择 */
  const triggerImportDesc = React.useCallback(() => {
    importDescInputRef.current?.click();
  }, []);

  /** 导出描述（.md 文件下载 + 系统分享） */
  const handleExportDesc = React.useCallback(async () => {
    if (!editing || !editing.description.trim()) {
      toast.warning("描述为空，无法导出");
      return;
    }
    const fileName = `${editing.name || "user"}-description.md`;
    const blob = new Blob([editing.description], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    try {
      // 优先尝试系统分享（移动端）
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: "text/markdown" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${editing.name} 的描述`,
            text: editing.description.slice(0, 100),
          });
          URL.revokeObjectURL(url);
          return;
        }
      }
      // 回退到下载
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`已导出：${fileName}`);
    } catch (err) {
      // 用户取消分享不算错误
      if ((err as Error).name !== "AbortError") {
        toast.error("导出失败：" + (err as Error).message);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [editing]);

  /** 切换档案 */
  const handleSwitch = React.useCallback(
    (uuid: string) => {
      if (uuid === activeProfileId) return;
      switchProfile(uuid);
      toast.success("已切换档案");
    },
    [switchProfile, activeProfileId],
  );

  /** 删除档案 */
  const handleDelete = React.useCallback(
    async (uuid: string, name: string) => {
      if (userProfiles.length === 0) {
        toast.warning("至少保留一个档案");
        return;
      }
      const ok = await confirm({
        title: "删除档案",
        description: `确定删除档案「${name}」吗？此操作不可撤销。`,
        destructive: true,
      });
      if (!ok) return;
      removeProfile(uuid);
      toast.success("档案已删除");
    },
    [removeProfile, userProfiles.length, confirm],
  );

  /** 更新编辑字段 */
  const updateField = React.useCallback(
    <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  return (
    <LuzzyLayout
      title="用户档案"
      actions={
        <Button size="icon" onClick={handleNew} title="新建档案" {...pressable}>
          <IconUserAdd className="size-4" />
        </Button>
      }
    >
      <div className="flex h-full flex-col gap-3 p-4">
        {/* 信息提示：注入说明 */}
        <motion.div
          {...fadeSlide}
          className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground"
        >
          <IconInfo className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <p className="font-medium text-foreground">用户档案注入说明</p>
            <p className="mt-1">
              名称和描述会自动注入到聊天系统提示词的 <code className="rounded bg-muted px-1">[User Info]</code> 区块中，让 AI 了解你的身份与偏好。
            </p>
          </div>
        </motion.div>

        {/* 当前激活档案卡片 */}
        <motion.div {...springEnter}>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <Avatar className="size-16 shrink-0 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  <IconUser className="size-6" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">
                    {user.name || "未命名"}
                  </h2>
                  <Badge variant="secondary" className="shrink-0">
                    当前
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {user.description || "暂无描述"}
                </p>
                {/* v0.3.2: 默认档案激活开关 */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">默认档案</span>
                  <Switch
                    checked={defaultProfileActive}
                    onCheckedChange={(v) => {
                      setDefaultProfileActive(v);
                      toast.success(v ? "已激活默认档案" : "已切换到新增档案");
                    }}
                    aria-label="默认档案激活开关"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleEditCurrent}
                title="编辑当前档案"
                {...pressableSubtle}
              >
                <IconEdit className="size-4" />
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* 档案列表 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            全部档案
            <span className="ml-2 text-xs text-muted-foreground">
              ({userProfiles.length})
            </span>
          </h3>
        </div>

        {/* v0.3.2: 默认档案激活提示 */}
        {defaultProfileActive && userProfiles.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            默认档案激活中，新增档案不可激活。关闭上方开关可切换到新增档案。
          </p>
        )}

        <ScrollArea className="flex-1">
          {userProfiles.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconUser className="size-8" />
                </EmptyMedia>
                <EmptyTitle>暂无其他档案</EmptyTitle>
                <EmptyDescription>
                  当前仅有一个默认档案，点击右上角按钮可创建更多档案以适应不同场景。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-2 pr-2">
              <AnimatePresence mode="popLayout">
                {userProfiles.map((profile) => {
                  const isActive = profile.uuid === activeProfileId;
                  // v0.3.2: 默认档案激活时，新增档案置灰且不可激活
                  const isDisabled = defaultProfileActive;
                  return (
                    <motion.div
                      key={profile.uuid}
                      layout
                      {...fadeSlide}
                      className={isDisabled ? "opacity-50" : ""}
                    >
                      <SwipeCard
                        onSwipeLeft={() => handleDelete(profile.uuid, profile.name)}
                        onSwipeRight={() => {
                          switchProfile(profile.uuid);
                          setTimeout(handleEditCurrent, 0);
                        }}
                        leftIcon={<IconTrash className="size-5" />}
                        rightIcon={<IconEdit className="size-5" />}
                        disabled={isDisabled}
                      >
                        <Card
                          className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                            isActive ? "border-primary/50 bg-primary/5" : ""
                          }`}
                        >
                          <Avatar className="size-10 shrink-0 rounded-lg">
                            <AvatarImage
                              src={profile.avatar}
                              alt={profile.name}
                            />
                            <AvatarFallback className="rounded-lg">
                              <IconUser className="size-4" />
                            </AvatarFallback>
                          </Avatar>
                          <button
                            type="button"
                            onClick={() => handleSwitch(profile.uuid)}
                            disabled={isDisabled}
                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {profile.name || "未命名"}
                              </span>
                              {isActive && (
                                <IconCheck className="size-3 shrink-0 text-primary" />
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {profile.description || "暂无描述"}
                            </p>
                          </button>
                          {!isActive && (
                            <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                        </Card>
                      </SwipeCard>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "新建档案" : "编辑档案"}</DialogTitle>
            <DialogDescription>
              设置你的名称、描述与头像，这些信息会注入到聊天中。
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="grid gap-4 py-2">
                {/* 头像上传 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">头像</label>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-16 shrink-0 rounded-lg">
                      <AvatarImage
                        src={editing.avatar}
                        alt={editing.name}
                      />
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
                        <IconUpload className="mr-2 size-4" />
                        选择头像
                      </Button>
                      {editing.avatar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={handleRemoveAvatar}
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

                {/* 名称 */}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">名称</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="你的名称（将注入到聊天中）"
                  />
                </div>

                {/* 描述 */}
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">描述</label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDescFullscreenOpen(true)}
                        title="全屏编辑"
                        {...pressableSubtle}
                      >
                        <IconExpand className="mr-1 size-3.5" />
                        全屏
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={triggerImportDesc}
                        title="从 .md 文件导入"
                      >
                        <IconUpload className="mr-1 size-3" />
                        导入
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleExportDesc}
                        title="导出为 .md 文件或分享"
                      >
                        <IconDownload className="mr-1 size-3" />
                        导出
                      </Button>
                      <input
                        ref={importDescInputRef}
                        type="file"
                        accept=".md,text/markdown"
                        className="hidden"
                        onChange={handleImportDesc}
                      />
                    </div>
                  </div>
                  <Textarea
                    value={editing.description}
                    onChange={(e) =>
                      updateField("description", e.target.value)
                    }
                    placeholder="你的自我介绍、偏好、设定等（将注入到聊天中）"
                    rows={12}
                    className="min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    支持 Markdown 格式。导入/导出仅针对描述内容。
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              <IconClose className="mr-2 size-4" />
              取消
            </Button>
            <Button onClick={handleSave}>
              <IconSave className="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 全屏编辑器 */}
      {editing && (
        <LuzzyFullscreenEditor
          open={descFullscreenOpen}
          onOpenChange={setDescFullscreenOpen}
          value={editing.description}
          onChange={(v) => updateField("description", v)}
          onSend={() => setDescFullscreenOpen(false)}
        />
      )}
    </LuzzyLayout>
  );
}
