/**
 * CoT + ReAct 六阶段思考链解析
 * v0.8.0: 解析 LLM 输出的结构化思考链
 *
 * 六阶段：
 * 1. Think-1：意图分析（分析用户输入的意图）
 * 2. Think-2：路径规划（规划行动路径）
 * 3. OOC 审查（七项审查清单）
 * 4. 工具调用规则裁决（d20 检定等）
 * 5. Think-4：评审（评分）
 * 6. Narrator：7 段内容（记忆引用/剧情分析/判定汇总/剧情正文/行动选项/状态信息/ReAct反思）
 *
 * 兼容 <cot> 标签降级模式
 */

import type { Think1Result, Think2Result } from '~/types/trpg';

// ============================================================================
// 类型定义
// ============================================================================

/** 思考链节点类型 */
export type ThinkSectionType =
  | 'think1'      // 意图分析
  | 'think2'      // 路径规划
  | 'ooc'         // OOC 审查
  | 'tool_call'   // 工具调用规则裁决
  | 'think4'      // 评审
  | 'narrator';   // Narrator 7 段

/** 思考链节点 */
export interface ThinkSection {
  type: ThinkSectionType;
  title: string;
  content: string;
  status: 'completed' | 'running' | 'error';
  startedAt?: number;
  endedAt?: number;
}

/** Narrator 7 段解析结果 */
export interface NarratorSections {
  memoryRef: string;        // 1. 记忆引用
  plotAnalysis: string;     // 2. 剧情分析
  checkSummary: string;     // 3. 判定汇总
  narrative: string;        // 4. 剧情正文
  actionOptions: Array<{    // 5. 行动选项
    label: 'A' | 'B' | 'C' | 'D' | 'E';
    description: string;
  }>;
  statusInfo: string;       // 6. 状态信息
  reactReflection: string;  // 7. ReAct 反思
}

/** 完整思考链解析结果 */
export interface ParsedThinkChain {
  sections: ThinkSection[];
  narrator?: NarratorSections;
  rawContent: string;
}

// ============================================================================
// 主解析函数
// ============================================================================

/**
 * 解析思考链
 * 从 LLM content 中提取结构化的六阶段思考链
 * @param content LLM 响应内容
 * @returns 解析结果
 */
export function parseThinkSections(content: string): ParsedThinkChain {
  const sections: ThinkSection[] = [];
  let narrator: NarratorSections | undefined;

  if (content.includes('[THINK-') || content.includes('[OOC-REVIEW]')) {
    const bracketResult = parseBracketMode(content);
    sections.push(...bracketResult.sections);
    if (bracketResult.narrator) narrator = bracketResult.narrator;
  } else if (content.includes('<cot>')) {
    const cotResult = parseCotTagMode(content);
    sections.push(...cotResult.sections);
    if (cotResult.narrator) narrator = cotResult.narrator;
  } else {
    const headerResult = parseHeaderMode(content);
    sections.push(...headerResult.sections);
    if (headerResult.narrator) narrator = headerResult.narrator;
  }

  if (!narrator) {
    narrator = parseNarratorSections(content);
  }

  return {
    sections,
    narrator,
    rawContent: content,
  };
}

function parseBracketMode(content: string): { sections: ThinkSection[]; narrator?: NarratorSections } {
  const sections: ThinkSection[] = [];
  const now = Date.now();

  const thinkRegex = /\[THINK-(\d)(?::\s*[^\]]*)?\]([\s\S]*?)\[\/THINK-\1\]/g;
  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(content)) !== null) {
    const num = match[1];
    const body = match[2].trim();
    const type = num === '1' ? 'think1' : num === '2' ? 'think2' : num === '4' ? 'think4' : 'tool_call';
    const title = num === '1' ? 'Think-1：意图分析' : num === '2' ? 'Think-2：路径规划' : num === '4' ? 'Think-4：评审' : `Think-${num}`;
    sections.push({ type, title, content: body, status: 'completed', startedAt: now, endedAt: now });
  }

  const oocRegex = /\[OOC-REVIEW\]([\s\S]*?)\[\/OOC-REVIEW\]/g;
  while ((match = oocRegex.exec(content)) !== null) {
    sections.push({ type: 'ooc', title: 'OOC 审查', content: match[1].trim(), status: 'completed', startedAt: now, endedAt: now });
  }

  const cleanedContent = content
    .replace(/\[THINK-\d(?::\s*[^\]]*)?\][\s\S]*?\[\/THINK-\d\]/g, '')
    .replace(/\[OOC-REVIEW\][\s\S]*?\[\/OOC-REVIEW\]/g, '')
    .trim();

  const narrator = parseNarratorSections(cleanedContent);
  if (narrator) {
    sections.push({ type: 'narrator', title: 'Narrator', content: cleanedContent, status: 'completed', startedAt: now, endedAt: now });
  }

  return { sections, narrator };
}

