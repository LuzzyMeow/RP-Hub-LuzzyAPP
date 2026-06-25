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
import { motion } from "motion/react";
import {
  IconCheck,
  IconArrowDown,
  IconToolKit,
  IconBook,
  IconSearch,
  IconClose,
  IconClock,
  IconMessage,
  IconChevronRight,
} from "~/components/luzzy/luzzy-icons";
import type { AgentStep, MemoryRecall, WorldInfoRecall } from "~/types/luzzy";
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
 * v0.5.5-arch: 头脑风暴节点（来自 reasoning_content 字段）
 */
interface BrainstormStep {
  type: "brainstorm";
  /** 步骤标题 */
  title: string;
  /** 步骤内容 */
  content: string;
  /** 步骤状态 */
  status: StepStatus;
  /** v0.7.1: 时序排序 */
  startedAt?: number;
}

/**
 * v0.5.5-arch: CoT 输出节点（来自请求2的 content 字段）
 */
interface CotOutputStep {
  type: "cot_output";
  /** 步骤标题 */
  title: string;
  /** 步骤内容 */
  content: string;
  /** 步骤状态 */
  status: StepStatus;
  /** v0.7.1: 时序排序 */
  startedAt?: number;
}

/**
 * v0.5.5-arch: 合并后的工具节点（所有工具调用聚合为单一节点）
 */
interface CombinedToolStep {
  type: "tool";
  /** 工具显示名称 */
  title: string;
  /** 工具类别（用于图标/颜色） */
  category: "memory" | "search" | "web" | "tool";
  /** 多工具聚合子项 */
  subItems?: {
    toolName: string;
    category: "memory" | "search" | "web" | "tool";
    callContent: string;
    resultContent?: string;
    errorContent?: string;
    status: StepStatus;
    /** v0.7.2: 召回结果列表（用于 RecallResultCard 三级卡片展示） */
    recallResults?: (MemoryRecall | WorldInfoRecall)[];
  }[];
  /** 节点状态 */
  status: StepStatus;
  /** 开始时间 */
  startedAt?: number;
  /** 结束时间 */
  endedAt?: number;
  // 保留单工具字段兼容
  callContent?: string;
  resultContent?: string;
  errorContent?: string;
}

/** Timeline 步骤联合类型 */
type TimelineStep = ThinkingStep | BrainstormStep | CotOutputStep | CombinedToolStep;

/** 类型守卫：判断是否为工具步骤 */
function isToolStep(step: TimelineStep): step is CombinedToolStep {
  return (step as CombinedToolStep).type === "tool";
}

/** v0.5.5-arch: 类型守卫：判断是否为头脑风暴步骤 */
function isBrainstormStep(step: TimelineStep): step is BrainstormStep {
  return (step as BrainstormStep).type === "brainstorm";
}

