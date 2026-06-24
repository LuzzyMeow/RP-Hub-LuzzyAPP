/**
 * 社交规则子系统
 * v0.8.0: D&D 5e 社交裁决（说服/欺瞒/威吓）
 */

import type { TrpgCharacter, TrpgGameState, NpcAttitude, DiceResult } from "~/types/trpg";
import { d20Check } from "../dice";
import { skillBonus } from "../skillBonus";
import type { StateOperation } from "../trpgTools";

/** 社交裁决参数 */
export interface SocialResolveParams {
  npc_id: string;
  action_type: string;
}

/** 社交裁决结果 */
export interface SocialResolveResult {
  check: DiceResult;
  attitudeShift: number;
  newAttitude: NpcAttitude;
  log: string;
}

const ATTITUDE_ORDER: NpcAttitude[] = ["hostile", "unfriendly", "neutral", "friendly", "helpful"];

/** 解析社交行动 */
export function resolveSocial(
  args: SocialResolveParams,
  character: TrpgCharacter,
  gameState: TrpgGameState,
): { result: SocialResolveResult; stateOps: StateOperation[] } {
  const stateOps: StateOperation[] = [];
  const npc = gameState.npcs.find((n) => n.npcId === args.npc_id);

  if (!npc) {
    return {
      result: {
        check: { roll: 0, bonus: 0, total: 0, dc: 0, success: false, critical: "none" },
        attitudeShift: 0,
        newAttitude: "neutral",
        log: `NPC ${args.npc_id} 不在场`,
      },
      stateOps,
    };
  }

  let skill: "persuasion" | "deception" | "intimidation" = "persuasion";
  if (args.action_type === "deceive") skill = "deception";
  else if (args.action_type === "intimidate") skill = "intimidation";

  const bonus = skillBonus(character, skill);

  const ATTITUDE_DC_MOD: Record<NpcAttitude, number> = {
    hostile: 5,
    unfriendly: 0,
    neutral: -5,
    friendly: -10,
    helpful: -15,
  };
  const baseDc = 13;
  const dc = Math.max(3, baseDc + (ATTITUDE_DC_MOD[npc.attitude] ?? 0));
  const check = d20Check(bonus, dc);

  let attitudeShift = Math.floor((check.total - dc) / 5);
  attitudeShift = Math.max(-2, Math.min(2, attitudeShift));
  if (check.critical === "success") attitudeShift = Math.max(attitudeShift, 2);
  else if (check.critical === "failure") attitudeShift = Math.min(attitudeShift, -2);

  const currentIdx = ATTITUDE_ORDER.indexOf(npc.attitude);
  const newIdx = Math.max(0, Math.min(ATTITUDE_ORDER.length - 1, currentIdx + attitudeShift));
  const newAttitude = ATTITUDE_ORDER[newIdx];

  stateOps.push({
    type: "npc_update",
    npcId: npc.npcId,
    changes: { attitude: newAttitude },
  });

  return {
    result: {
      check,
      attitudeShift,
      newAttitude,
      log: `${skill}检定: d20=${check.roll}+${bonus}=${check.total} (DC ${dc}, ${npc.attitude}修正${ATTITUDE_DC_MOD[npc.attitude] ?? 0}) ${check.success ? "成功" : "失败"}，态度从${npc.attitude}变为${newAttitude}（变化${attitudeShift > 0 ? "+" : ""}${attitudeShift}）`,
    },
    stateOps,
  };
}
