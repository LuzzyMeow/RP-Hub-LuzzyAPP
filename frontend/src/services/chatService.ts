/**
 * 聊天核心服务
 *
 * 提供上下文构建、正则脚本处理和记忆提取功能。
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type {
  ChatMessage,
  Character,
  UserProfile,
  Preset,
  WorldInfoEntry,
  GlobalMemory,
  ApiSettings,
  ApiProvider,
  MemorySettings,
  MessageRole,
  RegexScript,
} from '@/types';
import { parseCot } from '@/services/markdownService';

// ============================================================================
// 类型定义
// ============================================================================

/** API 消息格式（发送给 API 的消息结构） */
export interface ApiMessage {
  role: MessageRole;
  content: string;
  name?: string;
}

/** buildContext 参数 */
export interface BuildContextParams {
  messages: ChatMessage[];
  character: Character | null;
  user: UserProfile;
  presets: Preset[];
  worldInfoEntries: WorldInfoEntry[];
  globalMemory: GlobalMemory | null;
  settings: ApiSettings;
  apiProviders: ApiProvider[];
  apiProviderKeys: Record<string, string>;
}

/** buildContext 返回值 */
export interface BuildContextResult {
  systemPrompt: string;
  apiMessages: ApiMessage[];
}

/** extractMemory 参数 */
export interface ExtractMemoryParams {
  messages: ChatMessage[];
  character: Character | null;
  settings: ApiSettings;
  memorySettings: MemorySettings;
}

// ============================================================================
// 常量与辅助函数
// ============================================================================

/** 默认用户档案（未配置用户信息时使用） */
export const DEFAULT_USER: UserProfile = {
  uuid: 'user',
  name: 'User',
  description: '',
  person: 'first',
};

/** 默认世界书扫描深度 */
const DEFAULT_WORLD_INFO_SCAN_DEPTH = 2;

/**
 * 将值转换为非负数字
 * @param value - 输入值
 * @param fallback - 转换失败时的回退值
 * @returns 非负数字
 */
const toNonNegativeNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : fallback;
};

/**
 * 拼接世界书条目内容为文本
 * @param entries - 世界书条目列表
 * @returns 拼接后的文本
 */
const joinWorldInfoContent = (entries: WorldInfoEntry[]): string => {
  return entries.map((e) => `[${e.id}]\n${e.content}`).join('\n\n');
};

// ============================================================================
// 世界书关键词匹配
// ============================================================================

/**
 * 创建世界书关键词正则表达式
 *
 * 支持 /pattern/flags 格式，自动添加 'i' 标志（不区分大小写）。
 *
 * @param pattern - 正则模式字符串
 * @returns 编译后的 RegExp 对象
 */
const createWorldInfoRegex = (pattern: string): RegExp => {
  let source = String(pattern || '');
  let flags = 'i';
  if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
    const lastSlash = source.lastIndexOf('/');
    const potentialFlags = source.slice(lastSlash + 1);
    if (/^[dgimsuvy]*$/.test(potentialFlags)) {
      source = source.slice(1, lastSlash);
      flags = potentialFlags;
    }
  }
  flags = flags.replace(/g/g, '');
  if (!flags.includes('i')) flags += 'i';
  if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
  return new RegExp(source, flags);
};

/**
 * 检查世界书条目的关键词是否匹配文本
 *
 * @param key - 关键词
 * @param text - 待匹配文本
 * @param useRegex - 是否使用正则匹配
 * @returns 是否匹配
 */
const worldInfoKeyMatchesText = (
  key: string,
  text: string,
  useRegex = false,
): boolean => {
  const rawKey = String(key || '').trim();
  const rawText = String(text || '');
  if (!rawKey || !rawText) return false;

  if (useRegex) {
    try {
      return createWorldInfoRegex(rawKey).test(rawText);
    } catch {
      return false;
    }
  }

  return rawText.toLowerCase().includes(rawKey.toLowerCase());
};

/**
 * 检查世界书条目是否通过概率检查
 *
 * @param entry - 世界书条目
 * @returns 是否通过概率检查
 */
const passesWorldInfoProbability = (entry: WorldInfoEntry): boolean => {
  const probability = Math.min(
    100,
    toNonNegativeNumber(entry.probability, 100),
  );
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return Math.random() * 100 < probability;
};

