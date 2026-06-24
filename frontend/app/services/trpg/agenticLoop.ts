/**
 * TRPG 两阶段 agentic 工具调用闭环
 *
 * 阶段 1：发送 tools，让模型只输出 reasoning + tool_calls
 * 阶段 2：将 tool_calls 与执行结果回传，让模型生成最终回复
 */

import { sendStreamRequest, buildApiRequestBody, parseSSEChunk } from "~/services/apiClient";
import { logger } from "~/services/logger";

export interface ToolCallSpec {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: string;
  result: string;
}

export interface AgenticLoopCallbacks {
  onFirstReasoningDelta?: (delta: string) => void;
  onFirstContentDelta?: (delta: string) => void;
  onFinalReasoningDelta?: (delta: string) => void;
  onFinalContentDelta?: (delta: string) => void;
}

export interface AgenticLoopResult {
  firstReasoningContent: string;
  firstContent: string;
  finalReasoningContent: string;
  finalContent: string;
  toolCalls: ToolCallResult[];
}

export type ApiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string; name?: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCallSpec[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface StreamAccumulateResult {
  content: string;
  reasoningContent: string;
  toolCalls: ToolCallSpec[];
}

function replaceSystemPrompt(messages: ApiMessage[], appendText: string): ApiMessage[] {
  return messages.map((m) =>
    m.role === "system" ? { ...m, content: `${m.content}\n\n${appendText}` } : m,
  );
}

async function streamAndAccumulate(params: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
}): Promise<StreamAccumulateResult> {
  let content = "";
  let reasoningContent = "";
  const accumulatedToolCalls: ToolCallSpec[] = [];

  await sendStreamRequest({
    url: params.url,
    apiKey: params.apiKey,
    body: params.body,
    signal: undefined,
    onChunk: (_dataStr, parsed) => {
      const chunk = parseSSEChunk(parsed);

      if (chunk.reasoningContent) {
        reasoningContent += chunk.reasoningContent;
        params.onReasoningDelta?.(chunk.reasoningContent);
      }

      if (chunk.content) {
        content += chunk.content;
        params.onContentDelta?.(chunk.content);
      }

      if (chunk.toolCalls && chunk.toolCalls.length > 0) {
        for (const tc of chunk.toolCalls) {
          const existing = accumulatedToolCalls.find((t) => t.id === tc.id && tc.id);
          if (existing) {
            existing.function.name += tc.function?.name ?? "";
            existing.function.arguments += tc.function?.arguments ?? "";
          } else {
            accumulatedToolCalls.push({
              id: tc.id ?? "",
              function: {
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              },
            });
          }
        }
      }
    },
  });

  return { content, reasoningContent, toolCalls: accumulatedToolCalls };
}

async function executeToolCalls(
  toolCalls: ToolCallSpec[],
  executor: (name: string, args: Record<string, unknown>) => string,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const tc of toolCalls) {
    let result: string;
    try {
      const args = JSON.parse(tc.function.arguments);
      result = executor(tc.function.name, args);
    } catch (e) {
      result = JSON.stringify({ error: String(e) });
      logger.warn("trpg", `工具执行失败: ${tc.function.name} - ${String(e)}`);
    }

    results.push({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
      result,
    });
  }

  return results;
}

