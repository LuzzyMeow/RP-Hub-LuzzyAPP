/**
 * 滑动卡片组件（v0.3.3 新增）
 *
 * 左滑触发删除（红色背景 + 垃圾桶图标），右滑触发编辑（蓝色背景 + 编辑图标）。
 * 使用 motion drag + useMotionValue + useTransform 实现丝滑动画。
 *
 * 参考：all-sessions-list.tsx 的 SessionSwipeItem 实现
 */

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { cn } from "~/lib/utils";

interface SwipeCardProps {
  /** 卡片内容 */
  children: React.ReactNode;
  /** 左滑触发回调（通常为删除） */
  onSwipeLeft?: () => void;
  /** 右滑触发回调（通常为编辑） */
  onSwipeRight?: () => void;
  /** 左滑背景标签（默认"删除"） */
  leftLabel?: string;
  /** 右滑背景标签（默认"编辑"） */
  rightLabel?: string;
  /** 左滑背景图标 */
  leftIcon?: React.ReactNode;
  /** 右滑背景图标 */
  rightIcon?: React.ReactNode;
  /** 自定义容器类名 */
  className?: string;
  /** 是否禁用滑动 */
  disabled?: boolean;
}

export function SwipeCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = "删除",
  rightLabel = "编辑",
  leftIcon,
  rightIcon,
  className,
  disabled = false,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const leftOpacity = useTransform(x, [-120, -60], [1, 0]);
  const rightOpacity = useTransform(x, [60, 120], [0, 1]);

  if (disabled) {
    // 禁用滑动时直接渲染内容
    return <div className={cn("relative", className)}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* 背景层：左删除 + 右编辑 */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <motion.div
          style={{ opacity: leftOpacity }}
          className="flex items-center gap-2 text-destructive"
        >
          {leftIcon}
          <span className="text-sm font-medium">{leftLabel}</span>
        </motion.div>
        <motion.div
          style={{ opacity: rightOpacity }}
          className="flex items-center gap-2 text-primary"
        >
          <span className="text-sm font-medium">{rightLabel}</span>
          {rightIcon}
        </motion.div>
      </div>
      {/* 前景层：卡片内容 */}
      <motion.div
        layout
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.15}
        style={{ x }}
        onDragEnd={(_, info) => {
          // v0.3.4: 修复左滑删除取消后无法回退 bug
          // 改为先回弹再触发回调，与右滑行为一致
          // 由上层显示确认弹窗，取消时卡片已在原位
          if (info.offset.x < -80) {
            animate(x, 0, { duration: 0.3 });
            onSwipeLeft?.();
          } else if (info.offset.x > 80) {
            animate(x, 0, { duration: 0.3 });
            onSwipeRight?.();
          } else {
            animate(x, 0, { duration: 0.3 });
          }
        }}
        className="relative z-10 bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