/**
 * 扫描聊天记录，返回触发的世界书条目
 *
 * 1. 常驻条目（constant）直接触发
 * 2. 关键词条目扫描最近 N 条消息进行匹配
 * 3. 概率检查
 * 4. 排序：常驻优先，然后按 order 降序
 *
 * @param entries - 启用的世界书条目列表
 * @param messages - 聊天记录
 * @param scanDepth - 扫描深度（最近 N 条消息）
 * @returns 触发的世界书条目列表
 */
const matchWorldInfoEntries = (
  entries: WorldInfoEntry[],
  messages: ChatMessage[],
  scanDepth: number,
): WorldInfoEntry[] => {
  const triggered: WorldInfoEntry[] = [];

  const scanText = messages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join('\n');

  for (const entry of entries) {
    // 常驻条目直接触发
    if (entry.constant) {
      triggered.push(entry);
      continue;
    }

    // 概率检查
    if (!passesWorldInfoProbability(entry)) continue;

    // 关键词匹配
    if (!entry.keys || entry.keys.length === 0) continue;

    const hasMatch = entry.keys.some((key) =>
      worldInfoKeyMatchesText(key, scanText),
    );

    if (hasMatch) {
      triggered.push(entry);
    }
  }

  // 排序：常驻优先，然后按 order 降序
  triggered.sort((a, b) => {
    if (a.constant && !b.constant) return -1;
    if (!a.constant && b.constant) return 1;
    return (b.order || 0) - (a.order || 0);
  });

  return triggered;
};

// ============================================================================
// buildContext - 构建发送给 API 的消息上下文
// ============================================================================

/**
 * 构建发送给 API 的消息上下文
 *
 * 逻辑：
 * 1. 构建系统提示词（预设内容 + 世界书条目 + 角色描述 + 用户信息 + 全局记忆）
 * 2. 添加开场白（如果聊天记录为空）
 * 3. 添加聊天记录（移除 CoT 内容）
 * 4. 世界书关键词匹配注入
 * 5. 记忆压缩（保留最近 N 楼，其余有向量记忆覆盖的从原始上下文移除）
 *
 * @param params - 构建参数
 * @returns 系统提示词与 API 消息列表
 */
export const buildContext = (params: BuildContextParams): BuildContextResult => {
  const {
    messages,
    character,
    user,
    presets,
    worldInfoEntries,
    globalMemory,
  } = params;

  // 1. 过滤启用的世界书条目
  const activeWorldInfo = worldInfoEntries.filter((e) => e.enabled);

  // 2. 世界书关键词匹配（扫描最近的消息）
  const triggeredWorldInfo = matchWorldInfoEntries(
    activeWorldInfo,
    messages,
    DEFAULT_WORLD_INFO_SCAN_DEPTH,
  );

  // 3. 构建系统提示词
  const systemPromptParts: string[] = [];

  // 3.1 预设内容（保持 NSFW 预设内容完整）
  const presetContents = presets
    .filter((p) => p.content && p.content.trim())
    .map((p) => p.content)
    .join('\n\n---\n\n');
  if (presetContents) {
    systemPromptParts.push(presetContents);
  }

  // 3.2 世界书条目（常驻 + 关键词触发）
  if (triggeredWorldInfo.length > 0) {
    systemPromptParts.push(
      `[World Info]\n${joinWorldInfoContent(triggeredWorldInfo)}`,
    );
  }

  // 3.3 文风优先级提示
  systemPromptParts.push(
    '[Style Priority]\n' +
      '开场白和历史消息只用于理解剧情事实、人物关系和场景状态，不作为文风模板；' +
      '不要继承或模仿开场白、前文回复的句式、语气密度、段落节奏或排版习惯。' +
      '最终回复的文风必须优先遵守上方系统预设中的规定文风。',
  );

  // 3.4 角色定义
  if (character) {
    const charPrompt = `Name: ${character.name}\nPersonality: ${character.personality}\nScenario: ${character.scenario}`;
    const charParts: string[] = ['[Character]', charPrompt];
    if (character.mesExample && character.mesExample.trim()) {
      charParts.push(character.mesExample);
    }
    systemPromptParts.push(charParts.join('\n\n'));
  }

  // 3.5 用户信息
  systemPromptParts.push(
    `[User Info]\nName: ${user.name}\nDescription: ${user.description || ''}`,
  );

  // 3.6 全局记忆
  if (globalMemory && globalMemory.content.trim()) {
    systemPromptParts.push(
      `<global_memory>\n${globalMemory.content.trim()}\n</global_memory>`,
    );
  }

  const systemPrompt = systemPromptParts.join('\n\n');

  // 4. 构建 API 消息列表
  const apiMessages: ApiMessage[] = [];

  // 4.1 系统消息
  apiMessages.push({ role: 'system', content: systemPrompt });

  // 4.2 开场白（如果聊天记录为空或第一条不是开场白）
  if (character && character.firstMessage) {
    const hasFirstMesInHistory =
      messages.length > 0 &&
      messages[0].role === 'assistant' &&
      messages[0].content === character.firstMessage;

    if (!hasFirstMesInHistory) {
      apiMessages.push({
        role: 'assistant',
        content: character.firstMessage,
        name: character.name,
      });
    }
  }

  // 4.3 聊天记录（移除 CoT 内容）
  for (const msg of messages) {
    const parsed = parseCot(msg.content || '');
    let content = parsed.main;
    // 用户消息的系统指令保留
    if (parsed.sys && msg.role === 'user') {
      content += '\n\n[系统指令: ' + parsed.sys + ']';
    }
    content = content.trim();
    if (content) {
      apiMessages.push({
        role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
        content,
        name: msg.role === 'user' ? user.name : character?.name,
      });
    }
  }

  // 5. 记忆压缩：保留最近 N 楼，其余有向量记忆覆盖的楼层从原始上下文移除
  // 注：向量记忆数据不在 buildContext 参数中，此处保留全部历史。
  // 完整的记忆压缩逻辑需要向量记忆服务支持，在记忆服务实现后扩展。

  return { systemPrompt, apiMessages };
};

