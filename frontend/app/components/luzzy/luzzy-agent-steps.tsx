/**
 * LUZZY Agent 执行步骤卡片组件（v0.3.0 新增）
 *
 * 在 Agent 消息气泡内渲染执行步骤二级卡片：
 * - thinking：模型思考链
 * - tool_call：工具调用
 * - tool_result：工具结果
 * - memory_inject：记忆注入
 * - knowledge_call：知识库调用
 *
 * 每个卡片可折叠，默认收起，点击展开。
 * 状态指示器：running（旋转图标）/ completed（对勾）/ error（叉号）。
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";

import type { AgentStep } from "~/types/luzzy";
import Markdown from "~/components/markdown/markdown";
import {
  IconLight,
  IconToolKit,
  IconBook,
  IconSearch,
  IconCheck,
  IconClose,
  IconArrowUp,
  IconArrowDown,
} from "~/components/luzzy/luzzy-icons";

interface LuzzyAgentStepsProps {
  /** 步骤列表 */
  steps: AgentStep[];
}

/** 步骤类型 → 图标映射 */
const StepIcon: React.FC<{ type: AgentStep["type"] }> = ({ type }) => {
  switch (type) {
    case "thinking":
      return <IconLight className="size-3.5" />;
    case "tool_call":
    case "tool_result":
      return <IconToolKit className="size-3.5" />;
    case "memory_inject":
      return <IconBook className="size-3.5" />;
    case "knowledge_call":
      return <IconSearch className="size-3.5" />;
    default:
      return <IconToolKit className="size-3.5" />;
  }
};

/** 步骤类型 → 标签映射 */
const StepLabel: React.FC<{ type: AgentStep["type"] }> = ({ type }) => {
  switch (type) {
    case "thinking":
      return <span>模型思考</span>;
    case "tool_call":
      return <span>工具调用</span>;
    case "tool_result":
      return <span>工具结果</span>;
    case "memory_inject":
      return <span>记忆注入</span>;
    case "knowledge_call":
      return <span>知识库调用</span>;
    default:
      return <span>步骤</span>;
  }
};

/** 状态指示器 */
const StatusIndicator: React.FC<{ status: AgentStep["status"] }> = ({ status }) => {
  if (status === "running") {
    return (
      <motion.span
        className="inline-block size-2 rounded-full bg-blue-500"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }
  if (status === "completed") {
    return <IconCheck className="size-3 text-green-500" />;
  }
  if (status === "error") {
    return <IconClose className="size-3 text-red-500" />;
  }
  return null;
};

/** 单个步骤卡片 */
const StepCard = React.memo(function StepCard({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = React.useState(false);

  const hasContent = !!step.content?.trim();
  const preview = hasContent
    ? step.content!.length > 80
      ? step.content!.slice(0, 80) + "..."
      : step.content
    : "";

  return (
    <div className="w-full rounded-md border border-muted bg-muted/30 text-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        onClick={() => hasContent && setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        disabled={!hasContent}
      >
        <StepIcon type={step.type} />
        <StepLabel type={step.type} />
        {step.title && step.title !== step.type && (
          <span className="ml-1 truncate text-[11px] opacity-60">{step.title}</span>
        )}
        {!expanded && hasContent && (
          <span className="ml-1 truncate text-[11px] opacity-50">{preview}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <StatusIndicator status={step.status} />
          {hasContent &&
            (expanded ? (
              <IconArrowUp className="size-3.5" />
            ) : (
              <IconArrowDown className="size-3.5" />
            ))}
        </span>
      </button>
      {expanded && hasContent && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: "1fr", opacity: 1 }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-muted px-3 py-2 text-sm text-muted-foreground">
              <Markdown content={step.content!} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export function LuzzyAgentSteps({ steps }: LuzzyAgentStepsProps) {
  const deferredSteps = React.useDeferredValue(steps);
  if (!steps || steps.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {deferredSteps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="cv-auto"
          >
            <StepCard step={step} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
