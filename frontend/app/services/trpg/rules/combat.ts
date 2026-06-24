/**
 * 战斗规则子系统
 * v0.8.0: D&D 5e 战斗裁决
 */

import type { TrpgCharacter, TrpgGameState, DiceResult, DamageResult } from '~/types/trpg';
import { d20Check, rollDamage, abilityModifier, proficiencyBonus } from '../dice';
import { skillBonus } from '../skillBonus';
import type { StateOperation } from '../trpgTools';

/** 战斗裁决参数 */
export interface CombatResolveParams {
  attacker_id: string;
  target_id: string;
  action_type: string;
  weapon?: string;
}

/** 战斗裁决结果 */
export interface CombatResolveResult {
  attackRoll?: DiceResult;
  damage?: DamageResult;
  targetHp?: number;
  conditionsApplied?: string[];
  log: string;
}

/** 解析战斗行动 */
export function resolveCombat(
  args: CombatResolveParams,
  character: TrpgCharacter,
  gameState: TrpgGameState,
): { result: CombatResolveResult; stateOps: StateOperation[] } {
  const stateOps: StateOperation[] = [];
  const isPlayerAttacker = args.attacker_id === character.charId;
  const targetNpc = gameState.npcs.find((n) => n.npcId === args.target_id);
  const targetAc = targetNpc?.ac ?? 15;

  if (args.action_type === 'attack') {
    const weapon = character.equipment.weapon ?? '徒手';
    const isFinesse = ['匕首', '短剑', '细剑', '鞭子'].some((w) => weapon.includes(w));
    const strMod = abilityModifier(character.abilities.str);
    const dexMod = abilityModifier(character.abilities.dex);
    const attackMod = isFinesse ? Math.max(strMod, dexMod) : strMod;
    const profBonus = proficiencyBonus(character.level);
    const attackBonus = attackMod + profBonus;

    const attackRoll = d20Check(attackBonus, targetAc);

    let damage: DamageResult | undefined;
    if (attackRoll.success) {
      const weaponDice = character.inventory.find((i) => i.name === weapon)?.damageDice ?? '1d8';
      damage = rollDamage(`${weaponDice}+${attackMod}`, attackRoll.critical === 'success');
    }

    let targetHp: number | undefined;
    if (targetNpc && damage) {
      targetHp = Math.max(0, targetNpc.hp.current - damage.total);
      stateOps.push({
        type: 'hp_change',
        target: args.target_id,
        delta: -damage.total,
      });
    }

    return {
      result: {
        attackRoll,
        damage,
        targetHp,
        log: `攻击检定: d20=${attackRoll.roll}+${attackBonus}=${attackRoll.total} (AC ${targetAc}) ${attackRoll.success ? '命中' : '未命中'}${damage ? `，伤害 ${damage.total}` : ''}`,
      },
      stateOps,
    };
  }

  if (args.action_type === 'cast') {
    return {
      result: { log: '施法行动：消耗法术位并执行法术效果（具体效果由 GM 在叙事中描述）' },
      stateOps,
    };
  }

  if (args.action_type === 'use_item') {
    return {
      result: { log: '使用物品行动：消耗品/道具使用（具体效果由 GM 在叙事中描述）' },
      stateOps,
    };
  }

  if (args.action_type === 'help') {
    return {
      result: { log: '协助行动：为友方单位的下一次攻击检定提供优势条件' },
      stateOps,
    };
  }

  if (args.action_type === 'ready') {
    return {
      result: { log: '准备动作：设定触发条件和响应动作，在触发时以反应执行' },
      stateOps,
    };
  }

  if (args.action_type === 'dodge') {
    stateOps.push({
      type: 'condition_add',
      target: 'character',
      condition: 'dodging',
    });
    return {
      result: { log: '采取闪避动作，本回合对角色的攻击检定具有劣势' },
      stateOps,
    };
  }

  if (args.action_type === 'dash') {
    return {
      result: { log: '采取疾跑动作，本回合移动距离加倍' },
      stateOps,
    };
  }

  if (args.action_type === 'disengage') {
    return {
      result: { log: '采取脱离动作，本回合移动不会引发借机攻击' },
      stateOps,
    };
  }

  return {
    result: { log: `未知的战斗行动: ${args.action_type}` },
    stateOps,
  };
}
