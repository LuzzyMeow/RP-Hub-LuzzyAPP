/**
 * 设计模式 API 流
 * v0.8.2: 处理设计模式下的流式请求、工具调用收集与执行
 * v0.8.3: 升级为两阶段 agentic 闭环（工具结果回传 LLM）
 */

import type { DesignSession, TrpgMessage } from "~/types/trpg";
import { runAgenticToolLoop, type ToolCallResult } from "./agenticLoop";
import { buildDesignModeSystemPrompt } from "./designMode";
import { buildDesignModeToolDescriptions, executeDesignModeToolCall } from "./designModeTools";
import { getChatCompletionsUrl } from "~/services/providerService";

export interface DesignModeStreamCallbacks {
  onFirstContentDelta?: (delta: string) => void;
  onFirstReasoningDelta?: (delta: string) => void;
  onFinalContentDelta?: (delta: string) => void;
  onFinalReasoningDelta?: (delta: string) => void;
  onToolCall?: (toolCall: NonNullable<TrpgMessage["toolCalls"]>[number]) => void;
}

export interface DesignModeStreamResult {
  content: string;
  reasoningContent: string;
  toolCalls: TrpgMessage["toolCalls"];
  /** 工具执行后 session 是否被更新 */
  sessionUpdated: boolean;
  /** 是否有工具执行失败 */
  hasToolError: boolean;
}

/**
 * 发送设计模式消息
 *
 * @param session 当前设计会话
 * @param input 用户输入
 * @param apiConfig API 配置
 * @param callbacks 流式回调
 * @returns 流式结果（包含完整 content 和 toolCalls）
 */
export async function sendDesignModeMessage(
  session: DesignSession,
  input: string,
  apiConfig: {
    url: string;
    apiKey: string;
    model: string;
    customRequestBody?: string;
  },
  callbacks?: DesignModeStreamCallbacks,
): Promise<DesignModeStreamResult> {
  const systemPrompt = buildDesignModeSystemPrompt(session);

  const historyMessages = session.messages
    .filter(
      (m): m is TrpgMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ role: m.role, content: m.content }));

  let sessionUpdated = false;
  let hasToolError = false;

  const toolExecutor = (name: string, args: Record<string, unknown>) => {
    const execResult = executeDesignModeToolCall(name, args, { session });

    if (execResult.error) {
      hasToolError = true;
    }
    if (execResult.sessionUpdated) {
      sessionUpdated = true;
    }

    return JSON.stringify(execResult.result);
  };

  const loopResult = await runAgenticToolLoop({
    url: getChatCompletionsUrl(apiConfig.url),
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    customRequestBody: apiConfig.customRequestBody,
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: input },
    ],
    tools: buildDesignModeToolDescriptions(),
    toolExecutor,
    firstSystemAppend:
      "【阶段 1：设计规划】\n" +
      "本轮你只输出思考过程和必要的设计工具调用（如 write_card、patch_card、set_world_card_field 等）。\n" +
      "不要生成面向用户的闲聊或总结。工具执行结果会在下一阶段回传给你。",
    finalSystemAppend:
      "【阶段 2：基于工具执行结果回复用户】\n" +
      "上面的 tool 消息是本地引擎执行设计工具后的真实结果。\n" +
      "请基于这些结果生成面向用户的引导文案，总结已完成的工作，并告知下一步。",
    callbacks: {
      onFirstReasoningDelta: callbacks?.onFirstReasoningDelta,
      onFirstContentDelta: callbacks?.onFirstContentDelta,
      onFinalReasoningDelta: callbacks?.onFinalReasoningDelta,
      onFinalContentDelta: callbacks?.onFinalContentDelta,
    },
    maxLoops: 3,
  });

  const toolCalls: NonNullable<TrpgMessage["toolCalls"]> = loopResult.toolCalls.map(
    (tr: ToolCallResult) => ({
      id: tr.id,
      name: tr.name,
      arguments: tr.arguments,
      result: tr.result,
    }),
  );

  for (const tc of toolCalls) {
    callbacks?.onToolCall?.(tc);
  }

  return {
    content: loopResult.finalContent,
    reasoningContent:
      loopResult.firstReasoningContent +
      (loopResult.finalReasoningContent
        ? `\n\n[阶段 2 思考]\n${loopResult.finalReasoningContent}`
        : ""),
    toolCalls,
    sessionUpdated,
    hasToolError,
  };
}
