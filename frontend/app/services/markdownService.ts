/**
 * Markdown 渲染服务
 *
 * 提供 Markdown 渲染（marked）、HTML 清理（DOMPurify）、
 * CoT 标签解析和图片压缩工具。
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格。
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ============================================================================
// DOMPurify 配置
// ============================================================================

/**
 * DOMPurify 清理配置
 *
 * 允许 details/summary、iframe、SVG、style/script 等标签，
 * 允许交互属性（onclick 等），禁止危险事件（onmouseover、onload）。
 */
const CLEAN_CONFIG = {
  ADD_TAGS: [
    'details', 'summary', 'iframe', 'svg', 'path', 'g', 'circle',
    'rect', 'defs', 'linearGradient', 'stop', 'style', 'div',
    'span', 'button', 'input',
  ],
  ADD_ATTR: [
    'style', 'open', 'srcdoc', 'sandbox', 'frameborder', 'allow',
    'allowfullscreen', 'class', 'id', 'viewBox', 'fill', 'stroke',
    'stroke-width', 'd', 'stroke-linecap', 'stroke-linejoin',
    'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity',
    'width', 'height', 'type', 'value', 'checked', 'data-slash',
  ],
  // DOMPurify 运行时支持 RegExp 属性名匹配，但其 3.4.11 的类型定义
  // 仅声明 FORBID_ATTR?: string[]，故使用类型断言绕过类型限制。
  // 正则 /^on/i 用于禁止所有 on* 事件属性（onclick、onload、onerror 等）。
  FORBID_ATTR: [/^on/i] as unknown as string[],
  FORCE_BODY: true,
};

// ============================================================================
// HTML 清理
// ============================================================================

/**
 * 使用 DOMPurify 清理 HTML
 *
 * 移除危险内容（如 onmouseover、onload 事件），保留安全的标签和属性。
 *
 * @param html - 原始 HTML 字符串
 * @returns 清理后的安全 HTML 字符串
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, CLEAN_CONFIG) as string;
};

// ============================================================================
// Markdown 渲染
// ============================================================================

/**
 * 使用 marked 渲染 Markdown 为 HTML，并经 DOMPurify 清理
 *
 * @param text - Markdown 文本
 * @returns 清理后的 HTML 字符串
 */
export const renderMarkdown = (text: string): string => {
  if (!text) return '';
  const html = marked.parse(text) as string;
  return sanitizeHtml(html);
};

// ============================================================================
// CoT 标签解析
// ============================================================================

/** CoT 解析结果 */
export interface CotParseResult {
  /** 思考链内容 */
  cot: string;
  /** 正文内容（去除 cot/think 标签后） */
  main: string;
  /** 系统指令内容 */
  sys: string;
  /** 思考链是否已完成（闭合标签存在） */
  isFinished: boolean;
}

/** parseCot 结果缓存（仅用于非流式场景，流式场景 content 持续变化缓存永不命中） */
const parseCotCache = new Map<string, CotParseResult>();

/**
 * 解析 `<cot>...</cot>`、`<think>...</think>` 等思考链标签
 *
 * 提取思考链内容并从正文中移除，同时提取末尾的系统指令。
 * 支持未闭合的标签（某些模型常见的错误输出）。
 * 对 CoT 内容中的 `<` 符号进行转义，防止 DOMPurify 吞掉类似 `<动作>` 的标签，
 * 同时跳过代码块（``` 和 `）保证其正常显示。
 *
 * 强制匹配多种标签变体：cot、think、thinking、reasoning、thought、thoughts、
 * reflection、analysis，确保所有模型的思考链都能被提取。
 *
 * v0.4.0: 添加 useCache 参数，流式场景设为 false 避免缓存永不命中且持续写入内存
 *
 * @param content - 原始内容
 * @param useCache - 是否使用缓存（流式场景设为 false），默认 true
 * @returns 解析结果 { cot, main, sys, isFinished }
 */
