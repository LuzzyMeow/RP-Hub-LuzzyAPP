import { useEffect, useState } from 'react';
import { createStyles } from 'antd-style';
import { Input, Switch, Button, Modal, message, Tag, Divider } from 'antd';
import { Markdown } from '@lobehub/ui';
import { v4 as uuidv4 } from 'uuid';
import type {
  Preset,
  WorldInfoEntry,
  RegexScript,
  UiTemplate,
  MemorySettings,
  GlobalMemory,
} from '@/types';
import { getItem, setItem } from '@/services/storage';
import { BUILTIN_PRESET_DEFAULTS, BUILTIN_PRESET_NAME_SET } from '@/services/presetContent';

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
  list: css`
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-sm);
  `,
  item: css`
    background: var(--luzzy-surface-container);
    border-radius: var(--luzzy-radius-md);
    overflow: hidden;
    transition: background var(--luzzy-transition);
  `,
  itemHeader: css`
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-md);
    padding: var(--luzzy-spacing-md);
    min-height: 44px;
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;

    &:active {
      background: var(--luzzy-surface-container-high);
    }
  `,
  icon: css`
    width: 44px;
    height: 44px;
    border-radius: var(--luzzy-radius-sm);
    background: var(--luzzy-primary-container);
    color: var(--luzzy-on-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `,
  info: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  `,
  label: css`
    font-size: 15px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
  `,
  desc: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    line-height: 1.4;
  `,
  arrow: css`
    flex-shrink: 0;
    color: var(--luzzy-outline);
    transition: transform var(--luzzy-transition);

    &.expanded {
      transform: rotate(90deg);
    }
  `,
  panel: css`
    padding: var(--luzzy-spacing-md);
    border-top: 1px solid var(--luzzy-outline-variant);
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-sm);
  `,
  sectionTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: var(--luzzy-primary);
    margin-bottom: var(--luzzy-spacing-xs);
    padding-left: var(--luzzy-spacing-xs);
    letter-spacing: 0.3px;
  `,
  group: css`
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-md);
    overflow: hidden;
  `,
  row: css`
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-xs);
    padding: var(--luzzy-spacing-md);
    border-bottom: 1px solid var(--luzzy-outline-variant);

    &:last-child {
      border-bottom: none;
    }
  `,
  rowInline: css`
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--luzzy-spacing-md);
    min-height: 44px;
  `,
  label2: css`
    font-size: 14px;
    color: var(--luzzy-on-surface);
    font-weight: 500;
  `,
  desc2: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    line-height: 1.4;
  `,
  input: css`
    .ant-input,
    .ant-input-affix-wrapper,
    .ant-select .ant-select-selector {
      background: var(--luzzy-surface-container-high) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-sm) !important;
      min-height: 44px;
    }
  `,
  textarea: css`
    .ant-input {
      background: var(--luzzy-surface-container-high) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-sm) !important;
      min-height: 80px;
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      font-size: 12px;
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
  hint: css`
    color: var(--luzzy-on-surface-variant);
    font-size: 12px;
    line-height: 1.5;
  `,
  cardItem: css`
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-sm);
    padding: var(--luzzy-spacing-sm) var(--luzzy-spacing-md);
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  cardHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--luzzy-spacing-sm);
    min-height: 36px;
  `,
  cardName: css`
    font-size: 14px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  `,
  cardActions: css`
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  `,
  actionBtn: css`
    min-width: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--luzzy-on-surface-variant);
    border-radius: var(--luzzy-radius-sm);
    background: transparent;
    border: none;
    cursor: pointer;

    &:active {
      background: var(--luzzy-surface-container);
    }
  `,
  empty: css`
    padding: var(--luzzy-spacing-md);
    text-align: center;
    color: var(--luzzy-on-surface-variant);
    font-size: 13px;
  `,
  aboutText: css`
    color: var(--luzzy-on-surface-variant);
    font-size: 13px;
    line-height: 1.6;
    padding: var(--luzzy-spacing-md);
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-md);
  `,
  brand: css`
    text-align: center;
    padding: var(--luzzy-spacing-lg) 0;
    color: var(--luzzy-on-surface-variant);
    font-size: 12px;
  `,
  brandName: css`
    font-size: 18px;
    font-weight: 700;
    color: var(--luzzy-primary);
    letter-spacing: 2px;
    margin-bottom: 4px;
  `,
}));

/** 菜单项 key 类型 */
type MenuKey =
  | 'memory'
  | 'preset'
  | 'worldbook'
  | 'regex'
  | 'ui-template'
  | 'trpg'
  | 'card-generator'
  | 'about';

/** 菜单项配置 */
interface MenuItemConfig {
  key: MenuKey;
  label: string;
  description: string;
  icon: string;
}

/** 菜单项列表 */
const MENU_ITEMS: MenuItemConfig[] = [
  { key: 'memory', label: '记忆', description: '管理长期记忆与上下文摘要', icon: 'memory' },
  { key: 'preset', label: '预设', description: '系统提示词与预设模板管理', icon: 'preset' },
  { key: 'worldbook', label: '世界书', description: '世界观设定与词条触发管理', icon: 'worldbook' },
  { key: 'regex', label: '正则', description: '正则替换脚本与文本处理', icon: 'regex' },
  { key: 'ui-template', label: 'UI 模板', description: '自定义消息渲染模板', icon: 'ui' },
  { key: 'trpg', label: 'TRPG', description: '桌面角色扮演游戏辅助工具', icon: 'trpg' },
  { key: 'card-generator', label: '角色卡生成器', description: 'AI 辅助生成角色卡', icon: 'generator' },
  { key: 'about', label: '关于 LUZZY', description: '应用信息与帮助', icon: 'about' },
];

/** 默认记忆设置 */
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

export function MorePage() {
  const { styles } = useStyles();
  const [expandedKey, setExpandedKey] = useState<MenuKey | null>(null);

  /** 切换展开项 */
  const handleToggle = (key: MenuKey): void => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  return (
    <div className={styles.page}>
      <div className={styles.scroll}>
        <div className={styles.list}>
          {MENU_ITEMS.map((item) => (
            <div key={item.key} className={styles.item}>
              <button
                type="button"
                className={styles.itemHeader}
                onClick={() => handleToggle(item.key)}
                aria-expanded={expandedKey === item.key}
              >
                <span className={styles.icon}>
                  <MenuIcon name={item.icon} />
                </span>
                <span className={styles.info}>
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.desc}>{item.description}</span>
                </span>
                <span className={`${styles.arrow} ${expandedKey === item.key ? 'expanded' : ''}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </button>
              {expandedKey === item.key && (
                <div className={styles.panel}>
                  {item.key === 'memory' && <MemoryPanel />}
                  {item.key === 'preset' && <PresetPanel />}
                  {item.key === 'worldbook' && <WorldInfoPanel />}
                  {item.key === 'regex' && <RegexPanel />}
                  {item.key === 'ui-template' && <UiTemplatePanel />}
                  {item.key === 'trpg' && <TrpgPanel />}
                  {item.key === 'card-generator' && <CardGeneratorPanel />}
                  {item.key === 'about' && <AboutPanel />}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 记忆面板
// ============================================================================

function MemoryPanel() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_MEMORY_SETTINGS);
  const [globalMemory, setGlobalMemory] = useState<GlobalMemory>({ content: '', updatedAt: 0 });

  useEffect(() => {
    void loadMemory();
  }, []);

  /** 加载记忆设置与全局记忆 */
  const loadMemory = async (): Promise<void> => {
    try {
      const [memSettings, gMemory] = await Promise.all([
        getItem<MemorySettings>('settings', 'memorySettings'),
        getItem<GlobalMemory>('memory', 'globalMemory'),
      ]);
      if (memSettings) setSettings({ ...DEFAULT_MEMORY_SETTINGS, ...memSettings });
      if (gMemory) setGlobalMemory(gMemory);
    } catch (e) {
      console.error('[MemoryPanel] 加载失败:', e);
    }
  };

  /** 保存记忆设置 */
  const handleSaveSettings = async (): Promise<void> => {
    try {
      await setItem('settings', 'memorySettings', settings);
      messageApi.success('记忆设置已保存');
    } catch (e) {
      messageApi.error('保存失败');
    }
  };

  /** 保存全局记忆 */
  const handleSaveGlobalMemory = async (): Promise<void> => {
    try {
      const updated: GlobalMemory = { ...globalMemory, updatedAt: Date.now() };
      setGlobalMemory(updated);
      await setItem('memory', 'globalMemory', updated);
      messageApi.success('全局记忆已保存');
    } catch (e) {
      messageApi.error('保存失败');
    }
  };

  /** 更新设置字段 */
  const updateField = <K extends keyof MemorySettings>(key: K, value: MemorySettings[K]): void => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      {contextHolder}
      <div className={styles.sectionTitle}>记忆设置</div>
      <div className={styles.group}>
        <div className={`${styles.row} ${styles.rowInline}`}>
          <div>
            <div className={styles.label2}>启用记忆系统</div>
            <div className={styles.desc2}>自动提取与召回对话记忆</div>
          </div>
          <Switch
            checked={settings.enabled}
            onChange={(v) => updateField('enabled', v)}
          />
        </div>
        <div className={styles.row}>
          <label className={styles.formLabel}>嵌入模型名</label>
          <span className={styles.desc2}>用于向量化的嵌入模型（格式: providerId_model_name）</span>
          <div className={styles.input}>
            <Input
              value={settings.embeddingModel}
              onChange={(e) => updateField('embeddingModel', e.target.value)}
              placeholder="sta1n_doubao-embedding-text-240715"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className={styles.row}>
          <label className={styles.formLabel}>最大记忆数量</label>
          <div className={styles.input}>
            <Input
              type="number"
              min={10}
              max={1000}
              value={settings.maxMemories}
              onChange={(e) => {
                const num = Number(e.target.value);
                updateField('maxMemories', Number.isFinite(num) ? Math.max(10, Math.min(1000, Math.round(num))) : 100);
              }}
            />
          </div>
        </div>
        <div className={styles.row}>
          <label className={styles.formLabel}>召回深度（最近 N 楼不召回）</label>
          <div className={styles.input}>
            <Input
              type="number"
              min={0}
              max={50}
              value={settings.recallDepth}
              onChange={(e) => {
                const num = Number(e.target.value);
                updateField('recallDepth', Number.isFinite(num) ? Math.max(0, Math.min(50, Math.round(num))) : 10);
              }}
            />
          </div>
        </div>
        <div className={styles.row}>
          <label className={styles.formLabel}>向量 TopK</label>
          <div className={styles.input}>
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.vectorTopK}
              onChange={(e) => {
                const num = Number(e.target.value);
                updateField('vectorTopK', Number.isFinite(num) ? Math.max(1, Math.min(20, Math.round(num))) : 5);
              }}
            />
          </div>
        </div>
        <div className={styles.row}>
          <label className={styles.formLabel}>相似度阈值</label>
          <div className={styles.input}>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.similarityThreshold}
              onChange={(e) => {
                const num = Number(e.target.value);
                updateField('similarityThreshold', Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0.7);
              }}
            />
          </div>
        </div>
        <div className={`${styles.row} ${styles.rowInline}`}>
          <div>
            <div className={styles.label2}>启用压缩</div>
            <div className={styles.desc2}>有向量记忆覆盖时移除原始上下文</div>
          </div>
          <Switch
            checked={settings.compressionEnabled}
            onChange={(v) => updateField('compressionEnabled', v)}
          />
        </div>
        <div className={styles.row}>
          <Button htmlType="button" block onClick={() => void handleSaveSettings()} style={{ minHeight: 44 }}>
            保存记忆设置
          </Button>
        </div>
      </div>

      <div className={styles.sectionTitle} style={{ marginTop: 16 }}>全局记忆（MEMORY.md）</div>
      <div className={styles.group}>
        <div className={styles.row}>
          <span className={styles.desc2}>全局记忆会注入到每次对话的系统提示词中</span>
          <div className={styles.textarea}>
            <Input.TextArea
              value={globalMemory.content}
              onChange={(e) => setGlobalMemory({ ...globalMemory, content: e.target.value })}
              placeholder="输入全局记忆内容..."
              rows={6}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {globalMemory.updatedAt > 0 && (
            <span className={styles.hint}>
              最后更新: {new Date(globalMemory.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className={styles.row}>
          <Button htmlType="button" block onClick={() => void handleSaveGlobalMemory()} style={{ minHeight: 44 }}>
            保存全局记忆
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 预设面板
// ============================================================================

/** 预设编辑表单 */
interface PresetForm {
  name: string;
  content: string;
}

function PresetPanel() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PresetForm>({ name: '', content: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadPresets();
  }, []);

  /** 加载预设列表，若为空则初始化内置预设 */
  const loadPresets = async (): Promise<void> => {
    try {
      const data = await getItem<Preset[]>('presets', 'presets');
      if (Array.isArray(data) && data.length > 0) {
        setPresets(data);
      } else {
        // 初始化内置预设
        const now = Date.now();
        const builtin: Preset[] = BUILTIN_PRESET_DEFAULTS.map((p, i) => ({
          id: `builtin-${i}`,
          name: p.name,
          content: p.content,
          isBuiltin: true,
          createdAt: now,
          updatedAt: now,
        }));
        setPresets(builtin);
        await setItem('presets', 'presets', builtin);
      }
    } catch (e) {
      console.error('[PresetPanel] 加载失败:', e);
    }
  };

  /** 保存预设列表 */
  const savePresets = async (list: Preset[]): Promise<void> => {
    try {
      await setItem('presets', 'presets', list);
    } catch (e) {
      console.error('[PresetPanel] 保存失败:', e);
      messageApi.error('保存失败');
      throw e;
    }
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingId(null);
    setForm({ name: '', content: '' });
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (preset: Preset): void => {
    setEditingId(preset.id);
    setForm({ name: preset.name, content: preset.content });
    setEditorOpen(true);
  };

  /** 保存预设 */
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      messageApi.error('预设名称不能为空');
      return;
    }
    if (editingId) {
      const updated = presets.map((p) =>
        p.id === editingId
          ? { ...p, name: form.name.trim(), content: form.content, updatedAt: Date.now() }
          : p,
      );
      setPresets(updated);
      await savePresets(updated);
      messageApi.success('预设已更新');
    } else {
      const now = Date.now();
      const newPreset: Preset = {
        id: uuidv4(),
        name: form.name.trim(),
        content: form.content,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...presets, newPreset];
      setPresets(updated);
      await savePresets(updated);
      messageApi.success('预设已创建');
    }
    setEditorOpen(false);
  };

  /** 确认删除 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    const target = presets.find((p) => p.id === deleteId);
    if (target?.isBuiltin && BUILTIN_PRESET_NAME_SET.has(target.name)) {
      messageApi.error('内置预设不可删除');
      setDeleteId(null);
      return;
    }
    const updated = presets.filter((p) => p.id !== deleteId);
    setPresets(updated);
    await savePresets(updated);
    messageApi.success('预设已删除');
    setDeleteId(null);
  };

  return (
    <div>
      {contextHolder}
      <div className={styles.sectionTitle}>预设列表</div>
      <div className={styles.group}>
        {presets.length === 0 ? (
          <div className={styles.empty}>暂无预设</div>
        ) : (
          presets.map((preset) => (
            <div key={preset.id} className={styles.cardItem}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{preset.name}</span>
                <div className={styles.cardActions}>
                  {preset.isBuiltin && (
                    <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>内置</Tag>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleOpenEdit(preset)}
                    aria-label="编辑"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {!preset.isBuiltin && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setDeleteId(preset.id)}
                      aria-label="删除"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div className={styles.row}>
          <Button htmlType="button" block onClick={handleOpenCreate} style={{ minHeight: 44 }}>
            + 新建预设
          </Button>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={editingId ? '编辑预设' : '新建预设'}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>预设名称 *</label>
            <div className={styles.input}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如: 我的预设"
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>预设内容</label>
            <div className={styles.textarea}>
              <Input.TextArea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="预设的系统提示词内容..."
                rows={10}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        title="确认删除"
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个预设吗？此操作不可撤销。</p>
      </Modal>
    </div>
  );
}

// ============================================================================
// 世界书面板
// ============================================================================

/** 世界书编辑表单 */
interface WorldInfoForm {
  keys: string;
  content: string;
  enabled: boolean;
  constant: boolean;
  order: number;
  position: number;
  depth: number;
  probability: number;
}

function WorldInfoPanel() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();
  const [entries, setEntries] = useState<WorldInfoEntry[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorldInfoForm>({
    keys: '',
    content: '',
    enabled: true,
    constant: false,
    order: 100,
    position: 0,
    depth: 4,
    probability: 100,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadEntries();
  }, []);

  /** 加载世界书条目 */
  const loadEntries = async (): Promise<void> => {
    try {
      const data = await getItem<WorldInfoEntry[]>('worldInfo', 'worldInfo');
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[WorldInfoPanel] 加载失败:', e);
    }
  };

  /** 保存世界书条目 */
  const saveEntries = async (list: WorldInfoEntry[]): Promise<void> => {
    try {
      await setItem('worldInfo', 'worldInfo', list);
    } catch (e) {
      console.error('[WorldInfoPanel] 保存失败:', e);
      messageApi.error('保存失败');
      throw e;
    }
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingId(null);
    setForm({
      keys: '',
      content: '',
      enabled: true,
      constant: false,
      order: 100,
      position: 0,
      depth: 4,
      probability: 100,
    });
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (entry: WorldInfoEntry): void => {
    setEditingId(entry.id);
    setForm({
      keys: entry.keys.join(', '),
      content: entry.content,
      enabled: entry.enabled,
      constant: entry.constant,
      order: entry.order,
      position: entry.position,
      depth: entry.depth,
      probability: entry.probability,
    });
    setEditorOpen(true);
  };

  /** 保存条目 */
  const handleSave = async (): Promise<void> => {
    if (!form.keys.trim()) {
      messageApi.error('关键词不能为空');
      return;
    }
    const keys = form.keys.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
    if (editingId) {
      const updated = entries.map((e) =>
        e.id === editingId
          ? {
              ...e,
              keys,
              content: form.content,
              enabled: form.enabled,
              constant: form.constant,
              order: form.order,
              position: form.position,
              depth: form.depth,
              probability: form.probability,
            }
          : e,
      );
      setEntries(updated);
      await saveEntries(updated);
      messageApi.success('世界书条目已更新');
    } else {
      const newEntry: WorldInfoEntry = {
        id: uuidv4(),
        keys,
        content: form.content,
        enabled: form.enabled,
        constant: form.constant,
        order: form.order,
        position: form.position,
        depth: form.depth,
        probability: form.probability,
      };
      const updated = [...entries, newEntry];
      setEntries(updated);
      await saveEntries(updated);
      messageApi.success('世界书条目已创建');
    }
    setEditorOpen(false);
  };

  /** 确认删除 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    const updated = entries.filter((e) => e.id !== deleteId);
    setEntries(updated);
    await saveEntries(updated);
    messageApi.success('世界书条目已删除');
    setDeleteId(null);
  };

  return (
    <div>
      {contextHolder}
      <div className={styles.sectionTitle}>世界书条目</div>
      <div className={styles.group}>
        {entries.length === 0 ? (
          <div className={styles.empty}>暂无世界书条目</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={styles.cardItem}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>
                  {entry.keys.join(', ') || '(无关键词)'}
                </span>
                <div className={styles.cardActions}>
                  {entry.constant && <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>常驻</Tag>}
                  {entry.enabled ? (
                    <Tag color="green" style={{ fontSize: 11, margin: 0 }}>启用</Tag>
                  ) : (
                    <Tag style={{ fontSize: 11, margin: 0 }}>禁用</Tag>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleOpenEdit(entry)}
                    aria-label="编辑"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setDeleteId(entry.id)}
                    aria-label="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
              {entry.content && (
                <span className={styles.hint} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.content.slice(0, 60)}
                </span>
              )}
            </div>
          ))
        )}
        <div className={styles.row}>
          <Button htmlType="button" block onClick={handleOpenCreate} style={{ minHeight: 44 }}>
            + 新建条目
          </Button>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={editingId ? '编辑世界书条目' : '新建世界书条目'}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>关键词（逗号分隔）*</label>
            <div className={styles.input}>
              <Input
                value={form.keys}
                onChange={(e) => setForm({ ...form, keys: e.target.value })}
                placeholder="关键词1, 关键词2"
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>内容</label>
            <div className={styles.textarea}>
              <Input.TextArea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="条目内容..."
                rows={6}
              />
            </div>
          </div>
          <div className={`${styles.rowInline}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={styles.label2}>启用</span>
            <Switch
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>
          <div className={`${styles.rowInline}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={styles.label2}>常驻（无需关键词触发）</span>
            <Switch
              checked={form.constant}
              onChange={(v) => setForm({ ...form, constant: v })}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>优先级（order）</label>
            <div className={styles.input}>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>位置（position）</label>
            <div className={styles.input}>
              <Input
                type="number"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>深度（depth）</label>
            <div className={styles.input}>
              <Input
                type="number"
                value={form.depth}
                onChange={(e) => setForm({ ...form, depth: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>触发概率（0-100）</label>
            <div className={styles.input}>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.probability}
                onChange={(e) => setForm({ ...form, probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        title="确认删除"
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个世界书条目吗？</p>
      </Modal>
    </div>
  );
}

// ============================================================================
// 正则脚正面板
// ============================================================================

/** 正则脚本编辑表单 */
interface RegexForm {
  name: string;
  findRegex: string;
  replaceString: string;
  enabled: boolean;
  placement: number;
  mode: number;
  depth: number;
}

function RegexPanel() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();
  const [scripts, setScripts] = useState<RegexScript[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RegexForm>({
    name: '',
    findRegex: '',
    replaceString: '',
    enabled: true,
    placement: 2,
    mode: 0,
    depth: 0,
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadScripts();
  }, []);

  /** 加载正则脚本 */
  const loadScripts = async (): Promise<void> => {
    try {
      const data = await getItem<RegexScript[]>('regexScripts', 'regexScripts');
      setScripts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[RegexPanel] 加载失败:', e);
    }
  };

  /** 保存正则脚本 */
  const saveScripts = async (list: RegexScript[]): Promise<void> => {
    try {
      await setItem('regexScripts', 'regexScripts', list);
    } catch (e) {
      console.error('[RegexPanel] 保存失败:', e);
      messageApi.error('保存失败');
      throw e;
    }
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingId(null);
    setForm({ name: '', findRegex: '', replaceString: '', enabled: true, placement: 2, mode: 0, depth: 0 });
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (script: RegexScript): void => {
    setEditingId(script.id);
    setForm({
      name: script.name,
      findRegex: script.findRegex,
      replaceString: script.replaceString,
      enabled: script.enabled,
      placement: script.placement,
      mode: script.mode,
      depth: script.depth,
    });
    setEditorOpen(true);
  };

  /** 保存脚本 */
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      messageApi.error('脚本名称不能为空');
      return;
    }
    if (!form.findRegex.trim()) {
      messageApi.error('查找正则不能为空');
      return;
    }
    // 验证正则有效性
    try {
      new RegExp(form.findRegex);
    } catch (e) {
      messageApi.error('正则表达式无效: ' + (e instanceof Error ? e.message : ''));
      return;
    }
    if (editingId) {
      const updated = scripts.map((s) =>
        s.id === editingId
          ? { ...s, name: form.name.trim(), findRegex: form.findRegex, replaceString: form.replaceString, enabled: form.enabled, placement: form.placement, mode: form.mode, depth: form.depth }
          : s,
      );
      setScripts(updated);
      await saveScripts(updated);
      messageApi.success('正则脚本已更新');
    } else {
      const newScript: RegexScript = {
        id: uuidv4(),
        name: form.name.trim(),
        findRegex: form.findRegex,
        replaceString: form.replaceString,
        enabled: form.enabled,
        placement: form.placement,
        mode: form.mode,
        depth: form.depth,
      };
      const updated = [...scripts, newScript];
      setScripts(updated);
      await saveScripts(updated);
      messageApi.success('正则脚本已创建');
    }
    setEditorOpen(false);
  };

  /** 确认删除 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    const updated = scripts.filter((s) => s.id !== deleteId);
    setScripts(updated);
    await saveScripts(updated);
    messageApi.success('正则脚本已删除');
    setDeleteId(null);
  };

  return (
    <div>
      {contextHolder}
      <div className={styles.sectionTitle}>正则脚本</div>
      <div className={styles.group}>
        {scripts.length === 0 ? (
          <div className={styles.empty}>暂无正则脚本</div>
        ) : (
          scripts.map((script) => (
            <div key={script.id} className={styles.cardItem}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{script.name}</span>
                <div className={styles.cardActions}>
                  {script.enabled ? (
                    <Tag color="green" style={{ fontSize: 11, margin: 0 }}>启用</Tag>
                  ) : (
                    <Tag style={{ fontSize: 11, margin: 0 }}>禁用</Tag>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleOpenEdit(script)}
                    aria-label="编辑"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setDeleteId(script.id)}
                    aria-label="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
              <span className={styles.hint} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {script.findRegex}
              </span>
            </div>
          ))
        )}
        <div className={styles.row}>
          <Button htmlType="button" block onClick={handleOpenCreate} style={{ minHeight: 44 }}>
            + 新建正则脚本
          </Button>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={editingId ? '编辑正则脚本' : '新建正则脚本'}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>脚本名称 *</label>
            <div className={styles.input}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如: 移除思考标签"
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>查找正则 *</label>
            <div className={styles.input}>
              <Input
                value={form.findRegex}
                onChange={(e) => setForm({ ...form, findRegex: e.target.value })}
                placeholder="<think>.*?</think>"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>替换字符串</label>
            <div className={styles.textarea}>
              <Input.TextArea
                value={form.replaceString}
                onChange={(e) => setForm({ ...form, replaceString: e.target.value })}
                placeholder="替换为的内容（留空即删除匹配）"
                rows={3}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={styles.label2}>启用</span>
            <Switch
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>作用位置（1=用户, 2=AI, 3=全部）</label>
            <div className={styles.input}>
              <Input
                type="number"
                min={1}
                max={3}
                value={form.placement}
                onChange={(e) => setForm({ ...form, placement: Math.max(1, Math.min(3, Number(e.target.value) || 2)) })}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        title="确认删除"
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个正则脚本吗？</p>
      </Modal>
    </div>
  );
}

// ============================================================================
// UI 模板面板
// ============================================================================

/** UI 模板编辑表单 */
interface UiTemplateForm {
  name: string;
  content: string;
  enabled: boolean;
}

function UiTemplatePanel() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();
  const [templates, setTemplates] = useState<UiTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UiTemplateForm>({ name: '', content: '', enabled: true });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadTemplates();
  }, []);

  /** 加载 UI 模板 */
  const loadTemplates = async (): Promise<void> => {
    try {
      const data = await getItem<UiTemplate[]>('uiTemplates', 'uiTemplates');
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[UiTemplatePanel] 加载失败:', e);
    }
  };

  /** 保存 UI 模板 */
  const saveTemplates = async (list: UiTemplate[]): Promise<void> => {
    try {
      await setItem('uiTemplates', 'uiTemplates', list);
    } catch (e) {
      console.error('[UiTemplatePanel] 保存失败:', e);
      messageApi.error('保存失败');
      throw e;
    }
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingId(null);
    setForm({ name: '', content: '', enabled: true });
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (template: UiTemplate): void => {
    setEditingId(template.id);
    setForm({ name: template.name, content: template.content, enabled: template.enabled });
    setEditorOpen(true);
  };

  /** 保存模板 */
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      messageApi.error('模板名称不能为空');
      return;
    }
    if (editingId) {
      const updated = templates.map((t) =>
        t.id === editingId
          ? { ...t, name: form.name.trim(), content: form.content, enabled: form.enabled }
          : t,
      );
      setTemplates(updated);
      await saveTemplates(updated);
      messageApi.success('UI 模板已更新');
    } else {
      const newTemplate: UiTemplate = {
        id: uuidv4(),
        name: form.name.trim(),
        content: form.content,
        enabled: form.enabled,
      };
      const updated = [...templates, newTemplate];
      setTemplates(updated);
      await saveTemplates(updated);
      messageApi.success('UI 模板已创建');
    }
    setEditorOpen(false);
  };

  /** 确认删除 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    const updated = templates.filter((t) => t.id !== deleteId);
    setTemplates(updated);
    await saveTemplates(updated);
    messageApi.success('UI 模板已删除');
    setDeleteId(null);
  };

  return (
    <div>
      {contextHolder}
      <div className={styles.sectionTitle}>UI 模板</div>
      <div className={styles.group}>
        {templates.length === 0 ? (
          <div className={styles.empty}>暂无 UI 模板</div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className={styles.cardItem}>
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{template.name}</span>
                <div className={styles.cardActions}>
                  {template.enabled ? (
                    <Tag color="green" style={{ fontSize: 11, margin: 0 }}>启用</Tag>
                  ) : (
                    <Tag style={{ fontSize: 11, margin: 0 }}>禁用</Tag>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleOpenEdit(template)}
                    aria-label="编辑"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setDeleteId(template.id)}
                    aria-label="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        <div className={styles.row}>
          <Button htmlType="button" block onClick={handleOpenCreate} style={{ minHeight: 44 }}>
            + 新建 UI 模板
          </Button>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title={editingId ? '编辑 UI 模板' : '新建 UI 模板'}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>模板名称 *</label>
            <div className={styles.input}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如: 自定义消息样式"
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>模板内容</label>
            <div className={styles.textarea}>
              <Input.TextArea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="模板内容（HTML/CSS/JS）..."
                rows={8}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={styles.label2}>启用</span>
            <Switch
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        title="确认删除"
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个 UI 模板吗？</p>
      </Modal>
    </div>
  );
}

// ============================================================================
// TRPG 面板
// ============================================================================

function TrpgPanel() {
  const { styles } = useStyles();
  return (
    <div>
      <div className={styles.sectionTitle}>TRPG 模式</div>
      <div className={styles.aboutText}>
        <Markdown>
          {'**TRPG 模式**需要本地代理服务器（NanoHTTPD on localhost:18527）连接火山方舟编码计划 API。\n\n在移动端（Android）上，由于 WebView 无法拦截 POST 请求体，需要通过原生代理服务器转发 API 请求。\n\nTRPG 模式当前为独立功能，请在主应用中通过 TRPG 入口进入。'}
        </Markdown>
      </div>
    </div>
  );
}

// ============================================================================
// 角色卡生成器面板
// ============================================================================

function CardGeneratorPanel() {
  const { styles } = useStyles();
  return (
    <div>
      <div className={styles.sectionTitle}>角色卡生成器</div>
      <div className={styles.aboutText}>
        <Markdown>
          {'**角色卡生成器**通过 AI 辅助生成角色卡设定。\n\n请前往"角色"页面，使用"新建"按钮手动创建角色卡，或在对话中让 AI 帮你生成角色设定后手动填入。\n\n此功能后续将支持从对话中一键提取并生成角色卡。'}
        </Markdown>
      </div>
    </div>
  );
}

// ============================================================================
// 关于面板
// ============================================================================

function AboutPanel() {
  const { styles } = useStyles();
  return (
    <div>
      <div className={styles.sectionTitle}>关于 LUZZY</div>
      <div className={styles.aboutText}>
        <Markdown>
          {'**LUZZY** 是一个移动端角色扮演聊天应用，支持：\n\n- 🎭 **多供应商路由**：模型名格式 `<providerId>_<model_name>`，支持 OpenAI / DeepSeek / 火山方舟 / 智谱 / Moonshot / MiniMax 等\n- 💬 **流式输出**：逐字返回生成内容，支持思维链推理\n- 🧠 **记忆系统**：向量记忆检索 + 全局记忆 + 上下文压缩\n- 🛠️ **工具调用**：向量记忆 / 关键词搜索 / Web 搜索 / 世界书 / SKILL / MCP HTTP\n- 📚 **角色卡管理**：SillyTavern V1/V2 格式兼容，导入导出\n- 📖 **预设系统**：系统提示词模板管理\n- 🌍 **世界书**：关键词触发与常驻条目\n- 🔧 **正则脚本**：文本替换与处理\n- 🎨 **主题切换**：亮色 / 暗色 Material You 主题\n\n所有数据存储在本地 IndexedDB，不会上传到服务器。'}
        </Markdown>
      </div>
      <Divider style={{ margin: '16px 0' }} />
      <div className={styles.brand}>
        <div className={styles.brandName}>LUZZY</div>
        <div>版本 1.0.0</div>
      </div>
    </div>
  );
}

// ============================================================================
// 菜单图标组件
// ============================================================================

function MenuIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'memory':
      return (
        <svg {...common}>
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
    case 'preset':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h6M9 13h6M9 17h3" />
        </svg>
      );
    case 'worldbook':
      return (
        <svg {...common}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    case 'regex':
      return (
        <svg {...common}>
          <path d="M17 3v10M12.5 8h9M3 5l4 4-4 4" />
          <circle cx="6" cy="18" r="2" />
          <path d="M14 16l2 2 4-4" />
        </svg>
      );
    case 'ui':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      );
    case 'trpg':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="16" cy="12" r="2" />
        </svg>
      );
    case 'generator':
      return (
        <svg {...common}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'about':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
    default:
      return null;
  }
}
