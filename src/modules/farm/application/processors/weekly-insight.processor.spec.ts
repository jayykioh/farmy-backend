import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WeeklyInsightProcessor } from './weekly-insight.processor';
import { getModelToken } from '@nestjs/mongoose';
import { DiaryLogDocument } from '../../infrastructure/persistence/diary-log.schema';
import { DiaryDocument } from '../../infrastructure/persistence/diary.schema';
import { WeeklyInsightRepository } from '../../infrastructure/persistence/weekly-insight.repository';
import { RAGService } from '../../../ai/application/services/rag.service';
import { PromptService } from '../../../ai/application/services/prompt.service';
import { LLMService } from '../../../ai/application/services/llm.service';
import { INSIGHT_JOB_GENERATE } from '../../infrastructure/queue/insight-queue.constants';

describe('WeeklyInsightProcessor', () => {
  let processor: WeeklyInsightProcessor;
  let mockDiaryModel: any;
  let mockDiaryLogModel: any;
  let mockRagService: any;
  let mockPromptService: any;
  let mockLlmService: any;
  let mockWeeklyInsightRepository: any;

  beforeEach(async () => {
    mockDiaryModel = {
      aggregate: jest.fn(),
    };
    mockDiaryLogModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn(),
          }),
        }),
      }),
    };
    mockRagService = {
      retrieveContext: jest.fn(),
    };
    mockPromptService = {
      buildWeeklyInsightPrompt: jest.fn(),
    };
    mockLlmService = {
      complete: jest.fn(),
    };
    mockWeeklyInsightRepository = {
      upsert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightProcessor,
        {
          provide: getModelToken(DiaryLogDocument.name),
          useValue: mockDiaryLogModel,
        },
        {
          provide: getModelToken(DiaryDocument.name),
          useValue: mockDiaryModel,
        },
        { provide: RAGService, useValue: mockRagService },
        { provide: PromptService, useValue: mockPromptService },
        { provide: LLMService, useValue: mockLlmService },
        {
          provide: WeeklyInsightRepository,
          useValue: mockWeeklyInsightRepository,
        },
      ],
    }).compile();

    processor = module.get<WeeklyInsightProcessor>(WeeklyInsightProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should skip insight generation if user has no diary logs in the past 7 days', async () => {
    // Return empty diaries list
    mockDiaryModel.aggregate.mockResolvedValue([]);

    const job = {
      name: INSIGHT_JOB_GENERATE,
      id: 'job-1',
      data: { userId: 'user1', weekStartDate: new Date().toISOString() },
    } as unknown as Job;

    await processor.process(job);

    expect(mockDiaryModel.aggregate).toHaveBeenCalled();
    expect(mockRagService.retrieveContext).not.toHaveBeenCalled();
    expect(mockLlmService.complete).not.toHaveBeenCalled();
    expect(mockWeeklyInsightRepository.upsert).not.toHaveBeenCalled();
  });

  it('should process generation correctly and call upsert', async () => {
    const weekStartDate = new Date().toISOString();
    const job = {
      name: INSIGHT_JOB_GENERATE,
      id: 'job-2',
      data: { userId: 'user1', weekStartDate },
    } as unknown as Job;

    // Mock logs
    mockDiaryModel.aggregate.mockResolvedValue([{ _id: 'diary-1' }]);

    const mockExec = jest
      .fn()
      .mockResolvedValue([{ content: 'Test log', created_at: new Date() }]);
    mockDiaryLogModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: mockExec,
        }),
      }),
    });

    // Mock services
    mockRagService.retrieveContext.mockResolvedValue({
      context_text: 'RAG Text',
    });
    mockPromptService.buildWeeklyInsightPrompt.mockReturnValue({
      prompt: 'Built prompt',
      promptVersion: '1',
    });
    mockLlmService.complete.mockResolvedValue({
      text: 'AI Insight Result',
      promptTokens: 10,
      completionTokens: 20,
    });

    await processor.process(job);

    expect(mockRagService.retrieveContext).toHaveBeenCalledWith(
      expect.stringContaining('user1'),
      'user1',
    );
    expect(mockLlmService.complete).toHaveBeenCalledWith({
      prompt: 'Built prompt',
      promptVersion: '1',
      maxTokens: 500,
      onRateLimit: 'throw',
    });
    expect(mockWeeklyInsightRepository.upsert).toHaveBeenCalledWith(
      'user1',
      new Date(weekStartDate),
      {
        insight_text: 'AI Insight Result',
        model_used: 'gemini-1.5-flash',
        tokens_used: 30,
      },
    );
  });
});
