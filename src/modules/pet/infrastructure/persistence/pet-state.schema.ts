import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

export type PetMood = 'happy' | 'neutral' | 'sad' | 'worried' | 'excited';

@Schema({
  timestamps: { createdAt: false, updatedAt: 'updated_at' },
  collection: 'pet_states',
})
export class PetStateDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, unique: true, index: true })
  user_id: string;

  @Prop({
    type: String,
    enum: ['happy', 'neutral', 'sad', 'worried', 'excited'],
    default: 'happy',
  })
  mood: PetMood;

  @Prop({ type: Number, default: 0 })
  streak_count: number;

  @Prop({ type: Date, required: false })
  last_diary_at?: Date;

  @Prop({ type: Number, default: 1 })
  level: number;

  @Prop({ type: Number, default: 0 })
  xp: number;

  @Prop({ type: String, required: false, default: '' })
  mood_reason?: string;
}

export const PetStateSchema: MongooseSchema =
  SchemaFactory.createForClass(PetStateDocument);
