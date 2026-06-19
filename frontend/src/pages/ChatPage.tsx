import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import { createStyles } from 'antd-style';
import { Markdown } from '@lobehub/ui';
import { Modal, message, Input, Empty, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useChatStore } from '@/store/useChatStore';
import { useCharacterStore } from '@/store/useCharacterStore';
import type { ChatMessage, Character } from '@/types';

const useStyles = createStyles(({ css }) => ({
  page: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--luzzy-background);
  `,
  // ===== 角色卡选择栏 =====
  charBar: css`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-sm);
    padding: var(--luzzy-spacing-xs) var(--luzzy-spacing-md);
    background: var(--luzzy-surface);
    border-bottom: 1px solid var(--luzzy-outline-variant);
    min-height: 44px;
  `,
  charBtn: css`
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-sm);
    min-height: 40px;
    padding: 4px 8px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-surface-container);
    border: none;
    cursor: pointer;
    transition: background var(--luzzy-transition);

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  charAvatar: css`
    width: 32px;
    height: 32px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-primary-container);
    color: var(--luzzy-on-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  charName: css`
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  `,
  charChevron: css`
    flex-shrink: 0;
    color: var(--luzzy-on-surface-variant);
  `,
  clearCharBtn: css`
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: var(--luzzy-radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface-variant);
    background: transparent;
    border: none;
    cursor: pointer;

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  // ===== 消息列表 =====
  messageList: css`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--luzzy-spacing-sm) var(--luzzy-spacing-sm) 0;
    -webkit-overflow-scrolling: touch;
  `,
  messageRow: css`
    display: flex;
    margin-bottom: var(--luzzy-spacing-sm);
    gap: var(--luzzy-spacing-sm);

    &.user {
      flex-direction: row-reverse;
    }
  `,
  bubble: css`
    max-width: 85%;
    padding: 10px 14px;
    border-radius: var(--luzzy-radius-lg);
    font-size: 15px;
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: anywhere;

    &.assistant {
      background: var(--luzzy-surface-container);
      color: var(--luzzy-on-surface);
      border-top-left-radius: 4px;
    }

    &.user {
      background: var(--luzzy-primary);
      color: var(--luzzy-on-primary);
      border-top-right-radius: 4px;
    }

    &.error {
      background: var(--luzzy-error-container);
      color: var(--luzzy-on-error-container);
    }
  `,
  // 消息操作按钮（悬浮在气泡旁）
  msgActions: css`
    flex-shrink: 0;
    display: flex;
    align-items: flex-end;
    align-self: flex-start;
  `,
  msgActionBtn: css`
    width: 32px;
    height: 32px;
    border-radius: var(--luzzy-radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface-variant);
    background: transparent;
    border: none;
    cursor: pointer;

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  thinkingChain: css`
    margin-bottom: 8px;
    padding: 8px 12px;
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-md);
    font-size: 13px;
    color: var(--luzzy-on-surface-variant);
    border-left: 3px solid var(--luzzy-outline);
  `,
  toolCall: css`
    margin-bottom: 8px;
    padding: 8px 12px;
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-md);
    font-size: 13px;
    color: var(--luzzy-on-surface-variant);
    border-left: 3px solid var(--luzzy-primary);
  `,
  emptyState: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--luzzy-spacing-sm);
    color: var(--luzzy-on-surface-variant);
    padding: var(--luzzy-spacing-xl);
    text-align: center;
  `,
  emptyTitle: css`
    font-size: 18px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
  `,
  emptyDesc: css`
    font-size: 14px;
    line-height: 1.6;
  `,
  // ===== 输入区 =====
  inputArea: css`
    flex-shrink: 0;
    padding: var(--luzzy-spacing-sm) var(--luzzy-spacing-md) calc(var(--luzzy-spacing-sm) + var(--luzzy-safe-area-bottom));
    background: var(--luzzy-surface);
    border-top: 1px solid var(--luzzy-outline-variant);
    display: flex;
    align-items: flex-end;
    gap: var(--luzzy-spacing-sm);
  `,
  textarea: css`
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    padding: 10px 14px;
    border-radius: var(--luzzy-radius-full);
    border: 1px solid var(--luzzy-outline-variant);
    background: var(--luzzy-surface-container);
    color: var(--luzzy-on-surface);
    font-size: 15px;
    line-height: 1.4;
    resize: none;
    outline: none;
    font-family: inherit;
    transition: border-color var(--luzzy-transition);

    &:focus {
      border-color: var(--luzzy-primary);
    }

    &::placeholder {
      color: var(--luzzy-outline);
    }
  `,
  sendBtn: css`
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-primary);
    color: var(--luzzy-on-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: background var(--luzzy-transition), opacity var(--luzzy-transition);

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &:not(:disabled):active {
      background: var(--luzzy-primary-active);
    }
  `,
  stopBtn: css`
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-error);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
  `,
  loadingDots: css`
    display: inline-flex;
    gap: 4px;
    padding: 4px 0;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--luzzy-on-surface-variant);
      animation: luzzy-bounce 1.4s infinite ease-in-out both;
    }

    span:nth-child(1) { animation-delay: -0.32s; }
    span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes luzzy-bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  `,
  // ===== 角色选择弹窗 =====
  charModalList: css`
    max-height: 60vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-xs);
  `,
  charModalItem: css`
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-sm);
    padding: var(--luzzy-spacing-sm);
    border-radius: var(--luzzy-radius-md);
    background: var(--luzzy-surface-container);
    border: 2px solid transparent;
    cursor: pointer;
    min-height: 44px;
    width: 100%;
    text-align: left;

    &.active {
      border-color: var(--luzzy-primary);
    }

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  charModalInfo: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  charModalName: css`
    font-size: 15px;
    font-weight: 600;
    color: var(--luzzy-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  charModalDesc: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  // ===== 编辑消息弹窗 =====
  editTextarea: css`
    .ant-input {
      background: var(--luzzy-surface-container-high) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-sm) !important;
    }
  `,
}));

