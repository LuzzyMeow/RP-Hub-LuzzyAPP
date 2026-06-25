/**
 * TRPG Slice（Zustand slice）
 * v0.8.0: 完整 TRPG 引擎状态管理
 *
 * 三阶段管线：
 * 1. 预执行：角色卡注入 + 世界卡注入 + 记忆召回（并行）
 * 2. 单次 API 请求：TRPG_GM_PRESET_CONTENT + tool_calls
 * 3. 后处理：A 摘要写入 + 向量记忆写入 + GameState 更新 + 持久化
 */

import type { StateCreator } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  TrpgCharacter,
  TrpgGameState,
  TrpgMessage,
  SaveSlot,
  WorldCard,
  Think4Result,
  OocResult,
  OocCheckItem,
  DesignSession,
} from "~/types/trpg";
import type { MemorySettings, ApiSettings, VectorMemoryShard } from "~/types/luzzy";
import type { AppStoreState, TrpgSlice } from "~/stores/slices/types";
import { buildTrpgContext } from "~/services/trpg/trpgContextService";
import { createInitialDesignSession, parseDesignModeResponse } from "~/services/trpg/designMode";
import { sendDesignModeMessage } from "~/services/trpg/designModeApi";
import { validateWorldCard } from "~/services/trpg/designModeTools";
import { runAgenticToolLoop } from "~/services/trpg/agenticLoop";
import {
  executeTrpgToolCall,
  type StateOperation,
  type TrpgToolContext,
} from "~/services/trpg/trpgTools";
import {
  applyStateOperations,
  applyStateOperationsToCharacter,
} from "~/services/trpg/rules/stateOperations";
import {
  parseThinkSections,
  parseOocFromReasoning,
  parseThink1FromReasoning,
  parseThink2FromReasoning,
} from "~/services/trpg/parseThinkSections";
import { checkAndGenerateSummaries } from "~/services/trpg/memoryCompression";
import { scoreAction } from "~/services/trpg/rules/think4Scoring";
import { runOocCheck } from "~/services/trpg/rules/oocCheck";
import {
  getSave,
  getAllSaves,
  putSave,
  deleteSave,
  getWorldCard,
  getAllWorldCards,
  putWorldCard,
  deleteWorldCard,
} from "~/services/trpg/trpgStorage";
import { ApiError } from "~/services/apiClient";
import {
  getApiUrlForModel,
  getApiKeyForModel,
  getActualModelName,
  getChatCompletionsUrl,
  parseModelName,
} from "~/services/providerService";
import { getItem } from "~/services/storage";
import { BUILTIN_PROVIDERS } from "~/stores/slices/settings-slice";
import { logger } from "~/services/logger";
import { toast } from "sonner";

// ============================================================================
// 辅助函数：从 state 提取 API 设置（参考 chat-slice.ts）
// ============================================================================

// v0.8.12: 移除 trpgStreamBuffer / trpgScheduleFlush / trpgClearBuffer
//        + trpgDesignStreamBuffer / trpgDesignScheduleFlush / trpgDesignClearBuffer
// 原因：rAF 批量合并将一帧内所有 chunk 合并为一次 set，破坏严格逐字流式
// 现在：每个 onChunk 直接 set({ trpgMessages: ... }) 或 set({ trpgDesignSession: ... })
// 配合网络层 nextFrame 分片实现 60fps 逐字
// 仅替换目标索引元素，其他保持原引用（React.memo 生效）