/** v0.5.5-arch: 类型守卫：判断是否为 CoT 输出步骤 */
function isCotOutputStep(step: TimelineStep): step is CotOutputStep {
  return (step as CotOutputStep).type === "cot_output";
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
    {
      keywords: ["R-LOGIC", "现实主义逻辑", "信息限制", "能力限制"],
      title: "R-LOGIC 现实主义逻辑审查",
    },
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

// v0.4.0: parseThinkingSteps 结果缓存
// v0.5.4: 生成中也启用缓存，避免流式更新时每次全量正则解析
const parseThinkingStepsCache = new Map<string, ThinkingStep[]>();
const MAX_PARSE_CACHE_SIZE = 50;

function parseThinkingSteps(cot: string, isGenerating: boolean): ThinkingStep[] {
  if (!cot.trim()) return [];

  // v0.5.4: 移除 isGenerating 限制，始终使用缓存
  const cached = parseThinkingStepsCache.get(cot);
  if (cached) return cached;

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

  // v0.5.4: 始终写入缓存（包括生成中），限制缓存大小避免内存膨胀
  if (parseThinkingStepsCache.size >= MAX_PARSE_CACHE_SIZE) {
    const firstKey = parseThinkingStepsCache.keys().next().value;
    if (firstKey) parseThinkingStepsCache.delete(firstKey);
  }
  parseThinkingStepsCache.set(cot, steps);

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
 * v0.7.1: 合并思考步骤和 agentSteps — 时序排序
 *
 * 按 startedAt 时间戳升序排列所有节点，反映实际执行顺序：
 * 被动工具（记忆召回） → 头脑风暴（模型思考） → 主动工具（模型调用） → CoT 输出 → ...
 * - 所有工具类节点（tool_call/tool_result/memory_inject/knowledge_call）聚合为单一"工具调用"节点
 * - brainstorm/cot_output 节点独立显示，按时间排序
 * - 旧 thinking 节点和 cot 字符串解析的 thinkingSteps 追加在末尾（兼容旧数据）
 */
function mergeSteps(thinkingSteps: ThinkingStep[], agentSteps?: AgentStep[]): TimelineStep[] {
  if (!agentSteps || agentSteps.length === 0) {
    return [...thinkingSteps];
  }

  const toolLikeTypes = new Set(["tool_call", "tool_result", "memory_inject", "knowledge_call"]);

  // v0.7.1: 时序排序 — 收集所有步骤并附带 startedAt 用于排序
  const toolItems: AgentStep[] = [];
  const timelineItems: Array<{ step: TimelineStep; startedAt: number }> = [];
  const oldThinkings: ThinkingStep[] = [];

  for (const step of agentSteps) {
    if (step.type === "brainstorm") {
      timelineItems.push({
        step: {
          type: "brainstorm",
          title: step.title,
          content: step.content || "",
          status: step.status,
          startedAt: step.startedAt,
        } as BrainstormStep,
        startedAt: step.startedAt,
      });
      continue;
    }

    if (step.type === "cot_output") {
      timelineItems.push({
        step: {
          type: "cot_output",
          title: step.title,
          content: step.content || "",
          status: step.status,
          startedAt: step.startedAt,
        } as CotOutputStep,
        startedAt: step.startedAt,
      });
      continue;
    }

    if (toolLikeTypes.has(step.type)) {
      toolItems.push(step);
      continue;
    }

    // 旧 thinking 类型：转为 ThinkingStep（兼容历史数据）
    if (step.type === "thinking") {
      oldThinkings.push({
        type: "thinking",
        title: step.title,
        content: step.content || "",
        status: step.status,
      });
      continue;
    }
  }

  // 工具类节点聚合为单一"工具调用"节点（保持子项时序）
  if (toolItems.length > 0) {
    const subItems: NonNullable<CombinedToolStep["subItems"]> = [];
    let i = 0;
    while (i < toolItems.length) {
      const step = toolItems[i];
      if (
        step.type === "tool_call" &&
        i + 1 < toolItems.length &&
        toolItems[i + 1].type === "tool_result"
      ) {
        const resultStep = toolItems[i + 1];
        subItems.push({
          toolName: step.title,
          category: inferToolCategory(step.title, step.type),
          callContent: step.content || "",
          resultContent: resultStep.content || "",
          errorContent:
            step.status === "error" || resultStep.status === "error"
              ? step.content || ""
              : undefined,
          status: step.status === "error" || resultStep.status === "error" ? "error" : "completed",
          recallResults: resultStep.recallResults ?? step.recallResults,
        });
        i += 2;
      } else {
        subItems.push({
          toolName: step.title,
          category: inferToolCategory(step.title, step.type),
          callContent: step.type === "tool_result" ? "" : step.content || "",
          resultContent: step.type === "tool_result" ? step.content || "" : undefined,
          errorContent: step.status === "error" ? step.content || "" : undefined,
          status: step.status,
          recallResults: step.recallResults,
        });
        i += 1;
      }
    }

    const anyRunning = subItems.some((s) => s.status === "running");
    const anyError = subItems.some((s) => s.status === "error");
    const toolStep: CombinedToolStep = {
      type: "tool",
      title: subItems.length > 1 ? `工具调用 (${subItems.length})` : "工具调用",
      category: "tool",
      subItems,
      status: anyRunning ? "running" : anyError ? "error" : "completed",
      startedAt: toolItems[0].startedAt,
      endedAt: toolItems[toolItems.length - 1].endedAt,
    };
    timelineItems.push({
      step: toolStep,
      startedAt: toolItems[0].startedAt,
    });
  }

  // v0.7.1: 按 startedAt 升序排列（无 startedAt 的旧数据排到末尾）
  timelineItems.sort((a, b) => {
    const aTime = a.startedAt ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.startedAt ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  // 空节点跳过，不占位（工具节点保留）
  const filtered = timelineItems
    .map((item) => item.step)
    .filter((step) => {
      if (isToolStep(step)) return true;
      return step.content.trim().length > 0;
    });

  // cot 字符串解析的 thinkingSteps 追加在末尾（兼容旧 message.cot 数据）
  return [...filtered, ...oldThinkings, ...thinkingSteps];
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
        <span className="absolute inline-flex size-full rounded-full bg-primary/30 opacity-75" />
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
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
  /** v0.5.5-arch: 节点类型（用于区分图标和配色） */
  nodeType?: "thinking" | "brainstorm" | "cot_output";
}

interface ToolNodeProps {
  step: CombinedToolStep;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}

function ThinkingNode({
  step,
  isExpanded,
  onToggle,
  isLast,
  nodeType = "thinking",
}: ThinkingNodeProps) {
  const isRunning = step.status === "running";
  const contentRef = React.useRef<HTMLDivElement>(null);
  const userScrolledRef = React.useRef(false);
  // v0.8.7-fix: rAF 节流 scrollTop，避免每个 chunk 触发强制同步布局
  const scrollRafRef = React.useRef<number | null>(null);

  const scheduleScrollToBottom = React.useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = contentRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  React.useEffect(() => {
    if (!isRunning || !isExpanded || userScrolledRef.current) return;
    scheduleScrollToBottom();
  }, [step.content, isRunning, isExpanded, scheduleScrollToBottom]);

  React.useEffect(() => {
    if (isExpanded) {
      userScrolledRef.current = false;
      if (isRunning) scheduleScrollToBottom();
    }
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [isExpanded, isRunning, scheduleScrollToBottom]);

  const handleScroll = React.useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    userScrolledRef.current = !atBottom;
  }, []);

  // v0.5.5-arch: 按 nodeType 区分图标和配色
  const nodeIconConfig = (() => {
    switch (nodeType) {
      case "brainstorm":
        return {
          icon: null,
          accentClass: "border-amber-500/30 bg-amber-500/[0.03]",
          runningAccentClass: "border-amber-500/40 bg-amber-500/[0.05]",
          titleClass: isRunning ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        };
      case "cot_output":
        return {
          icon: <IconMessage className="size-3.5 text-violet-500 dark:text-violet-400" />,
          accentClass: "border-violet-500/30 bg-violet-500/[0.03]",
          runningAccentClass: "border-violet-500/40 bg-violet-500/[0.05]",
          titleClass: isRunning ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground",
        };
      default:
        return {
          icon: null,
          accentClass: "border-border/60 hover:border-border",
          runningAccentClass: "border-primary/30 bg-primary/[0.03]",
          titleClass: isRunning ? "text-primary" : "text-muted-foreground",
        };
    }
  })();

  return (
    <div className="cv-auto relative w-full">
      {/* 节点卡片 */}
      <motion.div
        initial={isRunning ? false : { opacity: 0, y: 8 }}
        animate={isRunning ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={isRunning ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border bg-card/90 p-2.5 shadow-sm transition-colors",
          isRunning ? nodeIconConfig.runningAccentClass : nodeIconConfig.accentClass,
        )}
      >
        {/* 头部 */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full min-w-0 items-center gap-2.5 text-left"
        >
          <StatusIcon status={step.status} />
          {nodeIconConfig.icon}
          <span
            className={cn("min-w-0 flex-1 truncate text-xs font-medium", nodeIconConfig.titleClass)}
          >
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

        {/* v0.8.7-fix: 用 CSS grid 1fr 动画替代 framer-motion height:"auto"，避免每帧测量 */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
            opacity: isExpanded ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div
              ref={contentRef}
              onScroll={handleScroll}
              className="mt-2 max-h-[280px] overflow-y-auto overscroll-contain rounded-md border border-border/40 bg-muted/30 p-2.5 text-xs text-muted-foreground"
            >
              {step.content ? (
                // v0.8.13: 思考卡片内部去掉 Markdown 渲染，改为纯文本 div
                // 原因：用户 4.1 明确要求；思考链是模型内部推理，无 Markdown 富文本需求
                // Markdown 渲染会引入 Streamdown 词级动画延迟，与"严格逐字（1字=1次更新）"冲突
                // whitespace-pre-wrap 保留换行（参考 narrator-message 同类纯文本模式）
                // break-words 防止长文本溢出
                // 【严禁改回 Markdown 渲染——会破坏严格逐字流式硬性要求】
                // 注：仅思考卡片去 Markdown，正文气泡（luzzy-chat-message.tsx）与
                // 工具调用卡片（本文件 922/935/948/976/989/1002 行）保留 Markdown 渲染
                <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {step.content}
                </div>
              ) : (
                <span className="opacity-60">等待内容...</span>
              )}
              {isRunning && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary" />
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 连接到底部的线（最后一个节点不绘制） */}
      {!isLast && <div className="absolute left-3 top-full h-3 w-px bg-border/60" />}
    </div>
  );
}

// ============================================================================
// v0.7.2: RecallResultCard 三级卡片组件
// ============================================================================

interface RecallResultCardProps {
  recall: MemoryRecall | WorldInfoRecall;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function RecallResultCard({ recall, index, isExpanded, onToggle }: RecallResultCardProps) {
  const strategy = (recall as WorldInfoRecall).strategy;
  const strategyLabel =
    strategy === "constant"
      ? "总是激活"
      : strategy === "keyword"
        ? "关键词命中"
        : strategy === "semantic"
          ? "语义相似度"
          : null;

  const entryName = (recall as WorldInfoRecall).entryName;
  const displayName = entryName ?? recall.content.slice(0, 30);

  const inputParams = [
    {
      label: "查询",
      value: recall.content.slice(0, 50) + (recall.content.length > 50 ? "..." : ""),
    },
    { label: "方法", value: strategyLabel ?? "语义相似度" },
    { label: "相似度", value: recall.score.toFixed(3) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      // v0.8.7-urgent: E6 移除 exit 动画（父组件未用 AnimatePresence 包裹，exit 永远不触发）
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-md border border-border/20 bg-muted/30 overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-foreground/60"
        >
          <IconChevronRight className="size-3" />
        </motion.div>
        <span className="text-xs text-muted-foreground shrink-0">#{index + 1}</span>
        <span className="text-xs font-medium truncate flex-1 text-left">{displayName}</span>
        {strategyLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border/30 bg-background/40 shrink-0">
            {strategyLabel}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {recall.score.toFixed(3)}
        </span>
      </button>

      {/* v0.8.7-fix: 用 CSS grid 1fr 动画替代 framer-motion height:"auto" */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 space-y-2 border-t border-border/10">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                输入参数
              </div>
              {inputParams.map((p, i) => (
                <div key={p.label} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground min-w-[60px]">{p.label}:</span>
                  <span className="flex-1 break-all">{p.value}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                输出结果
              </div>
              <div className="max-h-40 overflow-y-auto text-xs break-words rounded bg-background/40 p-2">
                {recall.content}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface RecallResultListProps {
  recallResults: (MemoryRecall | WorldInfoRecall)[];
}

function RecallResultList({ recallResults }: RecallResultListProps) {
  const [expandedSet, setExpandedSet] = React.useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSet(new Set(recallResults.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedSet(new Set());
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={expandAll}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          全部展开
        </button>
        <span className="text-[10px] text-muted-foreground/40">|</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          全部收起
        </button>
      </div>
      {recallResults.map((recall, idx) => (
        <RecallResultCard
          key={recall.id ?? idx}
          recall={recall}
          index={idx}
          isExpanded={expandedSet.has(idx)}
          onToggle={() => toggle(idx)}
        />
      ))}
    </div>
  );
}

function ToolNode({ step, isExpanded, onToggle, isLast }: ToolNodeProps) {
  const isRunning = step.status === "running";
  const config = getToolIconConfig(step.category);

  return (
    <div className="cv-auto relative w-full">
      <motion.div
        initial={isRunning ? false : { opacity: 0, y: 8 }}
        animate={isRunning ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={isRunning ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border bg-card/90 p-2.5 shadow-sm transition-colors",
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
          <div
            className={cn(
              "flex size-6 items-center justify-center rounded-full ring-1",
              config.bgClass,
            )}
          >
            {config.icon}
          </div>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium",
              isRunning ? "text-primary" : "text-muted-foreground",
            )}
          >
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

        {/* v0.8.7-fix: 用 CSS grid 1fr 动画替代 framer-motion height:"auto" */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
            opacity: isExpanded ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="mt-2 max-h-[360px] overflow-y-auto overscroll-contain space-y-2">
                {step.subItems && step.subItems.length > 0 ? (
                  // v0.5.5-arch: 多工具聚合渲染
                  step.subItems.map((sub, idx) => (
                    <div
                      key={`${sub.toolName}-${idx}`}
                      className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-2"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <IconToolKit className="size-3" />
                        <span>{sub.toolName}</span>
                        {sub.status === "running" && (
                          <span className="ml-auto inline-flex items-center text-primary">
                            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                            执行中
                          </span>
                        )}
                        {sub.status === "error" && (
                          <span className="ml-auto text-red-600 dark:text-red-400">失败</span>
                        )}
                        {sub.status === "completed" && (
                          <span className="ml-auto text-green-600 dark:text-green-400">完成</span>
                        )}
                      </div>

                      {/* 调用参数 */}
                      {sub.callContent ? (
                        <div className="rounded-md border border-blue-500/10 bg-blue-500/[0.04] p-2">
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-blue-600/80 dark:text-blue-400/80">
                            <IconToolKit className="size-3" />
                            <span>调用参数</span>
                          </div>
                          <div className="max-h-[120px] overflow-y-auto text-xs text-muted-foreground">
                            <Markdown content={sub.callContent} isAnimating={false} />
                          </div>
                        </div>
                      ) : null}

                      {/* 执行结果 */}
                      {sub.resultContent ? (
                        <div className="rounded-md border border-green-500/10 bg-green-500/[0.04] p-2">
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-green-600/80 dark:text-green-400/80">
                            <IconCheck className="size-3" />
                            <span>执行结果</span>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto text-xs text-muted-foreground">
                            <Markdown content={sub.resultContent} isAnimating={false} />
                          </div>
                        </div>
                      ) : null}

                      {/* 错误信息 */}
                      {sub.errorContent ? (
                        <div className="rounded-md border border-red-500/10 bg-red-500/[0.04] p-2">
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-red-600/80 dark:text-red-400/80">
                            <IconClose className="size-3" />
                            <span>执行失败</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <Markdown content={sub.errorContent} isAnimating={false} />
                          </div>
                        </div>
                      ) : null}

                      {/* 无内容占位 */}
                      {!sub.callContent && !sub.resultContent && !sub.errorContent ? (
                        <div className="rounded-md border border-border/40 bg-muted/30 p-2 text-xs text-muted-foreground opacity-60">
                          无内容
                        </div>
                      ) : null}

                      {/* v0.7.2: 召回结果三级卡片 */}
                      {sub.recallResults && sub.recallResults.length > 0 ? (
                        <RecallResultList recallResults={sub.recallResults} />
                      ) : null}
                    </div>
                  ))
                ) : (
                  <>
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
                  </>
                )}
            </div>
          </div>
        </div>
      </motion.div>

      {!isLast && <div className="absolute left-3 top-full h-3 w-px bg-border/60" />}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export const LuzzyThinkingTimeline = React.memo(function LuzzyThinkingTimeline({
  cot,
  isGenerating,
  agentSteps,
}: LuzzyThinkingTimelineProps) {
  const thinkingSteps = React.useMemo(
    () => parseThinkingSteps(cot, isGenerating),
    [cot, isGenerating],
  );
  const allSteps = React.useMemo(
    () => mergeSteps(thinkingSteps, agentSteps),
    [thinkingSteps, agentSteps],
  );
  // v0.8.12: 修复思考卡片"一瞬间蹦出全部"的真正根因
  // useDeferredValue 会把 allSteps 更新标记为低优先级，流式期间主线程繁忙时被无限期推迟，
  // 直到流式结束 React 才一次性应用所有延迟更新，造成"全部一起蹦出来"的视觉效果。
  // 修复模式（参考 chat.tsx 第 213-214 行已验证模式）：
  //   - 始终调用 useDeferredValue（遵守 Rules of Hooks，避免 Hook 数量变化崩溃）
  //   - 流式期用 allSteps 直接渲染（逐字），非流式期用 deferredSteps（长列表优化）
  const deferredSteps = React.useDeferredValue(allSteps);
  const renderSteps = isGenerating ? allSteps : deferredSteps;
  const [expandedStep, setExpandedStep] = React.useState<number | null>(0);
  const prevStepsLengthRef = React.useRef(0);

  React.useEffect(() => {
    if (isGenerating && allSteps.length > 0) {
      if (allSteps.length > prevStepsLengthRef.current) {
        // v0.8.12: 用 renderSteps.length 与渲染源保持一致，避免索引错位
        setExpandedStep(renderSteps.length > 0 ? renderSteps.length - 1 : 0);
      }
    }
    prevStepsLengthRef.current = allSteps.length;
    // v0.8.12: 依赖 renderSteps.length 而非 deferredSteps.length，与渲染源保持一致
  }, [isGenerating, allSteps.length, renderSteps.length]);

  // v0.8.12: 用 renderSteps.length 判断，与渲染源保持一致
  if (renderSteps.length === 0) {
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
        {/* v0.8.12: 渲染源改为 renderSteps（流式期=allSteps 逐字，非流式期=deferredSteps 优化） */}
        {renderSteps.map((step, idx) => {
          const isExpanded = expandedStep === idx;
          const onToggle = () => setExpandedStep(isExpanded ? null : idx);
          if (isToolStep(step)) {
            return (
              <ToolNode
                key={`${step.title}-${idx}`}
                step={step}
                isExpanded={isExpanded}
                onToggle={onToggle}
                isLast={idx === renderSteps.length - 1} // v0.8.7-urgent: C10 修复 — v0.8.12 与 renderSteps 一致
              />
            );
          }
          // v0.5.5-arch: brainstorm/cot_output/thinking 都用 ThinkingNode 渲染
          // 通过 type 字段在 ThinkingNode 内部区分图标和配色
          // v0.8.7-urgent: D15 优化 — 直接传递 step 引用，避免内联对象破坏 memo
          return (
            <ThinkingNode
              key={`${step.title}-${idx}`}
              step={step as unknown as ThinkingStep}
              isExpanded={isExpanded}
              onToggle={onToggle}
              isLast={idx === deferredSteps.length - 1} // v0.8.7-urgent: C10 修复 — 与 deferredSteps 一致
              nodeType={
                isBrainstormStep(step)
                  ? "brainstorm"
                  : isCotOutputStep(step)
                    ? "cot_output"
                    : "thinking"
              }
            />
          );
        })}
      </div>
    </div>
  );
});
