/**
 * LUZZY 聊天输入组件
 *
 * v0.3.0 重构版：
 * - 第一排：纯文本输入框（含全屏按钮在最右侧）
 * - 第二排：功能 icon 行（模型切换、思考深度、加号、发送/停止）
 * - 回车键不触发发送，仅点击发送按钮触发
 * - 支持全屏编辑器（markdown 实时渲染 + 工具栏）
 * - isGenerating 时显示停止按钮
 */

import * as React from "react";
import { motion } from "motion/react";
import {
  IconSend,
  IconStop,
  IconPlus,
  IconLight,
  IconToolKit,
  IconCheck,
  IconFile,
  IconImage,
  IconCamera,
  IconExpand,
} from "~/components/luzzy/luzzy-icons";
import { toast } from "sonner";

import type { ThinkingDepth } from "~/types/luzzy";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Badge } from "~/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  springEnter,
  pressableSubtle,
  pressable,
} from "~/lib/motion-presets";
import { LuzzyFullscreenEditor } from "~/components/luzzy/luzzy-fullscreen-editor";

interface LuzzyChatInputProps {
  /** 输入框值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 发送回调 */
  onSend: () => void;
  /** 停止生成回调 */
  onStop?: () => void;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 是否禁用（如未选择角色卡） */
  disabled?: boolean;
  /** 占位符 */
  placeholder?: string;
  /** 额外样式 */
  className?: string;
}

/** 思考深度选项（v0.3.0 扩展为 6 档，对齐 OpenAI reasoning_effort） */
const THINKING_DEPTH_OPTIONS: { value: ThinkingDepth; label: string; description: string }[] = [
  { value: "minimal", label: "关闭", description: "不启用深度思考" },
  { value: "auto", label: "自动", description: "由模型自行决定" },
  { value: "low", label: "低", description: "快速思考，适合简单对话" },
  { value: "medium", label: "中等", description: "平衡思考深度与速度" },
  { value: "high", label: "高", description: "深度思考，适合复杂任务" },
  { value: "max", label: "极致", description: "最大思考强度" },
];

