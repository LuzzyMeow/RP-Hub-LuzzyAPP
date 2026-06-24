/**
 * TRPG Slice（Zustand slice）
 * v0.8.0: 完整 TRPG 引擎状态管理
 *
 * 三阶段管线：
 * 1. 预执行：角色卡注入 + 世界卡注入 + 记忆召回（并行）
 * 2. 单次 API 请求：TRPG_GM_PRESET_CONTENT + tool_calls
 * 3. 后处理：A 摘要写入 + 向量记忆写入 + GameState 更新 + 持久化
 */

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

import type {
  TrpgCharacter,
  TrpgGameState,
  TrpgMessage,
  SaveSlot,
  WorldCard,
  NarratorSections,
  TrpgMode,
  Think4Result,
  OocResult,
  OocCheckItem,
} from '~/types/trpg';
import type {
  MemorySettings,
  ApiSettings,
  VectorMemoryShard,
} from '~/types/luzzy';
import type { AppStoreState, TrpgSlice } from '~/stores/slices/types';
import { buildTrpgContext } from '~/services/trpg/trpgContextService';
import { executeTrpgToolCall, type StateOperation, type TrpgToolContext } from '~/services/trpg/trpgTools';
import { applyStateOperations, applyStateOperationsToCharacter } from '~/services/trpg/rules/stateOperations';
import {
  parseThinkSections,
  parseNarratorSections,
  parseOocFromReasoning,
  parseThink1FromReasoning,
  parseThink2FromReasoning,
} from '~/services/trpg/parseThinkSections';
import { checkAndGenerateSummaries } from '~/services/trpg/memoryCompression';
import { scoreAction } from '~/services/trpg/rules/think4Scoring';
import { runOocCheck } from '~/services/trpg/rules/oocCheck';
import {
  getSave,
  getAllSaves,
  putSave,
  deleteSave,
  getWorldCard,
  getAllWorldCards,
  putWorldCard,
  deleteWorldCard,
} from '~/services/trpg/trpgStorage';
import {
  sendStreamRequest,
  buildApiRequestBody,
  parseSSEChunk,
  ApiError,
} from '~/services/apiClient';
import {
  getApiUrlForModel,
  getApiKeyForModel,
  getActualModelName,
  parseModelName,
} from '~/services/providerService';
import { getItem } from '~/services/storage';
import { BUILTIN_PROVIDERS } from '~/stores/slices/settings-slice';
import { logger } from '~/services/logger';
import { toast } from 'sonner';

// ============================================================================
// 辅助函数：从 state 提取 API 设置（参考 chat-slice.ts）
// ============================================================================

const extractApiSettings = (state: AppStoreState): ApiSettings => {
  const allProviders = state.getAllProviders();
  const currentProvider = allProviders.find((p) => p.id === state.apiProviderId);
  const { modelName } = state;
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
// 默认状态
// ============================================================================

const DEFAULT_TRPG_MODEL_KEY = 'trpg_model';
const AUTO_SAVE_INTERVAL = 10; // 每 10 轮自动保存

/** 创建默认游戏状态 */
function createDefaultGameState(saveId: string): TrpgGameState {
  return {
    saveId,
    roundNumber: 0,
    activeCharacterId: '',
    currentLocation: '未知地点',
    phase: 'explore',
    world: {},
    quests: [],
    time: { day: 1, hour: 8, calendarEra: '第一纪元' },
    factionRelations: {},
    npcs: [],
    locations: [],
  };
}

/** 创建默认角色 */
function createDefaultCharacter(): TrpgCharacter {
  return {
    charId: uuidv4(),
    name: '冒险者',
    race: '人类',
    class: '战士',
    level: 1,
    abilities: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 10 },
    hp: { current: 12, max: 12 },
    ac: 16,
    proficientSkills: ['athletics', 'perception'],
    expertiseSkills: [],
    conditions: [],
    inventory: [],
    equipment: { weapon: '长剑', armor: '锁子甲' },
    classFeatures: [],
    xp: 0,
    background: '',
    alignment: '中立',
  };
}

