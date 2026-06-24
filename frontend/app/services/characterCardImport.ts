/**
 * 角色卡导入公共工具（v0.4.1 新增）
 *
 * 从 characters.tsx 抽取 parsePngCharacterCard、extractRegexScriptsFromCard、
 * extractWorldInfoFromCard、extractUiTemplatesFromCard 等函数,
 * 供 ui-template.tsx、regex.tsx、world-info.tsx 复用,实现"从角色卡导入"功能。
 */

import type { RegexScriptGroup, UiTemplate, WorldInfoEntry } from "~/types/luzzy";

// ============================================================================
// Base64 / PNG 解析
// ============================================================================

/** 解码 base64 字符串为 UTF-8 文本（兼容非 ASCII 字符） */
function decodeBase64Utf8(b64: string): string {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * 解析 PNG 角色卡文件,提取嵌入的 JSON 数据
 *
 * 支持 tEXt、iTXt、zTXt 三种 PNG chunk 类型,keyword 为 chara/character/ccv3
 * v0.4.1: 从 characters.tsx 抽取,保持行为完全一致(含 zTXt 支持与 iTXt base64 解码)
 */
export async function parsePngCharacterCard(file: File): Promise<unknown> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length < 8) throw new Error("无效的 PNG 文件");
  const SUPPORTED_KEYWORDS = ["chara", "character", "ccv3"];
  let offset = 8;
  while (offset < bytes.length) {
    const len =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    offset += 8;
    if (type === "tEXt") {
      // tEXt: keyword\0text (Latin-1)
      const chunkData = bytes.subarray(offset, offset + len);
      const nul = chunkData.indexOf(0);
      if (nul >= 0) {
        const keyword = new TextDecoder("latin1").decode(chunkData.subarray(0, nul));
        if (SUPPORTED_KEYWORDS.includes(keyword)) {
          const b64 = new TextDecoder("latin1").decode(chunkData.subarray(nul + 1));
          try {
            const json = decodeBase64Utf8(b64);
            return JSON.parse(json);
          } catch {
            // base64 解码失败,继续尝试其他 chunk
          }
        }
      }
    } else if (type === "iTXt") {
      // iTXt: keyword\0compressionFlag\0compressionMethod\0languageTag\0translatedKeyword\0text
      const chunkData = bytes.subarray(offset, offset + len);
      const nul1 = chunkData.indexOf(0);
      if (nul1 < 0) {
        offset += len + 4;
        continue;
      }
      const keyword = new TextDecoder().decode(chunkData.subarray(0, nul1));
      if (!SUPPORTED_KEYWORDS.includes(keyword)) {
        offset += len + 4;
        continue;
      }
      const compressionFlag = chunkData[nul1 + 1];
      // 跳过 compressionMethod(1字节)、languageTag(\0)、translatedKeyword(\0)
      let pos = nul1 + 3;
      const nul2 = chunkData.indexOf(0, pos);
      if (nul2 < 0) {
        offset += len + 4;
        continue;
      }
      pos = nul2 + 1;
      const nul3 = chunkData.indexOf(0, pos);
      if (nul3 < 0) {
        offset += len + 4;
        continue;
      }
      const textData = chunkData.subarray(nul3 + 1);
      try {
        let text: string;
        if (compressionFlag === 1) {
          // zlib 压缩,使用 DecompressionStream 解压
          const decompressed = await new Response(
            new Blob([textData]).stream().pipeThrough(new DecompressionStream("deflate")),
          ).text();
          text = decompressed;
        } else {
          text = new TextDecoder().decode(textData);
        }
        // v0.4.1: 与 characters.tsx 保持一致,iTXt 文本也尝试 base64 解码
        const json = decodeBase64Utf8(text);
        return JSON.parse(json);
      } catch {
        // 解码失败,继续尝试
      }
    } else if (type === "zTXt") {
      // zTXt: keyword\0compressionMethod\0compressedText (zlib)
      const chunkData = bytes.subarray(offset, offset + len);
      const nul = chunkData.indexOf(0);
      if (nul >= 0) {
        const keyword = new TextDecoder("latin1").decode(chunkData.subarray(0, nul));
        if (SUPPORTED_KEYWORDS.includes(keyword)) {
          // 跳过 compressionMethod(1字节)
          const compressedData = chunkData.subarray(nul + 2);
          try {
            const decompressed = await new Response(
              new Blob([compressedData]).stream().pipeThrough(new DecompressionStream("deflate")),
            ).text();
            const b64 = decompressed;
            const json = decodeBase64Utf8(b64);
            return JSON.parse(json);
          } catch {
            // 解压失败,继续
          }
        }
      }
    }
    offset += len + 4; // data + CRC
    if (type === "IEND") break;
  }
  throw new Error("PNG 中未找到角色卡数据（支持的 keyword: chara/character/ccv3）");
}

// ============================================================================
// 提取函数
// ============================================================================

/** 角色卡 v2 字符串位置转数字 */
function positionStringToNumber(pos: string): number {
  switch (pos) {
    case "before_char":
      return 0;
    case "after_char":
      return 1;
    case "before_an":
      return 2;
    case "after_an":
      return 3;
    default:
      return 0;
  }
}

/** 从角色卡数据中提取 data 层(兼容 v2 包装格式和 v1 扁平格式) */
function extractCardData(cardData: unknown): Record<string, unknown> {
  if (
    cardData &&
    typeof cardData === "object" &&
    (cardData as Record<string, unknown>).data &&
    typeof (cardData as Record<string, unknown>).data === "object"
  ) {
    return (cardData as Record<string, unknown>).data as Record<string, unknown>;
  }
  return (cardData as Record<string, unknown>) ?? {};
}

