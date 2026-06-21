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

  // v0.4.0-patch4: 仅匹配已闭合的标签，未闭合的标签仅当其后到字符串末尾没有任何 `<` 起始
  // 的"潜在新标签"且无对应闭合时，才视为流式中的未闭合 CoT（避免把正文中的 `<tag>` 字符吞掉）
  // 修复策略：
  //   Pass 1: 提取所有已闭合的 `<tag>...</tag>` 标签（贪婪安全）
  //   Pass 2: 找 mainContent 最后一个 `<tag>` 出现位置，仅当其后无对应 `</tag>` 时视为未闭合 CoT
  //   注意：不再用全局贪婪正则匹配任何位置的 `<tag>`，避免正文中"<think>"字符被误识别
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

  // Pass 2: 处理"未闭合的最后一个开标签"（流式过程中的常态）
  // 寻找 mainContent 中最后一个 `<tag>` 出现位置，且其后没有对应的 `</tag>`
  // 例：`正文前缀<think>思考中...` → cot=`思考中...`，main=`正文前缀`
  // 反例：`正文中提到<think>字样后还有大量正文` 在闭合 `</think>` 缺失下不应吞掉正文
  //       —— 通过限制 Pass 2 仅在"开标签后无任何同名闭合"时触发，避免误吞
  const openTagPattern = new RegExp(`<(${tagAlternation})>`, 'gi');
  let lastOpenMatch: RegExpExecArray | null = null;
  let openMatchIter: RegExpExecArray | null;
  while ((openMatchIter = openTagPattern.exec(mainContent)) !== null) {
    lastOpenMatch = openMatchIter;
  }
  if (lastOpenMatch) {
    const matchTag = lastOpenMatch[1].toLowerCase();
    const afterOpen = mainContent.slice(lastOpenMatch.index + lastOpenMatch[0].length);
    // 检查开标签之后是否有对应的闭合标签
    const closingCheck = new RegExp(`<\\/\\s*${matchTag}\\s*>`, 'i');
    const hasCorrespondingClose = closingCheck.test(afterOpen);
    if (!hasCorrespondingClose) {
      // 未闭合：把开标签后所有内容当 cot，main 保留开标签前的内容
      const parts = afterOpen.split(/(```[\s\S]*?```|`[^`]+`)/);
      const escapedContent = parts
        .map((part, i) => {
          if (i % 2 === 1) return part;
          return part.replace(/</g, '&lt;');
        })
        .join('');
      cotContent += (cotContent ? '\n' : '') + escapedContent;
      mainContent = mainContent.slice(0, lastOpenMatch.index);
    }
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
