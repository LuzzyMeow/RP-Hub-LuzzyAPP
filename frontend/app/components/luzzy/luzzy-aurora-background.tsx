/**
 * LUZZY 极光背景动画组件
 *
 * 渲染 3 个缓慢漂移的渐变光晕（aurora blobs），营造柔和、有呼吸感的氛围背景。
 * 适用于关于页等需要氛围感的场景。
 *
 * - 3 个独立光晕，各自不同颜色 / 路径 / 时长（15s / 20s / 25s）
 * - 浅色主题：柔和蓝 / 紫 / 粉（低透明度 0.10–0.15）
 * - 深色主题：深邃靛蓝 / 紫 / 品红（透明度 0.08–0.12）
 * - 自动适配 prefers-reduced-motion：降级为静态光晕，避免动效眩晕
 * - pointer-events-none + z-0，始终置于内容之下
 */

import { motion, useReducedMotion } from "motion/react";

import { cn } from "~/lib/utils";

interface LuzzyAuroraBackgroundProps {
  className?: string;
}

export function LuzzyAuroraBackground({ className }: LuzzyAuroraBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
    >
      {/* 光晕 1：蓝 → 靛蓝，左上漂移（20s） */}
      <motion.div
        className="absolute -left-1/4 -top-1/4 size-[500px] rounded-full bg-blue-400/15 blur-3xl dark:bg-indigo-500/10"
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 100, 0], y: [0, 80, 0], scale: [1, 1.1, 1] }
        }
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 光晕 2：紫 → 深紫，右上漂移（25s） */}
      <motion.div
        className="absolute -right-1/4 top-1/3 size-[450px] rounded-full bg-purple-400/10 blur-3xl dark:bg-purple-600/10"
        animate={
          reduceMotion
            ? undefined
            : { x: [0, -80, 0], y: [0, 100, 0], scale: [1, 1.15, 1] }
        }
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 光晕 3：粉 → 品红，底部漂移（15s） */}
      <motion.div
        className="absolute -bottom-1/4 left-1/3 size-[480px] rounded-full bg-pink-400/15 blur-3xl dark:bg-fuchsia-600/10"
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 60, 0], y: [0, -80, 0], scale: [1, 1.08, 1] }
        }
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
