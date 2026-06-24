/**
 * 设计模式工具注册
 * v0.8.3: 世界卡构建专用工具，通过 function calling 让 LLM 逐步生成/修改世界卡字段
 *
 * 所有工具只修改内存中的 DesignSession 草稿，不会直接写入 IndexedDB。
 * 只有用户确认保存或调用 finalize_world_card 时，才会落盘到 worldCards store。
 *
 * v0.8.3: schema 破坏性升级，完全对标 trpg标准世界卡 结构
 */

import { v4 as uuidv4 } from "uuid";
import type {
  DesignToolContext,
  DesignToolResult,
  WorldCard,
  WorldSetting,
  WorldSettingSite,
  WorldSettingSpot,
  CharacterDatabaseEntry,
  WorldTimelineEvent,
  TimelineLocation,
  PromptModule,
  PromptModuleMeta,
  PanelFieldDef,
  WorldLaw,
  WorldMod,
  WorldArtifact,
  WorldTerms,
  ContentRating,
  WorldCardValidationReport,
} from "~/types/trpg";

// ============================================================================
// 工具 Schema 定义
// ============================================================================

export const DESIGN_MODE_TOOL_SCHEMAS: Record<
  string,
  { description: string; parameters: Record<string, unknown> }
> = {
  write_card: {
    description:
      "创建/重写世界卡骨架（顶层 name/description/contentLocale + manifest + 空 snapshot 脚手架）。第一次构建时必须调用。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "世界卡名称（如「兽原异世」）" },
        description: { type: "string", description: "一句话概述" },
        contentLocale: {
          type: "string",
          description: "内容语言区域（如 zh-CN）",
        },
        source: { type: "string", description: "来源标记（user_created / builtin）" },
        author_display_name: { type: "string", description: "作者显示名" },
        schema_version: { type: "number", description: "schema 版本号，默认 2" },
      },
      required: ["name", "description"],
    },
  },
  patch_card: {
    description: "对世界卡 snapshot 进行批量增删改操作（JSON Patch 风格）。每次可提交多个 ops。",
    parameters: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          description: "操作列表，每个 op 含 path 和 value/op",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: ["add", "replace", "remove"],
                description: "操作类型",
              },
              path: {
                type: "string",
                description: "目标路径（如 /snapshot/world_setting/settings/bonechain_town）",
              },
              value: { description: "新值（add/replace 时必填）" },
            },
            required: ["op", "path"],
          },
        },
      },
      required: ["ops"],
    },
  },
  set_world_terms: {
    description: "设置世界术语（货币名、历法纪元、时间精度、历法单位、地标层级等）。",
    parameters: {
      type: "object",
      properties: {
        currency_name: { type: "string" },
        calendar_era: { type: "string" },
        time_precision: { type: "string", description: "date / time / datetime" },
        calendar_units: { type: "array", items: { type: "string" } },
        location_levels: { type: "array", items: { type: "string" } },
        extra_status_groups: { type: "array", items: { type: "string" } },
        extra_char_fields: { type: "array", items: { type: "string" } },
      },
    },
  },
  set_design_meta: {
    description: "设置设计元数据（phase / p2Stage / p1Output 五维框架）。",
    parameters: {
      type: "object",
      properties: {
        phase: { type: "string" },
        p2Stage: { type: "number" },
        p1Output: { type: "object", description: "五维框架输出对象" },
      },
    },
  },
  add_world_setting: {
    description:
      "添加一个地理实体到 world_setting.settings（含 6 章节、sites、spots、atmosphere）。",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "实体 ID（snake_case）" },
        display_name: { type: "string", description: "显示名" },
        atmosphere: { type: "string", description: "整体氛围描写" },
        here_now: { type: "array", items: { type: "string" }, description: "当前状态条目" },
        social_fabric: { type: "array", items: { type: "string" }, description: "社会结构条目" },
        order: { type: "array", items: { type: "string" }, description: "秩序与法律条目" },
        world_law: { type: "array", items: { type: "string" }, description: "自然法则条目" },
        rhythm: { type: "array", items: { type: "string" }, description: "生活节奏条目" },
        narrative_core: { type: "array", items: { type: "string" }, description: "叙事核心条目" },
        sites: {
          type: "array",
          description: "子地点列表",
          items: {
            type: "object",
            properties: {
              site: { type: "string", description: "地点名" },
              atmosphere: { type: "string", description: "地点氛围" },
              spots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    spot: { type: "string", description: "点位名" },
                    atmosphere: { type: "string", description: "点位氛围" },
                  },
                  required: ["spot"],
                },
              },
            },
            required: ["site"],
          },
        },
        narrative_core_characters: {
          type: "array",
          items: { type: "string" },
          description: "核心角色 ID 列表",
        },
      },
      required: ["entity_id", "display_name", "atmosphere"],
    },
  },
  set_world_setting_summary: {
    description: "设置 world_setting 顶层 _summary。",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "地理实体集合总览摘要" },
      },
      required: ["summary"],
    },
  },
  add_character: {
    description: "添加一个角色到 character_database。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "角色 ID（snake_case，格式 entity_id_序号_英文名）" },
        name: { type: "string" },
        gender: { type: "string" },
        origin: { type: "string", description: "出身背景" },
        birthday: { type: "string", description: "生日（纪元格式），未知时 null" },
        cognitive_state: { type: "string", description: "认知状态" },
        initial_status: { type: "string", description: "初始状态描写" },
        dialogue_tone: { type: "string", description: "对话语气风格" },
        role_marker: { type: "string", description: "角色标记（主角/配角），可 null" },
        role: { type: "string", description: "角色定位" },
        species: { type: "string", description: "种族" },
        profession: { type: "string", description: "职业" },
        affiliation: { type: "string", description: "所属势力" },
        combat_style: { type: "string", description: "战斗风格" },
        personality: { type: "string", description: "性格（标签式，/分隔）" },
        appearance: { type: "string", description: "外貌特征" },
        clothing: { type: "string", description: "当前衣着" },
        hidden_motive: { type: "string", description: "隐藏动机" },
        scar_mark: { type: "string", description: "疤痕/标记" },
        stance: { type: "string", description: "当前立场" },
        faction: { type: "string", description: "阵营" },
        current_goal: { type: "string", description: "当前目标" },
        is_protagonist: { type: "boolean", description: "是否主角" },
        relationships: {
          type: "object",
          description: "关系映射（目标 ID → 关系描述）",
          additionalProperties: { type: "string" },
        },
        dialogue_examples: {
          type: "object",
          properties: {
            in_person: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  context: { type: "string" },
                  line: { type: "string" },
                },
                required: ["context", "line"],
              },
            },
            sms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  context: { type: "string" },
                  line: { type: "string" },
                },
                required: ["context", "line"],
              },
            },
          },
        },
      },
      required: ["id", "name", "gender", "origin", "species", "profession", "affiliation"],
    },
  },
  set_character_database_summary: {
    description: "设置 character_database 顶层 _summary。",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
  add_timeline_event: {
    description: "添加一个世界时间线事件到 world_timeline.events。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "事件 ID（snake_case）" },
        time: { type: "string", description: "时间（纪元格式，如 魔元历327.05.12 15:30）" },
        day: { type: "string", description: "日期标签（如 12日）" },
        time_str: { type: "string", description: "时间标签（如 15:30）" },
        location_country: { type: "string", description: "国家/大区" },
        location_site: { type: "string", description: "城邦/地区" },
        location_spot: { type: "string", description: "具体地点" },
        characters: { type: "string", description: "相关角色（逗号分隔）" },
        content: { type: "string", description: "事件叙述" },
        entity_refs: { type: "array", items: { type: "string" }, description: "关联实体 ID" },
        character_refs: { type: "array", items: { type: "string" }, description: "关联角色 ID" },
      },
      required: ["id", "time", "content"],
    },
  },
  set_timeline_summary: {
    description: "设置 world_timeline 顶层 _summary。",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
  add_prompt_module: {
    description:
      "添加一个 Prompt 模块到 prompt_modules.modules（key 为模块名：core_world_mechanics/init/narrative_base/npc_gen）。",
    parameters: {
      type: "object",
      properties: {
        module_name: {
          type: "string",
          enum: ["core_world_mechanics", "init", "narrative_base", "npc_gen"],
          description: "模块名",
        },
        description: { type: "string", description: "模块描述" },
        content: { type: "string", description: "模块内容" },
        when_to_call: { type: "string" },
        avoid_when: { type: "string" },
        input_focus: { type: "string" },
        expected_output: { type: "string" },
      },
      required: ["module_name", "content"],
    },
  },
  set_prompt_modules_summary: {
    description: "设置 prompt_modules 顶层 _summary。",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
  set_panel_fields: {
    description: "设置 panel_fields（状态栏字段定义 + NPC 面板字段定义 + worldTermsSource）。",
    parameters: {
      type: "object",
      properties: {
        panel_status: {
          type: "array",
          description: "状态栏字段定义列表",
          items: { type: "object" },
        },
        panel_npc: {
          type: "array",
          description: "NPC 面板字段定义列表",
          items: { type: "object" },
        },
        world_terms_source: { type: "object", description: "世界术语来源对象" },
      },
    },
  },
  add_law: {
    description: "添加一条世界法则到 laws。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "法则 ID（snake_case）" },
        scope: { type: "string", description: "适用范围" },
        name: { type: "string", description: "法则名" },
        body: { type: "string", description: "法则正文" },
        binding: { type: "string", description: "约束力（hard/soft/advisory）" },
      },
      required: ["id", "scope", "name", "body", "binding"],
    },
  },
  add_mod: {
    description: "添加一条自定义机制/模组到 mods。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "机制 ID（snake_case）" },
        name: { type: "string", description: "机制名" },
        ref: { type: "string", description: "引用（如 official:general-check）" },
        config: { type: "object", description: "配置对象" },
        prose: { type: "string", description: "机制叙述文本" },
        owns_vars: { type: "array", items: { type: "object" }, description: "拥有的变量列表" },
        hooks: { type: "array", items: { type: "object" }, description: "钩子列表" },
      },
      required: ["id", "name", "ref", "prose"],
    },
  },
  add_artifact: {
    description: "添加一个关键道具/神器到 artifacts。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "道具 ID（snake_case）" },
        name: { type: "string" },
        desc: { type: "string", description: "描述" },
        owner: { type: "string", description: "持有者角色 ID" },
        location: { type: "string", description: "所在位置" },
        attrs: { type: "object", description: "属性映射" },
      },
      required: ["id", "name", "desc", "owner", "location"],
    },
  },
  set_opening_greeting: {
    description: "设置开场白（150-350 字，in-medias-res，含纪年词，不发问，结尾停在空位）。",
    parameters: {
      type: "object",
      properties: {
        greeting: { type: "string", description: "开场白文本" },
      },
      required: ["greeting"],
    },
  },
  set_relationship_rules: {
    description: "设置关系规则（relationship_rules）。",
    parameters: {
      type: "object",
      properties: {
        rules: { type: "object", description: "关系规则对象" },
      },
      required: ["rules"],
    },
  },
  finalize_world_card: {
    description: "对世界卡运行完整校验，通过后将当前草稿标记为可发布状态。",
    parameters: {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "是否确认发布" },
      },
      required: ["confirm"],
    },
  },
  rollback_stage: {
    description: "回退到上一个设计阶段（仅 Stage 1/2/3 可用）。",
    parameters: {
      type: "object",
      properties: {
        targetStage: { type: "number", enum: [0, 1, 2], description: "目标阶段" },
      },
      required: ["targetStage"],
    },
  },
  query_card: {
    description: "查询世界卡当前状态（返回完整 JSON 供检查）。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "查询路径（如 /snapshot/world_setting）" },
      },
    },
  },
};

