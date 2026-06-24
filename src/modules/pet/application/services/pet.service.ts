/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  PetStateDocument,
  PetMood,
  PetMoodReason,
} from '../../infrastructure/persistence/pet-state.schema';

// ─── DTOs / Response Shape ────────────────────────────────────────────────────

export interface CalculateMoodInput {
  /** Whether the user has already logged a diary today */
  loggedToday: boolean;
  streakCount: number;
  missedDays: number;
  /** Current hour in VN local time (0-23) */
  currentHourVN: number;
}

export interface PetStatusResponse {
  mood: PetMood;
  previousMood?: PetMood;
  streakCount: number;
  level: number;
  exp: number;
  lastDiaryDate?: string;
  missedDays: number;
  moodReason: PetMoodReason | string;
  bubbleMessage: string;
  updatedAt?: Date;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PetService {
  private readonly logger = new Logger(PetService.name);

  constructor(
    @InjectModel(PetStateDocument.name)
    private readonly petModel: Model<PetStateDocument>,
  ) {}

  // ── Mood Calculation Engine (source of truth) ─────────────────────────────

  /**
   * Pure function — no DB access, fully testable.
   * Priority order matches the approved spec:
   *  1. Logged today + streak >= 7  → excited
   *  2. Logged today                → happy
   *  3. missedDays >= 2             → sad
   *  4. missedDays == 1             → worried
   *  5. No diary today + hour >= 20 → sleepy
   *  6. No diary today              → hungry
   *  7. Default                     → neutral
   */
  calculateMood(input: CalculateMoodInput): {
    mood: PetMood;
    reason: PetMoodReason;
  } {
    const { loggedToday, streakCount, missedDays, currentHourVN } = input;

    if (loggedToday && streakCount >= 7) {
      return { mood: PetMood.EXCITED, reason: PetMoodReason.STREAK_MILESTONE };
    }

    if (loggedToday) {
      return {
        mood: PetMood.HAPPY,
        reason: PetMoodReason.USER_LOGGED_DIARY_TODAY,
      };
    }

    if (missedDays >= 2) {
      return { mood: PetMood.SAD, reason: PetMoodReason.MISSED_MULTIPLE_DAYS };
    }

    if (missedDays === 1) {
      return { mood: PetMood.WORRIED, reason: PetMoodReason.MISSED_ONE_DAY };
    }

    if (currentHourVN >= 20) {
      return { mood: PetMood.SLEEPY, reason: PetMoodReason.LATE_DAY_NO_DIARY };
    }

    if (!loggedToday) {
      return { mood: PetMood.HUNGRY, reason: PetMoodReason.NEEDS_DAILY_DIARY };
    }

    return { mood: PetMood.NEUTRAL, reason: PetMoodReason.DEFAULT_STATE };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns "YYYY-MM-DD" in Vietnam local time (UTC+7) */
  private getTodayVN(): string {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vnTime.toISOString().slice(0, 10);
  }

  /** Returns current hour (0-23) in Vietnam local time */
  private getCurrentHourVN(): number {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vnTime.getUTCHours();
  }

  /** XP → Level progression: level N requires N * 100 XP */
  private addXp(pet: PetStateDocument, amount: number): void {
    pet.xp += amount;
    let xpNeeded = pet.level * 100;
    while (pet.xp >= xpNeeded) {
      pet.xp -= xpNeeded;
      pet.level += 1;
      xpNeeded = pet.level * 100;
      this.logger.log(`User ${pet.user_id} leveled up to ${pet.level}`);
    }
  }

  /** Bubble message shown in the speech bubble overlay */
  generateBubbleMessage(mood: PetMood, streak: number): string {
    switch (mood) {
      case PetMood.EXCITED:
        return `🎉 ${streak} ngày liên tiếp! Bé Thóc cực kỳ tự hào về bạn!`;
      case PetMood.HAPPY:
        return `🌱 Tuyệt vời! Bé Thóc vui lắm vì bạn đã ghi nhật ký hôm nay!`;
      case PetMood.SAD:
        return `💧 Bé Thóc nhớ bạn quá... Hãy quay lại viết nhật ký nhé!`;
      case PetMood.WORRIED:
        return `😟 Hôm qua bạn bỏ quên nhật ký rồi, hôm nay đừng bỏ nữa nhé!`;
      case PetMood.SLEEPY:
        return `💤 Muộn rồi... Nhưng vẫn còn kịp ghi nhật ký cho hôm nay đấy!`;
      case PetMood.HUNGRY:
        return `🍚 Bé Thóc đói bụng rồi! Ghi nhật ký để cho Thóc ăn nào!`;
      case PetMood.NEUTRAL:
      default:
        return `🍃 Chào chủ vườn! Chúc bạn một ngày chăm vườn vui vẻ!`;
    }
  }

  // ── Core Service Methods ──────────────────────────────────────────────────

  /** Ensure pet record exists for user, create if needed */
  private async ensurePet(userId: string): Promise<PetStateDocument> {
    let pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) {
      this.logger.log(`Creating initial pet state for user ${userId}`);
      const todayVN = this.getTodayVN();
      const { mood, reason } = this.calculateMood({
        loggedToday: false,
        streakCount: 0,
        missedDays: 0,
        currentHourVN: this.getCurrentHourVN(),
      });
      pet = new this.petModel({
        _id: crypto.randomUUID(),
        user_id: userId,
        mood,
        previous_mood: undefined,
        streak_count: 0,
        missed_days: 0,
        last_diary_date: undefined,
        level: 1,
        xp: 0,
        mood_reason: reason,
      });
      await pet.save();
    }
    return pet;
  }

  /**
   * GET /pet/status — primary endpoint, returns full PetStatusResponse.
   * Also recalculates mood based on current time / missedDays each call.
   */
  async getStatus(userId: string): Promise<PetStatusResponse> {
    const pet = await this.ensurePet(userId);
    const todayVN = this.getTodayVN();
    const loggedToday = pet.last_diary_date === todayVN;

    // Recalculate missedDays on the fly
    let missedDays = pet.missed_days;
    if (!loggedToday && pet.last_diary_date) {
      const lastDate = new Date(pet.last_diary_date + 'T00:00:00Z');
      const todayDate = new Date(todayVN + 'T00:00:00Z');
      const diffMs = todayDate.getTime() - lastDate.getTime();
      missedDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) - 1);
    }

