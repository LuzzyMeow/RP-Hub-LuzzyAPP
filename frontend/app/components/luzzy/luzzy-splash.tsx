/**
 * LUZZY 启动屏组件
 *
 * v0.3.7: 配色统一为 APP 主题 CSS 变量，自动适配浅色/深色/多主题
 * 简洁现代启动屏：液态玻璃质感 + LUZZY 文字字符级 stagger + 进度条 shimmer 动画
 * 首次进入会话时显示，约 2 秒后淡出
 * 支持 prefers-reduced-motion：缩短至 0.5s 并跳过进度条动画
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface LuzzySplashProps {
  /** 启动屏完成回调 */
  onComplete: () => void;
}

/** 微光粒子配置（v0.3.7: 增加大小变化与水平漂移） */
const PARTICLES = [
  { x: "15%", y: "20%", size: 4, delay: 0, duration: 3, drift: 20 },
  { x: "80%", y: "15%", size: 3, delay: 0.5, duration: 4, drift: -15 },
  { x: "25%", y: "70%", size: 5, delay: 1, duration: 3.5, drift: 25 },
  { x: "70%", y: "75%", size: 3, delay: 1.5, duration: 4.5, drift: -20 },
  { x: "50%", y: "10%", size: 2, delay: 0.3, duration: 3, drift: 15 },
];

/** LUZZY 文字字符（用于字符级 stagger 动画） */
const LUZZY_CHARS = ["L", "U", "Z", "Z", "Y"];

export function LuzzySplash({ onComplete }: LuzzySplashProps) {
  const reduceMotion = useReducedMotion();
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    // 本会话已显示过，立即完成
    if (sessionStorage.getItem("luzzy-splash-shown")) {
      onComplete();
      return;
    }

    const totalDuration = reduceMotion ? 500 : 2000;
    const waitAfterComplete = reduceMotion ? 0 : 200;
    const fadeOutDuration = 300;
    // v0.8.7-urgent: D9 清理内层 setTimeout，避免组件卸载后 setState 警告
    let innerTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      setIsVisible(false);
      innerTimer = setTimeout(onComplete, fadeOutDuration);
    }, totalDuration + waitAfterComplete);
    return () => {
      clearTimeout(timer);
      if (innerTimer) clearTimeout(innerTimer);
    };
  }, [onComplete, reduceMotion]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* 背景光晕装饰（v0.3.7: 使用主题色变量） */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/4 top-1/4 size-96 rounded-full bg-primary/5" />
            <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-accent-foreground/5" />
          </div>

          {/* 微光粒子效果（reduce-motion 时跳过） */}
          {!reduceMotion && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {PARTICLES.map((p, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-primary/40"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.size,
                    height: p.size,
                  }}
                  animate={{
                    y: [0, -30, 0],
                    x: [0, p.drift, 0],
                    opacity: [0, 0.8, 0],
                    scale: [0.5, 1.2, 0.5],
                  }}
                  transition={{
                    duration: 3 + i * 0.5,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}

          {/* LUZZY 文字区域（v0.3.7: 液态玻璃卡片 + 字符级 stagger） */}
          <motion.div
            className="relative flex flex-col items-center rounded-3xl border border-border/40 bg-card/90 px-8 py-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* 呼吸光晕环（reduce-motion 时静态） */}
            {!reduceMotion && (
              <motion.div
                className="absolute inset-0 -z-10 rounded-3xl bg-primary/10"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
            {/* 字符级 stagger 入场动画 */}
            <span
              className="flex text-5xl font-bold tracking-[0.3em] text-foreground"
              style={{ fontFamily: "AlibabaPuHuiTi-3, sans-serif" }}
            >
              {LUZZY_CHARS.map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.15 + i * 0.08,
                    duration: 0.4,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  style={{
                    textShadow: "0 0 24px var(--primary)",
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </span>
          </motion.div>

          {/* 进度条（reduce-motion 时跳过） */}
          {!reduceMotion && (
            <div className="relative mt-10 h-1 w-48 overflow-hidden rounded-full bg-border/50">
              <motion.div
                className="relative h-full rounded-full bg-primary shadow-[0_0_12px_var(--primary)]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeOut" }}
              >
                {/* shimmer 光泽流动 */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
