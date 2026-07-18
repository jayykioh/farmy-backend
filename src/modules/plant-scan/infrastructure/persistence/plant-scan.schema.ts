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

const PlantScanTreatmentSubdocumentSchema = SchemaFactory.createForClass(
  PlantScanTreatmentSubdocument,
);

@Schema({ _id: false })
export class PlantScanDiagnosisSubdocument {
  @Prop({ type: Boolean, required: true, default: true })
  is_plant: boolean;

  @Prop({ type: String, required: false })
  disease_name?: string;

  @Prop({ type: Number, required: false })
  confidence?: number;

  @Prop({ type: [String], default: [] })
  symptoms: string[];

  @Prop({ type: PlantScanTreatmentSubdocumentSchema, required: false })
  treatment?: PlantScanTreatmentSubdocument;

  @Prop({ type: String, required: false, default: null })
  phi_warning?: string | null;

  @Prop({ type: String, required: false, default: null })
  safety_alert?: string | null;

  @Prop({ type: String, required: false, default: null })
  low_confidence_warning?: string | null;

  @Prop({ type: String, required: false })
  disclaimer?: string;
}

const PlantScanDiagnosisSubdocumentSchema = SchemaFactory.createForClass(
  PlantScanDiagnosisSubdocument,
);

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'plant_scans',
})
export class PlantScanDocument extends Document<string> {
  @Prop({ type: String, required: true })
  declare _id: string;

  @Prop({ type: String, ref: UserDocument.name, required: true, index: true })
  user_id: string;

  @Prop({
    type: String,
    required: true,
    enum: ['completed', 'failed'],
    default: 'completed',
  })
  status: string;

  @Prop({ type: String, required: false })
  image_key?: string;

  @Prop({ type: String, required: false })
  thumbnail_key?: string;

  @Prop({ type: String, required: false })
  p_hash?: string;

  @Prop({ type: String, required: true })
  crop_type: string;

  @Prop({ type: PlantScanDiagnosisSubdocumentSchema, required: false })
  diagnosis?: PlantScanDiagnosisSubdocument;

  @Prop({ type: String, required: false })
  model_used?: string;

  @Prop({ type: String, required: false })
  prompt_version?: string;

  @Prop({ type: Number, required: false })
  latency_ms?: number;

  @Prop({ type: String, required: false })
  cache_hit_from_scan_id?: string;

  @Prop({ type: String, required: false })
  error_code?: string;
}

export const PlantScanSchema: MongooseSchema =
  SchemaFactory.createForClass(PlantScanDocument);

// Indexes
PlantScanSchema.index({ user_id: 1, created_at: -1 });
PlantScanSchema.index({ p_hash: 1, status: 1 });
