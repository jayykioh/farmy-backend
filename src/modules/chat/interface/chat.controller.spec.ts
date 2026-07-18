import type { Response } from 'express';
import { ChatService } from '../application/chat.service';
import type { PreparedChatTurn } from '../application/chat.types';
import { ChatController } from './chat.controller';

describe('ChatController streaming contract', () => {
  const turn: PreparedChatTurn = {
    sessionId: '507f1f77bcf86cd799439011',
    userMessageId: '507f1f77bcf86cd799439012',
    userId: 'user-1',
    prompt: 'prompt',
    promptVersion: 'chat-v1',
    retrievalStatus: 'success',
    citations: [
      {
        source_id: 'source-1',
        source_type: 'knowledge_source',
        chunk_index: 0,
        score: 0.9,
      },
    ],
  };

  function responseDouble() {
    const writes: string[] = [];
    const headers = new Map<string, string>();
    const response = {
      destroyed: false,
      on: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn((name: string, value: string): void => {
        headers.set(name, value);
      }),
      flushHeaders: jest.fn(),
      write: jest.fn((value: string) => {
        writes.push(value);
        return true;
      }),
      end: jest.fn(),
    };
    return { response: response as unknown as Response, writes, headers };
  }

  it('emits meta, tokens, then done with exact SSE headers', async () => {
    const service = {
      prepareTurn: jest.fn().mockResolvedValue(turn),
      streamCompletion: jest.fn().mockImplementation(async function* () {
        await Promise.resolve();
        yield 'hello';
        yield ' world';
      }),
      completeTurn: jest
        .fn()
        .mockResolvedValue({ assistantMessageId: 'assistant-1' }),
      failTurn: jest.fn(),
    };
    const controller = new ChatController(service as unknown as ChatService);
    const { response, writes, headers } = responseDouble();

    await controller.stream(
      { id: 'user-1', name: 'Farmer', email: 'a@b.c', role: 'user' },
      { message: 'hello', client_message_id: 'client-1' },
      response,
    );

    expect(headers.get('Content-Type')).toBe('text/event-stream');
    expect(headers.get('Cache-Control')).toBe('no-cache');
    expect(headers.get('Connection')).toBe('keep-alive');
    expect(writes.map((value) => value.match(/^event: (\w+)/)?.[1])).toEqual([
      'meta',
      'token',
      'token',
      'done',
    ]);
    expect(writes.every((value) => value.endsWith('\n\n'))).toBe(true);
    expect(writes[3]).toContain('"assistant_message_id":"assistant-1"');
    expect(writes[3]).toContain('"source_id":"source-1"');
    expect(service.completeTurn).toHaveBeenCalledWith(turn, 'hello world');
  });

  it('emits error and never done when generation fails mid-stream', async () => {
    const service = {
      prepareTurn: jest.fn().mockResolvedValue(turn),
      streamCompletion: jest.fn().mockImplementation(async function* () {
        await Promise.resolve();
        yield 'partial';
        throw new Error('provider failed');
      }),
      completeTurn: jest.fn(),
      failTurn: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ChatController(service as unknown as ChatService);
    const { response, writes } = responseDouble();

    await controller.stream(
      { id: 'user-1', name: 'Farmer', email: 'a@b.c', role: 'user' },
      { message: 'hello', client_message_id: 'client-1' },
      response,
    );

    expect(writes.some((value) => value.startsWith('event: error'))).toBe(true);
    expect(writes.some((value) => value.startsWith('event: done'))).toBe(false);
    expect(service.failTurn).toHaveBeenCalledWith(turn.userMessageId, 'user-1');
    expect(service.completeTurn).not.toHaveBeenCalled();
  });

  it('does not emit done when completion persistence fails', async () => {
    const service = {
      prepareTurn: jest.fn().mockResolvedValue(turn),
      streamCompletion: jest.fn().mockImplementation(async function* () {
        await Promise.resolve();
        yield 'complete output';
      }),
      completeTurn: jest
        .fn()
        .mockRejectedValue(new Error('transaction failed')),
      failTurn: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ChatController(service as unknown as ChatService);
    const { response, writes } = responseDouble();

    await controller.stream(
      { id: 'user-1', name: 'Farmer', email: 'a@b.c', role: 'user' },
      { message: 'hello', client_message_id: 'client-1' },
      response,
    );

    expect(writes.some((value) => value.startsWith('event: error'))).toBe(true);
    expect(writes.some((value) => value.startsWith('event: done'))).toBe(false);
  });

  it('deletes the current user chat session', async () => {
    const service = {
      deleteSession: jest.fn().mockResolvedValue({ deleted: true }),
    };
    const controller = new ChatController(service as unknown as ChatService);

    await expect(
      controller.deleteSession(
        { id: 'user-1', name: 'Farmer', email: 'a@b.c', role: 'user' },
        '507f1f77bcf86cd799439011',
      ),
    ).resolves.toEqual({ success: true, data: { deleted: true } });

    expect(service.deleteSession).toHaveBeenCalledWith(
      'user-1',
      '507f1f77bcf86cd799439011',
    );
  });

  it('renames the current user chat session', async () => {
    const service = {
      renameSession: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        title: 'Ruộng lúa vụ hè',
      }),
    };
    const controller = new ChatController(service as unknown as ChatService);

    await expect(
      controller.renameSession(
        { id: 'user-1', name: 'Farmer', email: 'a@b.c', role: 'user' },
        '507f1f77bcf86cd799439011',
        { title: 'Ruộng lúa vụ hè' },
      ),
    ).resolves.toEqual({
      success: true,
      data: {
        _id: '507f1f77bcf86cd799439011',
        title: 'Ruộng lúa vụ hè',
      },
    });

    expect(service.renameSession).toHaveBeenCalledWith(
      'user-1',
      '507f1f77bcf86cd799439011',
      'Ruộng lúa vụ hè',
    );
  });
});
