/**
 * 聊天 Store（zustand）
 *
 * 管理聊天消息、生成状态、API 调用、历史记录持久化等。
 * 从旧 Vue 3 app.js 迁移，替换原有的骨架实现。
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  Character,
  Preset,
  WorldInfoEntry,
  GlobalMemory,
  RegexScript,
  MemorySettings,
} from '@/types';
import {
  buildContext,
  processRegex,
  extractMemory,
  DEFAULT_USER,
} from '@/services/chatService';
import {
  sendStreamRequest,
  sendRequest,
  parseSSEChunk,
  buildApiRequestBody,
  ApiError,
} from '@/services/apiClient';
import {
  getApiUrlForModel,
  getApiKeyForModel,
  getActualModelName,
  getOpenAICompatUrl,
} from '@/services/providerService';
import { parseCot } from '@/services/markdownService';
import { getItem, setItem } from '@/services/storage';
import { useSettingsStore, BUILTIN_PROVIDERS } from '@/store/useSettingsStore';
import { BUILTIN_PRESET_DEFAULTS } from '@/services/presetContent';

// ============================================================================
// 类型定义
// ============================================================================

/** 聊天 Store 状态与 Actions */
interface ChatState {
  // ===== 状态 =====
  /** 聊天消息列表 */
  messages: ChatMessage[];
  /** 当前角色卡 */
  currentCharacter: Character | null;
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 是否正在思考（接收推理内容） */
  isThinking: boolean;
  /** 是否正在接收正文内容 */
  isReceiving: boolean;
  /** 输入框草稿 */
  inputDraft: string;
  /** 中止控制器 */
  abortController: AbortController | null;

  // ===== 基础 setters（供组件使用） =====
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  setCurrentCharacter: (character: Character | null) => void;
  setInputDraft: (draft: string) => void;

  // ===== Actions =====
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 停止生成（abort） */
  stopGenerating: () => void;
  /** 重新生成最后一条消息 */
  regenerate: () => Promise<void>;
  /** 编辑消息 */
  editMessage: (id: string, content: string) => void;
  /** 删除消息 */
  deleteMessage: (id: string) => void;
  /** 清空消息 */
  clearMessages: () => void;
  /** 从 IndexedDB 加载聊天记录 */
  loadChatHistory: (characterUuid: string) => Promise<void>;
  /** 保存聊天记录到 IndexedDB */
  saveChatHistory: () => Promise<void>;
}

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
    createdAt: 0,
    updatedAt: 0,
  }));
};

/**
 * 默认记忆设置（未配置时使用）
 */
const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: false,
  embeddingModel: '',
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
  const clean = apiUrl.trim().replace(/\/+$/, '');
  if (clean.endsWith('chat/completions')) {
    return clean;
  }
  return getOpenAICompatUrl(clean, 'chat/completions');
};

// ============================================================================
// Store 实现
// ============================================================================

