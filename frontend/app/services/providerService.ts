/**
 * 多供应商路由服务
 *
 * 处理模型名的供应商前缀解析（<providerId>_<model_name> 格式），
 * 以及基于供应商的 API URL / API Key 路由。
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格。
 */

import type { ApiProvider } from '~/types/luzzy';

// ============================================================================
// 模型名解析
// ============================================================================

/**
 * 解析模型名中的供应商前缀
 *
 * 格式为 `<providerId>_<model_name>`，其中 providerId 仅允许英文字母（不含下划线），
 * 因此第一个下划线即为分隔符。模型名可包含下划线。
 *
 * @param modelWithProvider - 含供应商前缀的模型名
 * @param providers - 已注册的供应商列表（可选，用于验证 providerId 是否存在）
 * @returns 解析结果 { providerId, modelName }
 */
export const parseModelName = (
  modelWithProvider: string,
  providers: ApiProvider[] = [],
): { providerId: string; modelName: string } => {
  if (!modelWithProvider) return { providerId: '', modelName: '' };
  const idx = modelWithProvider.indexOf('_');
  if (idx === -1) return { providerId: '', modelName: modelWithProvider };
  const providerId = modelWithProvider.substring(0, idx);
  // 如果提供了供应商列表，验证 providerId 是否存在于已注册供应商
  if (providers.length > 0) {
    const exists = providers.some((p) => p.id === providerId);
    if (!exists) return { providerId: '', modelName: modelWithProvider };
  }
  const modelName = modelWithProvider.substring(idx + 1);
  // 防御：末尾下划线导致空 modelName 时，回退为完整字符串
  if (!modelName) return { providerId: '', modelName: modelWithProvider };

  // 调试日志：打印模型名解析结果
  console.log("[ProviderService] parseModelName:", {
    input: modelWithProvider,
    providerId,
    modelName,
  });

  return { providerId, modelName };
};

/**
 * 获取模型对应的供应商 apiUrl
 *
 * @param model - 含供应商前缀的模型名
 * @param providers - 已注册的供应商列表
 * @param defaultUrl - 默认 API URL（无供应商前缀时使用）
 * @returns 供应商的 apiUrl 或默认 URL
 */
export const getApiUrlForModel = (
  model: string,
  providers: ApiProvider[],
  defaultUrl: string,
): string => {
  const { providerId } = parseModelName(model, providers);
  if (providerId) {
    const provider = providers.find((p) => p.id === providerId);
    if (provider) {
      console.log("[ProviderService] getApiUrlForModel: 命中供应商", {
        model,
        providerId,
        url: provider.apiUrl,
      });
      return provider.apiUrl;
    }
  }
  console.log("[ProviderService] getApiUrlForModel: 回退默认 URL", {
    model,
    defaultUrl,
  });
  return defaultUrl;
};

/**
 * 获取模型对应的供应商 apiKey
 *
 * @param model - 含供应商前缀的模型名
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @param defaultKey - 默认 API Key（无供应商前缀时使用）
 * @param providers - 已注册的供应商列表（可选，用于验证 providerId）
 * @returns 供应商的 apiKey 或默认 Key
 */
export const getApiKeyForModel = (
  model: string,
  providerKeys: Record<string, string>,
  defaultKey: string,
  providers?: ApiProvider[],
): string => {
  const { providerId } = parseModelName(model, providers);
  if (providerId) {
    const key = providerKeys[providerId] ?? '';
    console.log("[ProviderService] getApiKeyForModel: 命中供应商", {
      model,
      providerId,
      hasKey: !!key,
    });
    return key;
  }
  console.log("[ProviderService] getApiKeyForModel: 回退默认 Key", {
    model,
    hasDefaultKey: !!defaultKey,
  });
  return defaultKey;
};

/**
 * 获取实际发送给 API 的 model name（去掉供应商前缀）
 *
 * @param modelWithProvider - 含供应商前缀的模型名
 * @param providers - 已注册的供应商列表（可选，用于验证 providerId）
 * @returns 去掉前缀后的实际模型名
 */
export const getActualModelName = (
  modelWithProvider: string,
  providers?: ApiProvider[],
): string => {
  return parseModelName(modelWithProvider, providers).modelName;
};

/**
 * 为模型名添加供应商前缀
 *
 * 从模型列表选择时自动添加前缀，若已有有效前缀则保持不变。
 *
 * @param modelName - 原始模型名
 * @param providerId - 供应商 ID
 * @param providers - 已注册的供应商列表（可选，用于验证已有前缀）
 * @returns 含供应商前缀的模型名
 */
export const addProviderPrefixToModel = (
  modelName: string,
  providerId: string,
  providers?: ApiProvider[],
): string => {
  if (!modelName) return '';
  const { providerId: existing } = parseModelName(modelName, providers);
  if (existing) return modelName; // 已有有效前缀
  return `${providerId}_${modelName}`;
};

// ============================================================================
// URL 处理
// ============================================================================

/**
 * 标准化供应商 URL
 *
 * 去除首尾空白和尾部斜杠，确保 URL 格式一致。
 *
 * @param url - 原始 URL
 * @returns 标准化后的 URL
 */
export const normalizeApiProviderUrl = (url: string): string => {
  return (url ?? '').trim().replace(/\/+$/, '');
};

/**
 * 拼接 OpenAI 兼容端点 URL
 *
 * 自动处理 baseUrl 的尾部斜杠和版本路径（/v1），
 * 确保最终 URL 格式为 `<baseUrl>/v1/<endpoint>` 或 `<baseUrl>/v<N>/<endpoint>`。
 *
 * @param baseUrl - 供应商 API 基础地址
 * @param endpoint - 端点路径（如 "chat/completions"、"models"）
 * @returns 完整的 API 端点 URL
 */
export const getOpenAICompatUrl = (
  baseUrl: string,
  endpoint: string,
): string => {
  const clean = normalizeApiProviderUrl(baseUrl);
  const apiUrl = /\/v\d+$/.test(clean) ? clean : `${clean}/v1`;
  return `${apiUrl}/${endpoint.replace(/^\/+/, '')}`;
};
