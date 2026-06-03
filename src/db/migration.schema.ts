import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'executed_at', updatedAt: false },
  collection: 'migrations',
})
export class MigrationDocument extends Document {
  @Prop({ required: true, unique: true })
  name: string;
}

export const MigrationSchema: MongooseSchema =
  SchemaFactory.createForClass(MigrationDocument);
