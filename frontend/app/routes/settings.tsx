/**
 * 设置页面（v0.2.0 重构）
 *
 * 功能：
 * 1. API 连接与服务（合并供应商管理）
 *    - 供应商下拉框（一级入口）+ 新增自定义供应商
 *    - API 地址（内置只读，自定义可编辑）
 *    - API Key（每供应商独立）
 *    - API 类型（openai-compatible / google-gemini / anthropic-messages / openai-responses）
 *    - 流式输出 / 深度思考
 *    - 自定义请求体 JSON（每供应商独立）
 *    - 模型配置（多模型，上下文/输出/视觉/视频/音频/推理）
 * 2. 外观（仅保留浅色/深色/跟随系统，删除配色方案）
 */

import * as React from "react";
import type { Route } from "./+types/settings";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconKey,
  IconToolKit,
  IconClose,
  IconSave,
  IconImage,
  IconVideo,
  IconMusic,
  IconWand,
  IconBook,
  IconRestore,
  IconRefresh,
  IconGrid,
  IconText,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { DEFAULT_TRANSLATION_SETTINGS } from "~/stores/slices/settings-slice";
import type { ApiProvider, ApiType, ModelConfig } from "~/types/luzzy";
import { logger } from "~/services/logger";
import { cn } from "~/lib/utils";
import { useTheme } from "~/components/theme-provider";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Slider } from "~/components/ui/slider";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
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
  springEnter,
  pressableSubtle,
  pressable,
  fadeSlide,
} from "~/lib/motion-presets";
import { toast } from "sonner";
import { useConfirm } from "~/components/luzzy/luzzy-confirm";

export function meta(_: Route.MetaArgs) {
  return [{ title: "设置 - LUZZY" }];
}

/** API 类型显示名 */
const API_TYPE_LABELS: Record<ApiType, string> = {
  "openai-compatible": "OpenAI 兼容",
  "google-gemini": "Google Gemini",
  "anthropic-messages": "Anthropic Messages",
  "openai-responses": "OpenAI Responses",
};

/** 高亮颜色预设（v0.3.7） */
const HIGHLIGHT_COLOR_PRESETS = [
  { name: "主题紫", value: "oklch(0.65 0.2 280)" },
  { name: "暖橙", value: "oklch(0.7 0.15 60)" },
  { name: "翠绿", value: "oklch(0.7 0.15 150)" },
  { name: "玫红", value: "oklch(0.65 0.2 10)" },
  { name: "青蓝", value: "oklch(0.7 0.15 220)" },
  { name: "琥珀", value: "oklch(0.75 0.15 90)" },
];

/** 解析长度字符串（支持 1000000 / 1000k / 1000K / 1m / 1M） */
function parseLength(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d+)\s*([kKmM]?)$/);
  if (!match) return undefined;
  const num = parseInt(match[1], 10);
  if (isNaN(num)) return undefined;
  const unit = match[2].toLowerCase();
  if (unit === "k") return num * 1000;
  if (unit === "m") return num * 1000000;
  return num;
}

/** 格式化长度为显示字符串 */
function formatLength(length?: number): string {
  if (!length || length <= 0) return "";
  if (length >= 1000000 && length % 1000000 === 0)
    return `${length / 1000000}M`;
  if (length >= 1000 && length % 1000 === 0) return `${length / 1000}K`;
  return String(length);
}

