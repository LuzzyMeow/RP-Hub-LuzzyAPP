/**
 * 探索规则子系统
 * v0.8.0: D&D 5e 探索裁决（搜索/解除陷阱/导航/追踪/潜行）
 */

import type { TrpgCharacter, TrpgGameState, DiceResult } from "~/types/trpg";
import { d20Check } from "../dice";
import { skillBonus } from "../skillBonus";
import { DC_REFERENCE } from "../skillBonus";
import type { StateOperation } from "../trpgTools";

/** 探索裁决参数 */
export interface ExploreResolveParams {
  action_type: string;
  dc?: number;
}

/** 探索裁决结果 */
export interface ExploreResolveResult {
  check: DiceResult;
  discovered?: string;
  log: string;
}

/** 解析探索行动 */
export function resolveExplore(
  args: ExploreResolveParams,
  character: TrpgCharacter,
  gameState: TrpgGameState,
): { result: ExploreResolveResult; stateOps: StateOperation[] } {
  const stateOps: StateOperation[] = [];

  // 根据行动类型选择技能
  let skill: "investigation" | "perception" | "survival" | "stealth" | "sleight_of_hand" =
    "perception";
  let defaultDc = 15;

  switch (args.action_type) {
    case "search":
      skill = "investigation";
      defaultDc = DC_REFERENCE.moderate;
      break;
    case "perceive":
      skill = "perception";
      defaultDc = DC_REFERENCE.moderate;
      break;
    case "track":
      skill = "survival";
      defaultDc = DC_REFERENCE.hard;
      break;
    case "sneak":
      skill = "stealth";
      defaultDc = DC_REFERENCE.moderate;
      break;
    case "disarm":
      skill = "sleight_of_hand";
      defaultDc = DC_REFERENCE.hard;
      break;
    case "navigate":
      skill = "survival";
      defaultDc = DC_REFERENCE.easy;
      break;
    default:
      skill = "perception";
  }

  const dc = args.dc ?? defaultDc;
  const bonus = skillBonus(character, skill);
  const check = d20Check(bonus, dc);

  let discovered: string | undefined;
  if (check.success) {
    if (args.action_type === "search" || args.action_type === "perceive") {
      discovered = "发现了隐藏的细节或线索";
    } else if (args.action_type === "track") {
      discovered = "成功追踪到目标的踪迹";
    } else if (args.action_type === "sneak") {
      discovered = "成功潜行，未被察觉";
    }
  }

  return {
    result: {
      check,
      discovered,
      log: `${skill}检定: d20=${check.roll}+${bonus}=${check.total} (DC ${dc}) ${check.success ? "成功" : "失败"}${discovered ? "，" + discovered : ""}`,
    },
    stateOps,
  };
}
