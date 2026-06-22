import { describe, test, expect } from 'vitest';
import { parseSSEChunk } from '../apiClient';

describe('流式输出 - SSE 解析', () => {
  test('解析 OpenAI 格式的 content', () => {
    const mockData = {
      choices: [{ delta: { content: '你好' }, finish_reason: '' }],
    };
    const result = parseSSEChunk(mockData);
    expect(result.content).toBe('你好');
    expect(result.reasoningContent).toBe('');
    expect(result.finishReason).toBe('');
  });

  test('解析 OpenAI 格式的 reasoning_content', () => {
    const mockData = {
      choices: [
        {
          delta: { reasoning_content: '思考中...' },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.reasoningContent).toBe('思考中...');
  });

  test('解析 finish_reason', () => {
    const mockData = {
      choices: [{ delta: {}, finish_reason: 'stop' }],
    };
    const result = parseSSEChunk(mockData);
    expect(result.finishReason).toBe('stop');
  });

  test('解析 usage 信息', () => {
    const mockData = {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };
    const result = parseSSEChunk(mockData);
    expect(result.usage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 50,
    });
  });

  test('空 choices 返回空结果', () => {
    const mockData = {};
    const result = parseSSEChunk(mockData);
    expect(result.content).toBe('');
    expect(result.reasoningContent).toBe('');
    expect(result.finishReason).toBe('');
  });

  test('解析 Anthropic text_delta 事件', () => {
    const mockData = {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Anthropic 内容' },
    };
    const result = parseSSEChunk(mockData);
    expect(result.content).toBe('Anthropic 内容');
  });

  test('解析 Anthropic thinking_delta 事件', () => {
    const mockData = {
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: '思考内容' },
    };
    const result = parseSSEChunk(mockData);
    expect(result.reasoningContent).toBe('思考内容');
  });

  test('解析 Gemini usageMetadata', () => {
    const mockData = {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usageMetadata: {
        promptTokenCount: 200,
        candidatesTokenCount: 100,
        cachedContentTokenCount: 50,
      },
    };
    const result = parseSSEChunk(mockData);
    expect(result.usage).toEqual({
      prompt_tokens: 200,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 50 },
    });
  });
});

describe('流式输出 - tool_calls 增量合并', () => {
  test('单个 tool_call 解析', () => {
    const mockData = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_001',
                type: 'function',
                function: {
                  name: 'memory-recall',
                  arguments: '{"query":"测试"}',
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
    expect(result.toolCalls![0].id).toBe('call_001');
    expect(result.toolCalls![0].function!.name).toBe('memory-recall');
    expect(result.toolCalls![0].function!.arguments).toBe('{"query":"测试"}');
  });

  test('增量 tool_call 解析(仅 arguments 片段)', () => {
    const mockData = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: '{"qu',
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
    expect(result.toolCalls![0].index).toBe(0);
    expect(result.toolCalls![0].function!.arguments).toBe('{"qu');
  });

  test('finish_reason 为 tool_calls', () => {
    const mockData = {
      choices: [
        {
          delta: {},
          finish_reason: 'tool_calls',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.finishReason).toBe('tool_calls');
  });

  test('多个 tool_calls 解析', () => {
    const mockData = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_001',
                function: { name: 'memory-recall', arguments: '{}' },
              },
              {
                index: 1,
                id: 'call_002',
                function: { name: 'keyword-search', arguments: '{}' },
              },
            ],
          },
          finish_reason: '',
        },
      ],
    };
    const result = parseSSEChunk(mockData);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].function!.name).toBe('memory-recall');
    expect(result.toolCalls![1].function!.name).toBe('keyword-search');
  });
});
