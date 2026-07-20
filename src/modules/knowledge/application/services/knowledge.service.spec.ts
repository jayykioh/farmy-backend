import { KnowledgeService } from './knowledge.service';
import { Logger } from '@nestjs/common';

describe('KnowledgeService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createModel = () => {
    const query = { lean: jest.fn(), exec: jest.fn() };
    query.lean.mockReturnValue(query);
    const model = {
      findByIdAndUpdate: jest.fn(() => query),
      findByIdAndDelete: jest.fn(() => query),
    };
    return { model, query };
  };

  it('deactivates existing vectors when content is edited', async () => {
    const { model, query } = createModel();
    query.exec.mockResolvedValue({ _id: 'knowledge-1', content: 'new content' });
    const embeddingRepository = { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) };
    const service = new (KnowledgeService as any)(model, {}, embeddingRepository);

    await service.update('knowledge-1', { content: 'new content' });

    expect(embeddingRepository.deactivateBySourceId).toHaveBeenCalledWith('knowledge-1');
  });

  it('deactivates existing vectors when a knowledge source is deleted', async () => {
    const { model, query } = createModel();
    query.exec.mockResolvedValue({ _id: 'knowledge-1' });
    const embeddingRepository = { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) };
    const service = new (KnowledgeService as any)(model, {}, embeddingRepository);

    await service.remove('knowledge-1');

    expect(embeddingRepository.deactivateBySourceId).toHaveBeenCalledWith('knowledge-1');
  });

  it('marks confirmed empty-content sources as error without enqueueing embed jobs', async () => {
    const query = { lean: jest.fn(), exec: jest.fn() };
    query.lean.mockReturnValue(query);
    query.exec.mockResolvedValue([
      {
        _id: 'knowledge-1',
        content: '   ',
        validation_status: 'confirmed',
        embed_status: 'pending',
      },
    ]);
    const model = {
      find: jest.fn(() => query),
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { addBulk: jest.fn() };
    const service = new (KnowledgeService as any)(model, queue, {});

    await expect(service.batchEmbed()).resolves.toEqual({
      queued: 0,
      skipped_unconfirmed: 0,
    });

    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['knowledge-1'] } },
      { embed_status: 'error' },
    );
    expect(queue.addBulk).not.toHaveBeenCalled();
  });
});
