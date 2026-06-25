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
  RegexScript,
  RegexScriptGroup,
  MemorySettings,
  ActiveTool,
  ActiveToolCall,
  VectorMemoryShard,
  ApiSettings,
  AgentStep,
  MemoryRecall,
  WorldInfoRecall,
  ToolCall,
} from "~/types/luzzy";
import { PASSIVE_TOOL_TYPES } from "~/types/luzzy";
import {
  buildContext,
  processRegex,
  migrateRegexScripts,
  extractMemory,
  DEFAULT_USER,
  worldInfoKeyMatchesText,
  passesWorldInfoProbability,
  BUILTIN_TOOL_INFO,
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
  getChatCompletionsUrl,
  parseModelName,
} from "~/services/providerService";
import { parseCot } from "~/services/markdownService";
import { getItem, setItem } from "~/services/storage";
import {
  findPendingActiveToolCallInText,
  findPendingBuiltinToolCallInText,
  executeActiveToolCall,
  filterToolsForCharacter,
  // v0.8.11: 导入统一文本标签解析，用于原生 tool_calls 为空时的兜底检测
  // 禁止移除此导入或在文件内重新实现，所有 <tool_calls> 解析必须复用 toolService 版本
  parseToolCallsFromText,
} from "~/services/toolService";
import {
  loadVectorMemoryShards,
  searchVectorMemory,
  searchVectorMemoryWithScore,
  getEmbedding,
  cosineSimilarity,
  removeVectorMemoryShardsByTurn,
  loadWorldVectorMemoryShards,
  saveWorldVectorMemoryShards,
} from "~/services/memoryService";
import { BUILTIN_PRESET_DEFAULTS, LUZZY_PRESET_NAME, BUILTIN_PRESET_VERSION } from "~/services/presetContent";
import { generateSessionTitle } from "~/services/sessionService";
import { BUILTIN_PROVIDERS } from "~/stores/slices/settings-slice";
import type { AppStoreState, ChatSlice } from "~/stores/slices/types";
import { logger } from "~/services/logger";
import { toast } from "sonner";

// v0.8.1: MAX_CONTINUATIONS 已移除，改为动态读取 toolGlobalSettings.maxAgentSteps

// ============================================================================
// 辅助函数
// ============================================================================

// v0.8.5: getDefaultPresets 已被 mergePresets 取代，不再使用

/**
 * 合并内置预设与用户覆盖，应用 Luzzy 强制只读逻辑
 * v0.8.5: 修复存储键不一致导致用户预设修改丢失的 bug
 * @param customPresets - 用户自定义预设列表
 * @param builtinOverrides - 用户对内置预设的覆盖记录
 * @returns 合并后的完整预设列表
 */
const mergePresets = (
  customPresets: Preset[],
  builtinOverrides: Record<string, Preset>,
): Preset[] => {
  const builtins = BUILTIN_PRESET_DEFAULTS.map((p, i) => {
    // Luzzy 预设强制启用、全局、只读，不接受用户覆盖
    if (p.name === LUZZY_PRESET_NAME) {
      return {
        id: `builtin-${i}`,
        name: p.name,
        content: p.content,
        isBuiltin: true,
        isReadonly: true,
        enabled: true,
        enabledForCharacters: [],
        createdAt: 0,
        updatedAt: 0,
      };
    }
    // 其他内置预设：应用用户覆盖（含防御性默认值）
    const override = builtinOverrides[p.name];
    if (override) {
      return {
        ...override,
        id: `builtin-${i}`,
        name: p.name,
        content: override.content ?? p.content,
        isBuiltin: true,
        isReadonly: override.isReadonly ?? false,
        enabled: override.enabled ?? true,
        enabledForCharacters: override.enabledForCharacters ?? [],
        createdAt: override.createdAt ?? 0,
        updatedAt: override.updatedAt ?? 0,
      };
    }
    return {
      id: `builtin-${i}`,
      name: p.name,
      content: p.content,
      isBuiltin: true,
      isReadonly: false,
      enabled: true,
      enabledForCharacters: [],
      createdAt: 0,
      updatedAt: 0,
    };
  });
  // v0.8.5: 过滤自定义预设中名为 Luzzy 的项，避免与内置 Luzzy 预设重复
  return [...builtins, ...customPresets.filter((p) => p.name !== LUZZY_PRESET_NAME)];
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
  // v0.8.13: 与 memory.tsx 默认值 15 对齐（原 5 导致召回数量被默认值腰斩）
  // 【严禁改回 5 —— 会与记忆页设置不一致，导致用户即使调高 topK 也被默认值覆盖】
  vectorTopK: 15,
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 10,
  longTermMemoryCharacterIds: [],
};

// v0.8.5: 嵌入模型失败一次性提示标志（防止 fire-and-forget 重复 toast）
let embeddingFailureNotified = false;

// v0.8.12: 移除 chatStreamBuffer / chatScheduleFlush / chatClearBuffer
// 原因：rAF 批量合并将一帧内所有 chunk 合并为一次 updateMessage，破坏严格逐字流式
// 现在：每个 onChunk 直接调用 get().updateMessage，配合网络层 nextFrame 分片实现 60fps 逐字
// agentSteps 引用稳定化逻辑迁移到 generateResponse 函数内的 lastAgentStepsSnapshot 局部变量

// v0.7.1: 单阶段架构 — parseToolDecisions 已删除
// 模型通过原生 tool_calls (function calling) 自行决定调用工具
// v0.8.2: getChatCompletionsUrl 已提取至 providerService.ts 作为公共函数

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
  const currentModel = targetProvider?.models?.find((m) => m.name === actualModelName);
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

