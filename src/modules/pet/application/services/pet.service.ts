import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { PetStateDocument, PetMood } from '../../infrastructure/persistence/pet-state.schema';

@Injectable()
export class PetService {
  private readonly logger = new Logger(PetService.name);

  constructor(
    @InjectModel(PetStateDocument.name)
    private readonly petModel: Model<PetStateDocument>,
  ) {}

  /**
   * Lấy trạng thái thú ảo của user, nếu chưa có thì khởi tạo mặc định
   */
  async getPetState(userId: string): Promise<PetStateDocument & { bubble_message: string }> {
    let pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) {
      this.logger.log(`Initializing pet state for user ${userId}`);
      pet = new this.petModel({
        _id: crypto.randomUUID(),
        user_id: userId,
        mood: 'happy',
        streak_count: 0,
        level: 1,
        xp: 0,
        mood_reason: 'Chào mừng bạn đến với Farm-Diary!',
      });
      await pet.save();
    }

    const bubbleMessage = this.generateBubbleMessage(pet.mood, pet.streak_count);
    
    // Return object with bubble message attached
    const res = pet.toObject() as any;
    res.bubble_message = bubbleMessage;
    return res;
  }

  /**
   * Cộng XP và xử lý tăng cấp (Level Up)
   */
  private addXp(pet: PetStateDocument, amount: number): void {
    pet.xp += amount;
    let xpNeeded = pet.level * 100; // Cấp 1 cần 100XP, cấp 2 cần 200XP...
    while (pet.xp >= xpNeeded) {
      pet.xp -= xpNeeded;
      pet.level += 1;
      pet.mood = 'excited';
      pet.mood_reason = `Chúc mừng bạn đã đạt Cấp ${pet.level}!`;
      xpNeeded = pet.level * 100;
    }
  }

  /**
   * Tính toán khoảng cách số ngày (Local Time offset UTC+7)
   */
  private getStartOfDayLocal(date: Date): Date {
    const localTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(
        localTime.getUTCFullYear(),
        localTime.getUTCMonth(),
        localTime.getUTCDate(),
      ),
    );
  }

  /**
   * Cập nhật Streak và Mood khi người dùng ghi nhật ký
   */
  async updateStreakAndMoodOnDiaryCreated(userId: string, diaryDate: Date = new Date()): Promise<PetStateDocument | null> {
    // Đảm bảo petState tồn tại
    await this.getPetState(userId);
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return null;

    const todayStart = this.getStartOfDayLocal(diaryDate);
    this.addXp(pet, 30); // Ghi nhật ký được 30 XP

    if (!pet.last_diary_at) {
      // Ghi lần đầu tiên
      pet.streak_count = 1;
      pet.mood = 'happy';
      pet.mood_reason = 'Hoàn thành ghi nhật ký đầu tiên!';
    } else {
      const lastStart = this.getStartOfDayLocal(pet.last_diary_at);
      const diffMs = todayStart.getTime() - lastStart.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Ngày liên tiếp tiếp theo -> Tăng streak
        pet.streak_count += 1;
        
        // Kiểm tra milestone streak
        if ([7, 14, 30].includes(pet.streak_count)) {
          pet.mood = 'excited';
          pet.mood_reason = `Đạt mốc ${pet.streak_count} ngày chăm chỉ liên tiếp! 🎉`;
        } else {
          pet.mood = 'happy';
          pet.mood_reason = `Cập nhật streak ${pet.streak_count} ngày liên tiếp!`;
        }
      } else if (diffDays > 1) {
        // Đứt streak -> reset về 1
        pet.streak_count = 1;
        pet.mood = 'happy';
        pet.mood_reason = 'Đặt lại streak do quên ghi nhật ký.';
      } else {
        // diffDays === 0 (Ghi nhiều lần trong ngày) -> Giữ nguyên streak và mood
        pet.mood_reason = 'Ghi thêm nhật ký trong ngày.';
      }
    }

    pet.last_diary_at = diaryDate;
    return pet.save();
  }

  /**
   * Cập nhật mood khi hoàn thành nhắc nhở sớm
   */
  async updateMoodOnReminderCompleted(userId: string): Promise<PetStateDocument | null> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return null;

    this.addXp(pet, 10); // Hoàn thành nhắc nhở được 10 XP
    pet.mood = 'happy';
    pet.mood_reason = 'Hoàn thành tốt công việc vườn tược!';
    return pet.save();
  }

  /**
   * Cập nhật mood khi bỏ lỡ nhắc nhở (để quá giờ)
   */
  async updateMoodOnReminderFailed(userId: string): Promise<PetStateDocument | null> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return null;

    pet.mood = 'sad';
    pet.mood_reason = 'Bỏ lỡ hoạt động vườn tược chăm sóc cây!';
    return pet.save();
  }

  /**
   * Cập nhật mood trực tiếp (ví dụ khi bị sâu bệnh rầy nâu nặng)
   */
  async updateMood(userId: string, mood: PetMood, reason: string): Promise<PetStateDocument | null> {
    const pet = await this.petModel.findOne({ user_id: userId }).exec();
    if (!pet) return null;

    pet.mood = mood;
    pet.mood_reason = reason;
    return pet.save();
  }

  /**
   * Phát sinh tin nhắn bong bóng lời thoại động cho Thú ảo
   */
  private generateBubbleMessage(mood: PetMood, streak: number): string {
    switch (mood) {
      case 'excited':
        return `Bé Thóc hào hứng quá chủ vườn ơi! Chuỗi ${streak} ngày chăm sóc liên tục thật xuất sắc! Tiếp tục duy trì nhé! 🎉`;
      case 'happy':
        return `Chào chủ vườn! Hôm nay thời tiết rất đẹp, bạn đã hoàn thành công việc vườn tược nào chưa? 🌱`;
      case 'neutral':
        return `Bạn ơi, đã đến giờ kiểm tra vườn rồi đấy. Hãy cập nhật nhật ký vụ mùa hôm nay nhé!`;
      case 'sad':
        return `Bé Thóc buồn ghê... Đã lâu bạn không ghé thăm Thóc và viết nhật ký vụ mùa rồi. 😢`;
      case 'worried':
        return `Cảnh báo! Có dấu hiệu sâu bệnh bất thường trong vườn cần xử lý ngay! Bé Thóc lo lắm đấy! 😰`;
      default:
        return `Chào chủ vườn! Chúc bạn một ngày làm vườn thật nhiều niềm vui!`;
    }
  }
}