// ============================================================================
// processRegex - 正则脚本处理
// ============================================================================

/**
 * 受保护内容的正则模式
 *
 * 匹配以下内容使其不被普通正则破坏：
 * - 完整的 HTML 文档（<!DOCTYPE html>...</html>）
 * - HTML 标签（<html>...</html>）
 * - Script 块（<script>...</script>）
 * - Style 块（<style>...</style>）
 * - CoT/Think 块（<cot>...</cot> 或 <think>...</think>，支持未闭合）
 * - Markdown 代码块（```...```）
 * - 行内代码（`...`）
 * - HTML 标签（<tag>）
 */
const PROTECTION_PATTERN =
  /(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think)>[\s\S]*?(?:<\/(?:cot|think)>|<(?:cot|think)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)/gi;

/** 受保护内容的测试模式（用于判断分割后的部分是否受保护） */
const PROTECTION_TEST_PATTERN =
  /^(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think)>[\s\S]*?(?:<\/(?:cot|think)>|<(?:cot|think)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)$/i;

/**
 * 正则脚本处理
 *
 * 遍历启用的正则脚本，按 placement/mode 过滤，执行正则替换。
 * 保护 HTML 文档、Script/Style 块、Markdown 代码块、行内代码、HTML 标签、<cot> 块不被普通正则破坏。
 *
 * @param text - 原始文本
 * @param regexScripts - 正则脚本列表
 * @param placement - 消息位置（1=User, 2=AI）
 * @param user - 用户档案（用于 {{user}} 替换）
 * @returns 处理后的文本
 */
