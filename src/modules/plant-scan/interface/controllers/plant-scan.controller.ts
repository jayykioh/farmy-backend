import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PlantScanService } from '../../application/services/plant-scan.service';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CreatePlantScanDto } from '../dtos/create-plant-scan.dto';

@Controller('api/v1/plant-scans')
@UseGuards(JwtAuthGuard)
export class PlantScanController {
  constructor(private readonly scanService: PlantScanService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @HttpCode(HttpStatus.OK)
  async diagnose(
    @CurrentUser() user: { id: string; tier?: string },
    @UploadedFile() file: any,
    @Body() body: CreatePlantScanDto,
  ) {
    if (!file) {
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: 'SCAN_INVALID_FILE',
          message: 'File ảnh không được để trống!',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!body.crop_type) {
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: 'SCAN_INVALID_INPUT',
          message: 'Loại cây trồng không được để trống!',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Size limit check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: 'SCAN_INVALID_FILE',
          message: 'Dung lượng ảnh vượt quá giới hạn 5MB!',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const data = await this.scanService.diagnose(file, body.crop_type, user.id, user.tier || 'free');
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  async getScan(
    @CurrentUser() user: { id: string },
    @Param('id') scanId: string,
  ) {
    const data = await this.scanService.getScanById(scanId, user.id);
    return {
      success: true,
      data,
    };
  }
}
