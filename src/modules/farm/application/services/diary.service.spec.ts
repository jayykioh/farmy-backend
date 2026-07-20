import { DiaryService } from './diary.service';

describe('DiaryService', () => {
  it('persists diary log activity_at from client activity date', async () => {
    const diaryModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: 'diary-1', plot_id: 'plot-1' }),
      }),
    };
    const savedLog = { _id: 'log-1', content: 'Watered', save: jest.fn() };
    savedLog.save.mockResolvedValue(savedLog);
    const diaryLogModel = jest
      .fn()
      .mockImplementation((payload) => ({ ...savedLog, ...payload }));
    const farmPlotModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'plot-1', user_id: 'user-1' }),
      }),
    };
    const service = new DiaryService(
      diaryModel as any,
      diaryLogModel as any,
      farmPlotModel as any,
      {
        updateStreakAndMoodOnDiaryCreated: jest
          .fn()
          .mockResolvedValue(undefined),
      } as any,
      { add: jest.fn().mockResolvedValue(undefined) } as any,
      { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
    );

    await service.createLog('user-1', 'diary-1', {
      activity_type: 'Tưới nước',
      content: 'Watered',
      activity_at: '2026-07-20T01:00:00.000Z',
    });

    expect(diaryLogModel).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_at: new Date('2026-07-20T01:00:00.000Z'),
      }),
    );
  });

  it('returns a committed idempotent log when embedding enqueue fails', async () => {
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const diaryModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue({ _id: 'diary-1', plot_id: 'plot-1' }),
      }),
      db: { startSession: jest.fn().mockResolvedValue(session) },
    };
    const savedLog = {
      _id: 'log-1',
      content: 'Watered',
      save: jest.fn(),
    };
    savedLog.save.mockResolvedValue(savedLog);
    const diaryLogModel = jest
      .fn()
      .mockImplementation((payload) => ({ ...savedLog, ...payload }));
    const farmPlotModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'plot-1', user_id: 'user-1' }),
      }),
    };
    const execution = {
      _id: 'execution-1',
      status: 'processing',
      responseData: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const idempotencyExecutionService = {
      acquireOrTakeoverLock: jest.fn().mockResolvedValue(execution),
    };
    const embedQueue = {
      add: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const service = new DiaryService(
      diaryModel as any,
      diaryLogModel as any,
      farmPlotModel as any,
      {
        updateStreakAndMoodOnDiaryCreated: jest
          .fn()
          .mockResolvedValue(undefined),
      } as any,
      embedQueue as any,
      { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) } as any,
      idempotencyExecutionService as any,
    );

    const result = await service.createIdempotentLog(
      'user-1',
      'diary-1',
      'request-1',
      'hash-1',
      { activity_type: 'water', content: 'Watered' },
    );

    expect(result).toEqual(expect.objectContaining({ _id: 'log-1' }));
    expect(execution.status).toBe('completed');
    expect(execution.save).toHaveBeenCalledWith({ session });
    expect(embedQueue.add).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
