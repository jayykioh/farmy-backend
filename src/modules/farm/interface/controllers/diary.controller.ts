import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { DiaryService } from '../../application/services/diary.service';
import { CreateDiaryDto } from '../dtos/create-diary.dto';
import { UpdateDiaryDto } from '../dtos/update-diary.dto';
import { CreateDiaryLogDto } from '../dtos/create-diary-log.dto';
import { UpdateDiaryLogDto } from '../dtos/update-diary-log.dto';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';

@Controller('api/v1/diaries')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  // Diary endpoints
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDiaryDto,
  ) {
    const data = await this.diaryService.create(user.id, dto);
    return {
      success: true,
      data,
    };
  }

  @Get()
  async findAll(@CurrentUser() user: { id: string }) {
    const data = await this.diaryService.findAll(user.id);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.diaryService.findOne(user.id, id);
    return {
      success: true,
      data,
    };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateDiaryDto,
  ) {
    const data = await this.diaryService.update(user.id, id, dto);
    return {
      success: true,
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.diaryService.remove(user.id, id);
  }

  // DiaryLog endpoints
  @Post(':diaryId/logs')
  @HttpCode(HttpStatus.CREATED)
  async createLog(
    @CurrentUser() user: { id: string },
    @Param('diaryId') diaryId: string,
    @Body() dto: CreateDiaryLogDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-hash') requestHash?: string,
  ) {
    if (!idempotencyKey || !requestHash) {
      throw new BadRequestException(
        'Idempotency-Key and X-Request-Hash headers are required',
      );
    }

    const data = await this.diaryService.createIdempotentLog(
      user.id,
      diaryId,
      idempotencyKey,
      requestHash,
      dto,
    );
    return {
      success: true,
      data,
    };
  }

  @Get(':diaryId/logs')
  async findAllLogs(
    @CurrentUser() user: { id: string },
    @Param('diaryId') diaryId: string,
  ) {
    const logs = await this.diaryService.findAllLogs(user.id, diaryId);
    return {
      success: true,
      data: logs.map((log) => {
        const json = log.toJSON();
        return {
          ...json,
          logId: log._id,
          idempotencyKey: log.idempotency_key,
        };
      }),
    };
  }

  @Get('logs/:id')
  async findOneLog(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    const data = await this.diaryService.findOneLog(user.id, id);
    return {
      success: true,
      data,
    };
  }

  @Put('logs/:id')
  async updateLog(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateDiaryLogDto,
  ) {
    const data = await this.diaryService.updateLog(user.id, id, dto);
    return {
      success: true,
      data,
    };
  }

  @Delete('logs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLog(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    await this.diaryService.removeLog(user.id, id);
  }
}
