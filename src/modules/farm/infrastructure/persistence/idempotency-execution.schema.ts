import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import * as crypto from 'crypto';

export type IdempotencyExecutionStatus = 'processing' | 'completed' | 'failed';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'idempotency_executions',
})
export class IdempotencyExecutionDocument extends Document<string> {
  @Prop({ type: String, required: true, default: () => crypto.randomUUID() })
  declare _id: string;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  idempotencyKey: string;

  @Prop({ type: String, required: true })
  requestHash: string;

  @Prop({ type: String, enum: ['processing', 'completed', 'failed'], required: true })
  status: IdempotencyExecutionStatus;

  @Prop({ type: String, required: true })
  ownerToken: string;

  @Prop({ type: Date, required: true })
  leaseUntil: Date;

  @Prop({ type: Date, required: true })
  heartbeatAt: Date;

  @Prop({ type: Number, required: true, default: 0 })
  attemptCount: number;

  @Prop({ type: [String], default: [] })
  uploadedKeys: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  responseData?: any;
}

export const IdempotencyExecutionSchema: MongooseSchema = SchemaFactory.createForClass(IdempotencyExecutionDocument);

IdempotencyExecutionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true }
);