/**
 * 从角色卡数据提取世界书条目
 * v0.4.1: 抽取为公共函数,world-info.tsx 可复用
 */
export function extractWorldInfoFromCard(
  cardData: unknown,
  characterUuid: string,
  characterName?: string,
): WorldInfoEntry[] {
  const data = extractCardData(cardData);
  const book = data.character_book as Record<string, unknown> | undefined;
  if (!book || typeof book !== "object") return [];
  const rawEntries = book.entries;
  const entryList: Record<string, unknown>[] = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries && typeof rawEntries === "object"
      ? Object.values(rawEntries as Record<string, unknown>)
      : [];
  const defaultBookName = characterName ? `${characterName}的世界书` : "角色卡世界书";
  return entryList.map((entry, idx) => {
    const rawKeys = entry.keys ?? entry.key;
    const rawSecondary = entry.secondary_keys ?? entry.keysecondary;
    const rawOrder = entry.insertion_order ?? entry.order;
    const rawPosition = entry.position;
    const position =
      typeof rawPosition === "string"
        ? positionStringToNumber(rawPosition)
        : Number(rawPosition ?? 0);
    return {
      id: `${characterUuid}-wi-${idx}-${Date.now()}`,
      name: String(entry.name ?? entry.comment ?? `条目 ${idx + 1}`),
      bookId: characterUuid,
      bookName: String(book.name ?? defaultBookName),
      keys: Array.isArray(rawKeys) ? rawKeys.map(String) : [String(rawKeys ?? "")].filter(Boolean),
      secondaryKeys: Array.isArray(rawSecondary) ? rawSecondary.map(String) : undefined,
      content: String(entry.content ?? ""),
      enabled: true,
      constant: Boolean(entry.constant ?? false),
      order: Number(rawOrder ?? 0),
      position,
      depth: Number(entry.depth ?? 0),
      probability: Number(entry.probability ?? 100),
      insertionOrder: idx,
      useRegex: Boolean(entry.use_regex ?? false),
      selective: Boolean(entry.selective ?? false),
    };
  });
}

/**
 * 从角色卡数据提取正则脚本
 * v0.4.1: 抽取为公共函数,regex.tsx 可复用
 */
export function extractRegexScriptsFromCard(
  cardData: unknown,
  characterUuid: string,
): RegexScriptGroup[] {
  const data = extractCardData(cardData);
  const extensions = data.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];
  const scripts = extensions.regex_scripts as Record<string, unknown>[] | undefined;
  if (!Array.isArray(scripts)) return [];

  const now = Date.now();
  return scripts.map((script, idx) => {
    const scriptName = String(script.scriptName ?? `正则 ${idx + 1}`);
    const groupId = `${characterUuid}-regexgrp-${idx}-${now}`;
    const placement = Number(script.placement ?? 2);
    let scope: RegexScriptGroup["entries"][number]["scope"] = ["character"];
    if (placement === 1) scope = ["user"];
    else if (placement === 2) scope = ["character"];
    else if (placement === 3) scope = ["user", "character"];

    const markdownOnly = Number(script.markdownOnly ?? 0);
    const timing: RegexScriptGroup["entries"][number]["timing"] =
      markdownOnly === 1 ? "display" : "send_display";

    const minDepth = Number(script.minDepth ?? 0);
    return {
      id: groupId,
      name: scriptName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      enabledForCharacters: [characterUuid],
      entries: [
        {
          id: `${groupId}-entry`,
          name: scriptName,
          findRegex: String(script.findRegex ?? ""),
          replaceString: String(script.replaceString ?? ""),
          scope,
          timing,
          paramReplace: "none" as const,
          depthRange: minDepth > 0 ? { min: minDepth, max: Number.MAX_SAFE_INTEGER } : undefined,
          enabled: true,
        },
      ],
    };
  });
}

/**
 * v0.4.1: 从角色卡数据提取 UI 模板
 *
 * 兼容多种字段名:
 * - data.extensions.ui_templates (数组)
 * - data.extensions.prompt_template (字符串,作为单个模板)
 * - data.extensions.ui_template (字符串,作为单个模板)
 */
export function extractUiTemplatesFromCard(cardData: unknown, characterUuid: string): UiTemplate[] {
  const data = extractCardData(cardData);
  const extensions = data.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];

  const templates: UiTemplate[] = [];
  const now = Date.now();

  // 1. 数组格式: extensions.ui_templates
  const uiTemplatesArray = extensions.ui_templates as Record<string, unknown>[] | undefined;
  if (Array.isArray(uiTemplatesArray)) {
    uiTemplatesArray.forEach((tpl, idx) => {
      const content = String(tpl.content ?? tpl.template ?? "");
      if (!content.trim()) return;
      const name = String(tpl.name ?? `角色卡模板 ${idx + 1}`);
      const injectionType = (
        String(tpl.type ?? "markdown").toLowerCase() === "html"
          ? "html"
          : String(tpl.type ?? "markdown").toLowerCase() === "css"
            ? "css"
            : "markdown"
      ) as UiTemplate["injectionType"];
      templates.push({
        id: `${characterUuid}-uitpl-${idx}-${now}`,
        name,
        content,
        enabled: false,
        enabledForCharacters: [characterUuid],
        injectionType,
      });
    });
  }

  // 2. 字符串格式: extensions.prompt_template / extensions.ui_template
  const promptTemplate = String(extensions.prompt_template ?? extensions.ui_template ?? "").trim();
  if (promptTemplate && templates.length === 0) {
    templates.push({
      id: `${characterUuid}-uitpl-0-${now}`,
      name: "角色卡模板",
      content: promptTemplate,
      enabled: false,
      enabledForCharacters: [characterUuid],
      injectionType: "markdown",
    });
  }

  return templates;
}
