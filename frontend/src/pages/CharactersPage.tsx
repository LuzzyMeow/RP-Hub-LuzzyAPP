import { useEffect, useState, useRef, useMemo, type ChangeEvent } from 'react';
import { createStyles } from 'antd-style';
import { Input, Modal, message, Tag } from 'antd';
import { useCharacterStore } from '@/store/useCharacterStore';
import { useChatStore } from '@/store/useChatStore';
import type { Character } from '@/types';

const useStyles = createStyles(({ css }) => ({
  page: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `,
  scroll: css`
    flex: 1;
    overflow-y: auto;
    padding: var(--luzzy-spacing-md);
    -webkit-overflow-scrolling: touch;
  `,
  searchWrap: css`
    margin-bottom: var(--luzzy-spacing-md);
  `,
  search: css`
    .ant-input-affix-wrapper,
    .ant-input {
      background: var(--luzzy-surface-container) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-full) !important;
      min-height: 44px;
    }
  `,
  toolbar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--luzzy-spacing-md);
    gap: var(--luzzy-spacing-sm);
  `,
  count: css`
    font-size: 13px;
    color: var(--luzzy-on-surface-variant);
    flex-shrink: 0;
  `,
  toolbarActions: css`
    display: flex;
    gap: var(--luzzy-spacing-xs);
    flex-shrink: 0;
  `,
  iconBtn: css`
    min-width: 40px;
    min-height: 40px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-surface-container);
    color: var(--luzzy-on-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--luzzy-transition);

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  addBtn: css`
    padding: 8px 16px;
    min-height: 40px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-primary);
    color: var(--luzzy-on-primary);
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 4px;

    &:active {
      background: var(--luzzy-primary-active);
    }
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--luzzy-spacing-md);
  `,
  card: css`
    position: relative;
    background: var(--luzzy-surface-container);
    border-radius: var(--luzzy-radius-md);
    padding: var(--luzzy-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-sm);
    transition: all var(--luzzy-transition);
    border: 2px solid transparent;

    &.active {
      border-color: var(--luzzy-primary);
    }

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  cardHeader: css`
    display: flex;
    align-items: flex-start;
    gap: var(--luzzy-spacing-sm);
  `,
  avatar: css`
    width: 48px;
    height: 48px;
    border-radius: var(--luzzy-radius-full);
    background: var(--luzzy-primary-container);
    color: var(--luzzy-on-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  cardInfo: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  name: css`
    font-size: 15px;
    font-weight: 600;
    color: var(--luzzy-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  creator: css`
    font-size: 11px;
    color: var(--luzzy-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  desc: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 33px;
  `,
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  cardFooter: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
  `,
  favBtn: css`
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface-variant);
    border-radius: var(--luzzy-radius-full);

    &.active {
      color: #ffa726;
    }

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  cardActions: css`
    display: flex;
    gap: 4px;
  `,
  actionBtn: css`
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface-variant);
    border-radius: var(--luzzy-radius-sm);

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  empty: css`
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
    font-size: 16px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
  `,
  emptyDesc: css`
    font-size: 13px;
    line-height: 1.5;
  `,
  fileInput: css`
    display: none;
  `,
  editorForm: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 60vh;
    overflow-y: auto;

    .ant-input,
    .ant-input-affix-wrapper {
      background: var(--luzzy-surface-container-high) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-sm) !important;
    }
  `,
  formItem: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  formLabel: css`
    font-size: 13px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
  `,
}));

/** 角色卡编辑表单状态 */
interface CharacterForm {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  mesExample: string;
  alternateGreetings: string;
  tags: string;
  creator: string;
  characterVersion: string;
}

/** 将角色卡转换为表单数据 */
const characterToForm = (c: Character): CharacterForm => ({
  name: c.name,
  description: c.description,
  personality: c.personality,
  scenario: c.scenario,
  firstMessage: c.firstMessage,
  mesExample: c.mesExample,
  alternateGreetings: c.alternateGreetings.join('\n---\n'),
  tags: c.tags.join(', '),
  creator: c.creator,
  characterVersion: c.characterVersion,
});

/** 创建空表单 */
const createEmptyForm = (): CharacterForm => ({
  name: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  mesExample: '',
  alternateGreetings: '',
  tags: '',
  creator: '',
  characterVersion: '1.0',
});

/** 将表单数据转换回角色卡部分字段 */
const formToPartial = (form: CharacterForm): Partial<Character> => ({
  name: form.name.trim() || '未命名角色',
  description: form.description,
  personality: form.personality,
  scenario: form.scenario,
  firstMessage: form.firstMessage,
  mesExample: form.mesExample,
  alternateGreetings: form.alternateGreetings
    .split('\n---\n')
    .map((s) => s.trim())
    .filter(Boolean),
  tags: form.tags
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean),
  creator: form.creator,
  characterVersion: form.characterVersion || '1.0',
});

