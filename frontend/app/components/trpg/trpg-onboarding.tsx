/**
 * TRPG 用户引导组件（v0.8.3）
 *
 * 首次进入 TRPG 页面时显示分步引导：
 * Step 1: 欢迎介绍 TRPG 模式
 * Step 2: 引导进入设计模式创建世界卡
 * Step 3: 引导在世界卡下创建存档
 * Step 4: 引导开始游戏
 *
 * 动画：三态丝滑动画（进入/交互/退出），使用 motion/react
 * 图标：全部使用 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconDice, IconBook, IconSave, IconArrow, IconInfo } from "~/components/luzzy/luzzy-icons";
import { Button } from "~/components/ui/button";
import { springSoft, springSnappy, pressableSubtle } from "~/lib/motion-presets";

const ONBOARDING_KEY = "trpg_onboarding_completed";

/** 检查是否已完成引导 */
export const isTrpgOnboardingCompleted = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
};

/** 标记引导已完成 */
export const completeTrpgOnboarding = (): void => {
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    // 忽略存储错误
  }
};

/** 重置引导（供设置页使用） */
export const resetTrpgOnboarding = (): void => {
  try {
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {
    // 忽略存储错误
  }
};

interface OnboardingStep {
  icon: typeof IconDice;
  title: string;
  description: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: IconDice,
    title: "欢迎来到 TRPG 模式",
    description:
      "这里是你的桌面角色扮演游戏舞台。通过 AI 驱动的叙事引擎，你可以体验沉浸式的角色扮演冒险。",
  },
  {
    icon: IconBook,
    title: "第一步：创建世界卡",
    description:
      "切换到「设计模式」，通过 AI 对话创建你的专属世界卡。世界卡定义了游戏的世界观、规则、角色和场景。",
  },
  {
    icon: IconSave,
    title: "第二步：创建存档",
    description:
      "在世界卡下创建存档。每个存档代表一次独立的冒险旅程，角色名将通过设计模式自动生成。",
  },
  {
    icon: IconArrow,
    title: "第三步：开始游戏",
    description:
      "切换回「游戏模式」，输入你的行动，AI 将根据世界卡设定推动剧情发展。祝你冒险愉快！",
  },
];

interface TrpgOnboardingProps {
  onComplete: () => void;
}

export function TrpgOnboarding({ onComplete }: TrpgOnboardingProps) {
  const [currentStep, setCurrentStep] = React.useState(0);

  const handleNext = React.useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      completeTrpgOnboarding();
      onComplete();
    }
  }, [currentStep, onComplete]);

  const handleSkip = React.useCallback(() => {
    completeTrpgOnboarding();
    onComplete();
  }, [onComplete]);

  const step = STEPS[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        key={currentStep}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -20 }}
        transition={springSoft}
        className="mx-4 w-full max-w-sm rounded-2xl border border-border/30 bg-background/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        {/* 图标 */}
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
          className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10"
        >
          <StepIcon className="size-8 text-primary" />
        </motion.div>

        {/* 标题 */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-2 text-center text-lg font-semibold text-foreground"
        >
          {step.title}
        </motion.h2>

        {/* 描述 */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6 text-center text-sm leading-relaxed text-muted-foreground"
        >
          {step.description}
        </motion.p>

        {/* 进度指示器 */}
        <div className="mb-6 flex justify-center gap-1.5">
          {STEPS.map((_, index) => (
            <motion.div
              key={index}
              className="h-1.5 rounded-full"
              initial={false}
              animate={{
                width: index === currentStep ? 24 : 8,
                backgroundColor:
                  index <= currentStep ? "var(--primary)" : "var(--muted-foreground)",
              }}
              transition={springSnappy}
            />
          ))}
        </div>

        {/* 按钮组 */}
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep((prev) => prev - 1)}
              className="flex-1"
            >
              上一步
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            跳过
          </Button>
          <motion.div {...pressableSubtle} className="flex-1">
            <Button onClick={handleNext} className="w-full gap-2" size="sm">
              {isLastStep ? "开始冒险" : "下一步"}
              {!isLastStep && <IconArrow className="size-3.5" />}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** TRPG 引导包装器 — 自动检测是否需要显示引导 */
export function TrpgOnboardingWrapper({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    if (!isTrpgOnboardingCompleted()) {
      setShowOnboarding(true);
    }
  }, []);

  return (
    <>
      {children}
      <AnimatePresence>
        {showOnboarding && <TrpgOnboarding onComplete={() => setShowOnboarding(false)} />}
      </AnimatePresence>
    </>
  );
}
