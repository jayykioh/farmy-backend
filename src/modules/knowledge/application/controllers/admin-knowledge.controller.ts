import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { KnowledgeService } from '../services/knowledge.service';
import { KnowledgeValidationService } from '../services/knowledge-validation.service';
import {
  FileParserService,
} from '../services/file-parser.service';
import { CreateKnowledgeUnifiedDto } from '../dto/create-knowledge-unified.dto';
import { UpdateKnowledgeDto } from '../dto/update-knowledge.dto';
import { BatchEmbedKnowledgeDto } from '../dto/batch-embed-knowledge.dto';
import { ConfirmKnowledgeDto } from '../dto/confirm-knowledge.dto';

/** Giới hạn file 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * AdminKnowledgeController
 *
 * All routes protected by JwtAuthGuard (global) + RolesGuard + @Roles('admin').
 * Base path: /admin/knowledge  (NestJS prefix không thêm /api/v1 ở đây)
 *
 * Document lifecycle (v3):
 *   POST /                    → tạo bài (unified: text | PDF | DOCX | JSON file)
 *   POST /:id/validate        → Gemini đánh giá → validated | rejected
 *   POST /:id/confirm         → Admin confirm | reject thủ công
 *   POST /batch-embed         → embed tất cả bài đã confirmed
 */