export function parseOocFromReasoning(reasoningContent: string): Array<{ id: number; name: string; result: 'pass' | 'soft_warn' | 'hard_block'; reason?: string }> {
  const oocMatch = reasoningContent.match(/\[OOC-REVIEW\]\s*([\s\S]*?)\[\/OOC-REVIEW\]/);
  if (!oocMatch) return [];

  try {
    const json = JSON.parse(oocMatch[1].trim());
    if (Array.isArray(json.checks)) return json.checks;
    if (json.id !== undefined) return [json];
    return [];
  } catch {
    return [];
  }
}

export function parseThink1FromReasoning(reasoningContent: string): Think1Result | null {
  const match = reasoningContent.match(/\[THINK-1(?::\s*[^\]]*)?\]([\s\S]*?)\[\/THINK-1\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

export function parseThink2FromReasoning(reasoningContent: string): Think2Result | null {
  const match = reasoningContent.match(/\[THINK-2(?::\s*[^\]]*)?\]([\s\S]*?)\[\/THINK-2\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// ============================================================================
// <cot> 标签模式解析
// ============================================================================

function parseCotTagMode(content: string): { sections: ThinkSection[]; narrator?: NarratorSections } {
  const sections: ThinkSection[] = [];
  const now = Date.now();

  // 提取 <cot>...</cot> 内容
  const cotMatch = content.match(/<cot>([\s\S]*?)<\/cot>/);
  if (cotMatch) {
    const cotContent = cotMatch[1];

    // 解析 Think-1
    const think1Match = cotContent.match(/##\s*Think-1[：:]\s*意图分析[\s\S]*?(?=##\s*Think-2|$)/i);
    if (think1Match) {
      sections.push({
        type: 'think1',
        title: 'Think-1：意图分析',
        content: think1Match[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }

    // 解析 Think-2
    const think2Match = cotContent.match(/##\s*Think-2[：:]\s*路径规划[\s\S]*?(?=##\s*OOC|$)/i);
    if (think2Match) {
      sections.push({
        type: 'think2',
        title: 'Think-2：路径规划',
        content: think2Match[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }

    // 解析 OOC 审查
    const oocMatch = cotContent.match(/##\s*OOC\s*审查[\s\S]*?(?=##\s*工具调用|##\s*Think-4|$)/i);
    if (oocMatch) {
      sections.push({
        type: 'ooc',
        title: 'OOC 审查',
        content: oocMatch[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }

    // 解析工具调用规则裁决
    const toolCallMatch = cotContent.match(/##\s*工具调用[：:]\s*规则裁决[\s\S]*?(?=##\s*Think-4|$)/i);
    if (toolCallMatch) {
      sections.push({
        type: 'tool_call',
        title: '工具调用：规则裁决',
        content: toolCallMatch[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }

    // 解析 Think-4
    const think4Match = cotContent.match(/##\s*Think-4[：:]\s*评审[\s\S]*?(?=##\s*Narrator|<\/cot>|$)/i);
    if (think4Match) {
      sections.push({
        type: 'think4',
        title: 'Think-4：评审',
        content: think4Match[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }
  }

  // 提取 Narrator 7 段（在 </cot> 之后）
  const afterCot = content.replace(/<cot>[\s\S]*?<\/cot>/, '');
  const narrator = parseNarratorSections(afterCot);
  if (narrator) {
    sections.push({
      type: 'narrator',
      title: 'Narrator',
      content: afterCot.trim(),
      status: 'completed',
      startedAt: now,
      endedAt: now,
    });
  }

  return { sections, narrator };
}

// ============================================================================
// ## 标题模式解析
// ============================================================================

function parseHeaderMode(content: string): { sections: ThinkSection[]; narrator?: NarratorSections } {
  const sections: ThinkSection[] = [];
  const now = Date.now();

  // 匹配 ## 标题段落
  const sectionRegex = /##\s*(.+?)\n([\s\S]*?)(?=##\s|$)/g;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();

    let type: ThinkSectionType | null = null;
    let sectionTitle = title;

    if (title.match(/Think-1|意图分析/i)) {
      type = 'think1';
      sectionTitle = 'Think-1：意图分析';
    } else if (title.match(/Think-2|路径规划/i)) {
      type = 'think2';
      sectionTitle = 'Think-2：路径规划';
    } else if (title.match(/OOC|审查/i)) {
      type = 'ooc';
      sectionTitle = 'OOC 审查';
    } else if (title.match(/工具调用|规则裁决/i)) {
      type = 'tool_call';
      sectionTitle = '工具调用：规则裁决';
    } else if (title.match(/Think-4|评审/i)) {
      type = 'think4';
      sectionTitle = 'Think-4：评审';
    } else if (title.match(/Narrator|记忆引用|剧情分析|判定汇总|剧情正文|行动选项|状态信息|ReAct/i)) {
      type = 'narrator';
      sectionTitle = 'Narrator';
    }

    if (type) {
      sections.push({
        type,
        title: sectionTitle,
        content: match[0].trim(),
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }
  }

  // 解析 Narrator 7 段
  const narrator = parseNarratorSections(content);
  if (narrator) {
    // 如果没有 narrator 节点，添加一个
    if (!sections.some((s) => s.type === 'narrator')) {
      sections.push({
        type: 'narrator',
        title: 'Narrator',
        content: content,
        status: 'completed',
        startedAt: now,
        endedAt: now,
      });
    }
  }

  return { sections, narrator };
}

// ============================================================================
// Narrator 7 段解析
// ============================================================================

/**
 * 解析 Narrator 7 段输出
 * 从 content 中提取结构化的 7 段内容
 */
export function parseNarratorSections(content: string): NarratorSections | undefined {
  try {
    const sections: Partial<NarratorSections> = {};

    // 匹配 ## 1. 记忆引用 等标题
    const sectionRegex = /##\s*\d+\.\s*(.+?)\n([\s\S]*?)(?=##\s*\d+\.|$)/g;
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(content)) !== null) {
      const title = match[1].trim();
      const body = match[2].trim();

      if (title.includes('记忆引用')) sections.memoryRef = body;
      else if (title.includes('剧情分析')) sections.plotAnalysis = body;
      else if (title.includes('判定汇总')) sections.checkSummary = body;
      else if (title.includes('剧情正文')) sections.narrative = body;
      else if (title.includes('行动选项')) {
        // 解析 A-E 选项
        const options: NarratorSections['actionOptions'] = [];
        const optRegex = /^([A-E])[.、]\s*(.+)$/gm;
        let optMatch: RegExpExecArray | null;
        while ((optMatch = optRegex.exec(body)) !== null) {
          options.push({
            label: optMatch[1] as 'A' | 'B' | 'C' | 'D' | 'E',
            description: optMatch[2].trim(),
          });
        }
        sections.actionOptions = options;
      } else if (title.includes('状态信息')) sections.statusInfo = body;
      else if (title.includes('ReAct') || title.includes('反思')) sections.reactReflection = body;
    }

    // 只要解析到任意一段即返回
    const hasAny = (sections.memoryRef ?? '') !== '' ||
      (sections.plotAnalysis ?? '') !== '' ||
      (sections.checkSummary ?? '') !== '' ||
      (sections.narrative ?? '') !== '' ||
      (sections.actionOptions ?? []).length > 0 ||
      (sections.statusInfo ?? '') !== '' ||
      (sections.reactReflection ?? '') !== '';

    if (hasAny) {
      return {
        memoryRef: sections.memoryRef ?? '',
        plotAnalysis: sections.plotAnalysis ?? '',
        checkSummary: sections.checkSummary ?? '',
        narrative: sections.narrative ?? '',
        actionOptions: sections.actionOptions ?? [],
        statusInfo: sections.statusInfo ?? '',
        reactReflection: sections.reactReflection ?? '',
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}
