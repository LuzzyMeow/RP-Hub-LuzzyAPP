import { useEffect, useState } from 'react';
import { createStyles } from 'antd-style';
import { Input, Switch, Button, Modal, message, Empty, Tag, Divider } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveTool, ActiveToolType, McpSubTool } from '@/types';
import { normalizeActiveTool, getActiveToolCallLabels } from '@/services/toolService';
import {
  parseMcpImportJson,
  initializeMcpServer,
  listMcpTools,
} from '@/services/mcpService';
import { getItem, setItem } from '@/services/storage';

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
  section: css`
    margin-bottom: var(--luzzy-spacing-lg);
  `,
  sectionTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: var(--luzzy-primary);
    margin-bottom: var(--luzzy-spacing-sm);
    padding-left: var(--luzzy-spacing-xs);
    letter-spacing: 0.3px;
  `,
  group: css`
    background: var(--luzzy-surface-container);
    border-radius: var(--luzzy-radius-md);
    overflow: hidden;
  `,
  toolItem: css`
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-xs);
    padding: var(--luzzy-spacing-md);
    border-bottom: 1px solid var(--luzzy-outline-variant);

    &:last-child {
      border-bottom: none;
    }
  `,
  toolHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--luzzy-spacing-sm);
    min-height: 44px;
  `,
  toolInfo: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  toolName: css`
    font-size: 15px;
    font-weight: 500;
    color: var(--luzzy-on-surface);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  toolDesc: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `,
  toolMeta: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin-top: 2px;
  `,
  toolActions: css`
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-xs);
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
  addRow: css`
    padding: var(--luzzy-spacing-md);
  `,
  importArea: css`
    padding: var(--luzzy-spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--luzzy-spacing-sm);
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
  loadingText: css`
    font-size: 12px;
    color: var(--luzzy-primary);
  `,
}));

/** 工具类型选项 */
const TOOL_TYPE_OPTIONS: Array<{ value: ActiveToolType; label: string }> = [
  { value: 'vector', label: '向量记忆' },
  { value: 'keyword', label: '关键词搜索' },
  { value: 'web', label: 'Web 搜索' },
  { value: 'world', label: '世界书' },
  { value: 'skill_readfile', label: 'SKILL 文件阅读' },
  { value: 'skill', label: 'SKILL 工具' },
  { value: 'mcp_http', label: 'MCP HTTP' },
];

/** 工具类型标签颜色映射 */
const TOOL_TYPE_COLOR: Record<ActiveToolType, string> = {
  vector: 'blue',
  keyword: 'cyan',
  web: 'green',
  world: 'purple',
  skill_readfile: 'orange',
  skill: 'gold',
  mcp_http: 'magenta',
};

/** 工具类型中文名映射 */
const TOOL_TYPE_LABEL: Record<ActiveToolType, string> = {
  vector: '向量记忆',
  keyword: '关键词搜索',
  web: 'Web 搜索',
  world: '世界书',
  skill_readfile: 'SKILL 文件阅读',
  skill: 'SKILL 工具',
  mcp_http: 'MCP HTTP',
};

/** 工具编辑表单状态 */
interface ToolForm {
  name: string;
  type: ActiveToolType;
  description: string;
  callName: string;
  resultCount: number;
  tavilyApiKey: string;
  worldInfoAccessMode: string;
  mcpServerUrl: string;
  mcpServerName: string;
  skillFileName: string;
  skillFileContent: string;
}

/** 创建空表单 */
const createEmptyForm = (): ToolForm => ({
  name: '',
  type: 'vector',
  description: '',
  callName: '',
  resultCount: 8,
  tavilyApiKey: '',
  worldInfoAccessMode: 'read',
  mcpServerUrl: '',
  mcpServerName: '',
  skillFileName: '',
  skillFileContent: '',
});

/** 将工具对象转换为表单数据 */
const toolToForm = (tool: ActiveTool): ToolForm => ({
  name: tool.name,
  type: tool.type,
  description: tool.description,
  callName: tool.callName,
  resultCount: tool.resultCount,
  tavilyApiKey: tool.tavilyApiKey ?? '',
  worldInfoAccessMode: tool.worldInfoAccessMode ?? 'read',
  mcpServerUrl: tool.mcpServerUrl ?? '',
  mcpServerName: tool.mcpServerName ?? '',
  skillFileName: tool.skillFileName ?? '',
  skillFileContent: tool.skillFileContent ?? '',
});

/** 根据工具类型获取默认 callName */
const getDefaultCallName = (type: ActiveToolType): string => {
  switch (type) {
    case 'vector':
      return 'tool_memory';
    case 'keyword':
      return 'tool_grep';
    case 'web':
      return 'tool_web';
    case 'world':
      return 'tool_world';
    case 'skill_readfile':
      return 'tool_skill_readfile';
    case 'skill':
      return 'tool_skill';
    case 'mcp_http':
      return 'tool_mcp';
    default:
      return 'tool_memory';
  }
};

/** IndexedDB 中工具列表的存储键 */
const ACTIVE_TOOLS_STORAGE_KEY = 'activeTools';

export function ToolsPage() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();

  // 工具列表状态
  const [tools, setTools] = useState<ActiveTool[]>([]);
  const [loading, setLoading] = useState(false);

  // 编辑弹窗状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ToolForm>(createEmptyForm());

  // 删除确认弹窗
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // MCP 导入状态
  const [mcpImportJson, setMcpImportJson] = useState('');
  const [mcpImporting, setMcpImporting] = useState(false);

  /** 初次挂载加载工具列表 */
  useEffect(() => {
    void loadTools();
  }, []);

  /** 从 IndexedDB 加载工具列表 */
  const loadTools = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await getItem<ActiveTool[]>('activeTools', ACTIVE_TOOLS_STORAGE_KEY);
      const list = Array.isArray(data) ? data.map(normalizeActiveTool) : [];
      setTools(list);
    } catch (e) {
      console.error('[ToolsPage] 加载工具列表失败:', e);
      messageApi.error('加载工具列表失败');
    } finally {
      setLoading(false);
    }
  };

  /** 保存工具列表到 IndexedDB */
  const saveTools = async (list: ActiveTool[]): Promise<void> => {
    try {
      await setItem('activeTools', ACTIVE_TOOLS_STORAGE_KEY, list);
    } catch (e) {
      console.error('[ToolsPage] 保存工具列表失败:', e);
      messageApi.error('保存工具列表失败');
      throw e;
    }
  };

  /** 切换工具启用状态 */
  const handleToggleEnabled = async (tool: ActiveTool): Promise<void> => {
    const prev = tools;
    const updated = tools.map((t) =>
      t.id === tool.id ? { ...t, enabled: !t.enabled } : t,
    );
    setTools(updated);
    try {
      await saveTools(updated);
    } catch {
      setTools(prev);
    }
  };

  /** 打开新建弹窗 */
  const handleOpenCreate = (): void => {
    setEditingId(null);
    const emptyForm = createEmptyForm();
    emptyForm.callName = getDefaultCallName(emptyForm.type);
    setForm(emptyForm);
    setEditorOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleOpenEdit = (tool: ActiveTool): void => {
    setEditingId(tool.id);
    setForm(toolToForm(tool));
    setEditorOpen(true);
  };

  /** 切换工具类型时自动填充默认 callName */
  const handleTypeChange = (type: ActiveToolType): void => {
    setForm((prev) => ({
      ...prev,
      type,
      callName: getDefaultCallName(type),
    }));
  };

  /** 保存工具（新建或更新） */
  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      messageApi.error('工具名称不能为空');
      return;
    }
    if (!form.callName.trim()) {
      messageApi.error('调用名称不能为空');
      return;
    }

    let newList: ActiveTool[];
    if (editingId) {
      // 更新现有工具
      const existing = tools.find((t) => t.id === editingId);
      if (!existing) {
        messageApi.error('未找到要编辑的工具');
        return;
      }
      const updated: ActiveTool = normalizeActiveTool({
        ...existing,
        name: form.name.trim(),
        type: form.type,
        description: form.description,
        callName: form.callName.trim(),
        resultCount: form.resultCount,
        tavilyApiKey: form.type === 'web' ? form.tavilyApiKey : undefined,
        worldInfoAccessMode:
          form.type === 'world' ? form.worldInfoAccessMode : undefined,
        mcpServerUrl: form.type === 'mcp_http' ? form.mcpServerUrl : undefined,
        mcpServerName: form.type === 'mcp_http' ? form.mcpServerName : undefined,
        mcpTools: form.type === 'mcp_http' ? existing.mcpTools : undefined,
        skillFileName: form.type === 'skill' ? form.skillFileName : undefined,
        skillFileContent: form.type === 'skill' ? form.skillFileContent : undefined,
      });
      newList = tools.map((t) => (t.id === editingId ? updated : t));
    } else {
      // 新建工具
      const newTool: ActiveTool = normalizeActiveTool({
        id: uuidv4(),
        name: form.name.trim(),
        enabled: true,
        type: form.type,
        description: form.description,
        callName: form.callName.trim(),
        resultCount: form.resultCount,
        tavilyApiKey: form.type === 'web' ? form.tavilyApiKey : undefined,
        worldInfoAccessMode:
          form.type === 'world' ? form.worldInfoAccessMode : undefined,
        mcpServerUrl: form.type === 'mcp_http' ? form.mcpServerUrl : undefined,
        mcpServerName: form.type === 'mcp_http' ? form.mcpServerName : undefined,
        mcpTools: [],
        skillFileName: form.type === 'skill' ? form.skillFileName : undefined,
        skillFileContent: form.type === 'skill' ? form.skillFileContent : undefined,
      });
      newList = [...tools, newTool];
    }

    const prev = tools;
    setTools(newList);
    try {
      await saveTools(newList);
    } catch {
      setTools(prev);
      return;
    }
    messageApi.success(editingId ? '工具已更新' : '工具已创建');
    setEditorOpen(false);
  };

  /** 确认删除工具 */
  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    const prev = tools;
    const newList = tools.filter((t) => t.id !== deleteId);
    setTools(newList);
    try {
      await saveTools(newList);
    } catch {
      setTools(prev);
      return;
    }
    messageApi.success('工具已删除');
    setDeleteId(null);
  };

  /** 导入 MCP 工具 */
  const handleImportMcp = async (): Promise<void> => {
    const jsonText = mcpImportJson.trim();
    if (!jsonText) {
      messageApi.error('请输入 MCP 配置 JSON');
      return;
    }

    setMcpImporting(true);
    let hide: (() => void) | undefined;
    try {
      // 1. 解析 JSON 配置
      const config = parseMcpImportJson(jsonText);
      if (!config.url) {
        throw new Error('未能从 JSON 中解析出 MCP 服务器 URL');
      }

      hide = messageApi.loading('正在连接 MCP 服务器...');

      // 2. 初始化 MCP 服务器连接
      await initializeMcpServer(config.url, config.headers);

      // 3. 获取工具列表
      const mcpTools: McpSubTool[] = await listMcpTools(config.url, undefined, config.headers);

      if (mcpTools.length === 0) {
        throw new Error('MCP 服务器未返回任何工具');
      }

      // 4. 创建 ActiveTool 对象
      const serverName = config.name || config.url;
      const newTool: ActiveTool = normalizeActiveTool({
        id: uuidv4(),
        name: `MCP: ${serverName}`,
        enabled: true,
        type: 'mcp_http',
        description: `从 ${config.url} 导入的 MCP 工具，包含 ${mcpTools.length} 个子工具`,
        callName: `tool_mcp_${uuidv4().slice(-6)}`,
        mcpServerUrl: config.url,
        mcpServerName: serverName,
        mcpTools,
      });

      const newList = [...tools, newTool];
      setTools(newList);
      await saveTools(newList);

      hide();
      hide = undefined;
      messageApi.success(`已导入 MCP 工具 "${serverName}"，包含 ${mcpTools.length} 个子工具`);
      setMcpImportJson('');
    } catch (e) {
      if (hide) hide();
      messageApi.error(e instanceof Error ? e.message : 'MCP 导入失败');
    } finally {
      setMcpImporting(false);
    }
  };

  /** 获取工具调用标签文本 */
  const getCallLabelsText = (tool: ActiveTool): string => {
    const labels = getActiveToolCallLabels(tool);
    return `${labels.add} / ${labels.cover}`;
  };

  return (
    <div className={styles.page}>
      {contextHolder}
      <div className={styles.scroll}>
        {/* ===== 工具列表 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>工具列表</div>
          <div className={styles.group}>
            {tools.length === 0 ? (
              <div className={styles.empty}>
                <Empty description={loading ? '加载中...' : '暂无工具'} />
              </div>
            ) : (
              tools.map((tool) => (
                <div key={tool.id} className={styles.toolItem}>
                  <div className={styles.toolHeader}>
                    <div className={styles.toolInfo}>
                      <span className={styles.toolName}>{tool.name}</span>
                      {tool.description && (
                        <span className={styles.toolDesc}>{tool.description}</span>
                      )}
                      <div className={styles.toolMeta}>
                        <Tag color={TOOL_TYPE_COLOR[tool.type]} style={{ fontSize: 11, margin: 0 }}>
                          {TOOL_TYPE_LABEL[tool.type]}
                        </Tag>
                        {tool.enabled ? (
                          <Tag color="green" style={{ fontSize: 11, margin: 0 }}>已启用</Tag>
                        ) : (
                          <Tag style={{ fontSize: 11, margin: 0 }}>已禁用</Tag>
                        )}
                      </div>
                      <div className={styles.toolMeta}>
                        <span className={styles.hint}>调用标签: {getCallLabelsText(tool)}</span>
                      </div>
                      {tool.type === 'mcp_http' && tool.mcpTools && tool.mcpTools.length > 0 && (
                        <div className={styles.toolMeta}>
                          <span className={styles.hint}>
                            子工具: {tool.mcpTools.map((t) => t.name).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={styles.toolActions}>
                      <Switch
                        checked={tool.enabled}
                        onChange={() => void handleToggleEnabled(tool)}
                        size="small"
                      />
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleOpenEdit(tool)}
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
                        onClick={() => setDeleteId(tool.id)}
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
              ))
            )}
            <div className={styles.addRow}>
              <Button
                htmlType="button"
                block
                onClick={handleOpenCreate}
                style={{ minHeight: 44 }}
              >
                + 添加工具
              </Button>
            </div>
          </div>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* ===== MCP 工具导入 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>MCP 工具导入</div>
          <div className={styles.group}>
            <div className={styles.importArea}>
              <span className={styles.hint}>
                粘贴 MCP 服务器配置 JSON（支持扁平格式或 mcpServers 嵌套格式），将自动连接服务器并导入工具列表。
              </span>
              <div className={styles.textarea}>
                <Input.TextArea
                  value={mcpImportJson}
                  onChange={(e) => setMcpImportJson(e.target.value)}
                  placeholder={'{\n  "mcpServers": {\n    "example": {\n      "url": "https://mcp.example.com/sse"\n    }\n  }\n}'}
                  rows={6}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={mcpImporting}
                />
              </div>
              <Button
                htmlType="button"
                block
                loading={mcpImporting}
                onClick={() => void handleImportMcp()}
                style={{ minHeight: 44 }}
              >
                {mcpImporting ? '导入中...' : '导入 MCP 工具'}
              </Button>
            </div>
          </div>
        </div>

        {/* ===== SKILL 工具说明 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>SKILL 工具管理</div>
          <div className={styles.group}>
            <div className={styles.importArea}>
              <span className={styles.hint}>
                SKILL 工具通过"添加工具"按钮创建，选择类型为"SKILL 工具"，填入 SKILL 文件名与内容即可。SKILL 文件阅读工具（skill_readfile）为内置工具，AI 可通过它读取其他 SKILL 的文件内容。
              </span>
              <Button
                htmlType="button"
                block
                onClick={() => {
                  setEditingId(null);
                  const skillForm = createEmptyForm();
                  skillForm.type = 'skill';
                  skillForm.callName = getDefaultCallName('skill');
                  setForm(skillForm);
                  setEditorOpen(true);
                }}
                style={{ minHeight: 44 }}
              >
                + 新建 SKILL 工具
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 编辑/新建弹窗 */}
      <Modal
        open={editorOpen}
        title={editingId ? '编辑工具' : '新建工具'}
        onOk={() => void handleSave()}
        onCancel={() => setEditorOpen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        destroyOnClose
      >
        <ToolEditorForm
          form={form}
          onFormChange={setForm}
          onTypeChange={handleTypeChange}
        />
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        open={!!deleteId}
        title="确认删除"
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteId(null)}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个工具吗？此操作不可撤销。</p>
      </Modal>
    </div>
  );
}

/** 工具编辑表单组件 */
interface ToolEditorFormProps {
  form: ToolForm;
  onFormChange: (form: ToolForm) => void;
  onTypeChange: (type: ActiveToolType) => void;
}

function ToolEditorForm({ form, onFormChange, onTypeChange }: ToolEditorFormProps) {
  const { styles } = useStyles();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
      {/* 工具名称 */}
      <div className={styles.formItem}>
        <label className={styles.formLabel}>工具名称 *</label>
        <div className={styles.input}>
          <Input
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder="例如: 向量记忆检索"
          />
        </div>
      </div>

      {/* 工具类型 */}
      <div className={styles.formItem}>
        <label className={styles.formLabel}>工具类型</label>
        <div className={styles.input}>
          <select
            value={form.type}
            onChange={(e) => onTypeChange(e.target.value as ActiveToolType)}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 'var(--luzzy-radius-sm)',
              border: '1px solid var(--luzzy-outline-variant)',
              background: 'var(--luzzy-surface-container-high)',
              color: 'var(--luzzy-on-surface)',
              padding: '8px 12px',
              fontSize: 14,
            }}
          >
            {TOOL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 调用名称 */}
      <div className={styles.formItem}>
        <label className={styles.formLabel}>调用名称（callName）</label>
        <div className={styles.input}>
          <Input
            value={form.callName}
            onChange={(e) => onFormChange({ ...form, callName: e.target.value })}
            placeholder="tool_memory"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* 描述 */}
      <div className={styles.formItem}>
        <label className={styles.formLabel}>描述</label>
        <div className={styles.textarea}>
          <Input.TextArea
            value={form.description}
            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
            placeholder="工具的功能描述"
            rows={2}
          />
        </div>
      </div>

      {/* 结果数量 */}
      <div className={styles.formItem}>
        <label className={styles.formLabel}>结果数量（8-12）</label>
        <div className={styles.input}>
          <Input
            type="number"
            min={8}
            max={12}
            value={form.resultCount}
            onChange={(e) => {
              const num = Number(e.target.value);
              onFormChange({ ...form, resultCount: Number.isFinite(num) ? Math.max(8, Math.min(12, Math.round(num))) : 8 });
            }}
          />
        </div>
      </div>

      {/* Web 工具特有字段 */}
      {form.type === 'web' && (
        <div className={styles.formItem}>
          <label className={styles.formLabel}>Tavily API Key</label>
          <div className={styles.input}>
            <Input.Password
              value={form.tavilyApiKey}
              onChange={(e) => onFormChange({ ...form, tavilyApiKey: e.target.value })}
              placeholder="tvly-..."
              autoComplete="off"
              visibilityToggle
            />
          </div>
        </div>
      )}

      {/* 世界书工具特有字段 */}
      {form.type === 'world' && (
        <div className={styles.formItem}>
          <label className={styles.formLabel}>世界书访问模式</label>
          <div className={styles.input}>
            <select
              value={form.worldInfoAccessMode}
              onChange={(e) => onFormChange({ ...form, worldInfoAccessMode: e.target.value })}
              style={{
                width: '100%',
                minHeight: 44,
                borderRadius: 'var(--luzzy-radius-sm)',
                border: '1px solid var(--luzzy-outline-variant)',
                background: 'var(--luzzy-surface-container-high)',
                color: 'var(--luzzy-on-surface)',
                padding: '8px 12px',
                fontSize: 14,
              }}
            >
              <option value="read">只读（read）</option>
              <option value="write">读写（write）</option>
            </select>
          </div>
        </div>
      )}

      {/* MCP 工具特有字段 */}
      {form.type === 'mcp_http' && (
        <>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>MCP 服务器 URL</label>
            <div className={styles.input}>
              <Input
                value={form.mcpServerUrl}
                onChange={(e) => onFormChange({ ...form, mcpServerUrl: e.target.value })}
                placeholder="https://mcp.example.com/sse"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>MCP 服务器名称</label>
            <div className={styles.input}>
              <Input
                value={form.mcpServerName}
                onChange={(e) => onFormChange({ ...form, mcpServerName: e.target.value })}
                placeholder="example-server"
                autoComplete="off"
              />
            </div>
          </div>
        </>
      )}

      {/* SKILL 工具特有字段 */}
      {form.type === 'skill' && (
        <>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>SKILL 文件名</label>
            <div className={styles.input}>
              <Input
                value={form.skillFileName}
                onChange={(e) => onFormChange({ ...form, skillFileName: e.target.value })}
                placeholder="my-skill.md"
                autoComplete="off"
              />
            </div>
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>SKILL 文件内容</label>
            <div className={styles.textarea}>
              <Input.TextArea
                value={form.skillFileContent}
                onChange={(e) => onFormChange({ ...form, skillFileContent: e.target.value })}
                placeholder="SKILL 文件的完整内容..."
                rows={8}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
