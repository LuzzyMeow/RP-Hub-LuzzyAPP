/**
 * TRPG 模式类型定义
 * 基于 D&D 5e SRD 5.2.1 (CC-BY-4.0)
 * v0.8.0: 完整 TRPG 引擎类型系统
 */

// ============================================================================
// 基础枚举
// ============================================================================

/** 六维属性名 */
export type AbilityName = "str" | "dex" | "con" | "int" | "wis" | "cha";

/** D&D 5e 18 项技能名 */
export type SkillName =
  | "athletics"
  | "acrobatics"
  | "sleight_of_hand"
  | "stealth"
  | "arcana"
  | "history"
  | "investigation"
  | "nature"
  | "religion"
  | "animal_handling"
  | "insight"
  | "medicine"
  | "perception"
  | "survival"
  | "deception"
  | "intimidation"
  | "performance"
  | "persuasion";

/** 行动分类（个体行动标签） */
export type ActionCategory =
  | "combat"
  | "social"
  | "explore"
  | "inventory"
  | "rest"
  | "info"
  | "meta";

/** 游戏阶段（整体运行模式） */
export type GamePhase = "explore" | "combat" | "social";

/** NPC 态度五级制 */
export type NpcAttitude = "hostile" | "unfriendly" | "neutral" | "friendly" | "helpful";

/** NPC 在场状态 */
export type NpcPresence = "present" | "absent";

/** 地标状态 */
export type LocationStatus = "current" | "visited" | "unexplored" | "hostile" | "archived";

/** TRPG 模式 */
export type TrpgMode = "game" | "design";

/** 设计模式阶段 */
export type DesignStage = 0 | 1 | 2 | 3;

/** 设计模式方向选择 */
export type DesignDirection = "PERSONA" | "WORLD" | "SCENE" | "IMPROV";

/** 设计模式五维框架 */
export interface DesignFramework {
  context_world: string;
  context_rules: string;
  context_chars: string;
  context_timeline: string;
  style_guide: string;
}

