import { describe, test, expect } from "vitest";
import { cosineSimilarity, buildVectorMemory, searchVectorMemory } from "../memoryService";
import type {
  MemorySettings,
  ApiSettings,
  ApiProvider,
  ChatMessage,
  Character,
} from "~/types/luzzy";

// ============================================================================
// 测试用的 mock 数据
// ============================================================================

const createEmptyMemorySettings = (): MemorySettings => ({
  enabled: true,
  embeddingModel: "",
  embeddingApiProviderId: "",
  maxMemories: 100,
  recallDepth: 10,
  vectorTopK: 15,
  similarityThreshold: 0.7,
  compressionEnabled: false,
  compressionKeepRecent: 20,
});

const createEmptyApiSettings = (): ApiSettings =>
  ({
    modelName: "",
    temperature: 0.8,
    topP: 1,
    maxTokens: 4096,
    historyMessageLimit: 0,
    customRequestBody: "",
  }) as unknown as ApiSettings;

const mockProviders: ApiProvider[] = [];
const mockProviderKeys: Record<string, string> = {};

const mockMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "你好",
    timestamp: Date.now(),
    createdAt: Date.now(),
  } as unknown as ChatMessage,
  {
    id: "msg-2",
    role: "assistant",
    content: "你好！我是鹿溪。",
    timestamp: Date.now(),
    createdAt: Date.now(),
  } as unknown as ChatMessage,
];

const mockCharacter: Character = {
  uuid: "char-1",
  name: "鹿溪",
  description: "",
  personality: "",
  scenario: "",
  firstMessage: "",
  mesExample: "",
  tags: [],
  creator: "",
  version: "1.0",
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as unknown as Character;

// ============================================================================
// cosineSimilarity 测试
// ============================================================================

describe("记忆机制 - cosineSimilarity", () => {
  test("相同向量相似度为 1", () => {
    const vec = [1, 2, 3];
    const sim = cosineSimilarity(vec, vec);
    expect(sim).toBeCloseTo(1, 5);
  });

  test("正交向量相似度为 0", () => {
    const a = [1, 0];
    const b = [0, 1];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(0, 5);
  });

  test("相反向量相似度为 -1", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(-1, 5);
  });

  test("空向量返回 -1", () => {
    expect(cosineSimilarity([], [])).toBe(-1);
  });

  test("null 输入返回 -1", () => {
    expect(cosineSimilarity(null as unknown as number[], [1, 2])).toBe(-1);
  });

  test("维度不匹配返回 -Infinity", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBe(-Infinity);
  });

  test("零向量返回 -1", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBe(-1);
  });

  test("相似向量相似度接近 1", () => {
    const a = [1, 1, 1];
    const b = [1, 1, 1.1];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.99);
  });
});

// ============================================================================
// buildVectorMemory 早返回测试
// ============================================================================

describe("记忆机制 - buildVectorMemory 早返回", () => {
  test("无嵌入模型时返回空数组", async () => {
    const settings = createEmptyMemorySettings();
    expect(settings.embeddingModel).toBe("");

    const result = await buildVectorMemory(
      mockMessages,
      mockCharacter,
      settings,
      createEmptyApiSettings(),
      mockProviders,
      mockProviderKeys,
    );
    expect(result).toEqual([]);
  });

  test("空消息列表返回空数组(有嵌入模型)", async () => {
    const settings = createEmptyMemorySettings();
    settings.embeddingModel = "test-embedding-model";

    const result = await buildVectorMemory(
      [],
      mockCharacter,
      settings,
      createEmptyApiSettings(),
      mockProviders,
      mockProviderKeys,
    );
    expect(result).toEqual([]);
  });
});

// ============================================================================
// searchVectorMemory 早返回测试
// ============================================================================

describe("记忆机制 - searchVectorMemory 早返回", () => {
  test("无嵌入模型时返回空数组", async () => {
    const settings = createEmptyMemorySettings();
    expect(settings.embeddingModel).toBe("");

    const result = await searchVectorMemory(
      "测试查询",
      [],
      settings,
      createEmptyApiSettings(),
      mockProviders,
      mockProviderKeys,
    );
    expect(result).toEqual([]);
  });
});
