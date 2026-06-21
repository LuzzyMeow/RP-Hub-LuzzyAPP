/**
 * 思考链 Timeline 组件（v0.3.4 新增）
 *
 * 将 CoT 思考链以 Timeline 节点 UI 呈现：
 * - 垂直流线，每个步骤是一个节点
 * - 节点左侧状态圆圈（执行中=pulse 动画，完成=绿色对勾）
 * - 节点右侧步骤名称 + 简要说明
 * - 点击节点展开详情（完整思考文本）
 * - 打字机效果：生成中时最后一个节点逐字渲染
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconCheck, IconArrowDown } from "~/components/luzzy/luzzy-icons";
import Markdown from "~/components/markdown/markdown";

// ============================================================================
// 类型定义
// ============================================================================

interface ThinkingStep {
  /** 步骤标题 */
  title: string;
  /** 步骤内容 */
  content: string;
  /** 步骤状态 */
  status: "running" | "completed";
}

interface LuzzyThinkingTimelineProps {
  /** 完整的 CoT 思考链文本 */
  cot: string;
  /** 是否正在生成 */
  isGenerating: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 将 CoT 文本拆分为多个思考步骤
 *
 * 按 \n\n 分割为段落，每个段落是一个步骤。
 * 若段落过短（<10 字符），合并到上一个步骤。
 */
function parseThinkingSteps(cot: string, isGenerating: boolean): ThinkingStep[] {
  if (!cot.trim()) return [];

  const paragraphs = cot
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const steps: ThinkingStep[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    // 生成中时，最后一个段落为 running 状态
    const isLast = i === paragraphs.length - 1;
    const status: "running" | "completed" = isGenerating && isLast ? "running" : "completed";

    // 生成步骤标题：取段落前 30 字符作为预览
    const titleMatch = para.match(/^(.{0,30})/);
    const preview = titleMatch ? titleMatch[1].trim() : `思考步骤 ${i + 1}`;

    steps.push({
      title: preview.length < para.length ? preview + "..." : preview,
      content: para,
      status,
    });
  }

  return steps;
}

// ============================================================================
// 打字机效果 Hook
// ============================================================================

/**
 * 打字机效果 Hook
 *
 * 在生成中时，逐字渲染文本。
 * 生成完成后，直接显示完整文本。
 */
function useTypewriter(fullText: string, isGenerating: boolean, speed = 20): string {
  const [displayedText, setDisplayedText] = React.useState("");

  React.useEffect(() => {
    if (!isGenerating) {
      // 生成完成，直接显示完整文本
      setDisplayedText(fullText);
      return;
    }

    // 生成中，逐字渲染
    if (fullText.length <= displayedText.length) {
      // 新文本比已显示的短或相等（不应该发生，但防御性处理）
      setDisplayedText(fullText);
      return;
    }

    // 从当前显示位置开始，逐字追加新内容
    const timer = setInterval(() => {
      setDisplayedText((prev) => {
        if (prev.length >= fullText.length) {
          clearInterval(timer);
          return fullText;
        }
        // 每次追加 2-3 个字符，加快打字速度
        const chunkSize = Math.min(3, fullText.length - prev.length);
        return fullText.slice(0, prev.length + chunkSize);
      });
    }, speed);

    return () => clearInterval(timer);
  }, [fullText, isGenerating, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  return displayedText;
}

// ============================================================================
// 主组件
// ============================================================================

export function LuzzyThinkingTimeline({ cot, isGenerating }: LuzzyThinkingTimelineProps) {
  const steps = React.useMemo(() => parseThinkingSteps(cot, isGenerating), [cot, isGenerating]);
  const [expandedStep, setExpandedStep] = React.useState<number | null>(0);

  // 生成中时默认展开最后一个步骤
  React.useEffect(() => {
    if (isGenerating && steps.length > 0) {
      setExpandedStep(steps.length - 1);
    }
  }, [isGenerating, steps.length]);

  if (steps.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        {isGenerating ? "等待思考..." : "无思考内容"}
      </div>
    );
  }

  return (
    <div className="relative px-3 py-2">
      {/* 垂直流线 */}
      <div className="absolute bottom-4 left-[1.4rem] top-4 w-px bg-border/50" />

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <ThinkingNode
            key={idx}
            step={step}
            index={idx}
            isExpanded={expandedStep === idx}
            onToggle={() => setExpandedStep(expandedStep === idx ? null : idx)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 思考节点组件
// ============================================================================

interface ThinkingNodeProps {
  step: ThinkingStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function ThinkingNode({ step, index, isExpanded, onToggle }: ThinkingNodeProps) {
  const isRunning = step.status === "running";
  const displayedContent = useTypewriter(step.content, isRunning);

  return (
    <div className="relative pl-8">
      {/* 状态圆圈 */}
      <div className="absolute left-0 top-0.5 flex size-6 items-center justify-center">
        {isRunning ? (
          // 执行中：pulse 动画的空心圆圈
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="size-3 rounded-full border-2 border-primary bg-primary/20"
          />
        ) : (
          // 完成：绿色对勾
          <div className="flex size-5 items-center justify-center rounded-full bg-green-500/15">
            <IconCheck className="size-3 text-green-600 dark:text-green-400" />
          </div>
        )}
      </div>

      {/* 节点内容 */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-1.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {isRunning ? "思考中..." : step.title}
        </span>
        <motion.div animate={{ rotate: isExpanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <IconArrowDown className="size-3 shrink-0 text-muted-foreground" />
        </motion.div>
      </button>

      {/* 展开详情 */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-md bg-muted/40 p-2 text-sm text-muted-foreground">
              {displayedContent ? (
                <Markdown content={displayedContent} />
              ) : (
                <span className="text-xs opacity-60">等待内容...</span>
              )}
              {isRunning && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
