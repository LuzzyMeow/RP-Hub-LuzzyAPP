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
 * 从段落中提取步骤标题
 *
 * v0.3.5: 识别 CoT 内容中的步骤标记，提取真正的"思维节点"名称
 * 支持格式：
 *   - Step1、Step 1、Step1：xxx、Step 1：xxx
 *   - 【Step1】、【Step 1：xxx】
 *   - **Step1**、**Step 1：xxx**
 *   - **Step1：宇宙声明与认知隔离**
 * 若无法匹配步骤标记，根据内容关键词智能识别
 */
function extractStepTitle(para: string, fallbackIndex: number): string {
  // 1. 优先匹配 **Step N：xxx** 或 **Step N: xxx** 格式（含中文/英文冒号）
  // v0.3.7: 兼容中点 · 分隔符（防御性处理）
  const boldStepMatch = para.match(/\*+\s*Step\s*(\d+)\s*[:：·]\s*([^*\n*【】]+)/i);
  if (boldStepMatch) {
    return boldStepMatch[2].trim();
  }

  // 2. 匹配 **Step N** 格式（仅步骤号，无名称）
  const boldStepOnlyMatch = para.match(/\*+\s*Step\s*(\d+)\s*\*+/i);
  if (boldStepOnlyMatch) {
    return `Step ${boldStepOnlyMatch[1]}`;
  }

  // 3. 匹配 【Step N：xxx】 或 【Step N: xxx】 格式
  // v0.3.7: 兼容中点 · 分隔符
  const bracketStepMatch = para.match(/【\s*Step\s*(\d+)\s*[:：·]\s*([^】]+)】/i);
  if (bracketStepMatch) {
    return bracketStepMatch[2].trim();
  }

  // 4. 匹配 【Step N】 格式
  const bracketStepOnlyMatch = para.match(/【\s*Step\s*(\d+)\s*】/i);
  if (bracketStepOnlyMatch) {
    return `Step ${bracketStepOnlyMatch[1]}`;
  }

  // 5. 匹配行首 Step N：xxx 或 Step N: xxx 格式
  const lineStepMatch = para.match(/^Step\s*(\d+)\s*[:：]\s*([^\n]+)/i);
  if (lineStepMatch) {
    return lineStepMatch[2].trim();
  }

  // 6. 匹配行首 Step N 格式
  const lineStepOnlyMatch = para.match(/^Step\s*(\d+)/i);
  if (lineStepOnlyMatch) {
    return `Step ${lineStepOnlyMatch[1]}`;
  }

  // 7. 关键词智能识别（基于 CoT 14 步路径的常见关键词）
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

  // 8. 兜底：使用"思考步骤 N"
  return `思考步骤 ${fallbackIndex + 1}`;
}

/**
 * 将 CoT 文本拆分为多个思考步骤
 *
 * v0.3.6: 彻底重写分段逻辑，解决 Step 卡片不生效问题
 * 1. 优先按 **Step N 标记切分（兼容单换行和双换行分隔）
 * 2. 回退到双换行分段
 * 3. 实现短段落合并（<10 字符合并到上一个，兑现历史注释承诺）
 *
 * v0.4.0: 添加完成态结果缓存，避免重复解析相同内容
 */
// v0.4.0: parseThinkingSteps 结果缓存（仅缓存完成态，流式态内容持续变化不缓存）
const parseThinkingStepsCache = new Map<string, ThinkingStep[]>();
const MAX_PARSE_CACHE_SIZE = 20;

