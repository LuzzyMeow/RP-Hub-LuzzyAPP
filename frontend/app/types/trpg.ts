/**
 * TRPG 模式类型定义
 * 基于 D&D 5e SRD 5.2.1 (CC-BY-4.0)
 * v0.8.0: 完整 TRPG 引擎类型系统
 */

// ============================================================================
// 基础枚举
// ============================================================================

/** 六维属性名 */
export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** D&D 5e 18 项技能名 */
export type SkillName =
  | 'athletics'
  | 'acrobatics'
  | 'sleight_of_hand'
  | 'stealth'
  | 'arcana'
  | 'history'
  | 'investigation'
  | 'nature'
  | 'religion'
  | 'animal_handling'
  | 'insight'
  | 'medicine'
  | 'perception'
  | 'survival'
  | 'deception'
  | 'intimidation'
  | 'performance'
  | 'persuasion';

/** 行动分类（个体行动标签） */
export type ActionCategory =
  | 'combat'
  | 'social'
  | 'explore'
  | 'inventory'
  | 'rest'
  | 'info'
  | 'meta';

/** 游戏阶段（整体运行模式） */
export type GamePhase = 'explore' | 'combat' | 'social';

/** NPC 态度五级制 */
export type NpcAttitude =
  | 'hostile'
  | 'unfriendly'
  | 'neutral'
  | 'friendly'
  | 'helpful';

/** NPC 在场状态 */
export type NpcPresence = 'present' | 'absent';

/** 地标状态 */
export type LocationStatus =
  | 'current'
  | 'visited'
  | 'unexplored'
  | 'hostile'
  | 'archived';

/** TRPG 模式 */
export type TrpgMode = 'game' | 'design';

/** 设计模式阶段 */
export type DesignStage = 0 | 1 | 2 | 3;

/** 设计模式方向选择 */
export type DesignDirection = 'PERSONA' | 'WORLD' | 'SCENE' | 'IMPROV';

/** 内容分级 */
export type ContentRating = 'unrestricted' | 'mature' | 'teen';

/** 伤害类型 */
export type DamageType =
  | 'slashing'
  | 'piercing'
  | 'bludgeoning'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'thunder'
  | 'poison'
  | 'acid'
  | 'force'
  | 'radiant'
  | 'necrotic'
  | 'psychic';

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
  type: 'weapon' | 'armor' | 'consumable' | 'quest' | 'misc';
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
  status: 'active' | 'completed' | 'failed';
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

/** 世界卡元数据 */
export interface WorldCardMetadata {
  cardId: string;
  title: string;
  description: string;
  contentRating: ContentRating;
  author: string;
  createdAt: number;
  updatedAt: number;
  stages: unknown[];
  asgVersion: string;
  framework?: {
    context_world: string;
    context_rules: string;
    context_chars: string;
    context_timeline: string;
    style_guide: string;
  };
  worldTerms?: {
    currencyName?: string;
    eraName?: string;
    calendarUnit?: string;
    landmarkTier?: string;
  };
  frozenMoment?: string;
}

/** 地理实体 */
export interface WorldSettingEntity {
  entityId: string;
  name: string;
  chapters: {
    here_now?: string;
    social_fabric?: string;
    order?: string;
    world_law?: string;
    rhythm?: string;
    narrative_core?: string;
  };
  sites: WorldSettingSite[];
  _summary?: string;
}

/** 子地点 */
export interface WorldSettingSite {
  siteId: string;
  name: string;
  description?: string;
}

/** 角色数据库条目 */
export interface CharacterDatabaseEntry {
  charId: string;
  name: string;
  race: string;
  identity: string;
  attitudeTemplate?: NpcAttitude;
  tone?: string;
  examples?: string[];
  location?: string;
  routine?: string;
}

/** 世界时间线事件 */
export interface WorldTimelineEvent {
  eventId: string;
  timeLabel: string;
  title: string;
  description: string;
  location?: string;
  characters?: string[];
  worldImpact?: string;
}

/** Prompt 模块 */
export interface PromptModule {
  moduleId: string;
  type: 'coreWorldMechanics' | 'init' | 'narrativeBase' | 'npcGen';
  content: string;
}

/** 面板字段定义 */
export interface PanelFields {
  panelStatus?: Record<string, unknown>;
  panelNpc?: Record<string, unknown>;
}

/** 世界法则 */
export interface WorldLaw {
  lawId: string;
  name: string;
  effect: string;
  triggerCondition?: string;
}

/** 自定义机制 */
export interface WorldMod {
  modId: string;
  name: string;
  effect: string;
}

/** 关键道具 */
export interface WorldArtifact {
  artifactId: string;
  name: string;
  description: string;
  acquireCondition?: string;
  effect?: string;
}

/** 预设角色背景 */
export interface CharacterBackground {
  backgroundId: string;
  name: string;
  description: string;
}

/** 完整世界卡 */
export interface WorldCard {
  metadata: WorldCardMetadata;
  worldSetting: WorldSettingEntity[];
  characterDatabase: CharacterDatabaseEntry[];
  worldTimeline: WorldTimelineEvent[];
  promptModules: PromptModule[];
  panelFields: PanelFields;
  laws: WorldLaw[];
  mods: WorldMod[];
  artifacts: WorldArtifact[];
  characterBackgrounds: CharacterBackground[];
  openingGreeting?: string;
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
  qualityFlag?: 'ok' | 'degraded';
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
  role: 'user' | 'assistant' | 'system';
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
  label: 'A' | 'B' | 'C' | 'D' | 'E';
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
  critical: 'success' | 'failure' | 'none';
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
  action: 'resolved' | 'partial' | 'blocked';
}

/** OOC 单项审查 */
export interface OocCheckItem {
  id: number;
  name: string;
  result: 'pass' | 'soft_warn' | 'hard_block';
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
  risk: 'safe' | 'moderate' | 'risky' | 'deadly';
  potentialOutcome: string;
}

/** Think-4 评分结果 */
export interface Think4Result {
  fairness: number;
  consistency: number;
  consequence: number;
  coherence: number;
  total: number;
  verdict: 'pass' | 'retry' | 'warn';
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
  direction: DesignDirection | 'free_text';
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
  level: 'warning' | 'error';
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