export const processRegex = (
  text: string,
  regexScripts: RegexScript[],
  placement: 1 | 2,
  user: UserProfile,
): string => {
  if (!text) return '';
  if (!regexScripts || regexScripts.length === 0) return text;

  let result = text;

  for (const script of regexScripts) {
    // 检查启用状态：只有显式设置为 false 才跳过
    if (script.enabled === false) continue;

    // Placement 检查（1=User, 2=AI）
    // placement 为 0 时视为全部生效（兼容旧数据）
    const scriptPlacement = script.placement || 0;
    if (scriptPlacement !== 0 && (scriptPlacement & placement) === 0) continue;

    // Mode 检查
    // mode 1 = 仅显示（markdownOnly），发送给 AI 时跳过
    // mode 2 = 仅 AI 可见（promptOnly），发送给 AI 时处理
    // mode 3 或其他 = 两者都处理
    if (script.mode === 1) continue;

    try {
      let regexPattern = script.findRegex;
      let flags = 'g';

      if (!regexPattern) continue;

      // 解析 /pattern/flags 格式
      if (
        regexPattern.startsWith('/') &&
        regexPattern.lastIndexOf('/') > 0
      ) {
        const lastSlash = regexPattern.lastIndexOf('/');
        const potentialFlags = regexPattern.substring(lastSlash + 1);
        if (/^[gimsuy]*$/.test(potentialFlags)) {
          flags = potentialFlags;
          regexPattern = regexPattern.substring(1, lastSlash);
        }
      }

      // 兼容内联修饰符 (?s), (?i), (?m)
      if (regexPattern.includes('(?s)')) {
        regexPattern = regexPattern.replace(/\(\?s\)/g, '');
        if (!flags.includes('s')) flags += 's';
      }
      if (regexPattern.includes('(?i)')) {
        regexPattern = regexPattern.replace(/\(\?i\)/g, '');
        if (!flags.includes('i')) flags += 'i';
      }
      if (regexPattern.includes('(?m)')) {
        regexPattern = regexPattern.replace(/\(\?m\)/g, '');
        if (!flags.includes('m')) flags += 'm';
      }

      const re = new RegExp(regexPattern, flags);

      // 替换 {{user}} 为用户名
      let replacement = script.replaceString || '';
      replacement = replacement.replace(/\{\{user\}\}/g, user.name);

      // 保护逻辑：只有当正则不包含 < 或 > 且不包含 ``` 时，才启用保护
      // 如果正则本身在匹配代码块或 HTML，则跳过保护直接替换
      if (
        !/[<>]/.test(regexPattern) &&
        !regexPattern.includes('```') &&
        script.name !== 'Auto Replace {{user}}'
      ) {
        const parts = result.split(PROTECTION_PATTERN);
        result = parts
          .map((part) => {
            if (!part) return part;
            // 受保护的内容保持原样
            if (PROTECTION_TEST_PATTERN.test(part)) {
              return part;
            }
            // 对普通文本应用替换
            return part.replace(re, replacement);
          })
          .join('');
      } else {
        // 正则明确包含 <, > 或 ```，直接替换
        result = result.replace(re, replacement);
      }
    } catch (e) {
      console.error(
        `Regex error in script "${script.name || 'Unnamed'}":`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return result;
};

// ============================================================================
// extractMemory - 记忆提取
// ============================================================================

/**
 * 记忆提取
 *
 * 在对话正常完成后异步提取记忆，不阻塞主流程。
 * 提取最新的完整对话轮次（1 用户 + 1 AI），生成嵌入向量并存储。
 *
 * 完整的记忆提取需要嵌入模型服务支持，此处为框架实现：
 * - 检查记忆功能是否启用
 * - 获取最新的完整对话轮次
 * - 移除 CoT 内容
 * - 实际嵌入向量生成和存储在记忆服务中实现
 *
 * @param params - 记忆提取参数
 * @returns Promise<void>（异步提取，不阻塞主流程）
 */
export const extractMemory = async (
  params: ExtractMemoryParams,
): Promise<void> => {
  const { messages, character, memorySettings } = params;

  // 检查记忆功能是否启用
  if (!memorySettings.enabled) return;

  // 检查是否有角色和足够的消息
  if (!character || messages.length < 2) return;

  // 获取最新的完整对话轮次（用户 + AI）
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  if (lastUserIndex === -1 || lastUserIndex >= messages.length - 1) return;

  const userMessage = messages[lastUserIndex];
  const assistantMessage = messages[lastUserIndex + 1];
  if (!userMessage || !assistantMessage) return;
  if (assistantMessage.role !== 'assistant') return;

  // 异步提取记忆（不阻塞主流程）
  try {
    // 移除 CoT 内容，只保留正文
    const userContent = parseCot(userMessage.content || '').main;
    const assistantContent = parseCot(assistantMessage.content || '').main;

    if (!userContent.trim() || !assistantContent.trim()) return;

    // 记忆提取日志
    console.log(
      `[Memory] 提取记忆: 角色=${character.name}, ` +
        `用户消息长度=${userContent.length}, ` +
        `AI消息长度=${assistantContent.length}`,
    );

    // TODO: 调用嵌入模型服务生成向量并存储到 IndexedDB
    // 需要嵌入模型服务（embeddingService）实现后扩展：
    // const embedding = await generateEmbedding(
    //   `${userContent}\n\n${assistantContent}`,
    //   memorySettings.embeddingModel,
    //   params.settings,
    // );
    // await storeVectorMemory({
    //   characterUuid: character.uuid,
    //   turn: Math.floor(lastUserIndex / 2) + 1,
    //   content: `${userContent}\n\n${assistantContent}`,
    //   embedding,
    // });
  } catch (e) {
    console.warn('[Memory] 记忆提取失败:', e);
  }
};
