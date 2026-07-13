import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum PetMood {
  EXCITED = 'excited',
  HAPPY = 'happy',
  NEUTRAL = 'neutral',
  SAD = 'sad',
  WORRIED = 'worried',
  SLEEPY = 'sleepy',
  HUNGRY = 'hungry',
}

export enum PetMoodReason {
  STREAK_MILESTONE = 'STREAK_MILESTONE',
  USER_LOGGED_DIARY_TODAY = 'USER_LOGGED_DIARY_TODAY',
  MISSED_MULTIPLE_DAYS = 'MISSED_MULTIPLE_DAYS',
  MISSED_ONE_DAY = 'MISSED_ONE_DAY',
  LATE_DAY_NO_DIARY = 'LATE_DAY_NO_DIARY',
  NEEDS_DAILY_DIARY = 'NEEDS_DAILY_DIARY',
  DEFAULT_STATE = 'DEFAULT_STATE',
}

const ALL_MOODS = Object.values(PetMood);

// ─── Schema ───────────────────────────────────────────────────────────────────

@Schema({
  timestamps: { createdAt: false, updatedAt: 'updated_at' },
  collection: 'pet_states',
})
export class PetStateDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({
    type: String,
    ref: UserDocument.name,
    required: true,
    unique: true,
    index: true,
  })
  user_id: string;

  @Prop({ type: String, enum: ALL_MOODS, default: PetMood.NEUTRAL })
  mood: PetMood;

  /** Stored before each mood update so FE can animate transitions */
  @Prop({ type: String, enum: ALL_MOODS, required: false })
  previous_mood?: PetMood;

  @Prop({ type: Number, default: 0 })
  streak_count: number;

  /** ISO date string "YYYY-MM-DD" in VN local time */
  @Prop({ type: String, required: false })
  last_diary_date?: string;

  /** How many consecutive days the user has NOT logged (reset on diary creation) */
  @Prop({ type: Number, default: 0 })
  missed_days: number;

  @Prop({ type: Number, default: 1 })
  level: number;

  @Prop({ type: Number, default: 0 })
  xp: number;

  @Prop({ type: String, required: false, default: '' })
  mood_reason?: string;

  @Prop({ type: [String], default: [] })
  owned_items: string[];

  @Prop({ type: [String], default: [] })
  equipped_items: string[];

  /** @deprecated – kept for backward compat, use mood_reason instead */
  @Prop({ type: Date, required: false })
  last_diary_at?: Date;
}

export const PetStateSchema: MongooseSchema =
  SchemaFactory.createForClass(PetStateDocument);
