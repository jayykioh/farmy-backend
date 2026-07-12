/**
 * knowledge-validation.prompt.ts
 *
 * Gemini prompt template dùng để đánh giá chất lượng nội dung
 * bài viết nông nghiệp trước khi đưa vào RAG knowledge base.
 *
 * Thang điểm 0–100:
 *   ≥ 80 → validated (green, no warnings)
 *   60–79 → validated (yellow, warnings)
 *   40–59 → validated (orange, serious warnings)
 *   < 40  → rejected automatically
 */

/** Số ký tự tối đa của content gửi cho Gemini để tránh vượt context window */
const MAX_CONTENT_LENGTH = 3000;

export function buildValidationPrompt(
  content: string,
  category: string,
): string {
  const truncated = content.slice(0, MAX_CONTENT_LENGTH);
  const isTruncated = content.length > MAX_CONTENT_LENGTH;

  return `
Bạn là chuyên gia kiểm định nội dung cho hệ thống tri thức nông nghiệp Việt Nam (FarmDiaries AI).
Nhiệm vụ của bạn là đánh giá bài viết sau và trả về JSON hợp lệ ĐÚNG format được chỉ định.

=== BÀI VIẾT CẦN ĐÁNH GIÁ ===
Category (do Admin gán): ${category}
Nội dung${isTruncated ? ` (đã cắt còn ${MAX_CONTENT_LENGTH} ký tự đầu)` : ''}:
${truncated}
=== HẾT BÀI VIẾT ===

ĐÁNH GIÁ THEO 4 TIÊU CHÍ (tổng 100 điểm):

TIÊU CHÍ 1 — LIÊN QUAN NÔNG NGHIỆP (40 điểm):
  Bài có liên quan đến: trồng trọt, canh tác, giống cây, phân bón, thuốc BVTV,
  bảo vệ thực vật, chăn nuôi, thủy sản, nông cụ, nông nghiệp tổng quát?
  Hoàn toàn liên quan = 40đ | Liên quan một phần = 20đ | Không liên quan = 0đ

TIÊU CHÍ 2 — NGÔN NGỮ HỢP LỆ (20 điểm):
  Tiếng Việt = 20đ | Tiếng Anh = 20đ | Ngôn ngữ khác = 0đ

TIÊU CHÍ 3 — CATEGORY KHỚP NỘI DUNG (20 điểm):
  Category admin gán có phù hợp với nội dung thực tế?
  Khớp hoàn toàn = 20đ | Khớp một phần = 10đ | Không khớp = 0đ

TIÊU CHÍ 4 — KHÔNG CÓ THÔNG TIN NGUY HIỂM (20 điểm):
  Không có: thuốc/hóa chất bị cấm, liều lượng sai lệch nghiêm trọng,
  kỹ thuật gây hại cho người hoặc môi trường?
  An toàn hoàn toàn = 20đ | Có nghi vấn = 10đ | Rõ ràng nguy hiểm = 0đ

QUY TẮC TRẢ VỀ:
- Trả về JSON THUẦN TÚY (raw JSON), KHÔNG có markdown, KHÔNG có text thêm trước/sau
- Nếu score < 40: rejection_reason phải có nội dung giải thích rõ ràng bằng Tiếng Việt
- Nếu score >= 40: rejection_reason = null
- warnings là mảng các chuỗi, có thể rỗng []

FORMAT JSON (bắt buộc đúng chính xác):
{
  "score": <số nguyên 0-100>,
  "is_agriculture_related": <true hoặc false>,
  "language_detected": <"vi" hoặc "en" hoặc "other">,
  "category_match": <true hoặc false>,
  "warnings": [<"chuỗi cảnh báo 1">, <"chuỗi cảnh báo 2">],
  "rejection_reason": <null hoặc "lý do reject bằng tiếng Việt">
}
`.trim();
}
