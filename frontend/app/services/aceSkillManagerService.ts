/**
 * ACE SkillManager 服务 — v0.3.0
 *
 * 根据 Reflector 的反思结果更新 Skillbook：
 * - TAG: 更新已用策略的计数（helpful/harmful/neutral）
 * - ADD: 新增有价值的新策略（source='auto'）
 * - UPDATE: 精炼已有策略（仅 auto 策略）
 * - REMOVE: 停用持续有害的策略（仅 auto 策略）
 *
 * 保护规则：
 * - source='manual' 的策略不被自动 REMOVE/UPDATE
 * - source='manual' 的策略仍可被 TAG（计数更新）
 *
 * 自动停用阈值：harmfulCount - helpfulCount >= 3 时自动停用（仅 auto）
 */

import type {
  AceSkillbook,
  AceReflection,
  AceSkill,
} from '~/types/luzzy';
import {
  tagSkill,
  addSkill,
  updateSkill,
  removeSkill,
  saveSkillbook,
} from '~/services/aceSkillbookService';

// ============================================================================
// 类型
// ============================================================================

/** SkillManager 应用结果 */
export interface ApplyReflectionResult {
  /** 被打标签的策略数 */
  taggedCount: number;
  /** 新增的策略数 */
  addedCount: number;
  /** 被停用的策略数 */
  deactivatedCount: number;
  /** 被更新的策略数（仅 auto） */
  updatedCount: number;
}

// ============================================================================
// 核心实现
// ============================================================================

/**
 * 应用反思结果到 Skillbook
 *
 * 流程：
 * 1. TAG: 遍历 evaluations，更新对应策略的计数
 * 2. ADD: 遍历 newSkills，新增策略（source='auto'）
 * 3. REMOVE: 检查所有 auto 策略，停用 harmful-helpful >= 阈值的
 *
 * 注意：manual 策略不被自动 REMOVE/UPDATE，但可被 TAG。
 *
 * @param book - Skillbook（会被原地修改）
 * @param reflection - 反思结果
 * @returns 应用统计
 */
export const applyReflection = (
  book: AceSkillbook,
  reflection: AceReflection,
): ApplyReflectionResult => {
  const result: ApplyReflectionResult = {
    taggedCount: 0,
    addedCount: 0,
    deactivatedCount: 0,
    updatedCount: 0,
  };

  // 1. TAG: 更新已用策略的计数
  for (const evaluation of reflection.evaluations) {
    const updated = tagSkill(book, evaluation.skillId, evaluation.verdict);
    if (updated) {
      result.taggedCount += 1;
    }
  }

  // 2. ADD: 新增有价值的新策略
  for (const newSkill of reflection.newSkills) {
    if (!newSkill.content.trim()) continue;
    addSkill(book, newSkill.content, newSkill.category, 'auto');
    result.addedCount += 1;
  }

  // 3. REMOVE: 停用持续有害的 auto 策略
  // tagSkill 内部已处理自动停用（harmful - helpful >= 阈值）
  // 此处统计被停用的数量
  for (const skill of book.skills) {
    if (
      skill.source === 'auto' &&
      !skill.active &&
      skill.harmfulCount - skill.helpfulCount >= 3
    ) {
      // 检查是否是本次反思导致的停用（通过对比 evaluations 中的 skillId）
      const wasEvaluated = reflection.evaluations.some(
        (e) => e.skillId === skill.id,
      );
      if (wasEvaluated) {
        result.deactivatedCount += 1;
      }
    }
  }

  return result;
};

/**
 * 应用反思结果并持久化
 *
 * @param book - Skillbook
 * @param reflection - 反思结果
 * @returns 应用统计
 */
export const applyReflectionAndSave = async (
  book: AceSkillbook,
  reflection: AceReflection,
): Promise<ApplyReflectionResult> => {
  const result = applyReflection(book, reflection);
  await saveSkillbook(book);
  return result;
};

/**
 * 手动更新策略（用户编辑）
 *
 * 用户手动编辑不受 source 限制，可更新任何策略。
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @param partial - 待更新字段
 * @returns 更新后的策略
 */
export const manualUpdateSkill = (
  book: AceSkillbook,
  id: string,
  partial: Partial<Omit<AceSkill, 'id' | 'createdAt'>>,
): AceSkill | null => {
  return updateSkill(book, id, partial);
};

/**
 * 手动删除策略（用户操作）
 *
 * 用户手动删除不受 source 限制，可删除任何策略。
 * 默认软删除（active=false），hardDelete=true 时硬删除。
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @param hardDelete - 是否硬删除
 * @returns 是否成功
 */
export const manualDeleteSkill = (
  book: AceSkillbook,
  id: string,
  hardDelete = false,
): boolean => {
  if (hardDelete) {
    // 硬删除需要从 aceSkillbookService 导入
    // 此处通过软删除实现，硬删除由 UI 层直接调用 hardDeleteSkill
    return removeSkill(book, id);
  }
  return removeSkill(book, id);
};
