/**
 * 聊天 Slice（Zustand slice）
 *
 * 管理聊天消息、生成状态、API 调用、历史记录持久化等。
 * 核心流程 generateResponse 保留全部 18 项业务约束。
 *
 * 从 .luzzy-backup/store/useChatStore.ts 迁移，适配 slices 组合模式。
 * 关键改造：跨 slice 依赖从 useSettingsStore.getState() 改为 get()。
 */

import type { StateCreator } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  ChatMessage,
  Preset,
  WorldInfoEntry,
  GlobalMemory,
  RegexScript,
  RegexScriptGroup,
  MemorySettings,
  ActiveTool,
  ActiveToolCall,
  VectorMemoryShard,
  ApiSettings,
  AgentStep,
  MemoryRecall,
  ToolCall,
} from "~/types/luzzy";
import {
  buildContext,
  processRegex,
  migrateRegexScripts,
  extractMemory,
  DEFAULT_USER,
} from "~/services/chatService";
import {
  sendStreamRequest,
  sendRequest,
  parseSSEChunk,
  buildApiRequestBody,
  ApiError,
} from "~/services/apiClient";
import {
  getApiUrlForModel,
  getApiKeyForModel,
  getActualModelName,
  getOpenAICompatUrl,
  parseModelName,
} from "~/services/providerService";
import { parseCot } from "~/services/markdownService";
import { getItem, setItem } from "~/services/storage";
import {
  findPendingActiveToolCallInText,
  executeActiveToolCall,
  filterToolsForCharacter,
} from "~/services/toolService";
import { loadVectorMemoryShards, searchLongTermMemory, searchVectorMemory, getEmbedding, cosineSimilarity } from "~/services/memoryService";
import { BUILTIN_PRESET_DEFAULTS } from "~/services/presetContent";
import { BUILTIN_PROVIDERS } from "~/stores/slices/settings-slice";
import type { AppStoreState, ChatSlice } from "~/stores/slices/types";
import { logger } from "~/services/logger";
import { toast } from "sonner";

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取内置默认预设列表
 *
 * 从 presetContent.ts 导入，保持 NSFW 预设内容完整。
 * @returns Preset 对象数组
 */
const getDefaultPresets = (): Preset[] => {
  return BUILTIN_PRESET_DEFAULTS.map((p, i) => ({
    id: `builtin-${i}`,
    name: p.name,
    content: p.content,
    isBuiltin: true,
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  }));
};

/**
 * 默认记忆设置（未配置时使用）
 */
const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: false,
  embeddingModel: "",
  embeddingApiProviderId: "",
  maxMemories: 100,
  recallDepth: 10,
  vectorTopK: 5,
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 10,
};

/**
 * 获取聊天补全 API 的完整 URL
 *
 * 处理两种情况：
 * - apiUrl 已包含完整端点路径（如 .../v1/chat/completions）→ 直接使用
 * - apiUrl 仅为基础地址（如 .../v1 或 https://api.example.com）→ 自动拼接端点
 *
 * @param apiUrl - API 地址（可能为基础地址或完整端点）
 * @returns 完整的 chat/completions 端点 URL
 */
const getChatCompletionsUrl = (apiUrl: string): string => {
  const clean = apiUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("chat/completions")) {
    return clean;
  }
  return getOpenAICompatUrl(clean, "chat/completions");
};

/**
 * 从组合 store 状态中提取 ApiSettings 子集
 * v0.3.4: enableThinking 改为从当前模型的 supportsReasoning 派生
 * @param state - 组合 store 状态
 * @returns ApiSettings 对象
 */
const extractApiSettings = (state: AppStoreState): ApiSettings => {
  // v0.3.4: 从当前选中模型的 supportsReasoning 派生 enableThinking
  const allProviders = state.getAllProviders();
  const currentProvider = allProviders.find((p) => p.id === state.apiProviderId);
  const { modelName } = state;
  // 解析模型名（去除供应商前缀）
  const { providerId, modelName: actualModelName } = parseModelName(modelName);
  const targetProvider = providerId
    ? allProviders.find((p) => p.id === providerId)
    : currentProvider;
  const currentModel = targetProvider?.models?.find(
    (m) => m.name === actualModelName,
  );
  const enableThinking = !!currentModel?.supportsReasoning;

  return {
    apiUrl: state.apiUrl,
    apiKey: state.apiKey,
    modelName: state.modelName,
    stream: state.stream,
    enableThinking,
    customRequestBody: state.customRequestBody,
  };
};

// ============================================================================
// Slice 实现
// ============================================================================

export const createChatSlice: StateCreator<
  AppStoreState,
  [],
  [],
  ChatSlice
