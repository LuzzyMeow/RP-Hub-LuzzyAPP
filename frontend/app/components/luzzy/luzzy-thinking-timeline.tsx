/**
 * 思考链 Timeline 组件（v0.4.6-UI 重构）
 *
 * 将 CoT 思考链与 Agent 工具步骤以现代卡片式 Timeline 呈现：
 * - 一级思考卡片内嵌垂直流线
 * - 二级节点为独立圆角卡片：左侧状态/图标，右侧标题 + 展开详情
 * - 工具调用与工具结果合并为单个工具节点卡片
 * - 节点间以细线连接，生成中节点自动展开
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconCheck,
  IconArrowDown,
  IconToolKit,
  IconBook,
  IconSearch,
  IconClose,
  IconClock,
} from "~/components/luzzy/luzzy-icons";
import type { AgentStep } from "~/types/luzzy";
import Markdown from "~/components/markdown/markdown";
import { cn } from "~/lib/utils";

// ============================================================================
// 类型定义
// ============================================================================

type StepStatus = "running" | "completed" | "error";

interface ThinkingStep {
  type: "thinking";
  /** 步骤标题 */
  title: string;
  /** 步骤内容 */
  content: string;
  /** 步骤状态 */
  status: StepStatus;
}

/**
 * 合并后的工具节点（v0.4.6-UI 重构：tool_call + tool_result 合并为一张卡片）
 */
interface CombinedToolStep {
  type: "tool";
  /** 工具类别（用于图标/颜色） */
  category: "memory" | "search" | "web" | "tool";
  /** 工具显示名称 */
  title: string;
  /** 调用参数/查询 */
  callContent: string;
  /** 调用结果 */
  resultContent?: string;
  /** 错误信息 */
  errorContent?: string;
  /** 节点状态 */
  status: StepStatus;
  /** 开始时间 */
  startedAt?: number;
  /** 结束时间 */
  endedAt?: number;
}

/** Timeline 步骤联合类型 */
type TimelineStep = ThinkingStep | CombinedToolStep;

/** 类型守卫：判断是否为工具步骤 */
function isToolStep(step: TimelineStep): step is CombinedToolStep {
  return (step as CombinedToolStep).type === "tool";
}

