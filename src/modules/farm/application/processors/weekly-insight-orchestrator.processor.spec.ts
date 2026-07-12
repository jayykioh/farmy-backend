import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { WeeklyInsightOrchestratorProcessor } from './weekly-insight-orchestrator.processor';
import { getModelToken } from '@nestjs/mongoose';
import { DiaryLogDocument } from '../../infrastructure/persistence/diary-log.schema';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_ORCHESTRATE,
  INSIGHT_JOB_GENERATE,
  INSIGHT_SPREAD_WINDOW_MS,
} from '../../infrastructure/queue/insight-queue.constants';

describe('WeeklyInsightOrchestratorProcessor', () => {
  let processor: WeeklyInsightOrchestratorProcessor;
  let mockDiaryLogModel: any;
  let mockInsightQueue: any;

  beforeEach(async () => {
    mockDiaryLogModel = {
      aggregate: jest.fn(),
    };
    mockInsightQueue = {
      addBulk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightOrchestratorProcessor,
        {
          provide: getModelToken(DiaryLogDocument.name),
          useValue: mockDiaryLogModel,
        },
        {
          provide: `BullQueue_${INSIGHT_QUEUE}`,
          useValue: mockInsightQueue,
        },
      ],
    }).compile();

    processor = module.get<WeeklyInsightOrchestratorProcessor>(
      WeeklyInsightOrchestratorProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process orchestrate job and enqueue generate_insight jobs with random delays', async () => {
    // Mock active users
    const mockActiveUsers = [{ userId: 'user1' }, { userId: 'user2' }];
    mockDiaryLogModel.aggregate.mockResolvedValue(mockActiveUsers);

    const job = { name: INSIGHT_JOB_ORCHESTRATE } as Job;
    await processor.process(job);

    expect(mockDiaryLogModel.aggregate).toHaveBeenCalled();
    expect(mockInsightQueue.addBulk).toHaveBeenCalled();

    const addBulkArgs = mockInsightQueue.addBulk.mock.calls[0][0];
    expect(addBulkArgs).toHaveLength(2);

    addBulkArgs.forEach((jobData: any) => {
      expect(jobData.name).toBe(INSIGHT_JOB_GENERATE);
      expect(jobData.data).toHaveProperty('userId');
      expect(jobData.data).toHaveProperty('weekStartDate');

      const delay = jobData.opts.delay;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(INSIGHT_SPREAD_WINDOW_MS);
    });
  });

  it('should not enqueue any jobs if there are no active users', async () => {
    mockDiaryLogModel.aggregate.mockResolvedValue([]);

    const job = { name: INSIGHT_JOB_ORCHESTRATE } as Job;
    await processor.process(job);

    expect(mockDiaryLogModel.aggregate).toHaveBeenCalled();
    expect(mockInsightQueue.addBulk).not.toHaveBeenCalled();
  });

  it('should ignore jobs that are not orchestrator jobs', async () => {
    const job = { name: 'other_job' } as Job;
    await processor.process(job);

    expect(mockDiaryLogModel.aggregate).not.toHaveBeenCalled();
  });
});
