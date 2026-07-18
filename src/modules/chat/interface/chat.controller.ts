import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { ChatService } from '../application/chat.service';
import { MessagesQueryDto, SessionsQueryDto } from './dtos/pagination.dto';
import { RenameSessionDto } from './dtos/rename-session.dto';
import { StreamChatDto } from './dtos/stream-chat.dto';
import { SubmitFeedbackDto } from './dtos/feedback.dto';

interface StreamErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

@Controller('api/v1/chat')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StreamChatDto,
    @Res() response: Response,
  ): Promise<void> {
    return this.writeChatStream(user, dto, response);
  }

  @Get('stream/events')
  async streamEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: StreamChatDto,
    @Res() response: Response,
  ): Promise<void> {
    return this.writeChatStream(user, dto, response);
  }

  private async writeChatStream(
    user: AuthenticatedUser,
    dto: StreamChatDto,
    response: Response,
  ): Promise<void> {
    const turn = await this.chatService.prepareTurn(user.id, user.name, dto);
    let terminal = false;
    let disconnected = false;

    response.on('close', () => {
      if (terminal) return;
      disconnected = true;
      void this.chatService.failTurn(turn.userMessageId, user.id);
    });

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    this.writeEvent(response, 'meta', {
      session_id: turn.sessionId,
      user_message_id: turn.userMessageId,
      retrieval_status: turn.retrievalStatus,
    });

    let assistantContent = '';
    try {
      for await (const delta of this.chatService.streamCompletion(turn)) {
        if (disconnected) throw new Error('CLIENT_DISCONNECTED');
        assistantContent += delta;
        this.writeEvent(response, 'token', { delta });
      }
      if (disconnected) throw new Error('CLIENT_DISCONNECTED');

      const completed = await this.chatService.completeTurn(
        turn,
        assistantContent,
      );
      if (disconnected) return;
      terminal = true;
      this.writeEvent(response, 'done', {
        assistant_message_id: completed.assistantMessageId,
        citations: turn.citations,
      });
      response.end();
    } catch (error) {
      await this.chatService.failTurn(turn.userMessageId, user.id);
      terminal = true;
      if (disconnected || response.destroyed) return;
      this.writeEvent(response, 'error', this.toStreamError(error));
      response.end();
    }
  }

  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  async submitFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitFeedbackDto,
  ) {
    const data = await this.chatService.submitFeedback(dto, user.id);
    return {
      success: true,
      data,
    };
  }

  @Get('sessions')
  listSessions(
    @CurrentUser('id') userId: string,
    @Query() query: SessionsQueryDto,
  ) {
    return this.chatService.listSessions(userId, query.page, query.limit);
  }

  @Get('sessions/:session_id/messages')
  listMessages(
    @CurrentUser('id') userId: string,
    @Param('session_id') sessionId: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chatService.listMessages(
      userId,
      sessionId,
      query.page,
      query.limit,
    );
  }

  @Delete('sessions/:session_id')
  async deleteSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('session_id') sessionId: string,
  ) {
    const data = await this.chatService.deleteSession(user.id, sessionId);
    return {
      success: true,
      data,
    };
  }

  @Patch('sessions/:session_id')
  async renameSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('session_id') sessionId: string,
    @Body() dto: RenameSessionDto,
  ) {
    const data = await this.chatService.renameSession(
      user.id,
      sessionId,
      dto.title,
    );
    return {
      success: true,
      data,
    };
  }

  private writeEvent(response: Response, event: string, payload: object): void {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private toStreamError(error: unknown): StreamErrorPayload {
    const disconnected =
      error instanceof Error && error.message === 'CLIENT_DISCONNECTED';
    if (disconnected) {
      return {
        code: 'CLIENT_DISCONNECTED',
        message: 'The client disconnected before generation completed.',
        retryable: true,
      };
    }

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        const payload = response as { errorCode?: string; message?: string | string[] };
        const message = Array.isArray(payload.message)
          ? payload.message.join('; ')
          : payload.message;
        return {
          code: payload.errorCode ?? error.name,
          message: message ?? error.message,
          retryable: error.getStatus() !== HttpStatus.INTERNAL_SERVER_ERROR,
        };
      }
    }

    return {
      code: error instanceof Error ? error.name : 'GENERATION_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'The assistant response could not be generated.',
      retryable: true,
    };
  }
}
