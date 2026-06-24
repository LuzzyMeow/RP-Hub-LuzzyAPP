import { describe, test, expect } from "vitest";
import {
  buildTrpgToolDescriptions,
  executeTrpgToolCall,
  TRPG_TOOL_EXECUTORS,
} from "../trpg/trpgTools";
import type { TrpgToolContext } from "../trpg/trpgTools";
import type { TrpgCharacter } from "../../types/trpg";

const mockCharacter: TrpgCharacter = {
  charId: "test-char",
  name: "测试角色",
  race: "人类",
  class: "战士",
  level: 1,
  abilities: { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
  hp: { current: 12, max: 12 },
  ac: 16,
  proficientSkills: ["athletics", "perception"],
  expertiseSkills: [],
  conditions: [],
  inventory: [],
  equipment: { weapon: "长剑", armor: "锁甲" },
  classFeatures: ["二武器战斗"],
  xp: 0,
  background: "士兵",
  alignment: "守序中立",
};

const mockContext: TrpgToolContext = {
  character: mockCharacter,
  gameState: {
    saveId: "test-save",
    roundNumber: 0,
    activeCharacterId: "test-char",
    currentLocation: "酒馆",
    phase: "explore",
    world: {},
    quests: [],
    time: { day: 1, hour: 10, calendarEra: "第一纪元" },
    factionRelations: {},
    npcs: [],
    locations: [],
  },
  worldCard: null,
  recentInputs: [],
};

describe("TRPG 工具注册与执行", () => {
  test("所有 schema 都有对应的执行器", () => {
    const tools = buildTrpgToolDescriptions();
    const registered = Object.keys(TRPG_TOOL_EXECUTORS);
    for (const tool of tools) {
      expect(registered).toContain(tool.function.name);
    }
    expect(tools.length).toBe(18);
    expect(registered.length).toBe(18);
  });

  test("d20_check 工具执行正常", () => {
    const result = executeTrpgToolCall("d20_check", { skill: "perception", dc: 15 }, mockContext);
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(parsed.result).toBeDefined();
    expect(parsed.result.skill).toBe("perception");
    expect(parsed.result.bonusBreakdown).toBeDefined();
  });

  test("roll_damage 工具执行正常", () => {
    const result = executeTrpgToolCall(
      "roll_damage",
      { expression: "2d6+3", crit: false },
      mockContext,
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(parsed.result.total).toBeDefined();
  });

  test("inventory_add 工具返回 stateOps", () => {
    const result = executeTrpgToolCall(
      "inventory_add",
      { item_name: "治疗药水", item_type: "consumable", quantity: 2, description: "恢复 2d4+2 HP" },
      mockContext,
    );
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeUndefined();
    expect(parsed.stateOps).toHaveLength(1);
    expect(parsed.stateOps[0].type).toBe("inventory_add");
  });

  test("未知工具返回错误", () => {
    const result = executeTrpgToolCall("unknown_tool", {}, mockContext);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Unknown tool");
  });
});