export function ChatPage() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();

  // ===== Chat Store =====
  const messages = useChatStore((s) => s.messages);
  const currentCharacter = useChatStore((s) => s.currentCharacter);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const inputDraft = useChatStore((s) => s.inputDraft);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopGenerating = useChatStore((s) => s.stopGenerating);
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const setCurrentChatCharacter = useChatStore((s) => s.setCurrentCharacter);
  const loadChatHistory = useChatStore((s) => s.loadChatHistory);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const regenerate = useChatStore((s) => s.regenerate);

  // ===== Character Store =====
  const characters = useCharacterStore((s) => s.characters);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);
  const setCurrentCharacterUuid = useCharacterStore((s) => s.setCurrentCharacter);

  // ===== 本地 UI 状态 =====
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  /** 角色选择弹窗 */
  const [charModalOpen, setCharModalOpen] = useState(false);
  /** 编辑消息弹窗 */
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  /** 编辑消息内容 */
  const [editContent, setEditContent] = useState('');
  /** 删除确认弹窗 */
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  /** 初次挂载加载角色卡列表 */
  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  /** 滚动时判断是否贴近底部 */
  const handleScroll = (): void => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** 消息列表变化时，仅在贴近底部时自动滚动 */
  useEffect(() => {
    if (stickToBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  /** 发送消息 */
  const handleSend = (): void => {
    if (!inputDraft.trim() || isGenerating) return;
    void sendMessage(inputDraft);
  };

  /** 回车发送（Shift+Enter 换行） */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 获取角色卡首字母用于头像占位 */
  const getInitial = (name: string): string => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  /** 打开角色选择弹窗 */
  const handleOpenCharModal = (): void => {
    setCharModalOpen(true);
  };

  /** 选择角色卡 */
  const handleSelectCharacter = (character: Character): void => {
    setCurrentCharacterUuid(character.uuid);
    setCurrentChatCharacter(character);
    void loadChatHistory(character.uuid)
      .then(() => {
        messageApi.success(`已切换到 ${character.name}`);
      })
      .catch((e) => {
        messageApi.error(e instanceof Error ? e.message : '加载聊天记录失败');
      });
    setCharModalOpen(false);
  };

  /** 清除当前角色卡（回到无角色状态） */
  const handleClearCharacter = (): void => {
    setCurrentCharacterUuid(null);
    setCurrentChatCharacter(null);
    clearMessages();
    messageApi.info('已清除当前角色');
  };

  /** 复制消息内容到剪贴板 */
  const handleCopyMessage = async (msg: ChatMessage): Promise<void> => {
    const text = msg.content;
    if (!text) {
      messageApi.warning('消息内容为空');
      return;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        messageApi.success('已复制到剪贴板');
        return;
      } catch {
        // 降级方案：使用临时 textarea
      }
    }
    // 降级方案：使用临时 textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      messageApi.success('已复制到剪贴板');
    } catch {
      messageApi.error('复制失败');
    }
    document.body.removeChild(textarea);
  };

  /** 打开编辑消息弹窗 */
  const handleOpenEdit = (msg: ChatMessage): void => {
    setEditingMsg(msg);
    setEditContent(msg.content);
  };

  /** 保存编辑后的消息 */
  const handleSaveEdit = (): void => {
    if (!editingMsg) return;
    if (!editContent.trim()) {
      messageApi.warning('消息内容不能为空');
      return;
    }
    editMessage(editingMsg.id, editContent.trim());
    messageApi.success('消息已更新');
    setEditingMsg(null);
    setEditContent('');
  };

  /** 确认删除消息 */
  const handleConfirmDelete = (): void => {
    if (!deletingMsgId) return;
    deleteMessage(deletingMsgId);
    messageApi.success('消息已删除');
    setDeletingMsgId(null);
  };

  /** 重新生成（仅对 assistant 消息） */
  const handleRegenerate = (): void => {
    if (isGenerating) {
      messageApi.warning('正在生成中，请稍候');
      return;
    }
    void regenerate();
  };

  /** 构建消息操作菜单项 */
  const buildMessageMenuItems = (msg: ChatMessage): MenuProps['items'] => {
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'copy',
        label: '复制',
        onClick: () => void handleCopyMessage(msg),
      },
    ];

    // 用户消息可编辑；assistant 消息（非 loading）也可编辑
    if (!msg.loading) {
      items.push({
        key: 'edit',
        label: '编辑',
        onClick: () => handleOpenEdit(msg),
      });
    }

    // 删除（loading 中的消息不可删除）
    if (!msg.loading) {
      items.push({
        key: 'delete',
        label: '删除',
        danger: true,
        onClick: () => setDeletingMsgId(msg.id),
      });
    }

    // 重新生成（仅最后一条 assistant 消息且非 loading）
    if (msg.role === 'assistant' && !msg.loading && !isGenerating) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.id === msg.id) {
        items.push({ type: 'divider' });
        items.push({
          key: 'regenerate',
          label: '重新生成',
          onClick: handleRegenerate,
        });
      }
    }

    return items;
  };

  return (
    <div className={styles.page}>
      {contextHolder}

      {/* ===== 角色卡选择栏 ===== */}
      <div className={styles.charBar}>
        <button
          type="button"
          className={styles.charBtn}
          onClick={handleOpenCharModal}
        >
          {currentCharacter ? (
            <>
              <div className={styles.charAvatar}>
                {currentCharacter.avatar ? (
                  <img src={currentCharacter.avatar} alt={currentCharacter.name} />
                ) : (
                  getInitial(currentCharacter.name)
                )}
              </div>
              <span className={styles.charName}>{currentCharacter.name}</span>
            </>
          ) : (
            <>
              <div className={styles.charAvatar}>?</div>
              <span className={styles.charName}>选择角色卡...</span>
            </>
          )}
          <span className={styles.charChevron}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
        {currentCharacter && (
          <button
            type="button"
            className={styles.clearCharBtn}
            onClick={handleClearCharacter}
            aria-label="清除角色"
            title="清除角色"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* ===== 消息列表 ===== */}
      <div ref={listRef} className={styles.messageList} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>
              {currentCharacter ? '开始一段新对话' : '请先选择角色卡'}
            </div>
            <div className={styles.emptyDesc}>
              {currentCharacter
                ? '在下方输入消息，与角色开启你的扮演旅程'
                : '点击上方角色栏，选择一个角色卡开始对话'}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`${styles.messageRow} ${m.role}`}>
              <div className={`${styles.bubble} ${m.role} ${m.error ? 'error' : ''}`}>
                {m.cot && (
                  <details className={styles.thinkingChain}>
                    <summary>思考过程</summary>
                    <Markdown>{m.cot}</Markdown>
                  </details>
                )}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div>
                    {m.toolCalls.map((tc) => (
                      <div key={tc.id} className={styles.toolCall}>
                        <strong>{tc.callLabel}</strong>
                        {tc.query && <div>查询: {tc.query}</div>}
                        {tc.reason && <div>原因: {tc.reason}</div>}
                        <div>状态: {tc.status}</div>
                        {tc.result && (
                          <details>
                            <summary>结果</summary>
                            <Markdown>{tc.result}</Markdown>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {m.loading && !m.content ? (
                  <div className={styles.loadingDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                ) : m.content ? (
                  m.role === 'user' ? (
                    <div>{m.content}</div>
                  ) : (
                    <Markdown>{m.content}</Markdown>
                  )
                ) : null}
                {m.error && <div style={{ color: 'var(--luzzy-error)' }}>{m.error}</div>}
              </div>
              {/* 消息操作菜单 */}
              {!m.loading && (
                <div className={styles.msgActions}>
                  <Dropdown
                    menu={{ items: buildMessageMenuItems(m) }}
                    trigger={['click']}
                    placement={m.role === 'user' ? 'topRight' : 'topLeft'}
                  >
                    <button
                      type="button"
                      className={styles.msgActionBtn}
                      aria-label="消息操作"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </Dropdown>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ===== 输入区 ===== */}
      <div className={styles.inputArea}>
        <textarea
          className={styles.textarea}
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentCharacter ? '输入消息...' : '请先选择角色卡'}
          rows={1}
          disabled={isGenerating}
        />
        {isGenerating ? (
          <button
            type="button"
            className={styles.stopBtn}
            onClick={stopGenerating}
            aria-label="停止生成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!inputDraft.trim() || !currentCharacter}
            aria-label="发送"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* ===== 角色选择弹窗 ===== */}
      <Modal
        open={charModalOpen}
        title="选择角色卡"
        onCancel={() => setCharModalOpen(false)}
        footer={null}
        width="90%"
      >
        {characters.length === 0 ? (
          <Empty description="还没有角色卡，请先到角色页面创建或导入" />
        ) : (
          <div className={styles.charModalList}>
            {characters.map((character) => (
              <button
                key={character.uuid}
                type="button"
                className={`${styles.charModalItem} ${
                  currentCharacter?.uuid === character.uuid ? 'active' : ''
                }`}
                onClick={() => handleSelectCharacter(character)}
              >
                <div className={styles.charAvatar}>
                  {character.avatar ? (
                    <img src={character.avatar} alt={character.name} />
                  ) : (
                    getInitial(character.name)
                  )}
                </div>
                <div className={styles.charModalInfo}>
                  <span className={styles.charModalName}>{character.name}</span>
                  <span className={styles.charModalDesc}>
                    {character.description || '暂无描述'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* ===== 编辑消息弹窗 ===== */}
      <Modal
        open={!!editingMsg}
        title="编辑消息"
        onOk={handleSaveEdit}
        onCancel={() => {
          setEditingMsg(null);
          setEditContent('');
        }}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div className={styles.editTextarea}>
          <Input.TextArea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="编辑消息内容..."
            rows={6}
            autoFocus
          />
        </div>
      </Modal>

      {/* ===== 删除确认弹窗 ===== */}
      <Modal
        open={!!deletingMsgId}
        title="确认删除"
        onOk={handleConfirmDelete}
        onCancel={() => setDeletingMsgId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这条消息吗？此操作不可撤销。</p>
      </Modal>
    </div>
  );
}
