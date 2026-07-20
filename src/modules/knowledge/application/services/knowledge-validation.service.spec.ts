import { BadRequestException, Logger } from '@nestjs/common';
import { KnowledgeValidationService } from './knowledge-validation.service';

describe('KnowledgeValidationService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createModel = (doc: any) => {
    const findById = jest.fn().mockResolvedValue(doc);
    const findByIdAndUpdate = jest.fn().mockResolvedValue({ ...doc });
    return { findById, findByIdAndUpdate };
  };

  it('rejects malformed Gemini boolean fields instead of coercing string false to true', async () => {
    const model = createModel({
      _id: 'knowledge-1',
      content: 'not agriculture',
      category: 'Sâu bệnh',
      validation_status: 'unvalidated',
    });
    const llmService = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          score: 85,
          is_agriculture_related: 'false',
          language_detected: 'vi',
          category_match: true,
          warnings: [],
        }),
      }),
    };
    const service = new (KnowledgeValidationService as any)(model, llmService, {
      deactivateBySourceId: jest.fn(),
    });

    await expect(service.validate('knowledge-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(model.findByIdAndUpdate).toHaveBeenLastCalledWith('knowledge-1', {
      validation_status: 'unvalidated',
    });
  });

  it('deactivates vectors when admin rejects a previously validated source', async () => {
    const model = createModel({
      _id: 'knowledge-1',
      validation_status: 'validated',
    });
    const embeddingRepository = { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) };
    const service = new (KnowledgeValidationService as any)(model, {}, embeddingRepository);

    await service.confirm('knowledge-1', 'reject', 'bad source');

    expect(embeddingRepository.deactivateBySourceId).toHaveBeenCalledWith('knowledge-1');
  });

  it('rejects non-agriculture content even when Gemini score is high', async () => {
    const model = createModel({
      _id: 'knowledge-1',
      content: 'random finance article',
      category: 'Sâu bệnh',
      validation_status: 'unvalidated',
    });
    const llmService = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          score: 85,
          is_agriculture_related: false,
          language_detected: 'vi',
          category_match: true,
          warnings: [],
          rejection_reason: 'Không liên quan nông nghiệp',
        }),
      }),
    };
    const service = new (KnowledgeValidationService as any)(model, llmService, {
      deactivateBySourceId: jest.fn(),
    });

    await service.validate('knowledge-1');

    expect(model.findByIdAndUpdate).toHaveBeenLastCalledWith(
      'knowledge-1',
      expect.objectContaining({ validation_status: 'rejected' }),
      { new: true },
    );
  });
});
