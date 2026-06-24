/**
 * TRPG 工具注册
 * v0.8.0: 注册 D&D 5e 规则引擎工具到 API 请求
 *
 * 所有工具由 TypeScript 本地执行，不信任 LLM 的数值计算。
 */

import type {
  SkillName,
  ActionCategory,
  TrpgCharacter,
  TrpgGameState,
  WorldCard,
  InventoryItem,
  GameNpc,
  GameLocation,
} from "~/types/trpg";

// ============================================================================
// 工具执行上下文
// ============================================================================

/** 工具执行上下文（传入当前角色、游戏状态等） */
export interface TrpgToolContext {
  character: TrpgCharacter;
  gameState: TrpgGameState;
  worldCard: WorldCard | null;
  recentInputs: string[];
}

/** 状态变更操作（在第三阶段统一应用到 GameState） */
export type StateOperation =
  | { type: "hp_change"; target: "character" | string; delta: number }
  | { type: "inventory_add"; item: InventoryItem }
  | { type: "inventory_remove"; itemId: string; quantity: number }
  | { type: "inventory_use"; itemId: string }
  | { type: "equipment_equip"; itemId: string; slot: "weapon" | "armor" | "shield" }
  | { type: "condition_add"; target: "character" | string; condition: string }
  | { type: "condition_remove"; target: "character" | string; condition: string }
  | { type: "location_change"; location: string }
  | { type: "npc_update"; npcId: string; changes: Partial<GameNpc> }
  | { type: "npc_reveal"; npcId: string; fields: string[] }
  | { type: "map_discover"; location: GameLocation }
  | { type: "map_archive"; locationId: string; reason: string }
  | { type: "time_advance"; minutes: number }
  | { type: "xp_add"; amount: number }
  | { type: "phase_change"; phase: TrpgGameState["phase"] };

/** 工具执行结果 */
export interface TrpgToolExecutionResult {
  /** 工具执行结果（返回给 LLM） */
  result: unknown;
  /** 状态变更操作列表（在第三阶段统一应用） */
  stateOps?: StateOperation[];
}

/** 工具执行器类型 */
export type TrpgToolExecutor = (
  args: Record<string, unknown>,
  context: TrpgToolContext,
) => TrpgToolExecutionResult;

// ============================================================================
// 工具 Schema 定义
// ============================================================================

/** TRPG 工具 schema 映射 */
export const TRPG_TOOL_SCHEMAS: Record<
  string,
  { description: string; parameters: Record<string, unknown> }