export default function SettingsPage() {
  // Store 数据
  const apiUrl = useAppStore((s) => s.apiUrl);
  const apiKey = useAppStore((s) => s.apiKey);
  const stream = useAppStore((s) => s.stream);
  const customRequestBody = useAppStore((s) => s.customRequestBody);
  const apiProviderId = useAppStore((s) => s.apiProviderId);
  const customApiProviders = useAppStore((s) => s.customApiProviders);
  const apiProviderKeys = useAppStore((s) => s.apiProviderKeys);

  // Store actions
  const setApiUrl = useAppStore((s) => s.setApiUrl);
  const setStream = useAppStore((s) => s.setStream);
  const setCustomRequestBody = useAppStore((s) => s.setCustomRequestBody);
  const validateCustomRequestBody = useAppStore(
    (s) => s.validateCustomRequestBody,
  );
  const selectApiProvider = useAppStore((s) => s.selectApiProvider);
  const addCustomProvider = useAppStore((s) => s.addCustomProvider);
  const removeCustomProvider = useAppStore((s) => s.removeCustomProvider);
  const setProviderKey = useAppStore((s) => s.setProviderKey);
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const setProviderApiUrl = useAppStore((s) => s.setProviderApiUrl);
  const setProviderApiType = useAppStore((s) => s.setProviderApiType);
  const addModelToProvider = useAppStore((s) => s.addModelToProvider);
  const removeModelFromProvider = useAppStore((s) => s.removeModelFromProvider);
  const updateModelConfig = useAppStore((s) => s.updateModelConfig);

  // 主题（仅外观模式）
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();

  // v0.3.3: 翻译设置
  const translationSettings = useAppStore((s) => s.translationSettings);
  const setTranslationSettings = useAppStore((s) => s.setTranslationSettings);
  // v0.3.7: 高亮显示设置
  const highlightSettings = useAppStore((s) => s.highlightSettings);
  const setHighlightSettings = useAppStore((s) => s.setHighlightSettings);
  const [translatingSaving, setTranslatingSaving] = React.useState(false);
  // 本地编辑态（提示词模板），保存时才写入 store
  const [promptDraft, setPromptDraft] = React.useState(
    translationSettings.promptTemplate,
  );
  // 同步外部变更（如加载持久化数据后）
  React.useEffect(() => {
    setPromptDraft(translationSettings.promptTemplate);
  }, [translationSettings.promptTemplate]);

  // v0.3.6 C5: 自定义语言模式状态（与 customLanguage 解耦）
  // 初始值从 customLanguage 推导：有值则为自定义模式
  const [isCustomMode, setIsCustomMode] = React.useState(
    Boolean(translationSettings.customLanguage?.trim()),
  );
  // v0.3.6 C6: 自定义语言输入弹窗
  const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
  const [customLanguageDraft, setCustomLanguageDraft] = React.useState(
    translationSettings.customLanguage || "",
  );

  // 新增供应商弹窗
  const [newProvider, setNewProvider] = React.useState<ApiProvider | null>(
    null,
  );
  // 编辑模型弹窗
  const [editingModel, setEditingModel] = React.useState<{
    providerId: string;
    model: ModelConfig;
    isNew: boolean;
  } | null>(null);

  const allProviders = getAllProviders();
  const currentProvider = allProviders.find((p) => p.id === apiProviderId);
  const isCurrentBuiltin = currentProvider?.isBuiltin ?? true;
  const currentModels = currentProvider?.models ?? [];

  /** 校验并保存自定义请求体 */
  const handleValidateCustomBody = React.useCallback(() => {
    const result = validateCustomRequestBody();
    if (result.valid) {
      toast.success("自定义请求体格式正确");
    } else {
      toast.error("请求体格式错误：" + result.error);
    }
  }, [validateCustomRequestBody]);

  /** 新增自定义供应商 */
  const handleAddProvider = React.useCallback(async () => {
    if (!newProvider) return;
    if (
      !newProvider.id.trim() ||
      !newProvider.name.trim() ||
      !newProvider.apiUrl.trim()
    ) {
      toast.warning("请填写完整供应商信息");
      return;
    }
    try {
      await addCustomProvider({
        id: newProvider.id,
        name: newProvider.name,
        displayName: newProvider.displayName || newProvider.name,
        apiUrl: newProvider.apiUrl,
        isBuiltin: false,
        apiType: "openai-compatible",
      });
      setNewProvider(null);
      toast.success("供应商已添加");
    } catch (e) {
      toast.error("添加失败：" + (e as Error).message);
    }
  }, [newProvider, addCustomProvider]);

  /** 处理 API 地址变更 */
  const handleApiUrlChange = React.useCallback(
    (value: string) => {
      if (isCurrentBuiltin) {
        // 内置供应商：更新全局 apiUrl（切换时会覆盖）
        setApiUrl(value);
      } else {
        // 自定义供应商：更新供应商 apiUrl 和全局 apiUrl
        setProviderApiUrl(apiProviderId, value);
      }
    },
    [isCurrentBuiltin, apiProviderId, setApiUrl, setProviderApiUrl],
  );

  /** 处理 API 类型变更 */
  const handleApiTypeChange = React.useCallback(
    (value: ApiType) => {
      if (!isCurrentBuiltin) {
        setProviderApiType(apiProviderId, value);
      }
    },
    [isCurrentBuiltin, apiProviderId, setProviderApiType],
  );

  /** 新建模型 */
  const handleNewModel = React.useCallback(() => {
    if (!currentProvider) return;
    setEditingModel({
      providerId: apiProviderId,
      model: {
        id: crypto.randomUUID(),
        name: "",
        contextLength: undefined,
        outputLength: undefined,
        supportsVision: false,
        supportsVideo: false,
        supportsAudio: false,
        supportsReasoning: false,
        supportsEmbedding: false,
      },
      isNew: true,
    });
  }, [currentProvider, apiProviderId]);

  /** 编辑模型 */
  const handleEditModel = React.useCallback(
    (model: ModelConfig) => {
      setEditingModel({
        providerId: apiProviderId,
        model: { ...model },
        isNew: false,
      });
    },
    [apiProviderId],
  );

  /** 保存模型 */
  const handleSaveModel = React.useCallback(() => {
    if (!editingModel) return;
    // v0.3.5: 验证 modelId（若未设置则回退到 name）
    const modelIdValue = editingModel.model.modelId ?? editingModel.model.name;
    if (!modelIdValue.trim()) {
      toast.warning("请输入模型 ID");
      return;
    }
    const { providerId, model, isNew } = editingModel;
    if (isNew) {
      addModelToProvider(providerId, model);
      toast.success("模型已添加");
    } else {
      updateModelConfig(providerId, model.id, model);
      toast.success("模型已更新");
    }
    setEditingModel(null);
  }, [editingModel, addModelToProvider, updateModelConfig]);

  /** 删除模型 */
  const handleDeleteModel = React.useCallback(
    async (modelId: string, modelName: string) => {
      const ok = await confirm({
        title: "删除模型",
        description: `确定删除模型「${modelName}」吗？`,
        destructive: true,
      });
      if (!ok) return;
      removeModelFromProvider(apiProviderId, modelId);
      toast.success("模型已删除");
    },
    [apiProviderId, removeModelFromProvider, confirm],
  );

  /** 删除供应商 */
  const handleRemoveProvider = React.useCallback(
    async (id: string, name: string) => {
      const ok = await confirm({
        title: "删除供应商",
        description: `删除供应商「${name}」？相关配置将丢失。`,
        destructive: true,
      });
      if (!ok) return;
      void removeCustomProvider(id);
      toast.success("已删除");
    },
    [removeCustomProvider, confirm],
  );

  // ===== v0.3.3: 翻译设置处理 =====

  /** 主流语言快速选项 */
  const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
    { value: "简体中文", label: "简体中文" },
    { value: "繁體中文", label: "繁體中文" },
    { value: "English", label: "English" },
    { value: "日本語", label: "日本語" },
    { value: "한국어", label: "한국어" },
    { value: "Français", label: "Français" },
    { value: "Deutsch", label: "Deutsch" },
    { value: "Español", label: "Español" },
    { value: "Русский", label: "Русский" },
    { value: "Português", label: "Português" },
    { value: "Italiano", label: "Italiano" },
    { value: "العربية", label: "العربية" },
  ];

  /** 当前语言选择值：v0.3.6 改用 isCustomMode 状态判断 */
  const currentLanguageValue = isCustomMode
    ? "__custom__"
    : translationSettings.targetLanguage;

  /** 切换语言快速选项（v0.3.6 重构：使用 isCustomMode 状态） */
  const handleLanguageChange = React.useCallback(
    (value: string) => {
      if (value === "__custom__") {
        // 进入自定义模式：打开弹窗让用户输入
        setCustomLanguageDraft(translationSettings.customLanguage || "");
        setCustomDialogOpen(true);
      } else {
        // 选择预设语言：退出自定义模式，清空 customLanguage，设置 targetLanguage
        setIsCustomMode(false);
        setTranslationSettings({
          targetLanguage: value,
          customLanguage: "",
        });
      }
    },
    [setTranslationSettings, translationSettings.customLanguage],
  );

  /** v0.3.6 C6: 确认自定义语言 */
  const handleConfirmCustomLanguage = React.useCallback(() => {
    const trimmed = customLanguageDraft.trim();
    if (!trimmed) {
      toast.warning("请输入目标语言名称");
      return;
    }
    setIsCustomMode(true);
    setTranslationSettings({ customLanguage: trimmed });
    setCustomDialogOpen(false);
  }, [customLanguageDraft, setTranslationSettings]);

  /** v0.3.6 C6: 退出自定义模式 */
  const handleExitCustomMode = React.useCallback(() => {
    setIsCustomMode(false);
    setTranslationSettings({ customLanguage: "" });
  }, [setTranslationSettings]);

  /** 保存翻译提示词（带动画） */
  const handleSaveTranslationPrompt = React.useCallback(async () => {
    setTranslatingSaving(true);
    try {
      // 模拟微延迟以展示动画
      await new Promise((r) => setTimeout(r, 300));
      const trimmed = promptDraft.trim();
      if (!trimmed) {
        toast.warning("提示词不能为空，已恢复为默认提示词");
        setPromptDraft(DEFAULT_TRANSLATION_SETTINGS.promptTemplate);
        setTranslationSettings({
          promptTemplate: DEFAULT_TRANSLATION_SETTINGS.promptTemplate,
        });
        return;
      }
      // 校验占位符
      if (!trimmed.includes("{message}") || !trimmed.includes("{language}")) {
        toast.warning("提示词必须包含 {message} 和 {language} 占位符");
        return;
      }
      setTranslationSettings({ promptTemplate: trimmed });
      toast.success("翻译提示词已保存");
    } finally {
      setTranslatingSaving(false);
    }
  }, [promptDraft, setTranslationSettings]);

  /** 恢复默认提示词 */
  const handleResetPrompt = React.useCallback(() => {
    setPromptDraft(DEFAULT_TRANSLATION_SETTINGS.promptTemplate);
    setTranslationSettings({
      promptTemplate: DEFAULT_TRANSLATION_SETTINGS.promptTemplate,
    });
    toast.success("已恢复默认提示词");
  }, [setTranslationSettings]);

  return (
    <LuzzyLayout title="设置">
      <ScrollArea className="h-full w-full">
        <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-4 pb-8">
          {/* API 连接与服务（合并供应商管理） */}
          <motion.div {...springEnter} className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconKey className="size-4" />
                  API 连接与服务
                </CardTitle>
                <CardDescription>
                  配置 AI 接口的连接参数与供应商
                </CardDescription>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                {/* 供应商选择（一级入口） */}
                <div className="grid min-w-0 gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">供应商</label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setNewProvider({
                          id: "",
                          name: "",
                          apiUrl: "",
                          isBuiltin: false,
                          apiType: "openai-compatible",
                        })
                      }
                      {...pressableSubtle}
                    >
                      <IconPlus className="mr-1 size-4" />
                      新增
                    </Button>
                  </div>
                  <Select
                    value={apiProviderId}
                    onValueChange={(id) => {
                      const p = allProviders.find((x) => x.id === id);
                      if (p) {
                        logger.info("user", `切换供应商: ${p.displayName ?? p.name}`);
                        selectApiProvider(p);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.displayName ?? p.name}
                          {p.isBuiltin && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-xs"
                            >
                              内置
                            </Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 二级内容：选择供应商后显示 */}
                {currentProvider && (
                  <motion.div
                    {...fadeSlide}
                    className="grid min-w-0 gap-4 rounded-lg border p-3"
                  >
                    {/* API 地址 */}
                    <div className="grid min-w-0 gap-2">
                      <label className="text-sm font-medium">
                        API 地址
                        {isCurrentBuiltin && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            （内置供应商，可覆盖）
                          </span>
                        )}
                      </label>
                      <Input
                        value={apiUrl}
                        onChange={(e) => handleApiUrlChange(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="max-w-full font-mono text-xs"
                        maxLength={500}
                      />
                    </div>

                    {/* API Key */}
                    <div className="grid min-w-0 gap-2">
                      <label className="text-sm font-medium">API Key</label>
                      <Input
                        type="password"
                        value={apiProviderKeys[apiProviderId] ?? apiKey}
                        onChange={(e) =>
                          setProviderKey(apiProviderId, e.target.value)
                        }
                        onBlur={() => {
                          logger.info("user", `保存 API Key（供应商: ${apiProviderId}）`);
                        }}
                        placeholder="sk-..."
                        className="max-w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        每个供应商可独立配置 API Key
                      </p>
                    </div>

                    {/* API 类型 */}
                    <div className="grid min-w-0 gap-2">
                      <label className="text-sm font-medium">
                        API 类型
                        {isCurrentBuiltin && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            （内置供应商不可修改）
                          </span>
                        )}
                      </label>
                      <Select
                        value={
                          currentProvider.apiType ?? "openai-compatible"
                        }
                        onValueChange={(v) =>
                          handleApiTypeChange(v as ApiType)
                        }
                        disabled={isCurrentBuiltin}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(API_TYPE_LABELS) as ApiType[]
                          ).map((t) => (
                            <SelectItem key={t} value={t}>
                              {API_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 流式输出 */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">流式输出</label>
                      <Switch checked={stream} onCheckedChange={setStream} />
                    </div>

                    {/* 自定义请求体 JSON */}
                    <div className="grid min-w-0 gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          自定义请求体 JSON
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleValidateCustomBody}
                        >
                          <IconCheck className="mr-1 size-4" />
                          校验
                        </Button>
                      </div>
                      <Textarea
                        value={customRequestBody}
                        onChange={(e) => setCustomRequestBody(e.target.value)}
                        placeholder='{"thinking": {"type": "enabled"}, "reasoning_effort": "high"}'
                        rows={4}
                        className="max-w-full font-mono text-xs break-all"
                      />
                      <p className="text-xs text-muted-foreground">
                        每供应商独立设置。仅可设置 thinking /
                        reasoning_effort / 自定义字段，messages 数组不可修改
                      </p>
                    </div>

                    {/* 模型配置 */}
                    <div className="grid min-w-0 gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          模型配置
                          {currentModels.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-xs"
                            >
                              {currentModels.length}
                            </Badge>
                          )}
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleNewModel}
                        >
                          <IconPlus className="mr-1 size-4" />
                          添加模型
                        </Button>
                      </div>
                      {currentModels.length > 0 && (
                        <div className="min-w-0 space-y-1">
                          <AnimatePresence mode="popLayout">
                            {currentModels.map((m) => (
                              <motion.div
                                key={m.id}
                                layout
                                {...fadeSlide}
                                className="group flex min-w-0 items-center gap-2 rounded-md border px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="min-w-0 truncate text-sm font-medium">
                                      {m.displayName ?? m.name}
                                    </span>
                                    <div className="flex shrink-0 gap-1">
                                      {m.supportsVision && (
                                        <IconImage
                                          className="size-3 text-primary"
                                          aria-label="视觉"
                                        />
                                      )}
                                      {m.supportsVideo && (
                                        <IconVideo
                                          className="size-3 text-primary"
                                          aria-label="视频"
                                        />
                                      )}
                                      {m.supportsAudio && (
                                        <IconMusic
                                          className="size-3 text-primary"
                                          aria-label="音频"
                                        />
                                      )}
                                      {m.supportsReasoning && (
                                        <IconWand
                                          className="size-3 text-primary"
                                          aria-label="推理"
                                        />
                                      )}
                                      {m.supportsEmbedding && (
                                        <IconGrid
                                          className="size-3 text-primary"
                                          aria-label="嵌入"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                    {m.contextLength && (
                                      <span className="min-w-0 truncate">
                                        上下文: {formatLength(m.contextLength)}
                                      </span>
                                    )}
                                    {m.outputLength && (
                                      <span className="min-w-0 truncate">
                                        输出: {formatLength(m.outputLength)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleEditModel(m)}
                                    title="编辑"
                                    {...pressableSubtle}
                                  >
                                    <IconToolKit className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-destructive"
                                    onClick={() =>
                                      handleDeleteModel(m.id, m.name)
                                    }
                                    title="删除"
                                    {...pressableSubtle}
                                  >
                                    <IconTrash className="size-4" />
                                  </Button>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* 自定义供应商列表 */}
                {customApiProviders.length > 0 && (
                  <div className="grid min-w-0 gap-2">
                    <label className="text-sm font-medium">
                      自定义供应商
                    </label>
                    <div className="min-w-0 space-y-1">
                      {customApiProviders.map((p) => (
                        <div
                          key={p.id}
                          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-medium">
                              {p.displayName ?? p.name}
                            </span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {p.apiUrl}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => handleRemoveProvider(p.id, p.name)}
                            title="删除"
                            {...pressableSubtle}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* 外观（精简：仅保留外观模式） */}
          <motion.div {...fadeSlide} className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconToolKit className="size-4" />
                  外观
                </CardTitle>
                <CardDescription>浅色 / 深色 / 跟随系统</CardDescription>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">外观模式</label>
                  <ToggleGroup
                    type="single"
                    value={theme}
                    onValueChange={(v) =>
                      v && setTheme(v as "light" | "dark" | "system")
                    }
                    variant="outline"
                    className="flex flex-wrap"
                  >
                    <ToggleGroupItem value="light">浅色</ToggleGroupItem>
                    <ToggleGroupItem value="dark">深色</ToggleGroupItem>
                    <ToggleGroupItem value="system">跟随系统</ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    跟随系统模式会自动检测系统深浅色偏好并实时切换
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* v0.3.3: 翻译功能设置 */}
          <motion.div {...fadeSlide} className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconBook className="size-4" />
                  翻译功能
                </CardTitle>
                <CardDescription>
                  配置消息翻译的目标语言与助手提示词
                </CardDescription>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                {/* 启用开关 */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">启用翻译功能</label>
                  <Switch
                    checked={translationSettings.enabled}
                    onCheckedChange={(v) =>
                      setTranslationSettings({ enabled: v })
                    }
                  />
                </div>

                <AnimatePresence initial={false}>
                  {translationSettings.enabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="grid min-w-0 gap-4 overflow-hidden"
                    >
                      {/* 目标语言快速选项 */}
                      <div className="grid min-w-0 gap-2">
                        <label className="text-sm font-medium">
                          目标语言
                          <span className="ml-2 text-xs text-muted-foreground">
                            点击选择主流语言，或点击「+ 自定义」
                          </span>
                        </label>

                        {/* v0.3.6 C6: 自定义模式激活时显示当前自定义语言 + 删除按钮 */}
                        {isCustomMode && translationSettings.customLanguage?.trim() && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex min-w-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs"
                          >
                            <IconCheck className="size-3 shrink-0 text-primary" />
                            <span className="min-w-0 truncate font-medium text-primary">
                              {translationSettings.customLanguage}
                            </span>
                            <button
                              type="button"
                              onClick={handleExitCustomMode}
                              className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                              aria-label="移除自定义语言"
                            >
                              <IconClose className="size-3" />
                            </button>
                          </motion.div>
                        )}

                        {/* v0.3.6 C6: 药丸形状语言按钮 + 独立自定义按钮 */}
                        <div className="flex flex-wrap gap-2">
                          {LANGUAGE_OPTIONS.map((opt) => {
                            const isSelected =
                              !isCustomMode &&
                              currentLanguageValue === opt.value;
                            return (
                              <motion.button
                                key={opt.value}
                                type="button"
                                {...pressableSubtle}
                                onClick={() => handleLanguageChange(opt.value)}
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs transition-all active:scale-95",
                                  isSelected
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                )}
                              >
                                {opt.label}
                              </motion.button>
                            );
                          })}
                          {/* 独立「+ 自定义」按钮（虚线边框区分） */}
                          <motion.button
                            type="button"
                            {...pressableSubtle}
                            onClick={() => handleLanguageChange("__custom__")}
                            className={cn(
                              "rounded-full border border-dashed px-3 py-1 text-xs transition-all active:scale-95",
                              isCustomMode
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                            )}
                          >
                            + 自定义
                          </motion.button>
                        </div>

                        {/* 当前生效语言提示 */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <IconCheck className="size-3 text-primary" />
                          <span>
                            当前生效语言：
                            <span className="font-medium text-foreground">
                              {isCustomMode && translationSettings.customLanguage?.trim()
                                ? translationSettings.customLanguage
                                : translationSettings.targetLanguage || "简体中文"}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* 翻译提示词模板 */}
                      <div className="grid min-w-0 gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">
                            翻译助手提示词
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResetPrompt}
                            {...pressableSubtle}
                          >
                            <IconRestore className="mr-1 size-3.5" />
                            恢复默认
                          </Button>
                        </div>
                        <Textarea
                          value={promptDraft}
                          onChange={(e) => setPromptDraft(e.target.value)}
                          rows={5}
                          className="font-mono text-xs"
                          placeholder="提示词必须包含 {message} 和 {language} 占位符"
                        />
                        <p className="text-xs text-muted-foreground">
                          支持占位符：
                          <code className="mx-1 rounded bg-muted px-1 py-0.5">
                            {"{message}"}
                          </code>
                          （待翻译文本）和
                          <code className="mx-1 rounded bg-muted px-1 py-0.5">
                            {"{language}"}
                          </code>
                          （目标语言）。修改后请点击保存按钮生效。
                        </p>
                        <div className="flex min-w-0 items-center gap-2">
                          <Button
                            onClick={() =>
                              void handleSaveTranslationPrompt()
                            }
                            disabled={translatingSaving}
                            {...pressable}
                          >
                            {translatingSaving ? (
                              <>
                                <IconRefresh className="mr-2 size-4 animate-spin" />
                                保存中...
                              </>
                            ) : (
                              <>
                                <IconSave className="mr-2 size-4" />
                                保存提示词
                              </>
                            )}
                          </Button>
                          {promptDraft !==
                            translationSettings.promptTemplate && (
                            <motion.span
                              initial={{ opacity: 0, x: -5 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="text-xs text-amber-600 dark:text-amber-400"
                            >
                              未保存的修改
                            </motion.span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* v0.3.7: 高亮显示设置 */}
          <motion.div {...fadeSlide} className="min-w-0">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconText className="size-4" />
                  高亮显示
                </CardTitle>
                <CardDescription>
                  高亮显示消息中引号内的文字内容
                </CardDescription>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                {/* 启用开关 */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">启用高亮显示</label>
                  <Switch
                    checked={highlightSettings.enabled}
                    onCheckedChange={(v) => setHighlightSettings({ enabled: v })}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {highlightSettings.enabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="grid min-w-0 gap-4 overflow-hidden"
                    >
                      {/* 颜色预设 */}
                      <div className="grid min-w-0 gap-2">
                        <label className="text-sm font-medium">高亮颜色</label>
                        <div className="flex flex-wrap gap-2">
                          {HIGHLIGHT_COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              onClick={() => setHighlightSettings({ color: preset.value })}
                              className={cn(
                                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all",
                                highlightSettings.color === preset.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:bg-accent",
                              )}
                            >
                              {/* v0.4.1: 统一为圆角方形,颜色填满整个区域 */}
                              <span
                                className="size-4 rounded-md"
                                style={{ backgroundColor: preset.value }}
                              />
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 自定义颜色 */}
                      <div className="grid min-w-0 gap-2">
                        <label className="text-sm font-medium">自定义颜色</label>
                        <div className="flex min-w-0 items-center gap-2">
                          {/* v0.4.1: 用容器包裹 input[type=color],移除浏览器原生留白,颜色填满圆角方形 */}
                          <div
                            className="size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
                            style={{ padding: 0, background: highlightSettings.color }}
                          >
                            <input
                              type="color"
                              value={highlightSettings.color}
                              onChange={(e) => setHighlightSettings({ color: e.target.value })}
                              className="size-full cursor-pointer"
                              style={{
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                              }}
                            />
                          </div>
                          <Input
                            value={highlightSettings.color}
                            onChange={(e) => setHighlightSettings({ color: e.target.value })}
                            placeholder="CSS 颜色值（如 #ff0000、oklch(...)）"
                            className="min-w-0 flex-1"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </ScrollArea>

      {/* v0.3.6 C6: 自定义语言输入弹窗 */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-xs">
          <DialogHeader>
            <DialogTitle>自定义目标语言</DialogTitle>
            <DialogDescription>
              输入目标语言名称（如：Thai、Vietnamese、French (France)）
            </DialogDescription>
          </DialogHeader>
          <Input
            value={customLanguageDraft}
            onChange={(e) => setCustomLanguageDraft(e.target.value)}
            placeholder="请输入目标语言名称"
            maxLength={40}
            className="max-w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirmCustomLanguage();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleConfirmCustomLanguage}>
              <IconCheck className="mr-2 size-4" />
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增供应商弹窗 */}
      <Dialog
        open={!!newProvider}
        onOpenChange={(o) => !o && setNewProvider(null)}
      >
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-sm">
          <DialogHeader>
            <DialogTitle>新增自定义供应商</DialogTitle>
            <DialogDescription>
              配置自定义 API 供应商，ID 仅支持英文字母
            </DialogDescription>
          </DialogHeader>
          {newProvider && (
            <div className="grid gap-4 py-2">
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">
                  ID（唯一标识，仅英文字母）
                </label>
                <Input
                  value={newProvider.id}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, id: e.target.value })
                  }
                  placeholder="myProvider"
                />
                <p className="text-xs text-muted-foreground">
                  仅支持英文字母，不支持特殊字符
                </p>
              </div>
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">显示名称</label>
                <Input
                  value={newProvider.displayName ?? newProvider.name}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, displayName: e.target.value.slice(0, 20), name: e.target.value.slice(0, 20) })
                  }
                  placeholder="供应商显示名称（最大 20 字符）"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  前端展示用名称，支持自由取名（最大 20 字符）
                </p>
              </div>
              <div className="grid min-w-0 gap-2">
                <label className="text-sm font-medium">API 地址</label>
                <Input
                  value={newProvider.apiUrl}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, apiUrl: e.target.value })
                  }
                  placeholder="https://api.example.com/v1"
                  className="max-w-full break-all font-mono text-xs"
                  maxLength={500}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProvider(null)}>
              <IconClose className="mr-2 size-4" />
              取消
            </Button>
            <Button onClick={() => void handleAddProvider()}>
              <IconSave className="mr-2 size-4" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑/新建模型弹窗 */}
      <Dialog
        open={!!editingModel}
        onOpenChange={(o) => !o && setEditingModel(null)}
      >
        <DialogContent className="max-h-[90vh] min-w-0 overflow-hidden max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingModel?.isNew ? "添加模型" : "编辑模型"}
            </DialogTitle>
            <DialogDescription>
              配置模型名称与能力，长度支持 1000000 / 1000k / 1m 格式
            </DialogDescription>
          </DialogHeader>
          {editingModel && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="grid gap-4 py-2">
                {/* v0.3.5: 模型 ID（实际请求时的 model name） */}
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">模型 ID</label>
                  <Input
                    value={editingModel.model.modelId ?? editingModel.model.name}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        model: {
                          ...editingModel.model,
                          modelId: e.target.value,
                          name: e.target.value, // 同步 name 以保持兼容
                        },
                      })
                    }
                    placeholder="deepseek-v4-pro"
                    className="max-w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    实际请求 API 时使用的模型名称
                  </p>
                </div>

                {/* v0.3.5: 显示名称（仅前端显示） */}
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">显示名称（可选）</label>
                  <Input
                  value={editingModel.model.displayName ?? ""}
                  onChange={(e) =>
                    setEditingModel({
                      ...editingModel,
                      model: {
                        ...editingModel.model,
                        displayName: e.target.value,
                      },
                    })
                  }
                  placeholder="DeepSeek V4 Pro"
                  className="max-w-full"
                />
                  <p className="text-xs text-muted-foreground">
                    仅用于前端显示，留空则使用模型 ID
                  </p>
                </div>

                {/* 上下文长度 */}
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">
                    上下文长度（可选）
                  </label>
                  <Input
                  value={formatLength(editingModel.model.contextLength)}
                  onChange={(e) => {
                    const parsed = parseLength(e.target.value);
                    setEditingModel({
                      ...editingModel,
                      model: {
                        ...editingModel.model,
                        contextLength: parsed,
                      },
                    });
                  }}
                  placeholder="128000 / 128k / 1m"
                  className="max-w-full"
                />
                  <p className="text-xs text-muted-foreground">
                    支持数字（1000000）或数字+单位（1000k / 1m）
                  </p>
                </div>

                {/* 输出长度 */}
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">
                    输出长度（可选）
                  </label>
                  <Input
                  value={formatLength(editingModel.model.outputLength)}
                  onChange={(e) => {
                    const parsed = parseLength(e.target.value);
                    setEditingModel({
                      ...editingModel,
                      model: {
                        ...editingModel.model,
                        outputLength: parsed,
                      },
                    });
                  }}
                  placeholder="4096 / 4k"
                  className="max-w-full"
                />
                </div>

                {/* 历史消息数限制 */}
                <div className="grid min-w-0 gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      历史消息数限制
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      className="h-8 w-20 text-right"
                      value={editingModel.model.historyMessageLimit ?? 0}
                      onChange={(e) => {
                        const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                        setEditingModel({
                          ...editingModel,
                          model: {
                            ...editingModel.model,
                            historyMessageLimit: v,
                          },
                        });
                      }}
                    />
                  </div>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[Math.min(editingModel.model.historyMessageLimit ?? 0, 200)]}
                    onValueChange={(vals) => {
                      const sliderVal = vals[0] ?? 0;
                      // 当拖动到 200 时，不强制覆盖大于 200 的已有值（除非当前值 < 200）
                      const current = editingModel.model.historyMessageLimit ?? 0;
                      const next = current > 200 && sliderVal === 200 ? current : sliderVal;
                      setEditingModel({
                        ...editingModel,
                        model: {
                          ...editingModel.model,
                          historyMessageLimit: next,
                        },
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    仅发送最后的 X 条历史消息注入上下文。0 = 不限制。每条历史消息包括 user 消息 + 工具调用结果 + 思考链 + 模型回复
                  </p>
                </div>

                {/* 能力开关 */}
                <div className="grid min-w-0 gap-2">
                  <label className="text-sm font-medium">模型能力</label>
                  <div className="grid min-w-0 gap-2">
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <IconImage className="size-4 text-primary" />
                        <span className="text-sm">视觉</span>
                      </div>
                      <Switch
                        checked={!!editingModel.model.supportsVision}
                        onCheckedChange={(v) =>
                          setEditingModel({
                            ...editingModel,
                            model: {
                              ...editingModel.model,
                              supportsVision: v,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <IconVideo className="size-4 text-primary" />
                        <span className="text-sm">视频</span>
                      </div>
                      <Switch
                        checked={!!editingModel.model.supportsVideo}
                        onCheckedChange={(v) =>
                          setEditingModel({
                            ...editingModel,
                            model: {
                              ...editingModel.model,
                              supportsVideo: v,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <IconMusic className="size-4 text-primary" />
                        <span className="text-sm">音频</span>
                      </div>
                      <Switch
                        checked={!!editingModel.model.supportsAudio}
                        onCheckedChange={(v) =>
                          setEditingModel({
                            ...editingModel,
                            model: {
                              ...editingModel.model,
                              supportsAudio: v,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <IconWand className="size-4 text-primary" />
                        <span className="text-sm">推理</span>
                      </div>
                      <Switch
                        checked={!!editingModel.model.supportsReasoning}
                        onCheckedChange={(v) =>
                          setEditingModel({
                            ...editingModel,
                            model: {
                              ...editingModel.model,
                              supportsReasoning: v,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <IconGrid className="size-4 text-primary" />
                        <span className="text-sm">嵌入</span>
                      </div>
                      <Switch
                        checked={!!editingModel.model.supportsEmbedding}
                        onCheckedChange={(v) =>
                          setEditingModel({
                            ...editingModel,
                            model: {
                              ...editingModel.model,
                              supportsEmbedding: v,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              <IconClose className="mr-2 size-4" />
              取消
            </Button>
            <Button onClick={handleSaveModel}>
              <IconSave className="mr-2 size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LuzzyLayout>
  );
}