interface LuzzyThinkingTimelineProps {
  /** 完整的 CoT 思考链文本 */
  cot: string;
  /** 是否正在生成 */
  isGenerating: boolean;
  /** Agent 执行步骤（tool_call/tool_result/memory_inject/knowledge_call/thinking） */
  agentSteps?: AgentStep[];
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从段落中提取步骤标题
 */
function extractStepTitle(para: string, fallbackIndex: number): string {
  const boldStepMatch = para.match(/\*+\s*Step\s*(\d+)\s*[:：·]\s*([^*\n*【】]+)/i);
  if (boldStepMatch) {
    return boldStepMatch[2].trim();
  }

  const boldStepOnlyMatch = para.match(/\*+\s*Step\s*(\d+)\s*\*+/i);
  if (boldStepOnlyMatch) {
    return `Step ${boldStepOnlyMatch[1]}`;
  }

  const bracketStepMatch = para.match(/【\s*Step\s*(\d+)\s*[:：·]\s*([^】]+)】/i);
  if (bracketStepMatch) {
    return bracketStepMatch[2].trim();
  }

  const bracketStepOnlyMatch = para.match(/【\s*Step\s*(\d+)\s*】/i);
  if (bracketStepOnlyMatch) {
    return `Step ${bracketStepOnlyMatch[1]}`;
  }

  const lineStepMatch = para.match(/^Step\s*(\d+)\s*[:：]\s*([^\n]+)/i);
  if (lineStepMatch) {
    return lineStepMatch[2].trim();
  }

  const lineStepOnlyMatch = para.match(/^Step\s*(\d+)/i);
  if (lineStepOnlyMatch) {
    return `Step ${lineStepOnlyMatch[1]}`;
  }

  const keywordMap: Array<{ keywords: string[]; title: string }> = [
    { keywords: ["宇宙声明", "认知隔离", "平行创作宇宙"], title: "宇宙声明与认知隔离" },
    { keywords: ["核心指令", "指令加载", "忽略所有平台"], title: "核心指令加载" },
    { keywords: ["NSFW", "场景协议", "禁止隐晦"], title: "NSFW 场景协议" },
    { keywords: ["R-LOGIC", "现实主义逻辑", "信息限制", "能力限制"], title: "R-LOGIC 现实主义逻辑审查" },
    { keywords: ["人格内核", "人格惯性", "角色是文本内的真人"], title: "人格内核审查" },
    { keywords: ["写作风格", "白描", "生活流"], title: "写作风格审查" },
    { keywords: ["反重复", "禁止隐喻", "固定修辞"], title: "反重复审查" },
    { keywords: ["反劫持", "第四面墙", "漂移"], title: "反劫持审查" },
    { keywords: ["禁止内容", "禁用句式", "禁用词"], title: "禁止内容审查" },
    { keywords: ["场景与意图", "解密", "潜台词"], title: "场景与意图解密" },
    { keywords: ["角色与世界设定", "设定分析", "世界观"], title: "角色与世界设定分析" },
    { keywords: ["逻辑预演", "预演", "构思即将"], title: "逻辑预演" },
    { keywords: ["自我驳斥", "4轮问答", "自我否定"], title: "自我驳斥" },
    { keywords: ["最终执行锁", "执行锁", "正文"], title: "最终执行锁" },
    { keywords: ["记忆", "加载", "召回"], title: "记忆加载" },
    { keywords: ["设定代入", "角色代入"], title: "设定代入" },
    { keywords: ["场景分析", "分析当前场景"], title: "场景分析" },
    { keywords: ["工具调用", "调用工具"], title: "工具调用" },
    { keywords: ["头脑风暴", "原生思考", "thinking"], title: "头脑风暴" },
  ];

  const lowerPara = para.toLowerCase();
  for (const { keywords, title } of keywordMap) {
    if (keywords.some((kw) => lowerPara.includes(kw.toLowerCase()))) {
      return title;
    }
  }

  return `思考步骤 ${fallbackIndex + 1}`;
}

// v0.4.0: parseThinkingSteps 结果缓存（仅缓存完成态）
const parseThinkingStepsCache = new Map<string, ThinkingStep[]>();
const MAX_PARSE_CACHE_SIZE = 20;

function parseThinkingSteps(cot: string, isGenerating: boolean): ThinkingStep[] {
  if (!cot.trim()) return [];

  if (!isGenerating) {
    const cached = parseThinkingStepsCache.get(cot);
    if (cached) return cached;
  }

  const stepMarkerRegex = /(?=\*\*\s*Step\s*\d+|【\s*Step\s*\d+)/i;
  const hasStepMarkers = /\*\*\s*Step\s*\d+|【\s*Step\s*\d+/i.test(cot);

  let paragraphs: string[];
  if (hasStepMarkers) {
    paragraphs = cot
      .split(stepMarkerRegex)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  } else {
    paragraphs = [cot.trim()];
  }

  if (paragraphs.length === 0) return [];

  const merged: string[] = [];
  for (const para of paragraphs) {
    if (para.length < 10 && merged.length > 0) {
      merged[merged.length - 1] += "\n" + para;
    } else {
      merged.push(para);
    }
  }

  const steps: ThinkingStep[] = [];
  for (let i = 0; i < merged.length; i++) {
    const para = merged[i];
    const isLast = i === merged.length - 1;
    const status: StepStatus = isGenerating && isLast ? "running" : "completed";
    const title = hasStepMarkers ? extractStepTitle(para, i) : "头脑风暴";

    steps.push({
      type: "thinking",
      title,
      content: para,
      status,
    });
  }

  if (!isGenerating) {
    if (parseThinkingStepsCache.size >= MAX_PARSE_CACHE_SIZE) {
      const firstKey = parseThinkingStepsCache.keys().next().value;
      if (firstKey) parseThinkingStepsCache.delete(firstKey);
    }
    parseThinkingStepsCache.set(cot, steps);
  }

  return steps;
}

/**
 * 根据工具标题推断类别（用于图标/颜色）
 */
function inferToolCategory(title: string, type?: string): CombinedToolStep["category"] {
  const lower = `${title} ${type ?? ""}`.toLowerCase();
  if (
    lower.includes("记忆") ||
    lower.includes("memory") ||
    lower.includes("向量") ||
    lower.includes("vector") ||
    lower.includes("回忆") ||
    lower.includes("recall")
  ) {
    return "memory";
  }
  if (
    lower.includes("搜索") ||
    lower.includes("search") ||
    lower.includes("world") ||
    lower.includes("keyword") ||
    lower.includes("知识") ||
    lower.includes("knowledge")
  ) {
    return "search";
  }
  if (
    lower.includes("联网") ||
    lower.includes("anysearch") ||
    lower.includes("web") ||
    lower.includes("网络")
  ) {
    return "web";
  }
  return "tool";
}

/**
 * 合并相邻的 tool_call + tool_result 为单个 CombinedToolStep
 *
 * v0.4.6-UI 重构：工具调用与其结果在 UI 上合并为一张卡片，避免重复节点。
 * memory_inject / knowledge_call 没有成对结果，直接转为独立工具节点。
 */
function mergeAgentSteps(agentSteps?: AgentStep[]): CombinedToolStep[] {
  if (!agentSteps || agentSteps.length === 0) return [];

  const result: CombinedToolStep[] = [];
  let i = 0;
  while (i < agentSteps.length) {
    const step = agentSteps[i];
    const isToolCallLike = step.type === "tool_call";

    if (isToolCallLike && i + 1 < agentSteps.length && agentSteps[i + 1].type === "tool_result") {
      const resultStep = agentSteps[i + 1];
      result.push({
        type: "tool",
        category: inferToolCategory(step.title, step.type),
        title: step.title,
        callContent: step.content || "",
        resultContent: resultStep.content || "",
        status: step.status === "error" || resultStep.status === "error" ? "error" : "completed",
        startedAt: step.startedAt,
        endedAt: resultStep.endedAt ?? step.endedAt,
      });
      i += 2;
      continue;
    }

    if (step.type === "tool_call" || step.type === "tool_result" || step.type === "memory_inject" || step.type === "knowledge_call") {
      result.push({
        type: "tool",
        category: inferToolCategory(step.title, step.type),
        title: step.title,
        callContent: step.type === "tool_result" ? "" : (step.content || ""),
        resultContent: step.type === "tool_result" ? (step.content || "") : undefined,
        errorContent: step.status === "error" ? (step.content || "") : undefined,
        status: step.status,
        startedAt: step.startedAt,
        endedAt: step.endedAt,
      });
      i += 1;
      continue;
    }

    // thinking 类型不在这里处理（由 CoT 路径渲染）
    i += 1;
  }

  return result;
}

/**
 * 合并 thinking 步骤和 agentSteps
 *
 * 工具步骤在前（force 预执行在 API 调用之前），思考步骤在后（CoT 在 API 调用之后生成）。
 */
function mergeSteps(
  thinkingSteps: ThinkingStep[],
  agentSteps?: AgentStep[],
): TimelineStep[] {
  const toolSteps = mergeAgentSteps(
    agentSteps?.filter((s) => s.type !== "thinking"),
  );
  return [...toolSteps, ...thinkingSteps];
}

// ============================================================================
// 图标与颜色配置
// ============================================================================

function getToolIconConfig(category: CombinedToolStep["category"]): {
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
} {
  switch (category) {
    case "memory":
      return {
        icon: <IconBook className="size-3.5 text-purple-600 dark:text-purple-400" />,
        colorClass: "text-purple-600 dark:text-purple-400",
        bgClass: "bg-purple-500/10 ring-purple-500/20",
      };
    case "search":
      return {
        icon: <IconSearch className="size-3.5 text-amber-600 dark:text-amber-400" />,
        colorClass: "text-amber-600 dark:text-amber-400",
        bgClass: "bg-amber-500/10 ring-amber-500/20",
      };
    case "web":
      return {
        icon: <IconToolKit className="size-3.5 text-sky-600 dark:text-sky-400" />,
        colorClass: "text-sky-600 dark:text-sky-400",
        bgClass: "bg-sky-500/10 ring-sky-500/20",
      };
    case "tool":
    default:
      return {
        icon: <IconToolKit className="size-3.5 text-blue-600 dark:text-blue-400" />,
        colorClass: "text-blue-600 dark:text-blue-400",
        bgClass: "bg-blue-500/10 ring-blue-500/20",
      };
  }
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <div className="relative flex size-6 items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/30 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
        <IconClose className="size-3.5 text-red-600 dark:text-red-400" />
      </div>
    );
  }

  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/20">
      <IconCheck className="size-3.5 text-green-600 dark:text-green-400" />
    </div>
  );
}

