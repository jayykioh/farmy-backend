import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PetService } from './pet.service';
import {
  PetStateDocument,
  PetMood,
  PetMoodReason,
} from '../../infrastructure/persistence/pet-state.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock PetStateDocument */
function buildMockPet(overrides: Partial<PetStateDocument> = {}): PetStateDocument {
  return {
    _id: 'pet-1',
    user_id: 'user-1',
    mood: PetMood.NEUTRAL,
    previous_mood: undefined,
    streak_count: 0,
    last_diary_date: undefined,
    last_diary_at: undefined,
    missed_days: 0,
    level: 1,
    xp: 0,
    mood_reason: '',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PetStateDocument;
}

/** Helper to convert a UTC Date to VN date string "YYYY-MM-DD" */
function toVnDate(date: Date): string {
  const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

/** A date N days ago (UTC) */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PetService', () => {
  let service: PetService;
  let mockPetModel: any;
  let mockPet: PetStateDocument;

  beforeEach(async () => {
    mockPet = buildMockPet();

    mockPetModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPet),
      }),
      prototype: { save: jest.fn() },
    };
    // Make `new mockPetModel(...)` work for ensurePet creation path
    Object.setPrototypeOf(mockPetModel, Function.prototype);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetService,
        {
          provide: getModelToken(PetStateDocument.name),
          useValue: mockPetModel,
        },
      ],
    }).compile();

    service = module.get<PetService>(PetService);
  });

  // ─── calculateNewStreak (via updateAfterTaskCompleted) ───────────────────────

  describe('calculateNewStreak (tested via updateAfterTaskCompleted)', () => {
    it('Task 3.1-a: same VN day — streak does NOT increment', async () => {
      const todayVN = toVnDate(new Date());
      mockPet.streak_count = 3;
      mockPet.last_diary_date = todayVN; // already logged today

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(3); // unchanged
      expect(mockPet.missed_days).toBe(0);
      expect(mockPet.last_diary_date).toBe(todayVN);
    });

    it('Task 3.1-b: next VN day — streak increments by 1', async () => {
      const yesterday = daysAgo(1);
      mockPet.streak_count = 2;
      mockPet.last_diary_date = toVnDate(yesterday);

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(3); // incremented
      expect(mockPet.missed_days).toBe(0);
    });

    it('Task 3.1-c: 2+ days gap — streak RESETS to 1 (broken streak)', async () => {
      const twoDaysAgo = daysAgo(2);
      mockPet.streak_count = 5;
      mockPet.last_diary_date = toVnDate(twoDaysAgo);

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(1); // reset
      expect(mockPet.missed_days).toBe(0);
    });

    it('Task 3.1-d: first action ever (no last_diary_date) — streak starts at 1', async () => {
      mockPet.streak_count = 0;
      mockPet.last_diary_date = undefined;

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(1);
    });
  });

  // ─── updateAfterTaskCompleted ─────────────────────────────────────────────────

  describe('updateAfterTaskCompleted', () => {
    it('Task 3.2-a: grants 10 XP (not 30)', async () => {
      mockPet.xp = 0;
      mockPet.streak_count = 1;
      mockPet.last_diary_date = toVnDate(daysAgo(1));

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.exp).toBe(10);
    });

    it('Task 3.2-b: streak multiple of 3 → mood becomes excited', async () => {
      // Streak is currently 2; next-day completion will push it to 3
      mockPet.streak_count = 2;
      mockPet.last_diary_date = toVnDate(daysAgo(1));

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(3);
      expect(result.mood).toBe(PetMood.EXCITED);
      expect(result.moodReason).toBe(PetMoodReason.STREAK_MILESTONE);
    });

    it('Task 3.2-c: streak NOT multiple of 3 → mood is happy (not excited)', async () => {
      // Streak is 1; next-day will push to 2
      mockPet.streak_count = 1;
      mockPet.last_diary_date = toVnDate(daysAgo(1));

      const result = await service.updateAfterTaskCompleted('user-1', new Date());

      expect(result.streakCount).toBe(2);
      expect(result.mood).toBe(PetMood.HAPPY);
    });

    it('Task 3.2-d: stores previous_mood before updating', async () => {
      mockPet.mood = PetMood.WORRIED;
      mockPet.streak_count = 2;
      mockPet.last_diary_date = toVnDate(daysAgo(1));

      await service.updateAfterTaskCompleted('user-1', new Date());

      // After update (streak becomes 3 → excited), previous_mood should be the old mood
      expect(mockPet.previous_mood).toBe(PetMood.WORRIED);
    });
  });
});
