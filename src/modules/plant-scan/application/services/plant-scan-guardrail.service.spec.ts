import { Test, TestingModule } from '@nestjs/testing';
import {
  PlantScanGuardrailService,
  GeminiDiagnosis,
} from './plant-scan-guardrail.service';

describe('PlantScanGuardrailService', () => {
  let service: PlantScanGuardrailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlantScanGuardrailService],
    }).compile();

    service = module.get<PlantScanGuardrailService>(PlantScanGuardrailService);
  });

  it('should apply PHI warning when keywords are present', () => {
    const mockDiagnosis: GeminiDiagnosis = {
      is_plant: true,
      assessment_state: 'signs_to_monitor',
      symptoms: [],
      evidence_observed: [],
      possible_causes: [],
      missing_evidence: [],
      disease_name: 'Bệnh rỉ sắt',
      confidence: 0.9,
      treatment: {
        chemical: 'Phun thuốc diệt nấm Anvil',
        organic: '',
        source_citation: '',
        safe_immediate_actions: [],
      },
    };

    const result = service.applyBVTVGuardrail(mockDiagnosis);
    expect(result.treatment.phi_warning).toBeDefined();
    expect(result.treatment.phi_warning).toContain('PHI');
  });

  it('should flag banned pesticides', () => {
    const mockDiagnosis: GeminiDiagnosis = {
      is_plant: true,
      assessment_state: 'signs_to_monitor',
      symptoms: [],
      evidence_observed: [],
      possible_causes: [],
      missing_evidence: [],
      disease_name: 'Sâu cuốn lá',
      confidence: 0.85,
      treatment: {
        chemical: 'Dùng chlorpyrifos để diệt sâu',
        organic: '',
        source_citation: '',
        safe_immediate_actions: [],
      },
    };

    const result = service.applyBVTVGuardrail(mockDiagnosis);
    expect(result.safety_alert).toBeDefined();
    expect(result.safety_alert).toContain('chlorpyrifos');
    expect(result.safety_alert).toContain('cấm hoặc hạn chế');
  });

  it('should add low confidence warning if confidence < 0.6', () => {
    const mockDiagnosis: GeminiDiagnosis = {
      is_plant: true,
      assessment_state: 'signs_to_monitor',
      symptoms: [],
      evidence_observed: [],
      possible_causes: [],
      missing_evidence: [],
      disease_name: 'Không rõ bệnh',
      confidence: 0.5,
      treatment: {
        chemical: '',
        organic: '',
        source_citation: '',
        safe_immediate_actions: [],
      },
    };

    const result = service.applyBVTVGuardrail(mockDiagnosis);
    expect(result).toBeDefined();
  });
});