const extractApiSettings = (state: AppStoreState): ApiSettings => {
  const allProviders = state.getAllProviders();
  const currentProvider = allProviders.find((p) => p.id === state.apiProviderId);
  const { modelName } = state;
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
// 默认状态
// ============================================================================

const DEFAULT_TRPG_MODEL_KEY = "trpg_model";
const AUTO_SAVE_INTERVAL = 10; // 每 10 轮自动保存

// v0.8.5: 设计模式会话 localStorage 持久化
const TRPG_DESIGN_SESSION_STORAGE_KEY = "trpg_design_session";

function persistDesignSession(session: DesignSession | null): void {
  try {
    if (session && session.messages.length > 0) {
      localStorage.setItem(TRPG_DESIGN_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(TRPG_DESIGN_SESSION_STORAGE_KEY);
    }
  } catch {
    // localStorage 满或序列化失败时静默降级
  }
}

function loadPersistedDesignSession(): DesignSession | null {
  try {
    const raw = localStorage.getItem(TRPG_DESIGN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignSession;
    // 基本完整性校验
    if (!parsed.sessionId || !parsed.draft || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPersistedDesignSession(): void {
  try {
    localStorage.removeItem(TRPG_DESIGN_SESSION_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 创建默认游戏状态 */
function createDefaultGameState(saveId: string): TrpgGameState {
  return {
    saveId,
    roundNumber: 0,
    activeCharacterId: "",
    currentLocation: "未知地点",
    phase: "explore",
    world: {},
    quests: [],
    time: { day: 1, hour: 8, calendarEra: "第一纪元" },
    factionRelations: {},
    npcs: [],
    locations: [],
  };
}

/** 创建默认角色 */
function createDefaultCharacter(): TrpgCharacter {
  return {
    charId: uuidv4(),
    name: "冒险者",
    race: "人类",
    class: "战士",
    level: 1,
    abilities: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 10 },
    hp: { current: 12, max: 12 },
    ac: 16,
    proficientSkills: ["athletics", "perception"],
    expertiseSkills: [],
    conditions: [],
    inventory: [],
    equipment: { weapon: "长剑", armor: "锁子甲" },
    classFeatures: [],
    xp: 0,
    background: "",
    alignment: "中立",
  };
}

// ============================================================================
// TRPG Slice 实现
// ============================================================================

export const createTrpgSlice: StateCreator<AppStoreState, [], [], TrpgSlice> = (set, get) => ({
  // ===== 状态 =====
  trpgMode: "game",
  trpgModel: "",
  trpgMessages: [],
  trpgSave: null,
  trpgWorldCard: null,
  trpgIsGenerating: false,
  trpgInputDraft: "",
  trpgActiveSheet: null,
  trpgAllSaves: [],
  trpgAllWorldCards: [],
  trpgPrevSemiStable: null,
  trpgDesignSession: null,

  // ===== Actions：模式与设置 =====
  setTrpgMode: (mode) => {
    set({ trpgMode: mode });
    if (mode === "design" && !get().trpgDesignSession) {
      // v0.8.5: 恢复持久化的设计会话，若无则新建
      // v0.8.7-urgent: 异步加载持久化会话，避免同步 JSON.parse 阻塞主线程（F3）
      setTimeout(() => {
        const persisted = loadPersistedDesignSession();
        if (persisted) {
          set({ trpgDesignSession: persisted });
          logger.info("trpg", "恢复持久化的设计模式会话");
        } else {
          set({ trpgDesignSession: createInitialDesignSession() });
        }
      }, 0);
    }
  },
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
        toast.error("存档不存在");
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
      logger.error("trpg", "加载存档失败: " + String(e));
      toast.error("加载存档失败");
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

    // v0.8.3: 世界卡绑定存档 — 创建存档时同步更新世界卡的 saveIds
    let worldCard: WorldCard | null = null;
    if (worldCardId) {
      worldCard = (await getWorldCard(worldCardId)) ?? null;
      if (worldCard) {
        // v0.8.3: 将新存档 ID 添加到世界卡的 saveIds 列表
        const existingSaveIds = worldCard.saveIds ?? [];
        worldCard.saveIds = [...existingSaveIds, saveId];
        await putWorldCard(worldCard);
      }
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
      logger.error("trpg", "保存存档失败: " + String(e));
      toast.error("保存存档失败");
    }
  },

  deleteTrpgSave: async (saveId) => {
    try {
      // v0.8.3: 删除存档时同步从世界卡的 saveIds 中移除
      const { trpgAllSaves } = get();
      const saveToDelete = trpgAllSaves.find((s) => s.saveId === saveId);
      if (saveToDelete?.worldCardId) {
        const worldCard = await getWorldCard(saveToDelete.worldCardId);
        if (worldCard && worldCard.saveIds) {
          worldCard.saveIds = worldCard.saveIds.filter((id) => id !== saveId);
          await putWorldCard(worldCard);
        }
      }

      await deleteSave(saveId);
      const { trpgSave } = get();
      if (trpgSave?.saveId === saveId) {
        set({ trpgSave: null, trpgMessages: [], trpgWorldCard: null });
      }
    } catch (e) {
      logger.error("trpg", "删除存档失败: " + String(e));
      toast.error("删除存档失败");
    }
  },

  loadAllSaves: async () => {
    try {
      const saves = await getAllSaves();
      set({ trpgAllSaves: saves });
    } catch (e) {
      logger.error("trpg", "加载存档列表失败: " + String(e));
    }
  },

  loadAllWorldCards: async () => {
    try {
      const cards = await getAllWorldCards();
      set({ trpgAllWorldCards: cards });
    } catch (e) {
      logger.error("trpg", "加载世界卡列表失败: " + String(e));
    }
  },

  importWorldCard: async (json) => {
    try {
      const card = JSON.parse(json) as WorldCard;
      if (!card.manifest?.card_id) {
        toast.error("无效的世界卡格式");
        return;
      }
      await putWorldCard(card);
      await get().loadAllWorldCards();
      toast.success("世界卡导入成功");
    } catch (e) {
      logger.error("trpg", "导入世界卡失败: " + String(e));
      toast.error("导入世界卡失败");
    }
  },

  removeWorldCard: async (cardId) => {
    try {
      await deleteWorldCard(cardId);
      await get().loadAllWorldCards();
      toast.success("世界卡已删除");
    } catch (e) {
      logger.error("trpg", "删除世界卡失败: " + String(e));
      toast.error("删除世界卡失败");
    }
  },

  // ===== Actions：设计模式 =====
  createTrpgDesignSession: () => {
    set({ trpgDesignSession: createInitialDesignSession() });
    logger.info("trpg", "创建设计模式会话");
  },

  resetTrpgDesignSession: () => {
    clearPersistedDesignSession();
    set({ trpgDesignSession: createInitialDesignSession() });
    toast.success("设计会话已重置");
    logger.info("trpg", "重置设计模式会话");
  },

  sendDesignModeMessage: async (input) => {
    const state = get();
    let session = state.trpgDesignSession;

    if (!session) {
      session = createInitialDesignSession();
      set({ trpgDesignSession: session });
    }

    if (state.trpgIsGenerating) return;

    // v0.8.12: trpgDesignClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需重置）
    set({ trpgIsGenerating: true, trpgInputDraft: "" });

    try {
      // 1. 添加用户消息
      const userMessage: TrpgMessage = {
        id: uuidv4(),
        role: "user",
        content: input,
        createdAt: Date.now(),
      };

      // v0.8.7-urgent: D4 合并重复 set — 仅构造 messagesWithUser，不立即 set，等添加 assistant 消息后一次性 set
      const messagesWithUser = [...session.messages, userMessage];

      // 2. 解析模型配置
      const modelKey = state.trpgModel || state.modelName;
      const allProviders = [...BUILTIN_PROVIDERS, ...state.customApiProviders];
      const apiUrl = getApiUrlForModel(modelKey, allProviders, state.apiUrl);
      const apiKey = getApiKeyForModel(modelKey, state.apiProviderKeys, state.apiKey, allProviders);
      const actualModelName = getActualModelName(modelKey, allProviders);

      if (!apiUrl || !apiKey) {
        toast.error("TRPG 模型未配置，请在设置面板中选择模型");
        set({ trpgIsGenerating: false });
        return;
      }

      // 3. 发送流式请求
      const assistantMessage: TrpgMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        reasoningContent: "",
        createdAt: Date.now(),
      };

      const messagesWithAssistant = [...messagesWithUser, assistantMessage];
      session = { ...session, messages: messagesWithAssistant, updatedAt: Date.now() };
      set({ trpgDesignSession: session });
      persistDesignSession(session);

      const url = getChatCompletionsUrl(apiUrl);
      const result = await sendDesignModeMessage(
        session,
        input,
        {
          url,
          apiKey,
          model: actualModelName,
          customRequestBody: state.customRequestBody,
        },
        {
          onFirstReasoningDelta: (delta) => {
            // v0.8.12: 移除 rAF 批量合并，每 chunk 直接 set，实现严格逐字流式
            const currentSession = get().trpgDesignSession;
            if (currentSession) {
              const messages = currentSession.messages;
              const idx = messages.findIndex((m) => m.id === assistantMessage.id);
              if (idx !== -1) {
                const next = messages.slice();
                next[idx] = {
                  ...messages[idx],
                  reasoningContent: (messages[idx].reasoningContent || "") + delta,
                };
                set({ trpgDesignSession: { ...currentSession, messages: next } });
              }
            }
          },
          onFinalContentDelta: (delta) => {
            // v0.8.12: 移除 rAF 批量合并，每 chunk 直接 set，实现严格逐字流式
            const currentSession = get().trpgDesignSession;
            if (currentSession) {
              const messages = currentSession.messages;
              const idx = messages.findIndex((m) => m.id === assistantMessage.id);
              if (idx !== -1) {
                const next = messages.slice();
                next[idx] = {
                  ...messages[idx],
                  content: (messages[idx].content || "") + delta,
                };
                set({ trpgDesignSession: { ...currentSession, messages: next } });
              }
            }
          },
          onToolCall: (tc) => {
            assistantMessage.toolCalls = [...(assistantMessage.toolCalls ?? []), tc];
          },
        },
      );

      // v0.8.12: 流式结束同步 flush 块已删除（rAF 批量合并移除后无需同步 flush）
      // 每 chunk 已直接 set，流结束时最后一个 chunk 的内容已在 store 中

      // 4. 应用最终结果
      assistantMessage.content = result.content;
      assistantMessage.reasoningContent = result.reasoningContent;
      assistantMessage.toolCalls = result.toolCalls;

      // 5. 解析阶段推进
      const parseResult = parseDesignModeResponse(session, input);
      let nextStage = session.currentStage;
      let nextFramework = session.framework;
      let nextDirection = session.direction;

      if (parseResult.stageCompleted && parseResult.nextStage !== undefined) {
        nextStage = parseResult.nextStage;
      }

      if (session.currentStage === 0 && parseResult.extractedData) {
        nextDirection = parseResult.extractedData as DesignSession["direction"];
      }

      if (session.currentStage === 1 && parseResult.extractedData) {
        nextFramework = {
          ...(session.framework ?? {
            context_world: "",
            context_rules: "",
            context_chars: "",
            context_timeline: "",
            style_guide: "",
          }),
          ...(parseResult.extractedData as Partial<DesignSession["framework"]>),
        } as DesignSession["framework"];
      }

      const finalSession: DesignSession = {
        ...session,
        currentStage: nextStage,
        direction: nextDirection,
        framework: nextFramework,
        // v0.8.7-urgent: 改用 findIndex + slice 仅替换目标元素，避免 .map() 重建整个数组（D2）
        messages: (() => {
          const idx = messagesWithAssistant.findIndex((m) => m.id === assistantMessage.id);
          if (idx === -1) return messagesWithAssistant;
          const next = messagesWithAssistant.slice();
          next[idx] = { ...assistantMessage };
          return next;
        })(),
        updatedAt: Date.now(),
      };

      set({ trpgDesignSession: finalSession });
      persistDesignSession(finalSession);

      // 6. 工具执行失败提示
      if (result.hasToolError) {
        toast.warning("部分工具调用失败，请检查输出");
      }

      logger.info("trpg", `设计模式 Stage ${finalSession.currentStage} 完成`);
    } catch (e) {
      // v0.8.12: trpgDesignClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）
      logger.error("trpg", "设计模式消息发送失败: " + String(e));
      const errorMsg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      toast.error(`设计模式请求失败: ${errorMsg}`);
    } finally {
      set({ trpgIsGenerating: false });
    }
  },

  saveDesignWorldCard: async () => {
    const session = get().trpgDesignSession;
    if (!session) {
      toast.error("没有活跃的设计会话");
      return;
    }

    const report = validateWorldCard(session.draft);
    if (!report.passed) {
      toast.error("世界卡校验未通过，无法保存");
      return;
    }

    const now = Date.now();
    const card: WorldCard = {
      ...session.draft,
      manifest: {
        ...session.draft.manifest,
      },
      designMeta: {
        ...(session.draft.designMeta ?? { phase: "p3", p2Stage: 4 }),
        phase: "p3",
        p2Stage: session.currentStage as number,
      },
    };

    try {
      await putWorldCard(card);
      await get().loadAllWorldCards();
      toast.success(`世界卡「${card.name}」已保存`);
      logger.info("trpg", `设计模式保存世界卡: ${card.manifest.card_id}`);
      // v0.8.5: 保存成功后清除持久化并自动新建设计会话
      clearPersistedDesignSession();
      const newSession = createInitialDesignSession();
      set({ trpgDesignSession: newSession });
      toast.success("已自动开始新的设计会话");
    } catch (e) {
      logger.error("trpg", "保存世界卡失败: " + String(e));
      toast.error("保存世界卡失败");
    }
  },

  exportDesignWorldCard: () => {
    const session = get().trpgDesignSession;
    if (!session) return "";
    return JSON.stringify(session.draft, null, 2);
  },

  importDesignWorldCard: (json) => {
    try {
      const parsed = JSON.parse(json) as WorldCard;
      const session = get().trpgDesignSession ?? createInitialDesignSession();
      set({
        trpgDesignSession: {
          ...session,
          draft: parsed,
          currentStage: 2,
          updatedAt: Date.now(),
        },
      });
      toast.success("世界卡已导入设计会话");
    } catch (e) {
      logger.error("trpg", "导入设计世界卡失败: " + String(e));
      toast.error("导入失败：JSON 格式错误");
    }
  },

  // ===== Actions：消息发送（三阶段管线） =====
  sendTrpgMessage: async (input) => {
    const state = get();

    // v0.8.2: 设计模式走独立管线
    if (state.trpgMode === "design") {
      await get().sendDesignModeMessage(input);
      return;
    }

    const { trpgSave, trpgWorldCard, trpgModel } = state;

    if (!trpgSave) {
      toast.error("请先创建或加载存档");
      return;
    }

    if (state.trpgIsGenerating) return;

    // v0.8.12: trpgClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需重置）
    set({ trpgIsGenerating: true, trpgInputDraft: "" });

    try {
      // === 第一阶段：预执行（并行） ===
      logger.info("trpg", "Stage 1: 预执行开始");

      // 1.1 添加用户消息
      const userMessage: TrpgMessage = {
        id: uuidv4(),
        role: "user",
        content: input,
        createdAt: Date.now(),
      };

      // v0.8.7-urgent: D4 合并重复 set — 仅构造 messagesWithUser，不立即 set，等添加 assistant 消息后一次性 set
      const messagesWithUser = [...state.trpgMessages, userMessage];

      // 1.2 向量记忆召回（复用 memoryService）
      let vectorMemories: Array<{ content: string; score: number }> = [];
      try {
        // 延迟导入避免循环依赖
        const { searchVectorMemoryWithScore, loadVectorMemoryShards } =
          await import("~/services/memoryService");

        // 加载记忆设置和 API 设置（参考 chat-slice.ts 模式）
        const memorySettingsData = await getItem<MemorySettings>("memory", "memorySettings");
        const memorySettings =
          memorySettingsData ?? ({ embeddingModel: "", vectorTopK: 8 } as MemorySettings);
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
        logger.warn("trpg", "向量记忆召回失败: " + String(e));
      }

      logger.info("trpg", "Stage 1 完成: 预执行结束");

      // === 第二阶段：单次 API 请求 ===
      logger.info("trpg", "Stage 2: API 请求开始");

      // 2.1 构建上下文（传入半稳定层缓存，最大化 KV 缓存命中）
      const {
        systemPrompt,
        messages: contextMessages,
        tools,
        semiStable,
      } = buildTrpgContext({
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
      const apiUrl = getApiUrlForModel(modelKey, allProviders, get().apiUrl);
      const apiKey = getApiKeyForModel(modelKey, get().apiProviderKeys, get().apiKey, allProviders);
      const actualModelName = getActualModelName(modelKey, allProviders);

      if (!apiUrl || !apiKey) {
        toast.error("TRPG 模型未配置，请在设置面板中选择模型");
        set({ trpgIsGenerating: false });
        return;
      }

      // 2.3 创建 assistant 占位消息
      const assistantMessage: TrpgMessage = {
        id: uuidv4(),
        role: "assistant",
        content: "",
        reasoningContent: "",
        createdAt: Date.now(),
      };

      const messagesWithAssistant = [...messagesWithUser, assistantMessage];
      set({ trpgMessages: messagesWithAssistant });

      // 构建工具执行上下文
      const toolContext: TrpgToolContext = {
        character: trpgSave.character,
        gameState: trpgSave.gameState,
        worldCard: trpgWorldCard,
        recentInputs: messagesWithUser
          .filter((m) => m.role === "user")
          .slice(-5)
          .map((m) => m.content),
      };

      const collectedStateOps: StateOperation[] = [];

      const toolExecutor = (name: string, args: Record<string, unknown>) => {
        const resultStr = executeTrpgToolCall(name, args, toolContext);
        try {
          const parsed = JSON.parse(resultStr);
          if (parsed.stateOps && Array.isArray(parsed.stateOps)) {
            collectedStateOps.push(...parsed.stateOps);
          }
        } catch {
          // stateOps 解析失败不影响主流程
        }
        return resultStr;
      };

      // v0.8.2: 修复 TRPG 模式 URL 缺少 /chat/completions 端点后缀的 bug
      const url = getChatCompletionsUrl(apiUrl);

      // 2.4 两阶段 agentic 工具调用闭环
      const loopResult = await runAgenticToolLoop({
        url,
        apiKey,
        model: actualModelName,
        customRequestBody: state.customRequestBody,
        messages: [
          { role: "system", content: systemPrompt },
          ...contextMessages,
          { role: "user", content: input },
        ],
        tools,
        toolExecutor,
        // v0.8.13: 强化 agentic 引导——增加"2 轮思考 + 1 轮主动工具调用"强制要求
        firstSystemAppend:
          "【阶段 1：推理与工具规划】\n" +
          "本轮你只输出内部思考链（Think-1/2/OOC）和必要的 tool_calls。\n" +
          "禁止输出 Narrator 叙事。工具的真实执行结果会在下一阶段回传给你。\n" +
          "【v0.8.13 强化】必须至少进行 2 轮思考，其中至少 1 轮包含主动工具调用（被动触发的 memory-recall / world-recall 不计入）。仅思考 1 轮就输出正文是严重错误。",
        finalSystemAppend:
          "【阶段 2：基于真实工具结果生成叙事】\n" +
          "上面的 tool 消息是本地引擎执行工具后的真实结果（骰子点数、伤害、状态变更等）。\n" +
          "你必须基于这些真实结果生成最终 Narrator 七段式输出，不得改写或忽略已发生的数值。",
        callbacks: {
          // v0.8.12: 移除 rAF 批量合并，每 chunk 直接 set，实现严格逐字流式
          // 使用 findIndex 仅更新目标消息，避免全数组 map 导致 React.memo 失效
          onFirstReasoningDelta: (delta) => {
            const messages = get().trpgMessages;
            const idx = messages.findIndex((m) => m.id === assistantMessage.id);
            if (idx !== -1) {
              const next = messages.slice();
              next[idx] = {
                ...messages[idx],
                reasoningContent: (messages[idx].reasoningContent || "") + delta,
              };
              set({ trpgMessages: next });
            }
          },
          onFinalContentDelta: (delta) => {
            const messages = get().trpgMessages;
            const idx = messages.findIndex((m) => m.id === assistantMessage.id);
            if (idx !== -1) {
              const next = messages.slice();
              next[idx] = {
                ...messages[idx],
                content: (messages[idx].content || "") + delta,
              };
              set({ trpgMessages: next });
            }
          },
        },
        maxLoops: 3,
      });

      // v0.8.12: trpgClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）

      const fullContent = loopResult.finalContent;
      const fullReasoning =
        loopResult.firstReasoningContent +
        (loopResult.finalReasoningContent
          ? `\n\n[阶段 2 思考]\n${loopResult.finalReasoningContent}`
          : "");
      const toolCalls: TrpgMessage["toolCalls"] = loopResult.toolCalls;

      if (toolCalls.length > 0) {
        // v0.8.7-urgent: 改用 findIndex + slice 仅替换目标元素，避免 .map() 重建整个数组
        const messages = get().trpgMessages;
        const idx = messages.findIndex((m) => m.id === assistantMessage.id);
        if (idx !== -1) {
          const newMessages = messages.slice();
          newMessages[idx] = { ...messages[idx], toolCalls };
          set({ trpgMessages: newMessages });
        }
      }

      logger.info("trpg", "Stage 2 完成: 两阶段 agentic 闭环结束");

      // === 第三阶段：后处理 ===
      logger.info("trpg", "Stage 3: 后处理开始");

      // 3.1 解析思考链（Think-1/2/OOC/Narrator）
      const parsedChain = parseThinkSections(fullContent);
      const narratorSections = parsedChain.narrator;

      // 3.2 从 reasoning_content 解析 OOC LLM 端审查（审查项 1/2/7）
      const llmOocChecks = parseOocFromReasoning(fullReasoning);

      // 3.3 从 reasoning_content 解析 Think-1/Think-2（用于 category 路由和状态路由）
      const think1Result = parseThink1FromReasoning(fullReasoning);
      const think2Result = parseThink2FromReasoning(fullReasoning);
      if (think1Result) {
        logger.info(
          "trpg",
          `Think-1 解析: category=${think1Result.category}, skill=${think1Result.skillRequired}, dc=${think1Result.estimatedDc}`,
        );
      }
      if (think2Result) {
        logger.info(
          "trpg",
          `Think-2 解析: paths=${think2Result.paths.length}, recommended=${think2Result.recommended}`,
        );
      }

      // 3.4 执行 OOC TS 端审查（审查项 3/4/6），与 LLM 端审查合并
      const tsOocResult = runOocCheck(
        {
          player_input: input,
          recent_inputs: messagesWithUser
            .filter((m) => m.role === "user")
            .slice(-5)
            .map((m) => m.content),
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
      const hasHardBlock = mergedChecks.some((c) => c.result === "hard_block");
      const hasSoftWarn = mergedChecks.some((c) => c.result === "soft_warn");
      const oocAction: OocResult["action"] = hasHardBlock
        ? "blocked"
        : hasSoftWarn
          ? "partial"
          : "resolved";
      logger.info(
        "trpg",
        `OOC 审查合并完成: action=${oocAction}, hardBlock=${hasHardBlock}, softWarn=${hasSoftWarn}`,
      );

      // 3.5 更新消息
      // v0.8.7-urgent: 改用 findIndex + slice 仅替换目标元素，避免 .map() 重建整个数组（C8）
      {
        const messages = get().trpgMessages;
        const idx = messages.findIndex((m) => m.id === assistantMessage.id);
        if (idx !== -1) {
          const newMessages = messages.slice();
          newMessages[idx] = {
            ...messages[idx],
            content: fullContent,
            reasoningContent: fullReasoning,
            narratorSections,
          };
          set({ trpgMessages: newMessages });
        }
      }

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
            diceResult: collectedStateOps.find((op) => op.type === "hp_change")
              ? undefined
              : undefined,
            narratorSections,
            stateOps: collectedStateOps,
            aSummaryCount: trpgSave.aSummaries.length,
          },
          updatedCharacter,
          updatedGameState,
          trpgWorldCard,
        );
        logger.info(
          "trpg",
          `Think-4 评分: total=${think4Result.total}, verdict=${think4Result.verdict}`,
        );
      } catch (e) {
        logger.warn("trpg", "Think-4 评分失败: " + String(e));
      }

      // 3.8 A/B/C 记忆摘要生成
      const newRound = updatedGameState.roundNumber;
      const summaryResult = checkAndGenerateSummaries(
        newRound,
        [
          userMessage,
          {
            id: assistantMessage.id,
            role: "assistant",
            content: fullContent,
            reasoningContent: fullReasoning,
            narratorSections,
            createdAt: Date.now(),
          } as TrpgMessage,
        ],
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
        logger.info("trpg", `A 级摘要生成: round ${newRound}`);
      }
      if (summaryResult.newBSummary) {
        updatedBSummaries.push(summaryResult.newBSummary);
        while (updatedBSummaries.length > 10) updatedBSummaries.shift();
        logger.info("trpg", `B 级摘要生成: round ${newRound}`);
      }
      if (summaryResult.newCSummary) {
        updatedCSummaries.push(summaryResult.newCSummary);
        logger.info("trpg", `C 级摘要生成: round ${newRound}`);
      }

      const updatedSave: SaveSlot = {
        ...trpgSave,
        gameState: updatedGameState,
        character: updatedCharacter,
        messages: get().trpgMessages,
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
        const { getEmbedding, saveVectorMemoryShards } = await import("~/services/memoryService");

        // 加载记忆设置和 API 设置
        const memorySettingsData = await getItem<MemorySettings>("memory", "memorySettings");
        const memorySettings =
          memorySettingsData ?? ({ embeddingModel: "", vectorTopK: 8 } as MemorySettings);
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
        logger.warn("trpg", "向量记忆写入失败: " + String(e));
      }

      logger.info("trpg", "Stage 3 完成: 后处理结束");
    } catch (e) {
      // v0.8.12: trpgClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）
      logger.error("trpg", "消息发送失败: " + String(e));
      const errorMsg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      toast.error(`TRPG 请求失败: ${errorMsg}`);
    } finally {
      set({ trpgIsGenerating: false });
    }
  },

  stopTrpgGenerating: () => {
    // v0.8.12: trpgClearBuffer / trpgDesignClearBuffer 已移除（rAF 批量合并已删除，无缓冲区需清理）
    // 注意：AbortController 需修改 agenticLoop.ts 支持 signal 参数
    set({ trpgIsGenerating: false });
  },
});
