import {
  Controller,
  Post,
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

@Controller('api/v1/plant-scan')
@UseGuards(JwtAuthGuard)
export class PlantScanController {
  constructor(private readonly scanService: PlantScanService) {}

  @Post('diagnose')
  @UseInterceptors(FileInterceptor('image'))
  @HttpCode(HttpStatus.OK)
  async diagnose(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: any,
    @Body('crop_type') cropType: string,
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
    if (!cropType) {
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: 'SCAN_INVALID_FILE',
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

    const data = await this.scanService.diagnose(file, cropType, user.id);
    return {
      success: true,
      data,
    };
  }
}
