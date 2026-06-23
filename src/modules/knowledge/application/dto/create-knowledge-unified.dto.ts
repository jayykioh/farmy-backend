import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * CreateKnowledgeUnifiedDto
 *
 * Dùng cho endpoint POST /admin/knowledge (multipart/form-data).
 * Tất cả fields đều optional ở DTO level vì:
 *   - Khi upload file JSON → các field lấy từ file, không cần form fields
 *   - Khi upload PDF/DOCX → chỉ cần category (+ title optional)
 *   - Khi nhập thủ công  → cần content + category (+ title optional)
 *
 * Validation thực tế (content XOR file, category required nếu không phải JSON)
 * được thực hiện trong controller logic sau khi đã biết loại file.
 */
export class CreateKnowledgeUnifiedDto {
  /**
   * Tiêu đề bài viết.
   * - Bắt buộc nếu không có file
   * - Optional nếu có file → mặc định = tên file bỏ extension
   * - Với JSON file → lấy từ file.title (ghi đè nếu form có title)
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  /**
   * Nội dung bài viết (plain text).
   * Chỉ dùng khi KHÔNG có file đính kèm.
   * Nếu có file thì field này bị bỏ qua.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  /**
   * Danh mục bài viết.
   * BẮT BUỘC trừ khi upload JSON file (đã có category trong file).
   * Ví dụ: "trồng trọt", "chăn nuôi", "thủy sản", "nông cụ"
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  /**
   * URL nguồn tài liệu gốc (optional).
   * Ví dụ: "https://fao.org/rice-water-management"
   */
  @IsOptional()
  @IsUrl()
  source_url?: string;
}
