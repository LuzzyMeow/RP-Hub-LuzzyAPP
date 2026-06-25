/**
 * LUZZY 动态极光背景组件
 *
 * 提供美观的流动极光效果背景，适配深浅主题。
 * - absolute inset-0 定位，相对于父级 relative 容器铺满，不遮挡布局元素
 * - 使用 motion/react 实现丝滑的流动动画
 * - 多层渐变叠加，营造深度感
 * - 浮动光斑粒子效果
 * - 保留 useReducedMotion 无障碍支持
 * - pointer-events-none + z-0，始终置于内容之下
 */

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { cn } from "~/lib/utils";

// v0.8.7-urgent: 提取内联 style 为模块级常量，避免每次 render 创建新对象破坏 memo
const AURORA_BLOB_STYLES = {
  blob1: {
    background:
      "radial-gradient(ellipse at 30% 30%, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0.08) 35%, transparent 65%)",
  },
  blob2: {
    background:
      "radial-gradient(ellipse at 70% 40%, rgba(236, 72, 153, 0.15) 0%, rgba(236, 72, 153, 0.06) 35%, transparent 65%)",
  },
  blob3: {
    background:
      "radial-gradient(ellipse at 50% 0%, rgba(0, 101, 253, 0.12) 0%, rgba(85, 127, 255, 0.06) 40%, transparent 70%)",
  },
  blob4: {
    background:
      "linear-gradient(90deg, transparent 0%, rgba(168, 85, 247, 0.08) 25%, rgba(236, 72, 153, 0.1) 50%, rgba(0, 101, 253, 0.08) 75%, transparent 100%)",
  },
  blob5: { background: "radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)" },
  blob6: { background: "radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)" },
  blob7: { background: "radial-gradient(circle, rgba(0, 101, 253, 0.1) 0%, transparent 70%)" },
  blob8: {
    backgroundImage: "radial-gradient(circle at center, currentColor 1px, transparent 1px)",
    backgroundSize: "32px 32px",
  },
} as const;

interface LuzzyAuroraBackgroundProps {
  className?: string;
}

// v0.8.7-urgent: D8 包裹 React.memo，避免父组件重渲染时 VDOM 重建
export const LuzzyAuroraBackground = React.memo(function LuzzyAuroraBackground({ className }: LuzzyAuroraBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      data-reduce-motion={reduceMotion ? "on" : "off"}
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/20",
        className,
      )}
    >
      {/* 左侧紫色极光流动 - 增强可见度 */}
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[150%] w-[150%]"
        style={AURORA_BLOB_STYLES.blob1}
        animate={
          reduceMotion
            ? {}
            : {
                x: ["-8%", "5%", "-8%"],
                y: ["-5%", "8%", "-5%"],
                scale: [1, 1.08, 1],
                opacity: [0.7, 1, 0.7],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 右侧粉色极光流动 - 增强可见度 */}
      <motion.div
        className="absolute -right-1/4 top-0 h-[150%] w-[150%]"
        style={AURORA_BLOB_STYLES.blob2}
        animate={
          reduceMotion
            ? {}
            : {
                x: ["8%", "-5%", "8%"],
                y: ["5%", "-8%", "5%"],
                scale: [1, 1.1, 1],
                opacity: [0.6, 0.9, 0.6],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      {/* 顶部蓝青色光晕 - 增强可见度 */}
      <motion.div
        className="absolute left-1/2 -top-1/4 h-[100%] w-[120%] -translate-x-1/2"
        style={AURORA_BLOB_STYLES.blob3}
        animate={
          reduceMotion
            ? {}
            : {
                opacity: [0.5, 0.8, 0.5],
                scale: [1, 1.15, 1],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      {/* 中间交汇光带 - 新增混合色效果 */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[80%] w-[200%] -translate-x-1/2 -translate-y-1/2 rotate-12"
        style={AURORA_BLOB_STYLES.blob4}
        animate={
          reduceMotion
            ? {}
            : {
                x: ["-30%", "30%", "-30%"],
                opacity: [0.3, 0.6, 0.3],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
      />

      {/* 浮动光斑 1 - 紫色 */}
      <motion.div
        className="absolute left-[10%] top-[15%] size-72 rounded-full"
        style={AURORA_BLOB_STYLES.blob5}
        animate={
          reduceMotion
            ? {}
            : {
                x: [0, 40, 0],
                y: [0, -30, 0],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 浮动光斑 2 - 粉色 */}
      <motion.div
        className="absolute right-[15%] top-[55%] size-56 rounded-full"
        style={AURORA_BLOB_STYLES.blob6}
        animate={
          reduceMotion
            ? {}
            : {
                x: [0, -30, 0],
                y: [0, 25, 0],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
      />

      {/* 浮动光斑 3 - 蓝色 */}
      <motion.div
        className="absolute left-[45%] top-[75%] size-64 rounded-full"
        style={AURORA_BLOB_STYLES.blob7}
        animate={
          reduceMotion
            ? {}
            : {
                x: [0, 25, -15, 0],
                y: [0, -30, 15, 0],
              }
        }
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 5,
        }}
      />

      {/* 细微网格纹理（radial-gradient 点阵），低不透明度 */}
      <div
        className="absolute inset-0 text-foreground opacity-[0.03]"
        style={AURORA_BLOB_STYLES.blob8}
      />

      {/* 顶部细微光线 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  );
});