export async function runAgenticToolLoop(params: {
  url: string;
  apiKey: string;
  model: string;
  customRequestBody?: string;
  messages: ApiMessage[];
  tools: Array<unknown>;
  toolExecutor: (name: string, args: Record<string, unknown>) => string;
  firstSystemAppend?: string;
  finalSystemAppend?: string;
  callbacks?: AgenticLoopCallbacks;
  maxLoops?: number;
}): Promise<AgenticLoopResult> {
  const maxLoops = Math.max(1, params.maxLoops ?? 2);

  logger.info("trpg", "第一阶段开始：推理与工具规划");

  const firstMessages = params.firstSystemAppend
    ? replaceSystemPrompt(params.messages, params.firstSystemAppend)
    : params.messages;

  const firstBody = buildApiRequestBody(
    {
      model: params.model,
      messages: firstMessages,
      stream: true,
      temperature: 0.8,
      tools: params.tools,
      tool_choice: "auto",
    },
    {
      thinkingDepth: "auto",
      enableThinking: true,
      customRequestBody: params.customRequestBody,
    },
  );

  const firstResult = await streamAndAccumulate({
    url: params.url,
    apiKey: params.apiKey,
    body: firstBody,
    onReasoningDelta: params.callbacks?.onFirstReasoningDelta,
    onContentDelta: params.callbacks?.onFirstContentDelta,
  });

  logger.info(
    "trpg",
    `第一阶段完成: reasoning=${firstResult.reasoningContent.length}chars content=${firstResult.content.length}chars toolCalls=${firstResult.toolCalls.length}`,
  );

  if (firstResult.toolCalls.length === 0) {
    return {
      firstReasoningContent: firstResult.reasoningContent,
      firstContent: firstResult.content,
      finalReasoningContent: firstResult.reasoningContent,
      finalContent: firstResult.content,
      toolCalls: [],
    };
  }

  const toolResults = await executeToolCalls(firstResult.toolCalls, params.toolExecutor);

  logger.info("trpg", `工具执行完成: ${toolResults.length} 个结果`);

  logger.info("trpg", "第二阶段开始：基于工具结果生成最终回复");

  const assistantToolCallMessage: ApiMessage = {
    role: "assistant",
    content: firstResult.content,
    tool_calls: firstResult.toolCalls.map((tc) => ({
      id: tc.id,
      function: tc.function,
    })),
  };

  const toolResultMessages: ApiMessage[] = toolResults.map((tr) => ({
    role: "tool",
    content: tr.result,
    tool_call_id: tr.id,
  }));

  const finalMessagesBase = [...params.messages, assistantToolCallMessage, ...toolResultMessages];

  const finalMessages = params.finalSystemAppend
    ? replaceSystemPrompt(finalMessagesBase, params.finalSystemAppend)
    : finalMessagesBase;

  const finalBody = buildApiRequestBody(
    {
      model: params.model,
      messages: finalMessages,
      stream: true,
      temperature: 0.8,
    },
    {
      thinkingDepth: "auto",
      enableThinking: true,
      customRequestBody: params.customRequestBody,
    },
  );

  const finalResult = await streamAndAccumulate({
    url: params.url,
    apiKey: params.apiKey,
    body: finalBody,
    onReasoningDelta: params.callbacks?.onFinalReasoningDelta,
    onContentDelta: params.callbacks?.onFinalContentDelta,
  });

  logger.info(
    "trpg",
    `第二阶段完成: reasoning=${finalResult.reasoningContent.length}chars content=${finalResult.content.length}chars`,
  );

  if (finalResult.toolCalls.length > 0 && maxLoops > 2) {
    logger.info("trpg", `第二阶段产生新工具调用，进入下一轮 (剩余 ${maxLoops - 2})`);

    const next = await runAgenticToolLoop({
      ...params,
      messages: [
        ...finalMessages,
        {
          role: "assistant",
          content: finalResult.content,
          tool_calls: finalResult.toolCalls.map((tc) => ({
            id: tc.id,
            function: tc.function,
          })),
        },
      ],
      maxLoops: maxLoops - 1,
      firstSystemAppend: undefined,
      finalSystemAppend: undefined,
      callbacks: {
        onFirstReasoningDelta: params.callbacks?.onFinalReasoningDelta,
        onFirstContentDelta: params.callbacks?.onFinalContentDelta,
        onFinalReasoningDelta: params.callbacks?.onFinalReasoningDelta,
        onFinalContentDelta: params.callbacks?.onFinalContentDelta,
      },
    });

    return {
      firstReasoningContent: firstResult.reasoningContent,
      firstContent: firstResult.content,
      finalReasoningContent: next.finalReasoningContent,
      finalContent: next.finalContent,
      toolCalls: [...toolResults, ...next.toolCalls],
    };
  }

  return {
    firstReasoningContent: firstResult.reasoningContent,
    firstContent: firstResult.content,
    finalReasoningContent: finalResult.reasoningContent,
    finalContent: finalResult.content,
    toolCalls: toolResults,
  };
}
