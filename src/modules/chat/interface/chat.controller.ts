import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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

  private writeEvent(response: Response, event: string, payload: object): void {
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private toStreamError(error: unknown): StreamErrorPayload {
    const disconnected =
      error instanceof Error && error.message === 'CLIENT_DISCONNECTED';
    return {
      code: disconnected ? 'CLIENT_DISCONNECTED' : 'GENERATION_FAILED',
      message: disconnected
        ? 'The client disconnected before generation completed.'
        : 'The assistant response could not be generated.',
      retryable: true,
    };
  }
}
