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

  // 匹配多种思考链标签变体，支持未闭合的情况
  // 允许闭合标签中存在空格，防止因闭合标签格式不规范（如 </think >）导致正文被吞
  // 同时支持闭合标签缺失斜杠的情况（如 <cot>...<cot>），这是某些模型常见的错误输出
  // 强制匹配：cot、think、thinking、reasoning、thought、thoughts、reflection、analysis
  const cotPattern = /<(think|thinking|cot|reasoning|thought|thoughts|reflection|analysis)>([\s\S]*?)(?:<\/\s*\1\s*>|<\s*\1\s*>|$)/gi;
  let cotContent = '';
  let mainContent = content;
  let isFinished = false;

  // 提取 CoT 内容并从正文中移除
  mainContent = mainContent.replace(
    cotPattern,
    (match: string, tag: string, inner: string): string => {
      // 对 CoT 的内容中的 < 符号进行转义，防止 DOMPurify 吞掉类似 <动作> 或 <thinking> 的标签
      // 通过跳过 ``` 和 ` 块，保证代码块的正常显示和复制功能
      const parts = inner.split(/(```[\s\S]*?```|`[^`]+`)/);
      const escapedContent = parts
        .map((part, i) => {
          if (i % 2 === 1) return part; // 保留代码块原样
          return part.replace(/</g, '&lt;'); // 仅转义左括号，不影响 Markdown 的 > 引用块语法
        })
        .join('');

      cotContent += escapedContent;
      // 如果匹配项包含闭合标签，则认为思维链已结束
      if (
        match.includes('</') ||
        (match.match(new RegExp('<' + tag + '>', 'gi')) || []).length > 1
      ) {
        isFinished = true;
      }
      return '';
    },
  );

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

  parseCotCache.set(content, result);
  // 限制缓存大小，防止超长会话内存泄漏
  if (parseCotCache.size > 2000) {
    const firstKey = parseCotCache.keys().next().value;
    if (firstKey !== undefined) {
      parseCotCache.delete(firstKey);
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
