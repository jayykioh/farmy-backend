import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import {
  FarmSnapService,
  type FeedQuery,
} from '../../application/services/farm-snap.service';
import { CreateSnapDto } from '../dtos/create-snap.dto';
import { ReactSnapDto } from '../dtos/react-snap.dto';
import { CreateSnapCommentDto } from '../dtos/create-snap-comment.dto';
import { CreateSnapUploadUrlDto } from '../dtos/create-snap-upload-url.dto';

@Controller('api/v1/snaps')
export class FarmSnapController {
  constructor(private readonly farmSnapService: FarmSnapService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSnapDto,
  ) {
    const data = await this.farmSnapService.create(user.id, dto);
    return { success: true, data };
  }

  @Post('upload-url')
  async createUploadUrl(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSnapUploadUrlDto,
  ) {
    const data = await this.farmSnapService.createUploadUrl(user.id, dto);
    return { success: true, data };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.farmSnapService.uploadPhoto(user.id, file);
    return { success: true, data };
  }

  @Get('feed')
  async feed(@CurrentUser() user: { id: string }, @Query() query: FeedQuery) {
    const data = await this.farmSnapService.findFeed(user.id, query);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.farmSnapService.findOne(user.id, id);
    return { success: true, data };
  }

  @Post(':id/react')
  async react(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ReactSnapDto,
  ) {
    const data = await this.farmSnapService.toggleReaction(
      user.id,
      id,
      dto.type,
    );
    return { success: true, data: { reactions: data } };
  }

  @Get(':id/comments')
  async comments(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.farmSnapService.findComments(user.id, id);
    return { success: true, data };
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateSnapCommentDto,
  ) {
    const data = await this.farmSnapService.createComment(user.id, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.farmSnapService.remove(user.id, id);
  }
}
