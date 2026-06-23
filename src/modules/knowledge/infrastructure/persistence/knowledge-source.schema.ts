import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'knowledge_sources',
})
export class KnowledgeSourceDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  source_url?: string;

  @Prop({
    type: MongooseSchema.Types.Map,
    of: MongooseSchema.Types.Mixed,
    default: {},
  })
  metadata: Record<string, any>;
}

export const KnowledgeSourceSchema: MongooseSchema =
  SchemaFactory.createForClass(KnowledgeSourceDocument);
