import { describe, test, expect } from 'vitest';
import { buildToolSchema, parseSSEChunk } from '../apiClient';

describe('工具调用 - buildToolSchema', () => {
  test('memory-recall 工具 schema', () => {
    const schema = buildToolSchema('memory-recall');
    expect(schema.type).toBe('object');
    expect((schema as Record<string, unknown>).properties).toBeDefined();
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
    expect((schema as { required: string[] }).required).toContain('query');
  });

  test('vector-memory 工具 schema', () => {
    const schema = buildToolSchema('vector-memory');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
    expect((schema as { required: string[] }).required).toContain('query');
  });

  test('keyword-search 工具 schema', () => {
    const schema = buildToolSchema('keyword-search');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
  });

  test('world-recall 工具 schema', () => {
    const schema = buildToolSchema('world-recall');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
  });

  test('world-search 工具 schema 包含 keys 参数', () => {
    const schema = buildToolSchema('world-search');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
    expect(properties.keys).toBeDefined();
    expect((schema as { required: string[] }).required).toContain('query');
  });

  test('anysearch 工具 schema', () => {
    const schema = buildToolSchema('anysearch');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
  });

  test('未知工具类型返回基础 schema', () => {
    const schema = buildToolSchema('unknown-tool');
    expect(schema.type).toBe('object');
    const properties = (schema as { properties: Record<string, unknown> }).properties;
    expect(properties.query).toBeDefined();
    expect(properties.keys).toBeUndefined();
  });
});

describe('工具调用 - 原生 tool_calls 解析', () => {
  test('完整 tool_call 解析', () => {
    const mockData = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'vector-memory',
                  arguments: '{"query":"鹿溪的性格特点"}',
                },
              },
            ],
          },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].id).toBe('call_abc123');
    expect(result.toolCalls![0].type).toBe('function');
    expect(result.toolCalls![0].function!.name).toBe('vector-memory');
    expect(result.toolCalls![0].function!.arguments).toBe(
      '{"query":"鹿溪的性格特点"}',
    );
  });

  test('tool_calls 与 content 同时存在', () => {
    const mockData = {
      choices: [
        {
          delta: {
            content: '正在调用工具',
            tool_calls: [
              {
                index: 0,
                id: 'call_001',
                function: { name: 'memory-recall', arguments: '{}' },
              },
            ],
          },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.content).toBe('正在调用工具');
    expect(result.toolCalls).toHaveLength(1);
  });

  test('空 tool_calls 数组', () => {
    const mockData = {
      choices: [
        {
          delta: { tool_calls: [] },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.toolCalls).toHaveLength(0);
  });

  test('tool_calls 缺少 id 和 type 字段(容错)', () => {
    const mockData = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { name: 'keyword-search', arguments: '' },
              },
            ],
          },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].id).toBe('');
    expect(result.toolCalls![0].type).toBe('function');
    expect(result.toolCalls![0].function!.name).toBe('keyword-search');
  });
});
