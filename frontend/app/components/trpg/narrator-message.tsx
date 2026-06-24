/**
 * Narrator 消息组件
 *
 * 渲染 TRPG 管线的完整输出：
 * - 思考链折叠区（reasoningContent）
 * - 工具调用列表（toolCalls）
 * - Narrator 7 段内容（narratorSections）
 *   1. 记忆引用（memoryRef）- 折叠，默认收起
 *   2. 剧情分析（plotAnalysis）- 折叠，默认收起
 *   3. 判定汇总（checkSummary）- 折叠，默认展开
 *   4. 剧情正文（narrative）- 主展示区，Markdown 渲染
 *   5. 行动选项（actionOptions）- A-E 卡片
 *   6. 状态信息（statusInfo）- 紧凑显示
 *   7. ReAct 反思（reactReflection）- 折叠，默认收起
 *
 * 动画：三态丝滑（进入 springEnter / 交互 pressableSubtle / 退出 fadeSlide）
 * 图标：全部来自 game-icon-pack
 */

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  IconBook,
  IconSearch,
  IconDice,
  IconDocument,
  IconArrow,
  IconInfo,
  IconRefresh,
  IconChevronRight,
  IconWand,
  IconCheck,
  IconExclamation,
} from "~/components/luzzy/luzzy-icons";

import type { TrpgMessage, NarratorSections, ActionOption } from "~/types/trpg";
import Markdown from "~/components/markdown/markdown";
import { springSoft, easeFast } from "~/lib/motion-presets";

// ============================================================================
// Props
// ============================================================================

interface NarratorMessageProps {
  message: TrpgMessage;
  /** 点击行动选项的回调 */
  onSelectAction?: (option: ActionOption) => void;
}

// ============================================================================
// 主组件
// ============================================================================

export function NarratorMessage({ message, onSelectAction }: NarratorMessageProps) {
  const sections = message.narratorSections;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={springSoft}
      className="flex w-full flex-col gap-2"
    >
      {/* 思考链折叠区 */}
      {message.reasoningContent && (
        <CollapsibleSection
          icon={<IconBook className="size-3.5" />}
          title="思考链"
          defaultOpen={false}
        >
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {message.reasoningContent}
          </div>
        </CollapsibleSection>
      )}

      {/* 工具调用列表 */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolCallsList toolCalls={message.toolCalls} />
      )}

      {/* Narrator 7 段 或 纯文本回退 */}
      {sections ? (
        <NarratorSectionsView sections={sections} onSelectAction={onSelectAction} />
      ) : (
        <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
          <Markdown content={message.content || ""} />
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Narrator 7 段视图
// ============================================================================

function NarratorSectionsView({
  sections,
  onSelectAction,
}: {
  sections: NarratorSections;
  onSelectAction?: (option: ActionOption) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="flex flex-col gap-2"
    >
      {/* 1. 记忆引用（折叠，默认收起） */}
      {sections.memoryRef && (
        <CollapsibleSection
          icon={<IconBook className="size-3.5" />}
          title="记忆引用"
          defaultOpen={false}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">{sections.memoryRef}</p>
        </CollapsibleSection>
      )}

      {/* 2. 剧情分析（折叠，默认收起） */}
      {sections.plotAnalysis && (
        <CollapsibleSection
          icon={<IconSearch className="size-3.5" />}
          title="剧情分析"
          defaultOpen={false}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">{sections.plotAnalysis}</p>
        </CollapsibleSection>
      )}

      {/* 3. 判定汇总（折叠，默认展开） */}
      {sections.checkSummary && (
        <CollapsibleSection
          icon={<IconDice className="size-3.5" />}
          title="判定汇总"
          defaultOpen={true}
        >
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {sections.checkSummary}
          </p>
        </CollapsibleSection>
      )}

      {/* 4. 剧情正文（主展示区） */}
      {sections.narrative && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
          className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <IconDocument className="size-3.5" />
            <span>剧情正文</span>
          </div>
          <div className="text-sm leading-relaxed">
            <Markdown content={sections.narrative} />
          </div>
        </motion.div>
      )}

      {/* 5. 行动选项（A-E 卡片） */}
      {sections.actionOptions && sections.actionOptions.length > 0 && (
        <ActionOptionsGrid options={sections.actionOptions} onSelectAction={onSelectAction} />
      )}

      {/* 6. 状态信息（紧凑显示） */}
      {sections.statusInfo && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
          className="flex items-start gap-1.5 rounded-md border border-border/20 bg-muted/10 px-2.5 py-1.5"
        >
          <IconInfo className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{sections.statusInfo}</p>
        </motion.div>
      )}

      {/* 7. ReAct 反思（折叠，默认收起） */}
      {sections.reactReflection && (
        <CollapsibleSection
          icon={<IconRefresh className="size-3.5" />}
          title="ReAct 反思"
          defaultOpen={false}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            {sections.reactReflection}
          </p>
        </CollapsibleSection>
      )}
    </motion.div>
  );
}

// ============================================================================
// 行动选项网格
// ============================================================================

function ActionOptionsGrid({
  options,
  onSelectAction,
}: {
  options: ActionOption[];
  onSelectAction?: (option: ActionOption) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <IconArrow className="size-3.5" />
        <span>行动选项</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {options.map((option, index) => (
          <motion.button
            key={option.label}
            type="button"
            onClick={() => onSelectAction?.(option)}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springSoft, delay: index * 0.05 }}
            whileHover={{ scale: 1.02, x: 2 }}
            whileTap={{ scale: 0.98 }}
            className="group flex items-start gap-2 rounded-md border border-border/30 bg-background/40 p-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
              {option.label}
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground group-hover:text-foreground">
              {option.description}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// 工具调用列表
// ============================================================================

function ToolCallsList({ toolCalls }: { toolCalls: NonNullable<TrpgMessage["toolCalls"]> }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-md border border-border/20 bg-muted/10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30"
      >
        <IconWand className="size-3.5 text-primary/70" />
        <span className="font-medium">工具调用（{toolCalls.length}）</span>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={easeFast}
          className="ml-auto"
        >
          <IconChevronRight className="size-3" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSoft}
            className="overflow-hidden"
          >
            <div className="space-y-1 px-2.5 pb-2">
              {toolCalls.map((tc) => (
                <div key={tc.id} className="rounded border border-border/20 bg-background/30 p-1.5">
                  <div className="flex items-center gap-1.5">
                    <IconCheck className="size-3 text-green-500" />
                    <span className="font-mono text-[11px] text-foreground">{tc.name}</span>
                  </div>
                  {tc.result && (
                    <p className="mt-1 line-clamp-3 font-mono text-[10px] text-muted-foreground">
                      {tc.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// 折叠区组件
// ============================================================================

function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-md border border-border/20 bg-muted/10">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.99 }}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30"
      >
        {icon}
        <span className="font-medium">{title}</span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={easeFast} className="ml-auto">
          <IconChevronRight className="size-3" />
        </motion.div>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSoft}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
