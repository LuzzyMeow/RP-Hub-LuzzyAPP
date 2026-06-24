/**
 * 状态变更操作应用器
 * v0.8.0: 将工具返回的 StateOperation 列表统一应用到 GameState 和 Character
 */

import type {
  TrpgGameState,
  TrpgCharacter,
  GameNpc,
  GameLocation,
  InventoryItem,
} from "~/types/trpg";
import type { StateOperation } from "../trpgTools";

/**
 * 将状态变更操作列表应用到 GameState
 * @returns 新的 GameState（不可变更新）
 */
export function applyStateOperations(
  gameState: TrpgGameState,
  character: TrpgCharacter,
  ops: StateOperation[],
): TrpgGameState {
  let gs = { ...gameState };
  let npcs = [...gs.npcs];
  let locations = [...gs.locations];
  let time = { ...gs.time };

  for (const op of ops) {
    switch (op.type) {
      case "location_change":
        gs.currentLocation = op.location;
        break;

      case "npc_update": {
        const idx = npcs.findIndex((n) => n.npcId === op.npcId);
        if (idx >= 0) {
          npcs[idx] = { ...npcs[idx], ...op.changes };
        }
        break;
      }

      case "npc_reveal": {
        const idx = npcs.findIndex((n) => n.npcId === op.npcId);
        if (idx >= 0) {
          const existing = new Set(npcs[idx].revealedFields);
          for (const f of op.fields) existing.add(f);
          npcs[idx] = {
            ...npcs[idx],
            revealedFields: [...existing],
          };
        }
        break;
      }

      case "map_discover": {
        const exists = locations.some((l) => l.locationId === op.location.locationId);
        if (!exists) {
          locations.push(op.location);
        }
        break;
      }

      case "map_archive": {
        const idx = locations.findIndex((l) => l.locationId === op.locationId);
        if (idx >= 0) {
          locations[idx] = {
            ...locations[idx],
            status: "archived",
            archived: true,
            archiveReason: op.reason,
          };
        }
        break;
      }

      case "time_advance": {
        const totalMinutes = time.hour * 60 + op.minutes;
        const newHour = Math.floor(totalMinutes / 60) % 24;
        const newDay = time.day + Math.floor(totalMinutes / 60 / 24);
        time = { ...time, hour: newHour, day: newDay };
        break;
      }

      case "phase_change":
        gs.phase = op.phase;
        break;

      // HP/条件/物品/装备变更应用到角色卡（见 applyStateOperationsToCharacter）
      case "hp_change":
      case "condition_add":
      case "condition_remove":
      case "inventory_add":
      case "inventory_remove":
      case "inventory_use":
      case "equipment_equip":
      case "xp_add":
        // 这些操作在 applyStateOperationsToCharacter 中处理
        break;
    }
  }

  return {
    ...gs,
    npcs,
    locations,
    time,
  };
}

/**
 * 将状态变更操作列表应用到角色卡
 * @returns 新的角色卡（不可变更新）
 */
export function applyStateOperationsToCharacter(
  character: TrpgCharacter,
  ops: StateOperation[],
): TrpgCharacter {
  let char = { ...character };
  let hp = { ...char.hp };
  let conditions = [...char.conditions];
  let inventory = [...char.inventory];
  let equipment = { ...char.equipment };
  let xp = char.xp;

  for (const op of ops) {
    // HP 变更仅当 target 为 'character' 或角色 charId 时应用
    if (op.type === "hp_change" && (op.target === "character" || op.target === char.charId)) {
      hp.current = Math.max(0, Math.min(hp.max, hp.current + op.delta));
    }

    if (op.type === "condition_add" && (op.target === "character" || op.target === char.charId)) {
      if (!conditions.includes(op.condition)) {
        conditions.push(op.condition);
      }
    }

    if (
      op.type === "condition_remove" &&
      (op.target === "character" || op.target === char.charId)
    ) {
      conditions = conditions.filter((c) => c !== op.condition);
    }

    if (op.type === "inventory_add") {
      const existing = inventory.find((i) => i.name === op.item.name);
      if (existing) {
        existing.quantity += op.item.quantity;
      } else {
        inventory.push(op.item);
      }
    }

    if (op.type === "inventory_remove") {
      const item = inventory.find((i) => i.id === op.itemId);
      if (item) {
        item.quantity -= op.quantity;
        if (item.quantity <= 0) {
          inventory = inventory.filter((i) => i.id !== op.itemId);
        }
      }
    }

    if (op.type === "inventory_use") {
      const item = inventory.find((i) => i.id === op.itemId);
      if (item && item.type === "consumable") {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          inventory = inventory.filter((i) => i.id !== op.itemId);
        }
      }
    }

    if (op.type === "equipment_equip") {
      const item = inventory.find((i) => i.id === op.itemId);
      if (item) {
        if (op.slot === "weapon") equipment.weapon = item.name;
        else if (op.slot === "armor") equipment.armor = item.name;
        else if (op.slot === "shield") equipment.shield = item.name;
      }
    }

    if (op.type === "xp_add") {
      xp += op.amount;
    }
  }

  return {
    ...char,
    hp,
    conditions,
    inventory,
    equipment,
    xp,
  };
}
