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
    const page = query.page || 1;
    const limit = query.limit || 10;
    const data = await this.chatService.listAllSessions(page, limit);
    return {
      success: true,
      data: {
        sessions: data.items,
        total: data.total,
        page,
        limit,
        totalPages: Math.ceil(data.total / limit),
      },
    };
  }
}
