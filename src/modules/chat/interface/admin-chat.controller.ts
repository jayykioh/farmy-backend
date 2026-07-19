import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ChatService } from '../application/chat.service';
import { SessionsQueryDto } from './dtos/pagination.dto';

@Roles('admin')
@Controller('api/v1/admin/chat')
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  async listAllSessions(@Query() query: SessionsQueryDto) {
    const data = await this.chatService.listAllSessions(query.page || 1, query.limit || 10);
    return {
      success: true,
      data,
    };
  }
}
