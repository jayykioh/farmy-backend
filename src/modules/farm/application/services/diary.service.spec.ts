import { DiaryService } from './diary.service';

describe('DiaryService', () => {
  it('persists diary log activity_at from client activity date', async () => {
    const diaryModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'diary-1', plot_id: 'plot-1' }) }),
    };
    const savedLog = { _id: 'log-1', content: 'Watered', save: jest.fn() };
    savedLog.save.mockResolvedValue(savedLog);
    const diaryLogModel = jest.fn().mockImplementation((payload) => ({ ...savedLog, ...payload }));
    const farmPlotModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'plot-1', user_id: 'user-1' }) }),
    };
    const service = new DiaryService(
      diaryModel as any,
      diaryLogModel as any,
      farmPlotModel as any,
      { updateStreakAndMoodOnDiaryCreated: jest.fn().mockResolvedValue(undefined) } as any,
      { add: jest.fn().mockResolvedValue(undefined) } as any,
      { deactivateBySourceId: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
    );

    await service.createLog('user-1', 'diary-1', {
      activity_type: 'Tưới nước',
      content: 'Watered',
      activity_at: '2026-07-20T01:00:00.000Z',
    } as any);

    expect(diaryLogModel).toHaveBeenCalledWith(
      expect.objectContaining({ activity_at: new Date('2026-07-20T01:00:00.000Z') }),
    );
  });
});
