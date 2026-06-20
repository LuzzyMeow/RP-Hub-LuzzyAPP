/**
 * LUZZY Token 使用统计行组件
 *
 * v0.3.0 新增：
 * - 在 Agent 消息气泡下方展示 token 统计信息
 * - 生成中：实时显示输出 tokens、tok/s、已用时间
 * - 完成后：显示完整统计（输入、缓存、输出、tok/s、总时间）
 * - 纯展示，无点击交互
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, ArrowDown } from "lucide-react";

import type { TokenUsage } from "~/types/luzzy";
import { cn } from "~/lib/utils";

interface LuzzyTokenUsageBarProps {
  /** Token 使用统计（完成后） */
  usage?: TokenUsage;
  /** 是否正在生成中 */
  isGenerating?: boolean;
  /** 生成中实时数据 */
  liveData?: {
    currentTokens: number;
    tokPerSec: number;
    elapsedMs: number;
  };
}

/** 格式化数字（千分位） */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** 格式化时间（毫秒 → 秒，保留1位小数） */
function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function LuzzyTokenUsageBar({
  usage,
  isGenerating = false,
  liveData,
}: LuzzyTokenUsageBarProps) {
  // 生成中：实时显示
  if (isGenerating && liveData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] leading-tight text-muted-foreground/70"
      >
        <ArrowDown className="size-2.5" />
        <span>{formatNumber(liveData.currentTokens)}</span>
        <span>·</span>
        <span>{liveData.tokPerSec.toFixed(1)} tok/s</span>
        <span>·</span>
        <span>{formatTime(liveData.elapsedMs)}s</span>
        <motion.span
          className="ml-0.5 inline-block size-1 rounded-full bg-primary"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    );
  }

  // 完成后：完整统计
  if (!usage) return null;

  const hasCache = usage.cachedTokens !== undefined && usage.cachedTokens > 0;
  const cacheRate = usage.cacheHitRate ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] leading-tight text-muted-foreground/70"
    >
      {/* 输入 tokens */}
      <ArrowUp className="size-2.5" />
      <span>{formatNumber(usage.promptTokens)}</span>

      {/* 缓存信息（命中率为0时不显示） */}
      {hasCache && cacheRate > 0 && (
        <>
          <span className="text-muted-foreground/50">(</span>
          <span>缓存 {formatNumber(usage.cachedTokens!)}</span>
          <span>·</span>
          <span>{cacheRate.toFixed(1)}%</span>
          <span className="text-muted-foreground/50">)</span>
        </>
      )}

      {/* 输出 tokens */}
      <ArrowDown className="ml-0.5 size-2.5" />
      <span>{formatNumber(usage.completionTokens)}</span>

      <span>·</span>
      <span>{usage.tokPerSec.toFixed(1)} tok/s</span>
      <span>·</span>
      <span>{formatTime(usage.responseTimeMs)}s</span>
    </motion.div>
  );
}