export const createChatSlice: StateCreator<AppStoreState, [], [], ChatSlice> = (set, get) => {
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
  const generateResponse = async (assistantMessageId: string): Promise<void> => {
    // v0.8.12: 移除 chatClearBuffer（rAF 批量合并已删除，无需重置缓冲区）
    // v0.8.7-urgent: 重置 embeddingFailureNotified 标志（F1）
    embeddingFailureNotified = false;
    // v0.8.12: agentSteps 引用稳定化快照（替代已删除的 chatStreamBuffer.agentSteps）
    // 避免每 chunk 重建整个 agentSteps 数组导致 React.memo 失效
    let lastAgentStepsSnapshot: AgentStep[] | null = null;
    const state = get();
    const { messages, currentCharacter, abortController, currentSessionId } = state;

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
      const allProviders = [...BUILTIN_PROVIDERS, ...get().customApiProviders];

      // v0.8.5: 内置预设版本检查 — 版本不匹配时强制清除用户覆盖
      // 与 preset.tsx 的版本检查逻辑保持一致，确保聊天链路也使用最新内置预设
      const storedPresetVersion = await getItem<number>("presets", "builtinVersion");
      if (storedPresetVersion !== BUILTIN_PRESET_VERSION) {
        await setItem("presets", "builtinOverrides", {});
        await setItem("presets", "builtinVersion", BUILTIN_PRESET_VERSION);
        logger.info("preset", `内置预设版本升级：${storedPresetVersion ?? "无"} → ${BUILTIN_PRESET_VERSION}，已清除用户覆盖`);
      }

      // 1. 从 IndexedDB 加载预设、世界书、全局记忆、正则脚本、记忆设置
      // v0.3.0: 正则脚本迁移为 RegexScriptGroup[] 结构
      // v0.8.5: 修复存储键不一致 — 读取 "custom" + "builtinOverrides" 而非 "presets"
      const [
        customPresetsData,
        builtinOverridesData,
        worldInfoData,
        regexGroupsData,
        oldRegexScriptsData,
        memorySettingsData,
        vectorMemoryShardsData,
      ] = await Promise.all([
        getItem<Preset[]>("presets", "custom"),
        getItem<Record<string, Preset>>("presets", "builtinOverrides"),
        getItem<WorldInfoEntry[]>("worldInfo", "worldInfo"),
        getItem<RegexScriptGroup[]>("regexScripts", "regexGroups"),
        getItem<RegexScript[]>("regexScripts", "regexScripts"),
        getItem<MemorySettings>("memory", "memorySettings"),
        currentCharacter
          ? loadVectorMemoryShards(currentCharacter.uuid, currentSessionId ?? undefined)
          : Promise.resolve<VectorMemoryShard[]>([]),
      ]);

      // v0.8.5: 合并内置预设与用户覆盖，应用 Luzzy 强制只读逻辑
      const presets = mergePresets(
        customPresetsData ?? [],
        builtinOverridesData ?? {},
      );
      // v0.3.2: 按角色过滤世界书条目（仅加载当前角色关联的 + 全局无 bookId 的）
      // v0.4.1: 改用 extensions.worldInfoId 过滤,使手动创建的世界书也能生效
      // 导入角色卡时 worldInfoId 设为 characterUuid,条目 bookId 也是 characterUuid,自然匹配
      const worldInfoId = currentCharacter?.extensions?.worldInfoId as string | undefined;
      const worldInfoEntries = worldInfoId
        ? (worldInfoData ?? []).filter((e) => e.bookId === worldInfoId || !e.bookId)
        : (worldInfoData ?? []).filter((e) => !e.bookId);
      // v0.4.3: 日志记录世界书加载
      logger.info(
        "world",
        `世界书加载（总条目=${worldInfoData?.length ?? 0}，过滤后=${worldInfoEntries.length}，worldInfoId=${worldInfoId ?? "无"}）`,
      );
      // v0.3.0: 优先使用新的 regexGroups；若不存在但有旧 regexScripts，则迁移
      let regexGroups: RegexScriptGroup[] = regexGroupsData ?? [];
      if (regexGroups.length === 0 && oldRegexScriptsData && oldRegexScriptsData.length > 0) {
        regexGroups = migrateRegexScripts(oldRegexScriptsData);
        // 持久化迁移结果，清理旧数据
        await setItem("regexScripts", "regexGroups", regexGroups);
        await setItem("regexScripts", "regexScripts", []);
      }
      // v0.7.1: 按当前角色过滤正则脚本组（enabledForCharacters 为空或 undefined 时全局生效）
      const currentCharUuid = get().currentCharacterUuid;
      if (currentCharUuid) {
        regexGroups = regexGroups.filter(
          (g) =>
            !g.enabledForCharacters ||
            g.enabledForCharacters.length === 0 ||
            g.enabledForCharacters.includes(currentCharUuid),
        );
      }
      // v0.8.5: 按当前角色过滤预设（enabledForCharacters 为空或 undefined 时全局生效）
      let filteredPresets = presets;
      if (currentCharUuid) {
        filteredPresets = presets.filter(
          (p) =>
            !p.enabledForCharacters ||
            p.enabledForCharacters.length === 0 ||
            p.enabledForCharacters.includes(currentCharUuid),
        );
      }
      const memorySettings = memorySettingsData ?? DEFAULT_MEMORY_SETTINGS;
      const vectorMemoryShards = vectorMemoryShardsData ?? [];
      // v0.6.2-fix: currentCharacter 为空时记录诊断日志，避免 pipeline 静默停摆
      if (!currentCharacter?.uuid) {
        logger.warn("memory", "generateResponse: currentCharacter 为空，向量记忆分片加载为空数组");
      }
      logger.debug("memory", `向量记忆分片加载: ${vectorMemoryShards.length} 个`);

      // v0.3.0 新增：从 store 读取内置工具配置
      const builtinToolConfigs = get().builtinToolConfigs;
      const toolGlobalSettings = get().toolGlobalSettings;
      // v0.8.1: Agentic 循环最大步数（动态读取，替代旧的 MAX_CONTINUATIONS）
      const maxAgentSteps = toolGlobalSettings.maxAgentSteps ?? 10;

      // v0.7.1: 单阶段架构 — 合并原 Phase 1（工具决策）+ Phase 2（CoT/正文）
      // 模型通过原生 tool_calls (function calling) 自行决定调用工具
      // KV 缓存优化: system prompt 稳定（不再有 phase=1/2 差异），前缀缓存命中率提升

      // v0.7.2: 全局计时 — 首次请求到正文结束（含工具续写）
      const firstRequestStartTime = Date.now();

      // v0.7.3-fix: 标记 world-recall 预执行是否成功
      // 为 true 时跳过 buildContext 内的 [World Info] 注入，避免双重注入+反馈回路
      // 预执行失败时保持 false，buildContext 走经典注入路径作为回退
      // 声明在 callApiAndUpdate 之前，确保闭包能正确捕获
      let worldRecallPreExecuted = false;

      // v0.4.1-fix: 带重试退避的 API 调用包装(针对 429 ServerOverloaded)
      // 最多重试 3 次,退避间隔递增(2s/4s/8s),重试期间显示提示
      // v0.4.4: 返回值新增 toolCalls 字段,支持原生 tool_calls 透传
      // v0.8.1: 签名改为 options 对象 + tool_choice: 'required' 回退机制
      const callApiWithRetry = async (
        msgId: string,
        contextMsgs: ChatMessage[],
        options: {
          skipToolsInjection?: boolean;
          forceToolCall?: boolean;
        } = {},
      ): Promise<{
        content: string;
        reasoning: string;
        cot: string;
        toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
      }> => {
        const maxRetries = 3;
        const baseDelays = [2000, 4000, 8000]; // 递增退避
        let lastError: unknown;
        let triedForceToolCallFallback = false; // v0.8.1: tool_choice 回退标记

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (abortController?.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }

          try {
            return await callApiAndUpdate(msgId, contextMsgs, options);
          } catch (err) {
            // 用户取消不重试
            if (err instanceof DOMException && err.name === "AbortError") throw err;

            const errMessage = err instanceof Error ? err.message : String(err);

            // v0.8.1: 回退机制 — tool_choice: 'required' 不支持时回退到 'auto'
            if (
              options.forceToolCall &&
              !triedForceToolCallFallback &&
              (errMessage.includes("400") ||
                errMessage.includes("tool_choice") ||
                errMessage.includes("invalid") ||
                errMessage.includes("Bad Request"))
            ) {
              logger.warn("api", 'tool_choice: "required" 不被支持，回退到 "auto"');
              triedForceToolCallFallback = true;
              options = { ...options, forceToolCall: false };
              continue; // 立即重试，不等待
            }

            // 检查是否为 429 错误
            const is429 =
              errMessage.includes("429") ||
              errMessage.includes("TooManyRequests") ||
              errMessage.includes("ServerOverloaded") ||
              errMessage.includes("server overload");

            if (!is429 || attempt === maxRetries) throw err;

            // 429 错误:显示退避提示并等待
            const delay = baseDelays[attempt];
            console.warn(
              `[ChatSlice] API 429 错误,${delay / 1000}秒后重试(${attempt + 1}/${maxRetries})`,
            );
            get().updateMessage(msgId, {
              loading: true,
              error: `服务器繁忙,${delay / 1000}秒后自动重试(${attempt + 1}/${maxRetries})...`,
            });

            // 等待退避时间(可被中止)
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delay);
              const onAbort = (): void => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              };
              if (abortController?.signal.aborted) {
                onAbort();
                return;
              }
              abortController?.signal.addEventListener("abort", onAbort, { once: true });
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
        options: {
          skipToolsInjection?: boolean;
          forceToolCall?: boolean;
        } = {},
      ): Promise<{
        content: string;
        reasoning: string;
        cot: string;
        toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
      }> => {
        // v0.8.12: chatClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需重置）
        const skipToolsInjection = options.skipToolsInjection ?? false;
        const forceTool = options.forceToolCall ?? false;
        // 构建 API 上下文
        // v0.5.0: 从 store 读取当前激活的用户档案，覆写默认空档案
        const activeUser = (() => {
          const st = get();
          if (st.activeProfileId) {
            const profile = (st.userProfiles ?? []).find((p) => p.uuid === st.activeProfileId);
            if (profile?.name?.trim() || profile?.description?.trim()) return profile;
          }
          return st.user?.name?.trim() || st.user?.description?.trim() ? st.user : DEFAULT_USER;
        })();
        // v0.7.1: 单阶段架构 — buildContext 不再有 phase 参数
        // v0.7.3-fix: 传入 skipWorldInfoInjection，当 world-recall 预执行成功时跳过经典注入
        const { apiMessages: rawApiMessages } = await buildContext({
          messages: contextMsgs,
          character: currentCharacter,
          user: activeUser,
          presets: filteredPresets,
          worldInfoEntries,
          settings,
          apiProviders: allProviders,
          apiProviderKeys: get().apiProviderKeys,
          vectorMemoryShards,
          memorySettings,
          sessionId: currentSessionId ?? undefined,
          builtinToolConfigs,
          activeTools,
          skipWorldInfoInjection: worldRecallPreExecuted,
          toolMode: toolGlobalSettings.mode, // v0.8.1: 传入工具模式
          maxAgentSteps: maxAgentSteps, // v0.8.1: 传入 Agentic 最大步数
        });

        // v0.4.3: 日志记录上下文构建完成
        logger.info("api", `上下文构建完成（消息数=${rawApiMessages.length}）`);

        // 应用正则脚本处理（系统消息跳过）
        // v0.3.0: 使用新的 RegexScriptGroup[] 结构，scope/timing 过滤
        let apiMessages = rawApiMessages.map((msg) => {
          if (msg.role === "system") return msg;
          const scope = msg.role === "user" ? "user" : "character";
          return {
            ...msg,
            content: processRegex(msg.content, regexGroups, scope, "send", DEFAULT_USER),
          };
        });

        // v0.7.1: 单阶段架构 — 不再有 phase="tool" 角色名剥离

        // 多供应商路由：根据模型名前缀解析对应的供应商 URL/Key
        const chatApiUrl = getApiUrlForModel(get().modelName, allProviders, get().apiUrl);
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
        // v0.8.1: 过滤被动工具（PASSIVE_TOOL_TYPES），使用 BUILTIN_TOOL_INFO 真实描述
        // v0.8.1: 续写请求（skipToolsInjection=false）仍注入 tools，支持 Agentic 多步循环
        const builtinToolsForRequest =
          toolGlobalSettings.mode !== "force" && !skipToolsInjection
            ? builtinToolConfigs
                .filter((c) => c.enabled && !PASSIVE_TOOL_TYPES.has(c.type))
                .map((c) => ({
                  type: c.type,
                  callName: c.type,
                  description: BUILTIN_TOOL_INFO[c.type]?.description ?? c.type,
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
            forceToolCall: forceTool, // v0.8.1: 首次请求强制 tool_choice: 'required'
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
        const existingMsg = get().messages.find((m) => m.id === msgId);
        const agentSteps: AgentStep[] = existingMsg?.agentSteps ? [...existingMsg.agentSteps] : [];
        // v0.4.4: 累积原生 tool_calls（流式增量合并）
        const accumulatedToolCalls: Array<{
          id: string;
          function: { name: string; arguments: string };
        }> = [];

        // v0.3.6: parseCot 调用节流，避免每个 chunk 都全量解析
        // 仅在内容长度变化超过阈值或检测到标签闭合时才解析
        let lastParseLength = 0;
        let lastCotResult: ReturnType<typeof parseCot> | null = null;
        // v0.8.7-urgent: 移除死代码 lastUpdateTick（rAF 缓冲已替代节流逻辑）
        // v0.8.7-urgent: D1 优化 — 用布尔标志避免每 chunk 全文扫描 includes
        let hasCotTag = false; // 是否已检测到 <cot> 标签
        let hasClosingTag = false; // 是否已检测到闭合标签

        if (get().stream) {
          // === 流式请求 ===
          await sendStreamRequest({
            url,
            apiKey: chatApiKey,
            body: requestBody,
            signal: abortController.signal,
            onChunk: (_dataStr, parsed) => {
              // v0.5.3: abort 后不再处理 chunk，避免向已卸载组件写入状态
              if (abortController?.signal.aborted) return;
              const chunk = parseSSEChunk(parsed);

              // 提取 usage（OpenAI 在最后一个 chunk 携带；Anthropic 分 message_start/message_delta 携带，需合并）
              if (chunk.usage) {
                lastUsage = { ...lastUsage, ...chunk.usage };
              }

              if (chunk.reasoningContent) {
                accumulatedReasoning += chunk.reasoningContent;
                if (!get().isThinking) set({ isThinking: true }); // v0.8.7-urgent: 守卫避免重复 set
                // v0.5.5-arch: reasoning_content 创建「头脑风暴」节点（type=brainstorm）
                // v0.7.1: 单阶段架构 — 不再有 phase 区分
                const existingBrainstorm = agentSteps.find((s) => s.type === "brainstorm");
                if (!existingBrainstorm) {
                  agentSteps.push({
                    id: uuidv4(),
                    type: "brainstorm",
                    title: "头脑风暴",
                    content: accumulatedReasoning,
                    status: "running",
                    startedAt: Date.now(),
                  });
                } else {
                  existingBrainstorm.content = accumulatedReasoning;
                }
              }

              if (chunk.content) {
                accumulatedContent += chunk.content;
                if (!get().isReceiving || get().isThinking) set({ isThinking: false, isReceiving: true }); // v0.8.7-urgent: 守卫避免重复 set（F2: 补充 isThinking 检查）
                // v0.7.1: 单阶段架构 — content 是正文（或 <cot> 降级模式）
                // v0.8.7-urgent: D1 优化 — 用布尔标志避免每 chunk 全文扫描
                if (!hasCotTag && accumulatedContent.includes("<cot>")) {
                  hasCotTag = true;
                }
                if (hasCotTag) {
                  const fallbackCotResult = parseCot(accumulatedContent, false, true);
                  if (fallbackCotResult.cot) {
                    const existingCotOutput = agentSteps.find((s) => s.type === "cot_output");
                    if (!existingCotOutput) {
                      agentSteps.push({
                        id: uuidv4(),
                        type: "cot_output",
                        title: "CoT 输出",
                        content: fallbackCotResult.cot,
                        status: "running",
                        startedAt: Date.now(),
                      });
                    } else {
                      existingCotOutput.content = fallbackCotResult.cot;
                    }
                  }
                }
              }
              // v0.5.6-fix: 移除 phase="main" 时 reasoning_content 计入正文的逻辑
              // 原代码导致正文气泡显示分析文本（"用户输入是..."）而非纯叙事
              // reasoning_content 仍会创建 brainstorm 节点（上方 L627-648 逻辑不变）
              // 仅在流式完成后 content 完全为空时才回退到 reasoning（见 return 语句）

              // v0.4.6: 流式诊断日志
              if (chunk.content || chunk.reasoningContent) {
                logger.debug(
                  "stream",
                  `chunk: content+${chunk.content.length} reasoning+${chunk.reasoningContent.length} 累计${accumulatedContent.length}`,
                );
              }

              // v0.4.4: 累积原生 tool_calls（流式增量合并）
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

              // v0.3.6: parseCot 调用节流
              // 仅在内容长度变化超过阈值、检测到标签闭合、或首次解析时才执行
              // v0.3.7: 阈值从 50 降至 10，提升流式思考卡片实时性
              // v0.4.0: 流式场景禁用 parseCot 缓存（content 持续变化缓存永不命中）
              // v0.4.6: 阈值从 3 降至 1，实现真正逐字流式思考卡片
              const lengthDelta = accumulatedContent.length - lastParseLength;
              // v0.8.7-urgent: D1 优化 — 用布尔标志避免每 chunk 全文扫描 closingTags
              if (!hasClosingTag) {
                const closingTags = [
                  "</cot>",
                  "</think>",
                  "</thinking>",
                  "</reasoning>",
                  "</thought>",
                  "</thoughts>",
                  "</reflection>",
                  "</analysis>",
                ];
                hasClosingTag = closingTags.some((tag) => accumulatedContent.includes(tag));
              }
              // v0.8.7: 阈值降至 4，平衡实时性与性能
              const shouldParse = !lastCotResult || lengthDelta > 4 || hasClosingTag;

              if (shouldParse) {
                // v0.5.1: 流式过程中允许未闭合标签内容，cot 随 chunk 增量显示
                lastCotResult = parseCot(accumulatedContent, false, true);
                lastParseLength = accumulatedContent.length;
              }
              const cotResult = lastCotResult!;
              // v0.5.5-arch: parseCot 仅用于正文阶段提取 <cot> 标签外的 main 内容
              // reasoning 和 content 已分别创建 brainstorm/cot_output 节点，不再合并到 thinking 节点

              // v0.7.1: 单阶段架构 — 始终写入正文气泡和 agentSteps
              // reasoning_content → brainstorm 节点（上方已创建）
              // content → 正文气泡（parseCot 分离 <cot> 标签后的 main 内容）
              // v0.8.12: 移除 rAF 批量合并，每 chunk 直接 updateMessage，实现严格逐字流式
              // 配合网络层每行 await nextFrame 分片，每个 token 独立成帧，React 不会自动批处理
              // agentSteps 引用稳定化（保留，避免每 chunk 重建数组导致 React.memo 失效）：
              // - 长度变化（步骤新增/完成）：创建全新数组+全新元素引用
              // - 长度未变但内容变化：仅更新最后一个步骤的引用
              const update: Partial<ChatMessage> = { loading: false };
              update.content = cotResult.main || accumulatedContent;
              update.reasoningContent = accumulatedReasoning;
              const currentStepCount = agentSteps.length;
              const lastStepCount = lastAgentStepsSnapshot?.length ?? -1;
              if (currentStepCount !== lastStepCount) {
                // 长度变化：创建全新数组+全新元素引用
                update.agentSteps = agentSteps.map((s) => ({ ...s }));
                lastAgentStepsSnapshot = update.agentSteps;
              } else if (lastAgentStepsSnapshot && currentStepCount > 0) {
                // 长度未变但内容可能变化（如 brainstorm 节点 content 累积）
                // 仅更新最后一个步骤的 content 引用，避免全数组重建
                const lastStep = agentSteps[currentStepCount - 1];
                const bufferedSteps = lastAgentStepsSnapshot;
                const lastBufferedContent = bufferedSteps[currentStepCount - 1].content;
                if (lastBufferedContent !== lastStep.content) {
                  bufferedSteps[currentStepCount - 1] = { ...lastStep };
                  update.agentSteps = bufferedSteps;
                }
              }
              get().updateMessage(msgId, update);
            },
          });

          // v0.8.12: 流式结束同步 flush 块已删除（rAF 批量合并移除后无需同步 flush）
          // 每 chunk 已直接 updateMessage，流结束时最后一个 chunk 的内容已在 store 中
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
                id: tc.id ?? "",
                function: {
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? "",
                },
              });
            }
          }

          const cotResult = parseCot(accumulatedContent);
          // v0.5.5-arch: 非流式也分别创建 brainstorm/cot_output 节点
          if (accumulatedReasoning.trim()) {
            agentSteps.push({
              id: uuidv4(),
              type: "brainstorm",
              title: "头脑风暴",
              content: accumulatedReasoning,
              status: "completed",
              startedAt: requestStartTime,
              endedAt: Date.now(),
            });
          }
          // v0.7.1: 单阶段架构 — 非流式 cot_output 仅在 <cot> 降级模式时创建
          if (accumulatedContent.includes("<cot>")) {
            const fallbackCot = parseCot(accumulatedContent);
            if (fallbackCot.cot) {
              agentSteps.push({
                id: uuidv4(),
                type: "cot_output",
                title: "CoT 输出",
                content: fallbackCot.cot,
                status: "completed",
                startedAt: requestStartTime,
                endedAt: Date.now(),
              });
            }
          }

          // v0.7.1: 单阶段架构 — 始终写入正文气泡和 agentSteps
          get().updateMessage(msgId, {
            content: cotResult.main || accumulatedContent,
            loading: false,
            ...(agentSteps.length > 0 ? { agentSteps: [...agentSteps] } : {}),
          });
        }

        // v0.5.5-arch: 将 brainstorm/cot_output 节点标记为已完成
        const finalElapsedMs = Date.now() - requestStartTime;
        for (const step of agentSteps) {
          if (
            (step.type === "brainstorm" || step.type === "cot_output") &&
            step.status === "running"
          ) {
            step.status = "completed";
            step.endedAt = Date.now();
          }
        }

        // v0.4.0-patch4: 流式结束后强制以"最终态"重新解析并写回 content/cot
        // 修复 BUG：流式中 updateMessage 30ms 节流可能错过最后一个 chunk，
        // 导致 message.content 停留在中间态（例如未闭合 <think> 被吞），气泡空白
        // 此处用 useCache=true 走完成态缓存，确保最终内容正确写回 message
        // v0.7.1: 单阶段架构 — 始终写入正文气泡
        if (get().stream) {
          const finalCotResult = parseCot(accumulatedContent, true);
          get().updateMessage(msgId, {
            content: finalCotResult.main || accumulatedContent,
            loading: false,
            ...(agentSteps.length > 0 ? { agentSteps: [...agentSteps] } : {}),
          });
        }

        // v0.7.2: Token 累积 — 续写时读取已有 tokenUsage 并累加
        const existingTokenUsage = get().messages.find((m) => m.id === msgId)?.tokenUsage;
        const isContinuation = !!existingTokenUsage;

        if (lastUsage) {
          const currentPromptTokens = Number(lastUsage.prompt_tokens ?? 0);
          const currentCompletionTokens = Number(lastUsage.completion_tokens ?? 0);
          const currentCachedTokens = Number(
            (lastUsage.prompt_tokens_details as Record<string, unknown>)?.cached_tokens ?? 0,
          );

          // v0.7.2: 累加已有 tokenUsage（续写场景）
          const promptTokens = currentPromptTokens + (existingTokenUsage?.promptTokens ?? 0);
          const completionTokens =
            currentCompletionTokens + (existingTokenUsage?.completionTokens ?? 0);
          const cachedTokens = currentCachedTokens + (existingTokenUsage?.cachedTokens ?? 0);

          // v0.7.2: 思考 tokens 估算（reasoning 内容长度 / 4）
          const reasoningTokens =
            Math.ceil(accumulatedReasoning.length / 4) + (existingTokenUsage?.reasoningTokens ?? 0);

          // v0.7.2: 工具续写累计 tokens（续写时本次请求的 prompt+completion 计入工具 token）
          const toolCallTokens = isContinuation
            ? (existingTokenUsage?.toolCallTokens ?? 0) +
              currentPromptTokens +
              currentCompletionTokens
            : 0;

          // v0.7.2: 全局计时 — 首次请求到正文结束
          const globalElapsedMs = Date.now() - firstRequestStartTime;

          const cacheHitRate =
            promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 1000) / 10 : undefined;
          const totalTokens = promptTokens + completionTokens + reasoningTokens + toolCallTokens;
          const tokPerSec =
            globalElapsedMs > 0
              ? Math.round((totalTokens / (globalElapsedMs / 1000)) * 10) / 10
              : 0;

          get().updateMessage(msgId, {
            tokenUsage: {
              promptTokens,
              cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
              completionTokens,
              reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
              toolCallTokens: toolCallTokens > 0 ? toolCallTokens : undefined,
              totalTokens,
              responseTimeMs: globalElapsedMs,
              tokPerSec,
              cacheHitRate,
            },
            // v0.5.5-fix: agentSteps 仅在非空时设置，避免 undefined 覆盖已有值
            ...(agentSteps.length > 0 ? { agentSteps: [...agentSteps] } : {}),
          });
        } else {
          // 无 usage 数据时，至少更新最终响应时间
          const globalElapsedMs = Date.now() - firstRequestStartTime;
          const estimatedTokens = Math.ceil(accumulatedContent.length / 4);
          const reasoningTokens =
            Math.ceil(accumulatedReasoning.length / 4) + (existingTokenUsage?.reasoningTokens ?? 0);
          const toolCallTokens = isContinuation
            ? (existingTokenUsage?.toolCallTokens ?? 0) + estimatedTokens
            : 0;
          const totalTokens =
            estimatedTokens +
            reasoningTokens +
            toolCallTokens +
            (existingTokenUsage?.promptTokens ?? 0);
          const tokPerSec =
            globalElapsedMs > 0
              ? Math.round((totalTokens / (globalElapsedMs / 1000)) * 10) / 10
              : 0;
          get().updateMessage(msgId, {
            tokenUsage: {
              promptTokens: existingTokenUsage?.promptTokens ?? 0,
              completionTokens: estimatedTokens + (existingTokenUsage?.completionTokens ?? 0),
              reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
              toolCallTokens: toolCallTokens > 0 ? toolCallTokens : undefined,
              totalTokens,
              responseTimeMs: globalElapsedMs,
              tokPerSec,
            },
            ...(agentSteps.length > 0 ? { agentSteps: [...agentSteps] } : {}),
          });
        }

        // v0.7.1: 单阶段架构 — 返回 CoT 和正文
        // cot 字段 = reasoning_content + <cot> 标签内容
        const cotParsed = parseCot(accumulatedContent, true);
        const cotOnly = cotParsed.cot || cotParsed.main || accumulatedContent;
        const finalCotForReturn = (
          (accumulatedReasoning ? accumulatedReasoning + "\n" : "") + cotOnly
        ).trim();
        // v0.4.6: 流式诊断日志（记录请求完成状态）
        logger.info(
          "stream",
          `请求完成: 总字符=${accumulatedContent.length} cot=${finalCotForReturn.length}chars steps=${agentSteps.length} toolCalls=${accumulatedToolCalls.length}`,
        );
        // v0.7.1: 单阶段架构 — content 即为正文
        const finalContent = accumulatedContent;
        // v0.4.4: 返回 toolCalls 字段,供外层工具调用循环使用
        return {
          content: finalContent,
          reasoning: accumulatedReasoning,
          cot: finalCotForReturn,
          toolCalls: accumulatedToolCalls,
        };
      };

      // 3. 初始 API 调用
      const contextMessages = messages.filter((m) => m.id !== assistantMessageId);

      // v0.3.6: 提前加载 activeTools，供 force 模式预执行和工具调用循环共用
      const activeToolsData = await getItem<ActiveTool[]>("activeTools", "activeTools");
      const activeTools = activeToolsData ?? [];

      // v0.5.1: force 模式已废弃——所有工具现在由 AI 在请求 1 中主动决定是否调用

      // v0.3.7: memory-recall 内置工具预执行
      // v0.4.6: 改为搜索会话级向量记忆分片（searchVectorMemory），不再搜索空库 longTermMemory
      // 被动触发：用最新 user 消息匹配向量分片，召回完整轮次内容
      const memoryRecallConfig = builtinToolConfigs.find((c) => c.type === "memory-recall");
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
            // v0.8.13: 增加最高分 / 阈值 / 命中数诊断，便于排查"为什么没召回"
            // 【严禁简化此日志——是用户排查召回失败的关键诊断信息】
            const maxScore =
              recallResults.length > 0 ? recallResults[0].score : -1;
            logger.info(
              "memory",
              `记忆召回完成: 找到 ${recallResults.length} 条（topK=${recallTopK} 阈值=${memorySettings.similarityThreshold ?? "未设置"} 最高分=${maxScore.toFixed(3)} 分片总数=${vectorMemoryShards.length}）`,
            );

            // v0.4.1-fix: 标记 tool_call 完成,添加 tool_result 步骤
            recallCallStep.status = "completed";
            recallCallStep.endedAt = Date.now();
            const recallResultText =
              recallResults.length > 0
                ? recallResults
                    .map((r) => `[score=${r.score.toFixed(3)}] ${r.shard.content}`)
                    .join("\n\n")
                : "(无匹配记忆)";
            const recallResultStep: AgentStep = {
              id: uuidv4(),
              type: "tool_result",
              title: "记忆召回",
              content: recallResultText,
              status: "completed",
              startedAt: recallCallStep.startedAt,
              endedAt: Date.now(),
              recallResults:
                recallResults.length > 0
                  ? recallResults.map((r) => ({
                      id: uuidv4(),
                      content: r.shard.content,
                      score: r.score,
                      turn: r.shard.turn ?? -1,
                    }))
                  : undefined,
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
              agentSteps: [...(existingMsg?.agentSteps ?? []), recallCallStep, recallResultStep],
            });
          } catch (e) {
            // v0.8.13: 记忆召回预执行失败时必须 toast 通知用户 + logger.error 记录详情
            // 严禁仅 console.warn 静默吞错——用户无法察觉召回失败，会反馈"记忆召回一直无结果"
            // 【严禁移除 toast.error / logger.error —— 会重新回到静默吞错状态】
            const errorMsg = e instanceof Error ? e.message : String(e);
            logger.error("memory", `记忆召回预执行失败: ${errorMsg} | stack=${e instanceof Error ? e.stack ?? "(无 stack)" : "(非 Error 对象)"}`);
            toast.error(`记忆召回失败：${errorMsg}`);
            console.warn("[ChatSlice] memory-recall 预执行失败:", e);
            // v0.4.1-fix: 记录错误步骤
            recallCallStep.status = "error";
            recallCallStep.endedAt = Date.now();
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
        logger.info(
          "memory",
          `memory-recall 跳过: configEnabled=${memoryRecallConfig?.enabled} char=${!!currentCharacter?.uuid} embeddingModel=${!!memorySettings?.embeddingModel} shards=${vectorMemoryShards.length}`,
        );
      }

      // v0.7.2: world-recall 被动预执行（三策略混合召回）
      // 策略1: constant=true → 直接注入全文（不使用嵌入模型）
      // 策略2: keys 匹配最近消息 → 直接召回内容（不使用嵌入模型）
      // 策略3: 非constant条目 → 嵌入向量语义检索（使用嵌入模型，无嵌入模型时跳过）
      // v0.7.3-fix: 三策略结果按 entry.id 去重（保留策略优先级最高的）
      // v0.7.3-fix: 语义召回添加相似度阈值（0.3），避免注入完全不相关的条目
      // v0.7.3-fix: 运行时生成的 embedding 异步持久化到 IndexedDB
      // v0.7.3-fix: 关键词扫描窗口与 buildContext 对齐（最近 2 条消息）
      const worldRecallConfig = builtinToolConfigs.find((c) => c.type === "world-recall");
      if (worldRecallConfig?.enabled && currentCharacter?.uuid && worldInfoEntries.length > 0) {
        const worldLimit = worldRecallConfig.resultCount || 8;
        // v0.7.3-fix: 关键词扫描使用最近 2 条消息（与 buildContext DEFAULT_WORLD_INFO_SCAN_DEPTH 对齐）
        const keywordScanText = messages
          .slice(-2)
          .map((m) => m.content)
          .join("\n");
        // 语义检索仅使用最后一条 user 消息，保持语义精确性
        const semanticQuery = messages.filter((m) => m.role === "user").pop()?.content || "";
        logger.info("world", `世界书召回预执行启动（三策略混合，topK=${worldLimit}）`);
        try {
          const enabledEntries = worldInfoEntries.filter((e) => e.enabled);
          const constantEntries = enabledEntries.filter((e) => e.constant);
          const nonConstantEntries = enabledEntries.filter((e) => !e.constant);

          type RecallResult = {
            entry: WorldInfoEntry;
            score: number;
            strategy: "constant" | "keyword" | "semantic";
          };
          const results: RecallResult[] = [];

          // 策略1: constant 条目直接注入（score=1.0，不使用嵌入模型）
          for (const e of constantEntries) {
            results.push({ entry: e, score: 1.0, strategy: "constant" });
          }

          // 策略2: 关键词匹配（非constant条目，概率检查 + keys匹配，不使用嵌入模型）
          // v0.7.3-fix: 使用 keywordScanText（最近 2 条消息）而非仅最后一条 user 消息
          if (keywordScanText.trim()) {
            for (const e of nonConstantEntries) {
              if (!passesWorldInfoProbability(e)) continue;
              if (!e.keys || e.keys.length === 0) continue;
              const matchedKeys = e.keys.filter((key) =>
                worldInfoKeyMatchesText(key, keywordScanText, e.useRegex),
              );
              if (matchedKeys.length > 0) {
                results.push({ entry: e, score: matchedKeys.length, strategy: "keyword" });
              }
            }
          }

          // 策略3: 语义相似度（所有非constant条目，使用嵌入模型）
          // v0.8.3: 改为异步非阻塞（fire-and-forget）— 不等待语义检索结果，避免首字延迟
          // 语义检索结果异步持久化到 IndexedDB，下次消息发送时策略2(keyword)会命中已持久化的 embedding
          // 当前消息仅使用 constant + keyword 结果，首字延迟降低 60%+
          const WORLD_RECALL_SIMILARITY_THRESHOLD = 0.3;
          if (memorySettings?.embeddingModel && semanticQuery.trim()) {
            // v0.8.3: fire-and-forget — 启动语义检索但不阻塞主流程
            void (async () => {
              try {
                const queryEmbedding = await getEmbedding(
                  semanticQuery,
                  memorySettings,
                  settings,
                  allProviders,
                  get().apiProviderKeys,
                );
                const embeddingsGenerated: Array<{ id: string; embedding: number[] }> = [];
                const semanticScored = await Promise.all(
                  nonConstantEntries.map(async (e) => {
                    let entryEmbedding = e.embedding;
                    if (!entryEmbedding || entryEmbedding.length === 0) {
                      try {
                        entryEmbedding = await getEmbedding(
                          e.content,
                          memorySettings,
                          settings,
                          allProviders,
                          get().apiProviderKeys,
                        );
                        e.embedding = entryEmbedding;
                        embeddingsGenerated.push({ id: e.id, embedding: entryEmbedding });
                      } catch {
                        entryEmbedding = [];
                      }
                    }
                    const score =
                      entryEmbedding.length > 0
                        ? cosineSimilarity(queryEmbedding, entryEmbedding)
                        : 0;
                    return { entry: e, score, strategy: "semantic" as const };
                  }),
                );

                // v0.8.3: 异步持久化运行时生成的 embedding 到 IndexedDB
                if (embeddingsGenerated.length > 0) {
                  try {
                    const allEntries = await getItem<WorldInfoEntry[]>("worldInfo", "worldInfo");
                    if (allEntries) {
                      const merged = allEntries.map((wi) => {
                        const gen = embeddingsGenerated.find((g) => g.id === wi.id);
                        return gen ? { ...wi, embedding: gen.embedding } : wi;
                      });
                      await setItem("worldInfo", "worldInfo", merged);
                      logger.info(
                        "world",
                        `世界书 embedding 异步持久化完成: ${embeddingsGenerated.length} 条`,
                      );
                    }
                  } catch (persistErr) {
                    logger.warn(
                      "world",
                      `世界书 embedding 异步持久化失败: ${(persistErr as Error).message}`,
                    );
                  }
                }

                const semanticHits = semanticScored.filter(
                  (s) => Number.isFinite(s.score) && s.score > WORLD_RECALL_SIMILARITY_THRESHOLD,
                );
                logger.info(
                  "world",
                  `世界书语义召回异步完成: ${semanticHits.length} 条命中（结果已持久化，下次消息生效）`,
                );
              } catch (e) {
                logger.warn("world", `世界书语义召回异步失败（不影响本次消息）: ${e}`);
                // v0.8.5: 首次失败时 toast 提示用户检查嵌入模型配置
                if (!embeddingFailureNotified) {
                  embeddingFailureNotified = true;
                  toast.error("嵌入模型请求失败，世界书语义召回已降级。请检查记忆设置中的嵌入模型配置。");
                }
              }
            })();
            // v0.8.3: 不等待语义检索结果，继续执行
          }

          // v0.7.3-fix: 按 entry.id 去重（保留策略优先级更高的，同策略保留 score 更高的）
          const strategyOrder: Record<string, number> = { constant: 0, keyword: 1, semantic: 2 };
          const dedupedMap = new Map<string, RecallResult>();
          for (const r of results) {
            const existing = dedupedMap.get(r.entry.id);
            if (!existing) {
              dedupedMap.set(r.entry.id, r);
            } else {
              const existingPriority = strategyOrder[existing.strategy] ?? 99;
              const newPriority = strategyOrder[r.strategy] ?? 99;
              if (
                newPriority < existingPriority ||
                (newPriority === existingPriority && r.score > existing.score)
              ) {
                dedupedMap.set(r.entry.id, r);
              }
            }
          }
          const dedupedResults = Array.from(dedupedMap.values());
          const dedupRemoved = results.length - dedupedResults.length;

          // v0.8.10: constant 条目单独限额（全部保留），非 constant 按 worldLimit 截断
          // 原实现：constant 与 keyword/semantic 共享 worldLimit，超过 8 条 constant 时被截断，导致世界规则丢失
          // 修复后：constant 永远全部保留（语义上"总是激活"必须始终注入），非 constant 在剩余配额内按优先级截断
          // 注意：此限额策略不可改回统一 worldLimit 截断，否则会破坏 constant 语义
          const constantResults = dedupedResults.filter((r) => r.strategy === "constant");
          const nonConstantResults = dedupedResults
            .filter((r) => r.strategy !== "constant")
            .sort((a, b) => {
              const sa = strategyOrder[a.strategy] ?? 99;
              const sb = strategyOrder[b.strategy] ?? 99;
              if (sa !== sb) return sa - sb;
              return b.score - a.score;
            });

          // 非 constant 按 (worldLimit - constant 已用配额) 截断，配额耗尽则全部截断
          const remainingQuota = Math.max(0, worldLimit - constantResults.length);
          const truncatedNonConstant = nonConstantResults.slice(0, remainingQuota);
          const truncatedCount = nonConstantResults.length - truncatedNonConstant.length;

          // 最终结果：constant 全部 + 非 constant 截断后（保持 constant 在前的注入顺序）
          const sorted = [...constantResults, ...truncatedNonConstant];

          const cntConst = constantResults.length;
          const cntKw = truncatedNonConstant.filter((s) => s.strategy === "keyword").length;
          const cntSem = truncatedNonConstant.filter((s) => s.strategy === "semantic").length;
          logger.info(
            "world",
            `世界书召回完成: 找到 ${sorted.length} 条（constant=${cntConst} 全部保留 keyword=${cntKw} semantic=${cntSem}，非constant被截断 ${truncatedCount} 条，worldLimit=${worldLimit}，去重移除 ${dedupRemoved} 条）`,
          );

          // v0.8.3: embedding 持久化已移至策略3异步块内（fire-and-forget），此处不再同步等待

          if (sorted.length > 0) {
            const worldInfoRecalls: WorldInfoRecall[] = sorted.map((s) => ({
              id: uuidv4(),
              entryName: s.entry.name || s.entry.id || "未命名",
              content: s.entry.content,
              score: s.score,
              strategy: s.strategy,
            }));
            get().updateMessage(assistantMessageId, { worldInfoRecalls });

            const recallText = sorted
              .map(
                (s, i) =>
                  `  <entry index="${i + 1}" name="${s.entry.name || s.entry.id || "未命名"}" strategy="${s.strategy}" score="${s.score.toFixed(3)}">\n    ${s.entry.content.slice(0, 4000)}\n  </entry>`,
              )
              .join("\n\n");
            contextMessages.push({
              id: uuidv4(),
              role: "user",
              content: `<world_recall_result>\n${recallText}\n</world_recall_result>`,
              createdAt: Date.now(),
            });

            const worldRecallStep: AgentStep = {
              id: uuidv4(),
              type: "memory_inject",
              title: "世界书召回",
              content: recallText,
              status: "completed",
              startedAt: Date.now(),
              endedAt: Date.now(),
              recallResults: worldInfoRecalls,
            };
            const existingMsg = get().messages.find((m) => m.id === assistantMessageId);
            get().updateMessage(assistantMessageId, {
              agentSteps: [...(existingMsg?.agentSteps ?? []), worldRecallStep],
            });

            // v0.7.3-fix: 标记预执行成功，跳过 buildContext 内的经典注入
            worldRecallPreExecuted = true;
          }
        } catch (e) {
          logger.warn("world", `世界书召回预执行失败: ${e}`);
        }
      } else if (worldRecallConfig?.enabled) {
        logger.info(
          "world",
          `world-recall 跳过: configEnabled=${worldRecallConfig?.enabled} char=${!!currentCharacter?.uuid} entries=${worldInfoEntries.length}`,
        );
      }

      // v0.7.1: 单阶段架构 — 单次 API 请求完成 CoT 思考 + 正文输出
      // 模型通过原生 tool_calls (function calling) 自行决定调用工具
      // KV 缓存优化: system prompt 稳定（不再有 phase=1/2 差异），前缀缓存命中率提升
      logger.info("api", "=== 单阶段架构开始 ===");
      logger.info("api", "API 请求: CoT 思考 + 正文输出");
      {
        const msg = get().messages.find((m) => m.id === assistantMessageId);
        logger.info("stream", `请求开始前: agentSteps数=${msg?.agentSteps?.length ?? 0}`);
      }
      const {
        content: cotRawContent,
        reasoning: cotReasoning,
        cot: cotContent,
        toolCalls: nativeToolCallsFromMain,
      } = await callApiWithRetry(assistantMessageId, contextMessages, {
        forceToolCall: toolGlobalSettings.mode === "force", // v0.8.2: 仅 force 模式强制工具调用，否则让模型自主决定
      });
      logger.info(
        "api",
        `API 响应: CoT+正文完成（CoT=${cotContent.length}字符，正文=${cotRawContent.length}字符）`,
      );
      logger.info(
        "chat",
        `消息接收完成（CoT=${cotContent.length}字符，正文=${cotRawContent.length}字符）`,
      );

      // v0.8.2: 空响应检查需考虑 tool_calls — 模型可能只返回工具调用而无正文/思考
      if (
        !cotRawContent.trim() &&
        !cotReasoning.trim() &&
        !cotContent.trim() &&
        (!nativeToolCallsFromMain || nativeToolCallsFromMain.length === 0)
      ) {
        get().updateMessage(assistantMessageId, { loading: false, error: "API 返回空响应" });
        return;
      }
      if (abortController?.signal.aborted) return;

      const accumulatedContent = cotRawContent;
      const accumulatedReasoning = cotReasoning;

      // v0.5.3: Phase 3 完成后检查 abort，避免卸载后继续执行工具调用
      if (abortController?.signal.aborted) return;

      // 7. 检查空响应(正文阶段)
      // v0.8.2: 空响应检查需考虑 tool_calls — 模型可能只返回工具调用而无正文/思考
      if (!accumulatedContent.trim() && !accumulatedReasoning.trim()) {
        // 正文为空但 CoT 有内容或模型返回了工具调用,保留并继续
        if (cotContent.trim() || (nativeToolCallsFromMain && nativeToolCallsFromMain.length > 0)) {
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
      const assistantMsg = get().messages.find((m) => m.id === assistantMessageId);
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
        toolGlobalSettings.mode !== "force" &&
        nativeToolCallsFromMain &&
        nativeToolCallsFromMain.length > 0
          ? nativeToolCallsFromMain
          : null;

      // v0.8.11: 文本标签联合检测 — 当 API 原生 tool_calls 为空但正文含 <tool_calls> 标签时，
      // 调用 toolService.ts 的 parseToolCallsFromText 作为第二道兜底，避免 GLM-5.2 等不支持
      // 原生 function calling 的模型工具调用丢失。
      //
      // 【KV 缓存保护】
      // - system prompt 保持稳定，不随工具调用步数变化
      // - 工具结果以 role: "user" 消息追加，不改变历史前缀
      // - 续写请求仍注入 tools，但 messages 数组前缀不变，缓存命中不受影响
      // 【NSFW 保护】
      // - parseToolCallsFromText 仅解析工具调用标签，不对 query 内容做审查或过滤
      // - NSFW 注入提示词位于 presetContent.ts / 角色卡系统，禁止在此处做任何内容过滤
      // 【禁止修改】
      // - 此兜底逻辑属于核心工具调用管线，禁止删除或简化
      // - 所有 <tool_calls> 文本标签解析必须复用 toolService.parseToolCallsFromText
      let effectiveToolCalls = nativeToolCalls;
      if (
        !effectiveToolCalls &&
        toolGlobalSettings.mode !== "force" &&
        accumulatedContent &&
        accumulatedContent.includes("<tool_calls>")
      ) {
        const parsedFromText = parseToolCallsFromText(accumulatedContent);
        if (parsedFromText.length > 0) {
          logger.info(
            "tool",
            `v0.8.11 兜底: 从正文文本标签解析到 ${parsedFromText.length} 个工具调用（API 原生 toolCalls 为空）`,
          );
          effectiveToolCalls = parsedFromText;
        }
      }

      // v0.4.6: 将工具执行相关函数提升到 if 块之前，供原生 tool_calls 路径和文本标签路径共用
      const characterUuid = currentCharacter?.uuid ?? null;
      const filteredTools = filterToolsForCharacter(activeTools, characterUuid);

      // v0.4.4: 工具执行超时保护（30s）
      // v0.8.7-urgent: 清理 setTimeout，避免 Promise.race 不取消输的 promise（D16）
      const executeWithTimeout = async <T>(fn: () => Promise<T>, timeoutMs = 30000): Promise<T> => {
        let timerId: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            fn(),
            new Promise<T>((_, reject) => {
              timerId = setTimeout(() => reject(new Error("工具执行超时")), timeoutMs);
            }),
          ]);
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      };

      // v0.4.4: 根据工具名（callName）查找对应的 ActiveTool 并执行
      // v0.4.6: 先查找内置工具（按 type 匹配），找到则执行内置工具逻辑
      const executeToolByName = async (toolName: string, query: string): Promise<string> => {
        // v0.4.6: 先查找内置工具
        const builtinConfig = builtinToolConfigs.find((c) => c.enabled && c.type === toolName);
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
            if (results.length === 0)
              return "<builtin_tool_result status='empty'>未找到相关记忆。</builtin_tool_result>";
            return results
              .map(
                (r, i) =>
                  `  <memory index="${i + 1}" turn="${r.turn ?? -1}">\n    ${r.content}\n  </memory>`,
              )
              .join("\n\n");
          }
          // vector-memory: 调用 searchVectorMemory
          if (toolName === "vector-memory" && vectorMemoryShards.length > 0) {
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
            if (results.length === 0)
              return "<builtin_tool_result status='empty'>未找到相关向量记忆。</builtin_tool_result>";
            return results
              .map(
                (r, i) =>
                  `  <memory index="${i + 1}" turn="${r.turn}">\n    ${r.content}\n  </memory>`,
              )
              .join("\n\n");
          }
          // keyword-search: 优先搜索向量记忆分片，无分片时回退到原始消息
          // v0.5.8: 支持多关键词拆分 + 精准匹配评分
          if (toolName === "keyword-search") {
            const terms = query
              .split(/[\s,，、;；|｜/\\]+/u)
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean);
            const source =
              vectorMemoryShards.length > 0
                ? vectorMemoryShards.map((s) => ({
                    content: s.content,
                    role: "assistant" as const,
                  }))
                : get().messages.map((m) => ({ content: m.content, role: m.role }));
            const scored = source
              .map((item) => {
                const lowerContent = String(item.content || "").toLowerCase();
                const matchCount = terms.filter((t) => lowerContent.includes(t)).length;
                return { item, score: matchCount };
              })
              .filter((s) => s.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, limit);
            if (scored.length === 0)
              return "<builtin_tool_result status='empty'>未找到匹配的消息。</builtin_tool_result>";
            return scored
              .map(
                (s, i) =>
                  `  <message index="${i + 1}" role="${s.item.role}" score="${s.score}">\n    ${s.item.content.slice(0, 500)}\n  </message>`,
              )
              .join("\n\n");
          }
          // v0.7.2: world-recall 主动 handler 已删除 — 预执行三策略（constant+keyword+semantic）已完整覆盖
          // v0.7.2: world-search handler 已删除 — 内置工具已从 BuiltinToolType 移除
          // anysearch: 联网搜索（复用 executeActiveToolCall 的 anysearch 逻辑）
          if (toolName === "anysearch") {
            const anysearchTool: ActiveTool = {
              id: "builtin-anysearch",
              name: "Anysearch",
              type: "web",
              callName: "tool_anysearch",
              description: "联网搜索",
              enabled: true,
              resultCount: limit,
              worldInfoAccessMode: "all",
              enableMode: "all",
              mcpTools: [],
              tavilyApiKey: "",
            };
            return executeWithTimeout(() =>
              executeActiveToolCall(
                {
                  tool: anysearchTool,
                  mode: "add",
                  callLabel: "tool_anysearch",
                  query,
                  raw: "",
                  reason: "native tool_calls (builtin)",
                },
                {
                  messages: get().messages,
                  character: currentCharacter,
                  vectorMemoryShards,
                  worldInfoEntries,
                  tavilyApiKey: "",
                  mcpSessionIds: new Map(),
                  anysearchConfig: builtinConfig,
                },
              ),
            );
          }
        }

        // 查找用户工具（现有逻辑）
        const tool = filteredTools.find((t) => t.callName === toolName || t.name === toolName);
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

      if (effectiveToolCalls && effectiveToolCalls.length > 0) {
        // === v0.8.1: Agentic 多步循环 ===
        // 替代旧的单次续写逻辑，支持最多 maxAgentSteps 轮工具调用
        // v0.8.11: effectiveToolCalls 合并了原生 tool_calls 和文本标签兜底解析结果
        logger.info(
          "api",
          `检测到 tool_calls（数量=${effectiveToolCalls.length}），进入 Agentic 循环（最大 ${maxAgentSteps} 步）`,
        );

        // 获取当前消息的 agentSteps 作为初始值
        const nativeAgentSteps: AgentStep[] = [
          ...(get().messages.find((m) => m.id === assistantMessageId)?.agentSteps ?? []),
        ];
        const nativeToolCallRecords: ToolCall[] = [
          ...(get().messages.find((m) => m.id === assistantMessageId)?.toolCalls ?? []),
        ];

        // v0.4.6: 持久化 assistant 消息的 tool_calls（用于续写时 buildContext 识别）
        // 将原生 tool_calls 转换为 ToolCall 格式并持久化到 store
        // v0.8.11: 使用 effectiveToolCalls 替代 nativeToolCalls（含文本标签兜底结果）
        const persistedToolCalls: ToolCall[] = effectiveToolCalls.map((tc) => {
          let queryStr = "";
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            queryStr = args.query ?? "";
          } catch {
            queryStr = tc.function.arguments;
          }
          return {
            id: tc.id,
            toolName: tc.function.name,
            callLabel: tc.function.name,
            query: queryStr,
            reason: "native tool_calls",
            status: "receiving" as const,
          };
        });
        get().updateMessage(assistantMessageId, {
          toolCalls: [...nativeToolCallRecords, ...persistedToolCalls],
        });

        // v0.8.1: 循环检测 — 记录已执行的 (tool, query) 对，重复即终止
        const executedCalls = new Set<string>();

        let currentToolCalls = effectiveToolCalls;
        let stepCount = 0;

        while (stepCount < maxAgentSteps) {
          if (abortController?.signal.aborted) break;

          // 执行本轮所有工具调用
          for (const tc of currentToolCalls) {
            if (abortController?.signal.aborted) break;

            // 解析工具参数
            let toolArgs: { query?: string; keys?: string };
            try {
              toolArgs = JSON.parse(tc.function.arguments || "{}");
            } catch {
              toolArgs = { query: tc.function.arguments };
            }
            const queryStr = toolArgs.query ?? "";

            // v0.8.1: 循环检测 — 同一 (tool, query) 已执行过 → 终止
            const callKey = `${tc.function.name}|${queryStr.trim().toLowerCase()}`;
            if (executedCalls.has(callKey)) {
              logger.warn(
                "api",
                `检测到重复工具调用（${tc.function.name}: ${queryStr}），终止 Agentic 循环`,
              );
              stepCount = maxAgentSteps; // 强制退出外层 while
              break;
            }
            executedCalls.add(callKey);

            try {
              logger.info(
                "api",
                `[Agentic 步骤 ${stepCount + 1}/${maxAgentSteps}] 执行: ${tc.function.name}（query=${queryStr.slice(0, 50)}）`,
              );

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
              const truncatedResult =
                rawResult.length > 2000
                  ? rawResult.slice(0, 2000) + "\n...[结果已截断]"
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
              console.warn("[Tool Calls] 工具执行失败:", tc.function.name, e);
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
                query: "",
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

          if (stepCount >= maxAgentSteps) break;

          stepCount++;
          if (stepCount >= maxAgentSteps) {
            logger.warn("api", `达到最大 Agentic 步数: ${maxAgentSteps}`);
            break;
          }

          if (abortController?.signal.aborted) break;

          // v0.8.1: 续写请求 — tool_choice: 'auto'，仍注入 tools 支持多步循环
          logger.info(
            "api",
            `Agentic 循环续写（步骤 ${stepCount}/${maxAgentSteps}），发起续写请求`,
          );
          const continuationMessage: ChatMessage = {
            id: uuidv4(),
            role: "assistant",
            content: "",
            createdAt: Date.now(),
            loading: true,
          };
          get().addMessage(continuationMessage);
          currentAssistantId = continuationMessage.id;

          const newContextMessages = get().messages.filter((m) => m.id !== continuationMessage.id);
          // v0.8.13: 第 1 轮续写强制 tool_choice: 'required'，确保至少 2 轮思考 + 1 轮主动工具调用
          // 第 2 轮及以后用 'auto'，让模型决定是否输出正文
          // 注意：此改动与 KV 缓存保护不冲突——续写以追加方式扩展消息，历史前缀保持稳定
          // 禁止改为 stepCount < 1（会退化回单轮，agentic 强化失效）
          const forceTool = stepCount < 2; // stepCount=1 时为第 1 轮续写，强制 required
          const { toolCalls: nextToolCalls } = await callApiWithRetry(
            continuationMessage.id,
            newContextMessages,
            {
              skipToolsInjection: false, // 关键修复: 续写仍注入 tools
              forceToolCall: forceTool, // v0.8.13: 第 1 轮 required，第 2 轮起 auto
            },
          );

          if (!nextToolCalls || nextToolCalls.length === 0) {
            logger.info("api", `Agentic 循环完成（${stepCount} 步），模型输出最终正文`);
            break;
          }

          // 模型发起了新的工具调用，继续循环
          currentToolCalls = nextToolCalls;
        }

        // 最终更新 agentSteps
        get().updateMessage(assistantMessageId, { agentSteps: [...nativeAgentSteps] });
      } else if (activeTools.length > 0 || builtinToolConfigs.some((c) => c.enabled)) {
        // v0.7.1: 单阶段架构 — 模型通过原生 tool_calls 自行决定工具调用
        // v0.8.1: 文本标签续写循环保留，用于处理模型输出 <tool_calls> 文本标签的场景
        //         迭代上限从 MAX_CONTINUATIONS 改为动态 maxAgentSteps
        const v071MaxContinuations = maxAgentSteps;
        const characterUuid = currentCharacter?.uuid ?? null;
        const filteredTools = filterToolsForCharacter(activeTools, characterUuid);

        // v0.8.1: 最多迭代 maxAgentSteps 次以防止无限循环
        for (let iteration = 0; iteration < v071MaxContinuations; iteration++) {
          if (iteration === v071MaxContinuations - 1) {
            logger.warn("api", "达到最大续写次数限制: " + v071MaxContinuations);
          }
          // 检查是否已被用户取消，避免取消后继续发起工具调用与 API 请求
          if (abortController?.signal.aborted) break;

          const currentAssistantMsg = get().messages.find((m) => m.id === currentAssistantId);
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
              const result = await executeToolByName(
                builtinToolCall.callLabel,
                builtinToolCall.query,
              );

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

              const currentMsgForSteps = get().messages.find((m) => m.id === currentAssistantId);
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
              // v0.8.1: 续写请求注入 tools（skipToolsInjection=false），支持 Agentic 多步循环
              await callApiWithRetry(continuationMessage.id, newContextMessages, {
                skipToolsInjection: false,
              });

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
            const currentMsgForSteps = get().messages.find((m) => m.id === currentAssistantId);
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
              agentSteps: [...(currentMsgForSteps?.agentSteps ?? []), toolCallStep, toolResultStep],
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
            const { content: newContent, reasoning: newReasoning } = await callApiWithRetry(
              continuationMessage.id,
              newContextMessages,
              { skipToolsInjection: false }, // v0.8.1: 续写注入 tools 支持 Agentic 循环
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
            const latestAssistantMsg = get().messages.find((m) => m.id === currentAssistantId);
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
                  error: toolError instanceof Error ? toolError.message : String(toolError),
                  mcpSubToolName: toolCall!.mcpSubToolName,
                },
              ],
              agentSteps: [...(latestAssistantMsg?.agentSteps ?? []), errorStep],
            });
            break;
          }
        }
      }

      // 10. 异步提取记忆（不阻塞主流程）
      // v0.6.0-fix: 会话向量记忆提取只受 memorySettings.enabled 控制，
      //             不再受 longTermMemoryCharacterIds（已锁定的长期记忆功能）闸门
      // v0.6.3-fix: 失败时 toast.error 通知用户，避免错误被静默吞掉
      if (memorySettings?.enabled) {
        extractMemory({
          messages: get().messages,
          character: currentCharacter,
          settings,
          memorySettings,
          apiProviders: allProviders,
          apiProviderKeys: get().apiProviderKeys,
          sessionId: currentSessionId ?? undefined,
        }).catch((e) => {
          logger.error("memory", `记忆提取失败: ${(e as Error).message}`);
          toast.error(`向量记忆生成失败：${(e as Error).message}`);
        });
      }

      // v0.7.2: 会话自动命名 — 首条 AI 回复完成后，若标题仍为"新会话"则调用模型生成标题
      if (currentSessionId) {
        const currentSession = get().sessions.find((s) => s.id === currentSessionId);
        if (currentSession && currentSession.title === "新会话") {
          const recentMessages = get()
            .messages.filter((m) => m.role === "user" || m.role === "assistant")
            .slice(-4);
          if (recentMessages.length >= 2) {
            generateSessionTitle(recentMessages, settings)
              .then((title) => {
                // 容错：取前 10 字，防止超长标题
                const cleanTitle = title
                  .replace(/^["'""\n]+|["'""\n]+$/g, "")
                  .trim()
                  .slice(0, 10);
                if (cleanTitle && cleanTitle.length > 0) {
                  // 再次检查标题是否仍为"新会话"（用户可能已手动改名）
                  const latestSession = get().sessions.find((s) => s.id === currentSessionId);
                  if (latestSession && latestSession.title === "新会话") {
                    get().renameSession(currentSessionId, cleanTitle);
                    void get().saveSessions();
                    logger.info("chat", `会话自动命名: "${cleanTitle}"`);
                  }
                }
              })
              .catch(() => {
                // 静默失败，保留"新会话"
              });
          }
        }
      }
    } catch (error) {
      // v0.8.12: chatClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）
      if (error instanceof DOMException && error.name === "AbortError") {
        // 用户取消生成
        const currentMsg = get().messages.find((m) => m.id === assistantMessageId);
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
      // v0.8.12: chatClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）
      const currentController = get().abortController;
      set({
        isGenerating: false,
        isThinking: false,
        isReceiving: false,
        isMainPhase: false,
        abortController: currentController === abortController ? null : currentController,
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
    isMainPhase: false,
    inputDraft: "",
    abortController: null,

    // ===== 基础 setters =====
    setMessages: (messages) => set({ messages }),

    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

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
      logger.info(
        "chat",
        `发送消息（字符数=${trimmed.length}，角色=${get().currentCharacter?.name ?? "未知"}）`,
      );

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
      const { messages, currentSessionId } = get();
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

      // v0.7.1-fix: 重试前清理旧向量记忆分片（与 retryMessage 行为一致）
      // 避免记忆召回预执行搜索到重试前的旧内容
      const currentCharacter = get().characters?.find((c) => c.uuid === get().currentCharacterUuid);
      if (currentCharacter?.uuid) {
        const turnNumber = messages
          .slice(0, lastAssistantIndex)
          .filter((m) => m.role === "user").length;
        if (turnNumber > 0) {
          await removeVectorMemoryShardsByTurn(
            currentCharacter.uuid,
            turnNumber,
            currentSessionId ?? undefined,
          );
        }
      }

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
        content: "[system message]\n用户要求继续剧情的发展，请勿重复上一轮的剧情内容和言行。",
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
        const history = await getItem<ChatMessage[]>("chatHistory", characterUuid);
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
        const allProviders = [...BUILTIN_PROVIDERS, ...get().customApiProviders];
        // v0.5.8: 翻译专用模型支持
        const translationModelId = translationSettings.translationModelId;
        let chatApiUrl: string;
        let chatApiKey: string;
        let actualModel: string;

        if (translationModelId) {
          const { providerId } = parseModelName(translationModelId, allProviders);
          if (providerId) {
            const provider = allProviders.find((p) => p.id === providerId);
            chatApiUrl = provider?.apiUrl || get().apiUrl;
            chatApiKey = get().apiProviderKeys[providerId] || get().apiKey;
          } else {
            chatApiUrl = get().apiUrl;
            chatApiKey = get().apiKey;
          }
          actualModel = getActualModelName(translationModelId);
        } else {
          chatApiUrl = getApiUrlForModel(get().modelName, allProviders, get().apiUrl);
          chatApiKey = getApiKeyForModel(
            get().modelName,
            get().apiProviderKeys,
            get().apiKey,
            allProviders,
          );
          actualModel = getActualModelName(get().modelName);
        }
        const url = getChatCompletionsUrl(chatApiUrl);

        // v0.6.5: 翻译专用自定义请求体，为空则回退到全局自定义请求体
        const translationCustomBody = translationSettings.customRequestBody?.trim();
        const effectiveCustomBody = translationCustomBody || get().customRequestBody;

        const requestBody = buildApiRequestBody(
          {
            model: actualModel,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          },
          {
            enableThinking: false,
            customRequestBody: effectiveCustomBody,
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
     * - 若为用户消息：基于该消息重新生成回复，截断该 assistant 回复之后的对话
     * - 若为 assistant 消息：重试上一轮用户请求
     * 采用与 regenerate 一致的简洁模式：截断消息列表 + 创建新 assistant 消息 + generateResponse，
     * 不做消息替换/恢复，生成完成后新消息直接保留在列表中。
     * 旧版本通过 addRetryBranch 持久化到 Session.retryBranches。
     *
     * v0.8.11-strict: 稳定性约束 — 禁止恢复旧消息、必须使用截断-重建模式。
     * 旧版本在 finally 块中恢复 oldAssistant 消息并调用 prevController.abort()，
     * 导致新生成内容被覆盖，出现"生成已中止"错误。
     * 禁止在 finally 块中做消息恢复或 abort 操作，生成完成后新消息直接保留在列表中。
     */
    retryMessage: async (messageId) => {
      if (!get().currentCharacter) return;
      if (get().isGenerating) return;

      const { currentSessionId } = get();
      let messages = get().messages;
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      // 确定重试截断点：找到待重试的 assistant 消息位置
      let assistantIndex = -1;
      if (message.role === "assistant") {
        assistantIndex = messages.findIndex((m) => m.id === messageId);
      } else {
        const userIndex = messages.findIndex((m) => m.id === messageId);
        for (let i = userIndex + 1; i < messages.length; i++) {
          if (messages[i].role === "assistant") {
            assistantIndex = i;
            break;
          }
        }
      }
      if (assistantIndex === -1) return;

      const messagesBefore = messages.slice(0, assistantIndex);

      // 重试前清理 oldAssistant 对应 turn 的向量记忆分片
      const currentCharacter = get().characters?.find((c) => c.uuid === get().currentCharacterUuid);
      if (currentCharacter?.uuid) {
        const turnNumber = messagesBefore.filter((m) => m.role === "user").length;
        if (turnNumber > 0) {
          await removeVectorMemoryShardsByTurn(
            currentCharacter.uuid,
            turnNumber,
            currentSessionId ?? undefined,
          );
        }
      }

      // await 之后重新获取最新状态，避免闭包引用过时数据
      messages = get().messages;
      const latestMessage = messages.find((m) => m.id === messageId);
      if (!latestMessage) return;

      let latestAssistantIndex = -1;
      if (latestMessage.role === "assistant") {
        latestAssistantIndex = messages.findIndex((m) => m.id === messageId);
      } else {
        const userIndex = messages.findIndex((m) => m.id === messageId);
        for (let i = userIndex + 1; i < messages.length; i++) {
          if (messages[i].role === "assistant") {
            latestAssistantIndex = i;
            break;
          }
        }
      }
      if (latestAssistantIndex === -1) return;

      const latestMessagesBefore = messages.slice(0, latestAssistantIndex);

      // 创建新的 assistant 消息（与 regenerate/sendMessage 一致的模式）
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        loading: true,
      };

      set({
        messages: [...latestMessagesBefore, assistantMessage],
        isGenerating: true,
        isThinking: false,
        isReceiving: false,
        isMainPhase: false,
        abortController: new AbortController(),
      });

      await generateResponse(assistantMessage.id);
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
      const newSessionId = get().createSession(currentCharacter.uuid, currentCharacter.name);

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
        const { isNativePlatform, shareText } = await import("~/services/nativeBridge");
        if (isNativePlatform()) {
          // 原生平台使用 NativeBridge 唤起系统分享面板
          await shareText(text, "LUZZY 消息", "分享消息");
        } else if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          // Web 环境支持 Web Share API
          await navigator.share({ title: "LUZZY 消息", text });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          // 回退到剪贴板
          await navigator.clipboard.writeText(text);
          const { toast } = await import("sonner");
          toast.success("已复制到剪贴板");
        }
      } catch (e) {
        // 用户取消分享不视为错误
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("[ChatSlice] 分享失败:", e);
      }
    },
  };
};
