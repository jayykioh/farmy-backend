import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Sse,
  MessageEvent,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ChatService,
  SendMessageDto,
  SubmitFeedbackDto,
} from '../../application/services/chat.service';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';

@Controller('api/v1/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @CurrentUser() user: { id: string },
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.chatService.sendMessage(dto, user.id);
    return {
      success: true,
      data,
    };
  }

  @Get('sessions')
  async getSessions(@CurrentUser() user: { id: string }) {
    const data = await this.chatService.getSessions(user.id);
    return {
      success: true,
      data,
    };
  }

  @Get('sessions/:sessionId')
  async getSessionDetail(
    @CurrentUser() user: { id: string },
    @Param('sessionId') sessionId: string,
  ) {
    const data = await this.chatService.getSessionDetail(sessionId, user.id);
    return {
      success: true,
      data,
    };
  }

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  async submitFeedback(
    @CurrentUser() user: { id: string },
    @Body() dto: SubmitFeedbackDto,
  ) {
    const data = await this.chatService.submitFeedback(dto, user.id);
    return data;
  }
}
