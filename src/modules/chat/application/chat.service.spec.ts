import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LLMService } from '../../ai/application/services/llm.service';
import { PromptService } from '../../ai/application/services/prompt.service';
import { PetService } from '../../pet/application/services/pet.service';
import { RagService } from '../../rag/application/rag.service';
import { ChatMessageDocument } from '../infrastructure/persistence/chat-message.schema';
import { ChatSessionDocument } from '../infrastructure/persistence/chat-session.schema';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  function queryResult<T>(value: T) {
    return { exec: jest.fn().mockResolvedValue(value) };
  }

  function historyQuery(value: unknown[]) {
    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    };
  }

  function createService(options?: {
    existingMessage?: Partial<ChatMessageDocument> | null;
    history?: unknown[];
    petFailure?: boolean;
    retrievalStatus?: 'success' | 'no_match' | 'degraded';
  }) {
    const sessionId = new Types.ObjectId();
    const userMessageId = new Types.ObjectId();
    const session = {
      _id: sessionId,
      user_id: 'user-1',
      title: 'hello',
      last_message_at: new Date(),
    } as ChatSessionDocument;
    const userMessage = {
      _id: userMessageId,
      session_id: sessionId,
      user_id: 'user-1',
      role: 'user',
      content: 'hello',
      status: 'pending',
      client_message_id: 'client-1',
      ...options?.existingMessage,
    } as ChatMessageDocument;

    const sessionModel = {
      findById: jest.fn().mockReturnValue(queryResult(session)),
      create: jest.fn().mockResolvedValue(session),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findOneAndUpdate: jest.fn().mockReturnValue(
        queryResult({
          _id: sessionId,
          user_id: 'user-1',
          title: 'Ruộng lúa vụ hè',
          last_message_at: session.last_message_at,
        }),
      ),
      deleteOne: jest.fn().mockReturnValue(queryResult({ deletedCount: 1 })),
      db: {
        startSession: jest.fn().mockResolvedValue({
          withTransaction: jest.fn(async (callback: () => Promise<void>) => {
            await callback();
          }),
          endSession: jest.fn(),
        }),
      },
    };
    const messageModel = {
      findOne: jest
        .fn()
        .mockReturnValue(
          queryResult(options?.existingMessage ? userMessage : null),
        ),
      findOneAndUpdate: jest.fn().mockResolvedValue(userMessage),
      create: jest.fn().mockResolvedValue(userMessage),
      find: jest.fn().mockReturnValue(historyQuery(options?.history ?? [])),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteMany: jest.fn().mockReturnValue(queryResult({ deletedCount: 2 })),
    };
    const ragService = {
      retrieveContext: jest.fn().mockResolvedValue({
        context_text: '',
        citations: [],
        has_context: false,
        retrieval_status: options?.retrievalStatus ?? 'no_match',
      }),
    };
    const promptService = {
      buildChatPrompt: jest.fn().mockReturnValue({
        prompt: 'built prompt',
        promptVersion: 'chat-v1',
        metadata: {},
      }),
    };
    const llmService = {
      streamComplete: jest.fn(),
      streamCompleteVision: jest.fn(),
    };
    const petService = {
      getStatus: options?.petFailure
        ? jest.fn().mockRejectedValue(new Error('pet unavailable'))
        : jest.fn().mockResolvedValue({ mood: 'happy', streakCount: 7 }),
    };

    const service = new ChatService(
      sessionModel as never,
      messageModel as never,
      ragService as unknown as RagService,
      promptService as unknown as PromptService,
      llmService as unknown as LLMService,
      petService as unknown as PetService,
    );
    return {
      service,
      session,
      userMessage,
      sessionModel,
      messageModel,
      ragService,
      promptService,
      llmService,
    };
  }

  it.each(['no_match', 'degraded'] as const)(
    'prepares generation when RAG status is %s',
    async (retrievalStatus) => {
      const { service, llmService } = createService({ retrievalStatus });
      const turn = await service.prepareTurn('user-1', 'Farmer', {
        message: 'hello',
        client_message_id: 'client-1',
      });

      const stream = (async function* () {
        await Promise.resolve();
        yield 'answer';
      })();
      llmService.streamComplete.mockReturnValue(stream);
      expect(service.streamCompletion(turn)).toBe(stream);
      expect(turn.retrievalStatus).toBe(retrievalStatus);
      expect(llmService.streamComplete).toHaveBeenCalled();
    },
  );

  it('uses neutral mood and zero streak when PetService fails', async () => {
    const { service, promptService } = createService({ petFailure: true });

    await service.prepareTurn('user-1', 'Farmer', {
      message: 'hello',
      client_message_id: 'client-1',
    });

    expect(promptService.buildChatPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ petMood: 'neutral', streakCount: 0 }),
    );
  });

  it('prepares image turns with clean text for RAG and prompt context', async () => {
    const { service, ragService, promptService } = createService({
      existingMessage: {
        status: 'failed',
        content:
          'Quan sát lá lúa này giúp tôi\n\n[IMAGE:https://cdn.example.com/rice.webp]',
      },
    });

    const turn = await service.prepareTurn('user-1', 'Farmer', {
      message:
        'Quan sát lá lúa này giúp tôi\n\n[IMAGE:https://cdn.example.com/rice.webp]',
      client_message_id: 'client-1',
    });

    expect(ragService.retrieveContext).toHaveBeenCalledWith(
      'Quan sát lá lúa này giúp tôi',
      'user-1',
    );
    expect(promptService.buildChatPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: 'Quan sát lá lúa này giúp tôi' }),
    );
    expect(turn).toMatchObject({
      imageUrl: 'https://cdn.example.com/rice.webp',
    });
  });

  it('streams image turns through the vision model with fetched image bytes', async () => {
    const { service, llmService } = createService();
    const imageBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn().mockReturnValue('image/webp') },
      arrayBuffer: jest.fn().mockResolvedValue(imageBytes),
    } as unknown as Response);
    llmService.streamComplete.mockReturnValue(
      (async function* () {
        yield 'text answer';
      })(),
    );
    llmService.streamCompleteVision.mockReturnValue(
      (async function* () {
        yield 'vision answer';
      })(),
    );

    const chunks: string[] = [];
    for await (const chunk of service.streamCompletion({
      sessionId: new Types.ObjectId().toString(),
      userMessageId: new Types.ObjectId().toString(),
      userId: 'user-1',
      prompt: 'built prompt',
      promptVersion: 'chat-v1',
      retrievalStatus: 'no_match',
      citations: [],
      imageUrl: 'https://cdn.example.com/rice.webp',
    } as never)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['vision answer']);
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/rice.webp');
    expect(llmService.streamComplete).not.toHaveBeenCalled();
    expect(llmService.streamCompleteVision).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'built prompt',
        promptVersion: 'chat-v1',
        userId: 'user-1',
        mimeType: 'image/webp',
        imageBuffer: Buffer.from(imageBytes),
      }),
    );

    fetchMock.mockRestore();
  });

  it('rejects pending and completed duplicate client message ids', async () => {
    for (const status of ['pending', 'completed'] as const) {
      const { service } = createService({ existingMessage: { status } });
      await expect(
        service.prepareTurn('user-1', 'Farmer', {
          message: 'hello',
          client_message_id: 'client-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('atomically claims a failed message for retry', async () => {
    const { service, messageModel } = createService({
      existingMessage: { status: 'failed' },
    });

    await service.prepareTurn('user-1', 'Farmer', {
      message: 'hello',
      client_message_id: 'client-1',
    });

    expect(messageModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
      { $set: { status: 'pending' } },
      { new: true },
    );
  });

  it('loads only complete chronological user-assistant pairs within char budget', async () => {
    const user1 = new Types.ObjectId();
    const assistant1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const assistant2 = new Types.ObjectId();
    const { service, session } = createService({
      history: [
        {
          _id: assistant2,
          role: 'assistant',
          content: 'latest answer',
          reply_to_message_id: user2,
        },
        { _id: user2, role: 'user', content: 'latest question' },
        {
          _id: assistant1,
          role: 'assistant',
          content: 'old answer',
          reply_to_message_id: user1,
        },
        { _id: user1, role: 'user', content: 'old question' },
      ],
    });
    const previous = process.env.CHAT_HISTORY_MAX_CHARS;
    process.env.CHAT_HISTORY_MAX_CHARS = '29';

    try {
      await expect(
        service.loadBoundedHistory(session._id.toString(), 'user-1'),
      ).resolves.toEqual([
        { role: 'user', content: 'latest question' },
        { role: 'assistant', content: 'latest answer' },
      ]);
    } finally {
      if (previous === undefined) delete process.env.CHAT_HISTORY_MAX_CHARS;
      else process.env.CHAT_HISTORY_MAX_CHARS = previous;
    }
  });

  it('excludes an assistant message whose user pair was truncated', async () => {
    const { service, session } = createService({
      history: [
        {
          _id: new Types.ObjectId(),
          role: 'assistant',
          content: 'orphaned by message limit',
          reply_to_message_id: new Types.ObjectId(),
        },
      ],
    });

    await expect(
      service.loadBoundedHistory(session._id.toString(), 'user-1'),
    ).resolves.toEqual([]);
  });

  it('queries only completed messages for prompt history', async () => {
    const { service, session, messageModel } = createService();

    await service.loadBoundedHistory(session._id.toString(), 'user-1');

    expect(messageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('rejects access to a session owned by another user', async () => {
    const { service, session } = createService();

    await expect(
      service.listMessages('user-2', session._id.toString(), 1, 30),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes an owned session and all of its messages', async () => {
    const { service, session, sessionModel, messageModel } = createService();

    await expect(
      service.deleteSession('user-1', session._id.toString()),
    ).resolves.toEqual({ deleted: true });

    expect(messageModel.deleteMany).toHaveBeenCalledWith({
      session_id: session._id,
      user_id: 'user-1',
    });
    expect(sessionModel.deleteOne).toHaveBeenCalledWith({
      _id: session._id,
      user_id: 'user-1',
    });
  });

  it('renames an owned session with a trimmed title', async () => {
    const { service, session, sessionModel } = createService();

    await expect(
      service.renameSession(
        'user-1',
        session._id.toString(),
        '  Ruộng lúa vụ hè  ',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        _id: session._id,
        title: 'Ruộng lúa vụ hè',
      }),
    );

    expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: session._id, user_id: 'user-1' },
      { $set: { title: 'Ruộng lúa vụ hè' } },
      {
        new: true,
        projection: '_id title last_message_at created_at updated_at',
      },
    );
  });

  it('updates the first-turn session title from the assistant response', async () => {
    const { service, session, userMessage, sessionModel, messageModel } =
      createService();
    const assistantId = new Types.ObjectId();
    messageModel.create.mockResolvedValueOnce([{ _id: assistantId }]);

    await service.completeTurn(
      {
        sessionId: session._id.toString(),
        userMessageId: userMessage._id.toString(),
        userId: 'user-1',
        prompt: 'prompt',
        promptVersion: 'chat-v1',
        retrievalStatus: 'no_match',
        citations: [],
      },
      'Dạ, lá lúa bị vàng thường do thiếu đạm hoặc nấm bệnh. Bà con nên kiểm tra đất và quan sát vết bệnh.',
    );

    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      { _id: session._id, user_id: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          title: 'Lá lúa bị vàng thường do thiếu đạm hoặc nấm bệnh',
        }),
      }),
      expect.any(Object),
    );
  });
});