@Roles('admin')
@Controller('admin/knowledge')
export class AdminKnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly validationService: KnowledgeValidationService,
    private readonly fileParserService: FileParserService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * POST /admin/knowledge
   *
   * Unified endpoint — nhận multipart/form-data với 4 cách tạo bài:
   *
   * 1. Nhập text thủ công:
   *    Fields: title (required), content (required), category (required)
   *
   * 2. Upload PDF:
   *    File: file.pdf | Fields: category (required), title (optional)
   *
   * 3. Upload DOCX:
   *    File: file.docx | Fields: category (required), title (optional)
   *
   * 4. Upload JSON file:
   *    File: bai-viet.json (chứa { title, content, category, source_url? })
   *    → tất cả fields lấy từ file, không cần form fields
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        // Validate MIME type sớm — trả lỗi 415 trước khi đọc hết file
        try {
          FileParserService.validateFileType(file.mimetype, file.originalname);
          cb(null, true);
        } catch (err) {
          cb(err as Error, false);
        }
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateKnowledgeUnifiedDto,
  ) {
    let finalTitle: string;
    let finalContent: string;
    let finalCategory: string;
    let finalSourceUrl: string | undefined = dto.source_url;

    // Metadata để lưu vào DB
    const metadata: Record<string, unknown> = {};

    if (file) {
      // ── Có file đính kèm → parse file ──────────────────────────────────────
      const parsed = await this.fileParserService.parse(
        file.buffer,
        file.mimetype,
        file.originalname,
      );

      finalContent = parsed.content;

      // Với JSON file: lấy category/source_url từ file (form ghi đè nếu có)
      if (parsed.sourceFileType === 'json') {
        finalCategory = dto.category ?? parsed.category!;
        finalTitle =
          dto.title ?? parsed.title ?? FileParserService.stripExtension(file.originalname);
        finalSourceUrl = dto.source_url ?? parsed.source_url;
      } else {
        // PDF / DOCX: category BẮT BUỘC từ form
        if (!dto.category?.trim()) {
          throw new BadRequestException(
            'Field "category" là bắt buộc khi upload file PDF hoặc DOCX.',
          );
        }
        finalCategory = dto.category.trim();
        finalTitle =
          dto.title?.trim() ?? FileParserService.stripExtension(file.originalname);
      }

      // Lưu metadata file
      metadata['source_file_type'] = parsed.sourceFileType;
      metadata['source_file_name'] = file.originalname;
      metadata['extracted_chars'] = parsed.extractedChars;
      if (parsed.pageCount !== undefined) {
        metadata['page_count'] = parsed.pageCount;
      }
    } else {
      // ── Không có file → dùng text nhập thủ công ────────────────────────────
      if (!dto.content?.trim()) {
        throw new BadRequestException(
          'Phải cung cấp file (PDF/DOCX/JSON) hoặc field "content" (nhập text thủ công).',
        );
      }
      if (!dto.title?.trim()) {
        throw new BadRequestException(
          'Field "title" là bắt buộc khi nhập nội dung thủ công.',
        );
      }
      if (!dto.category?.trim()) {
        throw new BadRequestException(
          'Field "category" là bắt buộc.',
        );
      }

      finalContent = dto.content.trim();
      finalTitle = dto.title.trim();
      finalCategory = dto.category.trim();
      metadata['source_file_type'] = 'text';
    }

    const doc = await this.knowledgeService.create({
      title: finalTitle,
      content: finalContent,
      category: finalCategory,
      source_url: finalSourceUrl,
      metadata,
    });

    // Tạo message thân thiện dựa vào loại input
    const sourceType = (metadata['source_file_type'] as string) ?? 'text';
    const charCount = (metadata['extracted_chars'] as number | undefined) ?? finalContent.length;
    const sourceLabels: Record<string, string> = {
      pdf: 'file PDF',
      docx: 'file DOCX',
      json: 'file JSON',
      text: 'nội dung nhập thủ công',
    };

    return {
      success: true,
      message: `Đã tạo bài viết từ ${sourceLabels[sourceType] ?? 'file'} (${charCount} ký tự). Sẵn sàng để validation.`,
      data: doc,
    };
  }

  // GET /admin/knowledge?category=&limit=&skip=&validation_status=
  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('validation_status') validationStatus?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const docs = await this.knowledgeService.findAll({
      category,
      validationStatus: validationStatus as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
    return { success: true, data: docs };
  }

  // GET /admin/knowledge/:id
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const doc = await this.knowledgeService.findOne(id);
    return { success: true, data: doc };
  }

  // PATCH /admin/knowledge/:id
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDto) {
    const doc = await this.knowledgeService.update(id, dto);
    return { success: true, data: doc };
  }

  // DELETE /admin/knowledge/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.knowledgeService.remove(id);
  }

  // ─── AI Validation Pipeline (v2) ───────────────────────────────────────────

  /**
   * POST /admin/knowledge/:id/validate
   * Trigger Gemini AI review cho bài viết.
   * - score < 40  → auto rejected
   * - score >= 40 → validated (chờ Admin confirm)
   */
  @Post(':id/validate')
  @HttpCode(HttpStatus.ACCEPTED)
  async validate(@Param('id') id: string) {
    const doc = await this.validationService.validate(id);
    const report = doc.validation_report;

    return {
      success: true,
      message:
        doc.validation_status === 'rejected'
          ? `Bài viết bị từ chối (score: ${report?.score ?? 0}/100). Lý do: ${report?.rejection_reason}`
          : `Đánh giá hoàn tất (score: ${report?.score ?? 0}/100). ${
              (report?.warnings?.length ?? 0) > 0
                ? `Có ${report!.warnings.length} cảnh báo cần xem xét.`
                : 'Không có cảnh báo.'
            } Vui lòng xác nhận để tiến hành embed.`,
      data: doc,
    };
  }

  /**
   * POST /admin/knowledge/:id/confirm
   * Admin xác nhận hoặc từ chối sau khi đọc báo cáo validation.
   * Body: { action: 'confirm' | 'reject', note?: string }
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string, @Body() dto: ConfirmKnowledgeDto) {
    const doc = await this.validationService.confirm(id, dto.action, dto.note);
    return {
      success: true,
      message:
        dto.action === 'confirm'
          ? 'Bài viết đã được xác nhận. Có thể chạy batch-embed để đưa vào knowledge base.'
          : 'Bài viết đã bị từ chối.',
      data: doc,
    };
  }

  // ─── Batch Embed ────────────────────────────────────────────────────────────

  /**
   * POST /admin/knowledge/batch-embed
   * Chỉ embed bài có validation_status = 'confirmed'.
   * Body không bắt buộc — bỏ trống để embed tất cả confirmed.
   */
  @Post('batch-embed')
  @HttpCode(HttpStatus.ACCEPTED)
  async batchEmbed(@Body() dto?: BatchEmbedKnowledgeDto) {
    const result = await this.knowledgeService.batchEmbed(dto);
    return {
      success: true,
      message:
        result.queued === 0 && result.skipped_unconfirmed === 0
          ? 'Không có bài nào cần embed.'
          : `${result.queued} bài đã đưa vào hàng đợi embedding.` +
            (result.skipped_unconfirmed > 0
              ? ` ${result.skipped_unconfirmed} bài bị bỏ qua (chưa confirmed).`
              : ''),
      data: result,
    };
  }
}
