/**
 * LUZZY 启动屏组件
 *
 * 简洁现代启动屏：液态玻璃质感 + LUZZY 文字 + 进度条动画
 * 首次进入会话时显示，约 2 秒后淡出
 * 支持 prefers-reduced-motion：缩短至 0.5s 并跳过进度条动画
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

interface LuzzySplashProps {
  /** 启动屏完成回调 */
  onComplete: () => void;
}

/** 微光粒子配置 */
const PARTICLES = [
  { x: "15%", y: "20%", size: 4, delay: 0, duration: 3 },
  { x: "80%", y: "15%", size: 3, delay: 0.5, duration: 4 },
  { x: "25%", y: "70%", size: 5, delay: 1, duration: 3.5 },
  { x: "70%", y: "75%", size: 3, delay: 1.5, duration: 4.5 },
  { x: "50%", y: "10%", size: 2, delay: 0.3, duration: 3 },
  { x: "10%", y: "50%", size: 4, delay: 0.8, duration: 4 },
  { x: "90%", y: "50%", size: 3, delay: 1.2, duration: 3.5 },
  { x: "40%", y: "85%", size: 2, delay: 0.6, duration: 4 },
];

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

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, fadeOutDuration);
    }, totalDuration + waitAfterComplete);

    return () => clearTimeout(timer);
  }, [onComplete, reduceMotion]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* 背景光晕装饰 */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/4 top-1/4 size-96 rounded-full bg-purple-500/10 blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 size-96 rounded-full bg-indigo-500/10 blur-3xl" />
          </div>

          {/* 微光粒子效果（reduce-motion 时跳过） */}
          {!reduceMotion && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {PARTICLES.map((p, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-white/40"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.size,
                    height: p.size,
                  }}
                  animate={{
                    y: [0, -30, 0],
                    opacity: [0, 0.8, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}

          {/* LUZZY 文字区域 */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 18,
            }}
          >
            {/* 呼吸光晕环（reduce-motion 时静态） */}
            {!reduceMotion && (
              <motion.div
                className="absolute inset-0 -z-10 rounded-full bg-purple-400/20 blur-2xl"
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
            <span
              className="text-5xl font-bold tracking-[0.3em] text-white drop-shadow-[0_0_24px_rgba(233,213,255,0.4)]"
              style={{ fontFamily: "AlibabaPuHuiTi-3, sans-serif" }}
            >
              LUZZY
            </span>
          </motion.div>

          {/* 进度条（reduce-motion 时跳过） */}
          {!reduceMotion && (
            <div className="relative mt-10 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-purple-400 to-indigo-400 shadow-[0_0_12px_rgba(167,139,250,0.6)]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "easeOut" }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
