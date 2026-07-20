import { EmbeddingProcessor } from './embedding.processor';
import { Logger } from '@nestjs/common';

describe('EmbeddingProcessor', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createProcessor = (knowledgeModel: any) => {
    const chunkingService = { chunkText: jest.fn().mockReturnValue(['chunk text']) };
    const embeddingProvider = { embed: jest.fn().mockResolvedValue({ vector: [0.1, 0.2] }) };
    const embeddingRepository = {
      findActiveChunkStates: jest.fn().mockResolvedValue(new Map()),
      upsertMany: jest.fn().mockResolvedValue(undefined),
      deactivateChunkIndices: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new (EmbeddingProcessor as any)(
      chunkingService,
      embeddingProvider,
      embeddingRepository,
      knowledgeModel,
    );
    return { processor, embeddingRepository };
  };

  it('marks knowledge source embedding as done after successful processing', async () => {
    const knowledgeModel = { findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }) };
    const { processor } = createProcessor(knowledgeModel);

    await processor.process({
      id: 'job-1',
      data: { sourceId: 'knowledge-1', sourceType: 'knowledge_source', text: 'content' },
    });

    expect(knowledgeModel.findByIdAndUpdate).toHaveBeenCalledWith('knowledge-1', { embed_status: 'done' });
  });

  it('marks knowledge source embedding as error when processing fails', async () => {
    const knowledgeModel = { findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }) };
    const { processor, embeddingRepository } = createProcessor(knowledgeModel);
    embeddingRepository.findActiveChunkStates.mockRejectedValue(new Error('pg down'));

    await expect(
      processor.process({
        id: 'job-1',
        data: { sourceId: 'knowledge-1', sourceType: 'knowledge_source', text: 'content' },
      }),
    ).rejects.toThrow('pg down');

    expect(knowledgeModel.findByIdAndUpdate).toHaveBeenCalledWith('knowledge-1', { embed_status: 'error' });
  });
});
