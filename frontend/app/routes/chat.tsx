/**
 * 聊天页面
 *
 * 布局：角色卡选择器（可折叠） + 消息列表 + 输入框
 * v0.2.0: Header 三按钮（新建会话/当前会话列表/所有会话列表）+ 多会话架构集成
 */

import * as React from "react";
import type { Route } from "./+types/chat";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  IconPlus,
  IconMenu,
  IconGrid,
  IconMessage,
  IconUser,
  IconUserGroup,
  IconExclamation,
  IconSettings,
  IconArrowDown,
  IconRefresh,
} from "~/components/luzzy/luzzy-icons";

import { useAppStore } from "~/stores";
import { LuzzyLayout } from "~/components/luzzy/luzzy-layout";
import { LuzzyChatMessage } from "~/components/luzzy/luzzy-chat-message";
import { LuzzyChatInput } from "~/components/luzzy/luzzy-chat-input";
import { CharacterPicker } from "~/components/luzzy/character-picker";
import { SessionList } from "~/components/luzzy/session-list";
import { AllSessionsList } from "~/components/luzzy/all-sessions-list";
import { LuzzyShareDialog } from "~/components/luzzy/luzzy-share-dialog";
import { useIsMobile } from "~/hooks/use-mobile";
import { useStickToBottom } from "use-stick-to-bottom";
import { toast } from "sonner";
import { logger } from "~/services/logger";
import { copyTextToClipboard } from "~/lib/clipboard";
import { pressable } from "~/lib/motion-presets";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";

export function meta(_: Route.MetaArgs) {
  return [{ title: "聊天 - LUZZY" }];
}