// ============================================================================
// 工具描述构建
// ============================================================================

export function buildDesignModeToolDescriptions(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return Object.entries(DESIGN_MODE_TOOL_SCHEMAS).map(([name, schema]) => ({
    type: "function" as const,
    function: {
      name,
      description: schema.description,
      parameters: schema.parameters,
    },
  }));
}

// ============================================================================
// 执行器
// ============================================================================

export type DesignToolExecutor = (
  args: Record<string, unknown>,
  context: DesignToolContext,
) => DesignToolResult;

function ensureSnapshot(card: WorldCard): WorldCard["snapshot"] {
  return card.snapshot;
}

export const DESIGN_TOOL_EXECUTORS: Record<string, DesignToolExecutor> = {
  write_card: (args, ctx) => {
    const old = ctx.session.draft;
    const newCard: WorldCard = {
      name: String(args.name ?? old.name),
      description: String(args.description ?? old.description),
      contentLocale: String(args.contentLocale ?? old.contentLocale ?? "zh-CN"),
      localizations: old.localizations ?? {},
      manifest: {
        card_id:
          String(args.source === "builtin" ? "wc_builtin_" : "wc_user_") + uuidv4().slice(0, 8),
        schema_version: Number(args.schema_version ?? 2),
        source: String(args.source ?? "user_created"),
        author_display_name: String(args.author_display_name ?? ""),
        author_uid: String(old.manifest?.author_uid ?? ""),
      },
      snapshot: old.snapshot ?? {
        _schema_version: 2,
        _extensions: {},
        world_setting: { settings: {}, _summary: "" },
        prompt_modules: { modules: {}, module_meta: {}, _summary: "" },
        character_database: { _summary: "" } as never,
        world_timeline: { events: [], _summary: "" },
        panel_fields: {
          panel_status: [],
          panel_npc: [],
          _worldTermsSource: {},
        },
        laws: {},
        mods: {},
        artifacts: {},
        opening_greeting: "",
      },
      designMeta: old.designMeta,
      saveIds: old.saveIds,
    };
    ctx.session.draft = newCard;
    return { result: { ok: true, card_id: newCard.manifest.card_id }, sessionUpdated: true };
  },

  patch_card: (args, ctx) => {
    const ops = (args.ops as Array<Record<string, unknown>>) ?? [];
    let applied = 0;
    for (const op of ops) {
      const opType = String(op.op ?? "replace");
      const path = String(op.path ?? "");
      const value = op.value;
      if (!path) continue;
      applyPathPatch(ctx.session.draft, opType, path, value);
      applied++;
    }
    return { result: { ok: true, applied }, sessionUpdated: applied > 0 };
  },

  set_world_terms: (args, ctx) => {
    const card = ctx.session.draft;
    const wt: WorldTerms = {
      ...card.snapshot.panel_fields._worldTermsSource,
    };
    if (args.currency_name) wt.currency_name = String(args.currency_name);
    if (args.calendar_era) wt.calendar_era = String(args.calendar_era);
    if (args.time_precision) wt.time_precision = String(args.time_precision);
    if (Array.isArray(args.calendar_units)) wt.calendar_units = args.calendar_units.map(String);
    if (Array.isArray(args.location_levels)) wt.location_levels = args.location_levels.map(String);
    if (Array.isArray(args.extra_status_groups))
      wt.extra_status_groups = args.extra_status_groups.map(String);
    if (Array.isArray(args.extra_char_fields))
      wt.extra_char_fields = args.extra_char_fields.map(String);

    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        panel_fields: {
          ...card.snapshot.panel_fields,
          _worldTermsSource: wt,
        },
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  set_design_meta: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      designMeta: {
        phase: String(args.phase ?? card.designMeta?.phase ?? "p2"),
        p2Stage: Number(args.p2Stage ?? card.designMeta?.p2Stage ?? 0),
        p1Output:
          (args.p1Output as WorldCard["designMeta"] extends { p1Output?: infer T } ? T : never) ??
          card.designMeta?.p1Output,
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  add_world_setting: (args, ctx) => {
    const card = ctx.session.draft;
    const entityId = String(args.entity_id);
    const sites: WorldSettingSite[] =
      (args.sites as Array<Record<string, unknown>> | undefined)?.map((s) => ({
        site: String(s.site ?? ""),
        atmosphere: String(s.atmosphere ?? ""),
        spots:
          (s.spots as Array<Record<string, unknown>> | undefined)?.map((sp) => ({
            spot: String(sp.spot ?? ""),
            atmosphere: sp.atmosphere ? String(sp.atmosphere) : undefined,
          })) ?? [],
      })) ?? [];

    const setting: WorldSetting = {
      entity_id: entityId,
      display_name: String(args.display_name),
      atmosphere: String(args.atmosphere ?? ""),
      chapters: {
        here_now: (args.here_now as string[]) ?? [],
        social_fabric: (args.social_fabric as string[]) ?? [],
        order: (args.order as string[]) ?? [],
        world_law: (args.world_law as string[]) ?? [],
        rhythm: (args.rhythm as string[]) ?? [],
        narrative_core: (args.narrative_core as string[]) ?? [],
      },
      sites,
      narrative_core_characters: (args.narrative_core_characters as string[]) ?? [],
      _extensions: {},
    };

    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        world_setting: {
          settings: { ...card.snapshot.world_setting.settings, [entityId]: setting },
          _summary: card.snapshot.world_setting._summary,
        },
      },
    };
    return { result: { ok: true, entity_id: entityId }, sessionUpdated: true };
  },

  set_world_setting_summary: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        world_setting: {
          ...card.snapshot.world_setting,
          _summary: String(args.summary ?? ""),
        },
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  add_character: (args, ctx) => {
    const card = ctx.session.draft;
    const charId = String(args.id);
    const de = args.dialogue_examples as
      | {
          in_person?: Array<{ context: string; line: string }>;
          sms?: Array<{ context: string; line: string }>;
        }
      | undefined;

    const character: CharacterDatabaseEntry = {
      id: charId,
      name: String(args.name),
      gender: String(args.gender ?? "男"),
      origin: String(args.origin ?? ""),
      birthday: args.birthday === null ? null : String(args.birthday ?? ""),
      relationships: (args.relationships as Record<string, string>) ?? {},
      cognitive_state: String(args.cognitive_state ?? ""),
      initial_status: String(args.initial_status ?? ""),
      dialogue_tone: String(args.dialogue_tone ?? ""),
      dialogue_examples: {
        in_person: de?.in_person ?? [],
        sms: de?.sms ?? [],
      },
      role_marker: args.role_marker ? String(args.role_marker) : null,
      role: String(args.role ?? ""),
      species: String(args.species ?? ""),
      profession: String(args.profession ?? ""),
      affiliation: String(args.affiliation ?? ""),
      combat_style: String(args.combat_style ?? ""),
      personality: String(args.personality ?? ""),
      appearance: String(args.appearance ?? ""),
      clothing: String(args.clothing ?? ""),
      hidden_motive: String(args.hidden_motive ?? ""),
      scar_mark: String(args.scar_mark ?? ""),
      stance: String(args.stance ?? ""),
      faction: String(args.faction ?? ""),
      current_goal: String(args.current_goal ?? ""),
      is_protagonist: Boolean(args.is_protagonist ?? false),
    };

    const db = { ...card.snapshot.character_database } as Record<string, unknown>;
    delete db._summary;
    db[charId] = character;
    (db as Record<string, unknown>)["_summary"] =
      (card.snapshot.character_database as Record<string, unknown>)["_summary"] ?? "";

    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        character_database: db as never,
      },
    };
    return { result: { ok: true, id: charId }, sessionUpdated: true };
  },

  set_character_database_summary: (args, ctx) => {
    const card = ctx.session.draft;
    const db = { ...card.snapshot.character_database } as Record<string, unknown>;
    db["_summary"] = String(args.summary ?? "");
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        character_database: db as never,
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  add_timeline_event: (args, ctx) => {
    const card = ctx.session.draft;
    const event: WorldTimelineEvent = {
      id: String(args.id),
      time: String(args.time),
      day: String(args.day ?? ""),
      time_str: String(args.time_str ?? ""),
      location: {
        country: String(args.location_country ?? ""),
        site: String(args.location_site ?? ""),
        spot: String(args.location_spot ?? ""),
      },
      characters: String(args.characters ?? ""),
      content: String(args.content),
      entity_refs: (args.entity_refs as string[]) ?? [],
      character_refs: (args.character_refs as string[]) ?? [],
    };

    const events = [...card.snapshot.world_timeline.events, event];
    events.sort((a, b) => a.time.localeCompare(b.time));

    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        world_timeline: {
          events,
          _summary: card.snapshot.world_timeline._summary,
        },
      },
    };
    return { result: { ok: true, id: event.id }, sessionUpdated: true };
  },

  set_timeline_summary: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        world_timeline: {
          ...card.snapshot.world_timeline,
          _summary: String(args.summary ?? ""),
        },
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  add_prompt_module: (args, ctx) => {
    const card = ctx.session.draft;
    const moduleName = String(args.module_name);
    const mod: PromptModule = {
      description: String(args.description ?? ""),
      content: String(args.content),
    };

    const modules = { ...card.snapshot.prompt_modules.modules, [moduleName]: mod };

    let moduleMeta = { ...card.snapshot.prompt_modules.module_meta };
    if (
      args.when_to_call ||
      args.avoid_when ||
      args.input_focus ||
      args.expected_output ||
      args.description
    ) {
      const meta: PromptModuleMeta = {
        description: String(args.description ?? ""),
        when_to_call: String(args.when_to_call ?? ""),
        avoid_when: String(args.avoid_when ?? ""),
        input_focus: String(args.input_focus ?? ""),
        expected_output: String(args.expected_output ?? ""),
      };
      moduleMeta = { ...moduleMeta, [moduleName]: meta };
    }

    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        prompt_modules: {
          modules,
          module_meta: moduleMeta,
          _summary: card.snapshot.prompt_modules._summary,
        },
      },
    };
    return { result: { ok: true, module_name: moduleName }, sessionUpdated: true };
  },

  set_prompt_modules_summary: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        prompt_modules: {
          ...card.snapshot.prompt_modules,
          _summary: String(args.summary ?? ""),
        },
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  set_panel_fields: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        panel_fields: {
          panel_status:
            (args.panel_status as PanelFieldDef[]) ?? card.snapshot.panel_fields.panel_status,
          panel_npc: (args.panel_npc as PanelFieldDef[]) ?? card.snapshot.panel_fields.panel_npc,
          _worldTermsSource:
            (args.world_terms_source as WorldTerms) ?? card.snapshot.panel_fields._worldTermsSource,
        },
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  add_law: (args, ctx) => {
    const card = ctx.session.draft;
    const lawId = String(args.id);
    const law: WorldLaw = {
      id: lawId,
      scope: String(args.scope ?? ""),
      name: String(args.name ?? ""),
      body: String(args.body ?? ""),
      binding: String(args.binding ?? "soft"),
    };
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        laws: { ...card.snapshot.laws, [lawId]: law },
      },
    };
    return { result: { ok: true, id: lawId }, sessionUpdated: true };
  },

  add_mod: (args, ctx) => {
    const card = ctx.session.draft;
    const modId = String(args.id);
    const mod: WorldMod = {
      id: modId,
      name: String(args.name ?? ""),
      ref: String(args.ref ?? ""),
      config: (args.config as Record<string, unknown>) ?? {},
      prose: String(args.prose ?? ""),
      owns_vars: (args.owns_vars as WorldMod["owns_vars"]) ?? [],
      hooks: (args.hooks as WorldMod["hooks"]) ?? [],
    };
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        mods: { ...card.snapshot.mods, [modId]: mod },
      },
    };
    return { result: { ok: true, id: modId }, sessionUpdated: true };
  },

  add_artifact: (args, ctx) => {
    const card = ctx.session.draft;
    const artifactId = String(args.id);
    const artifact: WorldArtifact = {
      id: artifactId,
      name: String(args.name ?? ""),
      desc: String(args.desc ?? ""),
      owner: String(args.owner ?? ""),
      location: String(args.location ?? ""),
      attrs: (args.attrs as Record<string, unknown>) ?? {},
    };
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        artifacts: { ...card.snapshot.artifacts, [artifactId]: artifact },
      },
    };
    return { result: { ok: true, id: artifactId }, sessionUpdated: true };
  },

  set_opening_greeting: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        opening_greeting: String(args.greeting ?? ""),
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  set_relationship_rules: (args, ctx) => {
    const card = ctx.session.draft;
    ctx.session.draft = {
      ...card,
      snapshot: {
        ...card.snapshot,
        relationship_rules: (args.rules as Record<string, unknown>) ?? {},
      },
    };
    return { result: { ok: true }, sessionUpdated: true };
  },

  finalize_world_card: (args, ctx) => {
    const report = validateWorldCard(ctx.session.draft);
    if (args.confirm && report.passed) {
      ctx.session.currentStage = 3;
      return {
        result: { ok: true, report },
        sessionUpdated: true,
        stageAdvance: 3,
      };
    }
    return {
      result: { ok: false, report },
      sessionUpdated: false,
    };
  },

  rollback_stage: (args, ctx) => {
    const target = Number(args.targetStage) as 0 | 1 | 2;
    if (target >= 0 && target < ctx.session.currentStage) {
      ctx.session.currentStage = target;
      return { result: { ok: true, currentStage: target }, sessionUpdated: true };
    }
    return {
      result: { ok: false, error: "无法回退到当前或更后的阶段" },
      sessionUpdated: false,
    };
  },

  query_card: (args, ctx) => {
    const path = String(args.path ?? "");
    const card = ctx.session.draft;
    if (!path || path === "/") {
      return { result: { card } };
    }
    const value = getPathValue(card, path);
    return { result: { path, value } };
  },
};

