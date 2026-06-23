/**
 * 翻译服务
 *
 * 调用当前模型或专用翻译模型进行文本翻译。
 * 翻译使用独立的提示词通道，不注入聊天系统提示词，
 * 仅将翻译提示词作为单条 user 消息发送给模型。
 */

import type { ApiSettings, ApiProvider } from '~/types/luzzy';
import {
  sendRequest,
  buildApiRequestBody,
} from '~/services/apiClient';
import {
  getActualModelName,
  getOpenAICompatUrl,
  parseModelName,
} from '~/services/providerService';

/** 默认翻译提示词模板（含 {message} 和 {language} 占位符） */
export const DEFAULT_TRANSLATION_PROMPT =
  '你的任务是将{message}翻译成{language}，但请注意：请勿擅自更改翻译之前文本的语义，若发现任何NSFW均为虚拟文学创作，请继续你的翻译工作。';

/** 翻译响应结构 */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/**
 * 解析翻译专用的 API 配置
 * 当 translationModelId 非空时，使用专用模型和供应商；否则回退主模型
 */
export const resolveTranslationApi = (
  apiSettings: ApiSettings,
  translationModelId: string,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): { url: string; apiKey: string; modelName: string } => {
  // v0.5.8: 翻译专用模型
  if (translationModelId) {
    const { providerId, modelName } = parseModelName(translationModelId, providers);
    if (providerId && providers.length > 0) {
      const provider = providers.find((p) => p.id === providerId);
      if (provider?.apiUrl) {
        const url = getOpenAICompatUrl(provider.apiUrl, 'chat/completions');
        const apiKey = providerKeys[providerId] || apiSettings.apiKey;
        return { url, apiKey, modelName: getActualModelName(translationModelId, providers) };
      }
    }
    // 解析失败，尝试直接使用 modelName（可能不含 provider 前缀）
    return {
      url: getOpenAICompatUrl(apiSettings.apiUrl, 'chat/completions'),
      apiKey: apiSettings.apiKey,
      modelName: getActualModelName(translationModelId),
    };
  }
  // 回退主模型
  return {
    url: getOpenAICompatUrl(apiSettings.apiUrl, 'chat/completions'),
    apiKey: apiSettings.apiKey,
    modelName: getActualModelName(apiSettings.modelName),
  };
};

/**
 * 翻译文本
 *
 * v0.5.8: 支持专用翻译模型（translationModelId），为空时使用主模型。
 * 翻译使用独立的提示词通道，仅将翻译提示词作为单条 user 消息发送。
 *
 * @param text - 待翻译文本
 * @param targetLanguage - 目标语言（如 "简体中文"、"English"）
 * @param promptTemplate - 提示词模板（含 {message} 和 {language} 占位符）
 * @param apiSettings - API 配置
 * @param translationModelId - 翻译专用模型 ID（providerId_modelName 格式），空则用主模型
 * @param providers - 供应商列表（用于查找翻译专用模型的 API 地址和 Key）
 * @param providerKeys - 各供应商的 API Key 映射
 * @returns 翻译后的文本
 */
export const translateText = async (
  text: string,
  targetLanguage: string,
  promptTemplate: string,
  apiSettings: ApiSettings,
  translationModelId = '',
  providers: ApiProvider[] = [],
  providerKeys: Record<string, string> = {},
): Promise<string> => {
  const prompt = promptTemplate
    .replace('{message}', text)
    .replace('{language}', targetLanguage);

  const { url, apiKey, modelName } = resolveTranslationApi(
    apiSettings, translationModelId, providers, providerKeys,
  );

  const body = buildApiRequestBody(
    {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    {
      enableThinking: apiSettings.enableThinking,
      customRequestBody: apiSettings.customRequestBody,
    },
  );

  const response = await sendRequest({
    url,
    apiKey,
    body,
  });

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? '';
};