export default function ChatPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [showCharacterPicker, setShowCharacterPicker] = React.useState(false);
  const [showSessionList, setShowSessionList] = React.useState(false);
  const [showAllSessions, setShowAllSessions] = React.useState(false);
  const [showApiConfigWarning, setShowApiConfigWarning] = React.useState(false);
  // v0.3.2: 会话分享对话框状态
  const [shareDialog, setShareDialog] = React.useState<{
    open: boolean;
    sessionId: string | null;
  }>({ open: false, sessionId: null });

  /** v0.3.2: 分享会话 */
  const handleShareSession = React.useCallback((sessionId: string) => {
    setShareDialog({ open: true, sessionId });
  }, []);

  // Store 数据
  const messages = useAppStore((s) => s.messages);
  const currentCharacter = useAppStore((s) => s.currentCharacter);
  const currentCharacterUuid = useAppStore((s) => s.currentCharacterUuid);
  const characters = useAppStore((s) => s.characters);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const isReceiving = useAppStore((s) => s.isReceiving);
  const isMainPhase = useAppStore((s) => s.isMainPhase);
  const inputDraft = useAppStore((s) => s.inputDraft);
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const apiKey = useAppStore((s) => s.apiKey);

  // Store actions
  const setInputDraft = useAppStore((s) => s.setInputDraft);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const stopGenerating = useAppStore((s) => s.stopGenerating);
  const regenerate = useAppStore((s) => s.regenerate);
  // v0.4.6: 继续剧情
  const continueStory = useAppStore((s) => s.continueStory);
  const deleteMessage = useAppStore((s) => s.deleteMessage);
  const setCurrentCharacter = useAppStore((s) => s.setCurrentCharacter);
  const setCurrentCharacterUuid = useAppStore((s) => s.setCurrentCharacterUuid);
  const loadChatHistory = useAppStore((s) => s.loadChatHistory);
  const ensureDefaultCharacter = useAppStore((s) => s.ensureDefaultCharacter);
  const createSession = useAppStore((s) => s.createSession);
  const switchSession = useAppStore((s) => s.switchSession);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const renameSession = useAppStore((s) => s.renameSession);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const saveSessions = useAppStore((s) => s.saveSessions);
  const setMessages = useAppStore((s) => s.setMessages);
  const retryMessage = useAppStore((s) => s.retryMessage);
  const translateMessage = useAppStore((s) => s.translateMessage);
  const shareMessage = useAppStore((s) => s.shareMessage);
  const createBranch = useAppStore((s) => s.createBranch);
  const switchRetryVersion = useAppStore((s) => s.switchRetryVersion);

  // v0.5.4: 组件卸载时中止生成请求，避免向已卸载组件写入状态
  React.useEffect(() => {
    return () => {
      const { abortController, stopGenerating: stop } = useAppStore.getState();
      if (abortController) {
        stop();
      }
    };
  }, []);

  // 初始化：加载会话列表 + 确保默认角色"鹿溪"存在 + 恢复上次会话状态
  React.useEffect(() => {
    // v0.8.7-urgent: cancelled 标志，组件卸载后中断异步操作
    let cancelled = false;
    void loadSessions().then(() => {
      if (cancelled) return;
      ensureDefaultCharacter().then(async () => {
        if (cancelled) return;
        const state = useAppStore.getState();
        // v0.3.2: 优先恢复持久化的 currentCharacterUuid
        if (!state.currentCharacter && state.currentCharacterUuid) {
          const char = state.characters.find((c) => c.uuid === state.currentCharacterUuid);
          if (char) {
            if (!cancelled) setCurrentCharacter(char);
            // v0.3.2: 若有持久化的 currentSessionId，恢复该会话消息
            if (state.currentSessionId) {
              const session = state.sessions.find((s) => s.id === state.currentSessionId);
              if (session && session.messages.length > 0) {
                if (!cancelled) setMessages(session.messages);
                return;
              }
            }
            // 无有效会话则加载角色聊天历史
            await loadChatHistory(char.uuid);
            if (cancelled) return;
            // v0.4.1: 首次启动时若历史为空且角色有开场白,自动创建默认会话显示开场白
            const currentMessages = useAppStore.getState().messages;
            if (currentMessages.length === 0 && char.firstMessage) {
              const sessionId = createSession(char.uuid, char.name, char.firstMessage);
              const newSession = useAppStore.getState().sessions.find((s) => s.id === sessionId);
              if (newSession && !cancelled) {
                setMessages(newSession.messages);
                void saveSessions();
              }
            }
          }
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    ensureDefaultCharacter,
    setCurrentCharacter,
    loadChatHistory,
    loadSessions,
    setMessages,
    createSession,
    saveSessions,
  ]);

  // 智能滚动附着（use-stick-to-bottom）
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom();

  // v0.4.4: 20 轮分页(20 对话轮 = 40 条消息)
  const PAGE_SIZE = 40;
  const [displayCount, setDisplayCount] = React.useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  // v0.8.7-urgent: setTimeout timer refs，组件卸载时清理
  const scrollLoadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchSessionTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpMsgTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpHighlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // v0.8.7-urgent: 组件卸载时清理所有 setTimeout
  React.useEffect(() => {
    return () => {
      if (scrollLoadTimerRef.current) clearTimeout(scrollLoadTimerRef.current);
      if (switchSessionTimerRef.current) clearTimeout(switchSessionTimerRef.current);
      if (jumpMsgTimerRef.current) clearTimeout(jumpMsgTimerRef.current);
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current);
    };
  }, []);

  // v0.4.4: 切换会话时重置分页
  React.useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [currentSessionId]);

  // v0.4.4: 只渲染最后 displayCount 条消息
  const visibleMessages = React.useMemo(() => {
    return messages.slice(-displayCount);
  }, [messages, displayCount]);

  // v0.8.7-urgent: useDeferredValue 让 React 在空闲时处理消息列表更新，避免阻塞流式渲染
  const deferredMessages = React.useDeferredValue(visibleMessages);

  // v0.4.4: 滚动到顶部时加载更多消息
  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (target.scrollTop < 50 && displayCount < messages.length && !isLoadingMore) {
        setIsLoadingMore(true);
        const prevScrollHeight = target.scrollHeight;
        const prevScrollTop = target.scrollTop;

        // 显示刷新转圈动画 500ms
        scrollLoadTimerRef.current = setTimeout(() => {
          setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, messages.length));
          // 保持滚动位置(加载历史消息后,视图不跳动)
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop =
                scrollRef.current.scrollHeight - prevScrollHeight + prevScrollTop;
            }
          });
          setIsLoadingMore(false);
        }, 500);
      }
    },
    [displayCount, messages.length, isLoadingMore, scrollRef],
  );

  // 消息变化时，若已附着底部且处于非正文阶段则自动滚动到底部
  // v0.5.5-arch-fix: 正文阶段取消底部吸附，避免正文气泡被拖到底部
  React.useEffect(() => {
    if (isAtBottom && !isMainPhase) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom, isMainPhase]);

  // v0.5.5-arch-fix: 进入正文阶段时脱离底部吸附，视角切换到正文气泡首字可视区域
  const prevMainPhaseRef = React.useRef(false);
  React.useEffect(() => {
    if (isMainPhase && !prevMainPhaseRef.current) {
      const bubbleEl = document.querySelector("[data-luzzy-message-bubble]");
      if (bubbleEl) {
        // block: 'nearest' 只保证首字进入可视范围，不强制定顶
        bubbleEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
    prevMainPhaseRef.current = isMainPhase;
  }, [isMainPhase]);

  // 非正文阶段（思考/工具阶段）保持底部吸附
  const prevReceivingRef = React.useRef(false);
  React.useEffect(() => {
    if (isReceiving && !prevReceivingRef.current && !isMainPhase) {
      scrollToBottom();
    }
    prevReceivingRef.current = isReceiving;
  }, [isReceiving, scrollToBottom, isMainPhase]);

  /** 选择角色卡 */
  const handleSelectCharacter = React.useCallback(
    async (uuid: string) => {
      const char = characters.find((c) => c.uuid === uuid);
      if (!char) return;
      setCurrentCharacterUuid(uuid);
      setCurrentCharacter(char);
      // v0.3.5: 查找该角色最近会话，有则打开，无则加载历史（新建）
      const charSessions = sessions
        .filter((s) => s.characterId === uuid)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (charSessions.length > 0) {
        switchSession(charSessions[0].id);
        setMessages(charSessions[0].messages);
      } else {
        // v0.4.3: 首次启用角色卡,自动新建会话并注入开场白(修复开场白失效)
        const newSessionId = createSession(uuid, char.name, char.firstMessage);
        const newSession = useAppStore.getState().sessions.find((s) => s.id === newSessionId);
        setMessages(newSession?.messages ?? []);
        void saveSessions();
      }
      // v0.7.2: blur 当前焦点元素，防止 Android WebView 在 Sheet 关闭后自动恢复焦点到 textarea 触发软键盘
      (document.activeElement as HTMLElement | null)?.blur();
      setShowCharacterPicker(false);
    },
    [
      characters,
      sessions,
      setCurrentCharacterUuid,
      setCurrentCharacter,
      switchSession,
      setMessages,
      createSession,
      saveSessions,
    ],
  );

  /** 发送消息 */
  const handleSend = React.useCallback(async () => {
    const content = inputDraft.trim();
    if (!content || isGenerating) return;
    if (!currentCharacter) {
      toast.warning("请先选择角色卡");
      return;
    }
    if (!apiUrl || !apiKey) {
      setShowApiConfigWarning(true);
      return;
    }
    setInputDraft("");
    await sendMessage(content);
    // 发送后保存到当前会话
    if (currentSessionId) {
      const latestMessages = useAppStore.getState().messages;
      useAppStore.getState().setSessionMessages(currentSessionId, latestMessages);
      void saveSessions();
    }
  }, [
    inputDraft,
    isGenerating,
    currentCharacter,
    apiUrl,
    apiKey,
    sendMessage,
    setInputDraft,
    currentSessionId,
    saveSessions,
  ]);

  /** 复制消息 */
  const handleCopy = React.useCallback(async (msg: { content: string }) => {
    try {
      await copyTextToClipboard(msg.content);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }, []);

  /** 删除消息 */
  const handleDelete = React.useCallback(
    (msg: { id: string }) => {
      deleteMessage(msg.id);
    },
    [deleteMessage],
  );

  /** 重新生成 */
  const handleRegenerate = React.useCallback(async () => {
    if (isGenerating) return;
    await regenerate();
  }, [isGenerating, regenerate]);

  /** v0.4.6: 继续剧情 */
  const handleContinueStory = React.useCallback(async () => {
    if (isGenerating) return;
    await continueStory();
  }, [isGenerating, continueStory]);

  /** 新建会话 */
  const handleCreateSession = React.useCallback(() => {
    if (!currentCharacter) {
      toast.warning("请先选择角色卡");
      return;
    }
    // v0.3.5: 注入角色卡开场白
    // v0.3.7: 使用 createSession 返回的 session ID，避免 find 匹配到旧会话
    const newSessionId = createSession(
      currentCharacter.uuid,
      currentCharacter.name,
      currentCharacter.firstMessage,
    );
    // 同步消息列表（开场白已由 createSession 预置）
    const newSession = useAppStore.getState().sessions.find((s) => s.id === newSessionId);
    setMessages(newSession?.messages ?? []);
    setShowAllSessions(false);
    toast.success("已创建新会话");
    void saveSessions();
  }, [currentCharacter, createSession, setMessages, saveSessions]);

  /** 切换会话 */
  const handleSwitchSession = React.useCallback(
    (id: string) => {
      logger.info("user", `切换会话: ${id}`);
      switchSession(id);
      const session = sessions.find((s) => s.id === id);
      if (session) {
        setMessages(session.messages);
        // 同步角色卡
        const char = characters.find((c) => c.uuid === session.characterId);
        if (char) {
          setCurrentCharacterUuid(session.characterId);
          setCurrentCharacter(char);
        }
        // v0.4.4: 等待 AnimatePresence 动画完成后滚动到底部
        switchSessionTimerRef.current = setTimeout(() => {
          scrollToBottom();
        }, 300);
      }
      setShowAllSessions(false);
    },
    [
      switchSession,
      sessions,
      setMessages,
      characters,
      setCurrentCharacterUuid,
      setCurrentCharacter,
      scrollToBottom,
    ],
  );

  /** 删除会话 */
  const handleDeleteSession = React.useCallback(
    (id: string) => {
      logger.info("user", `删除会话: ${id}`);
      deleteSession(id);
      // 若删除的是当前会话,优先跳转到同角色的其他会话,无则新建会话(注入开场白)
      if (id === currentSessionId) {
        const currentCharId = useAppStore.getState().currentCharacterUuid;
        const currentChar = useAppStore.getState().currentCharacter;
        // v0.4.3: 按角色过滤剩余会话,避免跳转到默认角色鹿溪
        const sameCharSessions = sessions
          .filter((s) => s.id !== id && s.characterId === currentCharId)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        if (sameCharSessions.length > 0) {
          handleSwitchSession(sameCharSessions[0].id);
        } else if (currentChar) {
          // 无同角色会话,新建会话注入开场白
          const newSessionId = createSession(
            currentChar.uuid,
            currentChar.name,
            currentChar.firstMessage,
          );
          const newSession = useAppStore.getState().sessions.find((s) => s.id === newSessionId);
          setMessages(newSession?.messages ?? []);
        } else {
          setMessages([]);
        }
      }
      void saveSessions();
      toast.success("已删除会话");
    },
    [
      deleteSession,
      currentSessionId,
      sessions,
      handleSwitchSession,
      setMessages,
      saveSessions,
      createSession,
    ],
  );

  /** 重命名会话 */
  const handleRenameSession = React.useCallback(
    (id: string, title: string) => {
      renameSession(id, title);
      void saveSessions();
      toast.success("已重命名会话");
    },
    [renameSession, saveSessions],
  );

  /** 跳转到指定消息 */
  const handleJumpToMessage = React.useCallback((messageId: string) => {
    setShowSessionList(false);
    // 延迟滚动，等待列表渲染
    jumpMsgTimerRef.current = setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary/50");
        jumpHighlightTimerRef.current = setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary/50");
        }, 2000);
      }
    }, 300);
  }, []);

  /** 重试消息 */
  const handleRetry = React.useCallback(
    (msg: { id: string }) => {
      void retryMessage(msg.id);
    },
    [retryMessage],
  );

  /** 翻译消息（返回 Promise 以支持前端加载动画） */
  const handleTranslate = React.useCallback(
    (msg: { id: string }) => {
      return translateMessage(msg.id);
    },
    [translateMessage],
  );

  /** 分享消息 */
  const handleShare = React.useCallback(
    (msg: { id: string }) => {
      void shareMessage(msg.id);
    },
    [shareMessage],
  );

  /** 创建分支 */
  const handleCreateBranch = React.useCallback(
    (msg: { id: string }) => {
      createBranch(msg.id);
      // v0.4.1: 分支创建成功提示(配合消息列表的过渡动画)
      toast.success("已创建对话分支", { duration: 1500 });
    },
    [createBranch],
  );

  /** 切换重试版本 */
  const handleSwitchRetryVersion = React.useCallback(
    (msg: { id: string }, direction: "prev" | "next") => {
      switchRetryVersion(msg.id, direction);
    },
    [switchRetryVersion],
  );

  // 空状态：无角色卡
  if (!currentCharacter) {
    return (
      <LuzzyLayout title="聊天">
        <div className="flex h-full items-center justify-center p-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconMessage className="size-6" />
              </EmptyMedia>
              <EmptyTitle>开始对话</EmptyTitle>
              <EmptyDescription>请先选择一个角色卡开始聊天</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setShowCharacterPicker(true)}>
                <IconUser className="mr-2 size-4" />
                选择角色卡
              </Button>
            </EmptyContent>
          </Empty>
        </div>

        {/* 角色卡选择 Sheet */}
        <Sheet open={showCharacterPicker} onOpenChange={setShowCharacterPicker}>
          <SheetContent side="left" className="w-80 p-0">
            <SheetHeader>
              <SheetTitle>选择角色卡</SheetTitle>
            </SheetHeader>
            <CharacterPicker
              characters={characters}
              currentUuid={currentCharacterUuid ?? undefined}
              onSelect={handleSelectCharacter}
            />
          </SheetContent>
        </Sheet>
      </LuzzyLayout>
    );
  }

  return (
    <>
      <LuzzyLayout
        title={currentCharacter.name}
        headerClassName="border-b border-border bg-background"
        actions={
          <div className="flex items-center gap-1">
            {/* v0.3.5: 快捷切换角色 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
              whileHover={{ scale: 1.08, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
              whileTap={{ scale: 0.92, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCharacterPicker(true)}
                title="切换角色"
                className="size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <IconUserGroup className="size-5" />
              </Button>
            </motion.div>
            {/* 新建会话 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
              whileHover={{ scale: 1.08, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
              whileTap={{ scale: 0.92, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCreateSession}
                title="新建会话"
                className="size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <IconPlus className="size-5" />
              </Button>
            </motion.div>
            {/* 当前会话列表 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
              whileHover={{ scale: 1.08, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
              whileTap={{ scale: 0.92, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSessionList(true)}
                title="当前会话列表"
                className="size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <IconMenu className="size-5" />
              </Button>
            </motion.div>
            {/* 所有会话列表 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
              whileHover={{ scale: 1.08, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
              whileTap={{ scale: 0.92, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAllSessions(true)}
                title="所有会话列表"
                className="size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <IconGrid className="size-5" />
              </Button>
            </motion.div>
          </div>
        }
      >
        <div className="flex h-full">
          {/* 桌面端角色卡选择器 */}
          {!isMobile && (
            <div className="w-64 shrink-0 border-r">
              <CharacterPicker
                characters={characters}
                currentUuid={currentCharacterUuid ?? undefined}
                onSelect={handleSelectCharacter}
              />
            </div>
          )}

          {/* 聊天主区域 */}
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* v0.3.0 自定义背景层 */}
            {currentCharacter.customBackground?.image && (
              <div
                className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${currentCharacter.customBackground.image})`,
                  opacity: (currentCharacter.customBackground.opacity ?? 80) / 100,
                  filter: `blur(${currentCharacter.customBackground.blur ?? 0}px)`,
                }}
              />
            )}
            {/* 消息列表 - 使用 use-stick-to-bottom 实现智能滚动附着 */}
            <div
              ref={scrollRef}
              className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden"
              onScroll={handleScroll}
            >
              {/* v0.4.1: 会话切换/分支创建时的淡入淡出 + 滑动过渡动画 */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSessionId ?? "no-session"}
                  ref={contentRef}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col gap-1 py-4"
                >
                  {/* v0.4.4: 顶部加载指示器 */}
                  {displayCount < messages.length && (
                    <div className="flex justify-center py-4">
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <IconRefresh className="size-4 animate-spin" />
                          <span>加载更多消息...</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/50">向上滚动查看更多</div>
                      )}
                    </div>
                  )}
                  {deferredMessages.map((msg, i) => (
                    <div key={msg.id} id={`msg-${msg.id}`} className="cv-auto">
                      <LuzzyChatMessage
                        message={msg}
                        avatarUrl={currentCharacter.avatar}
                        avatarName={currentCharacter.name}
                        isLast={i === deferredMessages.length - 1}
                        isGenerating={isGenerating}
                        onCopy={handleCopy}
                        onDelete={handleDelete}
                        onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
                        onRetry={handleRetry}
                        onTranslate={handleTranslate}
                        onShare={handleShare}
                        onCreateBranch={handleCreateBranch}
                        onSwitchRetryVersion={handleSwitchRetryVersion}
                        onContinueStory={msg.role === "assistant" ? handleContinueStory : undefined}
                      />
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* API 未配置提示卡片 */}
            <AnimatePresence>
              {showApiConfigWarning && (
                <motion.div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-background/80"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowApiConfigWarning(false)}
                >
                  <motion.div
                    className="flex flex-col items-center gap-4 rounded-2xl border border-border/30 bg-card p-8 shadow-md"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/15">
                      <IconExclamation className="size-7 text-amber-600" />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <p className="text-base font-semibold">API 地址或密钥未配置</p>
                      <p className="text-sm text-muted-foreground">请先前往设置页面完成 API 配置</p>
                    </div>
                    <Button
                      onClick={() => {
                        setShowApiConfigWarning(false);
                        navigate("/settings");
                      }}
                      className="gap-2"
                    >
                      <IconSettings className="size-4" />
                      前往设置
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 输入框 */}
            <LuzzyChatInput
              value={inputDraft}
              onChange={setInputDraft}
              onSend={handleSend}
              onStop={stopGenerating}
              isGenerating={isGenerating}
            />

            {/* v0.3.3: 浮动置底按钮 - 浮在最上层，不依附于输入框 */}
            <AnimatePresence>
              {!isAtBottom && (
                <motion.div
                  className="absolute right-4 z-30"
                  style={{ bottom: "calc(var(--chat-input-height, 108px) + 16px)" }}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => scrollToBottom()}
                    className="size-10 rounded-full border border-border/20 shadow-lg"
                    title="滚动到底部"
                    {...pressable}
                  >
                    <IconArrowDown className="size-5" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 移动端角色卡选择 Sheet */}
        {isMobile && (
          <Sheet open={showCharacterPicker} onOpenChange={setShowCharacterPicker}>
            <SheetContent side="left" className="w-80 overflow-hidden p-0">
              <SheetHeader>
                <SheetTitle>选择角色卡</SheetTitle>
              </SheetHeader>
              <CharacterPicker
                characters={characters}
                currentUuid={currentCharacterUuid ?? undefined}
                onSelect={handleSelectCharacter}
              />
            </SheetContent>
          </Sheet>
        )}
      </LuzzyLayout>

      {/* 当前会话列表 */}
      {showSessionList && (
        <SessionList
          messages={messages}
          semanticSearchEnabled={false}
          onClose={() => setShowSessionList(false)}
          onJumpToMessage={handleJumpToMessage}
        />
      )}

      {/* 所有会话列表 */}
      {showAllSessions && (
        <AllSessionsList
          sessions={sessions}
          currentSessionId={currentSessionId}
          semanticSearchEnabled={false}
          onClose={() => setShowAllSessions(false)}
          onSwitchSession={handleSwitchSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onShareSession={handleShareSession}
        />
      )}

      {/* v0.3.2: 会话分享对话框 */}
      <LuzzyShareDialog
        open={shareDialog.open}
        onOpenChange={(v) => setShareDialog({ ...shareDialog, open: v })}
        session={sessions.find((s) => s.id === shareDialog.sessionId) ?? null}
        messages={sessions.find((s) => s.id === shareDialog.sessionId)?.messages ?? []}
      />
    </>
  );
}
