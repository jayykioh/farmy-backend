import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';

@Schema({ _id: false })
export class PlantScanTreatmentSubdocument {
  @Prop({ type: String, required: true })
  chemical: string;

  @Prop({ type: String, required: true })
  organic: string;

  @Prop({ type: String, required: false })
  phi_warning?: string;
}

const PlantScanTreatmentSubdocumentSchema = SchemaFactory.createForClass(PlantScanTreatmentSubdocument);

@Schema({ _id: false })
export class PlantScanDiagnosisSubdocument {
  @Prop({ type: Boolean, required: true, default: true })
  is_plant: boolean;

  @Prop({ type: String, required: true })
  disease: string;

  @Prop({ type: Number, required: true })
  confidence: number;

  @Prop({ type: [String], default: [] })
  symptoms: string[];

  @Prop({ type: PlantScanTreatmentSubdocumentSchema, required: true })
  treatment: PlantScanTreatmentSubdocument;

  @Prop({ type: String, required: false, default: null })
  safety_alert?: string | null;

  @Prop({ type: String, required: false, default: null })
  low_confidence_warning?: string | null;
}

const PlantScanDiagnosisSubdocumentSchema = SchemaFactory.createForClass(PlantScanDiagnosisSubdocument);

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'plant_scans',
})
export class PlantScanDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({ type: String, required: true })
  image_url: string;

  @Prop({ type: String, required: true })
  p_hash: string;

  @Prop({ type: String, required: true })
  crop_type: string;

  @Prop({ type: PlantScanDiagnosisSubdocumentSchema, required: true })
  diagnosis: PlantScanDiagnosisSubdocument;

  @Prop({ type: String, required: true })
  model_used: string;

  @Prop({ type: String, required: true })
  vision_prompt_version: string;

  @Prop({ type: Boolean, default: false })
  cached: boolean;
}

export const PlantScanSchema: MongooseSchema = SchemaFactory.createForClass(PlantScanDocument);

// Indexes
PlantScanSchema.index({ user_id: 1, created_at: -1 });
PlantScanSchema.index({ p_hash: 1 });