> = {
  d20_check: {
    description: "执行 d20 检定。bonus 由引擎从角色属性计算，覆盖 LLM 给出的值。",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "D&D 18 技能之一（如 athletics, perception）",
        },
        bonus: {
          type: "number",
          description: "加值（引擎会覆盖此值，从角色属性重新计算）",
        },
        dc: {
          type: "number",
          description: "难度等级（3-27）",
        },
        advantage: {
          type: "boolean",
          description: "是否有优势",
        },
        disadvantage: {
          type: "boolean",
          description: "是否有劣势",
        },
      },
      required: ["skill", "dc"],
    },
  },
  roll_damage: {
    description: "执行伤害掷骰。大成功时骰数翻倍，固定加值不翻倍。",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: '骰子表达式（如 "2d6+3", "1d8"）',
        },
        crit: {
          type: "boolean",
          description: "是否大成功（伤害骰翻倍）",
        },
      },
      required: ["expression"],
    },
  },
  eval_world_rules: {
    description: "遍历世界卡的 laws 和 mods，检查本轮行动是否触发世界规则修正。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "行动分类（combat/social/explore/inventory/rest/info/meta）",
        },
        skill: {
          type: "string",
          description: "使用的技能",
        },
        target_npc: {
          type: "string",
          description: "目标 NPC ID",
        },
      },
      required: ["category"],
    },
  },
  ooc_check_engine: {
    description: "OOC 审查引擎部分（审查项 3/4/6：世界一致性、重复行动、绕过机制）。",
    parameters: {
      type: "object",
      properties: {
        player_input: {
          type: "string",
          description: "玩家本轮输入",
        },
        recent_inputs: {
          type: "array",
          items: { type: "string" },
          description: "最近几轮玩家输入（用于检测重复）",
        },
        phase: {
          type: "string",
          description: "当前游戏阶段（explore/combat/social）",
        },
      },
      required: ["player_input", "phase"],
    },
  },
  combat_resolve: {
    description: "战斗裁决：攻击检定、伤害掷骰、状态附加、HP 扣减。",
    parameters: {
      type: "object",
      properties: {
        attacker_id: {
          type: "string",
          description: "攻击者 ID",
        },
        target_id: {
          type: "string",
          description: "目标 ID",
        },
        action_type: {
          type: "string",
          description: "行动类型（attack/cast/use_item/dodge/disengage/dash/help/ready）",
        },
        weapon: {
          type: "string",
          description: "使用的武器名称",
        },
      },
      required: ["attacker_id", "target_id", "action_type"],
    },
  },
  social_resolve: {
    description: "社交裁决：说服/欺瞒/威吓检定和态度调整。",
    parameters: {
      type: "object",
      properties: {
        npc_id: {
          type: "string",
          description: "目标 NPC ID",
        },
        action_type: {
          type: "string",
          description: "社交行动类型（persuade/deceive/intimidate）",
        },
      },
      required: ["npc_id", "action_type"],
    },
  },
  explore_resolve: {
    description: "探索裁决：搜索/解除陷阱/导航/追踪/潜行。",
    parameters: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          description: "探索行动类型（search/disarm/navigate/track/sneak）",
        },
        dc: {
          type: "number",
          description: "难度等级",
        },
      },
      required: ["action_type"],
    },
  },
  inventory_add: {
    description: "向角色背包添加物品。",
    parameters: {
      type: "object",
      properties: {
        item_name: { type: "string", description: "物品名称" },
        item_type: {
          type: "string",
          description: "物品类型（weapon/armor/consumable/quest/misc）",
        },
        quantity: { type: "number", description: "数量" },
        description: { type: "string", description: "物品描述" },
      },
      required: ["item_name", "quantity"],
    },
  },
  inventory_remove: {
    description: "从角色背包移除物品。",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "物品 ID" },
        quantity: { type: "number", description: "数量" },
      },
      required: ["item_id", "quantity"],
    },
  },
  inventory_use: {
    description: "使用消耗品。",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "物品 ID" },
      },
      required: ["item_id"],
    },
  },
  inventory_equip: {
    description: "装备武器/护甲/盾牌。",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "物品 ID" },
        slot: { type: "string", description: "装备槽位（weapon/armor/shield）" },
      },
      required: ["item_id", "slot"],
    },
  },
  rest_resolve: {
    description: "休息裁决：短休（1小时）或长休（8小时）。",
    parameters: {
      type: "object",
      properties: {
        rest_type: { type: "string", description: "休息类型（short/long）" },
        location_safety: { type: "boolean", description: "当前位置是否安全" },
      },
      required: ["rest_type", "location_safety"],
    },
  },
  npc_reveal: {
    description: "解锁 NPC 信息字段（渐进解锁机制）。",
    parameters: {
      type: "object",
      properties: {
        npc_id: { type: "string", description: "NPC ID" },
        field_keys: {
          type: "array",
          items: { type: "string" },
          description: "要解锁的字段名数组",
        },
      },
      required: ["npc_id", "field_keys"],
    },
  },
  apply_state_delta: {
    description: "将状态变更增量写入 TrpgGameState。",
    parameters: {
      type: "object",
      properties: {
        state_delta: {
          type: "object",
          description: "状态变更增量（10 个布尔追踪字段）",
        },
      },
      required: ["state_delta"],
    },
  },
  advance_time: {
    description: "推进游戏内时间。",
    parameters: {
      type: "object",
      properties: {
        minutes: { type: "number", description: "推进的分钟数" },
      },
      required: ["minutes"],
    },
  },
  update_npc_presence: {
    description: "根据 NPC routine 和当前游戏内时间更新在场状态。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  map_discover: {
    description: "发现新地标，添加到已知地标集合。",
    parameters: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "地标 ID" },
      },
      required: ["location_id"],
    },
  },
  map_archive: {
    description: "归档地标（标记为不可达）。",
    parameters: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "地标 ID" },
        reason: { type: "string", description: "移除原因" },
      },
      required: ["location_id"],
    },
  },
};

