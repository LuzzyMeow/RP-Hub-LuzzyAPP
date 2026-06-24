/**
 * 升级规则子系统
 * v0.8.0: D&D 5e 经验值与升级
 */

import type { TrpgCharacter } from "~/types/trpg";
import { abilityModifier } from "../dice";
import type { StateOperation } from "../trpgTools";

const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
];

const CLASS_HIT_DIE: Record<string, number> = {
  战士: 10,
  圣武士: 10,
  游侠: 10,
  野蛮人: 12,
  诗人: 8,
  牧师: 8,
  德鲁伊: 8,
  武僧: 8,
  游荡者: 8,
  战争学家: 8,
  术士: 6,
  邪术师: 8,
  法师: 6,
};

const ASI_LEVELS = [4, 8, 12, 16, 19];

export function calculateXpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.min(level, XP_THRESHOLDS.length - 1)] ?? 355000;
}

export function canLevelUp(character: TrpgCharacter): boolean {
  const threshold = calculateXpForLevel(character.level + 1);
  return character.xp >= threshold && character.level < 20;
}

export function applyLevelUp(character: TrpgCharacter): {
  result: {
    newLevel: number;
    hpGained: number;
    proficiencyBonus: number;
    asiAvailable: boolean;
    log: string;
  };
  stateOps: StateOperation[];
} {
  const stateOps: StateOperation[] = [];

  if (!canLevelUp(character)) {
    return {
      result: {
        newLevel: character.level,
        hpGained: 0,
        proficiencyBonus: 0,
        asiAvailable: false,
        log: "经验值不足，无法升级",
      },
      stateOps,
    };
  }

  const newLevel = character.level + 1;
  const conMod = abilityModifier(character.abilities.con);
  const hitDieSize = CLASS_HIT_DIE[character.class] ?? 8;
  const avgRoll = Math.floor(hitDieSize / 2) + 1;
  const hpGained = Math.max(1, avgRoll + conMod);
  const asiAvailable = ASI_LEVELS.includes(newLevel);
  const newProfBonus = 2 + Math.floor((newLevel - 1) / 4);

  stateOps.push({ type: "hp_change", target: "character", delta: hpGained });

  return {
    result: {
      newLevel,
      hpGained,
      proficiencyBonus: newProfBonus,
      asiAvailable,
      log: `升级到 ${newLevel} 级！HP 上限增加 ${hpGained}（d${hitDieSize}均值+${conMod}），熟练加值 ${newProfBonus}${asiAvailable ? "，获得属性提升机会（ASI）" : ""}`,
    },
    stateOps,
  };
}

export function addXp(
  character: TrpgCharacter,
  amount: number,
): { result: { newXp: number; leveledUp: boolean; newLevel: number }; stateOps: StateOperation[] } {
  const stateOps: StateOperation[] = [];
  const newXp = character.xp + amount;

  stateOps.push({ type: "xp_add", amount });

  const leveledUp = newXp >= calculateXpForLevel(character.level + 1);

  return {
    result: { newXp, leveledUp, newLevel: leveledUp ? character.level + 1 : character.level },
    stateOps,
  };
}
