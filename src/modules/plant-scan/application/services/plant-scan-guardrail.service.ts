import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const PHI_KEYWORDS = [
  'thuốc',
  'phun',
  'liều lượng',
  'phi',
  'cách ly',
  'trừ sâu',
  'diệt cỏ',
  'bảo vệ thực vật',
];
const BANNED_PESTICIDES = ['paraquat', 'chlorpyrifos', 'carbofuran'];

export const GeminiDiagnosisSchema = z.object({
  is_plant: z.boolean(),
  assessment_state: z.string().optional().default('signs_to_monitor'),
  disease_name: z.string().optional(),
  confidence: z.number().optional(),
  symptoms: z.array(z.string()).optional().default([]),
  evidence_observed: z.array(z.string()).optional().default([]),
  possible_causes: z
    .array(
      z.object({
        name: z.string(),
        matched_points: z.array(z.string()).optional().default([]),
        uncertain_points: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  missing_evidence: z.array(z.string()).optional().default([]),
  treatment: z
    .object({
      chemical: z.string().optional().default(''),
      organic: z.string().optional().default(''),
      source_citation: z.string().optional().default(''),
      safe_immediate_actions: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({ chemical: '', organic: '', source_citation: '', safe_immediate_actions: [] }),
});

export type GeminiDiagnosis = z.infer<typeof GeminiDiagnosisSchema>;

@Injectable()
export class PlantScanGuardrailService {
  applyBVTVGuardrail(diagnosis: GeminiDiagnosis): any {
    const enrichedDiagnosis: any = { ...diagnosis };

    if (diagnosis.is_plant === false) {
      return enrichedDiagnosis;
    }

    const treatmentText = [
      diagnosis.treatment?.chemical ?? '',
      diagnosis.treatment?.organic ?? '',
    ]
      .join(' ')
      .toLowerCase();

    // 1. PHI Warning
    if (PHI_KEYWORDS.some((k) => treatmentText.includes(k))) {
      if (!enrichedDiagnosis.treatment) enrichedDiagnosis.treatment = {};
      enrichedDiagnosis.treatment.phi_warning =
        '⚠️ Tuân thủ thời gian cách ly PHI: Cách ly 14 ngày trước thu hoạch sau khi phun thuốc hóa học.';
    }

    // 2. Banned Pesticides
    const flagged = BANNED_PESTICIDES.filter((p) => treatmentText.includes(p));
    if (flagged.length > 0) {
      enrichedDiagnosis.safety_alert = `🚨 CẢNH BÁO BẢO VỆ THỰC VẬT: Hoạt chất ${flagged.join(
        ', ',
      )} nằm trong danh mục cấm hoặc hạn chế nghiêm ngặt tại Việt Nam do độc tính cao. Vui lòng tham khảo ý kiến Chi cục Bảo vệ Thực vật địa phương để thay thế bằng hoạt chất an toàn hơn.`;
    }

    // 3. Low Confidence
    if (
      typeof diagnosis.confidence === 'number' &&
      diagnosis.confidence < 0.6
    ) {
      enrichedDiagnosis.low_confidence_warning =
        '⚠️ Độ tin cậy thấp (< 60%). Vui lòng chụp lại ảnh rõ nét hơn dưới ánh sáng tự nhiên hoặc bổ sung thêm triệu chứng mô tả.';
    }

    // 4. Mandatory Disclaimer
    enrichedDiagnosis.disclaimer =
      'LƯU Ý: AI chỉ mang tính chất tham khảo ban đầu. Bà con nên kết hợp kinh nghiệm thực tế hoặc hỏi ý kiến chuyên gia nông nghiệp trước khi áp dụng.';

    return enrichedDiagnosis;
  }
}
