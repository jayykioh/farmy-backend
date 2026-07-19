import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyInsightSchedulerService } from './weekly-insight.scheduler';
import {
  INSIGHT_QUEUE,
  INSIGHT_JOB_ORCHESTRATE,
} from '../../infrastructure/queue/insight-queue.constants';

describe('WeeklyInsightSchedulerService', () => {
  let service: WeeklyInsightSchedulerService;
  let mockInsightQueue: any;

  beforeEach(async () => {
    mockInsightQueue = {
      getRepeatableJobs: jest.fn(),
      removeRepeatableByKey: jest.fn(),
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyInsightSchedulerService,
        {
          provide: `BullQueue_${INSIGHT_QUEUE}`,
          useValue: mockInsightQueue,
        },
      ],
    }).compile();

    service = module.get<WeeklyInsightSchedulerService>(
      WeeklyInsightSchedulerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register repeatable job and remove old ones', async () => {
    const mockRepeatableJobs = [
      { name: 'other-job', key: 'other-key' },
      { name: INSIGHT_JOB_ORCHESTRATE, key: 'old-orchestrate-key' },
    ];
    mockInsightQueue.getRepeatableJobs.mockResolvedValue(mockRepeatableJobs);

    await service.onModuleInit();

    expect(mockInsightQueue.getRepeatableJobs).toHaveBeenCalled();
    expect(mockInsightQueue.removeRepeatableByKey).toHaveBeenCalledWith(
      'old-orchestrate-key',
    );
    expect(mockInsightQueue.removeRepeatableByKey).not.toHaveBeenCalledWith(
      'other-key',
    );

    expect(mockInsightQueue.add).toHaveBeenCalledWith(
      INSIGHT_JOB_ORCHESTRATE,
      {},
      expect.objectContaining({
        repeat: {
          pattern: '0 6 * * *',
          tz: 'Asia/Ho_Chi_Minh',
        },
        jobId: 'weekly-insight-orchestrator',
      }),
    );
  });
});
