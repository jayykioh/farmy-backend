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
  disease_name: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  symptoms: z.array(z.string()).optional().default([]),
  treatment: z
    .object({
      chemical: z.string().optional().default(''),
      organic: z.string().optional().default(''),
    })
    .optional()
    .default({ chemical: '', organic: '' }),
});

export type GeminiDiagnosis = z.infer<typeof GeminiDiagnosisSchema>;

@Injectable()
export class PlantScanGuardrailService {
  applyBVTVGuardrail(diagnosis: GeminiDiagnosis): any {
    const enrichedDiagnosis: any = {
      ...diagnosis,
      treatment: { ...diagnosis.treatment },
    };

    if (!diagnosis.is_plant) return enrichedDiagnosis;

    const treatmentText = [
      diagnosis.treatment?.chemical ?? '',
      diagnosis.treatment?.organic ?? '',
    ]
      .join(' ')
      .toLowerCase();

    if (PHI_KEYWORDS.some((keyword) => treatmentText.includes(keyword))) {
      enrichedDiagnosis.treatment.phi_warning =
        '⚠️ Kiểm tra nhãn sản phẩm và tuân thủ đúng thời gian cách ly (PHI) của loại thuốc được phép sử dụng tại địa phương.';
    }

    const flagged = BANNED_PESTICIDES.filter((item) =>
      treatmentText.includes(item),
    );
    if (flagged.length > 0) {
      enrichedDiagnosis.safety_alert = `🚨 Hoạt chất ${flagged.join(', ')} thuộc nhóm bị cấm hoặc hạn chế nghiêm ngặt. Không sử dụng và hãy hỏi cơ quan bảo vệ thực vật địa phương về phương án thay thế.`;
    }

    if (typeof diagnosis.confidence === 'number' && diagnosis.confidence < 0.6) {
      enrichedDiagnosis.treatment.chemical = '';
      enrichedDiagnosis.low_confidence_warning =
        'Mức chắc chắn còn thấp. Hãy chụp thêm ảnh rõ nét dưới ánh sáng tự nhiên và bổ sung diễn biến triệu chứng trước khi cân nhắc biện pháp điều trị.';
    }

    enrichedDiagnosis.disclaimer =
      'AI chỉ đưa ra đánh giá ban đầu từ bằng chứng hiện có. Hãy kiểm tra thực tế hoặc hỏi chuyên gia nông nghiệp trước khi áp dụng biện pháp điều trị.';

    return enrichedDiagnosis;
  }
}