function parseThinkingSteps(cot: string, isGenerating: boolean): ThinkingStep[] {
  if (!cot.trim()) return [];

  // v0.4.0: 完成态使用缓存
  if (!isGenerating) {
    const cached = parseThinkingStepsCache.get(cot);
    if (cached) return cached;
  }

  // 优先按 **Step N 标记切分（v0.3.6 核心修复）
  // v0.3.7: 同时匹配 **Step N 和 【Step N 两种格式，确保所有 step 卡片正确切分
  // 使用前瞻断言，保留分隔标记在结果中
  // v0.4.0-patch3: 不再 filter 掉非 Step 段落（修复 BUG：原生思考内容在 Step 标记出现后被丢弃，
  //               导致流式中"思考内容被截断"。非 Step 前缀段落作为第一个节点保留）
  const stepMarkerRegex = /(?=\*\*\s*Step\s*\d+|【\s*Step\s*\d+)/i;
  const hasStepMarkers = /\*\*\s*Step\s*\d+|【\s*Step\s*\d+/i.test(cot);

  let paragraphs: string[];
  if (hasStepMarkers) {
    paragraphs = cot
      .split(stepMarkerRegex)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  } else {
    // v0.4.0: 不包含 Step 标记的内容（如模型原生思考），作为单个"头脑风暴"节点
    // 不再按双换行分段，避免原生思考内容被拆成多个无意义节点
    paragraphs = [cot.trim()];
  }

  if (paragraphs.length === 0) return [];

  // 短段落合并（<10 字符合并到上一个，兑现历史注释承诺）
  const merged: string[] = [];
  for (const para of paragraphs) {
    if (para.length < 10 && merged.length > 0) {
      merged[merged.length - 1] += "\n" + para;
    } else {
      merged.push(para);
    }
  }

  // 生成步骤节点
  const steps: ThinkingStep[] = [];
  for (let i = 0; i < merged.length; i++) {
    const para = merged[i];
    // 生成中时，最后一个段落为 running 状态
    const isLast = i === merged.length - 1;
    const status: "running" | "completed" = isGenerating && isLast ? "running" : "completed";

    // v0.4.0: 不包含 Step 标记的内容（原生思考），标题固定为"头脑风暴"
    // 包含 Step 标记的内容，提取真正的步骤标题
    const title = hasStepMarkers ? extractStepTitle(para, i) : "头脑风暴";

    steps.push({
      title,
      content: para,
      status,
    });
  }

  // v0.4.0: 仅缓存完成态结果，限制缓存大小
  if (!isGenerating) {
    if (parseThinkingStepsCache.size >= MAX_PARSE_CACHE_SIZE) {
      const firstKey = parseThinkingStepsCache.keys().next().value;
      if (firstKey) parseThinkingStepsCache.delete(firstKey);
    }
    parseThinkingStepsCache.set(cot, steps);
  }

  return steps;
}

// ============================================================================
// 打字机效果 Hook
// ============================================================================

/**
 * 打字机效果 Hook
 *
 * v0.3.6: 重写为 requestAnimationFrame + 增量追赶快照模式
 * 解决问题：旧版每次 fullText 变化都重建 setInterval，流式时定时器堆积导致 UI 卡顿
 * 新版用 rAF 平滑追赶，单一定时器，性能显著提升
 *
 * v0.4.3: 恢复轻量打字机效果,每帧追加 8-16 字符,平衡流式实时性与性能
 * 生成中时逐字渲染,生成完成后直接显示完整文本
 */
function useTypewriter(fullText: string, isGenerating: boolean, speed = 30): string {
  const [displayedText, setDisplayedText] = React.useState("");
  const rafRef = React.useRef<number | null>(null);
  const displayedRef = React.useRef("");

  React.useEffect(() => {
    if (!isGenerating) {
      // 生成完成,直接显示完整文本
      displayedRef.current = fullText;
      setDisplayedText(fullText);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // v0.4.3: rAF 追赶机制,每帧追加 8-16 字符(根据内容长度自适应)
    const animate = () => {
      const current = displayedRef.current;
      if (current.length >= fullText.length) {
        rafRef.current = null;
        return;
      }
      // 每帧追加量:基础 8 + 内容长度自适应(最多 16)
      const step = Math.min(
        Math.max(8, Math.ceil(fullText.length / 60)),
        16,
      );
      const nextLen = Math.min(current.length + step, fullText.length);
      const next = fullText.slice(0, nextLen);
      displayedRef.current = next;
      setDisplayedText(next);
      rafRef.current = requestAnimationFrame(animate);
    };

    // 若当前显示长度已落后于 fullText,启动追赶
    if (displayedRef.current.length < fullText.length) {
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fullText, isGenerating, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  return displayedText;
}

// ============================================================================
// 主组件
// ============================================================================

export function LuzzyThinkingTimeline({ cot, isGenerating }: LuzzyThinkingTimelineProps) {
  const steps = React.useMemo(() => parseThinkingSteps(cot, isGenerating), [cot, isGenerating]);
  const [expandedStep, setExpandedStep] = React.useState<number | null>(0);
  // v0.4.3: 记录上一次 steps 数量,仅在新 Step 出现时展开新节点,不强制收起旧 Step
  const prevStepsLengthRef = React.useRef(0);

  React.useEffect(() => {
    if (isGenerating && steps.length > 0) {
      // 仅当新增了 Step 时才展开最新的 Step,不收起已展开的旧 Step
      if (steps.length > prevStepsLengthRef.current) {
        setExpandedStep(steps.length - 1);
      }
    }
    prevStepsLengthRef.current = steps.length;
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
      <div className="absolute left-0 top-0 flex size-6 shrink-0 items-center justify-center">
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
        className="flex w-full min-w-0 items-center gap-1.5 text-left leading-6"
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
                <Markdown content={displayedContent} isAnimating={false} />
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