// ============================================================================
// TRPG Slice 实现
// ============================================================================

export const createTrpgSlice: StateCreator<
  AppStoreState,
  [],
  [],
  TrpgSlice
> = (set, get) => ({
  // ===== 状态 =====
  trpgMode: 'game',
  trpgModel: '',
  trpgMessages: [],
  trpgSave: null,
  trpgWorldCard: null,
  trpgIsGenerating: false,
  trpgInputDraft: '',
  trpgActiveSheet: null,
  trpgAllSaves: [],
  trpgAllWorldCards: [],
  trpgPrevSemiStable: null,

  // ===== Actions：模式与设置 =====
  setTrpgMode: (mode) => set({ trpgMode: mode }),
  setTrpgModel: (model) => {
    set({ trpgModel: model });
    localStorage.setItem(DEFAULT_TRPG_MODEL_KEY, model);
  },
  loadTrpgModel: () => {
    const saved = localStorage.getItem(DEFAULT_TRPG_MODEL_KEY);
    if (saved) set({ trpgModel: saved });
  },

  // ===== Actions：输入 =====
  setTrpgInputDraft: (draft) => set({ trpgInputDraft: draft }),
  setTrpgActiveSheet: (sheet) => set({ trpgActiveSheet: sheet }),

  // ===== Actions：存档管理 =====
  loadTrpgSave: async (saveId) => {
    try {
      const save = await getSave(saveId);
      if (!save) {
        toast.error('存档不存在');
        return;
      }

      // 如果有关联世界卡，加载世界卡数据
      let worldCard: WorldCard | null = null;
      if (save.worldCardId) {
        worldCard = (await getWorldCard(save.worldCardId)) ?? null;
      }

      set({
        trpgSave: save,
        trpgMessages: save.messages,
        trpgWorldCard: worldCard,
      });
    } catch (e) {
      logger.error('trpg', '加载存档失败: ' + String(e));
      toast.error('加载存档失败');
    }
  },

  createTrpgSave: async (worldCardId, character) => {
    const saveId = uuidv4();
    const now = Date.now();
    const char = character ?? createDefaultCharacter();

    const gameState = createDefaultGameState(saveId);
    gameState.activeCharacterId = char.charId;

    const save: SaveSlot = {
      saveId,
      title: `${char.name}的冒险`,
      worldCardId,
      gameState,
      character: char,
      npcs: [],
      messages: [],
      aSummaries: [],
      bSummaries: [],
      cSummaries: [],
      createdAt: now,
      updatedAt: now,
    };

    await putSave(save);

    // 加载世界卡
    let worldCard: WorldCard | null = null;
    if (worldCardId) {
      worldCard = (await getWorldCard(worldCardId)) ?? null;
    }

    set({
      trpgSave: save,
      trpgMessages: [],
      trpgWorldCard: worldCard,
    });

    return saveId;
  },

  saveTrpgSave: async () => {
    const { trpgSave, trpgMessages } = get();
    if (!trpgSave) return;

    const updated: SaveSlot = {
      ...trpgSave,
      messages: trpgMessages,
      updatedAt: Date.now(),
    };

    try {
      await putSave(updated);
      set({ trpgSave: updated });
    } catch (e) {
      logger.error('trpg', '保存存档失败: ' + String(e));
      toast.error('保存存档失败');
    }
  },

  deleteTrpgSave: async (saveId) => {
    try {
      await deleteSave(saveId);
      const { trpgSave } = get();
      if (trpgSave?.saveId === saveId) {
        set({ trpgSave: null, trpgMessages: [], trpgWorldCard: null });
      }
    } catch (e) {
      logger.error('trpg', '删除存档失败: ' + String(e));
      toast.error('删除存档失败');
    }
  },

  loadAllSaves: async () => {
    try {
      const saves = await getAllSaves();
      set({ trpgAllSaves: saves });
    } catch (e) {
      logger.error('trpg', '加载存档列表失败: ' + String(e));
    }
  },

  loadAllWorldCards: async () => {
    try {
      const cards = await getAllWorldCards();
      set({ trpgAllWorldCards: cards });
    } catch (e) {
      logger.error('trpg', '加载世界卡列表失败: ' + String(e));
    }
  },

  importWorldCard: async (json) => {
    try {
      const card = JSON.parse(json) as WorldCard;
      if (!card.metadata?.cardId) {
        toast.error('无效的世界卡格式');
        return;
      }
      card.metadata.updatedAt = Date.now();
      await putWorldCard(card);
      await get().loadAllWorldCards();
      toast.success('世界卡导入成功');
    } catch (e) {
      logger.error('trpg', '导入世界卡失败: ' + String(e));
      toast.error('导入世界卡失败');
    }
  },

  removeWorldCard: async (cardId) => {
    try {
      await deleteWorldCard(cardId);
      await get().loadAllWorldCards();
      toast.success('世界卡已删除');
    } catch (e) {
      logger.error('trpg', '删除世界卡失败: ' + String(e));
      toast.error('删除世界卡失败');
    }
  },

  // ===== Actions：消息发送（三阶段管线） =====
  sendTrpgMessage: async (input) => {
    const state = get();
    const { trpgSave, trpgWorldCard, trpgModel } = state;

    if (!trpgSave) {
      toast.error('请先创建或加载存档');
      return;
    }

    if (state.trpgIsGenerating) return;

    set({ trpgIsGenerating: true, trpgInputDraft: '' });

    try {
      // === 第一阶段：预执行（并行） ===
      logger.info('trpg', 'Stage 1: 预执行开始');

      // 1.1 添加用户消息
      const userMessage: TrpgMessage = {
        id: uuidv4(),
        role: 'user',
        content: input,
        createdAt: Date.now(),
      };

      const messagesWithUser = [...state.trpgMessages, userMessage];
      set({ trpgMessages: messagesWithUser });

      // 1.2 向量记忆召回（复用 memoryService）
      let vectorMemories: Array<{ content: string; score: number }> = [];
      try {
        // 延迟导入避免循环依赖
        const { searchVectorMemoryWithScore, loadVectorMemoryShards } = await import(
          '~/services/memoryService'
        );

        // 加载记忆设置和 API 设置（参考 chat-slice.ts 模式）
        const memorySettingsData = await getItem<MemorySettings>('memory', 'memorySettings');
        const memorySettings = memorySettingsData ?? { embeddingModel: '', vectorTopK: 8 } as MemorySettings;
        const apiSettings = extractApiSettings(get());
        const allProviders = [...BUILTIN_PROVIDERS, ...get().customApiProviders];
        const providerKeys = get().apiProviderKeys;

        // 加载已有向量记忆 shards
        const existingShards = await loadVectorMemoryShards(
          trpgSave.character.charId,
          trpgSave.saveId,
        );

        if (memorySettings.embeddingModel && existingShards.length > 0) {
          // searchVectorMemoryWithScore 第一个参数是 query 字符串（函数内部会调用 getEmbedding）
          const results = await searchVectorMemoryWithScore(
            input,
            existingShards,
            memorySettings,
            apiSettings,
            allProviders,
            providerKeys,
          );
          // 转换返回类型：{ shard: VectorMemoryShard; score: number }[] → { content: string; score: number }[]
          vectorMemories = results.map((r) => ({ content: r.shard.content, score: r.score }));
        }
      } catch (e) {
        logger.warn('trpg', '向量记忆召回失败: ' + String(e));
      }

      logger.info('trpg', 'Stage 1 完成: 预执行结束');

      // === 第二阶段：单次 API 请求 ===
      logger.info('trpg', 'Stage 2: API 请求开始');

      // 2.1 构建上下文（传入半稳定层缓存，最大化 KV 缓存命中）
      const { systemPrompt, messages: contextMessages, tools, semiStable } = buildTrpgContext({
        character: trpgSave.character,
        gameState: trpgSave.gameState,
        worldCard: trpgWorldCard,
        save: { ...trpgSave, messages: messagesWithUser },
        vectorMemories,
        playerInput: input,
        prevSemiStable: state.trpgPrevSemiStable,
      });

      // 保存半稳定层缓存供下一轮使用
      set({ trpgPrevSemiStable: semiStable });

      // 2.2 解析 TRPG 模型配置
      const modelKey = trpgModel || state.modelName;
      const allProviders = [...BUILTIN_PROVIDERS, ...get().customApiProviders];
      const { providerId, modelName } = parseModelName(modelKey, allProviders);
      const apiUrl = getApiUrlForModel(modelKey, allProviders, get().apiUrl);
      const apiKey = getApiKeyForModel(modelKey, get().apiProviderKeys, get().apiKey, allProviders);
      const actualModelName = getActualModelName(modelKey, allProviders);

      if (!apiUrl || !apiKey) {
        toast.error('TRPG 模型未配置，请在设置面板中选择模型');
        set({ trpgIsGenerating: false });
        return;
      }

      // 2.3 构建 API 请求体
      const baseBody: Record<string, unknown> = {
        model: actualModelName,
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextMessages,
        ],
        stream: true,
        temperature: 0.8,
      };

      if (tools.length > 0) {
        baseBody.tools = tools;
      }

      const requestBody = buildApiRequestBody(baseBody, {
        thinkingDepth: 'auto',
        enableThinking: true,
        customRequestBody: state.customRequestBody,
      });

      // 2.4 发送流式请求
      const assistantMessage: TrpgMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        reasoningContent: '',
        createdAt: Date.now(),
      };

      const messagesWithAssistant = [...messagesWithUser, assistantMessage];
      set({ trpgMessages: messagesWithAssistant });

      let fullContent = '';
      let fullReasoning = '';
      let toolCalls: TrpgMessage['toolCalls'] = [];
      const collectedStateOps: StateOperation[] = [];

      // 构建工具执行上下文
      const toolContext: TrpgToolContext = {
        character: trpgSave.character,
        gameState: trpgSave.gameState,
        worldCard: trpgWorldCard,
        recentInputs: messagesWithUser
          .filter((m) => m.role === 'user')
          .slice(-5)
          .map((m) => m.content),
      };

      // 累积器：流式增量合并 tool_calls（参考 chat-slice.ts 第540-629行）
      const accumulatedToolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];

      await sendStreamRequest({
        url: apiUrl,
        apiKey,
        body: requestBody,
        signal: undefined,
        onChunk: (_dataStr, parsed) => {
          const chunk = parseSSEChunk(parsed);

          if (chunk.reasoningContent) {
            fullReasoning += chunk.reasoningContent;
            set({
              trpgMessages: get().trpgMessages.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, reasoningContent: fullReasoning }
                  : m,
              ),
            });
          }

          if (chunk.content) {
            fullContent += chunk.content;
            set({
              trpgMessages: get().trpgMessages.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullContent }
                  : m,
              ),
            });
          }

          // 流式增量合并 tool_calls
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            for (const tc of chunk.toolCalls) {
              const existing = accumulatedToolCalls.find((t) => t.id === tc.id && tc.id);
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
        },
      });

      // 流式结束后，处理完整的 tool_calls（本地执行 TRPG 工具）
      for (const tc of accumulatedToolCalls) {
        let result: string;
        try {
          const args = JSON.parse(tc.function.arguments);
          const resultStr = executeTrpgToolCall(tc.function.name, args, toolContext);
          result = resultStr;

          // 解析返回的 stateOps 并收集
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.stateOps && Array.isArray(parsed.stateOps)) {
              collectedStateOps.push(...parsed.stateOps);
            }
          } catch {
            // stateOps 解析失败不影响主流程
          }
        } catch (e) {
          result = JSON.stringify({ error: String(e) });
        }

        toolCalls = [
          ...(toolCalls ?? []),
          { id: tc.id, name: tc.function.name, arguments: tc.function.arguments, result },
        ];
      }

      if (toolCalls.length > 0) {
        set({
          trpgMessages: get().trpgMessages.map((m) =>
            m.id === assistantMessage.id ? { ...m, toolCalls } : m,
          ),
        });
      }

      logger.info('trpg', 'Stage 2 完成: API 请求结束');

      // === 第三阶段：后处理 ===
      logger.info('trpg', 'Stage 3: 后处理开始');

      // 3.1 解析思考链（Think-1/2/OOC/Narrator）
      const parsedChain = parseThinkSections(fullContent);
      const narratorSections = parsedChain.narrator;

      // 3.2 从 reasoning_content 解析 OOC LLM 端审查（审查项 1/2/7）
      const llmOocChecks = parseOocFromReasoning(fullReasoning);

      // 3.3 从 reasoning_content 解析 Think-1/Think-2（用于 category 路由和状态路由）
      const think1Result = parseThink1FromReasoning(fullReasoning);
      const think2Result = parseThink2FromReasoning(fullReasoning);
      if (think1Result) {
        logger.info('trpg', `Think-1 解析: category=${think1Result.category}, skill=${think1Result.skillRequired}, dc=${think1Result.estimatedDc}`);
      }
      if (think2Result) {
        logger.info('trpg', `Think-2 解析: paths=${think2Result.paths.length}, recommended=${think2Result.recommended}`);
      }

      // 3.4 执行 OOC TS 端审查（审查项 3/4/6），与 LLM 端审查合并
      const tsOocResult = runOocCheck(
        {
          player_input: input,
          recent_inputs: messagesWithUser.filter((m) => m.role === 'user').slice(-5).map((m) => m.content),
          phase: trpgSave.gameState.phase,
        },
        trpgSave.character,
        trpgSave.gameState,
        trpgWorldCard,
      );

      const mergedChecks: OocCheckItem[] = tsOocResult.checks.map((tc) => {
        const llmCheck = llmOocChecks.find((lc) => lc.id === tc.id);
        return llmCheck ?? tc;
      });
      const hasHardBlock = mergedChecks.some((c) => c.result === 'hard_block');
      const hasSoftWarn = mergedChecks.some((c) => c.result === 'soft_warn');
      const oocAction: OocResult['action'] = hasHardBlock ? 'blocked' : hasSoftWarn ? 'partial' : 'resolved';
      const mergedOoc: OocResult = { checks: mergedChecks, hasHardBlock, hasSoftWarn, action: oocAction };
      logger.info('trpg', `OOC 审查合并完成: action=${oocAction}, hardBlock=${hasHardBlock}, softWarn=${hasSoftWarn}`);

      // 3.5 更新消息
      const finalMessages = get().trpgMessages.map((m) =>
        m.id === assistantMessage.id
          ? { ...m, content: fullContent, reasoningContent: fullReasoning, narratorSections }
          : m,
      );
      set({ trpgMessages: finalMessages });

      // 3.6 更新 GameState（应用工具返回的状态变更 + roundNumber+1）
      const updatedGameState = applyStateOperations(
        trpgSave.gameState,
        trpgSave.character,
        collectedStateOps,
      );
      updatedGameState.roundNumber = trpgSave.gameState.roundNumber + 1;

      // 更新角色卡（HP/条件/物品等可能被工具修改）
      const updatedCharacter = applyStateOperationsToCharacter(
        trpgSave.character,
        collectedStateOps,
      );

      // 3.7 Think-4 评分
      let think4Result: Think4Result | undefined;
      try {
        think4Result = scoreAction(
          {
            diceResult: collectedStateOps.find((op) => op.type === 'hp_change') ? undefined : undefined,
            narratorSections,
            stateOps: collectedStateOps,
            aSummaryCount: trpgSave.aSummaries.length,
          },
          updatedCharacter,
          updatedGameState,
          trpgWorldCard,
        );
        logger.info('trpg', `Think-4 评分: total=${think4Result.total}, verdict=${think4Result.verdict}`);
      } catch (e) {
        logger.warn('trpg', 'Think-4 评分失败: ' + String(e));
      }

      // 3.8 A/B/C 记忆摘要生成
      const newRound = updatedGameState.roundNumber;
      const summaryResult = checkAndGenerateSummaries(
        newRound,
        [userMessage, { id: assistantMessage.id, role: 'assistant', content: fullContent, reasoningContent: fullReasoning, narratorSections, createdAt: Date.now() } as TrpgMessage],
        trpgSave.aSummaries,
        trpgSave.bSummaries,
        trpgSave.cSummaries,
      );

      const updatedASummaries = [...trpgSave.aSummaries];
      const updatedBSummaries = [...trpgSave.bSummaries];
      const updatedCSummaries = [...trpgSave.cSummaries];
      if (summaryResult.newASummary) {
        updatedASummaries.push(summaryResult.newASummary);
        while (updatedASummaries.length > 50) updatedASummaries.shift();
        logger.info('trpg', `A 级摘要生成: round ${newRound}`);
      }
      if (summaryResult.newBSummary) {
        updatedBSummaries.push(summaryResult.newBSummary);
        while (updatedBSummaries.length > 10) updatedBSummaries.shift();
        logger.info('trpg', `B 级摘要生成: round ${newRound}`);
      }
      if (summaryResult.newCSummary) {
        updatedCSummaries.push(summaryResult.newCSummary);
        logger.info('trpg', `C 级摘要生成: round ${newRound}`);
      }

      const updatedSave: SaveSlot = {
        ...trpgSave,
        gameState: updatedGameState,
        character: updatedCharacter,
        messages: finalMessages,
        aSummaries: updatedASummaries,
        bSummaries: updatedBSummaries,
        cSummaries: updatedCSummaries,
        updatedAt: Date.now(),
      };

      set({ trpgSave: updatedSave });

      // 3.4 自动保存（每 AUTO_SAVE_INTERVAL 轮）
      if (updatedGameState.roundNumber % AUTO_SAVE_INTERVAL === 0) {
        await get().saveTrpgSave();
      }

      // 3.5 向量记忆写入（异步，不阻塞）
      try {
        const { getEmbedding, saveVectorMemoryShards } = await import(
          '~/services/memoryService'
        );

        // 加载记忆设置和 API 设置
        const memorySettingsData = await getItem<MemorySettings>('memory', 'memorySettings');
        const memorySettings = memorySettingsData ?? { embeddingModel: '', vectorTopK: 8 } as MemorySettings;
        const apiSettings = extractApiSettings(get());
        const allProviders = [...BUILTIN_PROVIDERS, ...get().customApiProviders];
        const providerKeys = get().apiProviderKeys;

        if (memorySettings.embeddingModel) {
          const memoryText = `玩家：${input}\nGM：${fullContent}`;
          const embedding = await getEmbedding(
            memoryText,
            memorySettings,
            apiSettings,
            allProviders,
            providerKeys,
          );
          if (embedding) {
            const shard: VectorMemoryShard = {
              id: uuidv4(),
              content: memoryText,
              turn: trpgSave.gameState.roundNumber,
              embedding,
              createdAt: Date.now(),
            };
            await saveVectorMemoryShards(trpgSave.character.charId, [shard], trpgSave.saveId);
          }
        }
      } catch (e) {
        logger.warn('trpg', '向量记忆写入失败: ' + String(e));
      }

      logger.info('trpg', 'Stage 3 完成: 后处理结束');
    } catch (e) {
      logger.error('trpg', '消息发送失败: ' + String(e));
      const errorMsg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      toast.error(`TRPG 请求失败: ${errorMsg}`);
    } finally {
      set({ trpgIsGenerating: false });
    }
  },

  stopTrpgGenerating: () => {
    set({ trpgIsGenerating: false });
  },
});

