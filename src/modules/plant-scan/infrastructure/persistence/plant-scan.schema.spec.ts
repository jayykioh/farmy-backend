import { PlantScanSchema } from './plant-scan.schema';

describe('PlantScanSchema', () => {
  it('persists diagnosis.disease_name as the canonical API field', () => {
    expect(PlantScanSchema.path('diagnosis.disease_name')).toBeDefined();
    expect(PlantScanSchema.path('diagnosis.disease')).toBeUndefined();
  });
});
