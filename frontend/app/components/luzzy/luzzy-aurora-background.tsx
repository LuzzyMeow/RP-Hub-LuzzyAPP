/**
 * LUZZY 动态极光背景组件
 *
 * 提供美观的流动极光效果背景，适配深浅主题。
 * - fixed inset-0 定位，脱离滚动流，铺满整个视口（不受滚动影响）
 * - 使用 motion/react 实现丝滑的流动动画
 * - 多层渐变叠加，营造深度感
 * - 浮动光斑粒子效果
 * - 保留 useReducedMotion 无障碍支持
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
      data-reduce-motion={reduceMotion ? "on" : "off"}
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background",
        className,
      )}
    >
      {/* 基础渐变层 */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-muted/30" />

      {/* 顶部品牌色渐变光晕 */}
      <motion.div
        className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent"
        animate={reduceMotion ? {} : {
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 左侧紫色极光流动 */}
      <motion.div
        className="absolute -left-1/4 top-0 h-full w-1/2"
        style={{
          background: "radial-gradient(ellipse at 30% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 60%)",
        }}
        animate={reduceMotion ? {} : {
          x: ["-10%", "5%", "-10%"],
          y: ["-5%", "10%", "-5%"],
          scale: [1, 1.1, 1],
          opacity: [0.6, 0.9, 0.6],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 右侧粉色极光流动 */}
      <motion.div
        className="absolute -right-1/4 top-1/4 h-full w-1/2"
        style={{
          background: "radial-gradient(ellipse at 70% 40%, rgba(236, 72, 153, 0.12) 0%, transparent 60%)",
        }}
        animate={reduceMotion ? {} : {
          x: ["10%", "-5%", "10%"],
          y: ["5%", "-10%", "5%"],
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      {/* 顶部蓝色光晕 */}
      <motion.div
        className="absolute left-1/2 top-0 h-1/3 w-2/3 -translate-x-1/2"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.1) 0%, transparent 70%)",
        }}
        animate={reduceMotion ? {} : {
          opacity: [0.4, 0.7, 0.4],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      {/* 浮动光斑 1 */}
      <motion.div
        className="absolute left-[15%] top-[20%] size-64 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, transparent 70%)",
        }}
        animate={reduceMotion ? {} : {
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 浮动光斑 2 */}
      <motion.div
        className="absolute right-[20%] top-[60%] size-48 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(236, 72, 153, 0.06) 0%, transparent 70%)",
        }}
        animate={reduceMotion ? {} : {
          x: [0, -25, 0],
          y: [0, 15, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
      />

      {/* 浮动光斑 3 */}
      <motion.div
        className="absolute left-[40%] top-[80%] size-56 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.07) 0%, transparent 70%)",
        }}
        animate={reduceMotion ? {} : {
          x: [0, 20, -10, 0],
          y: [0, -25, 10, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 5,
        }}
      />

      {/* 细微网格纹理（radial-gradient 点阵），低不透明度 */}
      <div
        className="absolute inset-0 text-foreground opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* 顶部细微光线 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