    const { mood, reason } = this.calculateMood({
      loggedToday,
      streakCount: pet.streak_count,
      missedDays,
      currentHourVN: this.getCurrentHourVN(),
    });

    // Persist mood change if it differs
    if (pet.mood !== mood) {
      pet.previous_mood = pet.mood;
      pet.mood = mood;
      pet.mood_reason = reason;
      pet.missed_days = missedDays;
      await pet.save();
    }

    return {
      mood: pet.mood,
      previousMood: pet.previous_mood,
      streakCount: pet.streak_count,
      level: pet.level,
      exp: pet.xp,
      lastDiaryDate: pet.last_diary_date,
      missedDays: pet.missed_days,
      moodReason: pet.mood_reason ?? reason,
      bubbleMessage: this.generateBubbleMessage(pet.mood, pet.streak_count),
      updatedAt: (pet as any).updated_at,
    };
  }

  /**
   * Called by DiaryService after a successful diary log creation.
   * Updates streak, XP, previousMood, mood.
   */
  async updateAfterDiaryCreated(
    userId: string,
    diaryDate: Date = new Date(),
  ): Promise<PetStatusResponse> {
    const pet = await this.ensurePet(userId);
    const todayVN = this.getTodayVN();

    // Add XP regardless
    this.addXp(pet, 30);

    // Streak logic
    const diaryDateVN = (() => {
      const d = new Date(diaryDate.getTime() + 7 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    })();

    if (!pet.last_diary_date) {
      // First diary ever
      pet.streak_count = 1;
    } else if (pet.last_diary_date === diaryDateVN) {
      // Same day — don't change streak
    } else {
      const lastDate = new Date(pet.last_diary_date + 'T00:00:00Z');
      const thisDate = new Date(diaryDateVN + 'T00:00:00Z');
      const diffDays = Math.round(
        (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        pet.streak_count += 1;
      } else {
        pet.streak_count = 1; // broken streak, restart
      }
    }

    // Reset missedDays since user just logged
    pet.missed_days = 0;
    pet.last_diary_date = diaryDateVN;
    // Also keep backward-compat field
    pet.last_diary_at = diaryDate;

    // Recalculate mood
    const { mood, reason } = this.calculateMood({
      loggedToday: true,
      streakCount: pet.streak_count,
      missedDays: 0,
      currentHourVN: this.getCurrentHourVN(),
    });

    // Store previous mood before update
    if (pet.mood !== mood) {
      pet.previous_mood = pet.mood;
    }
    pet.mood = mood;
    pet.mood_reason = reason;

    await pet.save();
    this.logger.log(
      `Pet updated for user ${userId}: mood=${mood}, streak=${pet.streak_count}, xp=${pet.xp}`,
    );

    return {
      mood: pet.mood,
      previousMood: pet.previous_mood,
      streakCount: pet.streak_count,
      level: pet.level,
      exp: pet.xp,
      lastDiaryDate: pet.last_diary_date,
      missedDays: pet.missed_days,
      moodReason: reason,
      bubbleMessage: this.generateBubbleMessage(pet.mood, pet.streak_count),
      updatedAt: (pet as any).updated_at,
    };
  }

  // ── Legacy / Backward-Compat Methods ─────────────────────────────────────

  /** @deprecated Use getStatus() instead. Kept for /pet/state backward compat. */
  async getPetState(
    userId: string,
  ): Promise<PetStatusResponse & { bubble_message: string }> {
    const status = await this.getStatus(userId);
    return { ...status, bubble_message: status.bubbleMessage };
  }

  /** @deprecated Use updateAfterDiaryCreated() instead. */
  async updateStreakAndMoodOnDiaryCreated(
    userId: string,
    diaryDate: Date = new Date(),
  ): Promise<PetStatusResponse> {
    return this.updateAfterDiaryCreated(userId, diaryDate);
  }

  /** Update mood on completed reminder */
  async updateMoodOnReminderCompleted(userId: string): Promise<void> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return;
    this.addXp(pet, 10);
    pet.previous_mood = pet.mood;
    pet.mood = PetMood.HAPPY;
    pet.mood_reason = PetMoodReason.USER_LOGGED_DIARY_TODAY;
    await pet.save();
  }

  /** Update mood on failed/missed reminder */
  async updateMoodOnReminderFailed(userId: string): Promise<void> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return;
    pet.previous_mood = pet.mood;
    pet.mood = PetMood.WORRIED;
    pet.mood_reason = PetMoodReason.MISSED_ONE_DAY;
    await pet.save();
  }

  /** Force-set mood (admin / test use) */
  async updateMood(
    userId: string,
    mood: PetMood,
    reason: string,
  ): Promise<void> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return;
    pet.previous_mood = pet.mood;
    pet.mood = mood;
    pet.mood_reason = reason;
    await pet.save();
  }
}