/** 设计模式会话状态 */
export interface DesignSession {
  sessionId: string;
  currentStage: DesignStage;
  direction: DesignDirection | string | null;
  framework: DesignFramework | null;
  draft: WorldCard;
  messages: TrpgMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 设计模式工具执行上下文 */
export interface DesignToolContext {
  session: DesignSession;
}

/** 设计模式工具产生的状态变更 */
export interface DesignToolResult {
  result: unknown;
  sessionUpdated?: boolean;
  stageAdvance?: DesignStage;
  error?: string;
}

/** 世界卡字段校验报告 */
export interface WorldCardValidationReport {
  passed: boolean;
  checks: Array<{
    id: string;
    name: string;
    result: "pass" | "warning" | "error";
    reason: string;
  }>;
}

/** 内容分级 */
export type ContentRating = "unrestricted" | "mature" | "teen";

/** 伤害类型 */
export type DamageType =
  | "slashing"
  | "piercing"
  | "bludgeoning"
  | "fire"
  | "cold"
  | "lightning"
  | "thunder"
  | "poison"
  | "acid"
  | "force"
  | "radiant"
  | "necrotic"
  | "psychic";

// ============================================================================
// 角色与状态
// ============================================================================

/** D&D 角色卡 */
export interface TrpgCharacter {
  charId: string;
  name: string;
  race: string;
  class: string;
  level: number;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  hp: { current: number; max: number };
  ac: number;
  proficientSkills: SkillName[];
  expertiseSkills: SkillName[];
  conditions: string[];
  inventory: InventoryItem[];
  equipment: {
    weapon?: string;
    armor?: string;
    shield?: string;
  };
  spellSlots?: Record<number, number>;
  classFeatures: string[];
  xp: number;
  background: string;
  alignment: string;
}

/** 运行时 NPC 状态 */
export interface GameNpc {
  npcId: string;
  name: string;
  gender: string;
  age: number;
  presence: NpcPresence;
  attitude: NpcAttitude;
  hp: { current: number; max: number };
  ac?: number;
  revealedFields: string[];
  customFields: Record<string, string>;
}

/** 已知地标 */
export interface GameLocation {
  locationId: string;
  name: string;
  status: LocationStatus;
  archived?: boolean;
  archiveReason?: string;
  exploredRatio?: number;
}

/** 物品栏物品 */
export interface InventoryItem {
  id: string;
  name: string;
  type: "weapon" | "armor" | "consumable" | "quest" | "misc";
  quantity: number;
  description: string;
  damageDice?: string;
  damageType?: DamageType;
  acBonus?: number;
  effect?: string;
  isQuestItem?: boolean;
}

/** 战斗状态 */
export interface CombatState {
  round: number;
  turnOrder: string[];
  currentTurnIndex: number;
  participants: Record<
    string,
    {
      id: string;
      name: string;
      hp: { current: number; max: number };
      ac: number;
      initiative: number;
      conditions: string[];
      isPlayer: boolean;
    }
  >;
}

/** 任务 */
export interface Quest {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  objectives?: string[];
}

/** 游戏内时间 */
export interface GameTime {
  day: number;
  hour: number;
  calendarEra: string;
}

/** TRPG 游戏状态 */
export interface TrpgGameState {
  saveId: string;
  roundNumber: number;
  activeCharacterId: string;
  currentLocation: string;
  phase: GamePhase;
  combat?: CombatState;
  world: Record<string, unknown>;
  quests: Quest[];
  time: GameTime;
  factionRelations: Record<string, number>;
  npcs: GameNpc[];
  locations: GameLocation[];
}

// ============================================================================
// 存档与世界卡
// ============================================================================

/** 存档 */
export interface SaveSlot {
  saveId: string;
  title: string;
  worldCardId: string | null;
  gameState: TrpgGameState;
  character: TrpgCharacter;
  npcs: GameNpc[];
  messages: TrpgMessage[];
  aSummaries: ASummaryEntry[];
  bSummaries: BSummaryEntry[];
  cSummaries: CSummaryEntry[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

/** 世界卡 manifest */
export interface WorldCardManifest {
  card_id: string;
  schema_version: number;
  source: string;
  author_display_name: string;
  author_uid: string;
}

/** 世界卡设计元数据 */
export interface WorldCardDesignMeta {
  phase: string;
  p2Stage: number;
  p1Output?: {
    complexity: string;
    target_stages: number;
    context_world: string;
    context_rules: string;
    context_chars: string;
    context_timeline: string;
    style_guide: string;
    world_terms: WorldTerms;
    player_anchor: {
      allowed_modes: string[];
      compliance: string;
      recommended_role: string;
    };
    frozen_moment: {
      datetime: string;
      label: string;
      source: string;
      world_tense: string;
    };
    naming_registry: Record<string, string>;
  };
}

/** 世界术语 */
export interface WorldTerms {
  currency_name?: string;
  calendar_era?: string;
  time_precision?: string;
  calendar_units?: string[];
  time_segments?: string[];
  location_levels?: string[];
  extra_status_groups?: string[];
  extra_char_fields?: string[];
}

/** 地理实体子地点点位 */
export interface WorldSettingSpot {
  spot: string;
  atmosphere?: string;
}

/** 地理实体子地点 */
export interface WorldSettingSite {
  site: string;
  spots: WorldSettingSpot[];
  atmosphere: string;
}

/** 地理实体章节 */
export interface WorldSettingChapters {
  here_now: string[];
  social_fabric: string[];
  order: string[];
  world_law: string[];
  rhythm: string[];
  narrative_core: string[];
}

/** 地理实体 */
export interface WorldSetting {
  entity_id: string;
  display_name: string;
  atmosphere: string;
  chapters: WorldSettingChapters;
  sites: WorldSettingSite[];
  narrative_core_characters: string[];
  _extensions: Record<string, unknown>;
}

/** 地理实体根 */
export interface WorldSettingRoot {
  settings: Record<string, WorldSetting>;
  _summary: string;
}

/** Prompt 模块 */
export interface PromptModule {
  description: string;
  content: string;
}

/** Prompt 模块元数据 */
export interface PromptModuleMeta {
  description: string;
  when_to_call: string;
  avoid_when: string;
  input_focus: string;
  expected_output: string;
}

/** Prompt 模块根 */
export interface PromptModulesRoot {
  modules: Record<string, PromptModule>;
  module_meta: Record<string, PromptModuleMeta>;
  _summary: string;
}

/** 角色对话示例 */
export interface CharacterDialogueExample {
  context: string;
  line: string;
}

/** 角色对话示例集 */
export interface CharacterDialogueExamples {
  in_person: CharacterDialogueExample[];
  sms: CharacterDialogueExample[];
}

/** 角色数据库条目 */
export interface CharacterDatabaseEntry {
  id: string;
  name: string;
  gender: string;
  origin: string;
  birthday: string | null;
  relationships: Record<string, string>;
  cognitive_state: string;
  initial_status: string;
  dialogue_tone: string;
  dialogue_examples: CharacterDialogueExamples;
  role_marker: string | null;
  role: string;
  species: string;
  profession: string;
  affiliation: string;
  combat_style: string;
  personality: string;
  appearance: string;
  clothing: string;
  hidden_motive: string;
  scar_mark: string;
  stance: string;
  faction: string;
  current_goal: string;
  is_protagonist: boolean;
  background?: string;
}

/** 角色数据库根 */
export type CharacterDatabaseRoot = Record<string, CharacterDatabaseEntry>;

/** 时间线地点 */
export interface TimelineLocation {
  country: string;
  site: string;
  spot: string;
}

/** 世界时间线事件 */
export interface WorldTimelineEvent {
  id: string;
  time: string;
  day: string;
  time_str: string;
  location: TimelineLocation;
  characters: string;
  content: string;
  entity_refs: string[];
  character_refs: string[];
}

/** 世界时间线根 */
export interface WorldTimelineRoot {
  events: WorldTimelineEvent[];
  _summary: string;
}

/** 面板字段项 */
export interface PanelFieldDef {
  key: string;
  label: string;
  type?: string;
  desc?: string;
  nullable?: boolean;
  icon?: string;
  _template?: string;
  _precision?: string;
  _era?: string;
  fields?: PanelFieldDef[];
}

/** 面板字段根 */
export interface PanelFieldsRoot {
  panel_status: PanelFieldDef[];
  panel_npc: PanelFieldDef[];
  _worldTermsSource: WorldTerms;
}

/** 世界法则 */
export interface WorldLaw {
  id: string;
  scope: string;
  name: string;
  body: string;
  binding: string;
}

/** 世界法则根 */
export interface LawsRoot {
  [id: string]: WorldLaw;
}

/** 机制变量 */
export interface ModOwnsVar {
  key: string;
  type: string;
  init: unknown;
  visible: boolean;
  fields?: ModOwnsVar[];
}

/** 机制钩子 */
export interface ModHook {
  trigger: string;
  resolve: string;
  inject: string;
}

/** 自定义机制 */
export interface WorldMod {
  id: string;
  name: string;
  ref: string;
  config: Record<string, unknown>;
  prose: string;
  owns_vars: ModOwnsVar[];
  hooks: ModHook[];
}

/** 自定义机制根 */
export interface ModsRoot {
  [id: string]: WorldMod;
}

/** 关键道具属性 */
export interface ArtifactAttrs {
  [key: string]: unknown;
}

/** 关键道具 */
export interface WorldArtifact {
  id: string;
  name: string;
  desc: string;
  owner: string;
  location: string;
  attrs: ArtifactAttrs;
}

/** 关键道具根 */
export interface ArtifactsRoot {
  [id: string]: WorldArtifact;
}

/** 关系规则 */
export interface RelationshipRules {
  [key: string]: unknown;
}

/** 世界卡 snapshot */
export interface WorldCardSnapshot {
  _schema_version: number;
  _extensions: Record<string, unknown>;
  world_setting: WorldSettingRoot;
  prompt_modules: PromptModulesRoot;
  character_database: CharacterDatabaseRoot;
  world_timeline: WorldTimelineRoot;
  panel_fields: PanelFieldsRoot;
  laws: LawsRoot;
  mods: ModsRoot;
  artifacts: ArtifactsRoot;
  opening_greeting: string;
  relationship_rules?: RelationshipRules;
}

/** 完整世界卡 */
export interface WorldCard {
  name: string;
  description: string;
  contentLocale: string;
  localizations: Record<string, unknown>;
  manifest: WorldCardManifest;
  snapshot: WorldCardSnapshot;
  designMeta?: WorldCardDesignMeta;
  // v0.8.3: 世界卡绑定存档（替代存档绑定世界卡）
  saveIds?: string[];
}

// ============================================================================
// 记忆摘要
// ============================================================================

/** A 级摘要（情节摘要） */
export interface ASummaryEntry {
  id: string;
  round: number;
  summary: string;
  sceneAnchor: string;
  unresolvedLeads: string[];
  hook: string;
  importance: number;
  qualityFlag?: "ok" | "degraded";
  createdAt: number;
}

/** B 级摘要（语义摘要） */
export interface BSummaryEntry {
  id: string;
  startRound: number;
  endRound: number;
  keyEvents: string[];
  characterArcs: string[];
  worldChanges: string[];
  openThreads: string[];
  continuityHook: string;
  summaryText: string;
  createdAt: number;
}

/** C 级摘要（史诗摘要） */
export interface CSummaryEntry {
  id: string;
  startRound: number;
  endRound: number;
  epicArc: string;
  mainPlot: string[];
  themes: string[];
  foreshadowing: string[];
  characterDevelopment: string[];
  continuityHook: string;
  summaryText: string;
  createdAt: number;
}

// ============================================================================
// 消息格式
// ============================================================================

/** TRPG 消息 */
export interface TrpgMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoningContent?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
  }>;
  narratorSections?: NarratorSections;
  createdAt: number;
}

/** Narrator 7 段输出 */
export interface NarratorSections {
  memoryRef: string;
  plotAnalysis: string;
  checkSummary: string;
  narrative: string;
  actionOptions: ActionOption[];
  statusInfo: string;
  reactReflection: string;
}

/** 行动选项 */
export interface ActionOption {
  label: "A" | "B" | "C" | "D" | "E";
  description: string;
}

// ============================================================================
// 规则引擎结果
// ============================================================================

/** 掷骰结果 */
export interface DiceResult {
  roll: number;
  bonus: number;
  total: number;
  dc: number;
  success: boolean;
  critical: "success" | "failure" | "none";
  rolls?: number[];
}

/** 伤害掷骰结果 */
export interface DamageResult {
  rolls: number[];
  modifier: number;
  total: number;
  crit: boolean;
}

/** OOC 审查结果 */
export interface OocResult {
  checks: OocCheckItem[];
  hasHardBlock: boolean;
  hasSoftWarn: boolean;
  action: "resolved" | "partial" | "blocked";
}

/** OOC 单项审查 */
export interface OocCheckItem {
  id: number;
  name: string;
  result: "pass" | "soft_warn" | "hard_block";
  reason?: string;
}

/** Think-1 意图分析结果 */
export interface Think1Result {
  intent: string;
  motive: string;
  category: ActionCategory;
  skillRequired: SkillName | null;
  attribute: AbilityName | null;
  estimatedDc: number | null;
  constraintScan: {
    needsItem: boolean;
    needsSpell: boolean;
    locationDependent: boolean;
    timeSensitive: boolean;
    metaGameRisk: boolean;
  };
  targetNpc: string | null;
}

/** Think-2 路径规划结果 */
export interface Think2Result {
  paths: Think2Path[];
  recommended: number;
  reasoning: string;
  estimatedTimeCost: string;
}

/** Think-2 路径 */
export interface Think2Path {
  name: string;
  description: string;
  skill: SkillName | null;
  dc: number | null;
  advantage: boolean;
  disadvantage: boolean;
  bonus: number | null;
  risk: "safe" | "moderate" | "risky" | "deadly";
  potentialOutcome: string;
}

/** Think-4 评分结果 */
export interface Think4Result {
  fairness: number;
  consistency: number;
  consequence: number;
  coherence: number;
  total: number;
  verdict: "pass" | "retry" | "warn";
}

/** 状态变更增量 */
export interface StateDelta {
  hpChanged: boolean;
  xpChanged: boolean;
  levelChanged: boolean;
  inventoryChanged: boolean;
  locationChanged: boolean;
  npcChanged: boolean;
  conditionChanged: boolean;
  questChanged: boolean;
  factionChanged: boolean;
  mapChanged: boolean;
}

// ============================================================================
// 设计模式
// ============================================================================

/** 设计模式 Stage 0 产出 */
export interface DesignStage0 {
  direction: DesignDirection | "free_text";
  freeText?: string;
}

/** 设计模式 Stage 1 产出（五维框架） */
export interface DesignStage1 {
  tone: string;
  coreSetting: string;
  timeAnchor: string;
  panelStatusFields: string[];
  panelNpcFields: string[];
}

/** 设计模式 Stage 2 产出（骨架快照） */
export interface DesignStage2 {
  worldSettingCount: number;
  promptModuleCount: number;
  characterCount: number;
  timelineEventCount: number;
  hasOpeningGreeting: boolean;
  snapshot: string;
}

/** 设计模式 Stage 3 产出（交付信息） */
export interface DesignStage3 {
  reviewScore: number;
  passedAt: number;
  warnings: number;
  errors: number;
}

/** 体检检查项 */
export interface ReviewCheckItem {
  id: string;
  section: string;
  description: string;
  level: "warning" | "error";
  passed: boolean;
  message?: string;
}

/** 体检报告 */
export interface ReviewReport {
  items: ReviewCheckItem[];
  fatal: number;
  errors: number;
  warnings: number;
  passed: boolean;
}