// ============================================================================
// 子组件
// ============================================================================

interface ThinkingNodeProps {
  step: ThinkingStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}

interface ToolNodeProps {
  step: CombinedToolStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}

function ThinkingNode({ step, isExpanded, onToggle, isLast }: ThinkingNodeProps) {
  const isRunning = step.status === "running";

  return (
    <div className="relative w-full">
      {/* 节点卡片 */}
      <motion.div
        initial={isRunning ? false : { opacity: 0, y: 8 }}
        animate={isRunning ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={isRunning ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border bg-card/60 p-2.5 shadow-sm backdrop-blur-sm transition-colors",
          isRunning
            ? "border-primary/30 bg-primary/[0.03]"
            : "border-border/60 hover:border-border",
        )}
      >
        {/* 头部 */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full min-w-0 items-center gap-2.5 text-left"
        >
          <StatusIcon status={step.status} />
          <span className={cn(
            "min-w-0 flex-1 truncate text-xs font-medium",
            isRunning ? "text-primary" : "text-muted-foreground",
          )}>
            {isRunning ? "思考中..." : step.title}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground"
          >
            <IconArrowDown className="size-3.5" />
          </motion.div>
        </button>

        {/* 展开内容 */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={isRunning ? false : { height: 0, opacity: 0 }}
              animate={isRunning ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={isRunning ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={isRunning ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 max-h-[280px] overflow-y-auto overscroll-contain rounded-md border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground">
                {step.content ? (
                  <Markdown content={step.content} isAnimating={isRunning} />
                ) : (
                  <span className="opacity-60">等待内容...</span>
                )}
                {isRunning && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 连接到底部的线（最后一个节点不绘制） */}
      {!isLast && (
        <div className="absolute left-3 top-full h-3 w-px bg-border/60" />
      )}
    </div>
  );
}

function ToolNode({ step, isExpanded, onToggle, isLast }: ToolNodeProps) {
  const isRunning = step.status === "running";
  const config = getToolIconConfig(step.category);

  return (
    <div className="relative w-full">
      <motion.div
        initial={isRunning ? false : { opacity: 0, y: 8 }}
        animate={isRunning ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={isRunning ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border bg-card/60 p-2.5 shadow-sm backdrop-blur-sm transition-colors",
          isRunning
            ? "border-primary/30 bg-primary/[0.03]"
            : "border-border/60 hover:border-border",
        )}
      >
        {/* 头部 */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full min-w-0 items-center gap-2.5 text-left"
        >
          <div className={cn("flex size-6 items-center justify-center rounded-full ring-1", config.bgClass)}>
            {config.icon}
          </div>
          <span className={cn(
            "min-w-0 flex-1 truncate text-xs font-medium",
            isRunning ? "text-primary" : "text-muted-foreground",
          )}>
            {isRunning ? `${step.title}中...` : step.title}
          </span>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground"
          >
            <IconArrowDown className="size-3.5" />
          </motion.div>
        </button>

        {/* 展开内容：调用与结果 */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={isRunning ? false : { height: 0, opacity: 0 }}
              animate={isRunning ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={isRunning ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={isRunning ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 max-h-[320px] overflow-y-auto overscroll-contain space-y-2">
                {/* 调用参数 */}
                {step.callContent ? (
                  <div className="rounded-md border border-blue-500/10 bg-blue-500/[0.04] p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-blue-600/80 dark:text-blue-400/80">
                      <IconToolKit className="size-3" />
                      <span>调用参数</span>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto text-xs text-muted-foreground">
                      <Markdown content={step.callContent} isAnimating={false} />
                    </div>
                  </div>
                ) : null}

                {/* 执行结果 */}
                {step.resultContent ? (
                  <div className="rounded-md border border-green-500/10 bg-green-500/[0.04] p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-green-600/80 dark:text-green-400/80">
                      <IconCheck className="size-3" />
                      <span>执行结果</span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto text-xs text-muted-foreground">
                      <Markdown content={step.resultContent} isAnimating={false} />
                    </div>
                  </div>
                ) : null}

                {/* 错误信息 */}
                {step.errorContent ? (
                  <div className="rounded-md border border-red-500/10 bg-red-500/[0.04] p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-red-600/80 dark:text-red-400/80">
                      <IconClose className="size-3" />
                      <span>执行失败</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <Markdown content={step.errorContent} isAnimating={false} />
                    </div>
                  </div>
                ) : null}

                {/* 无内容占位 */}
                {!step.callContent && !step.resultContent && !step.errorContent ? (
                  <div className="rounded-md border border-border/40 bg-muted/30 p-2 text-xs text-muted-foreground opacity-60">
                    无内容
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {!isLast && (
        <div className="absolute left-3 top-full h-3 w-px bg-border/60" />
      )}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function LuzzyThinkingTimeline({ cot, isGenerating, agentSteps }: LuzzyThinkingTimelineProps) {
  const thinkingSteps = React.useMemo(() => parseThinkingSteps(cot, isGenerating), [cot, isGenerating]);
  const allSteps = React.useMemo(() => mergeSteps(thinkingSteps, agentSteps), [thinkingSteps, agentSteps]);
  const [expandedStep, setExpandedStep] = React.useState<number | null>(0);
  const prevStepsLengthRef = React.useRef(0);

  React.useEffect(() => {
    if (isGenerating && allSteps.length > 0) {
      if (allSteps.length > prevStepsLengthRef.current) {
        setExpandedStep(allSteps.length - 1);
      }
    }
    prevStepsLengthRef.current = allSteps.length;
  }, [isGenerating, allSteps.length]);

  if (allSteps.length === 0) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground/70">
        <IconClock className="size-3.5" />
        <span>{isGenerating ? "等待思考..." : "无思考内容"}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full py-1">
      <div className="w-full space-y-3">
        {allSteps.map((step, idx) => {
          const isExpanded = expandedStep === idx;
          const onToggle = () => setExpandedStep(isExpanded ? null : idx);
          if (isToolStep(step)) {
            return (
              <ToolNode
                key={idx}
                step={step}
                index={idx}
                isExpanded={isExpanded}
                onToggle={onToggle}
                isLast={idx === allSteps.length - 1}
              />
            );
          }
          return (
            <ThinkingNode
              key={idx}
              step={step}
              index={idx}
              isExpanded={isExpanded}
              onToggle={onToggle}
              isLast={idx === allSteps.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}