export function CharactersPage() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();

  const characters = useCharacterStore((s) => s.characters);
  const currentCharacterUuid = useCharacterStore((s) => s.currentCharacterUuid);
  const searchQuery = useCharacterStore((s) => s.searchQuery);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);
  const addCharacter = useCharacterStore((s) => s.addCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);
  const setCurrentCharacter = useCharacterStore((s) => s.setCurrentCharacter);
  const toggleFavorite = useCharacterStore((s) => s.toggleFavorite);
  const searchCharacters = useCharacterStore((s) => s.searchCharacters);
  const getFilteredCharacters = useCharacterStore((s) => s.getFilteredCharacters);
  const importCharacter = useCharacterStore((s) => s.importCharacter);
  const exportCharacter = useCharacterStore((s) => s.exportCharacter);

  const setCurrentChatCharacter = useChatStore((s) => s.setCurrentCharacter);
  const loadChatHistory = useChatStore((s) => s.loadChatHistory);

  // 编辑弹窗状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterForm>(createEmptyForm());

  // 删除确认弹窗
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null);

  // 文件导入 input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 初次挂载加载角色卡 */
  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  /** 过滤后的角色卡列表 */
  const filteredCharacters = useMemo(
    () => getFilteredCharacters(),
    [getFilteredCharacters, characters, searchQuery],
  );

  /** 处理搜索 */
  const handleSearch = (value: string): void => {
    searchCharacters(value);
  };

  /** 点击角色卡切换为当前角色 */
  const handleSelectCharacter = (character: Character): void => {
    setCurrentCharacter(character.uuid);
    setCurrentChatCharacter(character);
    void loadChatHistory(character.uuid).then(() => {
      messageApi.success(`已切换到 ${character.name}`);
    });
  };

  /** 切换收藏 */
  const handleToggleFavorite = (character: Character): void => {
    void toggleFavorite(character.uuid);
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingUuid(null);
    setForm(createEmptyForm());
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (character: Character): void => {
    setEditingUuid(character.uuid);
    setForm(characterToForm(character));
    setEditorOpen(true);
  };

  /** 保存角色卡（新建或更新） */
  const handleSave = (): void => {
    if (!form.name.trim()) {
      messageApi.error('角色名不能为空');
      return;
    }
    const partial = formToPartial(form);
    if (editingUuid) {
      void updateCharacter(editingUuid, partial).then(() => {
        messageApi.success('角色卡已更新');
        setEditorOpen(false);
      });
    } else {
      const now = Date.now();
      const newCharacter: Character = {
        id: '',
        uuid: '',
        name: '未命名角色',
        description: '',
        personality: '',
        scenario: '',
        firstMessage: '',
        mesExample: '',
        alternateGreetings: [],
        tags: [],
        creator: '',
        characterVersion: '1.0',
        createdAt: now,
        updatedAt: now,
        favorite: false,
        ...partial,
      };
      void addCharacter(newCharacter).then(() => {
        messageApi.success('角色卡已创建');
        setEditorOpen(false);
      });
    }
  };

  /** 确认删除角色卡 */
  const handleConfirmDelete = (): void => {
    if (!deleteUuid) return;
    void deleteCharacter(deleteUuid).then(() => {
      messageApi.success('角色卡已删除');
      setDeleteUuid(null);
    });
  };

  /** 触发文件导入 */
  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  /** 处理文件导入 */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        void importCharacter(text)
          .then(() => {
            messageApi.success('角色卡导入成功');
          })
          .catch((err) => {
            messageApi.error(err instanceof Error ? err.message : '导入失败');
          });
      } catch (err) {
        messageApi.error(err instanceof Error ? err.message : '导入失败');
      }
    };
    reader.onerror = () => {
      messageApi.error('文件读取失败');
    };
    reader.readAsText(file);
    // 重置 input 以便重复选择同一文件
    e.target.value = '';
  };

  /** 导出角色卡 */
  const handleExport = (character: Character): void => {
    try {
      const json = exportCharacter(character.uuid);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${character.name || 'character'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      messageApi.success('角色卡已导出');
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : '导出失败');
    }
  };

  /** 获取角色卡首字母用于头像占位 */
  const getInitial = (name: string): string => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className={styles.page}>
      {contextHolder}
      <div className={styles.scroll}>
        {/* 搜索栏 */}
        <div className={styles.searchWrap}>
          <div className={styles.search}>
            <Input.Search
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索角色名、描述或标签..."
              allowClear
              enterButton={false}
            />
          </div>
        </div>

        {/* 工具栏 */}
        <div className={styles.toolbar}>
          <span className={styles.count}>共 {characters.length} 个角色</span>
          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handleImportClick}
              aria-label="导入角色卡"
              title="导入角色卡"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.addBtn}
              onClick={handleOpenCreate}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建
            </button>
          </div>
        </div>

        {/* 角色卡网格 */}
        {filteredCharacters.length === 0 ? (
          <div className={styles.empty}>
            {characters.length === 0 ? (
              <>
                <div className={styles.emptyTitle}>还没有角色卡</div>
                <div className={styles.emptyDesc}>
                  点击右上角"新建"创建你的第一个角色，<br />
                  或点击导入按钮从 JSON 文件导入
                </div>
              </>
            ) : (
              <>
                <div className={styles.emptyTitle}>未找到匹配的角色</div>
                <div className={styles.emptyDesc}>尝试更换搜索关键词</div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredCharacters.map((character) => (
              <div
                key={character.uuid}
                className={`${styles.card} ${
                  currentCharacterUuid === character.uuid ? 'active' : ''
                }`}
                onClick={() => handleSelectCharacter(character)}
              >
                <div className={styles.cardHeader}>
                  <div className={styles.avatar}>
                    {character.avatar ? (
                      <img src={character.avatar} alt={character.name} />
                    ) : (
                      getInitial(character.name)
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.name}>{character.name}</span>
                    {character.creator && (
                      <span className={styles.creator}>by {character.creator}</span>
                    )}
                  </div>
                </div>

                <div className={styles.desc}>
                  {character.description || '暂无描述'}
                </div>

                {character.tags.length > 0 && (
                  <div className={styles.tags}>
                    {character.tags.slice(0, 3).map((tag) => (
                      <Tag key={tag} style={{ fontSize: 11, margin: 0 }}>
                        {tag}
                      </Tag>
                    ))}
                    {character.tags.length > 3 && (
                      <Tag style={{ fontSize: 11, margin: 0 }}>
                        +{character.tags.length - 3}
                      </Tag>
                    )}
                  </div>
                )}

                <div className={styles.cardFooter}>
                  <button
                    type="button"
                    className={`${styles.favBtn} ${
                      character.favorite ? 'active' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(character);
                    }}
                    aria-label="收藏"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill={character.favorite ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(character);
                      }}
                      aria-label="编辑"
                      title="编辑"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(character);
                      }}
                      aria-label="导出"
                      title="导出"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteUuid(character.uuid);
                      }}
                      aria-label="删除"
                      title="删除"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className={styles.fileInput}
          onChange={handleFileChange}
        />
      </div>

      {/* 编辑/新建弹窗 */}
      <Modal
        open={editorOpen}
        title={editingUuid ? '编辑角色卡' : '新建角色卡'}
        onOk={handleSave}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div className={styles.editorForm}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>角色名 *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="角色名称"
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>描述</label>
            <Input.TextArea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="角色的简要描述"
              rows={2}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>人设 / 性格</label>
            <Input.TextArea
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
              placeholder="角色的性格特征、背景设定等"
              rows={3}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>场景</label>
            <Input.TextArea
              value={form.scenario}
              onChange={(e) => setForm({ ...form, scenario: e.target.value })}
              placeholder="对话发生的场景描述"
              rows={2}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>开场白</label>
            <Input.TextArea
              value={form.firstMessage}
              onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
              placeholder="角色的第一条消息"
              rows={3}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>对话示例</label>
            <Input.TextArea
              value={form.mesExample}
              onChange={(e) => setForm({ ...form, mesExample: e.target.value })}
              placeholder={`<START>\n{{user}}: 你好\n{{char}}: 你好呀`}
              rows={4}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>备选开场白（用 --- 分隔）</label>
            <Input.TextArea
              value={form.alternateGreetings}
              onChange={(e) => setForm({ ...form, alternateGreetings: e.target.value })}
              placeholder="备选开场白1\n---\n备选开场白2"
              rows={3}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>标签（逗号分隔）</label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="原创, 二次元, ..."
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>创作者</label>
            <Input
              value={form.creator}
              onChange={(e) => setForm({ ...form, creator: e.target.value })}
              placeholder="创作者名称"
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>版本号</label>
            <Input
              value={form.characterVersion}
              onChange={(e) => setForm({ ...form, characterVersion: e.target.value })}
              placeholder="1.0"
            />
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        open={!!deleteUuid}
        title="确认删除"
        onOk={handleConfirmDelete}
        onCancel={() => setDeleteUuid(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个角色卡吗？此操作不可撤销，相关聊天记录也将被清除。</p>
      </Modal>
    </div>
  );
}
