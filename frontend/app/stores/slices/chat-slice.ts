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
  findPendingBuiltinToolCallInText,
  executeActiveToolCall,
  filterToolsForCharacter,
} from "~/services/toolService";
import { loadVectorMemoryShards, searchVectorMemory, searchVectorMemoryWithScore, getEmbedding, cosineSimilarity } from "~/services/memoryService";
import { BUILTIN_PRESET_DEFAULTS } from "~/services/presetContent";
import { BUILTIN_PROVIDERS } from "~/stores/slices/settings-slice";
import type { AppStoreState, ChatSlice } from "~/stores/slices/types";
import { logger } from "~/services/logger";
import { toast } from "sonner";

// v0.4.6: 文本标签路径最大续写次数限制，防止无限循环
const MAX_CONTINUATIONS = 3;

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
  enabled: true,
  embeddingModel: "",
  embeddingApiProviderId: "",
  maxMemories: 100,
  recallDepth: 10,
  vectorTopK: 5,
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 10,
  longTermMemoryCharacterIds: [],
  globalMemoryCharacterIds: [],
};

/**
 * v0.5.1: 解析 AI 工具决策输出
 * 支持格式: <tool_calls>name1:query1|name2:query2</tool_calls>
 */
function parseToolDecisions(raw: string): Array<{ toolName: string; query: string }> {
  const text = (raw || '').trim();
  if (!text) return [];
  const blockMatch = text.match(/<tool_calls>([\s\S]*?)<\/tool_calls>/i);
  if (blockMatch) {
    const body = blockMatch[1].trim();
    if (/^(NO_TOOLS|NONE)$/i.test(body)) return [];
    return body.split('|').map(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx < 0) return { toolName: part.trim(), query: part.trim() };
      return { toolName: part.substring(0, colonIdx).trim(), query: part.substring(colonIdx + 1).trim() };
    }).filter(d => d.toolName);
  }
  if (/NO_TOOLS|不需要工具/i.test(text)) return [];
  return [];
}

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
        getItem<MemorySettings>("memory", "memorySettings"),
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
      logger.debug("memory", `向量记忆分片加载: ${vectorMemoryShards.length} 个`);

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

      // v0.5.1: 三请求架构
      // - phase="tool": 请求1, AI决定调用哪些工具,流式更新
      // - phase="cot": 请求2, 输出 CoT 思考链,流式更新思考卡片
      // - phase="main": 请求3, 输出正文,流式更新正文气泡
      // KV 缓存保护: 三请求 system_prompt + history + user_msg 前缀完全一致,
      // 后续请求仅在 messages 末尾追加,缓存自然命中

      // v0.4.1-fix: 带重试退避的 API 调用包装(针对 429 ServerOverloaded)
      // 最多重试 3 次,退避间隔递增(2s/4s/8s),重试期间显示提示
      // v0.4.4: 返回值新增 toolCalls 字段,支持原生 tool_calls 透传
      const callApiWithRetry = async (
        msgId: string,
        contextMsgs: ChatMessage[],
        phase: "tool" | "cot" | "main" = "cot",
        cotContent?: string,
        skipToolsInjection: boolean = false, // v0.4.6: 续写请求时不注入 tools
      ): Promise<{ content: string; reasoning: string; cot: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> => {
        const maxRetries = 3;
        const baseDelays = [2000, 4000, 8000]; // 递增退避
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (abortController?.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          try {
            return await callApiAndUpdate(msgId, contextMsgs, phase, cotContent, skipToolsInjection);
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
        phase: "tool" | "cot" | "main" = "cot",
        cotContent?: string,
        skipToolsInjection: boolean = false, // v0.4.6: 续写请求时不注入 tools
      ): Promise<{ content: string; reasoning: string; cot: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> => {
        // 构建 API 上下文
        // v0.5.0: 从 store 读取当前激活的用户档案，覆写默认空档案
        const activeUser = (() => {
          const st = get();
          if (st.activeProfileId) {
            const profile = (st.userProfiles ?? []).find(p => p.uuid === st.activeProfileId);
            if (profile?.name?.trim() || profile?.description?.trim()) return profile;
          }
          return (st.user?.name?.trim() || st.user?.description?.trim()) ? st.user : DEFAULT_USER;
        })();
        // v0.5.1: phase 数字映射，传入 buildContext 控制系统提示构建
        const phaseNumber = phase === "tool" ? 1 : phase === "cot" ? 2 : 3;
        const { apiMessages: rawApiMessages, appliedSkillIds: ctxAppliedSkillIds } = await buildContext({
          messages: contextMsgs,
          character: currentCharacter,
          user: activeUser,
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
          activeTools, // v0.4.6: 传入用户工具，统一注入工具描述
          phase: phaseNumber, // v0.5.1: 控制系统提示段落（1=工具决策, 2=CoT, 3=正文）
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

        // v0.5.1: phase="tool" 时剥离 assistant 消息的角色名
        // 避免模型因历史消息中带有 name:"角色名" 而认领角色身份，忽略工具决策指令
        if (phase === "tool") {
          for (const msg of apiMessages) {
            if (msg.role === "assistant" && msg.name) {
              delete msg.name;
            }
          }
        }

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
          return { content: "", reasoning: "", cot: "", toolCalls: [] };
        }
        if (!chatApiUrl?.trim()) {
          toast.error("未配置 API URL，请前往设置页配置");
          set({ isGenerating: false });
          return { content: "", reasoning: "", cot: "", toolCalls: [] };
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

        // v0.4.4: 注入 activeTools 到 buildApiRequestBody（仅非 force 模式）
        // force 模式下由预执行逻辑处理工具，不注入 tools 参数避免重复调用
        // activeTools 在 line 775 加载，由于 callApiAndUpdate 是闭包且在 activeTools 初始化后才被调用，可安全引用
        // v0.4.6: 将内置工具也纳入 tools 参数，让支持 function calling 的模型能看到内置工具
        // v0.4.6: 续写请求（skipToolsInjection=true）时不注入 tools，防止模型再次发起 tool_calls 导致无限循环
        const builtinToolsForRequest =
          toolGlobalSettings.mode !== "force" && !skipToolsInjection
            ? builtinToolConfigs
                .filter((c) => c.enabled)
                .map((c) => ({
                  type: c.type,
                  callName: c.type, // 内置工具使用 type 作为 callName（kebab-case）
                  description: c.type, // 描述由 buildToolSchema 内部映射提供
                  isBuiltin: true as const,
                }))
            : [];

        const activeToolsForRequest =
          toolGlobalSettings.mode !== "force" &&
          !skipToolsInjection &&
          (activeTools.length > 0 || builtinToolsForRequest.length > 0)
            ? [
                ...builtinToolsForRequest,
                ...activeTools
                  .filter((t) => t.enabled)
                  .map((tool) => ({
                    type: tool.type,
                    callName: tool.callName || tool.name,
                    description: tool.description,
                    isBuiltin: false as const,
                  })),
              ]
            : undefined;

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
            activeTools: activeToolsForRequest,
          },
        );

        // 累积流式内容
        let accumulatedContent = "";
        let accumulatedReasoning = "";
        // Token 实时统计
        const requestStartTime = Date.now();
        let lastUsage: Record<string, unknown> | undefined;
        // Agent 步骤追踪（v0.3.0 新增）
        // v0.4.4: 修复 agentSteps 覆盖问题 - 读取已有消息的 agentSteps 作为初始值
        // 避免第二次请求(callApiAndUpdate)覆盖第一次请求已写入的 force 预执行/记忆召回步骤
        const existingMsg = get().messages.find(m => m.id === msgId);
        const agentSteps: AgentStep[] = existingMsg?.agentSteps ? [...existingMsg.agentSteps] : [];
        // v0.5.1: 三阶段 thinking 节点标题映射（phase 感知，不再合并覆盖）
        const THINKING_TITLES: Record<string, string> = { tool: "工具决策分析", cot: "深度推理", main: "组织回复" };
        // v0.4.4: 累积原生 tool_calls（流式增量合并）
        const accumulatedToolCalls: Array<{
          id: string;
          function: { name: string; arguments: string };
        }> = [];

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
                // v0.5.1: 阶段感知的 thinking 节点——首次推理内容时创建
                const existingPhaseThinking = agentSteps.find(
                  (s) => s.type === "thinking" && s.phase === phaseNumber
                );
                if (!existingPhaseThinking) {
                  agentSteps.push({
                    id: uuidv4(),
                    type: "thinking",
                    title: THINKING_TITLES[phase] || "模型思考",
                    content: accumulatedReasoning,
                    status: "running",
                    startedAt: Date.now(),
                    phase: phaseNumber,
                  });
                } else {
                  existingPhaseThinking.content = accumulatedReasoning;
                }
              }

              if (chunk.content) {
                accumulatedContent += chunk.content;
                set({ isThinking: false, isReceiving: true });
              }
              // v0.4.6: phase="main" 时，reasoning_content 也计入正文
              // DeepSeek-R1 等模型在第二次请求仍输出 reasoning 而非 content
              if (phase === "main" && chunk.reasoningContent) {
                accumulatedContent += chunk.reasoningContent;
              }

              // v0.4.6: 流式诊断日志
              if (chunk.content || chunk.reasoningContent) {
                logger.debug("stream", `chunk: content+${chunk.content.length} reasoning+${chunk.reasoningContent.length} 累计${accumulatedContent.length}`);
              }

              // v0.4.4: 累积原生 tool_calls（流式增量合并）
              if (chunk.toolCalls && chunk.toolCalls.length > 0) {
                for (const tc of chunk.toolCalls) {
                  const existing = accumulatedToolCalls.find(t => t.id === tc.id && tc.id);
                  if (existing) {
                    existing.function.name += tc.function?.name ?? '';
                    existing.function.arguments += tc.function?.arguments ?? '';
                  } else {
                    accumulatedToolCalls.push({
                      id: tc.id ?? '',
                      function: {
                        name: tc.function?.name ?? '',
                        arguments: tc.function?.arguments ?? '',
                      },
                    });
                  }
                }
              }

              // v0.3.6: parseCot 调用节流
              // 仅在内容长度变化超过阈值、检测到标签闭合、或首次解析时才执行
              // v0.3.7: 阈值从 50 降至 10，提升流式思考卡片实时性
              // v0.4.0: 流式场景禁用 parseCot 缓存（content 持续变化缓存永不命中）
              // v0.4.6: 阈值从 3 降至 1，实现真正逐字流式思考卡片
              const lengthDelta = accumulatedContent.length - lastParseLength;
              const closingTags = [
                '</cot>', '</think>', '</thinking>', '</reasoning>',
                '</thought>', '</thoughts>', '</reflection>', '</analysis>',
              ];
              const hasClosingTag = closingTags.some((tag) => accumulatedContent.includes(tag));
              const shouldParse =
                !lastCotResult ||
                lengthDelta > 1 ||
                hasClosingTag;

              if (shouldParse) {
                // v0.5.1: 流式过程中允许未闭合标签内容，cot 随 chunk 增量显示
                lastCotResult = parseCot(accumulatedContent, false, true);
                lastParseLength = accumulatedContent.length;
              }
              const cotResult = lastCotResult!;
              const finalCot = (
                accumulatedReasoning +
                (cotResult.cot ? "\n" + cotResult.cot : "")
              ).trim();

              // v0.5.1: 三阶段 thinking 节点独立——按 phase 匹配，不再覆盖不同阶段的思考内容
              if (finalCot) {
                const existingPhaseThinking = agentSteps.find(
                  (s) => s.type === "thinking" && s.phase === phaseNumber
                );
                if (!existingPhaseThinking) {
                  agentSteps.push({
                    id: uuidv4(),
                    type: "thinking",
                    title: THINKING_TITLES[phase] || "模型思考",
                    content: finalCot,
                    status: "running",
                    startedAt: Date.now(),
                    phase: phaseNumber,
                  });
                } else {
                  existingPhaseThinking.content = finalCot;
                }
              }

              // v0.3.6: updateMessage 节流（最少 60ms 间隔），避免高频更新导致 UI 卡顿
              // v0.3.7: 间隔从 60ms 降至 30ms，提升流式输出流畅度（约 33fps）
              // v0.4.1: 降至 16ms(约 60fps),实现逐字流式输出
              const now = Date.now();
              // v0.4.6: 流式诊断日志（记录每次 updateMessage 调用）
              const willUpdate = (now - lastUpdateTick >= 16 || hasClosingTag);
              if (willUpdate) {
                logger.debug("stream", `update: phase=${phase} cot=${finalCot.length}chars content=${(cotResult?.main || "").length}chars steps=${agentSteps.length}`);
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

          // v0.4.4: 累积原生 tool_calls（非流式一次性获取）
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            for (const tc of chunk.toolCalls) {
              accumulatedToolCalls.push({
                id: tc.id ?? '',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              });
            }
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
        // v0.4.6: 流式诊断日志（记录请求完成状态）
        logger.info("stream", `请求完成: phase=${phase} 总字符=${accumulatedContent.length} cot=${finalCotCombined.length}chars steps=${agentSteps.length} toolCalls=${accumulatedToolCalls.length}`);
        // v0.4.4: 返回 toolCalls 字段,供外层工具调用循环使用
        return { content: accumulatedContent, reasoning: accumulatedReasoning, cot: finalCotCombined, toolCalls: accumulatedToolCalls };
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

      // v0.5.1: force 模式已废弃——所有工具现在由 AI 在请求 1 中主动决定是否调用

      // v0.3.7: memory-recall 内置工具预执行
      // v0.4.6: 改为搜索会话级向量记忆分片（searchVectorMemory），不再搜索空库 longTermMemory
      // 被动触发：用最新 user 消息匹配向量分片，召回完整轮次内容
      const memoryRecallConfig = builtinToolConfigs.find(
        (c) => c.type === "memory-recall",
      );
      if (
        memoryRecallConfig?.enabled &&
        currentCharacter?.uuid &&
        memorySettings?.embeddingModel &&
        vectorMemoryShards.length > 0
      ) {
        // v0.4.3: 日志记录记忆召回工具执行
        logger.info("memory", `记忆召回预执行启动（topK=${memoryRecallConfig.resultCount ?? 8}）`);
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
            // v0.4.6: 改为搜索会话级向量记忆分片（带分数）
            const scoredResults = await searchVectorMemoryWithScore(
              recallQuery,
              vectorMemoryShards,
              memorySettings,
              settings,
              allProviders,
              get().apiProviderKeys,
            );
            const recallResults = scoredResults.slice(0, recallTopK);
            logger.info("memory", `记忆召回完成: 找到 ${recallResults.length} 条（topK=${recallTopK}）`);

            // v0.4.1-fix: 标记 tool_call 完成,添加 tool_result 步骤
            recallCallStep.status = "completed";
            recallCallStep.endedAt = Date.now();
            const recallResultText = recallResults.length > 0
              ? recallResults.map((r) => `[score=${r.score.toFixed(3)}] ${r.shard.content}`).join('\n\n')
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
                content: r.shard.content,
                score: r.score,
                turn: r.shard.turn ?? -1,
              }));
              get().updateMessage(assistantMessageId, { memoryRecalls });

              // 将召回结果注入上下文（作为独立 user 消息，不破坏 KV 缓存）
              const recallText = recallResults
                .map(
                  (r, i) =>
                    `  <memory index="${i + 1}" turn="${r.shard.turn ?? -1}" score="${r.score.toFixed(3)}">\n    ${r.shard.content}\n  </memory>`,
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
      } else if (memoryRecallConfig?.enabled) {
        logger.debug("memory", `memory-recall 跳过: enabled=${memoryRecallConfig?.enabled} char=${!!currentCharacter?.uuid} memSettings=${!!memorySettings}`);
      }

      // v0.5.1: vector-memory/keyword-search/world-recall/world-search 预执行已删除
      // 所有工具现在由 AI 在请求 1 中主动决定调用

      // v0.5.1: 三请求架构
      // 请求1: 工具决策 → AI决定调哪些工具 → 执行
      // 请求2: CoT 思考链
      // 请求3: 正文
      // KV 缓存: 三请求系统提示相同，仅在 messages 末尾追加
      logger.info("api", "=== 三请求架构开始 ===");

      // 请求1: 工具决策
      logger.info("api", "API 请求阶段1: 工具决策");
      {
        const msg = get().messages.find(m => m.id === assistantMessageId);
        logger.info("stream", `请求1开始前: agentSteps数=${msg?.agentSteps?.length ?? 0}`);
      }
      const { content: toolDecisionRaw, reasoning: toolReasoning } =
        await callApiWithRetry(assistantMessageId, contextMessages, "tool");
      logger.info("api", `API 响应阶段1: 工具决策完成（字符数=${toolDecisionRaw.length}）`);
      logger.debug("tool", `请求1原始回复(前200字符): ${toolDecisionRaw.slice(0, 200)}`);

      // 解析工具决策并执行
      if (!abortController?.signal.aborted && toolDecisionRaw.trim()) {
        const decisions = parseToolDecisions(toolDecisionRaw);
        if (decisions.length > 0) {
          logger.info("tool", `AI决定调用 ${decisions.length} 个工具: ${decisions.map(d => d.toolName).join(", ")}`);
          for (const d of decisions) {
            if (abortController?.signal.aborted) break;
            try {
              // 查找匹配的 ActiveTool 或 builtin config
              let result = "";
              const builtinConfig = builtinToolConfigs.find(c => c.enabled && c.type === d.toolName);
              if (builtinConfig) {
                // 构造临时 ActiveTool 并调用
                const tempTool: ActiveTool = {
                  id: `builtin-${d.toolName}`, name: d.toolName, type: builtinConfig.type === "anysearch" ? "web" : "vector",
                  callName: d.toolName, description: d.toolName, enabled: true, resultCount: builtinConfig.resultCount || 8,
                  worldInfoAccessMode: "all", enableMode: "all", mcpTools: [],
                } as ActiveTool;
                result = await executeActiveToolCall(
                  { tool: tempTool, mode: "add", callLabel: d.toolName, query: d.query, raw: "", reason: "AI tool decision" },
                  { messages: get().messages, character: currentCharacter, vectorMemoryShards, worldInfoEntries, tavilyApiKey: "", mcpSessionIds: new Map(), anysearchConfig: builtinConfig },
                );
              } else {
                const charUuid = currentCharacter?.uuid ?? null;
                const filtered = filterToolsForCharacter(activeTools, charUuid);
                const userTool = filtered.find(t => t.callName === d.toolName || t.name === d.toolName);
                if (userTool) {
                  result = await executeActiveToolCall(
                    { tool: userTool, mode: "add", callLabel: d.toolName, query: d.query, raw: "", reason: "AI tool decision" },
                    { messages: get().messages, character: currentCharacter, vectorMemoryShards, worldInfoEntries, tavilyApiKey: "", mcpSessionIds: new Map(), anysearchConfig: builtinToolConfigs.find(c => c.type === "anysearch") },
                  );
                } else {
                  result = `<builtin_tool_result status='error'>未找到工具: ${d.toolName}</builtin_tool_result>`;
                  logger.warn("tool", `AI请求的工具不存在: ${d.toolName}（可用: ${[...builtinToolConfigs.filter(c=>c.enabled).map(c=>c.type), ...filterToolsForCharacter(activeTools, currentCharacter?.uuid ?? null).map(t=>t.callName||t.name)].join(", ")}）`);
                }
              }
              const existingMsg = get().messages.find(m => m.id === assistantMessageId);
              const callStep: AgentStep = { id: uuidv4(), type: "tool_call", title: d.toolName, content: d.query, status: "completed", startedAt: Date.now(), endedAt: Date.now(), phase: 1 };
              const resultStep: AgentStep = { id: uuidv4(), type: "tool_result", title: d.toolName, content: result || "(空结果)", status: "completed", startedAt: Date.now(), endedAt: Date.now(), phase: 1 };
              get().updateMessage(assistantMessageId, {
                toolCalls: [...(existingMsg?.toolCalls ?? []), { id: uuidv4(), toolName: d.toolName, callLabel: d.toolName, query: d.query, reason: "AI tool decision", status: "completed", result: result || "(空结果)" }],
                agentSteps: [...(existingMsg?.agentSteps ?? []), callStep, resultStep],
              });
              contextMessages.push({ id: uuidv4(), role: "user", content: `<tool_result tool="${d.toolName}">\n${result || "(空结果)"}\n</tool_result>`, createdAt: Date.now() });
              logger.info("tool", `工具 ${d.toolName} 执行完成: 结果长度=${(result || "").length}`);
            } catch (e) { logger.warn("tool", `工具 ${d.toolName} 执行失败: ${e}`); }
          }
        } else {
          logger.info("tool", `AI决定不调用任何工具（原始回复非空但未匹配到工具标签）`);
        }
      } else {
        logger.warn("tool", "请求1返回空响应，AI未输出任何工具决策");
      }
      if (abortController?.signal.aborted) return;

      // 请求2: CoT 思考链
      logger.info("api", "API 请求阶段2: CoT 思考链生成");
      {
        const msg = get().messages.find(m => m.id === assistantMessageId);
        logger.info("stream", `请求2开始前: agentSteps数=${msg?.agentSteps?.length ?? 0}`);
      }
      const { content: cotRawContent, reasoning: cotReasoning, cot: cotContent } =
        await callApiWithRetry(assistantMessageId, contextMessages, "cot");
      logger.info("api", `API 响应阶段2: CoT 完成（字符数=${cotContent.length}）`);

      if (!cotRawContent.trim() && !cotReasoning.trim() && !cotContent.trim()) {
        get().updateMessage(assistantMessageId, { loading: false, error: "API 返回空响应(CoT 阶段)" });
        return;
      }
      if (abortController?.signal.aborted) return;

      // 请求3: 正文
      logger.info("api", "API 请求阶段3: 正文生成");
      const { content: accumulatedContent, reasoning: accumulatedReasoning, toolCalls: nativeToolCallsFromMain } =
        await callApiWithRetry(assistantMessageId, contextMessages, "main", cotContent);
      console.log('[Phase main result]', accumulatedContent.slice(0, 100));
      logger.info("api", `API 响应阶段3: 正文完成（字符数=${accumulatedContent.length}）`);
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

      // v0.4.4: 优先检测原生 tool_calls（API 原生返回，非文本标签解析）
      // 仅在非 force 模式下检测（force 模式由预执行逻辑处理）
      const nativeToolCalls =
        toolGlobalSettings.mode !== "force" && nativeToolCallsFromMain && nativeToolCallsFromMain.length > 0
          ? nativeToolCallsFromMain
          : null;

      // v0.4.6: 将工具执行相关函数提升到 if 块之前，供原生 tool_calls 路径和文本标签路径共用
      const characterUuid = currentCharacter?.uuid ?? null;
      const filteredTools = filterToolsForCharacter(activeTools, characterUuid);

      // v0.4.4: 工具执行超时保护（30s）
      const executeWithTimeout = async <T>(fn: () => Promise<T>, timeoutMs = 30000): Promise<T> => {
        return Promise.race([
          fn(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('工具执行超时')), timeoutMs),
          ),
        ]);
      };

      // v0.4.4: 根据工具名（callName）查找对应的 ActiveTool 并执行
      // v0.4.6: 先查找内置工具（按 type 匹配），找到则执行内置工具逻辑
      const executeToolByName = async (
        toolName: string,
        query: string,
      ): Promise<string> => {
        // v0.4.6: 先查找内置工具
        const builtinConfig = builtinToolConfigs.find(
          (c) => c.enabled && c.type === toolName,
        );
        if (builtinConfig) {
          const limit = builtinConfig.resultCount || 8;
          // v0.4.6: memory-recall 改为搜索会话向量记忆
          if (toolName === "memory-recall" && vectorMemoryShards.length > 0 && memorySettings) {
            const results = await executeWithTimeout(() =>
              searchVectorMemory(
                query,
                vectorMemoryShards,
                memorySettings,
                settings,
                allProviders,
                get().apiProviderKeys,
              ),
            );
            if (results.length === 0) return "<builtin_tool_result status='empty'>未找到相关记忆。</builtin_tool_result>";
            return results.map((r, i) => `  <memory index="${i + 1}" turn="${r.turn ?? -1}">\n    ${r.content}\n  </memory>`).join('\n\n');
          }
          // vector-memory: 调用 searchVectorMemory
          if (toolName === "vector-memory" && vectorMemoryShards.length > 0) {
            const results = await executeWithTimeout(() =>
              searchVectorMemory(query, vectorMemoryShards, memorySettings, settings, allProviders, get().apiProviderKeys),
            );
            if (results.length === 0) return "<builtin_tool_result status='empty'>未找到相关向量记忆。</builtin_tool_result>";
            return results.map((r, i) => `  <memory index="${i + 1}" turn="${r.turn}">\n    ${r.content}\n  </memory>`).join('\n\n');
          }
          // keyword-search: 优先搜索向量记忆分片，无分片时回退到原始消息
          if (toolName === "keyword-search") {
            const lowerQuery = query.toLowerCase();
            const source = vectorMemoryShards.length > 0
              ? vectorMemoryShards.map(s => ({ content: s.content, role: 'assistant' as const }))
              : get().messages.map(m => ({ content: m.content, role: m.role }));
            const matched = source
              .filter((item) => item.content && item.content.toLowerCase().includes(lowerQuery))
              .slice(-limit);
            if (matched.length === 0) return "<builtin_tool_result status='empty'>未找到匹配的消息。</builtin_tool_result>";
            return matched.map((m, i) => `  <message index="${i + 1}" role="${m.role}">\n    ${m.content.slice(0, 500)}\n  </message>`).join('\n\n');
          }
          // world-recall: 世界书语义检索（需要嵌入模型）
          if (toolName === "world-recall" && worldInfoEntries.length > 0 && memorySettings?.embeddingModel) {
            const enabled = worldInfoEntries.filter((e) => e.enabled !== false);
            if (enabled.length === 0) return "<builtin_tool_result status='empty'>没有已启用的世界书条目。</builtin_tool_result>";
            const queryEmbedding = await executeWithTimeout(() =>
              getEmbedding(query, memorySettings, settings, allProviders, get().apiProviderKeys),
            );
            const scored = enabled.map((e) => {
              const entryEmbedding = e.embedding || [];
              const score = entryEmbedding.length > 0 ? cosineSimilarity(queryEmbedding, entryEmbedding) : 0;
              return { entry: e, score };
            }).sort((a, b) => b.score - a.score).slice(0, limit);
            return scored.map((s, i) => `  <entry index="${i + 1}" name="${s.entry.id}" score="${s.score.toFixed(3)}">\n    ${s.entry.content.slice(0, 4000)}\n  </entry>`).join('\n\n');
          }
          // world-search: 世界书关键词搜索
          if (toolName === "world-search") {
            const enabled = worldInfoEntries.filter((e) => e.enabled !== false);
            const terms = query.split(/[\s,，、;；|｜/\\]+/u).map((t) => t.trim().toLowerCase()).filter(Boolean);
            const matched = enabled.map((e) => {
              const lowerContent = String(e.content || '').toLowerCase();
              const lowerKeys = (e.keys || []).map((k) => String(k).toLowerCase());
              const contentMatches = terms.filter((t) => lowerContent.includes(t));
              const keyMatches = terms.filter((t) => lowerKeys.some((k) => k.includes(t)));
              return { entry: e, score: contentMatches.length + keyMatches.length * 2 };
            }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
            if (matched.length === 0) return "<builtin_tool_result status='empty'>世界书检索未找到匹配条目。</builtin_tool_result>";
            return matched.map((s, i) => `  <entry index="${i + 1}" name="${s.entry.id}">\n    ${s.entry.content.slice(0, 4000)}\n  </entry>`).join('\n\n');
          }
          // anysearch: 联网搜索（复用 executeActiveToolCall 的 anysearch 逻辑）
          if (toolName === "anysearch") {
            const anysearchTool: ActiveTool = {
              id: 'builtin-anysearch',
              name: 'Anysearch',
              type: 'web',
              callName: 'tool_anysearch',
              description: '联网搜索',
              enabled: true,
              resultCount: limit,
              worldInfoAccessMode: 'all',
              enableMode: 'all',
              mcpTools: [],
              tavilyApiKey: '',
            };
            return executeWithTimeout(() =>
              executeActiveToolCall(
                { tool: anysearchTool, mode: "add", callLabel: "tool_anysearch", query, raw: "", reason: "native tool_calls (builtin)" },
                { messages: get().messages, character: currentCharacter, vectorMemoryShards, worldInfoEntries, tavilyApiKey: "", mcpSessionIds: new Map(), anysearchConfig: builtinConfig },
              ),
            );
          }
        }

        // 查找用户工具（现有逻辑）
        const tool = filteredTools.find(
          (t) => t.callName === toolName || t.name === toolName,
        );
        if (!tool) {
          throw new Error(`未找到匹配的工具: ${toolName}`);
        }
        const toolCall: ActiveToolCall = {
          tool,
          mode: "add",
          callLabel: tool.callName || tool.name,
          query,
          raw: "",
          reason: "native tool_calls",
        };
        return executeWithTimeout(() =>
          executeActiveToolCall(toolCall, {
            messages: get().messages,
            character: currentCharacter,
            vectorMemoryShards,
            worldInfoEntries,
            tavilyApiKey: "",
            mcpSessionIds: new Map(),
            anysearchConfig: builtinToolConfigs.find((c) => c.type === "anysearch"),
          }),
        );
      };

      if (nativeToolCalls && nativeToolCalls.length > 0) {
        // === v0.4.4: 原生 tool_calls 模式 ===
        logger.info("api", `检测到原生 tool_calls（数量=${nativeToolCalls.length}），进入原生工具调用模式`);

        // 获取当前消息的 agentSteps 作为初始值
        const nativeAgentSteps: AgentStep[] = [
          ...(get().messages.find((m) => m.id === assistantMessageId)?.agentSteps ?? []),
        ];
        const nativeToolCallRecords: ToolCall[] = [
          ...(get().messages.find((m) => m.id === assistantMessageId)?.toolCalls ?? []),
        ];

        // v0.4.6: 持久化 assistant 消息的 tool_calls（用于续写时 buildContext 识别）
        // 将原生 tool_calls 转换为 ToolCall 格式并持久化到 store
        const persistedToolCalls: ToolCall[] = nativeToolCalls.map((tc) => {
          let queryStr = '';
          try {
            const args = JSON.parse(tc.function.arguments || '{}');
            queryStr = args.query ?? '';
          } catch {
            queryStr = tc.function.arguments;
          }
          return {
            id: tc.id,
            toolName: tc.function.name,
            callLabel: tc.function.name,
            query: queryStr,
            reason: 'native tool_calls',
            status: 'receiving' as const,
          };
        });
        get().updateMessage(assistantMessageId, {
          toolCalls: [...nativeToolCallRecords, ...persistedToolCalls],
        });

        for (const tc of nativeToolCalls) {
          if (abortController?.signal.aborted) break;
          try {
            // 解析工具参数
            let toolArgs: { query?: string; keys?: string };
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {
              toolArgs = { query: tc.function.arguments };
            }

            const queryStr = toolArgs.query ?? '';
            logger.info("api", `执行原生工具调用: ${tc.function.name}（query=${queryStr.slice(0, 50)}）`);

            // 添加 tool_call 步骤（运行中）
            const nativeCallStepId = uuidv4();
            const nativeCallStep: AgentStep = {
              id: nativeCallStepId,
              type: "tool_call",
              title: tc.function.name,
              content: queryStr,
              status: "running",
              startedAt: Date.now(),
            };
            nativeAgentSteps.push(nativeCallStep);
            get().updateMessage(assistantMessageId, {
              agentSteps: [...nativeAgentSteps],
            });

            // 执行工具
            const rawResult = await executeToolByName(tc.function.name, queryStr);

            // v0.4.4: 工具结果长度限制（2000 字符）
            const truncatedResult = rawResult.length > 2000
              ? rawResult.slice(0, 2000) + '\n...[结果已截断]'
              : rawResult;

            // 标记 tool_call 完成，添加 tool_result 步骤
            nativeCallStep.status = "completed";
            nativeCallStep.endedAt = Date.now();
            const nativeResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: tc.function.name,
              content: truncatedResult,
              status: "completed",
              startedAt: nativeCallStep.startedAt,
              endedAt: Date.now(),
            };
            nativeAgentSteps.push(nativeResultStep);

            // 记录 ToolCall
            const matchedTool = filteredTools.find(
              (t) => t.callName === tc.function.name || t.name === tc.function.name,
            );
            nativeToolCallRecords.push({
              id: uuidv4(),
              toolName: matchedTool?.name ?? tc.function.name,
              callLabel: tc.function.name,
              query: queryStr,
              reason: "native tool_calls",
              status: "completed" as const,
              result: truncatedResult,
            });

            // v0.4.6: 将工具结果持久化到 store（使用 user 角色 + XML 标签 + metadata）
            // buildContext 会识别 metadata.isToolResult 并转换为 OpenAI 的 role:'tool' 格式
            // 同时保留在 contextMessages 中以兼容当前请求的上下文
            const toolResultMessage: ChatMessage = {
              id: uuidv4(),
              role: "user",
              content: `<tool_call_result tool="${tc.function.name}">\n${truncatedResult}\n</tool_call_result>`,
              createdAt: Date.now(),
              metadata: {
                toolCallId: tc.id,
                toolName: tc.function.name,
                isToolResult: true,
              },
            };
            get().addMessage(toolResultMessage);
            contextMessages.push(toolResultMessage);

            // 更新消息
            get().updateMessage(assistantMessageId, {
              toolCalls: [...nativeToolCallRecords],
              agentSteps: [...nativeAgentSteps],
            });
          } catch (e) {
            // v0.4.4: 错误容错 - 工具失败不中断主流程
            console.warn('[Tool Calls] 工具执行失败:', tc.function.name, e);
            const errorMsg = e instanceof Error ? e.message : String(e);

            // 添加错误步骤
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: tc.function.name,
              content: errorMsg,
              status: "error",
              startedAt: Date.now(),
              endedAt: Date.now(),
            };
            nativeAgentSteps.push(errorStep);

            const matchedTool = filteredTools.find(
              (t) => t.callName === tc.function.name || t.name === tc.function.name,
            );
            nativeToolCallRecords.push({
              id: uuidv4(),
              toolName: matchedTool?.name ?? tc.function.name,
              callLabel: tc.function.name,
              query: '',
              reason: "native tool_calls",
              status: "error" as const,
              error: errorMsg,
            });

            // v0.4.6: 将错误信息持久化到 store（与成功路径一致的格式）
            const toolErrorMessage: ChatMessage = {
              id: uuidv4(),
              role: "user",
              content: `<tool_call_result tool="${tc.function.name}">\n工具执行失败: ${errorMsg}\n</tool_call_result>`,
              createdAt: Date.now(),
              metadata: {
                toolCallId: tc.id,
                toolName: tc.function.name,
                isToolResult: true,
              },
            };
            get().addMessage(toolErrorMessage);
            contextMessages.push(toolErrorMessage);

            get().updateMessage(assistantMessageId, {
              toolCalls: [...nativeToolCallRecords],
              agentSteps: [...nativeAgentSteps],
            });
          }
        }

        // 更新消息的 agentSteps
        get().updateMessage(assistantMessageId, { agentSteps: [...nativeAgentSteps] });

        // 续写（基于工具结果继续生成）
        if (!abortController?.signal.aborted && nativeToolCalls.length > 0) {
          logger.info("api", "原生工具调用完成，发起续写请求");
          // 创建新的 assistant 消息用于续写
          const continuationMessage: ChatMessage = {
            id: uuidv4(),
            role: "assistant",
            content: "",
            createdAt: Date.now(),
            loading: true,
          };
          get().addMessage(continuationMessage);
          currentAssistantId = continuationMessage.id;

          const newContextMessages = get().messages.filter(
            (m) => m.id !== continuationMessage.id,
          );
          // v0.4.6: 续写请求不追加 cotContent（工具结果已在 messages 中，避免顺序错乱）
          // 续写时从 get().messages 取（已包含 assistant(tool_calls) + user(tool_result) 消息）
          // v0.4.6: 续写请求不注入 tools，防止模型再次发起 tool_calls 导致无限循环
          // v0.4.6: 原生 tool_calls 路径无需 MAX_CONTINUATIONS 循环保护，
          //         因为 skipToolsInjection=true 在 API 层面阻止模型再次发起 tool_calls
          await callApiWithRetry(
            continuationMessage.id,
            newContextMessages,
            "main",
            undefined, // v0.4.6: 不追加 cotContent
            true, // v0.4.6: skipToolsInjection
          );
        }
      } else if (activeTools.length > 0 || builtinToolConfigs.some((c) => c.enabled)) {
        // === 回退到文本标签解析模式（原有逻辑） ===
        // v0.4.6: 同时支持用户工具和内置工具的文本标签
        const characterUuid = currentCharacter?.uuid ?? null;
        const filteredTools = filterToolsForCharacter(
          activeTools,
          characterUuid,
        );

        // v0.4.6: 最多迭代 MAX_CONTINUATIONS 次以防止无限循环
        for (let iteration = 0; iteration < MAX_CONTINUATIONS; iteration++) {
          if (iteration === MAX_CONTINUATIONS - 1) {
            logger.warn("api", "达到最大续写次数限制: " + MAX_CONTINUATIONS);
          }
          // 检查是否已被用户取消，避免取消后继续发起工具调用与 API 请求
          if (abortController?.signal.aborted) break;

          const currentAssistantMsg = get().messages.find(
            (m) => m.id === currentAssistantId,
          );
          if (!currentAssistantMsg) break;

          // v0.4.6: 同时扫描用户工具和内置工具的文本标签
          const toolCall = findPendingActiveToolCallInText(
            currentAssistantMsg.content,
            filteredTools,
          );
          const builtinToolCall = !toolCall
            ? findPendingBuiltinToolCallInText(currentAssistantMsg.content, builtinToolConfigs)
            : null;

          if (!toolCall && !builtinToolCall) break;

          try {
            // v0.4.6: 处理内置工具调用
            if (builtinToolCall) {
              const toolCallStepId = uuidv4();
              const toolCallStep: AgentStep = {
                id: toolCallStepId,
                type: "tool_call",
                title: builtinToolCall.callLabel,
                content: builtinToolCall.query,
                status: "running",
                startedAt: Date.now(),
              };

              // 复用 executeToolByName 执行内置工具
              const result = await executeToolByName(builtinToolCall.callLabel, builtinToolCall.query);

              toolCallStep.status = "completed";
              toolCallStep.endedAt = Date.now();
              const toolResultStep: AgentStep = {
                id: uuidv4(),
                type: "tool_result",
                title: builtinToolCall.callLabel,
                content: result,
                status: "completed",
                startedAt: Date.now(),
                endedAt: Date.now(),
              };

              const currentMsgForSteps = get().messages.find(
                (m) => m.id === currentAssistantId,
              );
              get().updateMessage(currentAssistantId, {
                toolCalls: [
                  ...(currentAssistantMsg.toolCalls ?? []),
                  {
                    id: uuidv4(),
                    toolName: builtinToolCall.callLabel,
                    callLabel: builtinToolCall.callLabel,
                    query: builtinToolCall.query,
                    reason: "builtin tool text label",
                    status: "completed" as const,
                    result,
                  },
                ],
                agentSteps: [
                  ...(currentMsgForSteps?.agentSteps ?? []),
                  toolCallStep,
                  toolResultStep,
                ],
              });

              // 添加工具结果作为用户消息
              const toolResultMessage: ChatMessage = {
                id: uuidv4(),
                role: "user",
                content: `<builtin_tool_result tool="${builtinToolCall.callLabel}">\n${result}\n</builtin_tool_result>`,
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

              const newContextMessages = get().messages.filter(
                (m) => m.id !== continuationMessage.id,
              );
              // v0.4.6: 续写请求不注入 tools，防止无限循环
              await callApiWithRetry(
                continuationMessage.id,
                newContextMessages,
                "main",
                cotContent,
                true, // skipToolsInjection
              );

              currentAssistantId = continuationMessage.id;
              continue;
            }

            // 执行用户工具调用（现有逻辑）
            // v0.4.6: 添加 toolCall 非空守卫，TypeScript 类型收窄
            if (!toolCall) continue;
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
            // v0.4.6: catch 块中 TypeScript 无法继承 try 块的类型收窄，使用非空断言
            const errorStep: AgentStep = {
              id: uuidv4(),
              type: "tool_call",
              title: toolCall!.tool.name,
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
                  toolName: toolCall!.tool.name,
                  callLabel: toolCall!.callLabel,
                  query: toolCall!.query,
                  reason: toolCall!.reason,
                  status: "error" as const,
                  error:
                    toolError instanceof Error
                      ? toolError.message
                      : String(toolError),
                  mcpSubToolName: toolCall!.mcpSubToolName,
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

    // v0.4.6: 继续剧情 - 在末尾追加 user 消息后生成新的 assistant 回复
    // KV 缓存保护:仅在末尾追加 user 消息,前缀(system_prompt + history)不变,缓存命中
    continueStory: async () => {
      if (!get().currentCharacter) return;
      if (get().isGenerating) return;
      const { messages } = get();
      if (messages.length === 0) return;

      // 追加 user 消息,指示 AI 继续剧情发展
      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: "user",
        content: "请继续剧情的发展，请勿重复上一轮的剧情内容和言行。",
        createdAt: Date.now(),
      };

      // 创建新的空 assistant 消息
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        loading: true,
      };

      set({
        messages: [...messages, userMessage, assistantMessage],
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
        // v0.4.5: 方案 D - 使用 NativeBridge 替代 Capacitor/Share
        const { isNativePlatform, shareText } = await import('~/services/nativeBridge');
        if (isNativePlatform()) {
          // 原生平台使用 NativeBridge 唤起系统分享面板
          await shareText(text, 'LUZZY 消息', '分享消息');
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
