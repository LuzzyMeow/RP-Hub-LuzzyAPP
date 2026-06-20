/**
 * 会话 Slice（Zustand slice，v0.2.0 新增）
 *
 * 管理多会话架构：每角色卡可创建多个独立会话，会话内消息、重试分支独立维护。
 * 数据持久化到 IndexedDB（store: sessions）。
 */

import type { StateCreator } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { Session } from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
import type { AppStoreState, SessionSlice } from "~/stores/slices/types";

/** 会话在 IndexedDB 中的存储键 */
const SESSIONS_STORAGE_KEY = "sessions";

export const createSessionSlice: StateCreator<
  AppStoreState,
  [],
  [],
  SessionSlice
> = (set, get) => ({
  // ===== 状态初始值 =====
  sessions: [],
  currentSessionId: null,

  // ===== Actions =====
  createSession: (characterId, characterName) => {
    const now = Date.now();
    const id = uuidv4();
    const newSession: Session = {
      id,
      title: "新会话",
      characterId,
      characterName,
      messages: [],
      createdAt: now,
      updatedAt: now,
      retryBranches: {},
      retryActiveIndex: {},
    };
    set((state) => ({
      sessions: [...state.sessions, newSession],
      currentSessionId: id,
    }));
    return id;
  },

  switchSession: (id) => set({ currentSessionId: id }),

  deleteSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      // 若删除的是当前会话，回退到 null 或第一个剩余会话
      const currentSessionId =
        state.currentSessionId === id
          ? (sessions[0]?.id ?? null)
          : state.currentSessionId;
      return { sessions, currentSessionId };
    }),

  renameSession: (id, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
      ),
    })),

  getSessionMessages: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    return session?.messages ?? [];
  },

  setSessionMessages: (id, messages) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, messages, updatedAt: Date.now() } : s,
      ),
    })),

  addRetryBranch: (sessionId, messageId, newMessage) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const branches = { ...s.retryBranches };
        const list = branches[messageId] ?? [];
        list.push(newMessage);
        branches[messageId] = list;
        const activeIndex = { ...s.retryActiveIndex };
        activeIndex[messageId] = list.length - 1;
        return {
          ...s,
          retryBranches: branches,
          retryActiveIndex: activeIndex,
          updatedAt: Date.now(),
        };
      }),
    })),

  switchRetryBranch: (sessionId, messageId, index) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const activeIndex = { ...s.retryActiveIndex };
        activeIndex[messageId] = index;
        return {
          ...s,
          retryActiveIndex: activeIndex,
          updatedAt: Date.now(),
        };
      }),
    })),

  loadSessions: async () => {
    try {
      const data = await getItem<Session[]>(
        "sessions",
        SESSIONS_STORAGE_KEY,
      );
      const sessions = data ?? [];
      // 校验 currentSessionId 是否仍存在
      const { currentSessionId } = get();
      const valid =
        currentSessionId !== null &&
        sessions.some((s) => s.id === currentSessionId);
      set({
        sessions,
        currentSessionId: valid ? currentSessionId : null,
      });
    } catch (e) {
      console.error("[SessionSlice] 加载会话失败:", e);
      set({ sessions: [] });
    }
  },

  saveSessions: async () => {
    try {
      await setItem("sessions", SESSIONS_STORAGE_KEY, get().sessions);
    } catch (e) {
      console.error("[SessionSlice] 保存会话失败:", e);
    }
  },
});
