/**
 * 休息规则子系统
 * v0.8.0: D&D 5e 短休/长休
 */

import type { TrpgCharacter, TrpgGameState } from '~/types/trpg';
import { abilityModifier } from '../dice';
import type { StateOperation } from '../trpgTools';

/** 职业生命骰映射 */
const CLASS_HIT_DIE: Record<string, number> = {
  '战士': 10, '圣武士': 10, '游侠': 10, '野蛮人': 12,
  '诗人': 8, '牧师': 8, '德鲁伊': 8, '武僧': 8, '游荡者': 8, '战争学家': 8,
  '术士': 6, '邪术师': 8, '法师': 6,
};

/** 休息裁决参数 */
export interface RestResolveParams {
  rest_type: string;
  location_safety: boolean;
}

/** 休息裁决结果 */
export interface RestResolveResult {
  hpRestored: number;
  hitDiceUsed?: number;
  hitDiceRemaining?: number;
  spellSlotsRestored?: boolean;
  exhaustionRemoved?: number;
  conditionsRemoved: string[];
  timeAdvanced: number;
  log: string;
}

export function resolveRest(
  args: RestResolveParams,
  character: TrpgCharacter,
  gameState: TrpgGameState,
): { result: RestResolveResult; stateOps: StateOperation[] } {
  const stateOps: StateOperation[] = [];

  if (!args.location_safety) {
    return {
      result: { hpRestored: 0, conditionsRemoved: [], timeAdvanced: 0, log: '当前位置不安全，无法休息' },
      stateOps,
    };
  }

  const conMod = abilityModifier(character.abilities.con);
  const hitDieSize = CLASS_HIT_DIE[character.class] ?? 8;
  const totalHitDice = character.level;
  const exhaustedHitDice = Math.floor(totalHitDice / 2);
  const availableHitDice = totalHitDice - exhaustedHitDice;

  if (args.rest_type === 'short') {
    const hpRestored = Math.max(1, Math.floor(hitDieSize / 2) + conMod);
    const conditionsRemoved = character.conditions.filter((c) =>
      ['poisoned', 'diseased', 'stunned', 'charmed'].includes(c.toLowerCase()),
    );

    stateOps.push({ type: 'hp_change', target: 'character', delta: hpRestored });
    for (const cond of conditionsRemoved) {
      stateOps.push({ type: 'condition_remove', target: 'character', condition: cond });
    }
    stateOps.push({ type: 'time_advance', minutes: 60 });

    return {
      result: {
        hpRestored,
        hitDiceUsed: 1,
        hitDiceRemaining: Math.max(0, availableHitDice - 1),
        conditionsRemoved,
        timeAdvanced: 60,
        log: `短休完成，恢复 ${hpRestored} HP，消耗 1 个生命骰（d${hitDieSize}），时间推进 1 小时`,
      },
      stateOps,
    };
  }

  if (args.rest_type === 'long') {
    const hpRestored = character.hp.max - character.hp.current;
    const hasExhaustion = character.conditions.filter((c) => c.toLowerCase().startsWith('exhaustion') || c === '力竭' || c === '力竭1');
    const exhaustionRemoved = hasExhaustion.length > 0 ? 1 : 0;
    const conditionsRemoved = [...character.conditions].filter((c) =>
      !c.toLowerCase().startsWith('exhaustion') && c !== '力竭',
    );

    stateOps.push({ type: 'hp_change', target: 'character', delta: hpRestored });
    for (const cond of conditionsRemoved) {
      stateOps.push({ type: 'condition_remove', target: 'character', condition: cond });
    }
    stateOps.push({ type: 'time_advance', minutes: 8 * 60 });

    return {
      result: {
        hpRestored,
        hitDiceUsed: 0,
        hitDiceRemaining: Math.min(totalHitDice, availableHitDice + Math.floor(totalHitDice / 2)),
        spellSlotsRestored: true,
        exhaustionRemoved,
        conditionsRemoved,
        timeAdvanced: 8 * 60,
        log: `长休完成，恢复 ${hpRestored} HP，恢复全部法术位，恢复半数生命骰${exhaustionRemoved > 0 ? `，移除 1 级力竭` : ''}，时间推进 8 小时`,
      },
      stateOps,
    };
  }

  return {
    result: { hpRestored: 0, conditionsRemoved: [], timeAdvanced: 0, log: `未知的休息类型: ${args.rest_type}` },
    stateOps,
  };
}
