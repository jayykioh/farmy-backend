import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import {
  ReminderDocument,
  ReminderStatus,
} from '../../infrastructure/persistence/reminder.schema';
import { DiaryDocument } from '../../infrastructure/persistence/diary.schema';
import { FarmPlotDocument } from '../../infrastructure/persistence/farm-plot.schema';
import { PetService } from '../../../pet/application/services/pet.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockReminder(overrides: Partial<any> = {}): any {
  return {
    _id: 'reminder-1',
    user_id: 'user-1',
    title: 'Water the tomatoes',
    status: 'pending' as ReminderStatus,
    is_sent: false,
    delivered_at: undefined,
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReminderService.complete() — idempotency', () => {
  let service: ReminderService;
  let mockPetService: Partial<PetService>;
  let mockReminderModel: any;

  beforeEach(async () => {
    mockPetService = {
      updateAfterTaskCompleted: jest.fn().mockResolvedValue({ streakCount: 1 }),
    };

    const baseFindOne = (id: string) => {
      // Default: returns a pending reminder for 'reminder-1'
      return Promise.resolve(buildMockReminder({ _id: id }));
    };

    mockReminderModel = {
      findById: jest.fn().mockImplementation((id: string) => ({
        exec: () => baseFindOne(id),
      })),
      find: jest.fn().mockReturnValue({
        sort: jest
          .fn()
          .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        {
          provide: getModelToken(ReminderDocument.name),
          useValue: mockReminderModel,
        },
        { provide: getModelToken(DiaryDocument.name), useValue: {} },
        { provide: getModelToken(FarmPlotDocument.name), useValue: {} },
        { provide: PetService, useValue: mockPetService },
        // ReminderSchedulerService is injected but not needed for these tests
        { provide: 'ReminderSchedulerService', useValue: {} },
      ],
    })
      .overrideProvider('ReminderSchedulerService')
      .useValue({})
      .compile();

    service = module.get<ReminderService>(ReminderService);
  });

  it('Task 3.3-a: first completion calls updateAfterTaskCompleted and saves', async () => {
    const pendingReminder = buildMockReminder({ status: 'pending' });
    mockReminderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(pendingReminder),
    });

    // Bypass ownership check — reminder belongs to user-1
    jest.spyOn(service as any, 'findOne').mockResolvedValue(pendingReminder);

    await service.complete('user-1', 'reminder-1');

    expect(mockPetService.updateAfterTaskCompleted).toHaveBeenCalledTimes(1);
    expect(pendingReminder.save).toHaveBeenCalledTimes(1);
    expect(pendingReminder.status).toBe('completed');
  });

  it('Task 3.3-b: already completed — returns early, does NOT call updateAfterTaskCompleted again', async () => {
    const completedReminder = buildMockReminder({ status: 'completed' });
    jest.spyOn(service as any, 'findOne').mockResolvedValue(completedReminder);

    const result = await service.complete('user-1', 'reminder-1');

    // Should return early — no pet update, no save
    expect(mockPetService.updateAfterTaskCompleted).not.toHaveBeenCalled();
    expect(completedReminder.save).not.toHaveBeenCalled();
    expect(result).toBe(completedReminder);
  });

  it('Task 3.3-c: double click simulation — second call is a no-op (silently success)', async () => {
    const reminder = buildMockReminder({ status: 'pending' });
    jest.spyOn(service as any, 'findOne').mockResolvedValue(reminder);

    // First click
    await service.complete('user-1', 'reminder-1');
    // Simulate status updated in-memory
    reminder.status = 'completed';

    // Second click (double-tap)
    await service.complete('user-1', 'reminder-1');

    // Pet service only called once total
    expect(mockPetService.updateAfterTaskCompleted).toHaveBeenCalledTimes(1);
    // save only called once total
    expect(reminder.save).toHaveBeenCalledTimes(1);
  });
});
