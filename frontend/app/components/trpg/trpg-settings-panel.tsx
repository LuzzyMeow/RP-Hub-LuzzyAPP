/**
 * TRPG 设置面板
 *
 * 功能：
 * - TRPG 专用模型选择器（独立于自由聊天模式）
 * - 默认跟随全局默认模型
 *
 * 动画：fadeSlide 渐入
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion } from "motion/react";
import { IconSettings, IconChevronRight, IconInfo } from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { springSoft } from "~/lib/motion-presets";
import { logger } from "~/services/logger";

// ============================================================================
// 主组件
// ============================================================================

export function TrpgSettingsPanel() {
  const trpgModel = useAppStore((s) => s.trpgModel);
  const setTrpgModel = useAppStore((s) => s.setTrpgModel);
  const getAllProviders = useAppStore((s) => s.getAllProviders);
  const apiProviderId = useAppStore((s) => s.apiProviderId);
  const modelName = useAppStore((s) => s.modelName);
  const customApiProviders = useAppStore((s) => s.customApiProviders);
  const builtinThinkingDepthOverrides = useAppStore((s) => s.builtinThinkingDepthOverrides);

  // 获取所有供应商
  const allProviders = React.useMemo(
    () => getAllProviders(),
    [getAllProviders, customApiProviders, builtinThinkingDepthOverrides],
  );

  // 全局默认模型显示名
  const globalDefaultLabel = React.useMemo(() => {
    if (!modelName) return "跟随全局默认";
    const parts = modelName.split("_");
    const providerId = parts.length > 1 ? parts[0] : apiProviderId;
    const actualName = parts.length > 1 ? parts.slice(1).join("_") : modelName;
    const provider = allProviders.find((p) => p.id === providerId);
    const model = provider?.models?.find((m) => m.name === actualName);
    const providerName = provider?.displayName || provider?.name || providerId;
    const modelDisplay = model?.displayName || model?.modelId || actualName;
    return `${providerName} / ${modelDisplay}`;
  }, [modelName, apiProviderId, allProviders]);

  // 当前选中的 TRPG 模型显示名
  const currentModelLabel = React.useMemo(() => {
    if (!trpgModel) return globalDefaultLabel;
    const parts = trpgModel.split("_");
    const providerId = parts.length > 1 ? parts[0] : "";
    const actualName = parts.length > 1 ? parts.slice(1).join("_") : trpgModel;
    const provider = allProviders.find((p) => p.id === providerId);
    const model = provider?.models?.find((m) => m.name === actualName);
    const providerName = provider?.displayName || provider?.name || providerId;
    const modelDisplay = model?.displayName || model?.modelId || actualName;
    return `${providerName} / ${modelDisplay}`;
  }, [trpgModel, allProviders, globalDefaultLabel]);

  // 选择模型
  const handleSelect = React.useCallback(
    (value: string) => {
      // value 为 "__default__" 时表示跟随全局
      const modelKey = value === "__default__" ? "" : value;
      setTrpgModel(modelKey);
      logger.info("trpg", `TRPG 模型已设置为: ${modelKey || "跟随全局"}`);
    },
    [setTrpgModel],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="space-y-4 p-4"
    >
      {/* 标题 */}
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <IconSettings className="size-4 text-primary" />
        <span>TRPG 模型配置</span>
      </div>

      {/* 模型选择器 */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">专用模型</label>
        <Select value={trpgModel || "__default__"} onValueChange={handleSelect}>
          <SelectTrigger className="w-full" size="sm">
            <SelectValue>
              {trpgModel ? currentModelLabel : `跟随全局（${globalDefaultLabel}）`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* 跟随全局默认 */}
            <SelectGroup>
              <SelectLabel>默认</SelectLabel>
              <SelectItem value="__default__">跟随全局默认（{globalDefaultLabel}）</SelectItem>
            </SelectGroup>

            {/* 各供应商模型 */}
            {allProviders.map((provider) => (
              <SelectGroup key={provider.id}>
                <SelectLabel>{provider.displayName || provider.name}</SelectLabel>
                {provider.models?.map((model) => (
                  <SelectItem
                    key={`${provider.id}_${model.name}`}
                    value={`${provider.id}_${model.name}`}
                  >
                    {model.displayName || model.modelId || model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 说明 */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSoft, delay: 0.1 }}
        className="flex items-start gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5"
      >
        <IconInfo className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>TRPG 模式使用独立的模型配置，不与自由聊天模式共享。</p>
          <p className="flex items-center gap-1">
            <IconChevronRight className="size-3" />
            选择「跟随全局默认」将使用聊天模式的当前模型
          </p>
          <p className="flex items-center gap-1">
            <IconChevronRight className="size-3" />
            建议选择支持工具调用的模型以获得最佳体验
          </p>
        </div>
      </motion.div>

      {/* 当前配置预览 */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSoft, delay: 0.15 }}
        className="rounded-md border border-border/20 bg-muted/10 p-2.5"
      >
        <p className="text-[10px] text-muted-foreground">当前使用</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{currentModelLabel}</p>
      </motion.div>
    </motion.div>
  );
}
