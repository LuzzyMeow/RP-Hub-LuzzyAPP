/**
 * ACE Reflector 服务 — v0.3.0
 *
 * 调用 LLM 分析本次交互，产出策略评估和新策略建议。
 *
 * 核心能力：
 * - reflect(): 分析执行轨迹，评估已用策略，提炼新策略
 * - 独立系统提示词（不注入 NSFW 预设内容，防污染）
 * - 使用全局默认模型（非 agent 框架的模型）
 * - JSON 输出解析与容错
 *
 * 约束：
 * - 反思不阻塞主响应（调用方负责异步调度）
 * - 反思失败不抛错，返回空结果
 * - 输入仅含摘要，不含完整 NSFW 内容
 */

import type {
  AceReflection,
  AceExecutionTrace,
  AceSkill,
  ApiSettings,
  ApiProvider,
} from '~/types/luzzy';
import {
  parseModelName,
  getApiUrlForModel,
  getApiKeyForModel,
  getActualModelName,
  getOpenAICompatUrl,
} from '~/services/providerService';
import { sendRequest } from '~/services/apiClient';

// ============================================================================
// 常量
// ============================================================================

/** 反思用的系统提示词（独立通道，不含 NSFW 预设） */
const REFLECTOR_SYSTEM_PROMPT = `You are an ACE (Agentic Context Engineering) reflection engine.

Your task is to analyze a conversation interaction and evaluate the effectiveness of applied memory strategies (skills), then suggest new reusable strategies.

## Input
You will receive:
1. A brief execution trace (user input summary, agent steps, output summary)
2. A list of applied strategies (id, category, content)

## Output Format
Respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "evaluations": [
    {
      "skillId": "mem-XXXXX",
      "verdict": "helpful" | "harmful" | "neutral",
      "reason": "brief explanation"
    }
  ],
  "newSkills": [
    {
      "category": "short tag",
      "content": "reusable strategy description"
    }
  ]
}

## Guidelines
- "helpful": the strategy was relevant and improved the response
- "harmful": the strategy was misleading or caused a worse response
- "neutral": the strategy had no observable effect
- Only suggest newSkills that are genuinely reusable across conversations
- Keep newSkills concise (1-2 sentences each)
- Use English category tags (e.g., "tone", "format", "safety", "context")
- If no strategies were applied, return empty evaluations array
- If no new strategies are needed, return empty newSkills array`;

// ============================================================================
// 类型
// ============================================================================

/** Reflector 参数 */
export interface ReflectParams {
  /** 执行轨迹（摘要） */
  trace: AceExecutionTrace;
  /** 本次应用的 active 策略列表 */
  appliedSkills: AceSkill[];
  /** API 设置（使用全局默认模型） */
  settings: ApiSettings;
  /** 供应商列表 */
  providers: ApiProvider[];
  /** 供应商 API Key 映射 */
  providerKeys: Record<string, string>;
  /** 中止信号 */
  signal?: AbortSignal;
}

// ============================================================================
// 核心实现
// ============================================================================

/**
 * 构建反思用户消息
 *
 * 格式固定，仅含摘要不含完整内容。
 */
const buildReflectUserMessage = (
  trace: AceExecutionTrace,
  appliedSkills: AceSkill[],
): string => {
  const parts: string[] = [];

  parts.push('## Execution Trace');
  parts.push(`- User Input Summary: ${trace.userInputSummary}`);
  parts.push(`- Agent Steps: ${trace.agentSteps.join(' → ') || '(none)'}`);
  parts.push(`- Output Summary: ${trace.outputSummary}`);
  parts.push(`- Timestamp: ${trace.timestamp}`);

  if (appliedSkills.length > 0) {
    parts.push('');
    parts.push('## Applied Strategies');
    for (const skill of appliedSkills) {
      parts.push(`- [${skill.id}] (${skill.category}) ${skill.content}`);
    }
  } else {
    parts.push('');
    parts.push('## Applied Strategies');
    parts.push('(none)');
  }

  parts.push('');
  parts.push('## Task');
  parts.push('Evaluate the applied strategies and suggest new reusable strategies. Respond with JSON only.');

  return parts.join('\n');
};

