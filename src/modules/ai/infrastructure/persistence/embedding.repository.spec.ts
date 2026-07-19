import { ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingRepository } from './embedding.repository';

describe('EmbeddingRepository', () => {
  it('throws a clear disabled error when pgvector is not configured', async () => {
    const repository = new EmbeddingRepository(undefined);

    await expect(
      repository.searchSimilar(
        [0.1, 0.2],
        { limit: 3, minScore: 0.7 },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deactivates stale chunk indices through the repository boundary', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const repository = new EmbeddingRepository(dataSource as any);

    await repository.deactivateChunkIndices('source-1', 'diary_log', [1, 2]);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "embeddings" SET "is_active" = false'),
      ['source-1', 'diary_log', [1, 2]],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