> = (set, get) => {
  /**
   * 生成 AI 回复（内部辅助函数）
   *
   * 由 sendMessage 和 regenerate 调用，负责：
   * 1. 加载预设、世界书、全局记忆、正则脚本
   * 2. 构建 API 上下文
   * 3. 调用 API（流式或非流式）
   * 4. 流式更新 assistant 消息内容
   * 5. 解析 CoT 分离思考链和正文
   * 6. 完成后异步提取记忆
   * 7. 错误处理
   *
   * @param assistantMessageId - 待填充的 assistant 消息 ID
   */
  const generateResponse = async (
    assistantMessageId: string,
  ): Promise<void> => {
    const state = get();
    const { messages, currentCharacter, abortController, currentSessionId } =
      state;

    if (!abortController) {
      get().updateMessage(assistantMessageId, {
        loading: false,
        error: "AbortController 未初始化",
      });
      set({ isGenerating: false });
      return;
    }

    // 从组合 store 获取设置（跨 slice 访问）
    const settings = extractApiSettings(get());

    // 调试日志：打印 API 配置入口状态
    console.log("[ChatSlice] generateResponse 入口:", {
      apiUrl: settings.apiUrl,
      modelName: settings.modelName,
      hasKey: !!settings.apiKey,
      apiProviderId: get().apiProviderId,
      enableThinking: settings.enableThinking,
    });

    // 校验 API 配置
    if (!settings.apiUrl || !settings.apiKey) {
      console.warn("[ChatSlice] API 配置缺失:", {
        apiUrl: settings.apiUrl,
        hasKey: !!settings.apiKey,
      });
      get().updateMessage(assistantMessageId, {
        loading: false,
        error: "API 地址或密钥未配置，请在设置中填写",
      });
      set({ isGenerating: false, abortController: null });
      return;
    }

    try {
      // 构建所有供应商列表（内置 + 自定义），用于多供应商路由和上下文构建
      const allProviders = [
        ...BUILTIN_PROVIDERS,
        ...get().customApiProviders,
      ];

      // 1. 从 IndexedDB 加载预设、世界书、全局记忆、正则脚本、记忆设置
      // v0.3.0: 正则脚本迁移为 RegexScriptGroup[] 结构
      const [
        presetsData,
        worldInfoData,
        globalMemoryData,
        regexGroupsData,
        oldRegexScriptsData,
        memorySettingsData,
        vectorMemoryShardsData,
      ] = await Promise.all([
        getItem<Preset[]>("presets", "presets"),
        getItem<WorldInfoEntry[]>("worldInfo", "worldInfo"),
        getItem<GlobalMemory>("memory", "global_memory"),
        getItem<RegexScriptGroup[]>("regexScripts", "regexGroups"),
        getItem<RegexScript[]>("regexScripts", "regexScripts"),
        getItem<MemorySettings>("settings", "memorySettings"),
        currentCharacter
          ? loadVectorMemoryShards(currentCharacter.uuid, currentSessionId ?? undefined)
          : Promise.resolve<VectorMemoryShard[]>([]),
      ]);

      const presets = presetsData ?? getDefaultPresets();
      // v0.3.2: 按角色过滤世界书条目（仅加载当前角色关联的 + 全局无 bookId 的）
      // v0.4.1: 改用 extensions.worldInfoId 过滤,使手动创建的世界书也能生效
      // 导入角色卡时 worldInfoId 设为 characterUuid,条目 bookId 也是 characterUuid,自然匹配
      const worldInfoId = currentCharacter?.extensions?.worldInfoId as string | undefined;
      const worldInfoEntries = worldInfoId
        ? (worldInfoData ?? []).filter(e => e.bookId === worldInfoId || !e.bookId)
        : (worldInfoData ?? []).filter(e => !e.bookId);
      // v0.4.3: 日志记录世界书加载
      logger.info("world", `世界书加载（总条目=${worldInfoData?.length ?? 0}，过滤后=${worldInfoEntries.length}，worldInfoId=${worldInfoId ?? "无"}）`);
      const globalMemory = globalMemoryData ?? null;
      // v0.3.0: 优先使用新的 regexGroups；若不存在但有旧 regexScripts，则迁移
      let regexGroups: RegexScriptGroup[] = regexGroupsData ?? [];
      if (regexGroups.length === 0 && oldRegexScriptsData && oldRegexScriptsData.length > 0) {
        regexGroups = migrateRegexScripts(oldRegexScriptsData);
        // 持久化迁移结果，清理旧数据
        await setItem("regexScripts", "regexGroups", regexGroups);
        await setItem("regexScripts", "regexScripts", []);
      }
      const memorySettings = memorySettingsData ?? DEFAULT_MEMORY_SETTINGS;
      const vectorMemoryShards = vectorMemoryShardsData ?? [];

      // v0.3.0 新增：从 store 读取内置工具配置，判断是否启用全局记忆检索
      const builtinToolConfigs = get().builtinToolConfigs;
      const vectorMemoryConfig = builtinToolConfigs.find(
        (c) => c.type === "vector-memory",
      );
      // v0.3.4: force 模式下，已启用的 vector-memory 强制执行全局记忆检索
      // 即使模型没有输出工具调用标签，也确保检索结果通过 buildContext 注入上下文
      const toolGlobalSettings = get().toolGlobalSettings;
      const vectorMemoryEnabled = !!vectorMemoryConfig?.enabled;
      const searchGlobalMemory =
        toolGlobalSettings.mode === "force"
          ? vectorMemoryEnabled && !!vectorMemoryConfig?.searchGlobalMemory
          : !!vectorMemoryConfig?.searchGlobalMemory;

      // v0.3.0 ACE: 记录本次注入的策略 ID（供反思用）
      let lastAppliedSkillIds: string[] = [];

      // 2. 定义 API 调用辅助函数（供初始调用和工具调用循环复用）
      // v0.4.1: 两次独立 API 请求架构
      // - phase="cot": 第一次请求,仅输出 CoT 思考内容,流式更新思考卡片
      // - phase="main": 第二次请求,基于 CoT 输出正文,流式更新正文气泡
      // KV 缓存保护: 两次请求的 system_prompt + history + current_user_msg 前缀完全一致,
      // 第二次仅在 messages 末尾追加 assistant(CoT) + user(指令),缓存自然命中

      // v0.4.1-fix: 带重试退避的 API 调用包装(针对 429 ServerOverloaded)
      // 最多重试 3 次,退避间隔递增(2s/4s/8s),重试期间显示提示
      const callApiWithRetry = async (
        msgId: string,
        contextMsgs: ChatMessage[],
        phase: "cot" | "main" = "cot",
        cotContent?: string,
      ): Promise<{ content: string; reasoning: string; cot: string }> => {
        const maxRetries = 3;
        const baseDelays = [2000, 4000, 8000]; // 递增退避
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (abortController?.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          try {
            return await callApiAndUpdate(msgId, contextMsgs, phase, cotContent);
          } catch (err) {
            // 用户取消不重试
            if (err instanceof DOMException && err.name === 'AbortError') throw err;

            // 检查是否为 429 错误
            const errMessage = err instanceof Error ? err.message : String(err);
            const is429 = errMessage.includes('429') ||
                          errMessage.includes('TooManyRequests') ||
                          errMessage.includes('ServerOverloaded') ||
                          errMessage.includes('server overload');

            if (!is429 || attempt === maxRetries) throw err;

            // 429 错误:显示退避提示并等待
            const delay = baseDelays[attempt];
            console.warn(`[ChatSlice] API 429 错误,${delay / 1000}秒后重试(${attempt + 1}/${maxRetries})`);
            get().updateMessage(msgId, {
              loading: true,
              error: `服务器繁忙,${delay / 1000}秒后自动重试(${attempt + 1}/${maxRetries})...`,
            });

            // 等待退避时间(可被中止)
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delay);
              const onAbort = (): void => {
                clearTimeout(timer);
                reject(new DOMException('Aborted', 'AbortError'));
              };
              if (abortController?.signal.aborted) {
                onAbort();
                return;
              }
              abortController?.signal.addEventListener('abort', onAbort, { once: true });
            });

            // 清除错误提示
            get().updateMessage(msgId, { error: undefined });
            lastError = err;
          }
        }
        throw lastError;
      };

      const callApiAndUpdate = async (
        msgId: string,
        contextMsgs: ChatMessage[],
        phase: "cot" | "main" = "cot",
        cotContent?: string,
      ): Promise<{ content: string; reasoning: string; cot: string }> => {
        // 构建 API 上下文
        const { apiMessages: rawApiMessages, appliedSkillIds: ctxAppliedSkillIds } = await buildContext({
          messages: contextMsgs,
          character: currentCharacter,
          user: DEFAULT_USER,
          presets,
          worldInfoEntries,
          globalMemory,
          settings,
          apiProviders: allProviders,
          apiProviderKeys: get().apiProviderKeys,
          vectorMemoryShards,
          memorySettings,
          sessionId: currentSessionId ?? undefined,
          searchGlobalMemory,
          builtinToolConfigs, // v0.4.3: 传入内置工具配置，注入工具描述到 system prompt
        });

        // v0.4.3: 日志记录上下文构建完成
        logger.info("api", `上下文构建完成（消息数=${rawApiMessages.length}，ACE策略=${ctxAppliedSkillIds?.length ?? 0}）`);

        // v0.3.0 ACE: 记录本次注入的策略 ID
        if (ctxAppliedSkillIds && ctxAppliedSkillIds.length > 0) {
          lastAppliedSkillIds = ctxAppliedSkillIds;
        }

        // 应用正则脚本处理（系统消息跳过）
        // v0.3.0: 使用新的 RegexScriptGroup[] 结构，scope/timing 过滤
        let apiMessages = rawApiMessages.map((msg) => {
          if (msg.role === "system") return msg;
          const scope = msg.role === "user" ? "user" : "character";
          return {
            ...msg,
            content: processRegex(
              msg.content,
              regexGroups,
              scope,
              "send",
              DEFAULT_USER,
            ),
          };
        });

        // v0.4.1: phase="main" 时,在 messages 末尾追加 assistant(CoT) + user(指令)
        // 关键: 不修改 system_prompt 和已有 messages,仅在末尾追加,确保 KV 缓存命中
        if (phase === "main" && cotContent) {
          apiMessages = [
            ...apiMessages,
            {
              role: "assistant" as const,
              content: cotContent,
            },
            {
              role: "user" as const,
              content: "基于以上思考过程,现在请直接输出正文回复。不要重复思考内容,不要使用 <cot> 或 <think> 标签,直接输出正文本身。",
            },
          ];
        }

        // 多供应商路由：根据模型名前缀解析对应的供应商 URL/Key
        const chatApiUrl = getApiUrlForModel(
          get().modelName,
          allProviders,
          get().apiUrl,
        );
        const chatApiKey = getApiKeyForModel(
          get().modelName,
          get().apiProviderKeys,
          get().apiKey,
          allProviders,
        );
        const actualModel = getActualModelName(get().modelName);
        const url = getChatCompletionsUrl(chatApiUrl);

        // v0.3.2: API Key 和 URL 空值校验，提前给出友好提示
        if (!chatApiKey?.trim()) {
          toast.error("未配置 API Key，请前往设置页配置");
          set({ isGenerating: false });
          return { content: "", reasoning: "", cot: "" };
        }
        if (!chatApiUrl?.trim()) {
          toast.error("未配置 API URL，请前往设置页配置");
          set({ isGenerating: false });
          return { content: "", reasoning: "", cot: "" };
        }

        // 调试日志：打印多供应商路由结果
        console.log("[ChatSlice] API 路由:", {
          originalModel: get().modelName,
          chatApiUrl,
          hasApiKey: !!chatApiKey,
          actualModel,
          url,
          stream: get().stream,
        });

        // 构建请求体
        // 获取当前供应商的思考深度设置
        const currentProvider = allProviders.find((p) => p.id === get().apiProviderId);
        const thinkingDepth = currentProvider?.thinkingDepth;

        const requestBody = buildApiRequestBody(
          {
            model: actualModel,
            messages: apiMessages,
            stream: get().stream,
          },
          {
            enableThinking: settings.enableThinking,
            thinkingDepth,
            customRequestBody: get().customRequestBody,
          },
        );

        // 累积流式内容
        let accumulatedContent = "";
        let accumulatedReasoning = "";
        // Token 实时统计
        const requestStartTime = Date.now();
        let lastUsage: Record<string, unknown> | undefined;
        // Agent 步骤追踪（v0.3.0 新增）
        const agentSteps: AgentStep[] = [];
        let thinkingStepAdded = false;

        // v0.3.6: parseCot 调用节流，避免每个 chunk 都全量解析
        // 仅在内容长度变化超过阈值或检测到标签闭合时才解析
        let lastParseLength = 0;
        let lastCotResult: ReturnType<typeof parseCot> | null = null;
        let lastUpdateTick = 0;

        if (get().stream) {
          // === 流式请求 ===
          await sendStreamRequest({
            url,
            apiKey: chatApiKey,
            body: requestBody,
            signal: abortController.signal,
            onChunk: (_dataStr, parsed) => {
              const chunk = parseSSEChunk(parsed);

              // 提取 usage（OpenAI 在最后一个 chunk 携带；Anthropic 分 message_start/message_delta 携带，需合并）
              if (chunk.usage) {
                lastUsage = { ...lastUsage, ...chunk.usage };
              }

              if (chunk.reasoningContent) {
                accumulatedReasoning += chunk.reasoningContent;
                set({ isThinking: true });
                // 首次出现推理内容时添加思考步骤
                if (!thinkingStepAdded) {
                  thinkingStepAdded = true;
                  agentSteps.push({
                    id: uuidv4(),
                    type: "thinking",
                    title: "模型思考",
                    content: accumulatedReasoning,
                    status: "running",
                    startedAt: Date.now(),
                  });
                } else {
                  // 更新已有思考步骤的内容
                  const thinkingStep = agentSteps.find((s) => s.type === "thinking");
                  if (thinkingStep) {
                    thinkingStep.content = accumulatedReasoning;
                  }
                }
              }

              if (chunk.content) {
                accumulatedContent += chunk.content;
                set({ isThinking: false, isReceiving: true });
              }

              // v0.3.6: parseCot 调用节流
              // 仅在内容长度变化超过阈值、检测到标签闭合、或首次解析时才执行
              // v0.3.7: 阈值从 50 降至 10，提升流式思考卡片实时性
              // v0.4.0: 流式场景禁用 parseCot 缓存（content 持续变化缓存永不命中）
              // v0.4.3: 阈值从 10 降至 3，实现逐字流式思考卡片
              const lengthDelta = accumulatedContent.length - lastParseLength;
              const closingTags = [
                '</cot>', '</think>', '</thinking>', '</reasoning>',
                '</thought>', '</thoughts>', '</reflection>', '</analysis>',
              ];
              const hasClosingTag = closingTags.some((tag) => accumulatedContent.includes(tag));
              const shouldParse =
                !lastCotResult ||
                lengthDelta > 3 ||
                hasClosingTag;

              if (shouldParse) {
                lastCotResult = parseCot(accumulatedContent, false);
                lastParseLength = accumulatedContent.length;
              }
              const cotResult = lastCotResult!;
              const finalCot = (
                accumulatedReasoning +
                (cotResult.cot ? "\n" + cotResult.cot : "")
              ).trim();

              // v0.4.0: 统一思考步骤添加逻辑
              // 若 finalCot 非空（含原生思考或 CoT 标签内容），确保 thinking 步骤存在且内容为 finalCot
              // 这样 CotCard 显示 message.cot，LuzzyAgentSteps 作为备份（当 message.cot 为空时）
              if (finalCot && !thinkingStepAdded) {
                thinkingStepAdded = true;
                agentSteps.push({
                  id: uuidv4(),
                  type: "thinking",
                  title: "模型思考",
                  content: finalCot,
                  status: "running",
                  startedAt: Date.now(),
                });
              } else if (finalCot && thinkingStepAdded) {
                const thinkingStep = agentSteps.find((s) => s.type === "thinking");
                if (thinkingStep) {
                  thinkingStep.content = finalCot;
                }
              }

              // v0.3.6: updateMessage 节流（最少 60ms 间隔），避免高频更新导致 UI 卡顿
              // v0.3.7: 间隔从 60ms 降至 30ms，提升流式输出流畅度（约 33fps）
              // v0.4.1: 降至 16ms(约 60fps),实现逐字流式输出
              const now = Date.now();
              if (now - lastUpdateTick >= 16 || hasClosingTag) {
                lastUpdateTick = now;
                // 实时 Token 统计估算（4 字符 ≈ 1 token）
                const elapsedMs = now - requestStartTime;
                const estimatedTokens = Math.ceil(accumulatedContent.length / 4);
                const tokPerSec = elapsedMs > 0 ? (estimatedTokens / (elapsedMs / 1000)) : 0;

                // v0.4.1: 根据 phase 控制更新行为
                if (phase === "cot") {
                  // CoT 阶段: 仅更新思考卡片(cot),不更新正文(content)
                  get().updateMessage(msgId, {
                    cot: finalCot,
                    loading: false,
                    tokenUsage: {
                      promptTokens: 0,
                      completionTokens: estimatedTokens,
                      responseTimeMs: elapsedMs,
                      tokPerSec: Math.round(tokPerSec * 10) / 10,
                    },
                    agentSteps: [...agentSteps],
                  });
                } else {
                  // 正文阶段: 更新正文气泡(content),不追加 reasoning 到 cot(避免思考内容重复)
                  // v0.4.1-fix: 第二次请求的 reasoning 不再追加到 cot,避免与第一次 CoT 重复
                  get().updateMessage(msgId, {
                    content: cotResult.main || accumulatedContent,
                    loading: false,
                    tokenUsage: {
                      promptTokens: 0,
                      completionTokens: estimatedTokens,
                      responseTimeMs: elapsedMs,
                      tokPerSec: Math.round(tokPerSec * 10) / 10,
                    },
                    agentSteps: [...agentSteps],
                  });
                }
              }
            },
          });
        } else {
          // === 非流式请求 ===
          const response = await sendRequest({
            url,
            apiKey: chatApiKey,
            body: requestBody,
            signal: abortController.signal,
          });
          const data = (await response.json()) as Record<string, unknown>;
          const chunk = parseSSEChunk(data);
          accumulatedContent = chunk.content;
          accumulatedReasoning = chunk.reasoningContent;
          if (chunk.usage) {
            lastUsage = { ...lastUsage, ...chunk.usage };
          }

          const cotResult = parseCot(accumulatedContent);
          const finalCot = (
            accumulatedReasoning +
            (cotResult.cot ? "\n" + cotResult.cot : "")
          ).trim();

          // 非流式：若有推理内容或 CoT，添加思考步骤
          if (finalCot.trim()) {
            agentSteps.push({
              id: uuidv4(),
              type: "thinking",
              title: "模型思考",
              content: finalCot,
              status: "completed",
              startedAt: requestStartTime,
              endedAt: Date.now(),
            });
          }

          // v0.4.1: 根据 phase 控制更新行为
          if (phase === "cot") {
            // CoT 阶段: 仅更新思考卡片
            get().updateMessage(msgId, {
              cot: finalCot,
              loading: false,
              agentSteps: agentSteps.length > 0 ? [...agentSteps] : undefined,
            });
          } else {
            // 正文阶段: 更新正文气泡,不追加 reasoning 到 cot(避免思考内容重复)
            // v0.4.1-fix: 第二次请求的 reasoning 不再追加到 cot
            get().updateMessage(msgId, {
              content: cotResult.main || accumulatedContent,
              loading: false,
              agentSteps: agentSteps.length > 0 ? [...agentSteps] : undefined,
            });
          }
        }

        // 流式结束后，用精确的 usage 替换估算值
        // 同时将思考步骤标记为已完成
        const finalElapsedMs = Date.now() - requestStartTime;
        const thinkingStep = agentSteps.find((s) => s.type === "thinking");
        if (thinkingStep && thinkingStep.status === "running") {
          thinkingStep.status = "completed";
          thinkingStep.endedAt = Date.now();
        }

        // v0.4.0-patch4: 流式结束后强制以"最终态"重新解析并写回 content/cot
        // 修复 BUG：流式中 updateMessage 30ms 节流可能错过最后一个 chunk，
        // 导致 message.content 停留在中间态（例如未闭合 <think> 被吞），气泡空白
        // 此处用 useCache=true 走完成态缓存，确保最终内容正确写回 message
        // v0.4.1: 根据 phase 控制最终更新行为
        if (get().stream) {
          const finalCotResult = parseCot(accumulatedContent, true);
          const finalCotCombined = (
            accumulatedReasoning +
            (finalCotResult.cot ? "\n" + finalCotResult.cot : "")
          ).trim();
          if (phase === "cot") {
            // CoT 阶段: 仅更新思考卡片
            get().updateMessage(msgId, {
              cot: finalCotCombined,
              loading: false,
            });
          } else {
            // 正文阶段: 更新正文气泡,不追加 reasoning 到 cot(避免思考内容重复)
            // v0.4.1-fix: 第二次请求的 reasoning 不再追加到 cot
            get().updateMessage(msgId, {
              content: finalCotResult.main || accumulatedContent,
              loading: false,
            });
          }
        }

        if (lastUsage) {
          const elapsedMs = finalElapsedMs;
          const promptTokens = Number(lastUsage.prompt_tokens ?? 0);
          const completionTokens = Number(lastUsage.completion_tokens ?? 0);
          const cachedTokens = Number(
            (lastUsage.prompt_tokens_details as Record<string, unknown>)?.cached_tokens ?? 0
          );
          const cacheHitRate = promptTokens > 0
            ? Math.round((cachedTokens / promptTokens) * 1000) / 10
            : undefined;
          const tokPerSec = elapsedMs > 0
            ? Math.round((completionTokens / (elapsedMs / 1000)) * 10) / 10
            : 0;

          get().updateMessage(msgId, {
            tokenUsage: {
              promptTokens,
              cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
              responseTimeMs: elapsedMs,
              tokPerSec,
              cacheHitRate,
            },
            agentSteps: agentSteps.length > 0 ? [...agentSteps] : undefined,
          });
        } else {
          // 无 usage 数据时，至少更新最终响应时间
          const elapsedMs = finalElapsedMs;
          const estimatedTokens = Math.ceil(accumulatedContent.length / 4);
          const tokPerSec = elapsedMs > 0
            ? Math.round((estimatedTokens / (elapsedMs / 1000)) * 10) / 10
            : 0;
          get().updateMessage(msgId, {
            tokenUsage: {
              promptTokens: 0,
              completionTokens: estimatedTokens,
              responseTimeMs: elapsedMs,
              tokPerSec,
            },
            agentSteps: agentSteps.length > 0 ? [...agentSteps] : undefined,
          });
        }

        // v0.4.1: 返回 cot 字段,供第二次请求使用
        const finalCotResult = parseCot(accumulatedContent, true);
        const finalCotCombined = (
          accumulatedReasoning +
          (finalCotResult.cot ? "\n" + finalCotResult.cot : "")
        ).trim();
        return { content: accumulatedContent, reasoning: accumulatedReasoning, cot: finalCotCombined };
      };

      // 3. 初始 API 调用
      const contextMessages = messages.filter(
        (m) => m.id !== assistantMessageId,
      );

      // v0.3.6: 提前加载 activeTools，供 force 模式预执行和工具调用循环共用
      const activeToolsData = await getItem<ActiveTool[]>(
        "activeTools",
        "activeTools",
      );
      const activeTools = activeToolsData ?? [];

      // v0.3.6 C4: force 模式预执行所有已启用工具
      // 在初始 API 调用前，主动执行所有已启用的非 vector-memory 工具
      // 将结果作为独立 user 消息注入上下文末尾，不破坏 KV 缓存命中率
      // v0.4.1: 将预执行结果添加到 agentSteps 和 toolCalls,作为独立二级思考卡片显示
      if (toolGlobalSettings.mode === "force" && activeTools.length > 0) {
        const characterUuid = currentCharacter?.uuid ?? null;
        const filteredTools = filterToolsForCharacter(activeTools, characterUuid);
        // 排除 vector 类型（已由 searchGlobalMemory 在 buildContext 中处理）
        const enabledTools = filteredTools.filter(
          (t) => t.enabled && t.type !== "vector",
        );

        if (enabledTools.length > 0) {
          // 获取最近用户消息作为默认查询
          const latestUserMsg = messages.filter((m) => m.role === "user").pop();
          const defaultQuery = latestUserMsg?.content || "";

          const forceResults: string[] = [];
          const forceToolCalls: ToolCall[] = [];
          const forceAgentSteps: AgentStep[] = [];
          for (const tool of enabledTools) {
            if (abortController?.signal.aborted) break;
            try {
              const toolCall: ActiveToolCall = {
                tool,
                mode: "add",
                callLabel: tool.callName || tool.name,
                query: defaultQuery,
                raw: "",
                reason: "force mode pre-execution",
              };
              const forceStepId = uuidv4();
              const forceCallStep: AgentStep = {
                id: forceStepId,
                type: "tool_call",
                title: tool.name,
                content: defaultQuery,
                status: "running",
                startedAt: Date.now(),
              };
              const result = await executeActiveToolCall(toolCall, {
                messages: get().messages,
                character: currentCharacter,
                vectorMemoryShards,
                worldInfoEntries,
                tavilyApiKey: "",
                mcpSessionIds: new Map(),
                anysearchConfig: builtinToolConfigs.find((c) => c.type === "anysearch"),
              });
              if (result && result.trim()) {
                forceResults.push(
                  `<tool_result tool="${tool.name}" mode="force">\n${result}\n</tool_result>`,
                );
              }
              // 标记步骤完成,添加结果步骤
              forceCallStep.status = "completed";
              forceCallStep.endedAt = Date.now();
              const forceResultStep: AgentStep = {
                id: uuidv4(),
                type: "tool_result",
                title: tool.name,
                content: result || "(空结果)",
                status: "completed",
                startedAt: forceCallStep.startedAt,
                endedAt: Date.now(),
              };
              forceAgentSteps.push(forceCallStep, forceResultStep);
              forceToolCalls.push({
                id: uuidv4(),
                toolName: tool.name,
                callLabel: tool.callName || tool.name,
                query: defaultQuery,
                reason: "force mode pre-execution",
                status: "completed" as const,
                result: result || "(空结果)",
              });
            } catch (e) {
              console.warn(
                `[ChatSlice] force 模式预执行工具 ${tool.name} 失败:`,
                e,
              );
              // 记录错误步骤
              const errorStep: AgentStep = {
                id: uuidv4(),
                type: "tool_call",
                title: tool.name,
                content: e instanceof Error ? e.message : String(e),
                status: "error",
                startedAt: Date.now(),
                endedAt: Date.now(),
              };
              forceAgentSteps.push(errorStep);
              forceToolCalls.push({
                id: uuidv4(),
                toolName: tool.name,
                callLabel: tool.callName || tool.name,
                query: defaultQuery,
                reason: "force mode pre-execution",
                status: "error" as const,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }

          if (forceResults.length > 0) {
            // 作为独立 user 消息追加到上下文末尾（不持久化到 store）
            contextMessages.push({
              id: uuidv4(),
              role: "user",
              content: `<force_tool_results>\n${forceResults.join("\n\n")}\n</force_tool_results>`,
              createdAt: Date.now(),
            });
          }

          // v0.4.1: 将 force 模式的工具调用结果更新到消息,作为二级思考卡片显示
          if (forceToolCalls.length > 0) {
            get().updateMessage(assistantMessageId, {
              toolCalls: forceToolCalls,
              agentSteps: forceAgentSteps,
            });
          }
        }
      }

      // v0.3.7: memory-recall 内置工具预执行
      // memory-recall 是内置工具（存储在 builtinToolConfigs），不在 activeTools 中
      // 需独立执行 searchLongTermMemory，将结果注入上下文并填充 message.memoryRecalls
      // v0.4.1-fix: 添加 agentSteps 和 toolCalls,显示为二级思考卡片
      const memoryRecallConfig = builtinToolConfigs.find(
        (c) => c.type === "memory-recall",
      );
      if (
        memoryRecallConfig?.enabled &&
        currentCharacter?.uuid &&
        memorySettings
      ) {
        // v0.4.3: 日志记录记忆召回工具执行
        logger.info("memory", `记忆召回工具启动（topK=${memoryRecallConfig.resultCount ?? 8}）`);
        const latestUserMsg = messages.filter((m) => m.role === "user").pop();
        const recallQuery = latestUserMsg?.content || "";
        if (recallQuery.trim()) {
          // v0.4.1-fix: 添加 tool_call 步骤(运行中)
          const recallCallStep: AgentStep = {
            id: uuidv4(),
            type: "tool_call",
            title: "记忆召回",
            content: recallQuery,
            status: "running",
            startedAt: Date.now(),
          };
          try {
            const recallTopK = memoryRecallConfig.resultCount || 8;
            const recallResults = await searchLongTermMemory(
              currentCharacter.uuid,
              recallQuery,
              recallTopK,
              memorySettings,
              settings,
              allProviders,
              get().apiProviderKeys,
            );

            // v0.4.1-fix: 标记 tool_call 完成,添加 tool_result 步骤
            recallCallStep.status = "completed";
            recallCallStep.endedAt = Date.now();
            const recallResultText = recallResults.length > 0
              ? recallResults.map((r) => `[score=${r.score.toFixed(3)}] ${r.content}`).join('\n\n')
              : "(无匹配记忆)";
            const recallResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "记忆召回",
              content: recallResultText,
              status: "completed",
              startedAt: recallCallStep.startedAt,
              endedAt: Date.now(),
            };

            // v0.4.1-fix: 添加到 toolCalls 和 agentSteps,显示为二级思考卡片
            const recallToolCall: ToolCall = {
              id: uuidv4(),
              toolName: "记忆召回",
              callLabel: "memory-recall",
              query: recallQuery,
              reason: "force mode pre-execution (builtin)",
              status: "completed" as const,
              result: recallResultText,
            };

            if (recallResults.length > 0) {
              // 填充 message.memoryRecalls 供 UI 显示
              const memoryRecalls: MemoryRecall[] = recallResults.map((r) => ({
                id: uuidv4(),
                content: r.content,
                score: r.score,
                turn: r.turn ?? -1,
              }));
              get().updateMessage(assistantMessageId, { memoryRecalls });

              // 将召回结果注入上下文（作为独立 user 消息，不破坏 KV 缓存）
              const recallText = recallResults
                .map(
                  (r, i) =>
                    `  <memory index="${i + 1}" turn="${r.turn ?? -1}" score="${r.score.toFixed(3)}">\n    ${r.content}\n  </memory>`,
                )
                .join("\n\n");
              contextMessages.push({
                id: uuidv4(),
                role: "user",
                content: `<memory_recall_result>\n${recallText}\n</memory_recall_result>`,
                createdAt: Date.now(),
              });
            }

            // v0.4.1-fix: 更新消息的 toolCalls 和 agentSteps
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [...(existingMsg?.toolCalls ?? []), recallToolCall],
              agentSteps: [
                ...(existingMsg?.agentSteps ?? []),
                recallCallStep,
                recallResultStep,
              ],
            });
          } catch (e) {
            console.warn("[ChatSlice] memory-recall 预执行失败:", e);
            // v0.4.1-fix: 记录错误步骤
            recallCallStep.status = "error";
            recallCallStep.endedAt = Date.now();
            const errorMsg = e instanceof Error ? e.message : String(e);
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: "记忆召回",
              content: errorMsg,
              status: "error",
              startedAt: recallCallStep.startedAt,
              endedAt: Date.now(),
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [
                ...(existingMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: "记忆召回",
                  callLabel: "memory-recall",
                  query: recallQuery,
                  reason: "force mode pre-execution (builtin)",
                  status: "error" as const,
                  error: errorMsg,
                },
              ],
              agentSteps: [...(existingMsg?.agentSteps ?? []), errorStep],
            });
          }
        }
      }

      // v0.4.1-fix: vector-memory 内置工具预执行(force 模式下主动召回向量记忆)
      // 将结果注入上下文并添加 agentSteps/toolCalls,显示为二级思考卡片
      const vectorMemoryBuiltinConfig = builtinToolConfigs.find(
        (c) => c.type === "vector-memory",
      );
      if (
        vectorMemoryBuiltinConfig?.enabled &&
        currentCharacter?.uuid &&
        memorySettings?.enabled &&
        vectorMemoryShards.length > 0
      ) {
        // v0.4.3: 日志记录向量记忆检索工具执行
        logger.info("memory", `向量记忆检索工具启动（shards=${vectorMemoryShards.length}，topK=${vectorMemoryBuiltinConfig.resultCount ?? 8}）`);
        const latestUserMsg = messages.filter((m) => m.role === "user").pop();
        const vectorQuery = latestUserMsg?.content || "";
        if (vectorQuery.trim()) {
          const vectorCallStep: AgentStep = {
            id: uuidv4(),
            type: "tool_call",
            title: "向量记忆检索",
            content: vectorQuery,
            status: "running",
            startedAt: Date.now(),
          };
          try {
            const vectorTopK = vectorMemoryBuiltinConfig.resultCount || 8;
            const vectorResults = await searchVectorMemory(
              vectorQuery,
              vectorMemoryShards,
              memorySettings,
              settings,
              allProviders,
              get().apiProviderKeys,
            );
            const topResults = vectorResults.slice(0, vectorTopK);

            vectorCallStep.status = "completed";
            vectorCallStep.endedAt = Date.now();
            const vectorResultText = topResults.length > 0
              ? topResults.map((r) => `[turn=${r.turn}] ${r.content}`).join('\n\n')
              : "(无匹配向量记忆)";
            const vectorResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "向量记忆检索",
              content: vectorResultText,
              status: "completed",
              startedAt: vectorCallStep.startedAt,
              endedAt: Date.now(),
            };
            const vectorToolCall: ToolCall = {
              id: uuidv4(),
              toolName: "向量记忆检索",
              callLabel: "vector-memory",
              query: vectorQuery,
              reason: "force mode pre-execution (builtin)",
              status: "completed" as const,
              result: vectorResultText,
            };

            if (topResults.length > 0) {
              const vectorText = topResults
                .map(
                  (r, i) =>
                    `  <memory index="${i + 1}" turn="${r.turn}">\n    ${r.content}\n  </memory>`,
                )
                .join("\n\n");
              contextMessages.push({
                id: uuidv4(),
                role: "user",
                content: `<vector_memory_result>\n${vectorText}\n</vector_memory_result>`,
                createdAt: Date.now(),
              });
            }

            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [...(existingMsg?.toolCalls ?? []), vectorToolCall],
              agentSteps: [
                ...(existingMsg?.agentSteps ?? []),
                vectorCallStep,
                vectorResultStep,
              ],
            });
          } catch (e) {
            console.warn("[ChatSlice] vector-memory 预执行失败:", e);
            vectorCallStep.status = "error";
            vectorCallStep.endedAt = Date.now();
            const errorMsg = e instanceof Error ? e.message : String(e);
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: "向量记忆检索",
              content: errorMsg,
              status: "error",
              startedAt: vectorCallStep.startedAt,
              endedAt: Date.now(),
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [
                ...(existingMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: "向量记忆检索",
                  callLabel: "vector-memory",
                  query: vectorQuery,
                  reason: "force mode pre-execution (builtin)",
                  status: "error" as const,
                  error: errorMsg,
                },
              ],
              agentSteps: [...(existingMsg?.agentSteps ?? []), errorStep],
            });
          }
        }
      }

      // v0.4.1-fix: keyword-search 内置工具预执行(force 模式下主动关键词检索)
      const keywordSearchConfig = builtinToolConfigs.find(
        (c) => c.type === "keyword-search",
      );
      if (
        keywordSearchConfig?.enabled &&
        currentCharacter?.uuid &&
        memorySettings?.enabled &&
        vectorMemoryShards.length > 0
      ) {
        // v0.4.3: 日志记录关键词检索工具执行
        logger.info("tool", `关键词检索工具启动（shards=${vectorMemoryShards.length}，topK=${keywordSearchConfig.resultCount ?? 8}）`);
        const latestUserMsg = messages.filter((m) => m.role === "user").pop();
        const keywordQuery = latestUserMsg?.content || "";
        if (keywordQuery.trim()) {
          const keywordCallStep: AgentStep = {
            id: uuidv4(),
            type: "tool_call",
            title: "关键词检索",
            content: keywordQuery,
            status: "running",
            startedAt: Date.now(),
          };
          try {
            // 关键词检索:从向量记忆分片中按关键词匹配
            const queryWords = keywordQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
            const keywordTopK = keywordSearchConfig.resultCount || 8;
            const keywordResults = vectorMemoryShards
              .filter((shard) => {
                const shardLower = shard.content.toLowerCase();
                return queryWords.some((w) => shardLower.includes(w));
              })
              .slice(0, keywordTopK);

            keywordCallStep.status = "completed";
            keywordCallStep.endedAt = Date.now();
            const keywordResultText = keywordResults.length > 0
              ? keywordResults.map((r) => `[turn=${r.turn}] ${r.content}`).join('\n\n')
              : "(无匹配关键词记忆)";
            const keywordResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "关键词检索",
              content: keywordResultText,
              status: "completed",
              startedAt: keywordCallStep.startedAt,
              endedAt: Date.now(),
            };
            const keywordToolCall: ToolCall = {
              id: uuidv4(),
              toolName: "关键词检索",
              callLabel: "keyword-search",
              query: keywordQuery,
              reason: "force mode pre-execution (builtin)",
              status: "completed" as const,
              result: keywordResultText,
            };

            if (keywordResults.length > 0) {
              const keywordText = keywordResults
                .map(
                  (r, i) =>
                    `  <memory index="${i + 1}" turn="${r.turn}">\n    ${r.content}\n  </memory>`,
                )
                .join("\n\n");
              contextMessages.push({
                id: uuidv4(),
                role: "user",
                content: `<keyword_search_result>\n${keywordText}\n</keyword_search_result>`,
                createdAt: Date.now(),
              });
            }

            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [...(existingMsg?.toolCalls ?? []), keywordToolCall],
              agentSteps: [
                ...(existingMsg?.agentSteps ?? []),
                keywordCallStep,
                keywordResultStep,
              ],
            });
          } catch (e) {
            console.warn("[ChatSlice] keyword-search 预执行失败:", e);
            keywordCallStep.status = "error";
            keywordCallStep.endedAt = Date.now();
            const errorMsg = e instanceof Error ? e.message : String(e);
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: "关键词检索",
              content: errorMsg,
              status: "error",
              startedAt: keywordCallStep.startedAt,
              endedAt: Date.now(),
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [
                ...(existingMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: "关键词检索",
                  callLabel: "keyword-search",
                  query: keywordQuery,
                  reason: "force mode pre-execution (builtin)",
                  status: "error" as const,
                  error: errorMsg,
                },
              ],
              agentSteps: [...(existingMsg?.agentSteps ?? []), errorStep],
            });
          }
        }
      }

      // v0.4.3: world-recall 内置工具预执行（基于嵌入模型召回世界书内容）
      // 数据源为当前角色卡绑定的世界书条目，使用嵌入模型语义检索
      const worldRecallConfig = builtinToolConfigs.find(
        (c) => c.type === "world-recall",
      );
      if (
        worldRecallConfig?.enabled &&
        currentCharacter?.uuid &&
        memorySettings?.enabled &&
        worldInfoEntries.length > 0
      ) {
        // v0.4.3: 日志记录世界书召回工具执行
        logger.info("world", `世界书召回工具启动（条目数=${worldInfoEntries.length}，topK=${worldRecallConfig.resultCount ?? 8}）`);
        const latestUserMsg = messages.filter((m) => m.role === "user").pop();
        const worldRecallQuery = latestUserMsg?.content || "";
        if (worldRecallQuery.trim()) {
          const worldRecallCallStep: AgentStep = {
            id: uuidv4(),
            type: "tool_call",
            title: "世界书召回",
            content: worldRecallQuery,
            status: "running",
            startedAt: Date.now(),
          };
          try {
            const worldRecallTopK = worldRecallConfig.resultCount || 8;
            // 获取查询向量
            const queryVector = await getEmbedding(
              worldRecallQuery,
              memorySettings,
              settings,
              allProviders,
              get().apiProviderKeys,
            );
            // 对每个世界书条目获取嵌入向量并计算相似度
            const scoredEntries = await Promise.all(
              worldInfoEntries
                .filter((e) => e.enabled && e.content.trim())
                .map(async (entry) => {
                  try {
                    const entryVector = await getEmbedding(
                      entry.content,
                      memorySettings,
                      settings,
                      allProviders,
                      get().apiProviderKeys,
                    );
                    return {
                      entry,
                      score: cosineSimilarity(queryVector, entryVector),
                    };
                  } catch {
                    return { entry, score: 0 };
                  }
                }),
            );
            const topEntries = scoredEntries
              .filter((item) => Number.isFinite(item.score))
              .sort((a, b) => b.score - a.score)
              .slice(0, worldRecallTopK);

            worldRecallCallStep.status = "completed";
            worldRecallCallStep.endedAt = Date.now();
            const worldRecallResultText = topEntries.length > 0
              ? topEntries.map((r) => `[score=${r.score.toFixed(3)}] ${r.entry.content}`).join('\n\n')
              : "(无匹配世界书内容)";
            const worldRecallResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "世界书召回",
              content: worldRecallResultText,
              status: "completed",
              startedAt: worldRecallCallStep.startedAt,
              endedAt: Date.now(),
            };
            const worldRecallToolCall: ToolCall = {
              id: uuidv4(),
              toolName: "世界书召回",
              callLabel: "world-recall",
              query: worldRecallQuery,
              reason: "force mode pre-execution (builtin)",
              status: "completed" as const,
              result: worldRecallResultText,
            };

            if (topEntries.length > 0) {
              const worldRecallText = topEntries
                .map(
                  (r, i) =>
                    `  <world_entry index="${i + 1}" score="${r.score.toFixed(3)}">\n    ${r.entry.content}\n  </world_entry>`,
                )
                .join("\n\n");
              contextMessages.push({
                id: uuidv4(),
                role: "user",
                content: `<world_recall_result>\n${worldRecallText}\n</world_recall_result>`,
                createdAt: Date.now(),
              });
            }

            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [...(existingMsg?.toolCalls ?? []), worldRecallToolCall],
              agentSteps: [
                ...(existingMsg?.agentSteps ?? []),
                worldRecallCallStep,
                worldRecallResultStep,
              ],
            });
          } catch (e) {
            console.warn("[ChatSlice] world-recall 预执行失败:", e);
            worldRecallCallStep.status = "error";
            worldRecallCallStep.endedAt = Date.now();
            const errorMsg = e instanceof Error ? e.message : String(e);
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: "世界书召回",
              content: errorMsg,
              status: "error",
              startedAt: worldRecallCallStep.startedAt,
              endedAt: Date.now(),
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [
                ...(existingMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: "世界书召回",
                  callLabel: "world-recall",
                  query: worldRecallQuery,
                  reason: "force mode pre-execution (builtin)",
                  status: "error" as const,
                  error: errorMsg,
                },
              ],
              agentSteps: [...(existingMsg?.agentSteps ?? []), errorStep],
            });
          }
        }
      }

      // v0.4.3: world-search 内置工具预执行（关键词检索世界书内容，无需嵌入模型）
      // 数据源为当前角色卡启用的世界书条目，按 keys + content 关键词匹配
      const worldSearchConfig = builtinToolConfigs.find(
        (c) => c.type === "world-search",
      );
      if (
        worldSearchConfig?.enabled &&
        currentCharacter?.uuid &&
        worldInfoEntries.length > 0
      ) {
        // v0.4.3: 日志记录世界书检索工具执行
        logger.info("world", `世界书检索工具启动（条目数=${worldInfoEntries.length}，topK=${worldSearchConfig.resultCount ?? 8}）`);
        const latestUserMsg = messages.filter((m) => m.role === "user").pop();
        const worldSearchQuery = latestUserMsg?.content || "";
        if (worldSearchQuery.trim()) {
          const worldSearchCallStep: AgentStep = {
            id: uuidv4(),
            type: "tool_call",
            title: "世界书检索",
            content: worldSearchQuery,
            status: "running",
            startedAt: Date.now(),
          };
          try {
            const worldSearchTopK = worldSearchConfig.resultCount || 8;
            // 关键词分词（长度 > 1 的词）
            const queryWords = worldSearchQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
            // 在世界书条目的 keys 和 content 中按关键词匹配
            const matchedEntries = worldInfoEntries
              .filter((e) => e.enabled && e.content.trim())
              .map((entry) => {
                const contentLower = entry.content.toLowerCase();
                const keysLower = (entry.keys ?? []).map((k) => k.toLowerCase());
                // 计算匹配分数：keys 匹配权重更高
                let score = 0;
                for (const w of queryWords) {
                  if (keysLower.some((k) => k.includes(w))) score += 2;
                  if (contentLower.includes(w)) score += 1;
                }
                return { entry, score };
              })
              .filter((item) => item.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, worldSearchTopK);

            worldSearchCallStep.status = "completed";
            worldSearchCallStep.endedAt = Date.now();
            const worldSearchResultText = matchedEntries.length > 0
              ? matchedEntries.map((r) => `[score=${r.score}] ${r.entry.content}`).join('\n\n')
              : "(无匹配世界书内容)";
            const worldSearchResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "世界书检索",
              content: worldSearchResultText,
              status: "completed",
              startedAt: worldSearchCallStep.startedAt,
              endedAt: Date.now(),
            };
            const worldSearchToolCall: ToolCall = {
              id: uuidv4(),
              toolName: "世界书检索",
              callLabel: "world-search",
              query: worldSearchQuery,
              reason: "force mode pre-execution (builtin)",
              status: "completed" as const,
              result: worldSearchResultText,
            };

            if (matchedEntries.length > 0) {
              const worldSearchText = matchedEntries
                .map(
                  (r, i) =>
                    `  <world_entry index="${i + 1}" score="${r.score}">\n    ${r.entry.content}\n  </world_entry>`,
                )
                .join("\n\n");
              contextMessages.push({
                id: uuidv4(),
                role: "user",
                content: `<world_search_result>\n${worldSearchText}\n</world_search_result>`,
                createdAt: Date.now(),
              });
            }

            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [...(existingMsg?.toolCalls ?? []), worldSearchToolCall],
              agentSteps: [
                ...(existingMsg?.agentSteps ?? []),
                worldSearchCallStep,
                worldSearchResultStep,
              ],
            });
          } catch (e) {
            console.warn("[ChatSlice] world-search 预执行失败:", e);
            worldSearchCallStep.status = "error";
            worldSearchCallStep.endedAt = Date.now();
            const errorMsg = e instanceof Error ? e.message : String(e);
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: "世界书检索",
              content: errorMsg,
              status: "error",
              startedAt: worldSearchCallStep.startedAt,
              endedAt: Date.now(),
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              toolCalls: [
                ...(existingMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: "世界书检索",
                  callLabel: "world-search",
                  query: worldSearchQuery,
                  reason: "force mode pre-execution (builtin)",
                  status: "error" as const,
                  error: errorMsg,
                },
              ],
              agentSteps: [...(existingMsg?.agentSteps ?? []), errorStep],
            });
          }
        }
      }

      // v0.4.1: 两次独立 API 请求架构
      // 第一次请求: 输出 CoT 思考内容(放入头脑风暴卡片 + 二级卡片)
      // 第二次请求: 基于 CoT 输出正文(正文气泡 + 头脑风暴节点)
      // KV 缓存保护: 两次请求前缀完全一致,第二次仅在 messages 末尾追加
      // v0.4.1-fix: 使用 callApiWithRetry 包装,自动处理 429 错误重试
      logger.info("api", "API 请求阶段1: CoT 思考链生成");
      const { content: cotRawContent, reasoning: cotReasoning, cot: cotContent } =
        await callApiWithRetry(assistantMessageId, contextMessages, "cot");
      logger.info("api", `API 响应阶段1: CoT 完成（字符数=${cotContent.length}）`);

      // 检查第一次请求(CoT)是否为空响应
      if (!cotRawContent.trim() && !cotReasoning.trim() && !cotContent.trim()) {
        get().updateMessage(assistantMessageId, {
          loading: false,
          error: "API 返回空响应(CoT 阶段)",
        });
        return;
      }

      // 检查是否已被用户取消
      if (abortController?.signal.aborted) return;

      // 第二次请求: 基于 CoT 输出正文
      logger.info("api", "API 请求阶段2: 正文生成");
      const { content: accumulatedContent, reasoning: accumulatedReasoning } =
        await callApiWithRetry(assistantMessageId, contextMessages, "main", cotContent);
      logger.info("api", `API 响应阶段2: 正文完成（字符数=${accumulatedContent.length}）`);
      logger.info("chat", `消息接收完成（CoT=${cotContent.length}字符，正文=${accumulatedContent.length}字符）`);

      // 7. 检查空响应(正文阶段)
      if (!accumulatedContent.trim() && !accumulatedReasoning.trim()) {
        // 正文为空但 CoT 有内容,保留 CoT 并提示
        if (cotContent.trim()) {
          get().updateMessage(assistantMessageId, {
            loading: false,
          });
        } else {
          get().updateMessage(assistantMessageId, {
            loading: false,
            error: "API 返回空响应",
          });
          return;
        }
      }

      // 8. 记录生成耗时
      const assistantMsg = get().messages.find(
        (m) => m.id === assistantMessageId,
      );
      if (assistantMsg) {
        get().updateMessage(assistantMessageId, {
          generationTime: Date.now() - assistantMsg.createdAt,
        });
      }

      // 9. 工具调用处理循环
      let currentAssistantId = assistantMessageId;
      // v0.3.6: activeTools 已在初始 API 调用前加载，此处直接复用

      if (activeTools.length > 0) {
        const characterUuid = currentCharacter?.uuid ?? null;
        const filteredTools = filterToolsForCharacter(
          activeTools,
          characterUuid,
        );

        // 最多迭代 5 次以防止无限循环
        for (let iteration = 0; iteration < 5; iteration++) {
          // 检查是否已被用户取消，避免取消后继续发起工具调用与 API 请求
          if (abortController?.signal.aborted) break;

          const currentAssistantMsg = get().messages.find(
            (m) => m.id === currentAssistantId,
          );
          if (!currentAssistantMsg) break;

          // 扫描 assistant 回复中的工具调用标签
          const toolCall = findPendingActiveToolCallInText(
            currentAssistantMsg.content,
            filteredTools,
          );
          if (!toolCall) break;

          try {
            // 执行工具调用
            // 添加 tool_call 步骤（v0.3.0 新增）
            const toolCallStepId = uuidv4();
            const toolCallStep: AgentStep = {
              id: toolCallStepId,
              type: "tool_call",
              title: toolCall.tool.name,
              content: toolCall.query,
              status: "running",
              startedAt: Date.now(),
            };

            const result = await executeActiveToolCall(toolCall, {
              messages: get().messages,
              character: currentCharacter,
              vectorMemoryShards,
              worldInfoEntries,
              tavilyApiKey: "",
              mcpSessionIds: new Map(),
              anysearchConfig: builtinToolConfigs.find((c) => c.type === "anysearch"),
            });

            // 标记 tool_call 步骤为已完成，添加 tool_result 步骤
            toolCallStep.status = "completed";
            toolCallStep.endedAt = Date.now();
            const toolResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: toolCall.tool.name,
              content: result,
              status: "completed",
              startedAt: Date.now(),
              endedAt: Date.now(),
            };

            // 更新消息的工具调用信息与 agentSteps
            const currentMsgForSteps = get().messages.find(
              (m) => m.id === currentAssistantId,
            );
            get().updateMessage(currentAssistantId, {
              toolCalls: [
                ...(currentAssistantMsg.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: toolCall.tool.name,
                  callLabel: toolCall.callLabel,
                  query: toolCall.query,
                  reason: toolCall.reason,
                  status: "completed" as const,
                  result,
                  mcpSubToolName: toolCall.mcpSubToolName,
                },
              ],
              agentSteps: [
                ...(currentMsgForSteps?.agentSteps ?? []),
                toolCallStep,
                toolResultStep,
              ],
            });

            // 添加工具结果作为用户消息（供下一轮生成使用）
            const toolResultMessage: ChatMessage = {
              id: uuidv4(),
              role: "user",
              content: `<active_tool_result_input>\n${result}\n</active_tool_result_input>`,
              createdAt: Date.now(),
            };
            get().addMessage(toolResultMessage);

            // 创建新的 assistant 消息用于续写
            const continuationMessage: ChatMessage = {
              id: uuidv4(),
              role: "assistant",
              content: "",
              createdAt: Date.now(),
              loading: true,
            };
            get().addMessage(continuationMessage);

            // 调用 API 进行续写(工具调用续写属正文阶段,复用已有 CoT 上下文以保持 KV 缓存前缀一致)
            // v0.4.1-fix: 使用 callApiWithRetry 包装,自动处理 429 错误重试
            const newContextMessages = get().messages.filter(
              (m) => m.id !== continuationMessage.id,
            );
            const { content: newContent, reasoning: newReasoning } =
              await callApiWithRetry(
                continuationMessage.id,
                newContextMessages,
                "main",
                cotContent,
              );

            // 检查空响应
            if (!newContent.trim() && !newReasoning.trim()) {
              get().updateMessage(continuationMessage.id, {
                loading: false,
                error: "API 返回空响应",
              });
              break;
            }

            // 更新追踪变量，供下一轮迭代使用
            currentAssistantId = continuationMessage.id;
          } catch (toolError) {
            console.error("[ChatSlice] 工具调用失败:", toolError);
            // 重新获取最新消息，避免使用迭代开始时捕获的旧 toolCalls
            // （本轮可能已追加 completed 记录，直接覆盖会丢失该记录）
            const latestAssistantMsg = get().messages.find(
              (m) => m.id === currentAssistantId,
            );
            // 记录工具调用错误 + 错误步骤
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: toolCall.tool.name,
              content: toolError instanceof Error ? toolError.message : String(toolError),
              status: "error",
              startedAt: Date.now(),
              endedAt: Date.now(),
            };
            get().updateMessage(currentAssistantId, {
              toolCalls: [
                ...(latestAssistantMsg?.toolCalls ?? []),
                {
                  id: uuidv4(),
                  toolName: toolCall.tool.name,
                  callLabel: toolCall.callLabel,
                  query: toolCall.query,
                  reason: toolCall.reason,
                  status: "error" as const,
                  error:
                    toolError instanceof Error
                      ? toolError.message
                      : String(toolError),
                  mcpSubToolName: toolCall.mcpSubToolName,
                },
              ],
              agentSteps: [
                ...(latestAssistantMsg?.agentSteps ?? []),
                errorStep,
              ],
            });
            break;
          }
        }
      }

      // 10. 异步提取记忆（不阻塞主流程）
      extractMemory({
        messages: get().messages,
        character: currentCharacter,
        settings,
        memorySettings,
        apiProviders: allProviders,
        apiProviderKeys: get().apiProviderKeys,
        sessionId: currentSessionId ?? undefined,
      }).catch((e) => console.error("[ChatSlice] 记忆提取失败:", e));

      // 11. v0.3.0 ACE: 异步反思（不阻塞主流程）
      // 仅当本次注入了策略时触发
      if (lastAppliedSkillIds.length > 0) {
        void (async () => {
          try {
            const { loadSkillbook, getActiveSkills } = await import(
              "~/services/aceSkillbookService"
            );
            const { reflect, buildExecutionTrace } = await import(
              "~/services/aceReflectorService"
            );
            const { applyReflectionAndSave } = await import(
              "~/services/aceSkillManagerService"
            );

            const book = await loadSkillbook();
            const appliedSkills = getActiveSkills(book).filter((s) =>
              lastAppliedSkillIds.includes(s.id),
            );
            if (appliedSkills.length === 0) return;

            // 构建执行轨迹（仅摘要，防污染）
            const lastUserMsg = [...get().messages]
              .reverse()
              .find((m) => m.role === "user");
            const lastAssistantMsg = get().messages.find(
              (m) => m.id === assistantMessageId,
            );
            const trace = buildExecutionTrace(
              lastUserMsg?.content ?? "",
              (lastAssistantMsg?.agentSteps ?? []).map(
                (s) => `${s.type}:${s.title}`,
              ),
              lastAssistantMsg?.content ?? "",
              lastAppliedSkillIds,
            );

            // 调用 LLM 反思（独立通道，不注入 NSFW 预设）
            const reflection = await reflect({
              trace,
              appliedSkills,
              settings,
              providers: allProviders,
              providerKeys: get().apiProviderKeys,
            });

            // 应用反思结果到 Skillbook
            if (
              reflection.evaluations.length > 0 ||
              reflection.newSkills.length > 0
            ) {
              await applyReflectionAndSave(book, reflection);
              console.log(
                "[ChatSlice] ACE 反思完成:",
                `评估 ${reflection.evaluations.length} 条, 新增 ${reflection.newSkills.length} 条`,
              );
            }
          } catch (e) {
            console.error("[ChatSlice] ACE 反思失败:", e);
          }
        })();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // 用户取消生成
        const currentMsg = get().messages.find(
          (m) => m.id === assistantMessageId,
        );
        const existingContent = currentMsg?.content ?? "";
        const existingCot = currentMsg?.cot ?? "";

        if (existingContent.trim() || existingCot.trim()) {
          // 有部分内容，保留并添加中止标记
          get().updateMessage(assistantMessageId, {
            loading: false,
            content: existingContent.trim()
              ? existingContent + "\n\n*-- 生成已中止 --*"
              : "*-- 生成已中止 --*",
          });
        } else {
          // 无内容，显示中止提示
          get().updateMessage(assistantMessageId, {
            loading: false,
            content: "*-- 生成已中止 --*",
          });
        }
      } else if (error instanceof ApiError) {
        // API 业务错误
        get().updateMessage(assistantMessageId, {
          loading: false,
          error: error.message,
        });
      } else {
        // 其他错误
        get().updateMessage(assistantMessageId, {
          loading: false,
          error: error instanceof Error ? error.message : "未知错误",
        });
      }
    } finally {
      const currentController = get().abortController;
      set({
        isGenerating: false,
        isThinking: false,
        isReceiving: false,
        abortController:
          currentController === abortController ? null : currentController,
      });
      // 无论成功或失败，都保存聊天记录
      await get().saveChatHistory();
    }
  };

  return {
    // ===== 状态初始值 =====
    messages: [],
    currentCharacter: null,
    isGenerating: false,
    isThinking: false,
    isReceiving: false,
    inputDraft: "",
    abortController: null,

    // ===== 基础 setters =====
    setMessages: (messages) => set({ messages }),

    addMessage: (message) =>
      set((state) => ({ messages: [...state.messages, message] })),

    updateMessage: (id, partial) =>
      // v0.4.0: 优化流式更新性能 — 使用 findIndex + slice 替代 map，减少不必要的对象创建
      set((state) => {
        const index = state.messages.findIndex((m) => m.id === id);
        if (index === -1) return {};
        const messages = state.messages.slice();
        messages[index] = { ...messages[index], ...partial };
        return { messages };
      }),

    setCurrentCharacter: (currentCharacter) => set({ currentCharacter }),

    setInputDraft: (inputDraft) => set({ inputDraft }),

    // ===== Actions =====

    sendMessage: async (content: string) => {
      if (!get().currentCharacter) return;
      const trimmed = content.trim();
      if (!trimmed || get().isGenerating) return;

      // v0.4.3: 日志记录消息发送
      logger.info("chat", `发送消息（字符数=${trimmed.length}，角色=${get().currentCharacter?.name ?? "未知"}）`);

      // 1. 添加用户消息
      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };

      // 2. 添加空的 assistant 消息（loading: true）
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        loading: true,
      };

      set((state) => ({
        messages: [...state.messages, userMessage, assistantMessage],
        isGenerating: true,
        inputDraft: "",
        abortController: new AbortController(),
      }));

      // 3-8. 生成回复
      await generateResponse(assistantMessage.id);
    },

    stopGenerating: () => {
      const { abortController } = get();
      if (abortController) {
        abortController.abort();
      }
      set({
        isGenerating: false,
        isThinking: false,
        isReceiving: false,
        abortController: null,
      });
    },

    regenerate: async () => {
      if (!get().currentCharacter) return;
      if (get().isGenerating) return;
      const { messages } = get();
      if (messages.length === 0) return;

      // 找到最后一条 assistant 消息
      let lastAssistantIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          lastAssistantIndex = i;
          break;
        }
      }
      if (lastAssistantIndex === -1) return;

      // 移除最后的 assistant 消息
      const newMessages = messages.slice(0, lastAssistantIndex);

      // 添加新的空 assistant 消息
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        loading: true,
      };

      set({
        messages: [...newMessages, assistantMessage],
        isGenerating: true,
        abortController: new AbortController(),
      });

      await generateResponse(assistantMessage.id);
    },

    editMessage: (id, content) => {
      get().updateMessage(id, { content, updatedAt: Date.now() });
      void get().saveChatHistory();
    },

    deleteMessage: (id) => {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== id),
      }));
      void get().saveChatHistory();
    },

    clearMessages: () => {
      set({ messages: [] });
      void get().saveChatHistory();
    },

    loadChatHistory: async (characterUuid: string) => {
      try {
        const history = await getItem<ChatMessage[]>(
          "chatHistory",
          characterUuid,
        );
        set({ messages: history ?? [] });
      } catch (e) {
        console.error("[ChatSlice] 加载聊天记录失败:", e);
        set({ messages: [] });
      }
    },

    saveChatHistory: async () => {
      const { currentCharacter, messages } = get();
      if (!currentCharacter) return;
      try {
        await setItem("chatHistory", currentCharacter.uuid, messages);
      } catch (e) {
        console.error("[ChatSlice] 保存聊天记录失败:", e);
      }
    },

    // ===== v0.2.0 新增 Actions =====

    /**
     * 翻译消息（调用当前模型，独立提示词通道）
     *
     * 使用 translationSettings 中的提示词模板，将消息内容翻译为目标语言。
     * 采用非流式请求，完成后更新消息的 translatedContent 和 translationLanguage。
     */
    translateMessage: async (messageId) => {
      const message = get().messages.find((m) => m.id === messageId);
      if (!message) return;

      const { translationSettings } = get();
      if (!translationSettings?.enabled) return;

      const settings = extractApiSettings(get());
      if (!settings.apiUrl || !settings.apiKey) {
        get().updateMessage(messageId, {
          error: "API 地址或密钥未配置，无法翻译",
        });
        return;
      }

      // 目标语言：优先使用自定义语言
      const language =
        translationSettings.customLanguage?.trim() ||
        translationSettings.targetLanguage ||
        "简体中文";

      // 构建翻译提示词（替换占位符）
      const prompt = translationSettings.promptTemplate
        .replace("{message}", message.content)
        .replace("{language}", language);

      try {
        const allProviders = [
          ...BUILTIN_PROVIDERS,
          ...get().customApiProviders,
        ];
        const chatApiUrl = getApiUrlForModel(
          get().modelName,
          allProviders,
          get().apiUrl,
        );
        const chatApiKey = getApiKeyForModel(
          get().modelName,
          get().apiProviderKeys,
          get().apiKey,
          allProviders,
        );
        const actualModel = getActualModelName(get().modelName);
        const url = getChatCompletionsUrl(chatApiUrl);

        const requestBody = buildApiRequestBody(
          {
            model: actualModel,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          },
          {
            enableThinking: false,
            customRequestBody: get().customRequestBody,
          },
        );

        const response = await sendRequest({
          url,
          apiKey: chatApiKey,
          body: requestBody,
        });
        const data = (await response.json()) as Record<string, unknown>;
        const chunk = parseSSEChunk(data);

        if (chunk.content) {
          get().updateMessage(messageId, {
            translatedContent: chunk.content,
            translationLanguage: language,
          });
        }
      } catch (e) {
        console.error("[ChatSlice] 翻译消息失败:", e);
        get().updateMessage(messageId, {
          error: `翻译失败: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },

    /**
     * 重试消息（生成新版本存入 retryBranches）
     *
     * - 若为用户消息：基于该消息重新生成回复，新 assistant 回复存入分支
     * - 若为 assistant 消息：重试上一轮用户请求，新回复存入分支
     * 新版本通过 session-slice.addRetryBranch 持久化到 Session.retryBranches
     */
    retryMessage: async (messageId) => {
      const { messages, currentSessionId } = get();
      if (get().isGenerating) return;
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      // 确定重试的上下文：找到待重试的 assistant 消息位置
      let assistantIndex = -1;
      if (message.role === "assistant") {
        assistantIndex = messages.findIndex((m) => m.id === messageId);
      } else {
        // user 消息：找其后的第一条 assistant 消息
        const userIndex = messages.findIndex((m) => m.id === messageId);
        for (let i = userIndex + 1; i < messages.length; i++) {
          if (messages[i].role === "assistant") {
            assistantIndex = i;
            break;
          }
        }
      }
      if (assistantIndex === -1) return;

      const oldAssistant = messages[assistantIndex];
      const contextMessages = messages.slice(0, assistantIndex);

      // 创建新的 assistant 消息
      const newAssistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        loading: true,
        branchId: oldAssistant.id,
      };

      // 临时替换当前消息列表用于生成
      set({
        messages: [...contextMessages, newAssistantMessage],
        isGenerating: true,
        abortController: new AbortController(),
      });

      await generateResponse(newAssistantMessage.id);

      // 生成完成后，将新版本存入 session.retryBranches
      if (currentSessionId) {
        const finalMessage = get().messages.find(
          (m) => m.id === newAssistantMessage.id,
        );
        if (finalMessage) {
          get().addRetryBranch(
            currentSessionId,
            oldAssistant.id,
            finalMessage,
          );
          // 恢复原始消息列表（保留旧版本显示），新版本通过 switchRetryVersion 切换查看
          set({ messages: [...contextMessages, oldAssistant] });
        }
      }
    },

    /**
     * 切换重试版本
     *
     * 根据方向切换当前激活的重试版本索引，并更新消息列表显示对应版本。
     */
    switchRetryVersion: (messageId, direction) => {
      const { currentSessionId, sessions } = get();
      if (!currentSessionId) return;

      const session = sessions.find((s) => s.id === currentSessionId);
      if (!session) return;

      const branches = session.retryBranches?.[messageId] ?? [];
      if (branches.length === 0) return;

      const currentIndex = session.retryActiveIndex?.[messageId] ?? -1;
      let newIndex: number;

      if (currentIndex === -1) {
        // 当前显示的是原始版本，切换到第一个分支
        newIndex = direction === "next" ? 0 : branches.length - 1;
      } else {
        if (direction === "next") {
          newIndex = currentIndex + 1 >= branches.length ? -1 : currentIndex + 1;
        } else {
          newIndex = currentIndex - 1 < -1 ? branches.length - 1 : currentIndex - 1;
        }
      }

      // 更新 session 的激活索引
      get().switchRetryBranch(currentSessionId, messageId, newIndex);

      // 更新消息列表显示对应版本
      const { messages } = get();
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const displayMessage =
        newIndex === -1
          ? messages[messageIndex] // 原始版本
          : branches[newIndex];

      get().updateMessage(messageId, {
        content: displayMessage.content,
        cot: displayMessage.cot,
        toolCalls: displayMessage.toolCalls,
        updatedAt: Date.now(),
      });
    },

    /**
     * 创建对话分支
     *
     * 从指定消息截断创建新会话，复制截至该消息的所有消息到新会话。
     */
    createBranch: (messageId) => {
      const { messages, currentCharacter, currentSessionId, sessions } = get();
      if (!currentCharacter) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // 截取截至该消息的所有消息
      const branchMessages = messages.slice(0, messageIndex + 1);

      // 查找原会话标题
      const originalSession = currentSessionId
        ? sessions.find((s) => s.id === currentSessionId)
        : null;
      const branchTitle = originalSession
        ? `分支：${originalSession.title}`
        : `分支：${currentCharacter.name}`;

      // 创建新会话
      const newSessionId = get().createSession(
        currentCharacter.uuid,
        currentCharacter.name,
      );

      // 设置新会话标题和消息
      get().setSessionMessages(newSessionId, branchMessages);
      // 更新会话标题
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === newSessionId ? { ...s, title: branchTitle } : s,
        ),
      }));

      // 切换到新会话
      get().switchSession(newSessionId);

      // 更新当前消息列表为新会话的消息
      set({ messages: branchMessages });

      void get().saveSessions();
    },

    /**
     * 分享消息
     *
     * v0.4.3: 改用 @capacitor/share 在原生平台唤起分享面板,Web 环境回退到 Web Share API 或剪贴板
     */
    shareMessage: async (messageId) => {
      const message = get().messages.find((m) => m.id === messageId);
      if (!message) return;

      const text = message.content;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          // v0.4.3: 原生平台使用 @capacitor/share 唤起系统分享面板
          const { Share } = await import('@capacitor/share');
          await Share.share({
            title: 'LUZZY 消息',
            text,
            dialogTitle: '分享消息',
          });
        } else if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function"
        ) {
          // Web 环境支持 Web Share API
          await navigator.share({ title: 'LUZZY 消息', text });
        } else if (
          typeof navigator !== "undefined" &&
          navigator.clipboard
        ) {
          // 回退到剪贴板
          await navigator.clipboard.writeText(text);
          const { toast } = await import('sonner');
          toast.success('已复制到剪贴板');
        }
      } catch (e) {
        // 用户取消分享不视为错误
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[ChatSlice] 分享失败:", e);
      }
    },
  };
};