/**
 * 解析 LLM 返回的 JSON
 *
 * 容错处理：
 * - 去除可能的 markdown 代码块包裹
 * - 解析失败返回空结果
 */
const parseReflectionJson = (text: string): AceReflection => {
  const empty: AceReflection = { evaluations: [], newSkills: [] };

  let cleaned = text.trim();
  // 去除 markdown 代码块
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object') return empty;

    const result: AceReflection = {
      evaluations: [],
      newSkills: [],
    };

    const rawEvaluations = (parsed as Record<string, unknown>).evaluations;
    if (Array.isArray(rawEvaluations)) {
      result.evaluations = rawEvaluations
        .filter((e): e is Record<string, unknown> =>
          !!e && typeof e === 'object' && typeof (e as Record<string, unknown>).skillId === 'string',
        )
        .map((e) => {
          const verdict = (e as Record<string, unknown>).verdict;
          return {
            skillId: String((e as Record<string, unknown>).skillId),
            verdict:
              verdict === 'helpful' || verdict === 'harmful' || verdict === 'neutral'
                ? verdict
                : 'neutral',
            reason:
              typeof (e as Record<string, unknown>).reason === 'string'
                ? String((e as Record<string, unknown>).reason)
                : undefined,
          };
        });
    }

    const rawNewSkills = (parsed as Record<string, unknown>).newSkills;
    if (Array.isArray(rawNewSkills)) {
      result.newSkills = rawNewSkills
        .filter(
          (s): s is Record<string, unknown> =>
            !!s && typeof s === 'object' &&
            typeof (s as Record<string, unknown>).content === 'string' &&
            String((s as Record<string, unknown>).content).trim().length > 0,
        )
        .map((s) => ({
          category:
            typeof (s as Record<string, unknown>).category === 'string'
              ? String((s as Record<string, unknown>).category).trim() || 'general'
              : 'general',
          content: String((s as Record<string, unknown>).content).trim(),
        }));
    }

    return result;
  } catch {
    return empty;
  }
};

/**
 * 执行反思
 *
 * 调用 LLM 分析本次交互，返回策略评估和新策略建议。
 *
 * 防污染：使用独立系统提示词，不注入 NSFW 预设内容。
 * 异步：调用方负责不阻塞主响应。
 * 容错：任何失败均返回空结果，不抛错。
 *
 * @param params - 反思参数
 * @returns 反思结果（失败返回空结果）
 */
export const reflect = async (params: ReflectParams): Promise<AceReflection> => {
  const { trace, appliedSkills, settings, providers, providerKeys, signal } = params;
  const empty: AceReflection = { evaluations: [], newSkills: [] };

  // 无模型配置，直接返回空
  const model = (settings.modelName || '').trim();
  if (!model) return empty;

  try {
    const { providerId } = parseModelName(model, providers);
    const baseUrl = getApiUrlForModel(model, providers, settings.apiUrl);
    const apiKey = getApiKeyForModel(
      model,
      providerKeys,
      settings.apiKey,
      providers,
    );
    const actualModel = getActualModelName(model, providers);
    const url = getOpenAICompatUrl(baseUrl, 'chat/completions');

    const userMessage = buildReflectUserMessage(trace, appliedSkills);

    const body: Record<string, unknown> = {
      model: actualModel,
      messages: [
        { role: 'system', content: REFLECTOR_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: false,
    };

    const response = await sendRequest({
      url,
      apiKey,
      body,
      signal,
    });

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return empty;

    return parseReflectionJson(content);
  } catch (e) {
    console.warn('[AceReflector] 反思失败:', e);
    return empty;
  }
};

/**
 * 从聊天消息构建执行轨迹
 *
 * 仅提取摘要，不含完整内容（防污染 + 节省 token）。
 *
 * @param userInput - 用户输入
 * @param agentSteps - Agent 步骤摘要列表
 * @param output - 最终输出
 * @param appliedSkillIds - 本次注入的策略 ID 列表
 */
export const buildExecutionTrace = (
  userInput: string,
  agentSteps: string[],
  output: string,
  appliedSkillIds: string[],
): AceExecutionTrace => {
  return {
    userInputSummary: userInput.slice(0, 200),
    agentSteps,
    outputSummary: output.slice(0, 300),
    appliedSkillIds,
    timestamp: new Date().toISOString(),
  };
};