/** LUZZY 聊天输入 */
export function LuzzyChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating = false,
  disabled = false,
  placeholder = "输入消息...",
  className,
}: LuzzyChatInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [showModelPicker, setShowModelPicker] = React.useState(false);
  const [showThinkingDepth, setShowThinkingDepth] = React.useState(false);
  const [showPlusMenu, setShowPlusMenu] = React.useState(false);
  const [showFullscreen, setShowFullscreen] = React.useState(false);

  // v0.4.1: 通过 ResizeObserver 动态追踪输入栏高度,暴露 CSS 变量供置底箭头使用
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty("--chat-input-height", `${h}px`);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--chat-input-height");
    };
  }, []);

  // Store 数据
  const modelName = useAppStore((s) => s.modelName);
  const apiProviderId = useAppStore((s) => s.apiProviderId);
  const customApiProviders = useAppStore((s) => s.customApiProviders);
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const customRequestBody = useAppStore((s) => s.customRequestBody);
  // v0.4.0: 订阅 builtinThinkingDepthOverrides 确保思考深度修改后 memo 重算
  const builtinThinkingDepthOverrides = useAppStore((s) => s.builtinThinkingDepthOverrides);

  // Store actions
  const setModelName = useAppStore((s) => s.setModelName);
  const setProviderThinkingDepth = useAppStore((s) => s.setProviderThinkingDepth);

  /** 自动调整高度 */
  const autoResize = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  React.useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  /** 组件挂载时重置 textarea 高度（修复切换页面后聊天框变大的 Bug） */
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
    }
  }, []);

  /** 键盘事件处理：回车不触发发送，仅换行 */
  const handleKeyDown = (_e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 回车键仅换行，不触发发送
    // Shift+Enter 也换行（默认行为）
    // 发送仅通过点击发送按钮触发
  };

  /** 发送按钮点击 */
  const handleSendClick = () => {
    if (isGenerating) {
      onStop?.();
    } else if (!disabled && value.trim()) {
      onSend();
    }
  };

  /** 所有供应商列表 */
  // v0.4.0: 添加 builtinThinkingDepthOverrides 到依赖数组，修复思考深度修改后不刷新
  const allProviders = React.useMemo(
    () => getAllProviders(),
    [getAllProviders, customApiProviders, builtinThinkingDepthOverrides]
  );

  /** v0.3.4: 从当前模型的 supportsReasoning 派生 enableThinking */
  const enableThinking = React.useMemo(() => {
    const currentProvider = allProviders.find((p) => p.id === apiProviderId);
    if (!modelName) return false;
    // 解析模型名（去掉供应商前缀）
    const parts = modelName.split("_");
    const actualName = parts.length > 1 ? parts.slice(1).join("_") : modelName;
    const providerId = parts.length > 1 ? parts[0] : apiProviderId;
    const targetProvider = providerId
      ? allProviders.find((p) => p.id === providerId)
      : currentProvider;
    const model = targetProvider?.models?.find((m) => m.name === actualName);
    return !!model?.supportsReasoning;
  }, [allProviders, apiProviderId, modelName]);

  /** 当前模型显示名（v0.4.0: 优先使用 ModelConfig.displayName） */
  const displayModelName = React.useMemo(() => {
    if (!modelName) return "未选择模型";
    const parts = modelName.split("_");
    const actualName = parts.length > 1 ? parts.slice(1).join("_") : modelName;
    const providerId = parts.length > 1 ? parts[0] : apiProviderId;
    const provider = allProviders.find((p) => p.id === providerId);
    const model = provider?.models?.find((m) => m.name === actualName);
    // v0.4.0: 优先返回用户自定义的 displayName，回退到模型 name
    return model?.displayName || model?.name || actualName;
  }, [modelName, allProviders, apiProviderId]);

  /** 当前思考深度 */
  const currentThinkingDepth: ThinkingDepth = enableThinking
    ? (allProviders.find((p) => p.id === apiProviderId)?.thinkingDepth ?? "medium")
    : "minimal";

  /** 检测 JSON 配置是否已设置思考深度（v0.3.0 B6：若已设置则置灰聊天栏思考深度按钮） */
  // v0.4.4: 仅 reasoning_effort 锁定深度档位;thinking.type=enabled 仅是开关,不锁定
  const thinkingDepthLockedByJson = React.useMemo(() => {
    const text = (customRequestBody ?? "").trim();
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return "reasoning_effort" in parsed;
      }
    } catch {
      // JSON 解析失败，不置灰
    }
    return false;
  }, [customRequestBody]);

  return (
    <>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className={cn(
          "border-t border-border bg-background",
          className,
        )}
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* 输入框 + 发送按钮 */}
        <div className="flex items-end gap-2 px-3 pt-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.05 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFullscreen(true)}
              disabled={disabled}
              title="全屏编辑"
              className="size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <IconExpand className="size-5" />
            </Button>
          </motion.div>

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus-visible:ring-1 focus-visible:ring-ring"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.1 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Button
              size="icon"
              onClick={handleSendClick}
              disabled={!isGenerating && (disabled || !value.trim())}
              className="size-10 shrink-0 rounded-xl"
            >
              {isGenerating ? (
                <IconStop className="size-5" />
              ) : (
                <IconSend className="size-5" />
              )}
            </Button>
          </motion.div>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-1 px-3 pt-1.5">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.15 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowModelPicker(true)}
              disabled={disabled}
              title="切换模型"
              className="size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <IconToolKit className="size-4" />
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.2 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => !thinkingDepthLockedByJson && setShowThinkingDepth(true)}
              disabled={disabled || thinkingDepthLockedByJson}
              title={thinkingDepthLockedByJson ? "思考深度已在请求体内设置" : "思考深度"}
              className={cn(
                "size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                thinkingDepthLockedByJson && "opacity-40",
              )}
            >
              <IconLight className="size-4" />
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.25 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPlusMenu(true)}
              disabled={disabled || isGenerating}
              title="更多"
              className="size-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <IconPlus className="size-4" />
            </Button>
          </motion.div>

          {/* 右侧模型状态 */}
          <div className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/60">
            <span className="truncate">{displayModelName}</span>
            {enableThinking && (
              <>
                <span className="shrink-0 text-muted-foreground/30">·</span>
                <span className="shrink-0">
                  {THINKING_DEPTH_OPTIONS.find((o) => o.value === currentThinkingDepth)?.label}
                </span>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* 全屏编辑器 */}
      <LuzzyFullscreenEditor
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        value={value}
        onChange={onChange}
        onSend={() => {
          if (!disabled && value.trim()) {
            onSend();
            setShowFullscreen(false);
          }
        }}
        disabled={disabled || isGenerating}
      />

      {/* 模型选择弹窗 */}
      <Sheet open={showModelPicker} onOpenChange={setShowModelPicker}>
        <SheetContent side="bottom" className="h-[60vh] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>选择模型</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(60vh-3rem)]">
            <div className="flex flex-col gap-4 p-3">
              {allProviders.map((provider) => {
                const providerModels = provider.models ?? [];
                if (providerModels.length === 0) return null;
                return (
                  <div key={provider.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-sm font-semibold">{provider.displayName ?? provider.name}</span>
                      {provider.isBuiltin && (
                        <Badge variant="secondary" className="text-xs">内置</Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {providerModels.map((model) => {
                        // v0.3.5: 使用 modelId（若存在）构建 fullModelName，否则回退到 name
                        const modelIdValue = model.modelId ?? model.name;
                        const fullModelName = `${provider.id}_${modelIdValue}`;
                        const isActive = modelName === fullModelName;
                        return (
                          <motion.button
                            key={model.id}
                            {...springEnter}
                            {...pressableSubtle}
                            onClick={() => {
                              setModelName(fullModelName);
                              setShowModelPicker(false);
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-lg border border-border/20 bg-card/50 p-3 text-left transition-colors",
                              isActive
                                ? "border-primary/40 bg-primary/5"
                                : "hover:bg-accent/50",
                            )}
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">{model.displayName ?? model.name}</span>
                              <div className="flex flex-wrap gap-1">
                                {model.supportsVision && <Badge variant="outline" className="text-xs">视觉</Badge>}
                                {model.supportsReasoning && <Badge variant="outline" className="text-xs">推理</Badge>}
                                {model.contextLength && (
                                  <Badge variant="outline" className="text-xs">
                                    {model.contextLength >= 1000
                                      ? `${Math.floor(model.contextLength / 1000)}K`
                                      : model.contextLength}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {isActive && <IconCheck className="size-4 text-primary" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {allProviders.every((p) => (p.models ?? []).length === 0) && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconToolKit className="mb-2 size-8 opacity-40" />
                  <p className="text-sm">暂无可用模型</p>
                  <p className="text-xs">请在设置中配置供应商和模型</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* 思考深度弹窗 */}
      <Sheet open={showThinkingDepth} onOpenChange={setShowThinkingDepth}>
        <SheetContent side="bottom" className="p-0">
          <SheetHeader>
            <SheetTitle>思考深度</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 p-3">
            {THINKING_DEPTH_OPTIONS.map((option) => {
              const isActive = currentThinkingDepth === option.value;
              return (
                <motion.button
                  key={option.value}
                  {...springEnter}
                  {...pressableSubtle}
                  onClick={() => {
                    // v0.3.4: enableThinking 从模型配置派生，这里仅设置思考深度
                    setProviderThinkingDepth(apiProviderId, option.value);
                    setShowThinkingDepth(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border/20 bg-card/50 p-3 text-left transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "hover:bg-accent/50",
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                  {isActive && <IconCheck className="size-4 text-primary" />}
                </motion.button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* 加号菜单（文件/图片/拍照） */}
      <Sheet open={showPlusMenu} onOpenChange={setShowPlusMenu}>
        <SheetContent side="bottom" className="p-0">
          <SheetHeader>
            <SheetTitle>添加附件</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 p-4">
            <motion.button
              {...springEnter}
              {...pressable}
              onClick={() => {
                // TODO: 实现文件选择
                setShowPlusMenu(false);
                toast.info("文件上传功能开发中");
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/20 bg-card/50 p-4 transition-colors hover:bg-accent/50"
            >
              <IconFile className="size-6 text-muted-foreground" />
              <span className="text-xs">文件</span>
            </motion.button>
            <motion.button
              {...springEnter}
              {...pressable}
              onClick={() => {
                // TODO: 实现图片选择
                setShowPlusMenu(false);
                toast.info("图片上传功能开发中");
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/20 bg-card/50 p-4 transition-colors hover:bg-accent/50"
            >
              <IconImage className="size-6 text-muted-foreground" />
              <span className="text-xs">图片</span>
            </motion.button>
            <motion.button
              {...springEnter}
              {...pressable}
              onClick={() => {
                // TODO: 实现拍照
                setShowPlusMenu(false);
                toast.info("拍照功能开发中");
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/20 bg-card/50 p-4 transition-colors hover:bg-accent/50"
            >
              <IconCamera className="size-6 text-muted-foreground" />
              <span className="text-xs">拍照</span>
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

