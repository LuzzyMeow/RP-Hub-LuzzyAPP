import { useState, useMemo, type ChangeEvent } from 'react';
import { createStyles } from 'antd-style';
import { Input, Switch, Select, Button, Divider, Modal, message } from 'antd';
import { Markdown } from '@lobehub/ui';
import { useSettingsStore } from '@/store/useSettingsStore';
import { parseModelName } from '@/services/providerService';
import type { ApiProvider, ThemeMode } from '@/types';

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
  label: css`
    font-size: 15px;
    color: var(--luzzy-on-surface);
    font-weight: 500;
  `,
  desc: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    line-height: 1.4;
  `,
  input: css`
    .ant-input,
    .ant-input-affix-wrapper,
    .ant-input-password,
    .ant-select .ant-select-selector,
    .ant-input-number {
      background: var(--luzzy-surface-container-high) !important;
      border-color: var(--luzzy-outline-variant) !important;
      color: var(--luzzy-on-surface) !important;
      border-radius: var(--luzzy-radius-sm) !important;
      min-height: 44px;
    }

    .ant-select {
      width: 100%;
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
      font-size: 13px;
    }
  `,
  errorText: css`
    color: var(--luzzy-error);
    font-size: 12px;
    margin-top: 4px;
  `,
  hint: css`
    color: var(--luzzy-on-surface-variant);
    font-size: 12px;
    line-height: 1.5;
    padding: var(--luzzy-spacing-sm);
    background: var(--luzzy-surface-container-high);
    border-radius: var(--luzzy-radius-sm);
  `,
  providerItem: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--luzzy-spacing-sm) var(--luzzy-spacing-md);
    border-bottom: 1px solid var(--luzzy-outline-variant);
    min-height: 44px;

    &:last-child {
      border-bottom: none;
    }
  `,
  providerInfo: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  `,
  providerName: css`
    font-size: 14px;
    color: var(--luzzy-on-surface);
    font-weight: 500;
  `,
  providerMeta: css`
    font-size: 12px;
    color: var(--luzzy-on-surface-variant);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  providerActions: css`
    display: flex;
    align-items: center;
    gap: var(--luzzy-spacing-xs);
    flex-shrink: 0;
  `,
  modelModeGroup: css`
    display: flex;
    gap: var(--luzzy-spacing-xs);
    padding: var(--luzzy-spacing-md);
  `,
  modelModeBtn: css`
    flex: 1;
    min-height: 44px;
    border-radius: var(--luzzy-radius-sm);
    border: 1px solid var(--luzzy-outline-variant);
    background: var(--luzzy-surface-container-high);
    color: var(--luzzy-on-surface);
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    transition: all var(--luzzy-transition);

    &.active {
      background: var(--luzzy-primary);
      color: var(--luzzy-on-primary);
      border-color: var(--luzzy-primary);
    }
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
  aboutText: css`
    color: var(--luzzy-on-surface-variant);
    font-size: 13px;
    line-height: 1.6;
    padding: var(--luzzy-spacing-md);
    background: var(--luzzy-surface-container);
    border-radius: var(--luzzy-radius-md);
  `,
}));

/** 模型模式类型 */
type ModelMode = 'quality' | 'balanced' | 'fast';

/** 人称视角类型 */
type PersonMode = 'first' | 'second' | 'third';

/** 自定义供应商表单状态 */
interface CustomProviderForm {
  id: string;
  name: string;
  apiUrl: string;
}

/** 模型模式选项 */
const MODEL_MODE_OPTIONS: Array<{ value: ModelMode; label: string; desc: string }> = [
  { value: 'quality', label: '高质量', desc: '最强推理能力' },
  { value: 'balanced', label: '均衡', desc: '性能与速度平衡' },
  { value: 'fast', label: '快速', desc: '最快响应速度' },
];

/** 人称视角选项 */
const PERSON_OPTIONS: Array<{ value: PersonMode; label: string }> = [
  { value: 'first', label: '第一人称' },
  { value: 'second', label: '第二人称' },
  { value: 'third', label: '第三人称' },
];

/** 主题选项 */
const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
];

export function SettingsPage() {
  const { styles } = useStyles();
  const [messageApi, contextHolder] = message.useMessage();

  const settings = useSettingsStore();

  // 自定义供应商弹窗状态
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerForm, setProviderForm] = useState<CustomProviderForm>({
    id: '',
    name: '',
    apiUrl: '',
  });

  // 自定义请求体校验状态
  const requestBodyValidation = useMemo(
    () => settings.validateCustomRequestBody(),
    [settings.customRequestBody, settings.validateCustomRequestBody],
  );

  /** 处理供应商切换 */
  const handleProviderChange = (providerId: string): void => {
    const provider = settings.getAllProviders().find((p) => p.id === providerId);
    if (provider) {
      settings.selectApiProvider(provider);
      messageApi.success(`已切换到 ${provider.name}`);
    }
  };

  /** 处理模型名输入，自动添加供应商前缀 */
  const handleModelNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    settings.setModelName(value);
  };

  /** 校验模型名格式 */
  const modelValidation = useMemo(() => {
    if (!settings.modelName.trim()) {
      return { valid: true, error: '' };
    }
    const { providerId, modelName } = parseModelName(settings.modelName);
    if (!providerId) {
      return {
        valid: false,
        error: '模型名应包含供应商前缀，格式: <providerId>_<model_name>',
      };
    }
    if (!modelName) {
      return { valid: false, error: '模型名不能为空' };
    }
    const exists = settings.getAllProviders().some((p) => p.id === providerId);
    if (!exists) {
      return {
        valid: false,
        error: `供应商 "${providerId}" 不存在`,
      };
    }
    return { valid: true, error: '' };
  }, [settings.modelName, settings.customApiProviders, settings.getAllProviders]);

  /** 打开添加供应商弹窗 */
  const handleOpenProviderModal = (): void => {
    setProviderForm({ id: '', name: '', apiUrl: '' });
    setProviderModalOpen(true);
  };

  /** 确认添加自定义供应商 */
  const handleAddProvider = (): void => {
    const { id, name, apiUrl } = providerForm;
    if (!id.trim()) {
      messageApi.error('供应商 ID 不能为空');
      return;
    }
    if (!/^[a-zA-Z]+$/.test(id.trim())) {
      messageApi.error('供应商 ID 只能包含英文字母');
      return;
    }
    if (!name.trim()) {
      messageApi.error('供应商名称不能为空');
      return;
    }
    if (!apiUrl.trim()) {
      messageApi.error('API URL 不能为空');
      return;
    }
    try {
      new URL(apiUrl.trim());
    } catch {
      messageApi.error('API URL 格式无效');
      return;
    }
    try {
      const newProvider: ApiProvider = {
        id: id.trim(),
        name: name.trim(),
        apiUrl: apiUrl.trim(),
        isBuiltin: false,
      };
      settings.addCustomProvider(newProvider);
      messageApi.success(`已添加供应商 ${name}`);
      setProviderModalOpen(false);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : '添加失败');
    }
  };

  /** 删除自定义供应商 */
  const handleRemoveProvider = (provider: ApiProvider): void => {
    if (provider.isBuiltin) {
      messageApi.warning('内置供应商不可删除');
      return;
    }
    settings.removeCustomProvider(provider.id);
    messageApi.success(`已删除供应商 ${provider.name}`);
  };

  /** 切换模型模式 */
  const handleModelModeChange = (mode: ModelMode): void => {
    settings.setModelMode(mode);
    // 切换模式时同步当前模型名到对应档位
    if (settings.modelName) {
      if (mode === 'quality') settings.setQualityModel(settings.modelName);
      if (mode === 'balanced') settings.setBalancedModel(settings.modelName);
      if (mode === 'fast') settings.setFastModel(settings.modelName);
    }
  };

  /** 选择模型模式对应的模型名 */
  const handleSelectModelMode = (mode: ModelMode): void => {
    const model =
      mode === 'quality'
        ? settings.qualityModel
        : mode === 'balanced'
          ? settings.balancedModel
          : settings.fastModel;
    if (model) {
      settings.setModelName(model);
      settings.setModelMode(mode);
      messageApi.success(`已切换到${mode === 'quality' ? '高质量' : mode === 'balanced' ? '均衡' : '快速'}模型`);
    }
  };

  /** 保存用户档案 */
  const handleUserChange = (field: 'name' | 'description' | 'person', value: string): void => {
    settings.setUser({ [field]: value } as Partial<typeof settings.user>);
  };

  /** 切换主题 */
  const handleThemeChange = (theme: ThemeMode): void => {
    settings.setTheme(theme);
  };

  /** 当前模型模式对应的模型名 */
  const currentModeModel =
    settings.modelMode === 'quality'
      ? settings.qualityModel
      : settings.modelMode === 'balanced'
        ? settings.balancedModel
        : settings.fastModel;

  return (
    <div className={styles.page}>
      {contextHolder}
      <div className={styles.scroll}>
        {/* ===== API 连接与服务 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>API 连接与服务</div>
          <div className={styles.group}>
            {/* 供应商选择器 */}
            <div className={styles.row}>
              <label className={styles.label}>供应商</label>
              <span className={styles.desc}>选择 API 供应商，切换后自动填充 URL 与 Key</span>
              <div className={styles.input}>
                <Select
                  value={settings.apiProviderId}
                  onChange={handleProviderChange}
                  options={settings.getAllProviders().map((p) => ({
                    value: p.id,
                    label: p.isBuiltin ? `${p.name}（内置）` : p.name,
                  }))}
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择供应商"
                />
              </div>
            </div>

            {/* API URL */}
            <div className={styles.row}>
              <label className={styles.label}>API URL</label>
              <span className={styles.desc}>OpenAI 兼容的 API 接口地址</span>
              <div className={styles.input}>
                <Input
                  value={settings.apiUrl}
                  onChange={(e) => settings.setApiUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* API Key */}
            <div className={styles.row}>
              <label className={styles.label}>API Key</label>
              <span className={styles.desc}>用于鉴权的密钥，仅存储在本地</span>
              <div className={styles.input}>
                <Input.Password
                  value={settings.apiKey}
                  onChange={(e) => settings.setApiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  visibilityToggle
                />
              </div>
            </div>

            {/* 模型名 */}
            <div className={styles.row}>
              <label className={styles.label}>模型名</label>
              <span className={styles.desc}>
                格式: <code>{`<providerId>_<model_name>`}</code>，例如 sta1n_glm-4.6
              </span>
              <div className={styles.input}>
                <Input
                  value={settings.modelName}
                  onChange={handleModelNameChange}
                  placeholder="sta1n_glm-4.6"
                  autoComplete="off"
                  spellCheck={false}
                  status={modelValidation.valid ? undefined : 'error'}
                />
              </div>
              {!modelValidation.valid && (
                <div className={styles.errorText}>{modelValidation.error}</div>
              )}
            </div>

            {/* 流式输出 */}
            <div className={`${styles.row} ${styles.rowInline}`}>
              <div>
                <div className={styles.label}>流式输出</div>
                <div className={styles.desc}>逐字返回生成内容</div>
              </div>
              <Switch checked={settings.stream} onChange={settings.setStream} />
            </div>

            {/* 深度思考 */}
            <div className={`${styles.row} ${styles.rowInline}`}>
              <div>
                <div className={styles.label}>深度思考</div>
                <div className={styles.desc}>启用思维链推理（如支持）</div>
              </div>
              <Switch
                checked={settings.enableThinking}
                onChange={settings.setEnableThinking}
              />
            </div>

            {/* 自定义请求体 */}
            <div className={styles.row}>
              <label className={styles.label}>自定义请求体</label>
              <span className={styles.desc}>
                JSON 格式，将合并到 API 请求中（model 与 messages 不可覆盖）
              </span>
              <div className={styles.textarea}>
                <Input.TextArea
                  value={settings.customRequestBody}
                  onChange={(e) => settings.setCustomRequestBody(e.target.value)}
                  placeholder={'{\n  "temperature": 0.8,\n  "top_p": 0.9\n}'}
                  autoComplete="off"
                  spellCheck={false}
                  rows={4}
                  status={requestBodyValidation.valid ? undefined : 'error'}
                />
              </div>
              {!requestBodyValidation.valid && (
                <div className={styles.errorText}>{requestBodyValidation.error}</div>
              )}
            </div>
          </div>
        </div>

        {/* ===== 供应商管理 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>供应商管理</div>
          <div className={styles.group}>
            {settings.customApiProviders.length === 0 ? (
              <div className={styles.row}>
                <span className={styles.desc}>暂无自定义供应商</span>
              </div>
            ) : (
              settings.customApiProviders.map((provider) => (
                <div key={provider.id} className={styles.providerItem}>
                  <div className={styles.providerInfo}>
                    <span className={styles.providerName}>{provider.name}</span>
                    <span className={styles.providerMeta}>
                      ID: {provider.id} · {provider.apiUrl}
                    </span>
                  </div>
                  <div className={styles.providerActions}>
                    <Button
                      htmlType="button"
                      size="small"
                      danger
                      onClick={() => handleRemoveProvider(provider)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className={styles.row}>
              <Button
                htmlType="button"
                block
                onClick={handleOpenProviderModal}
                style={{ minHeight: 44 }}
              >
                + 添加自定义供应商
              </Button>
            </div>
          </div>
        </div>

        {/* ===== 模型模式 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>模型模式</div>
          <div className={styles.group}>
            <div className={styles.modelModeGroup}>
              {MODEL_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.modelModeBtn} ${
                    settings.modelMode === opt.value ? 'active' : ''
                  }`}
                  onClick={() => handleModelModeChange(opt.value)}
                >
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className={styles.row}>
              <label className={styles.label}>
                当前模式模型名（{MODEL_MODE_OPTIONS.find((o) => o.value === settings.modelMode)?.label}）
              </label>
              <span className={styles.desc}>
                点击下方按钮可快速切换到对应档位的模型
              </span>
              <div className={styles.input}>
                <Input
                  value={currentModeModel}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (settings.modelMode === 'quality') settings.setQualityModel(value);
                    if (settings.modelMode === 'balanced') settings.setBalancedModel(value);
                    if (settings.modelMode === 'fast') settings.setFastModel(value);
                  }}
                  placeholder="sta1n_glm-4.6"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {MODEL_MODE_OPTIONS.map((opt) => {
                  const model =
                    opt.value === 'quality'
                      ? settings.qualityModel
                      : opt.value === 'balanced'
                        ? settings.balancedModel
                        : settings.fastModel;
                  return (
                    <Button
                      key={opt.value}
                      htmlType="button"
                      size="small"
                      disabled={!model}
                      onClick={() => handleSelectModelMode(opt.value)}
                      style={{ flex: 1, minHeight: 36 }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ===== 用户档案 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>用户档案</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <label className={styles.label}>用户名</label>
              <span className={styles.desc}>在角色扮演中你的称呼</span>
              <div className={styles.input}>
                <Input
                  value={settings.user.name}
                  onChange={(e) => handleUserChange('name', e.target.value)}
                  placeholder="你的名字"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>用户描述</label>
              <span className={styles.desc}>你的人设、性格、外貌等描述（可选）</span>
              <div className={styles.textarea}>
                <Input.TextArea
                  value={settings.user.description}
                  onChange={(e) => handleUserChange('description', e.target.value)}
                  placeholder="描述你自己..."
                  autoComplete="off"
                  rows={3}
                />
              </div>
            </div>

            <div className={styles.row}>
              <label className={styles.label}>人称视角</label>
              <span className={styles.desc}>对话中使用的叙事人称</span>
              <div className={styles.input}>
                <Select
                  value={settings.user.person}
                  onChange={(value) => handleUserChange('person', value)}
                  options={PERSON_OPTIONS}
                  placeholder="选择人称视角"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== 外观 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>外观</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <label className={styles.label}>主题</label>
              <span className={styles.desc}>切换亮色 / 暗色主题</span>
              <div className={styles.input}>
                <Select
                  value={settings.theme}
                  onChange={handleThemeChange}
                  options={THEME_OPTIONS}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== 关于 ===== */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>关于</div>
          <div className={styles.aboutText}>
            <Markdown>{'**LUZZY** 是一个移动端角色扮演聊天应用，支持多供应商路由、角色卡管理、记忆系统、工具调用等能力。'}</Markdown>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div className={styles.brand}>
          <div className={styles.brandName}>LUZZY</div>
          <div>版本 1.0.0</div>
        </div>
      </div>

      {/* 添加自定义供应商弹窗 */}
      <ProviderModal
        open={providerModalOpen}
        form={providerForm}
        onFormChange={setProviderForm}
        onOk={handleAddProvider}
        onCancel={() => setProviderModalOpen(false)}
      />
    </div>
  );
}

/** 自定义供应商添加弹窗 */
interface ProviderModalProps {
  open: boolean;
  form: CustomProviderForm;
  onFormChange: (form: CustomProviderForm) => void;
  onOk: () => void;
  onCancel: () => void;
}

function ProviderModal({ open, form, onFormChange, onOk, onCancel }: ProviderModalProps) {
  const { styles } = useStyles();

  return (
    <Modal
      open={open}
      title="添加自定义供应商"
      onOk={onOk}
      onCancel={onCancel}
      okText="添加"
      cancelText="取消"
      destroyOnClose
    >
      <div className={styles.input} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            供应商 ID（仅英文字母）
          </label>
          <Input
            value={form.id}
            onChange={(e) => onFormChange({ ...form, id: e.target.value })}
            placeholder="例如: myapi"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            供应商名称
          </label>
          <Input
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder="例如: 我的 API"
            autoComplete="off"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
            API URL
          </label>
          <Input
            value={form.apiUrl}
            onChange={(e) => onFormChange({ ...form, apiUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </Modal>
  );
}