// ============================================================================
// 工具描述构建
// ============================================================================

/**
 * 构建 TRPG 工具描述列表（用于 API 请求的 tools 参数）
 * @returns tools 数组，格式与 OpenAI function calling 兼容
 */
export function buildTrpgToolDescriptions(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return Object.entries(TRPG_TOOL_SCHEMAS).map(([name, schema]) => ({
    type: "function" as const,
    function: {
      name,
      description: schema.description,
      parameters: schema.parameters,
    },
  }));
}

// ============================================================================
// 工具执行器（本地执行，不信任 LLM）
// ============================================================================

/**
 * 执行 TRPG 工具调用
 * @param toolName 工具名
 * @param args 参数 JSON
 * @param context 工具执行上下文（角色、游戏状态等）
 * @returns 执行结果 JSON 字符串
 */
export function executeTrpgToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: TrpgToolContext,
): string {
  const executor = TRPG_TOOL_EXECUTORS[toolName];
  if (!executor) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
  try {
    const { result, stateOps } = executor(args, context);
    return JSON.stringify({ result, stateOps: stateOps ?? [] });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

/** 工具执行器映射（由各子系统注册） */
export const TRPG_TOOL_EXECUTORS: Record<string, TrpgToolExecutor> = {};

/**
 * 注册工具执行器
 * @param toolName 工具名
 * @param executor 执行函数
 */
export function registerTrpgToolExecutor(toolName: string, executor: TrpgToolExecutor): void {
  TRPG_TOOL_EXECUTORS[toolName] = executor;
}

// ============================================================================
// 工具执行器注册（模块加载时自动执行）
// ============================================================================

import { d20Check, rollDamage, abilityModifier, proficiencyBonus } from "./dice";
import { skillBonus, SKILL_ABILITY_MAP, DC_REFERENCE } from "./skillBonus";
import { resolveCombat } from "./rules/combat";
import { resolveSocial } from "./rules/social";
import { resolveExplore } from "./rules/explore";
import { resolveRest } from "./rules/rest";
import { addXp } from "./rules/leveling";
import { runOocCheck } from "./rules/oocCheck";
import { scoreAction } from "./rules/think4Scoring";

// 1. d20_check - d20 检定
registerTrpgToolExecutor("d20_check", (args, ctx) => {
  const skill = args.skill as SkillName;
  const dc = Number(args.dc ?? 15);
  const advantage = Boolean(args.advantage);
  const disadvantage = Boolean(args.disadvantage);

  // 引擎从角色属性重新计算 bonus，覆盖 LLM 给出的值
  const bonus = skillBonus(ctx.character, skill);

  const result = d20Check(bonus, dc, { advantage, disadvantage });
  return {
    result: {
      ...result,
      skill,
      bonusBreakdown: {
        ability: SKILL_ABILITY_MAP[skill],
        abilityModifier: abilityModifier(ctx.character.abilities[SKILL_ABILITY_MAP[skill]]),
        proficiencyBonus: proficiencyBonus(ctx.character.level),
        total: bonus,
      },
    },
  };
});

// 2. roll_damage - 伤害掷骰
registerTrpgToolExecutor("roll_damage", (args, ctx) => {
  const expression = String(args.expression ?? "1d4");
  const crit = Boolean(args.crit);
  const result = rollDamage(expression, crit);
  return { result };
});

// 3. eval_world_rules - 世界规则评估
registerTrpgToolExecutor("eval_world_rules", (args, ctx) => {
  const category = String(args.category ?? "meta");
  const skill = args.skill as SkillName | undefined;
  const targetNpc = args.target_npc as string | undefined;

  const laws = ctx.worldCard ? Object.values(ctx.worldCard.snapshot.laws) : [];
  const mods = ctx.worldCard ? Object.values(ctx.worldCard.snapshot.mods) : [];
  const triggeredLaws: string[] = [];
  const triggeredMods: string[] = [];

  for (const law of laws) {
    if (law.scope && category.includes(law.scope.toLowerCase())) {
      triggeredLaws.push(`${law.name}: ${law.body}`);
    }
  }

  for (const mod of mods) {
    if (mod.prose && category.includes(mod.prose.toLowerCase().split(" ")[0])) {
      triggeredMods.push(`${mod.name}: ${mod.prose}`);
    }
  }

  return {
    result: {
      category,
      skill,
      targetNpc,
      triggeredLaws,
      triggeredMods,
      lawCount: laws.length,
      modCount: mods.length,
    },
  };
});

// 4. ooc_check_engine - OOC 审查引擎部分
registerTrpgToolExecutor("ooc_check_engine", (args, ctx) => {
  const playerInput = String(args.player_input ?? "");
  const recentInputs = (args.recent_inputs as string[]) ?? ctx.recentInputs;
  const phase = String(args.phase ?? ctx.gameState.phase);

  const result = runOocCheck(
    { player_input: playerInput, recent_inputs: recentInputs, phase },
    ctx.character,
    ctx.gameState,
    ctx.worldCard,
  );
  return { result };
});

// 5. combat_resolve - 战斗裁决
registerTrpgToolExecutor("combat_resolve", (args, ctx) => {
  const combatArgs = {
    attacker_id: String(args.attacker_id ?? ""),
    target_id: String(args.target_id ?? ""),
    action_type: String(args.action_type ?? "attack"),
    weapon: args.weapon as string | undefined,
  };
  const { result, stateOps } = resolveCombat(combatArgs, ctx.character, ctx.gameState);
  return { result, stateOps };
});

// 6. social_resolve - 社交裁决
registerTrpgToolExecutor("social_resolve", (args, ctx) => {
  const socialArgs = {
    npc_id: String(args.npc_id ?? ""),
    action_type: String(args.action_type ?? "persuade"),
  };
  const { result, stateOps } = resolveSocial(socialArgs, ctx.character, ctx.gameState);
  return { result, stateOps };
});

// 7. explore_resolve - 探索裁决
registerTrpgToolExecutor("explore_resolve", (args, ctx) => {
  const exploreArgs = {
    action_type: String(args.action_type ?? "search"),
    dc: args.dc as number | undefined,
  };
  const { result, stateOps } = resolveExplore(exploreArgs, ctx.character, ctx.gameState);
  return { result, stateOps };
});

// 8. inventory_add - 添加物品
registerTrpgToolExecutor("inventory_add", (args, ctx) => {
  const item: InventoryItem = {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(args.item_name ?? "未知物品"),
    type: (args.item_type as InventoryItem["type"]) ?? "misc",
    quantity: Number(args.quantity ?? 1),
    description: String(args.description ?? ""),
    damageDice: args.damage_dice as string | undefined,
    damageType: args.damage_type as InventoryItem["damageType"] | undefined,
    acBonus: args.ac_bonus as number | undefined,
    effect: args.effect as string | undefined,
    isQuestItem: Boolean(args.is_quest_item),
  };
  return {
    result: { item, added: true },
    stateOps: [{ type: "inventory_add", item }],
  };
});

// 9. inventory_remove - 移除物品
registerTrpgToolExecutor("inventory_remove", (args, ctx) => {
  const itemId = String(args.item_id ?? "");
  const quantity = Number(args.quantity ?? 1);
  return {
    result: { itemId, quantity, removed: true },
    stateOps: [{ type: "inventory_remove", itemId, quantity }],
  };
});

// 10. inventory_use - 使用消耗品
registerTrpgToolExecutor("inventory_use", (args, ctx) => {
  const itemId = String(args.item_id ?? "");
  return {
    result: { itemId, used: true },
    stateOps: [{ type: "inventory_use", itemId }],
  };
});

// 11. inventory_equip - 装备物品
registerTrpgToolExecutor("inventory_equip", (args, ctx) => {
  const itemId = String(args.item_id ?? "");
  const slot = (args.slot as "weapon" | "armor" | "shield") ?? "weapon";
  return {
    result: { itemId, slot, equipped: true },
    stateOps: [{ type: "equipment_equip", itemId, slot }],
  };
});

// 12. rest_resolve - 休息裁决
registerTrpgToolExecutor("rest_resolve", (args, ctx) => {
  const restArgs = {
    rest_type: String(args.rest_type ?? "short") as "short" | "long",
    location_safety: Boolean(args.location_safety ?? true),
  };
  const { result, stateOps } = resolveRest(restArgs, ctx.character, ctx.gameState);
  return { result, stateOps };
});

// 13. npc_reveal - 解锁 NPC 信息
registerTrpgToolExecutor("npc_reveal", (args, ctx) => {
  const npcId = String(args.npc_id ?? "");
  const fieldKeys = (args.field_keys as string[]) ?? [];
  return {
    result: { npcId, revealedFields: fieldKeys },
    stateOps: [{ type: "npc_reveal", npcId, fields: fieldKeys }],
  };
});

// 14. apply_state_delta - 应用状态变更增量
registerTrpgToolExecutor("apply_state_delta", (args, ctx) => {
  const stateDelta = args.state_delta as Record<string, unknown>;
  return {
    result: { applied: true, stateDelta },
  };
});

// 15. advance_time - 推进时间
registerTrpgToolExecutor("advance_time", (args, ctx) => {
  const minutes = Number(args.minutes ?? 0);
  return {
    result: { minutes, newTime: { ...ctx.gameState.time } },
    stateOps: [{ type: "time_advance", minutes }],
  };
});

// 16. update_npc_presence - 更新 NPC 在场状态
registerTrpgToolExecutor("update_npc_presence", (args, ctx) => {
  const currentHour = ctx.gameState.time.hour;
  const updatedNpcs: string[] = [];

  for (const npc of ctx.gameState.npcs) {
    // 简单逻辑：根据 routine 判断是否在场（这里仅返回状态，不生成 stateOps）
    if (npc.presence === "present") {
      updatedNpcs.push(npc.npcId);
    }
  }

  return {
    result: { currentHour, presentNpcs: updatedNpcs },
  };
});

// 17. map_discover - 发现新地标
registerTrpgToolExecutor("map_discover", (args, ctx) => {
  const locationId = String(args.location_id ?? "");
  const location: GameLocation = {
    locationId,
    name: args.location_name ? String(args.location_name) : `地标 ${locationId}`,
    status: "unexplored",
    exploredRatio: 0,
  };
  return {
    result: { location, discovered: true },
    stateOps: [{ type: "map_discover", location }],
  };
});

// 18. map_archive - 归档地标
registerTrpgToolExecutor("map_archive", (args, ctx) => {
  const locationId = String(args.location_id ?? "");
  const reason = String(args.reason ?? "未知原因");
  return {
    result: { locationId, archived: true, reason },
    stateOps: [{ type: "map_archive", locationId, reason }],
  };
});