export const useChatStore = create<ChatState>((set, get) => {
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
    const { messages, currentCharacter, abortController } = state;

    if (!abortController) {
      get().updateMessage(assistantMessageId, {
        loading: false,
        error: 'AbortController 未初始化',
      });
      set({ isGenerating: false });
      return;
    }

    const settings = useSettingsStore.getState();

    // 校验 API 配置
    if (!settings.apiUrl || !settings.apiKey) {
      get().updateMessage(assistantMessageId, {
        loading: false,
        error: 'API 地址或密钥未配置，请在设置中填写',
      });
      set({ isGenerating: false, abortController: null });
      return;
    }

    try {
      // 构建所有供应商列表（内置 + 自定义），用于多供应商路由和上下文构建
      const allProviders = [
        ...BUILTIN_PROVIDERS,
        ...settings.customApiProviders,
      ];

      // 1. 从 IndexedDB 加载预设、世界书、全局记忆、正则脚本、记忆设置
      const [
        presetsData,
        worldInfoData,
        globalMemoryData,
        regexScriptsData,
        memorySettingsData,
      ] = await Promise.all([
        getItem<Preset[]>('presets', 'presets'),
        getItem<WorldInfoEntry[]>('worldInfo', 'worldInfo'),
        getItem<GlobalMemory>('memory', 'globalMemory'),
        getItem<RegexScript[]>('regexScripts', 'regexScripts'),
        getItem<MemorySettings>('settings', 'memorySettings'),
      ]);

      const presets = presetsData ?? getDefaultPresets();
      const worldInfoEntries = worldInfoData ?? [];
      const globalMemory = globalMemoryData ?? null;
      const regexScripts = regexScriptsData ?? [];
      const memorySettings = memorySettingsData ?? DEFAULT_MEMORY_SETTINGS;

      // 2. 构建 API 上下文（排除空的 assistant 消息）
      const contextMessages = messages.filter(
        (m) => m.id !== assistantMessageId,
      );
      const { apiMessages: rawApiMessages } = buildContext({
        messages: contextMessages,
        character: currentCharacter,
        user: DEFAULT_USER,
        presets,
        worldInfoEntries,
        globalMemory,
        settings,
        apiProviders: allProviders,
        apiProviderKeys: settings.apiProviderKeys,
      });

      // 3. 应用正则脚本处理（系统消息跳过）
      const apiMessages = rawApiMessages.map((msg) => {
        if (msg.role === 'system') return msg;
        const placement = msg.role === 'user' ? 1 : 2;
        return {
          ...msg,
          content: processRegex(
            msg.content,
            regexScripts,
            placement,
            DEFAULT_USER,
          ),
        };
      });

      // 4. 多供应商路由：根据模型名前缀解析对应的供应商 URL/Key
      const chatApiUrl = getApiUrlForModel(
        settings.modelName,
        allProviders,
        settings.apiUrl,
      );
      const chatApiKey = getApiKeyForModel(
        settings.modelName,
        settings.apiProviderKeys,
        settings.apiKey,
        allProviders,
      );
      const actualModel = getActualModelName(settings.modelName);
      const url = getChatCompletionsUrl(chatApiUrl);

      // 5. 构建请求体
      const requestBody = buildApiRequestBody(
        {
          model: actualModel,
          messages: apiMessages,
          stream: settings.stream,
        },
        {
          enableThinking: settings.enableThinking,
          customRequestBody: settings.customRequestBody,
        },
      );

      // 6. 累积流式内容
      let accumulatedContent = '';
      let accumulatedReasoning = '';

      if (settings.stream) {
        // === 流式请求 ===
        await sendStreamRequest({
          url,
          apiKey: chatApiKey,
          body: requestBody,
          signal: abortController.signal,
          onChunk: (_dataStr, parsed) => {
            const chunk = parseSSEChunk(parsed);

            if (chunk.reasoningContent) {
              accumulatedReasoning += chunk.reasoningContent;
              set({ isThinking: true });
            }

            if (chunk.content) {
              accumulatedContent += chunk.content;
              set({ isThinking: false, isReceiving: true });
            }

            // 解析 CoT 分离思考链和正文，实时更新消息
            const cotResult = parseCot(accumulatedContent);
            const finalCot = (
              accumulatedReasoning +
              (cotResult.cot ? '\n' + cotResult.cot : '')
            ).trim();

            get().updateMessage(assistantMessageId, {
              content: cotResult.main,
              cot: finalCot,
              loading: false,
            });
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

        const cotResult = parseCot(accumulatedContent);
        const finalCot = (
          accumulatedReasoning +
          (cotResult.cot ? '\n' + cotResult.cot : '')
        ).trim();

        get().updateMessage(assistantMessageId, {
          content: cotResult.main,
          cot: finalCot,
          loading: false,
        });
      }

      // 7. 检查空响应
      if (!accumulatedContent.trim() && !accumulatedReasoning.trim()) {
        get().updateMessage(assistantMessageId, {
          loading: false,
          error: 'API 返回空响应',
        });
        return;
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

      // 9. 异步提取记忆（不阻塞主流程）
      extractMemory({
        messages: get().messages,
        character: currentCharacter,
        settings,
        memorySettings,
      }).catch((e) => console.error('[ChatStore] 记忆提取失败:', e));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 用户取消生成
        const currentMsg = get().messages.find(
          (m) => m.id === assistantMessageId,
        );
        const existingContent = currentMsg?.content ?? '';
        const existingCot = currentMsg?.cot ?? '';

        if (existingContent.trim() || existingCot.trim()) {
          // 有部分内容，保留并添加中止标记
          get().updateMessage(assistantMessageId, {
            loading: false,
            content: existingContent.trim()
              ? existingContent + '\n\n*-- 生成已中止 --*'
              : '*-- 生成已中止 --*',
          });
        } else {
          // 无内容，显示中止提示
          get().updateMessage(assistantMessageId, {
            loading: false,
            content: '*-- 生成已中止 --*',
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
          error: error instanceof Error ? error.message : '未知错误',
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
    inputDraft: '',
    abortController: null,

    // ===== 基础 setters =====
    setMessages: (messages) => set({ messages }),

    addMessage: (message) =>
      set((state) => ({ messages: [...state.messages, message] })),

    updateMessage: (id, partial) =>
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, ...partial } : m,
        ),
      })),

    setCurrentCharacter: (currentCharacter) => set({ currentCharacter }),

    setInputDraft: (inputDraft) => set({ inputDraft }),

    // ===== Actions =====

    sendMessage: async (content: string) => {
      if (!get().currentCharacter) return;
      const trimmed = content.trim();
      if (!trimmed || get().isGenerating) return;

      // 1. 添加用户消息
      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };

      // 2. 添加空的 assistant 消息（loading: true）
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        loading: true,
      };

      set((state) => ({
        messages: [...state.messages, userMessage, assistantMessage],
        isGenerating: true,
        inputDraft: '',
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
        if (messages[i].role === 'assistant') {
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
        role: 'assistant',
        content: '',
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
          'chatHistory',
          characterUuid,
        );
        set({ messages: history ?? [] });
      } catch (e) {
        console.error('[ChatStore] 加载聊天记录失败:', e);
        set({ messages: [] });
      }
    },

    saveChatHistory: async () => {
      const { currentCharacter, messages } = get();
      if (!currentCharacter) return;
      try {
        await setItem('chatHistory', currentCharacter.uuid, messages);
      } catch (e) {
        console.error('[ChatStore] 保存聊天记录失败:', e);
      }
    },
  };
});