// ============================================================================
// 路径补丁辅助
// ============================================================================

function applyPathPatch(card: WorldCard, opType: string, path: string, value: unknown): void {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return;

  let target: Record<string, unknown> = card as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (target[key] === undefined) return;
    target = target[key] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  if (opType === "remove") {
    delete target[lastKey];
  } else {
    target[lastKey] = value;
  }
}

function getPathValue(obj: unknown, path: string): unknown {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return obj;
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ============================================================================
// 工具执行入口
// ============================================================================

export function executeDesignModeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: DesignToolContext,
): DesignToolResult {
  const executor = DESIGN_TOOL_EXECUTORS[toolName];
  if (!executor) {
    return { result: {}, error: `Unknown design tool: ${toolName}` };
  }
  try {
    return executor(args, context);
  } catch (e) {
    return { result: {}, error: String(e) };
  }
}

// ============================================================================
// 世界卡校验（对标标准，且更严格）
// ============================================================================

export function validateWorldCard(card: WorldCard): WorldCardValidationReport {
  const checks: WorldCardValidationReport["checks"] = [];
  const snap = card.snapshot;

  // === A. 顶层结构 ===
  if (!card.name || card.name.length < 2) {
    checks.push({
      id: "A1",
      name: "世界卡名称过短",
      result: "error",
      reason: "名称至少 2 字符",
    });
  }
  if (!card.description || card.description.length < 10) {
    checks.push({
      id: "A2",
      name: "描述过短",
      result: "error",
      reason: "描述至少 10 字符",
    });
  }
  if (!card.manifest || !card.manifest.card_id) {
    checks.push({
      id: "A3",
      name: "缺少 manifest 或 card_id",
      result: "error",
      reason: "manifest.card_id 必须存在",
    });
  }

  // === B. world_setting ===
  const settings = snap.world_setting.settings;
  const entityIds = Object.keys(settings);
  if (entityIds.length < 1) {
    checks.push({
      id: "B1",
      name: "缺少地理实体",
      result: "error",
      reason: "至少需要 1 个地理实体",
    });
  }

  for (const entityId of entityIds) {
    const entity = settings[entityId];
    if (!entity.atmosphere || entity.atmosphere.length < 10) {
      checks.push({
        id: `B2:${entityId}`,
        name: `实体 ${entity.display_name} 缺少 atmosphere`,
        result: "error",
        reason: "每个实体必须有氛围描写（≥10 字）",
      });
    }
    const chapters = entity.chapters;
    const requiredChapters = [
      "here_now",
      "social_fabric",
      "order",
      "world_law",
      "rhythm",
      "narrative_core",
    ];
    for (const ch of requiredChapters) {
      const arr = chapters[ch as keyof typeof chapters];
      if (!Array.isArray(arr) || arr.length < 2) {
        checks.push({
          id: `B3:${entityId}:${ch}`,
          name: `实体 ${entity.display_name} 章节 ${ch} 不足 2 条`,
          result: "warning",
          reason: "每章节建议至少 2 条",
        });
      }
    }
    if (entity.sites.length < 1) {
      checks.push({
        id: `B4:${entityId}`,
        name: `实体 ${entity.display_name} 缺少 sites`,
        result: "warning",
        reason: "每个实体建议至少 1 个子地点",
      });
    }
    for (const site of entity.sites) {
      if (!site.spots || site.spots.length < 1) {
        checks.push({
          id: `B5:${entityId}:${site.site}`,
          name: `地点 ${site.site} 缺少 spots`,
          result: "warning",
          reason: "每个子地点建议至少 1 个点位",
        });
      }
    }
    if (!entity.narrative_core_characters || entity.narrative_core_characters.length < 1) {
      checks.push({
        id: `B6:${entityId}`,
        name: `实体 ${entity.display_name} 缺少 narrative_core_characters`,
        result: "warning",
        reason: "建议关联至少 1 个核心角色",
      });
    }
  }

  if (!snap.world_setting._summary) {
    checks.push({
      id: "B7",
      name: "world_setting 缺少 _summary",
      result: "warning",
      reason: "建议提供地理实体集合总览摘要",
    });
  }

  // === C. prompt_modules ===
  const modules = snap.prompt_modules.modules;
  const requiredModules = ["core_world_mechanics", "init", "narrative_base", "npc_gen"];
  for (const modName of requiredModules) {
    if (!modules[modName]) {
      checks.push({
        id: `C1:${modName}`,
        name: `缺少 Prompt 模块 ${modName}`,
        result: "error",
        reason: `必须包含 ${modName} 模块`,
      });
    }
  }

  const moduleMeta = snap.prompt_modules.module_meta;
  for (const modName of requiredModules) {
    if (modules[modName] && !moduleMeta[modName]) {
      checks.push({
        id: `C2:${modName}`,
        name: `模块 ${modName} 缺少 module_meta`,
        result: "warning",
        reason:
          "建议为每个模块提供 meta（description/when_to_call/avoid_when/input_focus/expected_output）",
      });
    }
  }

  if (!snap.prompt_modules._summary) {
    checks.push({
      id: "C3",
      name: "prompt_modules 缺少 _summary",
      result: "warning",
      reason: "建议提供模块集合总览摘要",
    });
  }

  // === D. character_database ===
  const charDb = snap.character_database as Record<string, unknown>;
  const charIds = Object.keys(charDb).filter((k) => k !== "_summary");
  if (charIds.length < 1) {
    checks.push({
      id: "D1",
      name: "缺少角色",
      result: "error",
      reason: "至少需要 1 个角色",
    });
  }

  for (const charId of charIds) {
    const char = charDb[charId] as CharacterDatabaseEntry;
    if (!char.dialogue_examples || char.dialogue_examples.in_person.length < 6) {
      checks.push({
        id: `D2:${charId}`,
        name: `角色 ${char.name} in_person 对话示例不足 6 条`,
        result: "warning",
        reason: "每个主要角色建议至少 6 条 in_person 示例",
      });
    }
    if (!char.dialogue_examples || char.dialogue_examples.sms.length < 4) {
      checks.push({
        id: `D3:${charId}`,
        name: `角色 ${char.name} sms 对话示例不足 4 条`,
        result: "warning",
        reason: "每个主要角色建议至少 4 条 sms 示例",
      });
    }
    if (!char.relationships || Object.keys(char.relationships).length < 1) {
      checks.push({
        id: `D4:${charId}`,
        name: `角色 ${char.name} 缺少 relationships`,
        result: "warning",
        reason: "建议为每个角色建立关系网",
      });
    }
    if (!char.hidden_motive) {
      checks.push({
        id: `D5:${charId}`,
        name: `角色 ${char.name} 缺少 hidden_motive`,
        result: "warning",
        reason: "黑暗题材建议为每个角色设定隐藏动机",
      });
    }
  }

  // === E. world_timeline ===
  const events = snap.world_timeline.events;
  if (events.length < 10) {
    checks.push({
      id: "E1",
      name: `时间线事件不足 10 条（当前 ${events.length}）`,
      result: "warning",
      reason: "建议至少 10 条事件覆盖从历史到 frozen_moment",
    });
  }

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (!evt.location || !evt.location.country) {
      checks.push({
        id: `E2:${evt.id}`,
        name: `事件 ${evt.id} 缺少 location`,
        result: "warning",
        reason: "每个事件建议包含三段地点对象",
      });
    }
    if (!evt.entity_refs || evt.entity_refs.length < 1) {
      checks.push({
        id: `E3:${evt.id}`,
        name: `事件 ${evt.id} 缺少 entity_refs`,
        result: "warning",
        reason: "每个事件建议关联至少 1 个实体",
      });
    }
    if (!evt.character_refs || evt.character_refs.length < 1) {
      checks.push({
        id: `E4:${evt.id}`,
        name: `事件 ${evt.id} 缺少 character_refs`,
        result: "warning",
        reason: "每个事件建议关联至少 1 个角色",
      });
    }
  }

  if (!snap.world_timeline._summary) {
    checks.push({
      id: "E5",
      name: "world_timeline 缺少 _summary",
      result: "warning",
      reason: "建议提供时间线总览摘要",
    });
  }

  // === F. panel_fields ===
  if (!snap.panel_fields.panel_status || snap.panel_fields.panel_status.length < 3) {
    checks.push({
      id: "F1",
      name: "panel_status 字段不足 3 个",
      result: "warning",
      reason: "状态栏建议至少 3 个字段（datetime/location/objective + 自定义）",
    });
  }
  if (!snap.panel_fields.panel_npc || snap.panel_fields.panel_npc.length < 3) {
    checks.push({
      id: "F2",
      name: "panel_npc 字段不足 3 个",
      result: "warning",
      reason: "NPC 面板建议至少 3 个字段",
    });
  }
  const wts = snap.panel_fields._worldTermsSource;
  if (!wts || !wts.currency_name) {
    checks.push({
      id: "F3",
      name: "_worldTermsSource 缺少 currency_name",
      result: "warning",
      reason: "建议设定货币名称",
    });
  }
  if (!wts || !wts.calendar_era) {
    checks.push({
      id: "F4",
      name: "_worldTermsSource 缺少 calendar_era",
      result: "warning",
      reason: "建议设定纪元名称",
    });
  }

  // === G. laws/mods/artifacts ===
  const lawCount = Object.keys(snap.laws).length;
  if (lawCount < 3) {
    checks.push({
      id: "G1",
      name: `世界法则不足 3 条（当前 ${lawCount}）`,
      result: "warning",
      reason: "建议至少 3 条世界法则",
    });
  }
  const modCount = Object.keys(snap.mods).length;
  if (modCount < 2) {
    checks.push({
      id: "G2",
      name: `自定义机制不足 2 条（当前 ${modCount}）`,
      result: "warning",
      reason: "建议至少 2 条自定义机制",
    });
  }
  const artifactCount = Object.keys(snap.artifacts).length;
  if (artifactCount < 1) {
    checks.push({
      id: "G3",
      name: "缺少关键道具",
      result: "warning",
      reason: "建议至少 1 个关键道具/神器",
    });
  }

  // === H. opening_greeting ===
  const greeting = snap.opening_greeting;
  if (!greeting || greeting.length < 50) {
    checks.push({
      id: "H1",
      name: "开场白过短",
      result: "error",
      reason: "开场白至少 50 字",
    });
  }
  if (greeting.length > 350) {
    checks.push({
      id: "H2",
      name: "开场白过长",
      result: "warning",
      reason: "开场白建议 150-350 字",
    });
  }
  if (greeting.includes("？") || greeting.includes("?")) {
    if (greeting.trim().endsWith("？") || greeting.trim().endsWith("?")) {
      checks.push({
        id: "H3",
        name: "开场白以问句结尾",
        result: "warning",
        reason: "开场白不应以问句结尾，应停在空位留给玩家",
      });
    }
  }

  // === I. 关系双向性 ===
  for (const charId of charIds) {
    const char = charDb[charId] as CharacterDatabaseEntry;
    if (!char.relationships) continue;
    for (const [targetId, relationDesc] of Object.entries(char.relationships)) {
      const target = charDb[targetId] as CharacterDatabaseEntry | undefined;
      if (!target) {
        checks.push({
          id: `I1:${charId}:${targetId}`,
          name: `角色 ${char.name} 关系指向不存在的角色 ${targetId}`,
          result: "warning",
          reason: "关系目标不存在",
        });
      } else if (target.relationships && !target.relationships[charId]) {
        checks.push({
          id: `I2:${charId}:${targetId}`,
          name: `单向关系：${char.name} → ${target.name} 未反向补全`,
          result: "warning",
          reason: "建议补全双向关系",
        });
      }
    }
  }

  const hasError = checks.some((c) => c.result === "error");
  return {
    passed: !hasError,
    checks,
  };
}

// ============================================================================
// 空世界卡工厂
// ============================================================================

export function createEmptyWorldCard(): WorldCard {
  return {
    name: "未命名世界卡",
    description: "",
    contentLocale: "zh-CN",
    localizations: {},
    manifest: {
      card_id: "wc_user_" + uuidv4().slice(0, 8),
      schema_version: 2,
      source: "user_created",
      author_display_name: "",
      author_uid: "",
    },
    snapshot: {
      _schema_version: 2,
      _extensions: {},
      world_setting: { settings: {}, _summary: "" },
      prompt_modules: { modules: {}, module_meta: {}, _summary: "" },
      character_database: { _summary: "" } as never,
      world_timeline: { events: [], _summary: "" },
      panel_fields: {
        panel_status: [],
        panel_npc: [],
        _worldTermsSource: {},
      },
      laws: {},
      mods: {},
      artifacts: {},
      opening_greeting: "",
    },
  };
}
