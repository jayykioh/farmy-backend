/**
 * file-parser.service.ts
 *
 * Unified file parsing service cho Knowledge Module.
 * Hỗ trợ 3 định dạng: PDF, DOCX, JSON.
 *
 * Không có DB calls, không có external API calls — pure parsing.
 */
import {
  Injectable,
  Logger,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
// pdf-parse v2 uses class-based API
import { PDFParse } from 'pdf-parse';
import mammoth = require('mammoth');

/** Kết quả trả về sau khi parse file */
export interface ParsedFileResult {
  /** Nội dung text đã extract */
  content: string;
  /** Title lấy từ file (chỉ có với JSON file) */
  title?: string;
  /** Category lấy từ file (chỉ có với JSON file) */
  category?: string;
  /** Source URL lấy từ file (chỉ có với JSON file) */
  source_url?: string;
  /** Loại file gốc */
  sourceFileType: 'pdf' | 'docx' | 'json';
  /** Số ký tự extract được */
  extractedChars: number;
  /** Số trang (chỉ có với PDF) */
  pageCount?: number;
}

/** MIME types hợp lệ */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json',
] as const;

/** Extensions hợp lệ tương ứng */
export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.json'] as const;

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  /**
   * Parse file buffer dựa trên MIME type.
   * @param buffer - File buffer từ Multer memoryStorage
   * @param mimetype - MIME type của file
   * @param originalname - Tên file gốc (dùng fallback title)
   */
  async parse(
    buffer: Buffer,
    mimetype: string,
    originalname: string,
  ): Promise<ParsedFileResult> {
    this.logger.log({
      action: 'file-parser.parse',
      mimetype,
      originalname,
      sizeBytes: buffer.length,
    });

    if (mimetype === 'application/pdf') {
      return this.parsePdf(buffer);
    }

    if (
      mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return this.parseDocx(buffer);
    }

    if (mimetype === 'application/json') {
      return this.parseJson(buffer);
    }

    throw new UnsupportedMediaTypeException(
      `Định dạng file "${mimetype}" không được hỗ trợ. Chỉ chấp nhận PDF, DOCX và JSON.`,
    );
  }

  // ─── PDF ──────────────────────────────────────────────────────────────────

  private async parsePdf(buffer: Buffer): Promise<ParsedFileResult> {
    let text: string;
    let numPages: number | undefined;

    try {
      // pdf-parse v2: pass buffer as data
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text?.trim() ?? '';
      // v2 API: access pages count safely
      const resultUnknown = result as unknown as Record<string, unknown>;
      numPages = Array.isArray(resultUnknown['pages'])
        ? (resultUnknown['pages'] as unknown[]).length
        : undefined;
    } catch (error) {
      const err = error as Error;
      if (err.message?.toLowerCase().includes('password')) {
        throw new UnprocessableEntityException(
          'PDF được bảo vệ bằng mật khẩu. Vui lòng gỡ mật khẩu trước khi upload.',
        );
      }
      throw new UnprocessableEntityException(
        `Không thể đọc file PDF: ${err.message}`,
      );
    }

    if (!text) {
      throw new UnprocessableEntityException(
        'PDF này không chứa text (có thể là PDF ảnh scan). ' +
          'Vui lòng dùng PDF có text layer hoặc nhập nội dung thủ công.',
      );
    }

    this.logger.log({
      action: 'file-parser.pdf.done',
      pages: numPages,
      chars: text.length,
    });

    return {
      content: text,
      sourceFileType: 'pdf',
      extractedChars: text.length,
      pageCount: numPages,
    };
  }

  // ─── DOCX ─────────────────────────────────────────────────────────────────

  private async parseDocx(buffer: Buffer): Promise<ParsedFileResult> {
    let value: string;
    let messages: Array<{ message: string }>;

    try {
      const result = await mammoth.extractRawText({ buffer });
      value = result.value ?? '';
      messages = result.messages ?? [];
    } catch (error) {
      const err = error as Error;
      throw new UnprocessableEntityException(
        `File DOCX bị hỏng hoặc không hợp lệ: ${err.message}`,
      );
    }

    const text = value.trim();

    if (!text) {
      throw new UnprocessableEntityException(
        'File DOCX không chứa nội dung text nào.',
      );
    }

    if (messages.length) {
      this.logger.warn({
        action: 'file-parser.docx.warnings',
        warnings: messages.map((m) => m.message),
      });
    }

    this.logger.log({
      action: 'file-parser.docx.done',
      chars: text.length,
    });

    return {
      content: text,
      sourceFileType: 'docx',
      extractedChars: text.length,
    };
  }

  // ─── JSON file ────────────────────────────────────────────────────────────

  private parseJson(buffer: Buffer): ParsedFileResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(buffer.toString('utf-8')) as unknown;
    } catch {
      throw new UnprocessableEntityException(
        'File JSON không hợp lệ. Vui lòng kiểm tra lại định dạng JSON.',
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new UnprocessableEntityException(
        'File JSON phải là một object có dạng { title, content, category, source_url? }.',
      );
    }

    const data = parsed as Record<string, unknown>;

    if (typeof data.content !== 'string' || !data.content.trim()) {
      throw new UnprocessableEntityException(
        'File JSON thiếu field bắt buộc: "content" (string không rỗng).',
      );
    }
    if (typeof data.category !== 'string' || !data.category.trim()) {
      throw new UnprocessableEntityException(
        'File JSON thiếu field bắt buộc: "category" (string không rỗng).',
      );
    }

    const content = data.content.trim();

    this.logger.log({
      action: 'file-parser.json.done',
      chars: content.length,
      hasTitle: typeof data.title === 'string',
    });

    return {
      content,
      title: typeof data.title === 'string' ? data.title.trim() : undefined,
      category: (data.category as string).trim(),
      source_url:
        typeof data.source_url === 'string' ? data.source_url.trim() : undefined,
      sourceFileType: 'json',
      extractedChars: content.length,
    };
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  /**
   * Lấy tên file không có extension để dùng làm fallback title.
   * Ví dụ: "ky-thuat-tuoi-lua.pdf" → "ky-thuat-tuoi-lua"
   */
  static stripExtension(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '');
  }

  /**
   * Validate MIME type và extension của file.
   * Gọi trước khi parse để cho lỗi sớm.
   */
  static validateFileType(mimetype: string, originalname: string): void {
    const ext = '.' + (originalname.split('.').pop()?.toLowerCase() ?? '');
    const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(mimetype);
    const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);

    if (!mimeOk || !extOk) {
      throw new UnsupportedMediaTypeException(
        `File "${originalname}" không được hỗ trợ. Chỉ chấp nhận: PDF, DOCX, JSON.`,
      );
    }
  }
}