export const parseCot = (content: string, useCache = true): CotParseResult => {
  if (!content) return { cot: '', main: '', sys: '', isFinished: false };
  if (useCache && parseCotCache.has(content)) {
    return parseCotCache.get(content)!;
  }

  // v0.4.0-patch3: 仅匹配已闭合的标签 + 仅在内容首部出现的未闭合标签
  // 原版正则中 `|<\s*\1\s*>` 与 `|$` 会在两种场景下错误吞掉正文：
  //   1) 流式中 `<think>...` 未闭合时，`|$` 让 `[\s\S]*?` 吃完整字符串，正文为空（气泡空白）
  //   2) 思考内容本身含 `<think>` 等开标签字符串时，被误判为"伪闭合"，思考被截断
  // 修复策略：
  //   - 先匹配所有"已闭合"标签 `<tag>...</tag>` 并从 main 中移除（贪婪安全）
  //   - 再单独处理"未闭合的首个标签"（流式态）：把开标签后所有内容当 cot，main 保持开标签前的部分
  //   - 闭合标签缺斜杠（`<cot>...<cot>`）的情况：仅当首尾完全相同且无 `</tag>` 时降级处理
  const tagNames = ['think', 'thinking', 'cot', 'reasoning', 'thought', 'thoughts', 'reflection', 'analysis'];
  const tagAlternation = tagNames.join('|');

  let cotContent = '';
  let mainContent = content;
  let isFinished = false;

  // Pass 1: 提取所有已闭合的标签 `<tag>...</tag>`
  const closedPattern = new RegExp(`<(${tagAlternation})>([\\s\\S]*?)<\\/\\s*\\1\\s*>`, 'gi');
  mainContent = mainContent.replace(closedPattern, (_match, _tag, inner: string): string => {
    const parts = inner.split(/(```[\s\S]*?```|`[^`]+`)/);
    const escapedContent = parts
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(/</g, '&lt;');
      })
      .join('');
    cotContent += (cotContent ? '\n' : '') + escapedContent;
    isFinished = true;
    return '';
  });

  // Pass 2: 处理首个"未闭合的开标签"（流式过程中的常态）
  // 例如 `正文前缀<think>思考中...`，将思考内容存入 cot，main 仅保留 `正文前缀`
  // 注意：这里 cot 内容不视为 isFinished，且仅处理第一个未闭合标签后所有内容
  const openOnlyPattern = new RegExp(`<(${tagAlternation})>([\\s\\S]*)$`, 'i');
  const openMatch = openOnlyPattern.exec(mainContent);
  if (openMatch) {
    const inner = openMatch[2] ?? '';
    const parts = inner.split(/(```[\s\S]*?```|`[^`]+`)/);
    const escapedContent = parts
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(/</g, '&lt;');
      })
      .join('');
    cotContent += (cotContent ? '\n' : '') + escapedContent;
    mainContent = mainContent.slice(0, openMatch.index);
  }

  // 提取末尾的系统指令
  let sys = '';
  const sysMatch = mainContent.match(/\n\n\[系统指令:\s*([\s\S]*?)\]\s*$/);
  if (sysMatch && sysMatch.index !== undefined) {
    sys = sysMatch[1] ?? '';
    mainContent = mainContent.slice(0, sysMatch.index).trim();
  }

  const result: CotParseResult = {
    cot: cotContent.trim(),
    main: mainContent.trim(),
    sys,
    isFinished,
  };

  // v0.4.0-patch3: 仅完成态写入缓存，避免流式过程中的中间结果污染缓存
  if (useCache) {
    parseCotCache.set(content, result);
    if (parseCotCache.size > 2000) {
      const firstKey = parseCotCache.keys().next().value;
      if (firstKey !== undefined) {
        parseCotCache.delete(firstKey);
      }
    }
  }
  return result;
};

// ============================================================================
// 图片压缩
// ============================================================================

/**
 * 图片压缩工具
 *
 * 通过 Canvas 将图片缩放至指定最大宽度并转为 JPEG 格式。
 * 压缩失败时返回原始 source。
 *
 * @param source - 图片数据 URL 或 URL
 * @param maxWidth - 最大宽度（像素），默认 300
 * @param quality - JPEG 质量（0-1），默认 0.7
 * @returns 压缩后的 JPEG 数据 URL
 */
export const compressImage = (
  source: string,
  maxWidth = 300,
  quality = 0.7,
): Promise<string> => {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.src = source;
    img.onload = (): void => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 填充白色背景，防止透明 PNG 转 JPEG 后变黑
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (): void => resolve(source);
  });
};
